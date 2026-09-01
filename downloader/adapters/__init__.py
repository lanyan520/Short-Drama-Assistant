"""链接解析入口。

只保留「粘贴链接 → 解析」这一条线；搜索/导航/演示数据已移除。
"""
from __future__ import annotations

from .base import AdapterError, Author, MediaItem, MediaType
from .parse_link import parse

__all__ = [
    "parse",
    "AdapterError",
    "Author",
    "MediaItem",
    "MediaType",
]
