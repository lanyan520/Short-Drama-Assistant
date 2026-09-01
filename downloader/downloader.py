"""下载引擎：并发下载 + 防盗链 Referer + 进度上报。

抖音/小红书 CDN 对图片和视频都有 Referer 校验，必须按平台伪装请求头。
"""
from __future__ import annotations

import asyncio
import mimetypes
import re
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import httpx

import config
from adapters.base import UA

REFERERS = {
    "douyin": "https://www.douyin.com/",
    "xhs": "https://www.xiaohongshu.com/",
    "demo": "",
}

_INVALID = re.compile(r'[/\\:\*\?"<>\|\x00-\x1f]')

TaskState = Literal["pending", "running", "done", "error", "cancelled"]


def sanitize(name: str, limit: int = 60) -> str:
    name = _INVALID.sub("_", name or "").strip().strip(".")
    name = re.sub(r"\s+", " ", name)
    if not name:
        name = "untitled"
    return name[:limit]


@dataclass
class FileJob:
    url: str
    platform: str
    media_type: str
    author_nickname: str
    author_handle: str
    title: str
    item_id: str
    ext: str = ""

    # 运行时
    state: TaskState = "pending"
    received: int = 0
    total: int = 0
    error: str = ""
    saved_path: str = ""


@dataclass
class DownloadTask:
    id: str
    root: str
    category: str
    layout: str
    jobs: list[FileJob]
    created_at: float = field(default_factory=time.time)
    cancelled: bool = False
    _client: Any = None  # httpx.AsyncClient，运行时注入，用于中止时强制关闭连接

    @property
    def total_files(self) -> int:
        return len(self.jobs)

    @property
    def done_files(self) -> int:
        return sum(1 for j in self.jobs if j.state == "done")

    @property
    def failed_files(self) -> int:
        return sum(1 for j in self.jobs if j.state == "error")

    @property
    def cancelled_files(self) -> int:
        return sum(1 for j in self.jobs if j.state == "cancelled")

    @property
    def finished(self) -> bool:
        return all(j.state in ("done", "error", "cancelled") for j in self.jobs)

    async def abort(self) -> None:
        """强制中止：标记取消 + 关闭 httpx 客户端以打断所有在途连接。"""
        self.cancelled = True
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()

    def snapshot(self) -> dict[str, Any]:
        received = sum(j.received for j in self.jobs)
        total = sum(j.total for j in self.jobs if j.total)
        # 统计已启动的文件数（非 pending），用于更准确的进度
        started = sum(1 for j in self.jobs if j.state != "pending")
        return {
            "id": self.id,
            "root": self.root,
            "category": self.category,
            "total_files": self.total_files,
            "done_files": self.done_files,
            "failed_files": self.failed_files,
            "cancelled_files": self.cancelled_files,
            "started_files": started,
            "received_bytes": received,
            "total_bytes": total,
            "finished": self.finished,
            "cancelled": self.cancelled,
            "files": [
                {
                    "item_id": j.item_id,
                    "title": j.title,
                    "author": j.author_nickname,
                    "state": j.state,
                    "received": j.received,
                    "total": j.total,
                    "error": j.error,
                    "saved_path": j.saved_path,
                }
                for j in self.jobs
            ],
        }


TASKS: dict[str, DownloadTask] = {}


def build_target(task: DownloadTask, job: FileJob) -> Path:
    """按分类布局拼出保存路径。"""
    root = Path(task.root)
    parts: list[str] = []

    if task.category:
        parts.append(config.category_dir_name(task.category))

    layout = task.layout
    if layout in ("platform", "platform_author"):
        parts.append(job.platform)
        parts.append("图片" if job.media_type == "image" else "视频")
    if layout in ("author", "platform_author"):
        who = sanitize(job.author_nickname or "unknown", 40)
        if job.author_handle:
            who = f"{who}_{sanitize(job.author_handle, 20)}"
        parts.append(who)

    folder = root.joinpath(*parts) if parts else root
    folder.mkdir(parents=True, exist_ok=True)

    ext = job.ext or "bin"
    base = sanitize(job.title or job.item_id, 50)
    filename = f"{base}_{job.item_id}.{ext}"
    target = folder / filename

    # 同名去重
    counter = 1
    while target.exists():
        target = folder / f"{base}_{job.item_id}_{counter}.{ext}"
        counter += 1
    return target


async def _fetch_one(
    client: httpx.AsyncClient,
    task: DownloadTask,
    job: FileJob,
    sem: asyncio.Semaphore,
) -> None:
    async with sem:
        if task.cancelled:
            job.state = "cancelled"
            return
        if not job.url:
            job.state = "error"
            job.error = "该条目缺少可下载直链（小红书视频需要笔记详情才能拿到）"
            return

        job.state = "running"
        headers = {"User-Agent": UA}
        ref = REFERERS.get(job.platform, "")
        if ref:
            headers["Referer"] = ref

        tmp: Path | None = None
        try:
            async with client.stream("GET", job.url, headers=headers) as resp:
                if resp.status_code >= 400:
                    job.state = "error"
                    job.error = f"HTTP {resp.status_code}"
                    return

                if not job.ext:
                    ctype = (resp.headers.get("content-type") or "").split(";")[0].strip()
                    guessed = mimetypes.guess_extension(ctype) or ""
                    job.ext = guessed.lstrip(".") or ("mp4" if job.media_type == "video" else "jpg")

                job.total = int(resp.headers.get("content-length") or 0)
                target = build_target(task, job)
                tmp = target.with_suffix(target.suffix + ".part")

                with tmp.open("wb") as fh:
                    async for chunk in resp.aiter_bytes(64 * 1024):
                        if task.cancelled:
                            job.state = "cancelled"
                            fh.close()
                            tmp.unlink(missing_ok=True)
                            return
                        fh.write(chunk)
                        job.received += len(chunk)

                tmp.replace(target)
                job.saved_path = str(target)
                job.state = "done"
        except (httpx.HTTPError, OSError) as exc:
            if task.cancelled:
                job.state = "cancelled"
            else:
                job.state = "error"
                job.error = str(exc)[:200]
            if tmp is not None:
                tmp.unlink(missing_ok=True)


async def run_task(task: DownloadTask) -> None:
    cfg = config.load()
    concurrency = max(1, min(int(cfg.get("concurrency", 4)), 12))
    sem = asyncio.Semaphore(concurrency)
    limits = httpx.Limits(max_connections=concurrency * 2, max_keepalive_connections=concurrency)
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(30.0, read=60.0), follow_redirects=True, limits=limits,
        trust_env=False,  # 绕过系统代理，直连 CDN 下载
    ) as client:
        task._client = client  # 注入到 task，中止时可强制关闭
        await asyncio.gather(
            *(_fetch_one(client, task, job, sem) for job in task.jobs),
            return_exceptions=True,
        )
    task._client = None


def create_task(
    root: str, category: str, items: list[dict[str, Any]], layout: str
) -> DownloadTask:
    jobs = [
        FileJob(
            url=it.get("url") or "",
            platform=it.get("platform") or "demo",
            media_type=it.get("media_type") or "image",
            author_nickname=it.get("author_nickname") or "",
            author_handle=it.get("author_handle") or "",
            title=it.get("title") or "",
            item_id=str(it.get("item_id") or uuid.uuid4().hex[:8]),
            ext=(it.get("ext") or "").lstrip("."),
        )
        for it in items
    ]
    task = DownloadTask(
        id=uuid.uuid4().hex[:12],
        root=root,
        category=category,
        layout=layout,
        jobs=jobs,
    )
    TASKS[task.id] = task
    return task


def prune(max_keep: int = 20) -> None:
    if len(TASKS) <= max_keep:
        return
    ordered = sorted(TASKS.values(), key=lambda t: t.created_at)
    for t in ordered[: len(TASKS) - max_keep]:
        if t.finished:
            TASKS.pop(t.id, None)
