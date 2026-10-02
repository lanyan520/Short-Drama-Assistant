"""浏览器兜底抓取抖音数据（绕过 ArgusSecurityPlugin 门禁，CDP 方案）。

背景（2026-09-14 起抖音风控升级，实测）：
- ArgusSecurityPlugin 对 aweme/detail（单视频/图文）、aweme/post（主页作品）、
  mix/*、music/* 等接口的**非浏览器**直连请求一律返回 403
  （"Uifid Not Found" / "Signature Not Found"），带不带 Cookie、怎么重试都一样。
- 放行所需的 x-secsdk-web-signature 只能由抖音网页内的 JS SDK 生成，
  纯 API 直连无法伪造。

原理（已端到端验证可行）：
- 用**系统真实 Google Chrome**（不是 playwright 自带的 chromium）以 headless 启动，
  复制本机已登录 Chrome 的 profile（含登录态），通过 CDP（DevTools 协议）连接页面。
- 让页面自己加载并滚动，页面自身的 JS SDK 完成签名后发出 aweme/post / aweme/detail
  请求；我们在 CDP 层拦截这些响应并聚合 JSON。
- 滚动必须走 CDP Input.dispatchMouseEvent 的 wheel 事件（作用在内部 feed 容器），
  单纯改 window.scrollTo 不会触发抖音的无限加载分页。

注意：
- 本模块不 import parse_link（避免循环依赖）。
- websocket-client 未安装时 BROWSER_AVAILABLE=False，调用方应回退到原 API 路径。
- Chrome 实例在端口 9223 上持久运行，多个解析请求串行复用（BROWSER_LOCK）。
"""

from __future__ import annotations

import asyncio
import json
import os
import queue
import shutil
import socket
import subprocess
import threading
import time
import urllib.request
from typing import Any, Awaitable, Callable, Optional

ProgressCB = Optional[Callable[[str], Awaitable[None]]]

try:  # pragma: no cover - 环境相关
    import websocket  # websocket-client

    _WS_OK = True
except ImportError:
    websocket = None
    _WS_OK = False

CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE_SRC = os.path.expanduser("~/Library/Application Support/Google/Chrome")
PROFILE_DST = "/tmp/douyin_chrome_profile"
PORT = 9223

DEFAULT_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
)

BROWSER_AVAILABLE = _WS_OK and os.path.exists(CHROME_BIN)
BROWSER_LOCK = threading.Lock()
_CHROME_PROC: Optional[subprocess.Popen] = None


# ----------------------------------------------------------------- CDP 基础

class _CDP:
    """极简 CDP 客户端：后台线程收事件，主线程 send 按 id 匹配响应。"""

    def __init__(self, ws_url: str):
        self.ws = websocket.create_connection(ws_url, timeout=30)
        self._id = 0
        self._lock = threading.Lock()
        self._pending: dict[int, Any] = {}
        self._events: list[dict] = []
        self._stop = False
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self):
        while not self._stop:
            try:
                self.ws.settimeout(1.0)
                raw = self.ws.recv()
            except Exception:
                continue
            if not raw:
                continue
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if "id" in msg and msg["id"] in self._pending:
                self._pending[msg["id"]] = msg
            else:
                self._events.append(msg)

    def send(self, method: str, params: Optional[dict] = None, wait: bool = True):
        with self._lock:
            self._id += 1
            mid = self._id
        self._pending[mid] = None
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        if not wait:
            return mid
        deadline = time.time() + 20
        while time.time() < deadline:
            if self._pending.get(mid) is not None:
                return self._pending.pop(mid)
            time.sleep(0.05)
        return None

    def drain(self, method: Optional[str] = None):
        out = [e for e in self._events if method is None or e.get("method") == method]
        self._events = [e for e in self._events if not (method is None or e.get("method") == method)]
        return out

    def close(self):
        self._stop = True
        try:
            self.ws.close()
        except Exception:
            pass


def _http_get(path: str):
    return json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=5).read())


def _port_listening() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", PORT), timeout=1):
            return True
    except Exception:
        return False


def _copy_profile():
    """从本机已登录 Chrome 复制 profile（排除锁与缓存），携带登录态。"""
    try:
        if os.path.exists(PROFILE_DST):
            shutil.rmtree(PROFILE_DST)
        os.makedirs(f"{PROFILE_DST}/Default", exist_ok=True)
        subprocess.run(
            ["rsync", "-a",
             "--exclude=Lock", "--exclude=SingletonLock", "--exclude=SingletonCookie",
             "--exclude=Cache", "--exclude=Code Cache", "--exclude=GPUCache",
             "--exclude=Service Worker", "--exclude=Session Storage",
             f"{PROFILE_SRC}/Default/", f"{PROFILE_DST}/Default/"],
            check=False,
        )
        ls = f"{PROFILE_SRC}/Local State"
        if os.path.exists(ls):
            shutil.copy(ls, f"{PROFILE_DST}/Local State")
        return True
    except Exception:
        return False


def _launch_chrome() -> bool:
    global _CHROME_PROC
    if _port_listening():
        return True
    _copy_profile()
    _CHROME_PROC = subprocess.Popen(
        [CHROME_BIN, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run",
         "--no-default-browser-check", "--remote-allow-origins=*",
         f"--remote-debugging-port={PORT}", f"--user-data-dir={PROFILE_DST}", "--hide-scrollbars"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(40):
        if _port_listening():
            return True
        time.sleep(0.5)
    return False


def ensure_browser() -> bool:
    """确保 Chrome CDP 实例可用（惰性启动）。返回是否就绪。"""
    if not BROWSER_AVAILABLE:
        return False
    with BROWSER_LOCK:
        if _port_listening():
            return True
        return _launch_chrome()


def refresh_browser_profile() -> bool:
    """强制重新复制 profile 并重启 Chrome（Cookie 过期时调用）。"""
    if not BROWSER_AVAILABLE:
        return False
    with BROWSER_LOCK:
        _kill_chrome()
        return _launch_chrome()


def _kill_chrome():
    global _CHROME_PROC
    try:
        if _CHROME_PROC:
            _CHROME_PROC.terminate()
    except Exception:
        pass
    _CHROME_PROC = None
    # 兜底：按端口特征清理
    try:
        subprocess.run(["pkill", "-f", f"remote-debugging-port={PORT}"], check=False)
    except Exception:
        pass


def _new_tab(bc: _CDP) -> tuple:
    """新建标签页，返回 (页面 CDP 客户端, targetId)。

    ⚠️ 调用方必须在自己 finally 里用 _close_target 把标签页也关掉。
    只调 tc.close() 仅关闭 websocket、**不会关标签页** —— 历史上这里泄漏过：
    实测堆到 29 个标签页，后台标签被 Chrome 节流后页面请求不再及时发出，
    表现就是「兜底时好时坏、同样的链接时而能出时而超时」。
    """
    before = {t.get("webSocketDebuggerUrl") for t in _http_get("/json/list") if t.get("webSocketDebuggerUrl")}
    res = bc.send("Target.createTarget", {"url": "about:blank"})
    tid: Optional[str] = None
    if isinstance(res, dict):
        tid = (res.get("result") or {}).get("targetId")
    tws = None
    for _ in range(30):
        for t in _http_get("/json/list"):
            w = t.get("webSocketDebuggerUrl")
            if w and w not in before:
                tws = w
                break
        if tws:
            break
        time.sleep(0.3)
    if not tws:
        _close_target(bc, tid)
        return None, tid
    tc = _CDP(tws)
    tc.send("Network.enable")
    tc.send("Page.enable")
    return tc, tid


def _close_target(bc: _CDP, target_id: Optional[str]) -> None:
    """关掉一个标签页。失败不抛（清理动作不该影响主流程）。"""
    if not target_id:
        return
    try:
        bc.send("Target.closeTarget", {"targetId": target_id})
    except Exception:
        pass


_STALE_URL_HINTS = (
    "douyin.com", "iesdouyin.com", "verifycenter", "nocaptcha",
    "captcha", "bytedance.com", "secsdk",
)


def _cleanup_stale_tabs(bc: _CDP, keep: int = 0) -> int:
    """每次抓取前清场：关掉上一轮遗留的抖音 / 验证码标签页。

    标签页累积会拖慢页面加载并触发 Chrome 的后台节流，是抓取不稳定的主因之一。
    """
    closed = 0
    try:
        ts = _http_get("/json/list")
    except Exception:
        return 0
    victims = [
        t for t in ts
        if t.get("type") == "page"
        and any(h in (t.get("url") or "") for h in _STALE_URL_HINTS)
    ]
    for t in victims[: max(0, len(victims) - keep)]:
        _close_target(bc, t.get("id"))
        closed += 1
    if closed:
        time.sleep(0.4)  # 给关闭动作一点时间落地
    return closed


_CAPTCHA_HINTS = ("verifycenter", "nocaptcha", "captcha", "/verify", "secsdk-captcha")


def _current_href(tc: _CDP) -> str:
    try:
        r = tc.send("Runtime.evaluate", {"expression": "location.href", "returnByValue": True})
        return str(((r or {}).get("result") or {}).get("result", {}).get("value") or "")
    except Exception:
        return ""


def _assert_not_captcha(tc: _CDP, what: str) -> None:
    """被抖音弹了验证码/风控页时立刻给出明确错误，而不是静默等超时。

    这条以前完全没有：验证码页会被当成"加载慢"，白等 25 秒后返回空，
    用户只看到笼统的"未获取到内容"，无从判断是登录态失效还是风控。
    """
    href = _current_href(tc)
    if href and any(h in href for h in _CAPTCHA_HINTS):
        raise RuntimeError(
            f"抖音对「{what}」弹出了验证码/风控页（{href[:80]}）。"
            "请在本机 Chrome 里手动打开抖音完成验证并确认仍处于登录状态，然后重试；"
            "必要时调用 refresh_browser_profile() 重新复制登录 profile。"
        )


def _click_works_tab(tc: _CDP):
    tc.send("Runtime.evaluate", {"expression": """
      (function(){
        var t=[].slice.call(document.querySelectorAll('*')).filter(function(e){
          return e.children.length===0 && e.textContent==='作品';
        });
        if(t.length){ t[0].click(); return true; } return false;
      })()""", "returnByValue": True})


# ----------------------------------------------------------------- 同步核心

# 列表类接口的 URL 特征。用「任一命中」而不是写死单一接口，
# 接口改名、或多出新的列表接口时都不必再改代码。
HINT_PROFILE = ("aweme/v1/web/aweme/post",)
HINT_COLLECTION = ("aweme/v1/web/mix/aweme", "aweme/v1/web/aweme/collection")
HINT_FAVORITE = ("aweme/v1/web/aweme/favorite", "aweme/v1/web/aweme/listcollection")
WILDCARD = "*"  # 兜底：接受任意 /aweme/v1/web/ 且带 aweme_list 的响应（接口名未知时用）


def _is_list_api(url: str, hints: tuple) -> bool:
    if WILDCARD in hints:
        return "/aweme/v1/web/" in url
    return any(h in url for h in hints)


def _sync_list_works(
    page_url: str,
    hints: tuple,
    max_pages: int,
    idle_limit: int,
    q: "queue.Queue",
    click_works_tab: bool = False,
    wait_first: float = 10.0,
) -> tuple:
    """通用引擎：打开页面 → 滚动 → 在 CDP 层拦截列表接口响应并聚合。

    主页作品 / 合集 / 收藏夹三者共用同一套机制（都是无限滚动 + aweme_list 分页），
    差别只在入口 URL、接口特征和要不要先点一下「作品」tab。
    返回 (awemes, profile_author, capped)，结构与调用方一致。
    """
    if not ensure_browser():
        raise RuntimeError("浏览器兜底不可用：Chrome 未启动或 websocket 缺失")
    ver = _http_get("/json/version")
    bc = _CDP(ver["webSocketDebuggerUrl"])
    try:
        _cleanup_stale_tabs(bc)
        tc, tid = _new_tab(bc)
        if not tc:
            raise RuntimeError("浏览器兜底失败：无法创建标签页")
        try:
            tc.send("Page.navigate", {"url": page_url})
            time.sleep(wait_first)
            _assert_not_captcha(tc, page_url)
            if click_works_tab:
                _click_works_tab(tc)
                time.sleep(3)
            seen_rid: set = set()
            seen_ids: set = set()
            awemes: list = []
            profile: dict = {}
            last = 0
            idle = 0
            for _ in range(max_pages):
                tc.send("Input.dispatchMouseEvent",
                        {"type": "mouseWheel", "x": 400, "y": 400, "deltaX": 0, "deltaY": 4000}, wait=False)
                time.sleep(1.8)
                for e in tc.drain("Network.responseReceived"):
                    url = e["params"].get("response", {}).get("url", "")
                    if not _is_list_api(url, hints):
                        continue
                    rid = e["params"]["requestId"]
                    if rid in seen_rid:
                        continue
                    seen_rid.add(rid)
                    rr = tc.send("Network.getResponseBody", {"requestId": rid})
                    if not rr or "result" not in rr:
                        continue
                    try:
                        body = json.loads(rr["result"]["body"])
                    except Exception:
                        continue
                    lst = body.get("aweme_list") or []
                    if not lst:
                        continue
                    for aw in lst:
                        aid = str(aw.get("aweme_id") or "")
                        if aid and aid not in seen_ids:
                            seen_ids.add(aid)
                            awemes.append(aw)
                            if not profile:
                                profile = aw.get("author") or {}
                    if q is not None:
                        q.put(f"🌐 浏览器兜底翻页中… 已获取 {len(awemes)} 个作品")
                if len(awemes) > last:
                    last = len(awemes)
                    idle = 0
                else:
                    idle += 1
                    if idle >= idle_limit:
                        break
            if not awemes:
                _assert_not_captcha(tc, page_url)  # 一条都没抓到，先排除验证码
            return awemes, profile, False
        finally:
            tc.close()
            _close_target(bc, tid)
    finally:
        bc.close()


def _sync_profile_works(sec_uid: str, max_pages: int, idle_limit: int, q: "queue.Queue") -> tuple:
    return _sync_list_works(
        f"https://www.douyin.com/user/{sec_uid}",
        HINT_PROFILE, max_pages, idle_limit, q,
        click_works_tab=True,
    )


def _sync_collection_works(mix_id: str, max_pages: int, idle_limit: int, q: "queue.Queue") -> tuple:
    return _sync_list_works(
        f"https://www.douyin.com/collection/{mix_id}",
        HINT_COLLECTION, max_pages, idle_limit, q,
    )


def _sync_favorites_works(
    folder_id: str, max_pages: int, idle_limit: int, q: "queue.Queue", page_url: str = "",
) -> tuple:
    """收藏夹需登录态。入口优先用调用方给的真实 URL（保留用户所在的 tab），
    否则退回默认的「我的收藏」页。接口名不确定，用通配匹配。"""
    url = page_url or "https://www.douyin.com/user/self?showTab=favorite_collection"
    if folder_id and "folder_id=" not in url:
        url += ("&" if "?" in url else "?") + f"folder_id={folder_id}"
    return _sync_list_works(
        url, HINT_FAVORITE, max_pages, idle_limit, q,
        click_works_tab=True,
    )


def _try_read_detail_body(tc: _CDP, rid: str, tries: int = 8, gap: float = 0.4) -> Optional[dict]:
    """尝试读取某条 detail 请求的响应体。

    ⚠️ CDP 的 Network 域**有时取不到 body**：实测响应明明是 200、非 Service Worker、
    非缓存、loadingFinished 也已触发，`Network.getResponseBody` 仍返回
    `-32000 No resource with given identifier found`。加大缓冲、禁缓存、绕过 SW、
    改走 Fetch 域都试过，均无效 —— 这是**间歇性**的：同一作品换个时机重新加载通常就能拿到。
    因此这里做「短间隔多次重试 + 整体重新导航」两级兜底，而不是一次失败就放弃。
    """
    for _ in range(tries):
        rr = tc.send("Network.getResponseBody", {"requestId": rid})
        if rr and "result" in rr:
            try:
                b = json.loads(rr["result"].get("body") or "")
            except Exception:
                b = None
            if isinstance(b, dict) and b.get("aweme_detail"):
                return b["aweme_detail"]
        time.sleep(gap)
    return None


_DOM_EXTRACT_JS = r"""
(function(){
  var out = { title: document.title || '', imgs: [], author: '', sec: '' };
  var seen = {};
  var nodes = document.querySelectorAll('img, source');
  for (var i = 0; i < nodes.length; i++) {
    var s = nodes[i].currentSrc || nodes[i].src || '';
    if (!s) continue;
    if (s.indexOf('aweme-images') < 0 && s.indexOf('aweme_image') < 0) continue;
    if (seen[s]) continue;
    seen[s] = 1;
    out.imgs.push(s);
  }
  // 作者名只认页面自带的元数据。
  // ⚠️ 不要从 a[href*="/user/"] 里猜：图文页会挂一串「关联创作者」链接，
  //    实测抓到的是别人（黄昏 HUANGHUN），而这篇的作者其实是芃芃与AIGC。
  //    错挂一个创作者名比留空更糟 —— 取不到就返回空，让上游显示通用名。
  try {
    var m = document.querySelector('meta[name="author"]');
    if (m && (m.content || '').trim()) out.author = m.content.trim().slice(0, 40);
    if (!out.author) {
      var ld = document.querySelector('script[type="application/ld+json"]');
      if (ld) {
        var j = JSON.parse(ld.textContent);
        var a = j && j.author;
        var nm = a && (a.name || (typeof a === 'string' ? a : ''));
        if (nm) out.author = String(nm).trim().slice(0, 40);
      }
    }
  } catch (e) {}
  return JSON.stringify(out);
})()
"""


def _grab_detail_from_dom(tc: _CDP, url: str, wait: float = 9.0) -> Optional[dict]:
    """接口响应体拿不到时，退而从**渲染好的页面**里直接取数据。

    抖音图集页会把图片以 `tplv-dy-aweme-images` 模板渲染进 DOM，同时 `document.title`
    就是作品的完整文案。这条路完全不经过接口响应体，因此不受 CDP 偶发取不到 body 的影响
    —— 实测图文（aweme_type=68）正是最容易触发那个间歇性失败的类别。

    局限：拿不到 author 的完整字段（只能从页面链接里取昵称与 sec_uid），
    计数类字段为空；但对「把图片下全」这个目的已经够用。
    """
    tc.send("Page.navigate", {"url": url})
    time.sleep(wait)
    _assert_not_captcha(tc, url)
    # 轻微滚动，触发图集懒加载
    tc.send("Input.dispatchMouseEvent",
            {"type": "mouseWheel", "x": 400, "y": 400, "deltaX": 0, "deltaY": 900}, wait=False)
    time.sleep(2.0)
    r = tc.send("Runtime.evaluate", {"expression": _DOM_EXTRACT_JS, "returnByValue": True})
    val = ((r or {}).get("result") or {}).get("result", {}).get("value")
    if not val:
        return None
    try:
        d = json.loads(val)
    except Exception:
        return None
    imgs = [u for u in (d.get("imgs") or []) if isinstance(u, str) and u.startswith("http")]
    if not imgs:
        return None
    vid = url.rstrip("/").rsplit("/", 1)[-1]
    author = {"nickname": d.get("author") or ""}
    if d.get("sec"):
        author["sec_uid"] = d["sec"]
    # document.title 形如「<作品文案> - 抖音」，去掉平台后缀，让 desc 与接口路径一致
    desc = (d.get("title") or "").strip()
    for tail in (" - 抖音", "－抖音"):
        if desc.endswith(tail):
            desc = desc[: -len(tail)].strip()
    return {
        "aweme_id": vid,
        "desc": desc,
        "aweme_type": 68,
        "images": [{"url_list": [u]} for u in imgs],
        "author": author,
        "_from_dom": True,
    }


def _grab_detail_once(tc: _CDP, url: str, timeout: int = 20) -> Optional[dict]:
    """导航并尝试抓一次详情。"""
    tc.send("Page.navigate", {"url": url})
    for i in range(timeout):
        for e in tc.drain("Network.responseReceived"):
            u = e["params"].get("response", {}).get("url", "")
            if "aweme/v1/web/aweme/detail" in u:
                aw = _try_read_detail_body(tc, e["params"]["requestId"])
                if aw:
                    return aw
        if i == 6:
            _assert_not_captcha(tc, url)  # 等了 7 秒还没到，先排除验证码
        time.sleep(1)
    return None


def _sync_detail(video_id: str, q: "queue.Queue") -> Optional[dict]:
    if not ensure_browser():
        raise RuntimeError("浏览器兜底不可用：Chrome 未启动或 websocket 缺失")
    vid = str(video_id)
    url = vid if vid.startswith("http") else f"https://www.douyin.com/video/{vid}"
    ver = _http_get("/json/version")
    bc = _CDP(ver["webSocketDebuggerUrl"])
    try:
        _cleanup_stale_tabs(bc)
        tc, tid = _new_tab(bc)
        if not tc:
            raise RuntimeError("浏览器兜底失败：无法创建标签页")
        try:
            # 最多三轮重新导航：CDP 偶发取不到响应体，重新加载往往就能拿到。
            # 实测「图文（aweme_type=68）」比「视频」更容易命中这个间歇性失败，
            # 而图文恰好是本模块之前完全没有兜底能力的一类。
            for attempt in range(3):
                aw = _grab_detail_once(tc, url, timeout=20 if attempt == 0 else 14)
                if aw:
                    if attempt:
                        print(f"[browser_fetch] detail 第 {attempt + 1} 轮才取到 vid={vid}", flush=True)
                    return aw
                if attempt < 2:
                    time.sleep(1.5)
            # 三条接口路径都没拿到 body → 退到 DOM 直取（不经过接口响应体）
            aw = _grab_detail_from_dom(tc, url)
            if aw:
                print(f"[browser_fetch] detail 接口取体失败，已改用 DOM 直取 vid={vid} "
                      f"imgs={len(aw.get('images') or [])}", flush=True)
                return aw
            return None
        finally:
            tc.close()
            _close_target(bc, tid)
    finally:
        bc.close()


# ----------------------------------------------------------------- 异步包装

async def browser_fetch_profile_works(
    sec_uid: str,
    cookie: str = "",
    ua: str = DEFAULT_UA,
    progress_cb: ProgressCB = None,
    max_pages: int = 120,
    headless: bool = True,
    idle_limit: int = 8,
) -> tuple[list[dict[str, Any]], dict[str, Any], bool]:
    """浏览器兜底：打开用户主页，滚动加载并拦截 aweme/post 响应。

    返回 (awemes, profile_author, capped)，结构与 _fetch_douyin_works 一致。
    """
    if not BROWSER_AVAILABLE:
        raise RuntimeError("浏览器兜底不可用（websocket-client 未安装或系统无 Chrome）")
    import queue as _queue

    q: "_queue.Queue" = _queue.Queue()
    loop = asyncio.get_event_loop()
    fut = loop.run_in_executor(None, _sync_profile_works, sec_uid, max_pages, idle_limit, q)
    if progress_cb:
        while not fut.done():
            try:
                msg = q.get_nowait()
            except _queue.Empty:
                await asyncio.sleep(0.2)
                continue
            await progress_cb(msg)
    awemes, profile, capped = await fut
    if progress_cb:
        while not q.empty():
            await progress_cb(q.get_nowait())
    if not awemes:
        raise RuntimeError("浏览器兜底失败：未拦截到任何作品数据（可能被验证码拦截或账号未登录）")
    return awemes, profile, capped


async def browser_fetch_aweme_detail(
    video_id: str,
    cookie: str = "",
    ua: str = DEFAULT_UA,
    headless: bool = True,
    wait_seconds: int = 25,
) -> Optional[dict[str, Any]]:
    """浏览器兜底：打开单视频/图文页，拦截 aweme/detail 响应，返回 aweme_detail dict。"""
    if not BROWSER_AVAILABLE:
        raise RuntimeError("浏览器兜底不可用（websocket-client 未安装或系统无 Chrome）")
    import queue as _queue

    q: "_queue.Queue" = _queue.Queue()
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync_detail, video_id, q)


async def _await_with_progress(fut, q: "queue.Queue", progress_cb: ProgressCB) -> Any:
    """等待线程池任务跑完，同时把线程推来的进度消息转成异步回调。"""
    if progress_cb:
        while not fut.done():
            try:
                msg = q.get_nowait()
            except queue.Empty:
                await asyncio.sleep(0.2)
                continue
            await progress_cb(msg)
    result = await fut
    if progress_cb:
        while not q.empty():
            await progress_cb(q.get_nowait())
    return result


async def browser_fetch_collection_works(
    mix_id: str,
    cookie: str = "",
    progress_cb: ProgressCB = None,
    max_pages: int = 80,
    idle_limit: int = 6,
) -> tuple[list[dict[str, Any]], dict[str, Any], bool]:
    """浏览器兜底：打开合集页，滚动加载并拦截 mix/aweme 响应。

    合集此前**没有任何兜底路径**，在 Argus 门禁下纯 API 必然 403，因此长期不可用。
    """
    if not BROWSER_AVAILABLE:
        raise RuntimeError("浏览器兜底不可用（websocket-client 未安装或系统无 Chrome）")
    q: "queue.Queue" = queue.Queue()
    loop = asyncio.get_event_loop()
    fut = loop.run_in_executor(None, _sync_collection_works, mix_id, max_pages, idle_limit, q)
    awemes, profile, capped = await _await_with_progress(fut, q, progress_cb)
    if not awemes:
        raise RuntimeError("浏览器兜底失败：未拦截到合集作品（合集可能已失效或需登录）")
    return awemes, profile, capped


async def browser_fetch_favorites_works(
    folder_id: str = "",
    cookie: str = "",
    page_url: str = "",
    progress_cb: ProgressCB = None,
    max_pages: int = 120,
    idle_limit: int = 8,
) -> tuple[list[dict[str, Any]], dict[str, Any], bool]:
    """浏览器兜底：打开「我的收藏」页并拦截分页响应。

    前提：Chrome 真实 profile 里带有**有效登录态**（收藏夹是登录用户私有数据）。
    入口 URL 优先用调用方传入的真实 URL，以保留用户所在的收藏子夹。
    """
    if not BROWSER_AVAILABLE:
        raise RuntimeError("浏览器兜底不可用（websocket-client 未安装或系统无 Chrome）")
    q: "queue.Queue" = queue.Queue()
    loop = asyncio.get_event_loop()
    fut = loop.run_in_executor(
        None, _sync_favorites_works, folder_id, max_pages, idle_limit, q, page_url
    )
    awemes, profile, capped = await _await_with_progress(fut, q, progress_cb)
    if not awemes:
        raise RuntimeError(
            "浏览器兜底失败：未拦截到收藏作品。收藏夹必须已登录，"
            "且 Chrome profile 里的登录态仍然有效（过期请重新登录 Chrome）。"
        )
    return awemes, profile, capped
