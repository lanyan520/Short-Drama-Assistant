"""macOS 原生目录选择器（osascript）与访达集成。"""
from __future__ import annotations

import asyncio
import shlex
import shutil
import subprocess
import time
from pathlib import Path


async def choose_directory(prompt: str = "选择下载保存目录", default: str = "") -> str | None:
    """弹出 macOS 原生文件夹选择框，返回 POSIX 路径；用户取消返回 None。"""
    # choose folder 是 Standard Additions 的标准命令，不需要 System Events 权限
    # （旧版用 tell application "System Events" 包裹会触发自动化权限检查而报错）
    default_clause = ""
    if default and Path(default).is_dir():
        safe_default = default.replace('"', '\\"')
        default_clause = f' default location POSIX file "{safe_default}"'

    script = (
        "try\n"
        f'  set f to choose folder with prompt "{prompt}"{default_clause}\n'
        '  return POSIX path of f\n'
        'on error number -128\n'
        '  return "__CANCELLED__"\n'
        'end try'
    )

    proc = await asyncio.create_subprocess_exec(
        "osascript",
        "-e",
        script,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate()
    text = out.decode("utf-8", "ignore").strip()

    if proc.returncode != 0:
        detail = err.decode("utf-8", "ignore").strip()
        if "-128" in detail or "User canceled" in detail:
            return None
        raise RuntimeError(f"打开目录选择框失败：{detail or '未知错误'}")

    if not text or text == "__CANCELLED__":
        return None
    return text.rstrip("/") or "/"


def trash_file(path: str) -> None:
    """把单个文件移到 macOS 用户废纸篓（~/.Trash），可恢复；重名自动加时间戳。

    相比 Finder 的 AppleScript 删除（需自动化权限、可能弹窗），直接 move 到
    ~/.Trash 更可靠、无权限问题、速度更快。调用方负责校验路径合法性。
    """
    p = Path(path)
    if not p.is_file():
        return
    trash = Path.home() / ".Trash"
    trash.mkdir(parents=True, exist_ok=True)
    dest = trash / p.name
    if dest.exists():
        dest = trash / f"{p.stem}_{int(time.time() * 1000)}{p.suffix}"
    shutil.move(str(p), str(dest))


def reveal_in_finder(path: str) -> None:
    """在访达中定位文件/目录。"""
    p = Path(path)
    if not p.exists():
        return
    subprocess.Popen(["open", "-R", str(p)] if p.is_file() else ["open", str(p)])


def notify(title: str, message: str) -> None:
    """发一条系统通知。"""
    script = (
        f"display notification {shlex.quote(message)} "
        f"with title {shlex.quote(title)}"
    )
    try:
        subprocess.Popen(["osascript", "-e", script])
    except OSError:
        pass


async def choose_file(prompt: str = "选择视频文件", default: str = "") -> str | None:
    """弹出 macOS 原生文件选择框，返回 POSIX 路径；用户取消返回 None。"""
    default_clause = ""
    if default and Path(default).is_dir():
        safe_default = default.replace('"', '\\"')
        default_clause = f' default location POSIX file "{safe_default}"'

    script = (
        "try\n"
        f'  set f to choose file with prompt "{prompt}"{default_clause}\n'
        '  return POSIX path of f\n'
        'on error number -128\n'
        '  return "__CANCELLED__"\n'
        'end try'
    )

    proc = await asyncio.create_subprocess_exec(
        "osascript",
        "-e",
        script,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate()
    text = out.decode("utf-8", "ignore").strip()

    if proc.returncode != 0:
        detail = err.decode("utf-8", "ignore").strip()
        if "-128" in detail or "User canceled" in detail:
            return None
        raise RuntimeError(f"打开文件选择框失败：{detail or '未知错误'}")

    if not text or text == "__CANCELLED__":
        return None
    return text.rstrip("/") or "/"
