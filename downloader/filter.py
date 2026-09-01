"""图片过滤引擎：递归扫描目录 → 宽高/大小过滤 → AI 评分 → 评分过滤。

流程：扫描所选目录下所有图片 → 读宽高、文件大小 → 满足「宽>=min_w、高>=min_h、
大小>=min_size_kb」的进入 AI 评分 → 评分（满分 10）>= min_score 的才算可用 → 返回结果。
"""
from __future__ import annotations

import asyncio
import base64
import io
import re
from pathlib import Path
from typing import Any, Callable

import httpx
from PIL import Image

import config

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff"}

ProgressCb = Callable[[str], None]

SCORE_PROMPT = (
    "请客观评估这张图片的质量，综合以下维度打分（满分 10 分）："
    "清晰度/锐度、构图、色彩、噪点/伪影、整体美观度。"
    "只返回一个 0 到 10 之间的数字（可含一位小数），不要任何其他文字。"
)


def _list_images(root: Path) -> list[Path]:
    out: list[Path] = []
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS:
            out.append(p)
    return out


def _read_dimensions(path: Path) -> tuple[int, int]:
    try:
        with Image.open(path) as im:
            return im.size  # (width, height)
    except Exception:
        return (0, 0)


def _filter_by_dimension(
    files: list[Path], min_w: int, min_h: int, min_size_kb: int
) -> list[dict[str, Any]]:
    min_bytes = min_size_kb * 1024
    out: list[dict[str, Any]] = []
    for p in files:
        try:
            size = p.stat().st_size
        except OSError:
            continue
        if size < min_bytes:
            continue
        w, h = _read_dimensions(p)
        if w >= min_w and h >= min_h:
            out.append({"path": p, "width": w, "height": h, "size": size})
    return out


def _prepare_image(path: Path, max_edge: int = 1024) -> str:
    """读取图片，缩放到 max_edge 内并转 JPEG，返回 base64。"""
    with Image.open(path) as im:
        im = im.convert("RGB")
        w, h = im.size
        if max(w, h) > max_edge:
            ratio = max_edge / max(w, h)
            im = im.resize((max(1, int(w * ratio)), max(1, int(h * ratio))))
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode()


def _parse_score(text: str) -> float | None:
    m = re.search(r"\d+(?:\.\d+)?", text or "")
    if not m:
        return None
    v = float(m.group())
    return max(0.0, min(10.0, v))


async def _score_one(
    client: httpx.AsyncClient, ai_cfg: dict[str, str], path: Path
) -> float | None:
    base_url = ai_cfg["base_url"].rstrip("/")
    url = (
        base_url
        if base_url.endswith("/chat/completions")
        else f"{base_url}/chat/completions"
    )
    b64 = await asyncio.to_thread(_prepare_image, path)
    payload = {
        "model": ai_cfg["model"],
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": SCORE_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                    },
                ],
            }
        ],
        "max_tokens": 16,
        "temperature": 0,
    }
    headers = {
        "Authorization": f"Bearer {ai_cfg['key']}",
        "Content-Type": "application/json",
    }
    try:
        resp = await client.post(url, json=payload, headers=headers, timeout=90)
        if resp.status_code >= 400:
            return None
        data = resp.json()
        text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
        return _parse_score(str(text))
    except Exception:
        return None


async def run_filter(
    root: str,
    min_w: int,
    min_h: int,
    min_size_kb: int,
    progress_cb: ProgressCb,
) -> list[dict[str, Any]]:
    """扫描目录图片，按宽高 / 大小过滤，返回满足条件的图片列表（按大小降序）。

    注：AI 评分功能当前已屏蔽，仅做尺寸 / 大小过滤。
    """
    root_path = Path(root).expanduser()
    if not root_path.is_dir():
        raise ValueError(f"目录不存在：{root}")

    progress_cb("正在扫描目录…")
    files = await asyncio.to_thread(_list_images, root_path)
    progress_cb(f"扫描到 {len(files)} 张图片，正在检查尺寸 / 大小…")

    candidates = await asyncio.to_thread(
        _filter_by_dimension, files, min_w, min_h, min_size_kb
    )

    results = [
        {
            "path": str(c["path"]),
            "name": c["path"].name,
            "width": c["width"],
            "height": c["height"],
            "size": c["size"],
        }
        for c in candidates
    ]
    results.sort(key=lambda r: r["size"], reverse=True)
    progress_cb(f"完成：共 {len(results)} 张图片满足条件。")
    return results
