#!/usr/bin/env python3
"""从本机运行中的 Chrome（profile 副本 + headless + CDP）抓取小红书请求的真实 x-s-common 设备指纹头。

输出：JSON {"ok": true, "x_s_common": "..."} 或 {"ok": false, "error": "..."}
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
PROFILE = "/tmp/xhs_chrome_profile"
PORT = 9225
SRC = os.path.expanduser("~/Library/Application Support/Google/Chrome")
TARGET_URL = "https://www.xiaohongshu.com/discovery/item/6a5eecf300000000050388f7?xsec_token=ABR_3lGiyk86SO9gkbkEoiikum6CDDBez7eFsL6dLFIsQ=&xsec_source=pc_share"


def log(*a):
    sys.stderr.write("[xhs-xscommon] " + " ".join(map(str, a)) + "\n")
    sys.stderr.flush()


def copy_profile() -> bool:
    if not os.path.isdir(os.path.join(SRC, "Default")):
        return False
    shutil.rmtree(PROFILE, ignore_errors=True)
    os.makedirs(os.path.join(PROFILE, "Default"), exist_ok=True)
    excludes = ["Lock", "SingletonLock", "SingletonCookie", "SingletonSocket", "Cache",
                "Code Cache", "GPUCache", "Service Worker", "Session Storage",
                "Local Storage", "IndexedDB", "databases", "Preferences",
                "Secure Preferences", "Extension State"]
    cmd = ["rsync", "-a", "--quiet"]
    for e in excludes:
        cmd += ["--exclude", e]
    cmd += [os.path.join(SRC, "Default") + "/", os.path.join(PROFILE, "Default") + "/"]
    if subprocess.run(cmd).returncode != 0:
        return False
    ls = os.path.join(SRC, "Local State")
    if os.path.exists(ls):
        shutil.copy(ls, os.path.join(PROFILE, "Local State"))
    return True


def start_chrome():
    return subprocess.Popen(
        [CHROME, "--headless=new", "--no-sandbox", "--disable-gpu",
         "--no-first-run", "--no-default-browser-check", "--remote-allow-origins=*",
         f"--remote-debugging-port={PORT}", f"--user-data-dir={PROFILE}"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _http_get(url: str) -> bytes:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    return opener.open(url, timeout=3).read()


def main() -> int:
    try:
        if not copy_profile():
            sys.stdout.write(json.dumps({"ok": False, "error": "无法复制 Chrome profile"}))
            return 1
        proc = start_chrome()
        if proc is None:
            sys.stdout.write(json.dumps({"ok": False, "error": "无法启动 headless Chrome"}))
            return 1
        try:
            import websocket  # noqa: WPS433
            deadline = time.time() + 40
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
                raise RuntimeError("CDP 端口未就绪")
            ws = websocket.create_connection(ws_url, timeout=60)
            msg_id = 0
            xs_commons: set[str] = set()

            def send(method, params=None):
                nonlocal msg_id
                msg_id += 1
                ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
                return msg_id

            def recv_until(cid, timeout=30):
                end = time.time() + timeout
                while time.time() < end:
                    m = json.loads(ws.recv())
                    if m.get("id") == cid:
                        return m
                    if m.get("method") == "Network.requestWillBeSent":
                        h = m.get("params", {}).get("request", {}).get("headers", {}) or {}
                        xsc = h.get("x-s-common") or h.get("X-S-Common")
                        url = m.get("params", {}).get("request", {}).get("url", "")
                        if xsc and ("xiaohongshu" in url or "xhscdn" in url):
                            xs_commons.add(xsc)
                return None

            send("Network.enable"); recv_until(msg_id, 5)
            send("Page.enable"); recv_until(msg_id, 5)
            send("Page.navigate", {"url": TARGET_URL})
            # 持续接收网络事件，抓取 API 请求里的 x-s-common
            end = time.time() + 30
            while time.time() < end and not xs_commons:
                try:
                    ws.settimeout(2)
                    m = json.loads(ws.recv())
                except Exception:
                    continue
                if m.get("method") == "Network.requestWillBeSent":
                    req = m.get("params", {}).get("request", {}) or {}
                    h = req.get("headers", {}) or {}
                    xsc = h.get("x-s-common") or h.get("X-S-Common")
                    url = req.get("url", "")
                    if xsc and ("xiaohongshu" in url or "xhscdn" in url):
                        xs_commons.add(xsc)
                        log("captured x-s-common from", url[:80])
            ws.close()
            if not xs_commons:
                raise RuntimeError("未抓到 x-s-common（页面可能未发起 API 请求或被风控）")
            val = sorted(xs_commons)[0]
            sys.stdout.write(json.dumps({"ok": True, "x_s_common": val, "samples": len(xs_commons)}))
            return 0
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except Exception:
                proc.kill()
    except Exception as exc:
        sys.stdout.write(json.dumps({"ok": False, "error": f"抓取失败: {exc}"}))
        return 1
    finally:
        shutil.rmtree(PROFILE, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
