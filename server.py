#!/usr/bin/env python3
"""短剧助手 · 本地服务
- 托管 website 目录下的静态文件
- /api/config  GET  -> 读取本地配置（RunningHub Key 等）
               POST -> 保存 / 更新本地配置
Key 明文保存在同目录 config.json（仅本机本地使用）。
"""
import json
import os
import sys
import time
import uuid
import queue
import threading
import http.client
import subprocess
import urllib.request
import urllib.error
import http.server
import asyncio
import importlib.util
from email import policy
from email.parser import BytesParser

# ---- 去水印下载 / 关键帧 / 本地资源：内联运行 downloader（不再依赖 8899 独立进程）----
# 直接把下载器自带的 FastAPI app 作为 ASGI 应用在当前进程内调度，复用其全部已验证逻辑，
# 用一个常驻事件循环承载后台下载/解析任务，避免单独拉起 8899 端口。
DL_HOST = "127.0.0.1"
DL_PORT = 8899

def get_dl_dir():
    """去水印下载器目录：环境变量 DL_DIR > config.json 的 dlDir > 同目录 downloader/（git submodule 推荐布局）。"""
    env = os.getenv("DL_DIR")
    if env:
        return env
    try:
        cfg = load_config()
        if cfg.get("dlDir"):
            return cfg["dlDir"]
    except Exception:
        pass
    return os.path.join(BASE, "downloader")

def get_dl_venv_py():
    """下载器专用 Python：环境变量 DL_VENV_PY > config.json 的 dlVenvPy > 当前 Python（sys.executable）。"""
    env = os.getenv("DL_VENV_PY")
    if env:
        return env
    try:
        cfg = load_config()
        if cfg.get("dlVenvPy"):
            return cfg["dlVenvPy"]
    except Exception:
        pass
    return sys.executable

def get_dl_cfg_path():
    return os.path.join(get_dl_dir(), "data", "config.json")

_dl_app = None
_dl_loop = None


def _init_dl_app():
    """加载并初始化内联 downloader（FastAPI app）。失败返回 False 且不抛异常。"""
    global _dl_app, _dl_loop
    if _dl_app is not None:
        return True
    try:
        _d = get_dl_dir()
        if _d not in sys.path:
            sys.path.insert(0, _d)
        spec = importlib.util.spec_from_file_location(
            "dl_app_mod", os.path.join(_d, "server.py"),
            submodule_search_locations=[_d],
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _dl_app = mod.app
        _dl_loop = asyncio.new_event_loop()
        threading.Thread(target=_dl_loop.run_forever, daemon=True).start()
        sys.stderr.write("[dl] in-process downloader loaded (FastAPI app)\n")
        return True
    except Exception as e:
        sys.stderr.write("[dl] failed to load in-process downloader: %r\n" % e)
        _dl_app = None
        return False

BASE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE, "config.json")


def load_config():
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


# ---- downloader 服务（8899）可用性探测与自动拉起 ----
def dl_alive(timeout=2.0):
    """探测本地 downloader 服务是否可访问。"""
    try:
        conn = http.client.HTTPConnection(DL_HOST, DL_PORT, timeout=timeout)
        try:
            conn.request("GET", "/api/bootstrap")
            r = conn.getresponse()
            r.read()
            return r.status == 200
        finally:
            conn.close()
    except Exception:
        return False


def dl_ensure_started():
    """若 8899 未运行，用 downloader 专用 venv 后台拉起 FastAPI 服务。"""
    if dl_alive():
        return True
    _venv = get_dl_venv_py()
    if not os.path.isfile(_venv):
        sys.stderr.write("[dl] venv python not found: %s\n" % _venv)
        return False
    try:
        log_f = open(os.path.join(BASE, "dl_server.log"), "a", encoding="utf-8")
        proc = subprocess.Popen(
            [_venv, "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", str(DL_PORT)],
            cwd=get_dl_dir(),
            stdout=log_f,
            stderr=subprocess.STDOUT,
        )
        sys.stderr.write("[dl] starting downloader service pid=%s\n" % proc.pid)
        # 最多等 8 秒就绪
        for _ in range(16):
            time.sleep(0.5)
            if dl_alive():
                return True
        return False
    except Exception as e:
        sys.stderr.write("[dl] failed to start downloader: %s\n" % e)
        return False


def dl_read_cookie():
    """从 downloader 的 data/config.json 读取 cookie（供设置自动回填）。"""
    try:
        with open(get_dl_cfg_path(), "r", encoding="utf-8") as f:
            c = json.load(f)
        return {
            "douyin_cookie": (c.get("douyin_cookie") or "").strip(),
            "xhs_cookie": (c.get("xhs_cookie") or "").strip(),
        }
    except Exception:
        return {"douyin_cookie": "", "xhs_cookie": ""}


def dl_write_cookie(dy="", xhs=""):
    """把抖音/小红书 cookie 写入 downloader 的 config.json（保留其他字段）。"""
    try:
        with open(get_dl_cfg_path(), "r", encoding="utf-8") as f:
            c = json.load(f)
    except Exception:
        c = {}
    if dy is not None:
        c["douyin_cookie"] = (dy or "").strip()
    if xhs is not None:
        c["xhs_cookie"] = (xhs or "").strip()
    try:
        with open(get_dl_cfg_path(), "w", encoding="utf-8") as f:
            json.dump(c, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        sys.stderr.write("[dl] write cookie failed: %s\n" % e)
        return False



# ---- RunningHub 工作流 API（v2）----
# 文生图工作流已更新发布：https://www.runninghub.cn/post/2091149048991535105
# 提示词 / 图片比例 / 生成张数 / 缩放系数 均为工作流节点（位于 Base_Input_Set 组），
# 节点 id 与字段名已写死在下方 RH_NODES（不对外暴露配置，避免误填）。
RH_WORKFLOW_ID = "2091149048991535105"
RH_QUERY_URL = "https://www.runninghub.cn/openapi/v2/query"
RH_CANCEL_URL = "https://www.runninghub.cn/task/openapi/cancel"

# 节点映射（写死，不对外暴露配置）：按 Base_Input_Set 组实际节点填写（见 workflow 截图）
# #121 Text → text；#125 Resolution Selector → aspect_ratio / megapixels；#134 Integer → Value
RH_NODES = {
    "prompt": {"nodeId": "121", "fieldName": "text"},
    "ratio":  {"nodeId": "125", "fieldName": "aspect_ratio"},
    "count":  {"nodeId": "134", "fieldName": "Value"},
    "scale":  {"nodeId": "125", "fieldName": "megapixels"},
}


def load_rh_concurrency():
    """读取并发上限（默认 1）。受 RunningHub 会员权益约束，用户自行设置不超过自身权益的值。"""
    cfg = load_config()
    try:
        return max(1, min(RH_QUEUE_POOL, int(cfg.get("rhConcurrency", 1) or 1)))
    except Exception:
        return 1


# 单任务轮询总超时（分钟）。参考 RunningHub 会员权益：免费 20 分钟、付费 60 分钟。
# 任务超过该时长未返回则视为超时（RunningHub 侧可能仍在跑，但本地并发槽已释放）。
RH_TIMEOUT_MIN_DEFAULT = 60    # 默认 60 分钟（付费用户）
RH_TIMEOUT_MIN_FREE   = 20    # 免费用户 20 分钟
RH_TIMEOUT_MAX        = 360   # 上限 6 小时（防呆）


def load_rh_timeout():
    """读取单任务轮询超时（秒）。默认 60 分钟，限制在 RH_TIMEOUT_MIN_FREE~RH_TIMEOUT_MAX。"""
    cfg = load_config()
    try:
        m = int(cfg.get("rhTimeout", RH_TIMEOUT_MIN_DEFAULT) or RH_TIMEOUT_MIN_DEFAULT)
    except Exception:
        m = RH_TIMEOUT_MIN_DEFAULT
    m = max(RH_TIMEOUT_MIN_FREE, min(RH_TIMEOUT_MAX, m))
    return m * 60


def load_rh_http_timeout():
    """单次 RunningHub HTTP 请求超时（秒）：也读取设置（分钟→秒），钳制 60~3600 秒。
    即"所有 runninghub.cn 的 api 请求超时"统一由设置控制。"""
    return max(60, min(3600, load_rh_timeout()))


# ---- 本地任务 UUID → RunningHub 任务 ID 持久化映射 ----
# 前端持久化的 taskId 是本地队列 UUID，恢复时需要真实 RunningHub 任务 ID；
# 服务重启会清空内存队列，因此提交成功时把映射落盘，重启后仍可恢复。
RH_TASK_MAP_PATH = os.path.join(BASE, "rh_tasks.json")
_rh_map_lock = threading.Lock()


def _load_rh_task_map():
    try:
        with open(RH_TASK_MAP_PATH, "r", encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _save_rh_task_map(m):
    try:
        with open(RH_TASK_MAP_PATH, "w", encoding="utf-8") as f:
            json.dump(m, f, ensure_ascii=False)
    except Exception:
        pass


def record_rh_mapping(local_tid, rh_task_id, workflow_id=None):
    """记录 本地UUID → RunningHub 任务ID 映射（提交成功后调用，落盘防重启丢失）。

    workflow_id：可选，记录该任务所属 RunningHub 工作流，便于「从后台恢复历史」按模块精确筛选。
    """
    if not local_tid or not rh_task_id:
        return
    with _rh_map_lock:
        m = _load_rh_task_map()
        entry = {"rhTaskId": str(rh_task_id), "ts": int(time.time())}
        if workflow_id:
            entry["workflowId"] = str(workflow_id)
        m[str(local_tid)] = entry
        # 只保留最近 500 条，避免无限增长
        if len(m) > 500:
            for k in sorted(m, key=lambda x: m[x].get("ts", 0))[: len(m) - 500]:
                m.pop(k, None)
        _save_rh_task_map(m)


def lookup_rh_task_id(local_tid):
    """通过本地 UUID 查 RunningHub 真实任务 ID；查不到返回 None。"""
    with _rh_map_lock:
        m = _load_rh_task_map()
    rec = m.get(str(local_tid))
    return (rec or {}).get("rhTaskId")


def _is_local_task_id(tid):
    """本地队列 taskId 为 32 位 hex；RunningHub 任务 ID 为纯数字。"""
    return bool(tid) and len(tid) == 32 and all(c in '0123456789abcdef' for c in tid.lower())


# ---- RunningHub 任务队列 ----
# 设计目标：所有 RunningHub API 调用进入统一队列，最多 concurrency 条同时执行，
# 其余排队等待（上一条结束才继续下一条；并发=2 则两条同时跑，其余等待）。
# 每个任务立即返回 taskId，前端轮询 /api/rh-task/<id> 获取状态。
RH_QUEUE_POOL = 8  # 工作线程池上限（仅作缓冲，实际并发由 concurrency 控制）


class RhTaskQueue:
    def __init__(self, concurrency=1):
        self.concurrency = max(1, min(RH_QUEUE_POOL, int(concurrency)))
        self._cond = threading.Condition()
        self._running = 0
        self._seq = 0
        self._seq_lock = threading.Lock()
        self._tasks = {}
        self._tasks_lock = threading.Lock()
        self._cancelled = set()       # 已取消任务 ID：worker 内 fn 通过 cancelled 回调感知并立即退出
        self._cancelled_lock = threading.Lock()
        self._q = queue.Queue()
        for _ in range(RH_QUEUE_POOL):
            threading.Thread(target=self._worker, daemon=True).start()

    def set_concurrency(self, n):
        n = max(1, min(RH_QUEUE_POOL, int(n)))
        with self._cond:
            if n == self.concurrency:
                return
            self.concurrency = n
            self._cond.notify_all()  # 唤醒空闲 worker，允许更多并发

    def submit(self, fn):
        with self._seq_lock:
            self._seq += 1
            seq = self._seq
        tid = uuid.uuid4().hex
        with self._tasks_lock:
            self._tasks[tid] = {
                "id": tid, "seq": seq, "status": "queued",
                "created": time.time(), "started": None, "ended": None,
                "fn": fn, "images": None, "text": None, "error": None,
                "rh_task_id": None,  # RunningHub 真实任务 ID（提交成功后注册，用于取消）
            }
            # 内存保护：仅保留最近 100 个已完成任务
            if len(self._tasks) > 100:
                done = sorted(
                    (t for t in self._tasks.values()
                     if t["status"] in ("done", "error") and t["ended"]),
                    key=lambda t: t["ended"],
                )
                for t in done[: len(self._tasks) - 100]:
                    self._tasks.pop(t["id"], None)
        self._q.put(tid)
        return tid

    def _worker(self):
        while True:
            tid = self._q.get()
            # 等待并发槽：超过并发上限则阻塞，确保同时执行的任务数 = concurrency
            with self._cond:
                while self._running >= self.concurrency:
                    self._cond.wait()
                self._running += 1
            task = None
            try:
                with self._tasks_lock:
                    task = self._tasks.get(tid)
                    if task is None:
                        continue  # 任务已被取消删除：直接跳过，不再执行
                    task["status"] = "running"
                    task["started"] = time.time()
                    fn = task["fn"]
                try:
                    # fn(register, cancelled)：register 注册 RH 真实任务 ID；
                    # cancelled() 返回本任务是否已被用户删除（fn 在提交/轮询循环中检查，及时退出释放并发槽）
                    res = fn(
                        lambda rid, workflow_id=None: self._register_rh(tid, rid, workflow_id),
                        lambda: self._is_cancelled(tid),
                    )
                    with self._tasks_lock:
                        task["status"] = "done"
                        # 兼容两类返回：列表（图片 URL）或字典（含 text 文本结果）
                        if isinstance(res, dict):
                            task["images"] = res.get("images")
                            task["text"] = res.get("text")
                        else:
                            task["images"] = res
                        task["ended"] = time.time()
                except Exception as e:
                    with self._tasks_lock:
                        task["status"] = "error"
                        task["error"] = str(e)
                        task["ended"] = time.time()
            finally:
                with self._cond:
                    self._running -= 1
                    self._cond.notify_all()

    def status(self, tid):
        with self._tasks_lock:
            task = self._tasks.get(tid)
            if not task:
                return None
            # 队列位置：比本任务更早进入且尚未完成（queued/running）的任务数
            position = sum(
                1 for t in self._tasks.values()
                if t["id"] != tid and t["status"] in ("queued", "running")
                and t["seq"] < task["seq"]
            )
            # 总活动任务数（仍在队列或运行中的任务，用于展示"共 N 个任务"）
            total = sum(
                1 for t in self._tasks.values()
                if t["status"] in ("queued", "running")
            )
            running = self._running
            conc = self.concurrency
            return {
                "id": tid,
                "status": task["status"],
                "position": position,
                "total": total,
                "running": running,
                "concurrency": conc,
                "images": task["images"],
                "text": task.get("text"),
                "error": task["error"],
                "elapsed": round(time.time() - (task.get("created") or time.time()), 0),
                "rhTaskId": task.get("rh_task_id"),
            }

    def dump(self):
        """队列快照（诊断用）：列出所有未完成任务的状态与耗时。"""
        with self._tasks_lock:
            rows = []
            for t in sorted(self._tasks.values(), key=lambda x: x["seq"]):
                if t["status"] in ("done", "error"):
                    continue
                rows.append({
                    "id": t["id"],
                    "status": t["status"],
                    "seq": t["seq"],
                    "age": round(time.time() - (t["created"] or time.time()), 1),
                    "rhTaskId": t.get("rh_task_id"),
                })
            running = self._running
            conc = self.concurrency
        return {"running": running, "concurrency": conc, "tasks": rows}

    def _is_cancelled(self, tid):
        with self._cancelled_lock:
            return tid in self._cancelled

    def _cancel_rh_task(self, rh_task_id):
        """尽力取消 RunningHub 侧真实任务；失败记录日志（便于诊断）。"""
        if not rh_task_id:
            return
        try:
            cfg = load_config()
            rh_key = cfg.get("rhKey")
            if rh_key:
                # 取消请求超时取设置值与 30s 的较小者（快速失败，不阻塞）
                resp = rh_post(RH_CANCEL_URL, {"apiKey": rh_key, "taskId": rh_task_id},
                               api_key=rh_key, timeout=min(30, load_rh_http_timeout()))
                code = resp.get("code") if isinstance(resp, dict) else None
                if code not in (0, None):
                    sys.stderr.write("[rh-cancel] runninghub cancel failed: %s\n"
                                     % json.dumps(resp, ensure_ascii=False)[:200])
        except Exception as e:
            sys.stderr.write("[rh-cancel] error: %s\n" % e)

    def _register_rh(self, tid, rh_task_id, workflow_id=None):
        """注册 RunningHub 真实任务 ID（提交成功后由工作流函数回调）。

        若注册时发现任务已被删除（提交发生在删除之后，窗口期），
        说明用户已移除该结果，立即取消刚提交的 RunningHub 任务，避免白白消耗额度。
        """
        if not rh_task_id:
            return
        cancelled = False
        with self._tasks_lock:
            t = self._tasks.get(tid)
            if t:
                t["rh_task_id"] = rh_task_id
            else:
                cancelled = True
        record_rh_mapping(tid, rh_task_id, workflow_id)   # 落盘映射：重启后仍可"从后台恢复"
        if cancelled or self._is_cancelled(tid):
            self._cancel_rh_task(rh_task_id)

    def cancel(self, tid):
        """取消任务：从队列移除并尽力取消 RunningHub 侧真实任务。

        - queued：标记取消 + 移除记录，worker 取出后跳过（不执行、不消耗额度）；
        - running：标记取消 + 移除记录（前端轮询即 NOT_FOUND），并调用 RunningHub 取消接口；
          正在执行的任务函数通过 cancelled 回调感知取消，立即退出并释放并发槽，
          后续排队任务随即开始执行（不再原地等待）。
        """
        with self._cancelled_lock:
            self._cancelled.add(tid)
        with self._tasks_lock:
            task = self._tasks.get(tid)
            if not task:
                return False
            if task["status"] in ("done", "error"):
                return False
            rh_rid = task.get("rh_task_id")
            self._tasks.pop(tid, None)
        if rh_rid:
            self._cancel_rh_task(rh_rid)
        return True


# 进程启动时初始化队列（并发数取自 config.json 的 rhConcurrency，默认 1）
RH_QUEUE = RhTaskQueue(load_rh_concurrency())


def rh_post(url, payload, api_key=None, timeout=None):
    """RunningHub JSON POST。timeout 不传则读取设置（load_rh_http_timeout）。"""
    if timeout is None:
        timeout = load_rh_http_timeout()
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    if api_key:
        req.add_header("Authorization", "Bearer " + api_key)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_ratio(ratio, scale):
    try:
        rw, rh = ratio.split(":")
        rw, rh = float(rw), float(rh)
    except Exception:
        rw, rh = 1.0, 1.0
    base = 512 * max(0.5, min(2.0, float(scale)))
    if rw >= rh:
        w = base * rw / rh
        h = base
    else:
        w = base
        h = base * rh / rw
    w = max(512, (int(w) // 8) * 8)
    h = max(512, (int(h) // 8) * 8)
    return w, h


def extract_task_id(resp):
    if isinstance(resp, dict):
        if resp.get("taskId"):
            return resp["taskId"]
        data = resp.get("data")
        if isinstance(data, dict) and data.get("taskId"):
            return data["taskId"]
        if isinstance(data, str) and data:
            return data
    return None


def extract_images(resp):
    if not isinstance(resp, dict):
        return []
    urls = []
    # v2 查询完成时图片在 results 数组（url 字段）；部分接口返回 data 数组（fileUrl/url）
    for key in ("results", "data"):
        items = resp.get(key)
        if not isinstance(items, list):
            continue
        for it in items:
            if isinstance(it, dict):
                u = it.get("fileUrl") or it.get("url")
                if u:
                    urls.append(u)
            elif isinstance(it, str):
                urls.append(it)
    return urls


def extract_status(resp):
    if isinstance(resp, dict):
        if resp.get("status"):
            return str(resp["status"])
        if isinstance(resp.get("data"), str):
            return resp["data"]
    return ""


def fetch_url_text(url):
    """下载一个 URL，若内容是文本（Content-Type 为 text/* 或 .txt 结尾，或能干净地 utf-8 解码）则返回文本，否则返回 None。"""
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=60) as resp:
            ctype = (resp.headers.get("Content-Type") or "").lower()
            data = resp.read()
    except Exception as e:
        sys.stderr.write("[rh-text] fetch exc: %s\n" % e)
        return None
    is_text = ("text/" in ctype) or url.lower().endswith(".txt") or url.lower().endswith(".text")
    if not is_text:
        # 兜底：尝试 utf-8 解码，且可打印占比高才当作文本（避免把图片二进制当文本）
        try:
            s = data.decode("utf-8")
        except Exception:
            return None
        if not s:
            return None
        sample = s[:2000]
        non_text = sum(1 for ch in sample if (ord(ch) < 9 or (13 < ord(ch) < 32)) and ch not in "\n\r\t")
        if non_text > len(sample) * 0.05:
            return None
        return s
    try:
        return data.decode("utf-8")
    except Exception:
        try:
            return data.decode("utf-8", "replace")
        except Exception:
            return None


def extract_texts(resp):
    """从 RunningHub 查询结果里抽取文本结果（反推提示词专用）。

    兼容两种产出：① 直接文本字段（text/prompt/content/result/output）；
    ② 文本文件 URL（fileUrl/url，多为 .txt），会下载并读取内容。
    """
    if not isinstance(resp, dict):
        return []
    out = []
    for key in ("results", "data"):
        items = resp.get(key)
        if not isinstance(items, list):
            continue
        for it in items:
            if isinstance(it, dict):
                for fk in ("text", "prompt", "content", "result", "output", "caption"):
                    v = it.get(fk)
                    if isinstance(v, str) and v.strip():
                        out.append(v.strip())
                u = it.get("fileUrl") or it.get("url")
                if u and u not in out:
                    t = fetch_url_text(u)
                    if t and t.strip():
                        out.append(t.strip())
            elif isinstance(it, str):
                if it.startswith("http://") or it.startswith("https://"):
                    t = fetch_url_text(it)
                    if t and t.strip():
                        out.append(t.strip())
                elif it.strip():
                    out.append(it.strip())
    return out


def query_rh_task_outputs(rh_key, rh_tid):
    """查询单个 RunningHub 真实任务并抽取产出（图片 URL + 文本）。

    返回 (status, images, texts)；任务不存在/取消时抛 RuntimeError；无产出时 images/texts 为空。
    images 元素为 {"url":..., "nodeId":...}（nodeId 用于按工作流精确筛选，如图片洗稿出图节点 256）。
    """
    q = rh_post(RH_QUERY_URL, {"apiKey": rh_key, "taskId": rh_tid}, api_key=rh_key)
    st_u = (q.get("status") or "").upper()
    if q.get("errorCode") == "1004" or st_u in ("CANCELLED",) or (
        st_u in ("FAILED", "ERROR") and "cancel" in json.dumps(q, ensure_ascii=False).lower()
    ):
        raise RuntimeError("NOT_FOUND")
    images = []
    texts = []
    for k in ("results", "data"):
        items = q.get(k)
        if isinstance(items, list):
            for it in items:
                if isinstance(it, dict):
                    u = it.get("fileUrl") or it.get("url")
                    if not u:
                        continue
                    nid = it.get("nodeId")
                elif isinstance(it, str):
                    u = it
                    nid = None
                else:
                    continue
                if str(u).lower().endswith(".txt"):
                    try:
                        txt = fetch_url_text(u)
                        if txt:
                            texts.append(txt)
                    except Exception:
                        pass
                else:
                    images.append({"url": u, "nodeId": nid})
    return st_u or "SUCCESS", images, texts


# 图片比例：前端用简单比例字符串，工作流 Resolution Selector 的 aspect_ratio 下拉需要完整标签
def normalize_aspect(ratio):
    label_map = {
        "1:1":  "1:1 (Square)",
        "2:3":  "2:3 (Portrait Photo)",
        "3:2":  "3:2 (Photo)",
        "3:4":  "3:4 (Portrait Standard)",
        "4:3":  "4:3 (Standard)",
        "9:16": "9:16 (Portrait Widescreen)",
        "16:9": "16:9 (Widescreen)",
        "21:9": "21:9 (Ultrawide)",
    }
    return label_map.get(ratio, ratio)


def build_rh_node_list(prompt, ratio, scale, count, nodes):
    """根据写死的节点映射构造 nodeInfoList。"""
    out = []

    def add(key, value):
        n = nodes.get(key)
        if n and str(n.get("nodeId", "")).strip():
            out.append({
                "nodeId": str(n["nodeId"]).strip(),
                "fieldName": str(n.get("fieldName", "") or "").strip(),
                "fieldValue": value,
            })

    add("prompt", prompt)
    add("ratio", normalize_aspect(ratio))  # 工作流 aspect_ratio 下拉需要完整标签
    add("count", str(int(count)))            # 生成张数（整数）
    add("scale", str(float(scale)))          # 缩放系数 / megapixels（浮点）
    return out


def _is_concurrency_limit(resp):
    """识别 RunningHub 并发数已达上限类错误（中文/英文/常见错误码）。"""
    if not isinstance(resp, dict):
        return False
    code = str(resp.get("errorCode") or resp.get("code") or "")
    msg = str(resp.get("errorMessage") or resp.get("msg") or resp.get("message") or "").lower()
    return ("并发" in msg) or ("concurrency" in msg) or ("rate limit" in msg) \
        or code in ("1006", "1009", "429", "RATE_LIMIT", "CONCURRENCY")


def _rh_submit_error(resp):
    """提交 RunningHub 工作流失败时的友好文案。

    错误码 414 = "Unknown error"（未知错误），实际多由【账户余额不足】或工作流不可用引发，
    界面应直接提示用户去查看 RunningHub 账户余额；其余错误保持原始信息透传。
    """
    if not isinstance(resp, dict):
        return "提交任务失败：" + str(resp)
    code = str(resp.get("errorCode") or resp.get("code") or "")
    msg = str(resp.get("errorMessage") or resp.get("msg") or resp.get("message") or "")
    if code == "414" or "Unknown error" in msg or "未知错误" in msg:
        return ("RunningHub 提交被拒绝（错误码 414，未知错误）。常见原因为【账户余额不足】或工作流不可用，"
                "请前往 RunningHub 控制台查看账户余额后重试。")
    raw = json.dumps(resp, ensure_ascii=False)[:300]
    return "提交任务失败：" + raw

def run_rh_workflow(rh_key, prompt, ratio, scale, count, nodes=RH_NODES, register=None, cancelled=None):
    node_info_list = build_rh_node_list(prompt, ratio, scale, count, nodes)
    if not node_info_list:
        raise RuntimeError("工作流节点映射为空：内置节点配置缺失，请联系开发者修复")
    return submit_and_poll(rh_key, RH_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled)


def submit_and_poll(rh_key, workflow_id, node_info_list, register=None, cancelled=None, timeout=None, queue_name=None):
    """提交 RunningHub 工作流并轮询到完成，返回图片 URL 列表（文生图 / 修脸磨皮共用）。

    cancelled：可选回调 () -> bool，任务被用户删除时返回 True；
    提交重试与轮询循环都会检查，发现取消立即抛错退出，让 worker 释放并发槽。
    timeout：轮询总超时秒数；不传则用 config.rhTimeout（默认 60 分钟，按用户会员等级调整）。
    queue_name：RunningHub 实例模式；传 "Plus" 会映射为 instanceType="plus"（48G 显存）。
                注意：RunningHub 官方字段是 instanceType（"default"=24G / "plus"=48G），
                并非 queueName（历史误用字段，会被后端忽略，导致退回 24G 默认实例）。
                视频生成类工作流必须传 "Plus" 以使用 48G 实例，否则大模型易触发
                VRAM grow failed（805 运行失败）。图片生成模块不传（走 24G 默认）即可。
    """
    if timeout is None:
        timeout = load_rh_timeout()
    create_url = "https://www.runninghub.cn/openapi/v2/run/workflow/" + workflow_id
    submit = {
        "apiKey": rh_key,
        "workflowId": workflow_id,
        "nodeInfoList": node_info_list,
        "addMetadata": True,
        "usePersonalQueue": "false",
    }
    if queue_name:
        # RunningHub 官方字段为 instanceType（非 queueName），取值 "plus"=48G / "default"=24G。
        # 视频生成必须走 plus（48G），否则大模型易触发 VRAM grow failed（805）。
        submit["instanceType"] = queue_name.lower()
    tid = None
    last_resp = None
    for attempt in range(15):
        if cancelled and cancelled():
            raise RuntimeError("任务已取消")
        try:
            last_resp = rh_post(create_url, submit, api_key=rh_key)
        except Exception:
            if attempt < 14:
                time.sleep(min(30, 5 * (attempt + 1)))
                continue
            raise
        if _is_concurrency_limit(last_resp):
            # 并发达上限：等待队列释放后重试同一提交（被拒的任务不会真正入队，不会产生新任务）
            if attempt < 14:
                time.sleep(min(40, 10 * (attempt + 1)))
                continue
            raise RuntimeError("RunningHub 并发数已达上限，请稍后在控制台查看，或降低并发后重试")
        tid = extract_task_id(last_resp)
        if tid:
            if register:
                register(tid, workflow_id)
            break
        if attempt < 14:
            time.sleep(3 * (attempt + 1))
            continue
        raise RuntimeError(_rh_submit_error(last_resp))
    if not tid:
        raise RuntimeError(_rh_submit_error(last_resp))
    # 轮询结果：每 1 秒一次；删除任务后立即感知并退出，不长期占用并发槽
    images = []
    deadline = time.time() + timeout  # 轮询总超时（默认 10 分钟）
    poll_start = time.time()
    while time.time() < deadline:
        if cancelled and cancelled():
            raise RuntimeError("任务已取消")
        time.sleep(1)
        try:
            q = rh_post(RH_QUERY_URL, {"apiKey": rh_key, "taskId": tid}, api_key=rh_key)
        except Exception as e:
            sys.stderr.write("[rh-poll] query exc: %s\n" % e)
            continue
        urls = extract_images(q)
        if urls:
            images.extend(urls)
            break
        if time.time() - poll_start >= 5:
            poll_start = time.time()
            sys.stderr.write("[rh-poll] wf=%s task=%s st=%s raw=%s\n"
                             % (workflow_id, tid, extract_status(q),
                                json.dumps(q, ensure_ascii=False)[:160]))
        st = extract_status(q)
        if st:
            st_u = st.upper()
            if st_u == "CANCELLED" or (
                st_u in ("FAILED", "ERROR")
                and "cancel" in json.dumps(q, ensure_ascii=False).lower()
            ):
                # 用户在 RunningHub 控制台取消了任务 → 前端识别"取消"并自动删除该结果
                raise RuntimeError("任务已在 RunningHub 控制台取消")
            if st_u in ("FAILED", "ERROR"):
                raise RuntimeError("任务失败：" + json.dumps(q, ensure_ascii=False)[:200])
        else:
            # status 为空：RunningHub 控制台取消任务后 query 返回 errorCode=1004「任务不存在/已过期」
            # （而非 CANCELLED 状态）——必须识别，否则 worker 会一直轮询到超时占用并发槽
            raw = json.dumps(q, ensure_ascii=False)
            code = str(q.get("errorCode") or "")
            if code == "1004" or "不存在" in raw or "not found" in raw.lower() or "cancel" in raw.lower():
                raise RuntimeError("任务已在 RunningHub 控制台取消")
            if q.get("errorCode") or q.get("errorMessage"):
                raise RuntimeError("任务失败：" + raw[:200])
    if images:
        return images
    raise RuntimeError("任务超时或未返回图片（约 %d 分钟），请稍后在 RunningHub 控制台查看" % round(timeout / 60))


def submit_and_poll_text(rh_key, workflow_id, node_info_list, register=None, cancelled=None, timeout=None):
    """提交 RunningHub 工作流并轮询，返回 {"images": [], "text": [文本...]}。

    反推提示词专用：工作流产出为 .txt 文本文件，轮询到完成后下载并读取文本内容。
    """
    if timeout is None:
        timeout = load_rh_timeout()
    create_url = "https://www.runninghub.cn/openapi/v2/run/workflow/" + workflow_id
    submit = {
        "apiKey": rh_key,
        "workflowId": workflow_id,
        "nodeInfoList": node_info_list,
        "addMetadata": True,
        "usePersonalQueue": "false",
    }
    tid = None
    last_resp = None
    for attempt in range(15):
        if cancelled and cancelled():
            raise RuntimeError("任务已取消")
        try:
            last_resp = rh_post(create_url, submit, api_key=rh_key)
        except Exception:
            if attempt < 14:
                time.sleep(min(30, 5 * (attempt + 1)))
                continue
            raise
        if _is_concurrency_limit(last_resp):
            if attempt < 14:
                time.sleep(min(40, 10 * (attempt + 1)))
                continue
            raise RuntimeError("RunningHub 并发数已达上限，请稍后在控制台查看，或降低并发后重试")
        tid = extract_task_id(last_resp)
        if tid:
            if register:
                register(tid, workflow_id)
            break
        if attempt < 14:
            time.sleep(3 * (attempt + 1))
            continue
    if not tid:
        raise RuntimeError(_rh_submit_error(last_resp))
    texts = []
    deadline = time.time() + timeout
    poll_start = time.time()
    while time.time() < deadline:
        if cancelled and cancelled():
            raise RuntimeError("任务已取消")
        time.sleep(1)
        try:
            q = rh_post(RH_QUERY_URL, {"apiKey": rh_key, "taskId": tid}, api_key=rh_key)
        except Exception as e:
            sys.stderr.write("[rh-poll-text] query exc: %s\n" % e)
            continue
        texts = extract_texts(q)
        if texts:
            break
        if time.time() - poll_start >= 5:
            poll_start = time.time()
            sys.stderr.write("[rh-poll-text] wf=%s task=%s st=%s raw=%s\n"
                             % (workflow_id, tid, extract_status(q), json.dumps(q, ensure_ascii=False)[:160]))
        st = extract_status(q)
        if st:
            st_u = st.upper()
            if st_u == "CANCELLED" or (
                st_u in ("FAILED", "ERROR")
                and "cancel" in json.dumps(q, ensure_ascii=False).lower()
            ):
                raise RuntimeError("任务已在 RunningHub 控制台取消")
            if st_u in ("FAILED", "ERROR"):
                raise RuntimeError("任务失败：" + json.dumps(q, ensure_ascii=False)[:200])
        else:
            raw = json.dumps(q, ensure_ascii=False)
            code = str(q.get("errorCode") or "")
            if code == "1004" or "不存在" in raw or "not found" in raw.lower() or "cancel" in raw.lower():
                raise RuntimeError("任务已在 RunningHub 控制台取消")
            if q.get("errorCode") or q.get("errorMessage"):
                raise RuntimeError("任务失败：" + raw[:200])
    if texts:
        return {"images": [], "text": texts}
    raise RuntimeError("任务超时或未返回文本结果（约 %d 分钟），请稍后在 RunningHub 控制台查看" % round(timeout / 60))


# ---- 修脸磨皮（图生图工作流）----
# 工作流：https://www.runninghub.cn/post/2091148461554094081
# 上传一张图片 → 工作流「上传图片」节点（nodeId 642）接收 → 修脸磨皮后输出图片
RH_FACE_WORKFLOW_ID = "2091148461554094081"
RH_FACE_UPLOAD_URL = "https://www.runninghub.cn/openapi/v2/media/upload/binary"
RH_FACE_IMAGE_NODE = "642"
RH_FACE_IMAGE_FIELD = "image"  # 默认字段名；提交前用 getJsonApiFormat 动态校正
RH_WORKFLOW_INFO_URL = "https://www.runninghub.cn/api/openapi/getJsonApiFormat"

# 节点字段探测缓存：workflow_id -> (ts, {node_id: [fieldName, ...]})
_rh_node_cache = {}
_rh_node_cache_lock = threading.Lock()
_RH_NODE_CACHE_TTL = 600  # 10 分钟


def get_rh_node_fields(rh_key, workflow_id, node_id):
    """动态探测工作流某节点的可写输入字段名列表；失败返回 None（调用方回退默认值）。"""
    key = str(workflow_id)
    with _rh_node_cache_lock:
        hit = _rh_node_cache.get(key)
        if hit and time.time() - hit[0] < _RH_NODE_CACHE_TTL:
            return hit[1].get(str(node_id))
    try:
        resp = rh_post(RH_WORKFLOW_INFO_URL, {"apiKey": rh_key, "workflowId": workflow_id}, api_key=rh_key)
        prompt = resp.get("data") or {}
        if isinstance(prompt, str):
            prompt = json.loads(prompt)
        if isinstance(prompt, dict) and "prompt" in prompt:
            prompt = prompt["prompt"]
            if isinstance(prompt, str):
                prompt = json.loads(prompt)
        fields = {}
        if isinstance(prompt, dict):
            for nid, node in prompt.items():
                if not isinstance(node, dict):
                    continue
                inputs = node.get("inputs") or {}
                # 排除数组值（表示节点间连线），只保留可写的标量输入端口
                names = [k for k, v in inputs.items() if not isinstance(v, list)]
                if names:
                    fields[str(nid)] = names
        if fields:
            with _rh_node_cache_lock:
                _rh_node_cache[key] = (time.time(), fields)
            return fields.get(str(node_id))
    except Exception as e:
        sys.stderr.write("[rh-probe] getJsonApiFormat failed for wf=%s node=%s: %s\n"
                         % (workflow_id, node_id, e))
        return None
    return None


def rh_upload(rh_key, raw_body, content_type):
    """将前端 multipart body 原样转发到 RunningHub 上传接口，返回 data.fileName（节点引用标识）。"""
    req = urllib.request.Request(RH_FACE_UPLOAD_URL, data=raw_body, method="POST")
    req.add_header("Content-Type", content_type)
    req.add_header("Authorization", "Bearer " + rh_key)
    with urllib.request.urlopen(req, timeout=load_rh_http_timeout()) as resp:
        obj = json.loads(resp.read().decode("utf-8"))
    data = obj.get("data") or {}
    name = data.get("fileName") or data.get("file_name") or ""
    if not name:
        raise RuntimeError("上传图片失败：" + json.dumps(obj, ensure_ascii=False)[:200])
    return name


def run_rh_image_workflow(rh_key, raw_body, content_type, workflow_id, image_node, default_field, register=None, cancelled=None, timeout=None):
    """通用图生图工作流：上传图片 → 提交工作流（指定图片节点）→ 轮询结果（修脸磨皮 / 高清放大 / 多视图共用）。
    timeout 不传则用 config.rhTimeout（默认 60 分钟）。"""
    file_name = rh_upload(rh_key, raw_body, content_type)
    field = default_field
    got = get_rh_node_fields(rh_key, workflow_id, image_node)
    if got:
        field = default_field if default_field in got else got[0]
    node_info_list = [{
        "nodeId": str(image_node),
        "fieldName": field,
        "fieldValue": file_name,
    }]
    return submit_and_poll(rh_key, workflow_id, node_info_list, register=register, cancelled=cancelled, timeout=timeout)


def run_rh_face_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """修脸磨皮：上传图片 → 提交工作流（图片节点 642）→ 轮询结果。"""
    return run_rh_image_workflow(
        rh_key, raw_body, content_type,
        RH_FACE_WORKFLOW_ID, RH_FACE_IMAGE_NODE, RH_FACE_IMAGE_FIELD, register=register, cancelled=cancelled)


# ---- 高清放大（图生图工作流）----
# 工作流：https://www.runninghub.cn/post/2091150179964641282
RH_HD_WORKFLOW_ID = "2091150179964641282"
RH_HD_IMAGE_NODE = "43"
RH_HD_IMAGE_FIELD = "image"


def run_rh_hd_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """高清放大：上传图片 → 提交工作流（图片节点 43）→ 轮询结果。"""
    return run_rh_image_workflow(
        rh_key, raw_body, content_type,
        RH_HD_WORKFLOW_ID, RH_HD_IMAGE_NODE, RH_HD_IMAGE_FIELD, register=register, cancelled=cancelled)


# ---- 动漫转真人（图片 + 缩放 + 标签触发词）----
# 节点：241=上传动漫图(image)、259=缩放值(value)、262=标签触发词(text，6 类英文逗号拼接)
RH_ANI2REAL_WORKFLOW_ID = "2091929488073510913"
RH_ANI2REAL_IMAGE_NODE = "241"
RH_ANI2REAL_IMAGE_FIELD = "image"
RH_ANI2REAL_SCALE_NODE = "259"
RH_ANI2REAL_SCALE_FIELD = "Value"  # 实测：节点 259 输入端口名为大写 Value（2026-08 探测确认）
RH_ANI2REAL_TAGS_NODE = "262"
RH_ANI2REAL_TAGS_FIELD = "text"


def run_rh_ani2real_workflow(
    rh_key, file_bytes, filename, mime, scale, tags,
    register=None, cancelled=None, timeout=None,
):
    """动漫转真人：上传图片到 RH → 提交 3 节点（图片 241 / 缩放 259 / 标签 262）→ 轮询结果。

    file_bytes/filename/mime 来自前端 base64 解码后的图片。
    scale 已由端点层夹紧到 768–2048；tags 为前端 6 个下拉选中值以英文逗号拼接的字符串（可空）。
    """
    boundary = "----RH" + uuid.uuid4().hex
    multipart = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")
    content_type = f"multipart/form-data; boundary={boundary}"
    file_name = rh_upload(rh_key, multipart, content_type)

    # 字段名动态探测（与扩图/文生视频一致）：241/259/262 的端口名以工作流实际定义为准，
    # 避免硬编码字段名因大小写/改名导致 NODE_INFO_MISMATCH。
    def probe(node, default):
        got = get_rh_node_fields(rh_key, RH_ANI2REAL_WORKFLOW_ID, node)
        if got:
            return default if default in got else got[0]
        return default

    node_info_list = [
        {"nodeId": RH_ANI2REAL_IMAGE_NODE, "fieldName": probe(RH_ANI2REAL_IMAGE_NODE, RH_ANI2REAL_IMAGE_FIELD), "fieldValue": file_name},
        {"nodeId": RH_ANI2REAL_SCALE_NODE, "fieldName": probe(RH_ANI2REAL_SCALE_NODE, RH_ANI2REAL_SCALE_FIELD), "fieldValue": str(int(scale))},
        {"nodeId": RH_ANI2REAL_TAGS_NODE,  "fieldName": probe(RH_ANI2REAL_TAGS_NODE,  RH_ANI2REAL_TAGS_FIELD),  "fieldValue": tags or ""},
    ]
    return submit_and_poll(rh_key, RH_ANI2REAL_WORKFLOW_ID, node_info_list,
                           register=register, cancelled=cancelled, timeout=timeout)


# ---- 文生视频（纯文本 + 参数工作流）----
# 工作流：https://www.runninghub.cn/post/2085959960034369537
# 节点 19=提示词(text)、16=生成时长(value)、15=视频比例/缩放系数(aspect_ratio/megapixels)
# 该工作流必须使用 Plus 队列模式（图片生成默认 Standard）。
RH_MV_WORKFLOW_ID = "2085959960034369537"
RH_MV_PROMPT_NODE = "19"
RH_MV_PROMPT_FIELD = "text"
RH_MV_DURATION_NODE = "16"
RH_MV_DURATION_FIELD = "value"
RH_MV_RATIO_NODE = "15"
RH_MV_RATIO_FIELD = "aspect_ratio"
RH_MV_SCALE_FIELD = "megapixels"


def run_rh_mv_workflow(rh_key, body, register=None, cancelled=None):
    """文生视频：提示词 + 生成时长 + 视频比例 + 缩放系数 → 提交 Plus 队列工作流 → 轮询结果。
    body 为已解析的 JSON dict（无文件上传）。"""
    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        raise RuntimeError("请输入提示词")
    try:
        duration = int(float(body.get("duration") or 0))
    except Exception:
        raise RuntimeError("生成时长参数无效（需为整数）")
    if duration < 4 or duration > 15:
        raise RuntimeError("生成时长需在 4-15 秒之间")
    ratio = (body.get("ratio") or "9:16").strip()
    try:
        scale = float(body.get("scale") or 0.5)
    except Exception:
        raise RuntimeError("缩放系数参数无效（需为数字）")
    if scale > 4:
        raise RuntimeError("缩放系数不能超过 4")

    def probe(node, default):
        got = get_rh_node_fields(rh_key, RH_MV_WORKFLOW_ID, node)
        if got:
            return default if default in got else got[0]
        return default

    def probe_text(node, default):
        got = get_rh_node_fields(rh_key, RH_MV_WORKFLOW_ID, node)
        if got:
            for kw in ("text", "prompt", "指令", "输入", "描述", "文字"):
                for f in got:
                    if kw in f.lower():
                        return f
            return default if default in got else got[0]
        return default

    node_info_list = [
        {"nodeId": str(RH_MV_PROMPT_NODE),   "fieldName": probe_text(RH_MV_PROMPT_NODE, RH_MV_PROMPT_FIELD),   "fieldValue": prompt},
        {"nodeId": str(RH_MV_DURATION_NODE), "fieldName": probe(RH_MV_DURATION_NODE, RH_MV_DURATION_FIELD), "fieldValue": str(duration)},
        {"nodeId": str(RH_MV_RATIO_NODE),    "fieldName": probe(RH_MV_RATIO_NODE, RH_MV_RATIO_FIELD),       "fieldValue": normalize_aspect(ratio)},
        {"nodeId": str(RH_MV_RATIO_NODE),    "fieldName": probe(RH_MV_RATIO_NODE, RH_MV_SCALE_FIELD),       "fieldValue": str(scale)},
    ]
    sys.stderr.write("[rh-mv] submit nodeInfoList: %s\n" % json.dumps(node_info_list, ensure_ascii=False))
    return submit_and_poll(rh_key, RH_MV_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled, queue_name="Plus")


# ---- 首帧生视频（首帧参考图 + 文本 + 参数工作流）----
# 工作流：https://www.runninghub.cn/post/2085960023406104577
# 节点 4=参考图(上传)、37=提示词(JjkText.text)、38=分辨率选择器(aspect_ratio+megapixels)、42=生成时长(秒)、56=帧模式(1首帧/2尾帧)
# 与文生视频一致，使用 Plus 队列模式。字段名运行时动态探测，绝不臆测。
RH_FF_WORKFLOW_ID = "2085960023406104577"
RH_FF_IMAGE_NODE = "4"        # 首/尾帧参考图（LoadImage.image）
RH_FF_IMAGE_FIELD = "image"
RH_FF_PROMPT_NODE = "37"      # 提示词（JjkText.text）—— 注意：提示词在节点 37，不在 38
RH_FF_PROMPT_FIELD = "text"
RH_FF_MIX_NODE = "38"         # 分辨率选择器：aspect_ratio + megapixels（+multiple 批次数，保留默认不要覆盖）
RH_FF_RATIO_FIELD = "aspect_ratio"
RH_FF_SCALE_FIELD = "megapixels"
RH_FF_DURATION_NODE = "42"    # 生成时长/秒（DF_Float.Value）
RH_FF_DURATION_FIELD = "value"
RH_FF_FRAME_NODE = "56"      # 帧模式：1=首帧 / 2=尾帧（DF_Integer.Value）
RH_FF_FRAME_FIELD = "Value"

# ---- 首尾帧生视频（首帧图 + 尾帧图 + 文本 + 参数工作流）----
# 工作流：https://www.runninghub.cn/post/2092329310479798273
# 节点 4=首帧参考图(上传)、59=尾帧参考图(上传)、37=提示词(JjkText.text)、
# 38=分辨率选择器(aspect_ratio+megapixels)、42=生成时长(秒)。不传帧模式节点56。
# 与文生视频一致，使用 Plus 队列模式。字段名运行时动态探测，绝不臆测。
RH_BF_WORKFLOW_ID = "2092329310479798273"
RH_BF_FIRST_NODE = "4"        # 首帧参考图（LoadImage.image）
RH_BF_LAST_NODE = "59"        # 尾帧参考图（LoadImage.image）
RH_BF_IMAGE_FIELD = "image"
RH_BF_PROMPT_NODE = "37"      # 提示词（JjkText.text）
RH_BF_PROMPT_FIELD = "text"
RH_BF_MIX_NODE = "38"         # 分辨率选择器：aspect_ratio + megapixels（+multiple 批次数，保留默认不要覆盖）
RH_BF_RATIO_FIELD = "aspect_ratio"
RH_BF_SCALE_FIELD = "megapixels"
RH_BF_DURATION_NODE = "42"    # 生成时长/秒（DF_Float.Value）
RH_BF_DURATION_FIELD = "Value"




def run_rh_frame_workflow(rh_key, raw_body, content_type, frame_mode="1", register=None, cancelled=None):
    """首帧/尾帧生视频通用：参考图(node4) + 提示词(node37) + 比例/缩放(node38) + 生成时长(node42) + 帧模式(node56=1首帧/2尾帧) → Plus 队列 → 轮询。"""
    fields, files = parse_multipart(raw_body, content_type)
    img = files.get("image") or files.get("firstframe") or files.get("lastframe") or files.get("4") or files.get("file")
    if not img:
        raise RuntimeError("请上传参考图片（节点 4）")
    fname, data, mime = img
    fn = rh_upload_bytes(rh_key, data, fname, mime)

    prompt = (fields.get("prompt") or "").strip()
    if not prompt:
        raise RuntimeError("请输入提示词")
    try:
        duration = int(float(fields.get("duration") or 0))
    except Exception:
        raise RuntimeError("生成时长参数无效（需为整数）")
    if duration < 4 or duration > 15:
        raise RuntimeError("生成时长需在 4-15 秒之间")
    ratio = (fields.get("ratio") or "9:16").strip()
    try:
        scale = float(fields.get("scale") or 0.5)
    except Exception:
        raise RuntimeError("缩放系数参数无效（需为数字）")
    if scale > 4:
        raise RuntimeError("缩放系数不能超过 4")

    # 动态探测真实字段名（绝不臆测）。
    # 节点分工：4=参考图(image)；37=提示词(JjkText.text)；
    # 38=分辨率选择器(aspect_ratio+megapixels+multiple，只取前两个，multiple 是批次数保留默认)；
    # 42=时长(DF_Float.Value)；56=帧模式(DF_Integer.Value)。
    f4 = get_rh_node_fields(rh_key, RH_FF_WORKFLOW_ID, RH_FF_IMAGE_NODE) or []
    f37 = get_rh_node_fields(rh_key, RH_FF_WORKFLOW_ID, RH_FF_PROMPT_NODE) or []
    f38 = get_rh_node_fields(rh_key, RH_FF_WORKFLOW_ID, RH_FF_MIX_NODE) or []
    f42 = get_rh_node_fields(rh_key, RH_FF_WORKFLOW_ID, RH_FF_DURATION_NODE) or []
    f56 = get_rh_node_fields(rh_key, RH_FF_WORKFLOW_ID, RH_FF_FRAME_NODE) or []
    sys.stderr.write("[rh-ff] probe fields: f4=%s f37=%s f38=%s f42=%s f56=%s\n" % (f4, f37, f38, f42, f56))

    def _pick_distinct(keywords, pool):
        for kw in keywords:
            for f in list(pool):
                if kw in f.lower():
                    pool.remove(f)
                    return f
        return None

    # 提示词来自节点 37（JjkText），字段通常为 text
    prompt_f = _pick_distinct(("text", "prompt", "positive", "指令", "输入", "描述", "文字", "clip"), list(f37)) or RH_FF_PROMPT_FIELD

    # 节点 38 仅取比例 / 缩放（不再把提示词错写进 multiple）
    pool38 = list(f38)
    ratio_f = _pick_distinct(("aspect", "ratio", "比例", "resolution", "分辨率"), pool38) or RH_FF_RATIO_FIELD
    scale_f = _pick_distinct(("megapixel", "scale", "缩放", "系数", "mp"), pool38) or RH_FF_SCALE_FIELD

    image_field = RH_FF_IMAGE_FIELD if RH_FF_IMAGE_FIELD in f4 else (f4[0] if f4 else RH_FF_IMAGE_FIELD)

    dur_field = None
    for kw in ("duration", "秒", "second", "time", "value"):
        for f in f42:
            if kw in f.lower():
                dur_field = f
                break
        if dur_field:
            break
    if not dur_field:
        dur_field = RH_FF_DURATION_FIELD if RH_FF_DURATION_FIELD in f42 else (f42[0] if f42 else RH_FF_DURATION_FIELD)

    frame_field = None
    for kw in ("mode", "frame", "首", "尾", "type", "value", "number", "int", "seed", "index"):
        for f in f56:
            if kw in f.lower():
                frame_field = f
                break
        if frame_field:
            break
    if not frame_field:
        frame_field = RH_FF_FRAME_FIELD if RH_FF_FRAME_FIELD in f56 else (f56[0] if f56 else RH_FF_FRAME_FIELD)

    node_info_list = [
        {"nodeId": str(RH_FF_IMAGE_NODE),   "fieldName": image_field,  "fieldValue": fn},
        {"nodeId": str(RH_FF_PROMPT_NODE),  "fieldName": prompt_f,     "fieldValue": prompt},
        {"nodeId": str(RH_FF_MIX_NODE),     "fieldName": ratio_f,      "fieldValue": normalize_aspect(ratio)},
        {"nodeId": str(RH_FF_MIX_NODE),     "fieldName": scale_f,      "fieldValue": str(scale)},
        {"nodeId": str(RH_FF_DURATION_NODE),"fieldName": dur_field,    "fieldValue": str(duration)},
        {"nodeId": str(RH_FF_FRAME_NODE),   "fieldName": frame_field,  "fieldValue": str(frame_mode)},
    ]
    sys.stderr.write("[rh-ff] submit nodeInfoList: %s\n" % json.dumps(node_info_list, ensure_ascii=False))
    return submit_and_poll(rh_key, RH_FF_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled, queue_name="Plus")


def run_rh_firstframe_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """首帧生视频：帧模式=1（节点56）。"""
    return run_rh_frame_workflow(rh_key, raw_body, content_type, frame_mode="1", register=register, cancelled=cancelled)


def run_rh_lastframe_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """尾帧生视频：帧模式=2（节点56），UI 与首帧完全一致。"""
    return run_rh_frame_workflow(rh_key, raw_body, content_type, frame_mode="2", register=register, cancelled=cancelled)


def _rh_pick_field(keywords, pool):
    """从候选字段名池中按关键词优先级取第一个命中项；命中即从池中移除，避免重复占用。"""
    for kw in keywords:
        for f in list(pool):
            if kw in f.lower():
                pool.remove(f)
                return f
    return None


def run_rh_bothframe_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """首尾帧生视频：首帧参考图(node4) + 尾帧参考图(node59) + 提示词(node37) + 比例/缩放(node38) + 生成时长(node42) → Plus 队列 → 轮询。不传帧模式节点56。"""
    fields, files = parse_multipart(raw_body, content_type)
    first = files.get("firstframe") or files.get("image") or files.get("4") or files.get("file")
    last = files.get("lastframe") or files.get("59") or files.get("lastframe_image")
    if not first:
        raise RuntimeError("请上传首帧参考图片（节点 4）")
    if not last:
        raise RuntimeError("请上传尾帧参考图片（节点 59）")
    fn_first, data_first, mime_first = first
    fn_last, data_last, mime_last = last
    first_name = rh_upload_bytes(rh_key, data_first, fn_first, mime_first)
    last_name = rh_upload_bytes(rh_key, data_last, fn_last, mime_last)

    prompt = (fields.get("prompt") or "").strip()
    if not prompt:
        raise RuntimeError("请输入提示词")
    try:
        duration = int(float(fields.get("duration") or 0))
    except Exception:
        raise RuntimeError("生成时长参数无效（需为整数）")
    if duration < 4 or duration > 15:
        raise RuntimeError("生成时长需在 4-15 秒之间")
    ratio = (fields.get("ratio") or "9:16").strip()
    try:
        scale = float(fields.get("scale") or 0.5)
    except Exception:
        raise RuntimeError("缩放系数参数无效（需为数字）")
    if scale > 4:
        raise RuntimeError("缩放系数不能超过 4")

    # 动态探测真实字段名（绝不臆测）。
    # 节点分工：4=首帧图(image)；59=尾帧图(image)；37=提示词(JjkText.text)；
    # 38=分辨率选择器(aspect_ratio+megapixels+multiple，只取前两个，multiple 是批次数保留默认)；42=时长(DF_Float.Value)。
    f4 = get_rh_node_fields(rh_key, RH_BF_WORKFLOW_ID, RH_BF_FIRST_NODE) or []
    f59 = get_rh_node_fields(rh_key, RH_BF_WORKFLOW_ID, RH_BF_LAST_NODE) or []
    f37 = get_rh_node_fields(rh_key, RH_BF_WORKFLOW_ID, RH_BF_PROMPT_NODE) or []
    f38 = get_rh_node_fields(rh_key, RH_BF_WORKFLOW_ID, RH_BF_MIX_NODE) or []
    f42 = get_rh_node_fields(rh_key, RH_BF_WORKFLOW_ID, RH_BF_DURATION_NODE) or []
    sys.stderr.write("[rh-bf] probe fields: f4=%s f59=%s f37=%s f38=%s f42=%s\n" % (f4, f59, f37, f38, f42))

    first_image_field = RH_BF_IMAGE_FIELD if RH_BF_IMAGE_FIELD in f4 else (f4[0] if f4 else RH_BF_IMAGE_FIELD)
    last_image_field = RH_BF_IMAGE_FIELD if RH_BF_IMAGE_FIELD in f59 else (f59[0] if f59 else RH_BF_IMAGE_FIELD)

    prompt_f = _rh_pick_field(("text", "prompt", "positive", "指令", "输入", "描述", "文字", "clip"), list(f37)) or RH_BF_PROMPT_FIELD

    pool38 = list(f38)
    ratio_f = _rh_pick_field(("aspect", "ratio", "比例", "resolution", "分辨率"), pool38) or RH_BF_RATIO_FIELD
    scale_f = _rh_pick_field(("megapixel", "scale", "缩放", "系数", "mp"), pool38) or RH_BF_SCALE_FIELD

    dur_field = None
    for kw in ("duration", "秒", "second", "time", "value"):
        for f in f42:
            if kw in f.lower():
                dur_field = f
                break
        if dur_field:
            break
    if not dur_field:
        dur_field = RH_BF_DURATION_FIELD if RH_BF_DURATION_FIELD in f42 else (f42[0] if f42 else RH_BF_DURATION_FIELD)

    node_info_list = [
        {"nodeId": str(RH_BF_FIRST_NODE), "fieldName": first_image_field, "fieldValue": first_name},
        {"nodeId": str(RH_BF_LAST_NODE),  "fieldName": last_image_field,  "fieldValue": last_name},
        {"nodeId": str(RH_BF_PROMPT_NODE), "fieldName": prompt_f, "fieldValue": prompt},
        {"nodeId": str(RH_BF_MIX_NODE),   "fieldName": ratio_f, "fieldValue": normalize_aspect(ratio)},
        {"nodeId": str(RH_BF_MIX_NODE),   "fieldName": scale_f, "fieldValue": str(scale)},
        {"nodeId": str(RH_BF_DURATION_NODE), "fieldName": dur_field, "fieldValue": str(duration)},
    ]
    sys.stderr.write("[rh-bf] submit nodeInfoList: %s\n" % json.dumps(node_info_list, ensure_ascii=False))
    return submit_and_poll(rh_key, RH_BF_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled, queue_name="Plus")


# ---- 全能参考双模双采生视频（原「多图参考生视频」，MiniMax H3 资源面板）----
# 工作流：https://www.runninghub.cn/post/2090375516497997826
# 节点 300 = 媒体资源（MiniMaxH3MediaLoaderFantastic.media_state，JSON 字符串）
#            —— 唯一上传入口，图片/视频/音频全部走这一个节点
#      115 = 分辨率选择器（aspect_ratio + megapixels）
#      132 = 生成时长（value，秒）
#      175 = 提示词（CR Prompt Text）
# ⚠️ 本工作流共 47 个节点，最小编号为 115，**不存在 #39**。
#    #39 是 ff/bf 工作流的 ImageResizeKJv2 内部预处理节点（image 连自 #4、宽高连自 #38，无外部可填字段），
#    与本工作流无关，禁止在 nodeInfoList 中提交 #39。
RH_MR_WORKFLOW_ID = "2090375516497997826"
RH_MR_MEDIA_NODE = "300"
RH_MR_MEDIA_FIELD = "media_state"
RH_MR_MIX_NODE = "115"
RH_MR_RATIO_FIELD = "aspect_ratio"
RH_MR_SCALE_FIELD = "megapixels"
RH_MR_DURATION_NODE = "132"
RH_MR_DURATION_FIELD = "value"
RH_MR_PROMPT_NODE = "175"


def run_rh_mr_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """全能参考双模双采生视频：MiniMax H3 资源面板 → 节点 #300(media_state) + 时长 + 比例/缩放 + 提示词 → Plus 队列 → 轮询。"""
    fields, files = parse_multipart(raw_body, content_type)
    media_state = (fields.get("media_state") or "").strip()
    if not media_state:
        raise RuntimeError("请先上传媒体资源并生成 media_state（节点 300）")
    try:
        media_items = json.loads(media_state)
        if not isinstance(media_items, list) or len(media_items) < 1:
            raise RuntimeError("media_state 至少需包含 1 个媒体资源")
    except Exception as e:
        raise RuntimeError("media_state JSON 解析失败：" + str(e)[:200])

    prompt = (fields.get("prompt") or "").strip()
    if not prompt:
        raise RuntimeError("请输入提示词（节点 175）")
    try:
        duration = int(float(fields.get("duration") or 0))
    except Exception:
        raise RuntimeError("生成时长参数无效（需为整数）")
    if duration < 4 or duration > 15:
        raise RuntimeError("生成时长需在 4-15 秒之间")
    ratio = (fields.get("ratio") or "9:16").strip()
    try:
        scale = float(fields.get("scale") or 0.5)
    except Exception:
        raise RuntimeError("缩放系数参数无效（需为数字）")

    # 动态探测真实字段名（绝不臆测）
    f300 = get_rh_node_fields(rh_key, RH_MR_WORKFLOW_ID, RH_MR_MEDIA_NODE) or []
    f132 = get_rh_node_fields(rh_key, RH_MR_WORKFLOW_ID, RH_MR_DURATION_NODE) or []
    f115 = get_rh_node_fields(rh_key, RH_MR_WORKFLOW_ID, RH_MR_MIX_NODE) or []
    f175 = get_rh_node_fields(rh_key, RH_MR_WORKFLOW_ID, RH_MR_PROMPT_NODE) or []
    sys.stderr.write("[rh-mr] probe: f300=%s f132=%s f115=%s f175=%s\n"
                     % (f300, f132, f115, f175))

    media_f = RH_MR_MEDIA_FIELD if RH_MR_MEDIA_FIELD in f300 else (f300[0] if f300 else RH_MR_MEDIA_FIELD)
    def _text_field(f):
        return _rh_pick_field(("text", "prompt", "positive", "指令", "输入", "描述", "文字", "clip"), list(f)) or (f[0] if f else "text")

    prompt_f = _text_field(f175)

    pool115 = list(f115)
    ratio_f = _rh_pick_field(("aspect", "ratio", "比例", "resolution", "分辨率"), pool115) or RH_MR_RATIO_FIELD
    scale_f = _rh_pick_field(("megapixel", "scale", "缩放", "系数", "mp"), pool115) or RH_MR_SCALE_FIELD

    dur_f = None
    for kw in ("duration", "秒", "second", "time", "value"):
        for f in f132:
            if kw in f.lower():
                dur_f = f
                break
        if dur_f:
            break
    if not dur_f:
        dur_f = (f132[0] if f132 else RH_MR_DURATION_FIELD)

    node_info_list = [
        {"nodeId": RH_MR_MEDIA_NODE, "fieldName": media_f, "fieldValue": media_state},
        {"nodeId": RH_MR_MIX_NODE, "fieldName": ratio_f, "fieldValue": normalize_aspect(ratio)},
        {"nodeId": RH_MR_MIX_NODE, "fieldName": scale_f, "fieldValue": str(scale)},
        {"nodeId": RH_MR_DURATION_NODE, "fieldName": dur_f, "fieldValue": str(duration)},
        {"nodeId": RH_MR_PROMPT_NODE, "fieldName": prompt_f, "fieldValue": prompt},
    ]

    sys.stderr.write("[rh-mr] submit nodeInfoList: %s\n" % json.dumps(node_info_list, ensure_ascii=False))
    return submit_and_poll(rh_key, RH_MR_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled, queue_name="Plus")




# ---- 扩图（图生图工作流）----
# 工作流：https://www.runninghub.cn/post/2091453572989935617
# 节点 521=上传图片、525=文本提示词、526=扩图像素（left/top/right/bottom）
RH_EX_WORKFLOW_ID = "2091453572989935617"
RH_EX_IMAGE_NODE = "521"      # 上传图片（Load Image）
RH_EX_IMAGE_FIELD = "image"
RH_EX_PROMPT_NODE = "525"     # 文本提示词（Set_Prompt）
RH_EX_PROMPT_FIELD = "Prompt"  # Set_Prompt 节点的常量端口名为 Prompt
RH_EX_PAD_NODE = "526"        # 扩图像素（Image Pad For Outpaint Masked）
# 526 的 left/top/right/bottom 是确定字段名（截图已确认），不动态探测


def run_rh_ex_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """扩图：上传图片 + 提示词 + left/top/right/bottom 像素 → 提交工作流 → 轮询结果。
    prompt 为空时使用默认：将图片的空白区域补充内容，保持一致性。"""
    fields, files = parse_multipart(raw_body, content_type)
    if not files.get("file"):
        raise RuntimeError("请上传一张图片")
    prompt = (fields.get("prompt") or "").strip() or "将图片的空白区域补充内容，保持一致性"
    try:
        left   = int(float(fields.get("left",   0) or 0))
        top    = int(float(fields.get("top",    0) or 0))
        right  = int(float(fields.get("right",  0) or 0))
        bottom = int(float(fields.get("bottom", 0) or 0))
    except Exception:
        raise RuntimeError("扩图像素值参数无效（需为整数）")
    fname, data, mime = files["file"]
    file_name = rh_upload_bytes(rh_key, data, fname, mime)
    # 字段名动态探测（带缓存）：上传图片节点 + 文本节点；526 的 left/top/right/bottom 是确定名
    def probe(node, default):
        got = get_rh_node_fields(rh_key, RH_EX_WORKFLOW_ID, node)
        if got:
            return default if default in got else got[0]
        return default
    node_info_list = [
        {"nodeId": str(RH_EX_IMAGE_NODE),  "fieldName": probe(RH_EX_IMAGE_NODE,  RH_EX_IMAGE_FIELD),  "fieldValue": file_name},
        {"nodeId": str(RH_EX_PROMPT_NODE), "fieldName": probe(RH_EX_PROMPT_NODE, RH_EX_PROMPT_FIELD), "fieldValue": "去掉绿色部分"},
    ]
    for f, v in (("left", left), ("top", top), ("right", right), ("bottom", bottom)):
        node_info_list.append({
            "nodeId": str(RH_EX_PAD_NODE), "fieldName": f, "fieldValue": str(v),
        })
    return submit_and_poll(rh_key, RH_EX_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled)


# ---- 单图指令编辑（图生图工作流）----
# 工作流：https://www.runninghub.cn/post/2091606640134017026
# 节点 76=上传图片、109=描述词指令（文本）
RH_IE_WORKFLOW_ID = "2091606640134017026"
RH_IE_IMAGE_NODE = "76"
RH_IE_IMAGE_FIELD = "image"
RH_IE_TEXT_NODE = "109"
RH_IE_TEXT_FIELD = "text"


def run_rh_instruct_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """单图指令编辑：上传图片 + 描述词指令 → 提交工作流（图片节点 76 / 指令节点 109）→ 轮询结果。"""
    fields, files = parse_multipart(raw_body, content_type)
    if not files.get("file"):
        raise RuntimeError("请上传一张图片")
    prompt = (fields.get("prompt") or "").strip()
    if not prompt:
        raise RuntimeError("请输入描述词指令")
    if len(prompt) > 1000:
        raise RuntimeError("描述词指令过长（上限 1000 字）")
    fname, data, mime = files["file"]
    file_name = rh_upload_bytes(rh_key, data, fname, mime)

    def probe(node, default):
        got = get_rh_node_fields(rh_key, RH_IE_WORKFLOW_ID, node)
        if got:
            return default if default in got else got[0]
        return default

    # 文本指令节点 109：优先匹配文本类端口名，避免臆测字段名
    def probe_text(node, default):
        got = get_rh_node_fields(rh_key, RH_IE_WORKFLOW_ID, node)
        if not got:
            return default
        for kw in ("text", "prompt", "指令", "输入", "描述", "文字"):
            for f in got:
                if kw.lower() in f.lower():
                    return f
        return got[0]

    node_info_list = [
        {"nodeId": str(RH_IE_IMAGE_NODE), "fieldName": probe(RH_IE_IMAGE_NODE, RH_IE_IMAGE_FIELD), "fieldValue": file_name},
        {"nodeId": str(RH_IE_TEXT_NODE),  "fieldName": probe_text(RH_IE_TEXT_NODE, RH_IE_TEXT_FIELD), "fieldValue": prompt},
    ]
    return submit_and_poll(rh_key, RH_IE_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled)




# ---- 反推提示词（图片 / 视频反推工作流）----
# 图片反推工作流：https://www.runninghub.cn/post/2092163863813906434
# 节点 6 = 上传图片；工作流产出为 .txt 文本文件（反推得到的提示词）
RH_REVIMG_WORKFLOW_ID = "2092163863813906434"
RH_REVIMG_NODE = "6"
RH_REVIMG_FIELD = "image"            # 默认字段名；提交前用 getJsonApiFormat 动态校正
# 视频反推工作流：用户提供的独立视频工作流
# 节点 22 = 上传视频；工作流产出为 .txt 文本文件（反推得到的提示词）
RH_REVVIDEO_WORKFLOW_ID = "2092180296031625218"
RH_REVVIDEO_NODE = "22"
RH_REVVIDEO_FIELD = "video"          # 默认字段名；提交前用 getJsonApiFormat 动态校正


def run_rh_reverse_workflow(rh_key, raw_body, content_type, workflow_id, node, default_field, file_kind, register=None, cancelled=None):
    """反推提示词：上传图片/视频（节点 node）→ 提交工作流 → 轮询 → 读取 .txt 文本结果。"""
    fields, files = parse_multipart(raw_body, content_type)
    if not files.get("file"):
        raise RuntimeError("请上传" + ("视频" if file_kind == "video" else "图片"))
    fname, data, mime = files["file"]
    file_name = rh_upload_bytes(rh_key, data, fname, mime)

    def probe(n, default):
        got = get_rh_node_fields(rh_key, workflow_id, n)
        if got:
            # 优先匹配与文件类型相关的字段名，避免臆测字段名
            if file_kind == "video":
                for f in got:
                    if "video" in f.lower() or "视频" in f:
                        return f
            for f in got:
                if "image" in f.lower() or "图" in f:
                    return f
            return default if default in got else got[0]
        return default

    node_info_list = [
        {"nodeId": str(node), "fieldName": probe(node, default_field), "fieldValue": file_name},
    ]
    return submit_and_poll_text(rh_key, workflow_id, node_info_list, register=register, cancelled=cancelled)


def run_rh_revimg_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    return run_rh_reverse_workflow(rh_key, raw_body, content_type, RH_REVIMG_WORKFLOW_ID, RH_REVIMG_NODE, RH_REVIMG_FIELD, "image", register=register, cancelled=cancelled)


def run_rh_revvideo_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    return run_rh_reverse_workflow(rh_key, raw_body, content_type, RH_REVVIDEO_WORKFLOW_ID, RH_REVVIDEO_NODE, RH_REVVIDEO_FIELD, "video", register=register, cancelled=cancelled)


# ---- 图片洗稿（上传真实人像 → 重绘风格，工作流 2092246175167635458）----
# 节点 270 = 上传图片；节点 267 = 图片比例(aspect_ratio) + 缩放系数(megapixels)；节点 272 = 生成张数
RH_IMGREWRITE_WORKFLOW_ID = "2092246175167635458"
RH_IMGREWRITE_IMAGE_NODE = "270"
RH_IMGREWRITE_IMAGE_FIELD = "image"          # 默认字段名；提交前用 get_rh_node_fields 动态校正
RH_IMGREWRITE_RATIO_NODE = "267"             # 图片比例 + 缩放系数 同属此节点（两个不同字段）
RH_IMGREWRITE_RATIO_FIELD = "aspect_ratio"
RH_IMGREWRITE_SCALE_FIELD = "megapixels"
RH_IMGREWRITE_COUNT_NODE = "272"
RH_IMGREWRITE_COUNT_FIELD = "Value"          # 节点 272 真实字段名（已探测确认）；提交前用 get_rh_node_fields 动态校正
# 洗图针对真实人像摄影：提示文案固定，仅供结果展示区分
RH_IMGREWRITE_LABEL = "图片洗稿"

# 人像摄影：输入提示词（节点 274）代替上传图片；比例+缩放同属节点 267；张数节点 272
RH_PORTRAIT_WORKFLOW_ID = "2092266903032131585"
RH_PORTRAIT_PROMPT_NODE = "274"
RH_PORTRAIT_PROMPT_FIELD = "text"            # 节点 274（Text）真实字段名（已探测确认）
RH_PORTRAIT_RATIO_NODE = "267"               # 图片比例 + 缩放系数 同属此节点（两个不同字段）
RH_PORTRAIT_RATIO_FIELD = "aspect_ratio"
RH_PORTRAIT_SCALE_FIELD = "megapixels"
RH_PORTRAIT_COUNT_NODE = "272"
RH_PORTRAIT_COUNT_FIELD = "Value"            # 节点 272 真实字段名（已探测确认）
RH_PORTRAIT_LABEL = "人像摄影"


def run_rh_imgrewrite_workflow(rh_key, file_bytes, filename, mime, ratio, scale, count, register=None, cancelled=None):
    """图片洗稿：上传真实人像到节点 270 → 节点 267（比例+缩放）→ 节点 272（张数）→ 轮询结果。"""
    boundary = "----RH" + uuid.uuid4().hex
    multipart = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")
    content_type = f"multipart/form-data; boundary={boundary}"
    file_name = rh_upload(rh_key, multipart, content_type)

    def first(fields, *keys, default):
        for k in keys:
            for f in fields:
                if k.lower() in f.lower():
                    return f
        if fields:
            return default if default in fields else fields[0]
        return default

    img_fields = get_rh_node_fields(rh_key, RH_IMGREWRITE_WORKFLOW_ID, RH_IMGREWRITE_IMAGE_NODE) or []
    img_field = first(img_fields, "image", "图", default=RH_IMGREWRITE_IMAGE_FIELD)
    n267 = get_rh_node_fields(rh_key, RH_IMGREWRITE_WORKFLOW_ID, RH_IMGREWRITE_RATIO_NODE) or []
    ratio_field = first(n267, "aspect", "ratio", "比例", default=RH_IMGREWRITE_RATIO_FIELD)
    scale_field = first(n267, "megapixel", "mp", "scale", "缩放", default=RH_IMGREWRITE_SCALE_FIELD)
    count_fields = get_rh_node_fields(rh_key, RH_IMGREWRITE_WORKFLOW_ID, RH_IMGREWRITE_COUNT_NODE) or []
    count_field = first(count_fields, "value", "num", "count", "张数", default=RH_IMGREWRITE_COUNT_FIELD)

    node_info_list = [
        {"nodeId": RH_IMGREWRITE_IMAGE_NODE, "fieldName": img_field, "fieldValue": file_name},
        {"nodeId": RH_IMGREWRITE_RATIO_NODE, "fieldName": ratio_field, "fieldValue": normalize_aspect(ratio)},
        {"nodeId": RH_IMGREWRITE_RATIO_NODE, "fieldName": scale_field, "fieldValue": str(float(scale))},
        {"nodeId": RH_IMGREWRITE_COUNT_NODE, "fieldName": count_field, "fieldValue": str(int(count))},
    ]
    sys.stderr.write("[rh-imgrewrite] nodeInfoList: %s\n" % json.dumps(node_info_list, ensure_ascii=False))
    return submit_and_poll(rh_key, RH_IMGREWRITE_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled)


def run_rh_portrait_workflow(rh_key, prompt, ratio, scale, count, register=None, cancelled=None):
    """人像摄影：输入提示词（节点 274）→ 节点 267（比例+缩放）→ 节点 272（张数）→ 轮询结果。

    与图片洗稿结构一致，仅把「上传真实人像图片（节点 270）」替换为「文本提示词（节点 274）」，
    提示词支持中文 / 英文描述。
    """
    def first(fields, *keys, default):
        for k in keys:
            for f in fields:
                if k.lower() in f.lower():
                    return f
        if fields:
            return default if default in fields else fields[0]
        return default

    n274 = get_rh_node_fields(rh_key, RH_PORTRAIT_WORKFLOW_ID, RH_PORTRAIT_PROMPT_NODE) or []
    prompt_field = first(n274, "text", "prompt", "提示词", default=RH_PORTRAIT_PROMPT_FIELD)
    n267 = get_rh_node_fields(rh_key, RH_PORTRAIT_WORKFLOW_ID, RH_PORTRAIT_RATIO_NODE) or []
    ratio_field = first(n267, "aspect", "ratio", "比例", default=RH_PORTRAIT_RATIO_FIELD)
    scale_field = first(n267, "megapixel", "mp", "scale", "缩放", default=RH_PORTRAIT_SCALE_FIELD)
    count_fields = get_rh_node_fields(rh_key, RH_PORTRAIT_WORKFLOW_ID, RH_PORTRAIT_COUNT_NODE) or []
    count_field = first(count_fields, "value", "num", "count", "张数", default=RH_PORTRAIT_COUNT_FIELD)

    node_info_list = [
        {"nodeId": RH_PORTRAIT_PROMPT_NODE, "fieldName": prompt_field, "fieldValue": prompt},
        {"nodeId": RH_PORTRAIT_RATIO_NODE, "fieldName": ratio_field, "fieldValue": normalize_aspect(ratio)},
        {"nodeId": RH_PORTRAIT_RATIO_NODE, "fieldName": scale_field, "fieldValue": str(float(scale))},
        {"nodeId": RH_PORTRAIT_COUNT_NODE, "fieldName": count_field, "fieldValue": str(int(count))},
    ]
    sys.stderr.write("[rh-portrait] nodeInfoList: %s\n" % json.dumps(node_info_list, ensure_ascii=False))
    return submit_and_poll(rh_key, RH_PORTRAIT_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled)


# ---- 姿势迁移（图生图工作流，双图输入）----
# 工作流：https://www.runninghub.cn/post/2091474803222990849
# 节点 20=人物图片、节点 1=姿势参考图
RH_POSE_WORKFLOW_ID = "2091474803222990849"
RH_POSE_PERSON_NODE = "20"     # 人物图片
RH_POSE_POSE_NODE = "1"        # 姿势参考图
RH_POSE_IMAGE_FIELD = "image"


def run_rh_pose_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """姿势迁移：上传人物图片（节点 20）+ 姿势参考图（节点 1）→ 提交工作流 → 轮询结果。"""
    fields, files = parse_multipart(raw_body, content_type)
    person = files.get("person") or files.get("20")
    pose = files.get("pose") or files.get("1")
    if not person or not pose:
        raise RuntimeError("请上传人物图片与姿势参考图")

    def probe(node, default):
        got = get_rh_node_fields(rh_key, RH_POSE_WORKFLOW_ID, node)
        if got:
            return default if default in got else got[0]
        return default

    node_info_list = [
        {"nodeId": str(RH_POSE_PERSON_NODE),
         "fieldName": probe(RH_POSE_PERSON_NODE, RH_POSE_IMAGE_FIELD),
         "fieldValue": rh_upload_bytes(rh_key, person[1], person[0], person[2])},
        {"nodeId": str(RH_POSE_POSE_NODE),
         "fieldName": probe(RH_POSE_POSE_NODE, RH_POSE_IMAGE_FIELD),
         "fieldValue": rh_upload_bytes(rh_key, pose[1], pose[0], pose[2])},
    ]
    return submit_and_poll(rh_key, RH_POSE_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled)


# ---- 换脸（图生图工作流，双图输入；图片编辑 · 三级分类）----
# 工作流：https://www.runninghub.cn/post/2091497289591377922
# 节点 99=人物图片、节点 98=人脸图片
RH_FS_WORKFLOW_ID = "2091497289591377922"
RH_FS_PERSON_NODE = "99"      # 人物图片
RH_FS_FACE_NODE = "98"        # 人脸图片
RH_FS_IMAGE_FIELD = "image"


def run_rh_faceswap_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """换脸：上传人物图片（节点 99）+ 人脸图片（节点 98）→ 提交工作流 → 轮询结果。"""
    fields, files = parse_multipart(raw_body, content_type)
    person = files.get("person") or files.get("99")
    face = files.get("face") or files.get("98")
    if not person or not face:
        raise RuntimeError("请上传人物图片与人脸图片")

    def probe(node, default):
        got = get_rh_node_fields(rh_key, RH_FS_WORKFLOW_ID, node)
        if got:
            return default if default in got else got[0]
        return default

    node_info_list = [
        {"nodeId": str(RH_FS_PERSON_NODE),
         "fieldName": probe(RH_FS_PERSON_NODE, RH_FS_IMAGE_FIELD),
         "fieldValue": rh_upload_bytes(rh_key, person[1], person[0], person[2])},
        {"nodeId": str(RH_FS_FACE_NODE),
         "fieldName": probe(RH_FS_FACE_NODE, RH_FS_IMAGE_FIELD),
         "fieldValue": rh_upload_bytes(rh_key, face[1], face[0], face[2])},
    ]
    return submit_and_poll(rh_key, RH_FS_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled)


# ---- 音色克隆（声音生成 · 一级菜单 · 声音生成下二级分类，先开发）----
# 工作流：https://www.runninghub.cn/post/2091508862775025666
# 节点 4 = Load Audio（音频文件；端口字段名按截图是 AUDIO），节点 11 = CR Text (兼容文本)
RH_VC_WORKFLOW_ID = "2091508862775025666"
RH_VC_AUDIO_NODE = "4"           # Load Audio
RH_VC_AUDIO_FIELD = "AUDIO"      # 节点端口名（截图）；探测会校验
RH_VC_TEXT_NODE = "11"           # CR Text (兼容文本)
RH_VC_TEXT_FIELD = "text"


def run_rh_voice_clone_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """音色克隆：上传一段音频（节点 4）+ 输入文字（节点 11）→ 提交 → 轮询音频结果 URL。"""
    fields, files = parse_multipart(raw_body, content_type)
    audio = files.get("audio") or files.get("4")
    text = (fields.get("text") or "").strip()
    if not audio:
        raise RuntimeError("请上传需要克隆的音频（节点 4）")
    if not text:
        raise RuntimeError("请输入要合成的文字内容（节点 11）")

    fname, data, mime = audio
    # 上传音频
    file_name = rh_upload_bytes(rh_key, data, fname, mime)

    # 字段名动态探测（带缓存）
    def probe(node, default):
        got = get_rh_node_fields(rh_key, RH_VC_WORKFLOW_ID, node)
        if got:
            return default if default in got else got[0]
        return default

    node_info_list = [
        {"nodeId": str(RH_VC_AUDIO_NODE),
         "fieldName": probe(RH_VC_AUDIO_NODE, RH_VC_AUDIO_FIELD),
         "fieldValue": file_name},
        {"nodeId": str(RH_VC_TEXT_NODE),
         "fieldName": probe(RH_VC_TEXT_NODE, RH_VC_TEXT_FIELD),
         "fieldValue": text},
    ]
    return submit_and_poll(rh_key, RH_VC_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled)


# ---- 三人对话（声音生成 · 二级分类）----
# 工作流：https://www.runninghub.cn/post/2091511273379950594
# 节点 18/19/20 = Load Audio（角色1/2/3 参考音频），节点 45 = YC text box（多角色对话文本）
RH_TD_WORKFLOW_ID = "2091511273379950594"
RH_TD_ROLE_NODES = ("18", "19", "20")        # 角色1/2/3 音频
RH_TD_AUDIO_FIELD = "AUDIO"                  # Load Audio 端口名（探测会校验）
RH_TD_TEXT_NODE = "45"                       # YC text box
RH_TD_TEXT_FIELD = "text"


def run_rh_tri_dialogue_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """三人对话：上传 3 个参考音频（节点 18/19/20）+ 输入多角色对话文本（节点 45）→ 提交 → 轮询结果。"""
    fields, files = parse_multipart(raw_body, content_type)
    # 收集三段音频，缺失任何一段即报错
    audio_keys = ("audio1", "audio2", "audio3")
    audios = [files.get(k) for k in audio_keys]
    if not all(audios):
        miss = [audio_keys[i] for i, a in enumerate(audios) if not a]
        raise RuntimeError("请上传三个角色的参考音频，缺失：%s" % ", ".join(miss))

    text = (fields.get("text") or "").strip()
    if not text:
        raise RuntimeError("请输入对话内容（节点 45 YC text box）")

    # 上传三段音频
    file_names = []
    for idx, audio in enumerate(audios):
        fname, data, mime = audio
        file_names.append(rh_upload_bytes(rh_key, data, fname, mime))

    # 字段名动态探测（带缓存）
    def probe(node, default):
        got = get_rh_node_fields(rh_key, RH_TD_WORKFLOW_ID, node)
        if got:
            return default if default in got else got[0]
        return default

    node_info_list = []
    for idx, node_id in enumerate(RH_TD_ROLE_NODES):
        node_info_list.append({
            "nodeId": node_id,
            "fieldName": probe(node_id, RH_TD_AUDIO_FIELD),
            "fieldValue": file_names[idx],
        })
    node_info_list.append({
        "nodeId": RH_TD_TEXT_NODE,
        "fieldName": probe(RH_TD_TEXT_NODE, RH_TD_TEXT_FIELD),
        "fieldValue": text,
    })
    return submit_and_poll(rh_key, RH_TD_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled)


# ---- 双人对话（声音生成 · 二级分类）----
# 工作流：https://www.runninghub.cn/post/2091537765040218113
# 节点 17/18 = Load Audio（角色1/2 参考音频），节点 20 = YC text box（多角色对话文本）
RH_PD_WORKFLOW_ID = "2091537765040218113"
RH_PD_ROLE_NODES = ("17", "18")        # 角色1/2 音频
RH_PD_AUDIO_FIELD = "AUDIO"            # Load Audio 端口名（探测会校验）
RH_PD_TEXT_NODE = "20"                 # YC text box
RH_PD_TEXT_FIELD = "text"


def run_rh_pair_dialogue_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """双人对话：上传 2 个参考音频（节点 17/18）+ 输入多角色对话文本（节点 20）→ 提交 → 轮询结果。"""
    fields, files = parse_multipart(raw_body, content_type)
    # 收集两段音频，缺失任何一段即报错
    audio_keys = ("audio1", "audio2")
    audios = [files.get(k) for k in audio_keys]
    if not all(audios):
        miss = [audio_keys[i] for i, a in enumerate(audios) if not a]
        raise RuntimeError("请上传两个角色的参考音频，缺失：%s" % ", ".join(miss))

    text = (fields.get("text") or "").strip()
    if not text:
        raise RuntimeError("请输入对话内容（节点 20 YC text box）")

    # 上传两段音频
    file_names = []
    for audio in audios:
        fname, data, mime = audio
        file_names.append(rh_upload_bytes(rh_key, data, fname, mime))

    # 字段名动态探测（带缓存）
    def probe(node, default):
        got = get_rh_node_fields(rh_key, RH_PD_WORKFLOW_ID, node)
        if got:
            return default if default in got else got[0]
        return default

    node_info_list = []
    for idx, node_id in enumerate(RH_PD_ROLE_NODES):
        node_info_list.append({
            "nodeId": node_id,
            "fieldName": probe(node_id, RH_PD_AUDIO_FIELD),
            "fieldValue": file_names[idx],
        })
    node_info_list.append({
        "nodeId": RH_PD_TEXT_NODE,
        "fieldName": probe(RH_PD_TEXT_NODE, RH_PD_TEXT_FIELD),
        "fieldValue": text,
    })
    return submit_and_poll(rh_key, RH_PD_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled)


# ---- 方言克隆（声音生成 · 二级分类）----
# 工作流：https://www.runninghub.cn/post/2091535562455994370
# 节点 12 = CR Prompt Text（主内容，可插入语气词标签）；节点 11 = CR Prompt Text（参数逗号拼接：性别/年龄/方言/音调/风格）
RH_DC_WORKFLOW_ID = "2091535562455994370"
RH_DC_TEXT_NODE = "12"           # CR Prompt Text · 主内容（含语气词标签）
RH_DC_TEXT_FIELD = "text"
RH_DC_PARAMS_NODE = "11"         # CR Prompt Text · 参数拼接（"女, 青年, 青岛话" 等）
RH_DC_PARAMS_FIELD = "text"


def run_rh_dialect_clone_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """方言克隆：主文本（节点 12，可含语气词标签）+ 参数拼接文本（节点 11，逗号分隔）→ 提交 → 轮询。"""
    fields, files = parse_multipart(raw_body, content_type)
    text = (fields.get("text") or "").strip()
    params = (fields.get("params") or "").strip()
    if not text:
        raise RuntimeError("请输入主内容（节点 12 CR Prompt Text）")
    if not params:
        raise RuntimeError("请在下方多选项中至少勾选一项参数（节点 11 CR Prompt Text）")

    def probe(node, default):
        got = get_rh_node_fields(rh_key, RH_DC_WORKFLOW_ID, node)
        if got:
            return default if default in got else got[0]
        return default

    node_info_list = [
        {"nodeId": RH_DC_TEXT_NODE,
         "fieldName": probe(RH_DC_TEXT_NODE, RH_DC_TEXT_FIELD),
         "fieldValue": text},
        {"nodeId": RH_DC_PARAMS_NODE,
         "fieldName": probe(RH_DC_PARAMS_NODE, RH_DC_PARAMS_FIELD),
         "fieldValue": params},
    ]
    return submit_and_poll(rh_key, RH_DC_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled)


# ---- 音乐翻唱（声音生成 · 二级分类）----
# 工作流：https://www.runninghub.cn/post/2091508595526553601
# 节点 2 = Load Audio（原唱 / 原声音频），节点 3 = Load Audio（翻唱 / 参考原声音频）
RH_MC_WORKFLOW_ID = "2091508595526553601"
RH_MC_AUDIO1_NODE = "2"           # 原唱 / 原声音频
RH_MC_AUDIO1_FIELD = "AUDIO"      # Load Audio 端口名（探测会校验）
RH_MC_AUDIO2_NODE = "3"           # 翻唱 / 参考原声音频
RH_MC_AUDIO2_FIELD = "AUDIO"


def run_rh_music_cover_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """音乐翻唱：上传原唱/原声音频（节点 2）+ 翻唱/参考原声音频（节点 3）→ 提交 → 轮询音频结果。

    注：该工作流不限于音乐翻唱——用一段"原声"音频 + 另一段"参考音色"音频，
    即可克隆参考音色去演绎原声的内容（如让 B 的声音说出 A 说的话）。
    """
    fields, files = parse_multipart(raw_body, content_type)
    audio1 = files.get("audio1") or files.get("2")
    audio2 = files.get("audio2") or files.get("3")
    if not audio1:
        raise RuntimeError("请上传原唱 / 原声音频（节点 2）")
    if not audio2:
        raise RuntimeError("请上传翻唱 / 参考原声音频（节点 3）")

    fname1, data1, mime1 = audio1
    fname2, data2, mime2 = audio2
    file_name1 = rh_upload_bytes(rh_key, data1, fname1, mime1)
    file_name2 = rh_upload_bytes(rh_key, data2, fname2, mime2)

    # 字段名动态探测（带缓存）
    def probe(node, default):
        got = get_rh_node_fields(rh_key, RH_MC_WORKFLOW_ID, node)
        if got:
            return default if default in got else got[0]
        return default

    node_info_list = [
        {"nodeId": str(RH_MC_AUDIO1_NODE),
         "fieldName": probe(RH_MC_AUDIO1_NODE, RH_MC_AUDIO1_FIELD),
         "fieldValue": file_name1},
        {"nodeId": str(RH_MC_AUDIO2_NODE),
         "fieldName": probe(RH_MC_AUDIO2_NODE, RH_MC_AUDIO2_FIELD),
         "fieldValue": file_name2},
    ]
    return submit_and_poll(rh_key, RH_MC_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled)


# ---- 参考图生图（图生图工作流）----
# 工作流：https://www.runninghub.cn/post/2091287667165192193
# 三张参考图节点 351/352/353；提示词 355；生成张数 383；图片比例+缩放系数 382（同文生图 125 处理方式）
RH_REF_WORKFLOW_ID = "2091287667165192193"
RH_REF_IMAGE_NODES = ("351", "352", "353")
RH_REF_IMAGE_FIELD = "image"
RH_REF_TEXT_NODE = "355"
RH_REF_TEXT_FIELD = "text"
RH_REF_COUNT_NODE = "383"
RH_REF_COUNT_FIELD = "Value"
RH_REF_RATIO_NODE = "382"
RH_REF_RATIO_FIELD = "aspect_ratio"
RH_REF_SCALE_FIELD = "megapixels"


def parse_multipart(raw, content_type=""):
    """解析 multipart/form-data body，返回 (fields, files)。
    fields: {name: str}；files: {name: (filename, bytes, mime)}。
    """
    # BytesParser 需要完整消息头（含 Content-Type 的 boundary）才能切分 multipart
    head = ("Content-Type: %s\r\n\r\n" % content_type).encode("utf-8")
    msg = BytesParser(policy=policy.default).parsebytes(head + raw)
    fields = {}
    files = {}
    for part in msg.iter_parts():
        if part.get_content_disposition() != "form-data":
            continue
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        fname = part.get_filename()
        payload = part.get_payload(decode=True) or b""
        if fname:
            files[name] = (fname, payload, part.get_content_type() or "application/octet-stream")
        else:
            fields[name] = payload.decode("utf-8", "ignore")
    return fields, files


def rh_upload_bytes(rh_key, file_bytes, filename, file_type="image/png"):
    """构造单文件 multipart 上传到 RunningHub，返回 data.fileName。"""
    boundary = "----RHBoundary" + uuid.uuid4().hex
    head = (
        "--" + boundary + "\r\n"
        'Content-Disposition: form-data; name="file"; filename="%s"\r\n'
        "Content-Type: %s\r\n\r\n" % (filename, file_type)
    ).encode("utf-8")
    body = head + file_bytes + ("\r\n--" + boundary + "--\r\n").encode("utf-8")
    req = urllib.request.Request(RH_FACE_UPLOAD_URL, data=body, method="POST")
    req.add_header("Content-Type", "multipart/form-data; boundary=" + boundary)
    req.add_header("Authorization", "Bearer " + rh_key)
    with urllib.request.urlopen(req, timeout=load_rh_http_timeout()) as resp:
        obj = json.loads(resp.read().decode("utf-8"))
    data = obj.get("data") or {}
    name = data.get("fileName") or data.get("file_name") or ""
    if not name:
        raise RuntimeError("上传图片失败：" + json.dumps(obj, ensure_ascii=False)[:200])
    return name


def run_rh_refimg_workflow(rh_key, raw_body, content_type, register=None, cancelled=None):
    """参考图生图：解析表单 → 上传参考图 → 提交工作流（图片 351/352/353 + 文本 355 + 比例缩放 382 + 张数 383）→ 轮询。
    前端传 file_0..file_2（上传几张传几个），不足 3 张时复用最后一张填满 351/352/353。"""
    fields, files = parse_multipart(raw_body, content_type)
    # 收集已上传图片（兼容老字段 351/352/353 / file1/file2/file3 / file_0/file_1/file_2）
    uploaded = []
    for i in range(3):
        f = files.get("file_%d" % i) or files.get(RH_REF_IMAGE_NODES[i]) or files.get("file%d" % (i + 1))
        if f:
            uploaded.append(f)
    if not uploaded:
        raise RuntimeError("请上传至少一张参考图片")
    prompt = (fields.get("prompt") or "").strip()
    if not prompt:
        raise RuntimeError("请输入提示词")
    try:
        ratio = fields.get("ratio") or "9:16"
        scale = float(fields.get("scale") or 0.5)
        count = max(1, min(4, int(fields.get("count") or 1)))
    except Exception:
        raise RuntimeError("比例 / 缩放系数 / 生成张数参数无效")

    # 不足 3 张时复用最后一张填满 351/352/353，保证工作流三个图片节点都有真实用户图片
    file_for_node = {}
    for i, k in enumerate(RH_REF_IMAGE_NODES):
        src = uploaded[i] if i < len(uploaded) else uploaded[-1]
        file_for_node[k] = src

    # 上传参考图
    file_names = {}
    for k in RH_REF_IMAGE_NODES:
        fname, data, mime = file_for_node[k]
        file_names[k] = rh_upload_bytes(rh_key, data, fname, mime)

    # 字段名动态探测（带缓存），失败回退默认值
    def probe(node, default):
        got = get_rh_node_fields(rh_key, RH_REF_WORKFLOW_ID, node)
        if got:
            return default if default in got else got[0]
        return default

    node_info_list = []
    for k in RH_REF_IMAGE_NODES:
        node_info_list.append({
            "nodeId": k,
            "fieldName": probe(k, RH_REF_IMAGE_FIELD),
            "fieldValue": file_names[k],
        })
    node_info_list.append({
        "nodeId": RH_REF_TEXT_NODE,
        "fieldName": probe(RH_REF_TEXT_NODE, RH_REF_TEXT_FIELD),
        "fieldValue": prompt,
    })
    # 图片比例 + 缩放系数同属节点 382（与文生图 #125 处理方式一致）
    node_info_list.append({
        "nodeId": RH_REF_RATIO_NODE,
        "fieldName": probe(RH_REF_RATIO_NODE, RH_REF_RATIO_FIELD),
        "fieldValue": normalize_aspect(ratio),
    })
    node_info_list.append({
        "nodeId": RH_REF_RATIO_NODE,
        "fieldName": probe(RH_REF_RATIO_NODE, RH_REF_SCALE_FIELD),
        "fieldValue": str(scale),
    })
    node_info_list.append({
        "nodeId": RH_REF_COUNT_NODE,
        "fieldName": probe(RH_REF_COUNT_NODE, RH_REF_COUNT_FIELD),
        "fieldValue": str(count),
    })
    sys.stderr.write("[rh-refimg] nodeInfoList: %s\n" % json.dumps(node_info_list, ensure_ascii=False))
    sys.stderr.flush()
    return submit_and_poll(rh_key, RH_REF_WORKFLOW_ID, node_info_list, register=register, cancelled=cancelled)


class Handler(http.server.SimpleHTTPRequestHandler):
    def _send_json(self, obj, status=200):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _dl_proxy(self, method, body=None, content_type=None):
        """把 /api/dl/* 请求转发到本地 downloader 服务（8899），流式透传。

        支持 SSE（text/event-stream，chunked 转发）、Range（视频拖动）、二进制流。
        """
        path = self.path.split("?")[0]
        query = self.path.split("?", 1)[1] if "?" in self.path else ""
        upath = "/api/" + path[len("/api/dl/"):] if path.startswith("/api/dl/") else path
        if query:
            upath += "?" + query
        conn = http.client.HTTPConnection(DL_HOST, DL_PORT, timeout=900)
        headers = {}
        if method == "POST":
            headers["Content-Type"] = content_type or "application/json"
        for h in ("Range", "If-Range", "Accept", "Accept-Language", "Origin"):
            v = self.headers.get(h)
            if v:
                headers[h] = v
        try:
            conn.request(method, upath, body=body, headers=headers)
            resp = conn.getresponse()
        except Exception as e:
            self._send_json({"error": "DL_DOWN", "message": "下载服务未启动或连接失败（%s）" % e}, status=502)
            return
        status = resp.status
        ctype = resp.headers.get("Content-Type") or "application/octet-stream"
        is_sse = "text/event-stream" in ctype

        if is_sse:
            # SSE：HTTP/1.1 + 手动 chunked 转发，实时透传进度
            self.protocol_version = "HTTP/1.1"
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            try:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(("%x\r\n" % len(chunk)).encode("ascii") + chunk + b"\r\n")
                    self.wfile.flush()
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            conn.close()
            return

        # 普通 / 二进制流响应
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        for h in ("Content-Range", "Accept-Ranges", "Content-Disposition", "ETag"):
            v = resp.headers.get(h)
            if v:
                self.send_header(h, v)
        clen = resp.getheader("Content-Length")
        try:
            clen = int(clen) if clen else None
        except ValueError:
            clen = None
        if clen is not None and clen >= 0:
            self.send_header("Content-Length", str(clen))
        self.end_headers()
        try:
            remaining = clen
            while True:
                n = 65536 if remaining is None else min(65536, remaining)
                chunk = resp.read(n)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
                if remaining is not None:
                    remaining -= len(chunk)
                    if remaining <= 0:
                        break
        except (BrokenPipeError, ConnectionResetError):
            pass
        conn.close()

    def _dispatch_dl(self, method, raw):
        """把 /api/dl/* 请求在当前进程内转发给内联的 downloader FastAPI app（ASGI 调度）。

        不再走 8899 代理：复用下载器自带的全部已验证逻辑（解析/下载/关键帧/本地资源）。
        对未带 Content-Length 的流式响应（SSE、视频代理）按 HTTP/1.1 chunked 做分帧。
        """
        self.protocol_version = "HTTP/1.1"
        if _dl_app is None and not _init_dl_app():
            self._send_json(
                {"error": "DL_DOWN", "message": "去水印下载模块加载失败：请用包含 fastapi/cv2/httpx 的 Python 启动本服务"},
                status=503,
            )
            return
        path = self.path.split("?")[0]
        query = self.path.split("?", 1)[1] if "?" in self.path else ""
        asgi_path = "/api/" + path[len("/api/dl/"):]  # /api/dl/bootstrap -> /api/bootstrap
        scope = {
            "type": "http", 
            "asgi": {"version": "3.0", "spec_version": "2.4"},
            "http.version": "1.1",
            "method": method, "path": asgi_path,
            "raw_path": asgi_path.encode("latin-1"),
            "query_string": query.encode("latin-1"),
            "headers": [(k.lower().encode("latin-1"), (v or "").encode("latin-1")) for k, v in self.headers.items()],
            "scheme": "http", "client": ("127.0.0.1", 0), "server": ("127.0.0.1", 8777),
        }
        q = queue.Queue()
        req_body = raw if raw is not None else b""

        async def receive():
            return {"type": "http.request", "body": req_body, "more_body": False}

        async def send(msg):
            q.put(msg)

        try:
            fut = asyncio.run_coroutine_threadsafe(_dl_app(scope, receive, send), _dl_loop)
        except Exception as e:
            self._send_json({"error": "DL_DOWN", "message": "调度下载服务失败：%s" % e}, status=502)
            return
        done = threading.Event()
        fut.add_done_callback(lambda _: done.set())

        started = [False]
        chunked = [False]
        has_te = [False]
        terminated = [False]
        try:
            while True:
                try:
                    msg = q.get(timeout=1.0)
                except queue.Empty:
                    if done.is_set():
                        break
                    continue
                if msg["type"] == "http.response.start":
                    self.send_response(msg["status"])
                    for k, v in msg.get("headers", []):
                        lk = k.decode("latin-1").lower()
                        vs = v.decode("latin-1")
                        if lk == "content-length":
                            chunked[0] = False
                        if lk == "transfer-encoding" and "chunked" in vs.lower():
                            chunked[0] = True
                            has_te[0] = True
                        self.send_header(k.decode("latin-1"), vs)
                    if chunked[0] and not has_te[0]:
                        self.send_header("Transfer-Encoding", "chunked")
                    self.end_headers()
                    started[0] = True
                elif msg["type"] == "http.response.body":
                    chunk = msg.get("body") or b""
                    if chunked[0]:
                        if chunk:
                            self.wfile.write(("%X\r\n" % len(chunk)).encode("ascii") + chunk + b"\r\n")
                            self.wfile.flush()
                        if not msg.get("more_body", False):
                            self.wfile.write(b"0\r\n\r\n")
                            self.wfile.flush()
                            terminated[0] = True
                            break
                    else:
                        if chunk:
                            self.wfile.write(chunk)
                            self.wfile.flush()
                        if not msg.get("more_body", False):
                            break
        except (BrokenPipeError, ConnectionResetError):
            return
        finally:
            if not started[0]:
                try:
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(b'{"error":"DL_INTERNAL"}')
                except Exception:
                    pass
            elif chunked[0] and not terminated[0]:
                try:
                    self.wfile.write(b"0\r\n\r\n")
                    self.wfile.flush()
                except Exception:
                    pass

    def end_headers(self):
        # 禁止缓存，确保前端刷新即拿到最新文件（避免沙箱隧道/浏览器缓存导致“改动不生效”）
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/config":
            cfg = load_config()
            dl_cookie = dl_read_cookie()
            self._send_json({
                "rhKey": cfg.get("rhKey") or "",
                "rhWorkflowId": cfg.get("rhWorkflowId") or "",
                "rhConcurrency": RH_QUEUE.concurrency,
                "rhTimeout": int(cfg.get("rhTimeout", RH_TIMEOUT_MIN_DEFAULT) or RH_TIMEOUT_MIN_DEFAULT),
                "dyCookie": dl_cookie.get("douyin_cookie", ""),
                "xhsCookie": dl_cookie.get("xhs_cookie", ""),
                "dlAlive": (_dl_app is not None),
            })
            return
        if path in ("/config.json",):
            self.send_response(403)
            self.end_headers()
            return
        if path == "/api/rh-queue":
            self._send_json(RH_QUEUE.dump())
            return
        if path.startswith("/api/rh-task/"):
            tid = path[len("/api/rh-task/"):]
            st = RH_QUEUE.status(tid)
            if st is None:
                self._send_json({"error": "NOT_FOUND", "message": "任务不存在或已过期"}, status=404)
            else:
                self._send_json(st)
            return
        if path.startswith("/api/dl/"):
            self._dispatch_dl("GET", None)
            return
        super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b"{}"

        # 去水印下载 / 关键帧 / 本地资源：内联调度到 downloader app（同进程，无 8899）
        if path.startswith("/api/dl/"):
            self._dispatch_dl("POST", raw)
            return

        # 通用媒体上传（MediaLoader 组件复用）：multipart 单文件 → RunningHub，返回 data.fileName。
        # 任意分类在提交工作流前，都可先把本地素材换成 RH 侧的真实 fileName 再组装 node_info_list。
        if path == "/api/rh-media-upload":
            cfg = load_config()
            rh_key = cfg.get("rhKey")
            if not rh_key:
                self._send_json({"error": "NO_RH_KEY", "message": "尚未配置 RunningHub API Key"}, status=400)
                return
            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in content_type or not raw:
                self._send_json({"error": "BAD_REQ", "message": "请选择要上传的文件"}, status=400)
                return
            try:
                file_name = rh_upload(rh_key, raw, content_type)
                self._send_json({"fileName": file_name})
            except Exception as e:
                sys.stderr.write("[rh-media-upload] upload failed: %s\n" % e)
                self._send_json({"error": "UPLOAD_FAILED", "message": str(e)[:300]}, status=500)
            return

        # 修脸磨皮 / 高清放大 / 参考图生图 / 扩图 / 图片编辑类：multipart 上传
        if path in ("/api/rh-face-generate", "/api/rh-hd-generate", "/api/rh-refimg-generate", "/api/rh-ex-generate", "/api/rh-pose-generate", "/api/rh-faceswap-generate", "/api/rh-voice-clone-generate", "/api/rh-tri-dialogue-generate", "/api/rh-pair-dialogue-generate", "/api/rh-dialect-clone-generate", "/api/rh-music-cover-generate", "/api/rh-ie-generate", "/api/rh-revimg-generate", "/api/rh-revvideo-generate", "/api/rh-firstframe-generate", "/api/rh-lastframe-generate", "/api/rh-bothframe-generate", "/api/rh-mr-generate"):
            cfg = load_config()
            rh_key = cfg.get("rhKey")
            if not rh_key:
                self._send_json({"error": "NO_RH_KEY", "message": "尚未配置 RunningHub API Key"}, status=400)
                return
            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in content_type or not raw:
                self._send_json({"error": "BAD_REQ", "message": "请选择要上传的文件"}, status=400)
                return
            runner = {
                "/api/rh-face-generate": run_rh_face_workflow,
                "/api/rh-hd-generate": run_rh_hd_workflow,
                "/api/rh-refimg-generate": run_rh_refimg_workflow,
                "/api/rh-ex-generate": run_rh_ex_workflow,
                "/api/rh-pose-generate": run_rh_pose_workflow,
                "/api/rh-faceswap-generate": run_rh_faceswap_workflow,
                "/api/rh-voice-clone-generate": run_rh_voice_clone_workflow,
                "/api/rh-tri-dialogue-generate": run_rh_tri_dialogue_workflow,
                "/api/rh-pair-dialogue-generate": run_rh_pair_dialogue_workflow,
                "/api/rh-dialect-clone-generate": run_rh_dialect_clone_workflow,
                "/api/rh-music-cover-generate": run_rh_music_cover_workflow,
                "/api/rh-ie-generate": run_rh_instruct_workflow,
                "/api/rh-revimg-generate": run_rh_revimg_workflow,
                "/api/rh-revvideo-generate": run_rh_revvideo_workflow,
                "/api/rh-firstframe-generate": run_rh_firstframe_workflow,
                "/api/rh-lastframe-generate": run_rh_lastframe_workflow,
                "/api/rh-bothframe-generate": run_rh_bothframe_workflow,
                "/api/rh-mr-generate": run_rh_mr_workflow,
            }[path]
            tid = RH_QUEUE.submit(
                lambda register=None, cancelled=None, r=runner: r(
                    rh_key, raw, content_type, register=register, cancelled=cancelled)
            )
            self._send_json({"taskId": tid})
            return

        try:
            body = json.loads(raw or b"{}")
        except Exception:
            body = {}

        # 文生视频：JSON 参数（无文件上传），强制使用 Plus 队列模式
        if path == "/api/rh-mv-generate":
            cfg = load_config()
            rh_key = cfg.get("rhKey")
            if not rh_key:
                self._send_json({"error": "NO_RH_KEY", "message": "尚未配置 RunningHub API Key"}, status=400)
                return
            tid = RH_QUEUE.submit(
                lambda register=None, cancelled=None: run_rh_mv_workflow(
                    rh_key, body, register=register, cancelled=cancelled)
            )
            self._send_json({"taskId": tid})
            return

        # 动漫转真人：JSON（image base64 + scale + tags），图片上传到 RH 后提交 3 节点
        if path == "/api/rh-ani2real-generate":
            import base64
            cfg = load_config()
            rh_key = cfg.get("rhKey")
            if not rh_key:
                self._send_json({"error": "NO_RH_KEY", "message": "尚未配置 RunningHub API Key"}, status=400)
                return
            image_b64 = (body.get("image") or "").strip()
            if not image_b64:
                self._send_json({"error": "BAD_REQ", "message": "请先上传一张动漫图片"}, status=400)
                return
            if "," in image_b64:
                image_b64 = image_b64.split(",", 1)[1]
            try:
                file_bytes = base64.b64decode(image_b64)
            except Exception:
                self._send_json({"error": "BAD_REQ", "message": "图片 base64 解析失败"}, status=400)
                return
            # 缩放值：夹紧 768–2048
            try:
                scale = int(body.get("scale") or 1536)
            except (TypeError, ValueError):
                scale = 1536
            scale = max(768, min(2048, scale))
            tags = (body.get("tags") or "").strip()
            filename = "ani2real_" + uuid.uuid4().hex[:8] + ".png"
            tid = RH_QUEUE.submit(
                lambda register=None, cancelled=None: run_rh_ani2real_workflow(
                    rh_key, file_bytes, filename, "image/png", scale, tags,
                    register=register, cancelled=cancelled)
            )
            self._send_json({"taskId": tid})
            return

        if path == "/api/rh-imgrewrite-generate":
            import base64
            cfg = load_config()
            rh_key = cfg.get("rhKey")
            if not rh_key:
                self._send_json({"error": "NO_RH_KEY", "message": "尚未配置 RunningHub API Key"}, status=400)
                return
            image_b64 = (body.get("image") or "").strip()
            if not image_b64:
                self._send_json({"error": "BAD_REQ", "message": "请先上传一张真实人像图片"}, status=400)
                return
            if "," in image_b64:
                image_b64 = image_b64.split(",", 1)[1]
            try:
                file_bytes = base64.b64decode(image_b64)
            except Exception:
                self._send_json({"error": "BAD_REQ", "message": "图片 base64 解析失败"}, status=400)
                return
            try:
                ratio = str(body.get("ratio") or "1:1")
                scale = float(body.get("scale") or 0.5)
                count = int(body.get("count") or 1)
            except (TypeError, ValueError):
                self._send_json({"error": "BAD_REQ", "message": "比例/缩放/张数参数非法"}, status=400)
                return
            count = max(1, min(4, count))
            filename = "imgrewrite_" + uuid.uuid4().hex[:8] + ".png"
            tid = RH_QUEUE.submit(
                lambda register=None, cancelled=None: run_rh_imgrewrite_workflow(
                    rh_key, file_bytes, filename, "image/png", ratio, scale, count,
                    register=register, cancelled=cancelled)
            )
            self._send_json({"taskId": tid})
            return

        if path == "/api/rh-portrait-generate":
            cfg = load_config()
            rh_key = cfg.get("rhKey")
            if not rh_key:
                self._send_json({"error": "NO_RH_KEY", "message": "尚未配置 RunningHub API Key"}, status=400)
                return
            prompt = (body.get("prompt") or "").strip()
            if not prompt:
                self._send_json({"error": "BAD_REQ", "message": "请输入人像摄影提示词（支持中英文）"}, status=400)
                return
            try:
                ratio = str(body.get("ratio") or "1:1")
                scale = float(body.get("scale") or 0.5)
                count = int(body.get("count") or 1)
            except (TypeError, ValueError):
                self._send_json({"error": "BAD_REQ", "message": "比例/缩放/张数参数非法"}, status=400)
                return
            count = max(1, min(4, count))
            tid = RH_QUEUE.submit(
                lambda register=None, cancelled=None: run_rh_portrait_workflow(
                    rh_key, prompt, ratio, scale, count,
                    register=register, cancelled=cancelled)
            )
            self._send_json({"taskId": tid})
            return

        if path == "/api/config":
            cfg = load_config()
            rh_key = (body.get("rhKey") or "").strip()
            if rh_key:
                cfg["rhKey"] = rh_key
            rh_wfid = (body.get("rhWorkflowId") or "").strip()
            if rh_wfid:
                cfg["rhWorkflowId"] = rh_wfid
            # 并发上限：动态调整队列并发，立即生效
            rh_conc = body.get("rhConcurrency")
            if rh_conc is not None:
                try:
                    n = max(1, min(RH_QUEUE_POOL, int(rh_conc)))
                    cfg["rhConcurrency"] = n
                    RH_QUEUE.set_concurrency(n)
                except Exception:
                    pass
            # 单任务轮询超时（分钟）：参考 RunningHub 会员权益（免费 20 / 付费 60）
            rh_tm = body.get("rhTimeout")
            if rh_tm is not None:
                try:
                    m = max(RH_TIMEOUT_MIN_FREE, min(RH_TIMEOUT_MAX, int(rh_tm)))
                    cfg["rhTimeout"] = m
                except Exception:
                    pass
            # 抖音 / 小红书 Cookie：写入本机 config 并同步到 downloader 服务
            dy_cookie = body.get("dyCookie")
            xhs_cookie = body.get("xhsCookie")
            if dy_cookie is not None or xhs_cookie is not None:
                dy_new = (dy_cookie or "").strip() if dy_cookie is not None else None
                xhs_new = (xhs_cookie or "").strip() if xhs_cookie is not None else None
                dl_write_cookie(dy=dy_new, xhs=xhs_new)
            save_config(cfg)
            dl_cookie = dl_read_cookie()
            self._send_json({
                "rhKey": cfg.get("rhKey") or "",
                "rhWorkflowId": cfg.get("rhWorkflowId") or "",
                "rhConcurrency": RH_QUEUE.concurrency,
                "rhTimeout": int(cfg.get("rhTimeout", RH_TIMEOUT_MIN_DEFAULT) or RH_TIMEOUT_MIN_DEFAULT),
                "dyCookie": dl_cookie.get("douyin_cookie", ""),
                "xhsCookie": dl_cookie.get("xhs_cookie", ""),
            })
            return

        # 从 RunningHub 后台恢复已生成的任务结果（前端"任务丢失"卡片用）
        if path == "/api/rh-recover":
            cfg = load_config()
            rh_key = cfg.get("rhKey")
            if not rh_key:
                self._send_json({"error": "NO_RH_KEY", "message": "尚未配置 RunningHub API Key"}, status=400)
                return
            local_tid = (body.get("taskId") or "").strip()
            # 解析 RunningHub 真实任务 ID：优先前端携带 rhTaskId → 持久化映射表 → 队列内存
            rh_tid = (body.get("rhTaskId") or "").strip()
            if _is_local_task_id(rh_tid):
                rh_tid = ""
            if not rh_tid:
                rh_tid = lookup_rh_task_id(local_tid) or ""
            if not rh_tid and local_tid:
                st0 = RH_QUEUE.status(local_tid)
                if st0 and st0.get("rhTaskId"):
                    rh_tid = st0["rhTaskId"]
            if not rh_tid:
                self._send_json({"error": "BAD_REQ",
                                 "message": "无法定位 RunningHub 任务：请提供真实任务 ID（可在 RunningHub 控制台任务详情复制）"},
                                status=400)
                return
            try:
                q = rh_post(RH_QUERY_URL, {"apiKey": rh_key, "taskId": rh_tid}, api_key=rh_key)
            except Exception as e:
                self._send_json({"error": "QUERY_FAIL", "message": str(e)}, status=502)
                return
            st_u = (q.get("status") or "").upper()
            if q.get("errorCode") == "1004" or st_u in ("CANCELLED",) or (
                st_u in ("FAILED", "ERROR") and "cancel" in json.dumps(q, ensure_ascii=False).lower()
            ):
                self._send_json({"error": "NOT_FOUND",
                                 "message": "RunningHub 后台无此任务或已被取消",
                                 "status": st_u})
                return
            images = []
            texts = []
            for k in ("results", "data"):
                items = q.get(k)
                if isinstance(items, list):
                    for it in items:
                        if isinstance(it, dict):
                            u = it.get("fileUrl") or it.get("url")
                            if not u:
                                continue
                        elif isinstance(it, str):
                            u = it
                        else:
                            continue
                        if str(u).lower().endswith(".txt"):
                            try:
                                txt = fetch_url_text(u)
                                if txt:
                                    texts.append(txt)
                            except Exception:
                                pass
                        else:
                            images.append(u)
            if not images and not texts:
                self._send_json({"error": "NO_IMAGES",
                                 "message": "RunningHub 任务尚未产出结果（可能仍在执行或未生成）",
                                 "status": st_u or "UNKNOWN"})
                return
            # 兼容 query_rh_task_outputs（图片为 {url,nodeId} 字典）；此处仅取 url 回传前端
            out_images = [o["url"] if isinstance(o, dict) else o for o in images]
            self._send_json({"taskId": rh_tid, "status": st_u or "SUCCESS", "images": out_images, "text": texts})
            return

        if path == "/api/rh-recover-history":
            cfg = load_config()
            rh_key = cfg.get("rhKey")
            if not rh_key:
                self._send_json({"error": "NO_RH_KEY", "message": "尚未配置 RunningHub API Key"}, status=400)
                return
            want_wf = (body.get("workflowId") or "").strip()
            include_untagged = bool(body.get("includeUntagged"))
            want_node = (body.get("outputNode") or "").strip()   # 指定出图节点时，仅保留该节点产出的图片（按工作流精确筛选）
            # 读取本机落盘的 本地UUID→RunningHub 任务ID 映射（含 ts / workflowId）
            m = _load_rh_task_map()
            # 候选筛选：指定工作流则只取该工作流；includeUntagged 时额外纳入未分类（历史丢失数据）任务
            cands = []
            for local_tid, e in m.items():
                if not isinstance(e, dict):
                    continue
                wf = str(e.get("workflowId") or "")
                if want_wf and wf and wf == want_wf:
                    cands.append((local_tid, e))
                elif include_untagged and not wf:
                    cands.append((local_tid, e))
                elif not want_wf and not include_untagged:
                    # 未指定任何筛选：默认返回全部（供调试/全量恢复）
                    cands.append((local_tid, e))
            # 按时间倒序，优先最近任务
            cands.sort(key=lambda x: x[1].get("ts", 0), reverse=True)
            items = []
            errors = []
            from concurrent.futures import ThreadPoolExecutor

            def _one(local_tid, e):
                rh_tid = str(e.get("rhTaskId") or "")
                if not rh_tid:
                    return None
                try:
                    st, imgs, txts = query_rh_task_outputs(rh_key, rh_tid)
                except Exception as ex:
                    return {"rhTaskId": rh_tid, "ts": e.get("ts", 0),
                            "workflowId": e.get("workflowId"), "status": "ERR",
                            "error": str(ex), "images": [], "text": []}
                # 按出图节点精确筛选（如图片洗稿出图节点 256），其余工作流图片不混入
                if want_node:
                    imgs = [o for o in imgs if str(o.get("nodeId")) == want_node]
                out_images = [o["url"] if isinstance(o, dict) else o for o in imgs]
                if not out_images:
                    return None  # 无目标工作流出图（文本类任务或非目标工作流）跳过，不污染结果
                return {"rhTaskId": rh_tid, "ts": e.get("ts", 0),
                        "workflowId": e.get("workflowId"), "status": st,
                        "images": out_images, "text": txts}

            with ThreadPoolExecutor(max_workers=8) as ex:
                for res in ex.map(lambda c: _one(*c), cands):
                    if res is None:
                        continue
                    if res.get("status") == "ERR":
                        errors.append(res)
                    else:
                        items.append(res)
            self._send_json({"count": len(items), "items": items,
                             "errors": errors[:20], "scanned": len(cands)})
            return

        if path == "/api/rh-recover-batch":
            cfg = load_config()
            rh_key = cfg.get("rhKey")
            if not rh_key:
                self._send_json({"error": "NO_RH_KEY", "message": "尚未配置 RunningHub API Key"}, status=400)
                return
            tasks = body.get("tasks") or []
            want_wf = (body.get("workflowId") or "").strip()
            want_node = (body.get("outputNode") or "").strip()
            if not isinstance(tasks, list) or not tasks:
                self._send_json({"error": "BAD_REQ", "message": "tasks 不能为空"}, status=400)
                return
            # 反向索引：rhTaskId → workflowId（来自本机落盘映射，用于按工作流精确筛选）
            m = _load_rh_task_map()
            wf_by_rh = {}
            for e in m.values():
                if isinstance(e, dict) and e.get("rhTaskId"):
                    wf_by_rh[str(e["rhTaskId"])] = str(e.get("workflowId") or "")

            items, errors, skipped = [], [], []
            from concurrent.futures import ThreadPoolExecutor

            def _one(t):
                rh_tid = str(t.get("rhTaskId") or "").strip()
                local_id = t.get("localId") or t.get("id") or ""
                if _is_local_task_id(rh_tid):
                    rh_tid = ""
                if not rh_tid and local_id:
                    mapped = _load_rh_task_map().get(local_id)
                    if isinstance(mapped, dict) and mapped.get("rhTaskId"):
                        rh_tid = str(mapped["rhTaskId"])
                if not rh_tid:
                    return {"localId": local_id, "rhTaskId": rh_tid, "status": "SKIP", "reason": "NO_RHTASK"}
                # 按工作流精确筛选：本机映射记录的工作流与目标工作流不一致则跳过（避免跨模块恢复）
                rec_wf = wf_by_rh.get(rh_tid, "")
                if want_wf and rec_wf and rec_wf != want_wf:
                    return {"localId": local_id, "rhTaskId": rh_tid, "status": "SKIP", "reason": "WORKFLOW_MISMATCH"}
                try:
                    st, imgs, txts = query_rh_task_outputs(rh_key, rh_tid)
                except Exception as ex:
                    return {"localId": local_id, "rhTaskId": rh_tid, "status": "ERR",
                            "error": str(ex), "images": [], "text": []}
                if want_node:
                    imgs = [o for o in imgs if str(o.get("nodeId")) == want_node]
                out_images = [o["url"] if isinstance(o, dict) else o for o in imgs]
                if not out_images and not txts:
                    return {"localId": local_id, "rhTaskId": rh_tid, "status": "EMPTY",
                            "reason": "NO_OUTPUT", "images": [], "text": []}
                return {"localId": local_id, "rhTaskId": rh_tid, "status": st,
                        "images": out_images, "text": txts}

            with ThreadPoolExecutor(max_workers=8) as ex:
                for res in ex.map(_one, tasks):
                    stt = res.get("status")
                    if stt == "ERR":
                        errors.append(res)
                    elif stt in ("SKIP", "EMPTY"):
                        skipped.append(res)
                    else:
                        items.append(res)
            self._send_json({"count": len(items), "items": items,
                             "errors": errors[:20], "skipped": skipped[:20], "scanned": len(tasks)})
            return

        if path == "/api/rh-generate":
            # 入队：所有 RunningHub 调用进入统一任务队列，立即返回 taskId；前端轮询状态
            cfg = load_config()
            rh_key = cfg.get("rhKey")
            if not rh_key:
                self._send_json({"error": "NO_RH_KEY", "message": "尚未配置 RunningHub API Key"}, status=400)
                return
            prompt = (body.get("prompt") or "").strip()
            if not prompt:
                self._send_json({"error": "BAD_REQ", "message": "请输入提示词"}, status=400)
                return
            try:
                ratio = body.get("ratio") or "9:16"
                scale = float(body.get("scale") or 0.5)
                count = max(1, min(4, int(body.get("count") or 1)))
            except Exception:
                self._send_json({"error": "BAD_REQ", "message": "参数无效"}, status=400)
                return
            nodes = RH_NODES
            tid = RH_QUEUE.submit(
                lambda register=None, cancelled=None: run_rh_workflow(
                    rh_key, prompt, ratio, scale, count, nodes, register=register, cancelled=cancelled)
            )
            self._send_json({"taskId": tid})
            return

        if path.startswith("/api/rh-task/") and path.endswith("/cancel"):
            # 取消任务：从队列移除（排队中的不再执行，运行中的尽力取消 RunningHub 侧任务）
            tid = path[len("/api/rh-task/"):-len("/cancel")]
            ok = RH_QUEUE.cancel(tid)
            self._send_json({"ok": ok})
            return

        if path.startswith("/api/rh-task/"):
            tid = path[len("/api/rh-task/"):]
            st = RH_QUEUE.status(tid)
            if st is None:
                self._send_json({"error": "NOT_FOUND", "message": "任务不存在或已过期"}, status=404)
                return
            self._send_json(st)
            return

        self.send_response(404)
        self.end_headers()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8777))
    os.chdir(BASE)
    # 内联加载 downloader（同进程、无独立 8899 端口）；失败仅记日志，不影响站点其它功能
    try:
        _init_dl_app()
    except Exception as e:
        sys.stderr.write("[dl] in-process downloader init failed: %r\n" % e)
    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
    sys.stderr.write("Serving short-drama site on 0.0.0.0:%d\n" % port)
    sys.stderr.flush()
    httpd.serve_forever()
