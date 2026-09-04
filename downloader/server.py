"""FastAPI 服务：链接解析、图片代理、原生目录选择、批量下载。

只做一件事：用户粘贴抖音/小红书链接 → 解析出无水印直链 → 自选目录+分类批量下载。
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import config
import downloader
import filter as imgfilter
import native
from adapters.base import UA, AdapterError
from adapters.parse_link import parse as parse_links

BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR / "web"

app = FastAPI(title="无水印下载器", docs_url="/api/docs")


# 禁止缓存 HTML/静态资源，避免前端 JS/CSS 改动后浏览器仍用旧版本
@app.middleware("http")
async def no_cache_static(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path == "/" or path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


# ---------------------------------------------------------------- 基础信息


@app.get("/api/bootstrap")
async def bootstrap() -> dict[str, Any]:
    return {
        "categories": config.CATEGORIES,
        "settings": config.safe_view(),
    }


@app.get("/api/settings")
async def get_settings() -> dict[str, Any]:
    return config.safe_view()


@app.post("/api/settings")
async def post_settings(request: Request) -> dict[str, Any]:
    body = await request.json()
    patch: dict[str, Any] = {}
    for key in ("douyin_cookie", "xhs_cookie", "ai_key", "ai_base_url", "ai_model"):
        if key in body:
            patch[key] = (body[key] or "").strip()
    if "concurrency" in body:
        patch["concurrency"] = body["concurrency"]
    config.save(patch)
    return config.safe_view()


# ---------------------------------------------------------------- 链接解析


@app.post("/api/parse")
async def parse_link(request: Request) -> StreamingResponse:
    """粘贴抖音/小红书链接，解析出无水印直链（SSE 流式返回进度 + 结果）。

    platform 默认 auto：自动识别抖音/小红书。抖音免登录；小红书需 Cookie。
    """
    body = await request.json()
    platform = (body.get("platform") or "auto").strip()
    media_type = (body.get("media_type") or "auto").strip()
    text = (body.get("text") or "").strip()

    if media_type not in ("image", "video", "auto"):
        raise HTTPException(400, "media_type 必须为 image、video 或 auto")
    if not text:
        return JSONResponse(
            {"authors": [], "source": "real", "notice": "请粘贴分享链接或视频 ID。"}
        )

    # 抖音匿名即可，但翻全作品列表需要登录 Cookie；小红书（含 auto 里的小红书部分）需要 Cookie
    # 优先使用请求体显式传入的 cookie（前端随解析请求下发当前设置里的 cookie），
    # 若未传则回退到本机 config.json 中已保存的 cookie。
    body_dy = (body.get("douyin_cookie") or "").strip()
    body_xhs = (body.get("xhs_cookie") or "").strip()
    xhs_cookie = body_xhs or (config.cookie_for("xhs") if platform != "douyin" else "")
    douyin_cookie = body_dy or (config.cookie_for("douyin") if platform != "xhs" else "")

    progress_q: asyncio.Queue = asyncio.Queue()

    async def do_parse():
        try:
            authors, source, notice = await parse_links(
                text, media_type, xhs_cookie, platform,
                douyin_cookie=douyin_cookie,
                progress_cb=lambda msg: progress_q.put(("progress", msg)),
            )
            await progress_q.put(("result", {
                "authors": [a.to_dict() for a in authors],
                "source": source,
                "notice": notice,
                "platform": platform,
                "media_type": media_type,
            }))
        except AdapterError as exc:
            await progress_q.put(("error", {
                "error": exc.message, "need_cookie": exc.need_cookie, "authors": [],
            }))
        except Exception as exc:
            await progress_q.put(("error", {
                "error": f"解析失败：{exc}", "authors": [],
            }))

    asyncio.create_task(do_parse())

    async def stream():
        while True:
            kind, payload = await progress_q.get()
            if kind == "progress":
                yield f"data: {json.dumps({'type': 'progress', 'text': payload}, ensure_ascii=False)}\n\n"
            elif kind == "result":
                data = dict(payload, type="result")
                yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                break
            elif kind == "error":
                data = dict(payload, type="error")
                yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                break

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------- Cookie 同步（从本机 Chrome 抓取登录态）


@app.post("/api/sync-cookie")
async def sync_cookie(request: Request) -> dict[str, Any]:
    """从本机运行中的 Chrome 抓取抖音/小红书登录 Cookie，保存到配置并返回给前端。

    body: {"platform": "douyin" | "xhs"}
    返回: {"ok": true, "cookie": "...", "count": N} 或 {"ok": false, "error": "..."}
    """
    import subprocess  # noqa: PLC0415
    import sys  # noqa: PLC0415

    body = await request.json()
    platform = (body.get("platform") or "").strip().lower()
    if platform not in ("douyin", "xhs"):
        return {"ok": False, "error": "platform 必须为 douyin 或 xhs"}
    script = os.path.join(BASE_DIR, "sync_cookie.py")

    def _run() -> dict[str, Any]:
        try:
            r = subprocess.run(
                [sys.executable, script, platform],
                capture_output=True, text=True, timeout=90,
            )
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": "抓取超时（90s），请确认 Chrome 已关闭或稍后重试"}
        out = (r.stdout or "").strip()
        if not out:
            return {"ok": False, "error": "抓取脚本无输出: " + (r.stderr or "")[-300:]}
        try:
            return json.loads(out.splitlines()[-1])
        except ValueError:
            return {"ok": False, "error": "抓取脚本输出异常: " + (r.stderr or "")[-300:]}

    data = await asyncio.to_thread(_run)
    if not data.get("ok"):
        return data
    cookie = (data.get("cookie") or "").strip()
    if not cookie:
        return {"ok": False, "error": f"没有在 Chrome 中找到 {platform} 的登录 Cookie，请先登录对应网站再试"}
    if platform == "douyin":
        config.save({"douyin_cookie": cookie})
    else:
        config.save({"xhs_cookie": cookie})
    return {"ok": True, "cookie": cookie, "count": data.get("count", 0), "platform": platform}


# ---------------------------------------------------------------- 图片代理

# 复用单一连接池代理预览图，避免每个请求都重建客户端导致的连接抖动；
# 并对瞬时网络错误 / 5xx 做重试，解决大量并发预览时偶发裂图的问题。
_PROXY_CLIENT: "httpx.AsyncClient | None" = None


def _proxy_client() -> httpx.AsyncClient:
    global _PROXY_CLIENT
    if _PROXY_CLIENT is None or _PROXY_CLIENT.is_closed:
        _PROXY_CLIENT = httpx.AsyncClient(
            timeout=httpx.Timeout(20.0, read=60.0),
            follow_redirects=True,
            trust_env=False,  # 绕过系统代理，直连 CDN
            limits=httpx.Limits(max_connections=64, max_keepalive_connections=24),
        )
    return _PROXY_CLIENT


@app.on_event("shutdown")
async def _close_proxy_client() -> None:
    global _PROXY_CLIENT
    if _PROXY_CLIENT is not None and not _PROXY_CLIENT.is_closed:
        await _PROXY_CLIENT.aclose()
    _PROXY_CLIENT = None


_PROXY_HEADERS_ALLOW = {
    "content-type",
    "content-length",
    "cache-control",
    "etag",
    "accept-ranges",
    "content-range",
}


@app.get("/api/proxy")
async def proxy(
    request: Request, url: str = Query(...), platform: str = Query("demo")
) -> StreamingResponse:
    """抖音/小红书 CDN 有 Referer 防盗链，前端图片/视频必须经此代理。

    透传 Range 请求头，否则 <video> 无法拖动进度条；并对偶发网络错误做重试。
    """
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "非法 URL")

    headers = {"User-Agent": UA}
    ref = downloader.REFERERS.get(platform, "")
    if ref:
        headers["Referer"] = ref
    incoming_range = request.headers.get("range")
    if incoming_range:
        headers["Range"] = incoming_range

    client = _proxy_client()
    last_err = ""
    for attempt in range(3):
        try:
            req = client.build_request("GET", url, headers=headers)
            resp = await client.send(req, stream=True)
        except httpx.HTTPError as exc:
            last_err = f"{exc}"
            if attempt < 2:
                await asyncio.sleep(0.3 * (attempt + 1))
                continue
            break
        if resp.status_code >= 500:
            last_err = f"上游返回 {resp.status_code}"
            await resp.aclose()
            if attempt < 2:
                await asyncio.sleep(0.3 * (attempt + 1))
                continue
            break
        if resp.status_code >= 400:
            code = resp.status_code
            await resp.aclose()
            raise HTTPException(code, f"上游返回 {code}")

        passthrough = {
            k: v for k, v in resp.headers.items() if k.lower() in _PROXY_HEADERS_ALLOW
        }
        passthrough["Cache-Control"] = "public, max-age=86400"

        async def body():
            try:
                async for chunk in resp.aiter_bytes(64 * 1024):
                    yield chunk
            finally:
                await resp.aclose()

        return StreamingResponse(
            body(),
            status_code=resp.status_code,
            media_type=resp.headers.get("content-type", "application/octet-stream"),
            headers=passthrough,
        )

    raise HTTPException(502, f"代理失败：{last_err}") from None


# ---------------------------------------------------------------- 目录选择


@app.post("/api/pick-dir")
async def pick_dir(request: Request) -> dict[str, Any]:
    body: dict[str, Any] = {}
    try:
        body = await request.json()
    except (json.JSONDecodeError, ValueError):
        pass
    cfg = config.load()
    default = body.get("default") or cfg.get("last_dir") or str(Path.home())
    try:
        chosen = await native.choose_directory("选择素材保存到哪个文件夹", default)
    except RuntimeError as exc:
        raise HTTPException(500, str(exc)) from exc
    if not chosen:
        return {"cancelled": True}
    config.remember_dir(chosen)
    return {"cancelled": False, "path": chosen, "recent_dirs": config.load()["recent_dirs"]}


@app.post("/api/pick-file")
async def pick_file(request: Request) -> dict[str, Any]:
    body: dict[str, Any] = {}
    try:
        body = await request.json()
    except (json.JSONDecodeError, ValueError):
        pass
    prompt = body.get("prompt") or "选择文件"
    default = body.get("default") or str(Path.home())
    try:
        chosen = await native.choose_file(prompt, default)
    except RuntimeError as exc:
        raise HTTPException(500, str(exc)) from exc
    if not chosen:
        return {"cancelled": True}
    return {"cancelled": False, "path": chosen}


@app.post("/api/reveal")
async def reveal(request: Request) -> dict[str, bool]:
    body = await request.json()
    path = body.get("path") or ""
    if path:
        native.reveal_in_finder(path)
    return {"ok": True}


# ---------------------------------------------------------------- 下载


@app.post("/api/download")
async def start_download(request: Request) -> dict[str, Any]:
    body = await request.json()
    items = body.get("items") or []
    if not items:
        raise HTTPException(400, "没有选中任何素材")

    root = (body.get("root") or "").strip()
    if not root:
        raise HTTPException(400, "缺少保存目录")
    root_path = Path(root).expanduser()
    if not root_path.is_dir():
        raise HTTPException(400, f"目录不存在：{root}")

    category = body.get("category") or "未分类"
    layout = body.get("layout") or "platform_author"

    task = downloader.create_task(str(root_path), category, items, layout)
    asyncio.create_task(_run_and_notify(task))
    downloader.prune()
    return {"task_id": task.id, "total": task.total_files}


async def _run_and_notify(task: downloader.DownloadTask) -> None:
    await downloader.run_task(task)
    ok, bad = task.done_files, task.failed_files
    msg = f"完成 {ok} 个" + (f"，失败 {bad} 个" if bad else "")
    native.notify("素材下载完成", msg)


@app.get("/api/download/{task_id}")
async def download_status(task_id: str) -> dict[str, Any]:
    task = downloader.TASKS.get(task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    return task.snapshot()


@app.post("/api/download/{task_id}/cancel")
async def cancel_download(task_id: str) -> dict[str, bool]:
    task = downloader.TASKS.get(task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    await task.abort()
    return {"ok": True}


@app.get("/api/download/{task_id}/events")
async def download_events(task_id: str) -> StreamingResponse:
    task = downloader.TASKS.get(task_id)
    if not task:
        raise HTTPException(404, "任务不存在")

    async def stream():
        while True:
            snap = task.snapshot()
            yield f"data: {json.dumps(snap, ensure_ascii=False)}\n\n"
            if snap["finished"]:
                break
            await asyncio.sleep(0.4)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------- 图片过滤


# 记录过滤扫描过的目录，作为本地图片访问白名单（防止任意文件读取）
_ALLOWED_ROOTS: set[str] = set()


@app.post("/api/filter")
async def filter_images(request: Request) -> StreamingResponse:
    """扫描目录图片，按宽高/大小过滤（SSE 流式返回进度 + 结果）。"""
    body = await request.json()
    root = (body.get("root") or "").strip()
    min_w = int(body.get("min_width") or 0)
    min_h = int(body.get("min_height") or 0)
    min_size_kb = int(body.get("min_size_kb") or 0)

    if not root:
        return JSONResponse({"error": "请先选择目录", "results": []})

    _ALLOWED_ROOTS.add(str(Path(root).expanduser().resolve()))

    progress_q: asyncio.Queue = asyncio.Queue()

    async def do_filter():
        try:
            results = await imgfilter.run_filter(
                root, min_w, min_h, min_size_kb,
                progress_cb=lambda m: progress_q.put_nowait(("progress", m)),
            )
            await progress_q.put(("result", {"results": results}))
        except ValueError as exc:
            await progress_q.put(("error", {"error": str(exc)}))
        except Exception as exc:
            await progress_q.put(("error", {"error": f"过滤失败：{exc}"}))

    asyncio.create_task(do_filter())

    async def stream():
        while True:
            kind, payload = await progress_q.get()
            if kind == "progress":
                yield f"data: {json.dumps({'type': 'progress', 'text': payload}, ensure_ascii=False)}\n\n"
            elif kind == "result":
                data = dict(payload, type="result")
                yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                break
            elif kind == "error":
                data = dict(payload, type="error")
                yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                break

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/local-image")
async def local_image(path: str = Query(...)) -> FileResponse:
    """返回过滤目录内的本地图片（白名单校验）。"""
    p = Path(path).resolve()
    for root in _ALLOWED_ROOTS:
        rp = Path(root).resolve()
        if p == rp or str(p).startswith(str(rp) + os.sep):
            if p.is_file():
                return FileResponse(p)
    raise HTTPException(403, "无权访问该文件")


# ---------------------------------------------------------------- 本地资源管理

# 图片/视频扩展名（小写）
_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic", ".heif", ".tiff", ".tif"}
_VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".flv", ".ts", ".mts", ".wmv", ".mpg", ".mpeg"}


def _scan_local(root: str, kind: str) -> dict[str, Any]:
    """递归扫描目录，按「文件相对 root 的父目录」分组返回图片/视频。

    结果按文件夹名、文件名字典序排序，便于瀑布流上方展示分组名。
    """
    root_path = Path(root).expanduser().resolve()
    exts = _IMAGE_EXTS if kind == "image" else _VIDEO_EXTS

    groups: dict[str, list[dict[str, Any]]] = {}
    total = 0
    for dirpath, dirnames, filenames in os.walk(root_path):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for fn in filenames:
            if fn.startswith("."):
                continue
            if Path(fn).suffix.lower() not in exts:
                continue
            full = Path(dirpath) / fn
            rel_parent = (
                str(Path(dirpath).relative_to(root_path))
                if str(Path(dirpath)) != str(root_path)
                else ""
            )
            folder = rel_parent or root_path.name
            try:
                size = full.stat().st_size
            except OSError:
                size = 0
            groups.setdefault(folder, []).append({
                "path": str(full),
                "name": fn,
                "folder": folder,
                "size": size,
                "kind": kind,
                "url": "/api/local-file?path=" + quote(str(full)),
            })
            total += 1

    result_groups: list[dict[str, Any]] = []
    for folder in sorted(groups.keys()):
        files = sorted(groups[folder], key=lambda f: f["name"].lower())
        result_groups.append({"folder": folder, "count": len(files), "files": files})
    return {"root": str(root_path), "kind": kind, "total": total, "groups": result_groups}


@app.post("/api/local/list")
async def local_list(request: Request) -> dict[str, Any]:
    """扫描本地目录，返回按父目录分组的图片/视频列表（白名单登记该目录）。"""
    body = await request.json()
    root = (body.get("root") or "").strip()
    kind = (body.get("kind") or "image").strip()
    if kind not in ("image", "video"):
        raise HTTPException(400, "kind 必须为 image 或 video")
    if not root:
        root = str(BASE_DIR / "data")
    root_path = Path(root).expanduser().resolve()
    if not root_path.is_dir():
        raise HTTPException(400, f"目录不存在：{root}")

    _ALLOWED_ROOTS.add(str(root_path))
    result = await asyncio.to_thread(_scan_local, str(root_path), kind)
    return result


@app.get("/api/local-file")
async def local_file(path: str = Query(...)) -> FileResponse:
    """返回白名单目录内的本地图片/视频（FileResponse 自动支持 Range，视频可拖进度条）。"""
    p = Path(path).resolve()
    for root in _ALLOWED_ROOTS:
        rp = Path(root).resolve()
        if p == rp or str(p).startswith(str(rp) + os.sep):
            if p.is_file():
                return FileResponse(p)
    raise HTTPException(403, "无权访问该文件")


@app.post("/api/local/delete")
async def local_delete(request: Request) -> dict[str, Any]:
    """把选中的本地文件移到废纸篓（可恢复），白名单校验后逐个删除。"""
    body = await request.json()
    paths = body.get("paths") or []
    if not paths:
        raise HTTPException(400, "没有要删除的文件")

    deleted = 0
    failed: list[str] = []
    for path in paths:
        p = Path(path).resolve()
        allowed = False
        for root in _ALLOWED_ROOTS:
            rp = Path(root).resolve()
            if str(p).startswith(str(rp) + os.sep) and p.is_file():
                allowed = True
                break
        if not allowed:
            failed.append(str(p))
            continue
        try:
            native.trash_file(str(p))
            deleted += 1
        except OSError as exc:
            failed.append(f"{p.name}: {exc}")
    return {"deleted": deleted, "failed": failed}


# ---------------------------------------------------------------- 视频关键帧导出


# 关键帧临时目录：每次启动清理，避免磁盘堆积；运行期按 session 隔离
KF_ROOT = Path(tempfile.gettempdir()) / "dy_keyframes"
if KF_ROOT.exists():
    shutil.rmtree(KF_ROOT, ignore_errors=True)
KF_ROOT.mkdir(parents=True, exist_ok=True)

KF_MAX_FRAMES = 4000  # 单次抽取保护上限


@app.post("/api/keyframe/pick")
async def keyframe_pick(request: Request) -> dict[str, Any]:
    """弹出 macOS 原生文件选择框，选择本地视频，返回其路径。"""
    body: dict[str, Any] = {}
    try:
        body = await request.json()
    except (json.JSONDecodeError, ValueError):
        pass
    default = body.get("default") or str(Path.home())
    try:
        chosen = await native.choose_file("选择要提取关键帧的视频", default)
    except RuntimeError as exc:
        raise HTTPException(500, str(exc)) from exc
    if not chosen:
        return {"cancelled": True}
    return {"cancelled": False, "path": chosen}


def _extract_frames(path: str, interval: int, out_dir: Path) -> dict[str, Any]:
    """在子线程中抽取关键帧（按帧间隔抽一帧，写 JPG）。"""
    import cv2

    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise ValueError("无法打开视频，可能格式不支持或文件已损坏")
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        frames: list[dict[str, Any]] = []
        idx = 0
        saved = 0
        while saved < KF_MAX_FRAMES:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % interval == 0:
                name = f"frame_{saved:05d}.jpg"
                okw = cv2.imwrite(
                    str(out_dir / name), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90]
                )
                if okw:
                    frames.append({"name": name, "frame_index": idx})
                    saved += 1
            idx += 1
        return {
            "frames": frames,
            "fps": round(fps, 2),
            "total_frames": total,
            "saved": saved,
        }
    finally:
        cap.release()


@app.post("/api/keyframe/extract")
async def keyframe_extract(request: Request) -> dict[str, Any]:
    """按帧间隔抽取关键帧，返回会话 id 与帧列表。"""
    body = await request.json()
    path = (body.get("path") or "").strip()
    interval = max(1, int(body.get("interval") or 30))
    if not path or not Path(path).is_file():
        raise HTTPException(400, "请先选择有效的视频文件")

    session = uuid.uuid4().hex
    out_dir = KF_ROOT / session
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        result = await asyncio.to_thread(_extract_frames, path, interval, out_dir)
    except ValueError as exc:
        shutil.rmtree(out_dir, ignore_errors=True)
        raise HTTPException(400, str(exc)) from exc

    return {
        "session": session,
        "count": result["saved"],
        "fps": result["fps"],
        "total_frames": result["total_frames"],
        "interval": interval,
        "frames": result["frames"],
        "video": Path(path).name,
        "truncated": result["saved"] >= KF_MAX_FRAMES,
    }


@app.get("/api/keyframe/frame")
async def keyframe_frame(
    session: str = Query(...), name: str = Query(...)
) -> FileResponse:
    """返回某次会话抽出的关键帧预览图（防目录穿越）。"""
    if not session or "/" in session or "\\" in session:
        raise HTTPException(400, "非法会话")
    if "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(400, "非法文件名")
    d = (KF_ROOT / session).resolve()
    if not d.is_dir():
        raise HTTPException(404, "会话不存在或已失效")
    p = (d / name).resolve()
    if str(p) != str(d / name) or not p.is_file():
        raise HTTPException(404, "图片不存在")
    return FileResponse(p, media_type="image/jpeg")

@app.get("/api/keyframe/thumb")
async def keyframe_thumb(path: str = Query(...)) -> FileResponse:
    """返回所选视频的首帧缩略图（按路径缓存），供前端 9:16 预览磁贴使用。

    视频由用户经原生文件框自行选择，故仅校验文件存在且为视频扩展名，不做白名单限制。
    """
    import hashlib
    p = Path(path).expanduser().resolve()
    if not p.is_file():
        raise HTTPException(404, "视频文件不存在：" + str(p))
    if p.suffix.lower() not in _VIDEO_EXTS:
        raise HTTPException(400, "仅支持视频文件")
    thumbs_dir = KF_ROOT / "thumbs"
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    cache = thumbs_dir / (hashlib.md5(str(p).encode("utf-8")).hexdigest() + ".jpg")
    if not cache.is_file():
        import cv2
        cap = cv2.VideoCapture(str(p))
        try:
            if not cap.isOpened():
                raise HTTPException(400, "无法打开视频，可能格式不支持或文件已损坏")
            ok, frame = cap.read()
            if not ok:
                raise HTTPException(400, "无法读取视频首帧")
            cv2.imwrite(str(cache), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        finally:
            cap.release()
    return FileResponse(cache, media_type="image/jpeg")


@app.post("/api/keyframe/download")
async def keyframe_download(request: Request) -> dict[str, Any]:
    """把选中的关键帧复制到本地目录。"""
    body = await request.json()
    session = (body.get("session") or "").strip()
    names = body.get("names") or []
    root = (body.get("root") or "").strip()
    if not session or not root:
        raise HTTPException(400, "缺少会话或保存目录")
    root_path = Path(root).expanduser()
    if not root_path.is_dir():
        raise HTTPException(400, f"目录不存在：{root}")
    src_dir = (KF_ROOT / session).resolve()
    if not src_dir.is_dir():
        raise HTTPException(400, "会话已失效，请重新抽取")

    copied = 0
    for name in names:
        if "/" in name or "\\" in name or name.startswith("."):
            continue
        sp = (src_dir / name).resolve()
        if str(sp) != str(src_dir / name) or not sp.is_file():
            continue
        shutil.copy2(sp, root_path / name)
        copied += 1
    return {"ok": True, "copied": copied, "dir": str(root_path)}


# ---------------------------------------------------------------- 静态资源


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8899, log_level="info")
