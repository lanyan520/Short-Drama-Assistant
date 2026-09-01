"""配置持久化：Cookie、下载目录、分类标签。"""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_PATH = DATA_DIR / "config.json"

_LOCK = threading.Lock()

DEFAULTS: dict[str, Any] = {
    # 平台登录 Cookie。留空则适配器降级为演示数据。
    "douyin_cookie": "",
    "xhs_cookie": "",
    # 最近使用过的下载目录（最多保留 8 个）
    "recent_dirs": [],
    # 上次使用的下载目录
    "last_dir": str(Path.home() / "Downloads"),
    # 下载并发数
    "concurrency": 4,
    # 目录组织方式：flat | platform | author | platform_author
    "layout": "platform_author",
    # 是否在无 Cookie 时使用演示数据（关闭则直接报错）
    "allow_demo": True,
    # AI 图片评分（OpenAI 兼容接口）
    "ai_key": "",
    "ai_base_url": "https://api.openai.com/v1",
    "ai_model": "gpt-4o",
}


def load() -> dict[str, Any]:
    with _LOCK:
        cfg = dict(DEFAULTS)
        if CONFIG_PATH.exists():
            try:
                cfg.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
            except (json.JSONDecodeError, OSError):
                pass
        return cfg


def save(patch: dict[str, Any]) -> dict[str, Any]:
    with _LOCK:
        cfg = dict(DEFAULTS)
        if CONFIG_PATH.exists():
            try:
                cfg.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
            except (json.JSONDecodeError, OSError):
                pass
        for key, value in patch.items():
            if key in DEFAULTS:
                cfg[key] = value
        CONFIG_PATH.write_text(
            json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return cfg


def remember_dir(path: str) -> None:
    cfg = load()
    recent = [d for d in cfg.get("recent_dirs", []) if d != path]
    recent.insert(0, path)
    save({"recent_dirs": recent[:8], "last_dir": path})


def cookie_for(platform: str) -> str:
    cfg = load()
    return (cfg.get(f"{platform}_cookie") or "").strip()


def ai_config() -> dict[str, str]:
    """返回 AI 评分配置。"""
    cfg = load()
    return {
        "key": (cfg.get("ai_key") or "").strip(),
        "base_url": (cfg.get("ai_base_url") or "").strip(),
        "model": (cfg.get("ai_model") or "gpt-4o").strip(),
    }


def safe_view() -> dict[str, Any]:
    """给前端的配置视图，Cookie / AI Key 只回传是否已配置，不回明文。"""
    cfg = load()
    return {
        "douyin_cookie_set": bool(cfg["douyin_cookie"].strip()),
        "xhs_cookie_set": bool(cfg["xhs_cookie"].strip()),
        "recent_dirs": cfg["recent_dirs"],
        "last_dir": cfg["last_dir"],
        "concurrency": cfg["concurrency"],
        "layout": cfg["layout"],
        "allow_demo": cfg["allow_demo"],
        "home": str(Path.home()),
        "ai_key_set": bool(cfg["ai_key"].strip()),
        "ai_base_url": cfg["ai_base_url"],
        "ai_model": cfg["ai_model"],
    }


# 下载路径分类标签，用户在下载弹窗里选一个
CATEGORIES = [
    "未分类",
    "穿搭",
    "美食",
    "风景",
    "人物",
    "宠物",
    "家居",
    "素材",
]


def category_dir_name(name: str) -> str:
    name = (name or "").strip() or "未分类"
    # 去掉路径分隔符等危险字符
    for ch in ("/", "\\", ":", "*", "?", '"', "<", ">", "|", "\0"):
        name = name.replace(ch, "_")
    return name[:40]


def env_flag(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}
