#!/usr/bin/env python3
"""从本机运行中的 Chrome 抓取抖音 / 小红书登录态 Cookie（CDP 非侵入式）。

用法：python sync_cookie.py douyin|xhs
输出：JSON {"ok": true, "cookie": "...", "count": N, "domains": [...]}
流程：复制 profile -> headless Chrome(9223) -> CDP Storage.getCookies -> 过滤拼接 -> 清理。
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE = "/tmp/dy_chrome_profile"
PORT = 9223
SRC = os.path.expanduser("~/Library/Application Support/Google/Chrome")
DOMAINS = {"douyin": ("douyin", "iesdouyin"), "xhs": ("xiaohongshu", "xhscdn")}


def log(*a):
    sys.stderr.write("[sync-cookie] " + " ".join(map(str, a)) + "\n")
    sys.stderr.flush()


def is_ascii(s: str) -> bool:
    try:
        s.encode("ascii")
        return True
    except Exception:
        return False


def copy_profile() -> bool:
    if not os.path.isdir(os.path.join(SRC, "Default")):
        log("Chrome profile 不存在:", SRC)
        return False
    shutil.rmtree(PROFILE, ignore_errors=True)
    os.makedirs(os.path.join(PROFILE, "Default"), exist_ok=True)
    excludes = [
        "Lock", "SingletonLock", "SingletonCookie", "SingletonSocket",
        "Cache", "Code Cache", "GPUCache", "Service Worker",
        "Session Storage", "Local Storage", "IndexedDB", "databases",
        "Preferences", "Secure Preferences", "Extension State",
    ]
    rsync_args = ["rsync", "-a", "--quiet"]
    for e in excludes:
        rsync_args += ["--exclude", e]
    rsync_args += [os.path.join(SRC, "Default") + "/", os.path.join(PROFILE, "Default") + "/"]
    r = subprocess.run(rsync_args)
    if r.returncode != 0:
        log("rsync 复制 profile 失败 rc=", r.returncode)
        return False
    ls = os.path.join(SRC, "Local State")
    if os.path.exists(ls):
        shutil.copy(ls, os.path.join(PROFILE, "Local State"))
    return True


def start_chrome() -> subprocess.Popen | None:
    return subprocess.Popen(
        [CHROME, "--headless=new", "--no-sandbox", "--disable-gpu",
         "--no-first-run", "--no-default-browser-check",
         "--remote-allow-origins=*",
         f"--remote-debugging-port={PORT}",
         f"--user-data-dir={PROFILE}"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def _http_get(url: str) -> bytes:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    return opener.open(url, timeout=3).read()


def read_cookies_via_cdp(timeout: float = 40.0) -> list[dict]:
    import websocket  # noqa: WPS433
    deadline = time.time() + timeout
    ws_url = None
    while time.time() < deadline:
        try:
            ver = json.loads(_http_get(f"http://127.0.0.1:{PORT}/json/version"))
            ws_url = ver.get("webSocketDebuggerUrl")
            if ws_url:
                break
        except Exception:
            time.sleep(0.4)
    if not ws_url:
        raise RuntimeError("CDP 端口未就绪（headless Chrome 启动失败？）")
    ws = websocket.create_connection(ws_url, timeout=15)
    try:
        def send(cid, m, p=None):
            ws.send(json.dumps({"id": cid, "method": m, "params": p or {}}))
        def recv(cid):
            while True:
                m = json.loads(ws.recv())
                if m.get("id") == cid:
                    return m
        send(1, "Storage.enable"); recv(1)
        send(2, "Storage.getCookies", {})
        r = recv(2)
        return r.get("result", {}).get("cookies", [])
    finally:
        ws.close()


def main() -> int:
    platform = (sys.argv[1] if len(sys.argv) > 1 else "").strip().lower()
    if platform not in DOMAINS:
        sys.stdout.write(json.dumps({"ok": False, "error": "platform 必须为 douyin 或 xhs"}))
        return 1
    try:
        if not copy_profile():
            sys.stdout.write(json.dumps({"ok": False, "error": "无法复制 Chrome profile，请确认 Chrome 已安装且使用过"}))
            return 1
        proc = start_chrome()
        if proc is None:
            sys.stdout.write(json.dumps({"ok": False, "error": "无法启动 headless Chrome"}))
            return 1
        try:
            cookies = read_cookies_via_cdp()
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except Exception:
                proc.kill()
    except Exception as exc:  # noqa: BLE001
        sys.stdout.write(json.dumps({"ok": False, "error": f"抓取失败: {exc}"}))
        return 1
    finally:
        shutil.rmtree(PROFILE, ignore_errors=True)

    keys = DOMAINS[platform]
    picked = []
    for c in cookies:
        domain = (c.get("domain") or "").lower()
        name = c.get("name") or ""
        value = c.get("value") or ""
        if not name or not any(k in domain for k in keys):
            continue
        if not is_ascii(value):
            continue
        picked.append((name, value))
    # 去重（同名保留最后一个），按名称排序
    picked_map = {}
    for name, value in picked:
        picked_map[name] = value
    items = sorted(picked_map.items())
    header = "; ".join(f"{k}={v}" for k, v in items)
    sys.stdout.write(json.dumps({
        "ok": True,
        "cookie": header,
        "count": len(items),
        "domains": sorted({c.get("domain", "") for c in cookies if any(k in (c.get("domain") or "").lower() for k in keys)}),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
