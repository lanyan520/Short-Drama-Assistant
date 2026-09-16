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


def _new_tab(bc: _CDP) -> Optional[_CDP]:
    before = {t.get("webSocketDebuggerUrl") for t in _http_get("/json/list") if t.get("webSocketDebuggerUrl")}
    bc.send("Target.createTarget", {"url": "about:blank"})
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
        return None
    tc = _CDP(tws)
    tc.send("Network.enable")
    tc.send("Page.enable")
    return tc


def _click_works_tab(tc: _CDP):
    tc.send("Runtime.evaluate", {"expression": """
      (function(){
        var t=[].slice.call(document.querySelectorAll('*')).filter(function(e){
          return e.children.length===0 && e.textContent==='作品';
        });
        if(t.length){ t[0].click(); return true; } return false;
      })()""", "returnByValue": True})


# ----------------------------------------------------------------- 同步核心

def _sync_profile_works(sec_uid: str, max_pages: int, idle_limit: int, q: "queue.Queue") -> tuple:
    if not ensure_browser():
        raise RuntimeError("浏览器兜底不可用：Chrome 未启动或 websocket 缺失")
    ver = _http_get("/json/version")
    bc = _CDP(ver["webSocketDebuggerUrl"])
    try:
        tc = _new_tab(bc)
        if not tc:
            raise RuntimeError("浏览器兜底失败：无法创建标签页")
        try:
            tc.send("Page.navigate", {"url": f"https://www.douyin.com/user/{sec_uid}"})
            time.sleep(10)
            _click_works_tab(tc)
            time.sleep(3)
            seen: set = set()
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
                    if "aweme/v1/web/aweme/post" in url:
                        rid = e["params"]["requestId"]
                        if rid in seen:
                            continue
                        seen.add(rid)
                        rr = tc.send("Network.getResponseBody", {"requestId": rid})
                        if not rr or "result" not in rr:
                            continue
                        try:
                            body = json.loads(rr["result"]["body"])
                        except Exception:
                            continue
                        lst = body.get("aweme_list") or []
                        if lst:
                            for aw in lst:
                                aid = str(aw.get("aweme_id") or "")
                                if aid and aid not in seen:
                                    seen.add(aid)
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
            return awemes, profile, False
        finally:
            tc.close()
    finally:
        bc.close()


def _sync_detail(video_id: str, q: "queue.Queue") -> Optional[dict]:
    if not ensure_browser():
        raise RuntimeError("浏览器兜底不可用：Chrome 未启动或 websocket 缺失")
    vid = str(video_id)
    url = vid if vid.startswith("http") else f"https://www.douyin.com/video/{vid}"
    ver = _http_get("/json/version")
    bc = _CDP(ver["webSocketDebuggerUrl"])
    try:
        tc = _new_tab(bc)
        if not tc:
            raise RuntimeError("浏览器兜底失败：无法创建标签页")
        try:
            tc.send("Page.navigate", {"url": url})
            result = None
            for _ in range(25):
                for e in tc.drain("Network.responseReceived"):
                    u = e["params"].get("response", {}).get("url", "")
                    if "aweme/v1/web/aweme/detail" in u:
                        rid = e["params"]["requestId"]
                        rr = tc.send("Network.getResponseBody", {"requestId": rid})
                        if rr and "result" in rr:
                            try:
                                b = json.loads(rr["result"]["body"])
                            except Exception:
                                continue
                            aw = b.get("aweme_detail")
                            if aw:
                                result = aw
                                break
                if result:
                    break
                time.sleep(1)
            return result
        finally:
            tc.close()
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
