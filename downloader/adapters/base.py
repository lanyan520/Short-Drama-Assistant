"""适配器协议与统一数据模型。

每个 (platform, media_type) 组合由一个适配器负责，返回「按作者聚合」的结果。
上层只认这里定义的数据结构，抓取细节完全隔离在各适配器内部。
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Protocol

MediaType = Literal["image", "video"]


@dataclass
class MediaItem:
    """一条可下载的媒体（单张图片或一个视频）。"""

    id: str
    type: MediaType
    url: str                      # 真实下载直链（无水印优先）
    thumb: str = ""               # 列表展示用缩略图
    width: int = 0
    height: int = 0
    title: str = ""
    duration: float = 0.0         # 视频时长（秒），图片为 0
    size: int = 0                 # 字节，未知为 0
    ext: str = ""                 # 扩展名，未知则下载时按 Content-Type 推断

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "MediaItem":
        return cls(**dict(data))


@dataclass
class Author:
    """一级列表项：作者及其命中的作品。"""

    id: str                       # 平台内唯一 ID（抖音 sec_uid / 小红书 user_id）
    nickname: str
    avatar: str = ""
    handle: str = ""              # 抖音号 / 小红书号，展示用
    followers: int = 0
    platform: str = ""
    home_url: str = ""
    signature: str = ""
    items: list[MediaItem] = field(default_factory=list)
    capped: bool = False           # 是否因匿名翻页被限流而只拿到部分作品

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["items"] = [i.to_dict() for i in self.items]
        data["item_count"] = len(self.items)
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Author":
        data = dict(data)
        raw_items = data.get("items") or []
        data["items"] = [MediaItem.from_dict(i) for i in raw_items]
        data.pop("item_count", None)  # 兼容 to_dict 额外写入的字段
        return cls(**data)


@dataclass
class FeedPage:
    """一页结果：一批作者 + 翻页游标。"""

    authors: list[Author]
    has_more: bool = False
    cursor: str = ""              # 下一页游标（平台各异，透明传回）
    source: str = "real"          # real | demo
    notice: str = ""              # 给用户的提示（如风控、需要 Cookie）

    def to_dict(self) -> dict[str, Any]:
        return {
            "authors": [a.to_dict() for a in self.authors],
            "has_more": self.has_more,
            "cursor": self.cursor,
            "source": self.source,
            "notice": self.notice,
        }


class AdapterError(Exception):
    """适配器抓取失败，message 会直接展示给用户。"""

    def __init__(self, message: str, *, need_cookie: bool = False):
        super().__init__(message)
        self.message = message
        self.need_cookie = need_cookie


class Adapter(Protocol):
    platform: str

    async def search(
        self,
        keyword: str,
        media_type: MediaType,
        page: int,
        cursor: str,
        limit: int,
    ) -> FeedPage:
        """按关键词搜索，返回按作者聚合的一页结果。"""
        ...


UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def pick_ext(url: str, fallback: str) -> str:
    """从 URL 猜扩展名，猜不到用 fallback。"""
    tail = url.split("?")[0].rsplit("/", 1)[-1]
    if "." in tail:
        ext = tail.rsplit(".", 1)[-1].lower()
        if 1 <= len(ext) <= 5 and ext.isalnum():
            return ext
    return fallback
