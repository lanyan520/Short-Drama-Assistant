"""链接解析模式：用户粘贴抖音/小红书分享链接，解析出真实直链。

关键实测结论（2026-08-13）：
- 抖音 aweme/detail 单视频/图集详情接口**匿名可用**（无需 Cookie），
  仅依赖匿名 ttwid + 真实 a_bogus 签名即可拿到无水印直链。
- 抖音「个人主页作品列表」`aweme/post` **同样匿名可用**（不像搜索那样强制登录 2483），
  因此粘贴 douyin.com/user/xxxx 可拉取该用户全部作品（已实测 status_code:0、可翻页）。
- 小红书笔记接口**强制登录**，必须带 web_session + a1 Cookie，否则 -101。
  因此小红书链接解析（含个人主页 user_posted）在未填 Cookie 时返回 need_cookie 提示。
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import threading
import time
import urllib.parse
from typing import Any, Callable, Awaitable

import httpx

from .base import UA, AdapterError, Author, MediaItem, MediaType, pick_ext
from . import xhs_sign

try:
    from .abogus import ABogus

    _ABOGUS_OK = True
except Exception:
    _ABOGUS_OK = False


# ----------------------------------------------------------------- 抖音

_DOUYIN_DETAIL = "https://www.douyin.com/aweme/v1/web/aweme/detail/"

_DOUYIN_BASE = {
    "device_platform": "webapp",
    "aid": "6383",
    "channel": "channel_pc_web",
    "version_code": "170400",
    "version_name": "17.4.0",
    "cookie_enabled": "true",
    "screen_width": "1920",
    "screen_height": "1080",
    "browser_language": "zh-CN",
    "browser_platform": "MacIntel",
    "browser_name": "Chrome",
    "browser_version": "131.0.0.0",
    "browser_online": "true",
    "engine_name": "Blink",
    "engine_version": "131.0.0.0",
    "os_name": "Mac+OS",
    "os_version": "10.15.7",
    "platform": "PC",
}

_TOKEN_RE = re.compile(
    r"(?:v\.douyin\.com/([A-Za-z0-9]+))"          # 短链
    r"|(?:douyin\.com/(?:video|share/video|note|share/note)/(\d+))"  # 长链/分享链/图集(note)
    r"|(?:douyin\.com/discover\?[^ ]*modal_id=(\d+))"  # 发现页
    r"|(?:^|\s)(\d{15,19})(?=\s|$)"                 # 纯数字 ID
)

_ID_RE = re.compile(r"douyin\.com/(?:video|share/video|note|share/note)/(\d+)")


# ----------------------------------------------------------------- 抖音：链接分类（统一识别 → 分发）

from dataclasses import dataclass  # noqa: E402  （仅本模块使用的轻量结构）


@dataclass
class DouyinLink:
    kind: str            # single | profile | collection | favorites
    id: str = ""         # aweme_id / sec_uid / mix_id（favorites 可能为空）
    folder_id: str = ""  # 收藏夹子夹 ID（仅 favorites）
    raw: str = ""        # 原始命中串
    short_code: str = "" # 短链码（v.douyin.com/<code>），用于「短码→规范ID」规则复用


# ----------------------------------------------------------------- 解析规则/结果持久化
# 成功解析后记录「链接规则（种类 + 规范 ID）+ 最近一次成功结果」。
# 用途：① 下次同规则链接（尤其短链）跳过易抖动的在线重定向，直接走已验证方案；
#       ② 在线解析偶发失败时，回退到此前成功解析的本地缓存结果。

_RULE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "parse_rules.json"
)
_rule_lock = threading.Lock()


def _rule_load() -> dict:
    try:
        with open(_RULE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _rule_dump(db: dict) -> None:
    try:
        os.makedirs(os.path.dirname(_RULE_PATH), exist_ok=True)
        with open(_RULE_PATH, "w", encoding="utf-8") as f:
            json.dump(db, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def record_parse_rule(
    key: str,
    kind: str,
    canonical_id: str = "",
    short_code: str = "",
    authors: list | None = None,
) -> None:
    """记录一条成功解析：规则(种类+规范ID) + 最近一次成功结果(可选)。"""
    if not key:
        return
    with _rule_lock:
        db = _rule_load()
        rec = db.get(key, {})
        rec["kind"] = kind
        if canonical_id:
            rec["canonical_id"] = canonical_id
        if short_code:
            rec["short_code"] = short_code
        if authors is not None:
            rec["authors"] = authors
        rec["ts"] = int(time.time())
        rec["hits"] = int(rec.get("hits", 0)) + 1
        db[key] = rec
        _rule_dump(db)


def lookup_parse_rule(key: str) -> dict | None:
    """按 key 查询已记录的解析规则/结果。返回 dict 或 None。"""
    if not key:
        return None
    with _rule_lock:
        return _rule_load().get(key)


def _link_keys(l: "DouyinLink") -> list[str]:
    """一个链接对应的全部持久化 key（规范 ID、短码、收藏夹标识）。"""
    keys: list[str] = []
    if l.id:
        keys.append(l.id)
    if l.short_code:
        keys.append(l.short_code)
    if l.kind == "favorites":
        keys.append("favorites" + (f"_{l.folder_id}" if l.folder_id else ""))
    return [k for k in keys if k]


def _cached_authors_for(dy_links: list, kind: str) -> list:
    """在线解析失败时，从本地规则库回退取回已验证的作者结果。"""
    out: list = []
    for l in dy_links:
        if l.kind != kind:
            continue
        for key in _link_keys(l):
            rec = lookup_parse_rule(key)
            if rec and rec.get("authors"):
                for a in rec["authors"]:
                    try:
                        out.append(Author.from_dict(a))
                    except Exception:
                        pass
                break
    return out


# 各形态正则（顺序敏感：先匹配更具体的收藏夹/合集/主页，再单作品，最后短链）
_RE_FAV_SELF = re.compile(r"douyin\.com/user/self\b")
_RE_FAV_QUERY = re.compile(r"[?&](?:showTab|showSubTab|tab)=([^&?#\s]*)")
_RE_FAV_FOLDER = re.compile(r"[?&](?:favorite_)?folder_id=([^&?#\s]+)")
_RE_COLLECTION = re.compile(r"douyin\.com/collection/([^/?#\s]+)")
_RE_PROFILE = re.compile(r"(?:douyin\.com/user/|iesdouyin\.com/share/user/)([^/?#\s]+)")
_RE_SINGLE = re.compile(
    r"(?:douyin\.com/(?:video|note|share/video|share/note)/|"
    r"iesdouyin\.com/share/(?:video|note)/)(\d+)"
)
_RE_DISCOVER = re.compile(r"[?&]modal_id=(\d+)")
_RE_SHORT = re.compile(r"(?:https?://)?(?:v\.douyin\.com|iesdouyin\.com/share)/([A-Za-z0-9_.\-]+)")


async def _classify_token(client, token, depth=0):
    """单条 token 分类，必要时跟随短链重定向。返回 DouyinLink 或 None。"""
    token = (token or "").strip()
    if not token:
        return None
    # 收藏夹：douyin.com/user/self 带 favorite 参数（需登录）；或任意 user 页带 favorite 查询
    if _RE_FAV_SELF.search(token) or re.search(r"douyin\.com/user/[^/?#\s]+[?#][^ ]*favorite", token):
        folder = _RE_FAV_FOLDER.search(token)
        return DouyinLink(kind="favorites", folder_id=folder.group(1) if folder else "", raw=token)
    # 合集（创作者公开 playlist，匿名可拉）
    m = _RE_COLLECTION.search(token)
    if m:
        return DouyinLink(kind="collection", id=m.group(1), raw=token)
    # 个人主页
    m = _RE_PROFILE.search(token)
    if m:
        return DouyinLink(kind="profile", id=m.group(1), raw=token)
    # 单作品（视频 / 图集 note）
    m = _RE_SINGLE.search(token)
    if m:
        return DouyinLink(kind="single", id=m.group(1), raw=token)
    # 发现页 / 搜索页 modal_id
    m = _RE_DISCOVER.search(token)
    if m:
        return DouyinLink(kind="single", id=m.group(1), raw=token)
    # 纯数字 15~19 位 aweme_id
    m = re.search(r"(?<!\d)(\d{15,19})(?!\d)", token)
    if m:
        return DouyinLink(kind="single", id=m.group(1), raw=token)
    # 短链：① 优先用已记录的「短码→规范ID」规则直接解析（规避在线重定向抖动）；
    #       ② 否则跟随重定向再分类；③ 重定向失败但有记录则回退规则。
    m = _RE_SHORT.search(token)
    if m:
        code = m.group(1)
        rec = lookup_parse_rule(code)
        if rec and rec.get("canonical_id"):
            return DouyinLink(
                kind=rec.get("kind") or "single",
                id=rec["canonical_id"],
                short_code=code,
                raw=token,
            )
        if client is not None and depth < 2:
            try:
                url = token if token.startswith("http") else "https://" + token
                r = await client.get(url, headers={"User-Agent": UA}, follow_redirects=True, timeout=15)
                sub = await _classify_token(client, str(r.url), depth + 1)
                if sub is not None:
                    if not sub.short_code:
                        sub.short_code = code
                    return sub
                # 重定向成功但无法识别，用已记录规则兜底
                rec2 = lookup_parse_rule(code)
                if rec2 and rec2.get("canonical_id"):
                    return DouyinLink(
                        kind=rec2.get("kind") or "single",
                        id=rec2["canonical_id"],
                        short_code=code,
                        raw=token,
                    )
            except Exception:
                rec2 = lookup_parse_rule(code)
                if rec2 and rec2.get("canonical_id"):
                    return DouyinLink(
                        kind=rec2.get("kind") or "single",
                        id=rec2["canonical_id"],
                        short_code=code,
                        raw=token,
                    )
    return None


async def classify_douyin_links(client, text):
    """把粘贴文本拆分为多条抖音链接并分类，返回去重后的 DouyinLink 列表。"""
    out: list[DouyinLink] = []
    seen: set[tuple] = set()
    for token in re.split(r"[\s,，;；]+", text or ""):
        link = await _classify_token(client, token)
        if not link:
            continue
        key = (link.kind, link.id, link.folder_id)
        if key in seen:
            continue
        seen.add(key)
        out.append(link)
    return out


async def _ensure_ttwid(client: httpx.AsyncClient) -> str:
    try:
        r = await client.post(
            "https://ttwid.bytedance.com/ttwid/union/register/",
            json={"region": "cn", "aid": 1768, "needFid": False,
                  "service": "www.ixigua.com", "union": True},
            headers={"User-Agent": UA, "Content-Type": "application/json"},
        )
        return r.cookies.get("ttwid", "")
    except httpx.HTTPError:
        return ""


def _replace_cookie_ttwid(cookie: str, new_ttwid: str) -> str:
    """把 cookie 里的 ttwid 换成新值，**保留 sessionid 等全部登录态字段**。

    ⚠️ 不能像旧代码那样「cookie 含 ttwid 就整串照用」——那样新注册的 ttwid 会被
    直接丢弃，所谓"换新会话续拉"就等于没换（同一 ttwid 持续被风控）。
    也不能整串替换成 ttwid（实测会破坏登录态，作品数暴跌）。
    """
    if not cookie:
        return f"ttwid={new_ttwid}"
    if not new_ttwid:
        return cookie
    parts = [p.strip() for p in cookie.split(";") if p.strip()]
    out: list[str] = []
    replaced = False
    for p in parts:
        if p.startswith("ttwid="):
            out.append(f"ttwid={new_ttwid}")
            replaced = True
        else:
            out.append(p)
    if not replaced:
        out.append(f"ttwid={new_ttwid}")
    return "; ".join(out)


async def _resolve_douyin_id(client: httpx.AsyncClient, token: str) -> str | None:
    """把一段分享文本里的抖音 token 归一化为 video_id。"""
    m = _TOKEN_RE.search(token)
    if not m:
        return None
    groups = m.groups()
    # groups: (0)短链 (1)长链/分享链 (2)发现页 (3)纯数字ID
    # 纯数字直接命中
    if groups[3]:
        return groups[3]
    # 短链：跟随重定向拿真实地址
    if groups[0]:
        try:
            r = await client.get(
                f"https://v.douyin.com/{groups[0]}/",
                headers={"User-Agent": UA},
                follow_redirects=True,
            )
            mm = _ID_RE.search(str(r.url))
            if mm:
                return mm.group(1)
        except httpx.HTTPError:
            return None
    # 长链 / 发现页
    for g in (groups[1], groups[2], groups[3]):
        if g:
            return g
    return None


def _best_url(urls: list[str] | None) -> str:
    if not urls:
        return ""
    https = [u for u in urls if u.startswith("http")]
    return (https or urls)[0]


def _extract_douyin_items(aweme: dict[str, Any], media_type: MediaType) -> list[MediaItem]:
    aweme_id = str(aweme.get("aweme_id") or "")
    desc = (aweme.get("desc") or "").strip()
    images = aweme.get("images")

    want_all = media_type in (None, "auto")
    if images:
        if not want_all and media_type != "image":
            return []
        out: list[MediaItem] = []
        for idx, img in enumerate(images):
            url = _best_url(img.get("url_list"))
            if not url:
                continue
            out.append(
                MediaItem(
                    id=f"{aweme_id}_{idx}",
                    type="image",
                    url=url,
                    thumb=_best_url(img.get("url_list")),
                    width=int(img.get("width") or 0),
                    height=int(img.get("height") or 0),
                    title=desc,
                    ext=pick_ext(url, "jpg"),
                )
            )
        return out

    # video
    if not want_all and media_type != "video":
        return []
    video = aweme.get("video") or {}
    url = ""
    bit_rates = video.get("bit_rate") or []
    if bit_rates:
        best = max(bit_rates, key=lambda b: b.get("bit_rate") or 0)
        url = _best_url((best.get("play_addr") or {}).get("url_list"))
    if not url:
        url = _best_url((video.get("play_addr") or {}).get("url_list"))
    if not url:
        return []
    return [
        MediaItem(
            id=aweme_id,
            type="video",
            url=url,
            thumb=_best_url((video.get("cover") or {}).get("url_list"))
            or _best_url((video.get("origin_cover") or {}).get("url_list")),
            width=int(video.get("width") or 0),
            height=int(video.get("height") or 0),
            title=desc,
            duration=float(video.get("duration") or 0) / 1000.0,
            ext="mp4",
        )
    ]


async def resolve_douyin(
    client: httpx.AsyncClient, text: str, media_type: MediaType,
    douyin_cookie: str = "",
    progress_cb: ProgressCB = None,
) -> list[Author]:
    if not _ABOGUS_OK:
        raise AdapterError("a_bogus 签名模块不可用，请确认已安装 gmssl 依赖。")

    ids: list[str] = []
    seen: set[str] = set()
    for line in re.split(r"[\s,，;；]+", text):
        line = line.strip()
        if not line:
            continue
        did = await _resolve_douyin_id(client, line)
        if did and did not in seen:
            seen.add(did)
            ids.append(did)

    if not ids:
        raise AdapterError("没有从输入中识别到抖音视频链接或 ID。")

    ttwid = await _ensure_ttwid(client)
    authors: list[Author] = []
    skipped = 0
    for i, vid in enumerate(ids):
        await _call_cb(progress_cb, f"正在解析抖音视频 {i + 1}/{len(ids)} …")
        params = dict(_DOUYIN_BASE)
        params["aweme_id"] = vid
        query = urllib.parse.urlencode(params)
        signed_query, _, _ = ABogus(user_agent=UA).generate_abogus(query)
        cookie_parts = []
        if ttwid:
            cookie_parts.append(f"ttwid={ttwid}")
        if douyin_cookie:
            cookie_parts.append(douyin_cookie)
        headers = {
            "User-Agent": UA,
            "Referer": f"https://www.douyin.com/video/{vid}",
            "Cookie": "; ".join(cookie_parts),
        }
        try:
            r = await client.get(f"{_DOUYIN_DETAIL}?{signed_query}", headers=headers)
        except httpx.HTTPError as exc:
            raise AdapterError(f"抖音请求失败：{exc}") from exc
        if r.status_code != 200:
            skipped += 1
            continue
        try:
            j = r.json()
        except ValueError:
            skipped += 1
            continue
        if j.get("status_code") not in (0, None):
            skipped += 1
            continue
        aweme = j.get("aweme_detail") or {}
        if not aweme:
            skipped += 1
            continue
        items = _extract_douyin_items(aweme, media_type)
        if not items:
            skipped += 1
            continue
        a = aweme.get("author") or {}
        authors.append(
            Author(
                id=str(a.get("sec_uid") or a.get("uid") or vid),
                nickname=a.get("nickname") or "抖音用户",
                avatar=_best_url(
                    (a.get("avatar_thumb") or {}).get("url_list")
                    or (a.get("avatar_larger") or {}).get("url_list")
                ),
                handle=a.get("unique_id") or str(a.get("short_id") or ""),
                followers=int(a.get("follower_count") or 0),
                platform="douyin",
                home_url=f"https://www.douyin.com/user/{a.get('sec_uid') or vid}",
                signature=(a.get("signature") or "").strip(),
                items=items,
            )
        )
    if not authors:
        raise AdapterError(
            "解析完成但未获取到可下载内容。"
            + ("（部分链接类型与所选分类不符，或链接已失效）" if skipped else "")
        )
    return authors


# ----------------------------------------------------------------- 抖音：个人主页作品列表

_DOUYIN_POST = "https://www.douyin.com/aweme/v1/web/aweme/post/"
# 个人主页链接可能有两种形态：
#   douyin.com/user/<sec_uid>
#   iesdouyin.com/share/user/<sec_uid>   （分享短链 v.douyin.com/xxx 常重定向到这里）
_DOUYIN_PROFILE_RE = re.compile(r"(?:douyin\.com/user/|iesdouyin\.com/share/user/)([^/?#\s]+)")


async def _extract_douyin_profile_ids(client: httpx.AsyncClient, text: str) -> list[str]:
    """从输入里提取抖音个人主页的 sec_user_id。

    支持以下形态：
    - douyin.com/user/<sec_uid>
    - iesdouyin.com/share/user/<sec_uid>（分享短链 v.douyin.com/xxx 通常重定向到这里）
    - 直接粘贴 v.douyin.com/xxx 短链：跟随重定向后从落地页路径或 sec_uid 查询参数提取
    """
    ids: list[str] = []
    seen: set[str] = set()
    for line in re.split(r"[\s,，;；]+", text):
        line = line.strip()
        if not line:
            continue
        m = _DOUYIN_PROFILE_RE.search(line)
        if m:
            su = m.group(1)
        elif "v.douyin.com/" in line or "iesdouyin.com/" in line:
            try:
                r = await client.get(
                    line, headers={"User-Agent": UA}, follow_redirects=True
                )
                final = str(r.url)
                mm = _DOUYIN_PROFILE_RE.search(final)
                su = mm.group(1) if mm else None
            except httpx.HTTPError:
                su = None
        else:
            su = None
        if su and su not in seen:
            seen.add(su)
            ids.append(su)
    return ids


ProgressCB = Callable[[str], Awaitable[None]] | None


async def _call_cb(cb: ProgressCB, msg: str) -> None:
    if cb:
        try:
            await cb(msg)
        except Exception:
            pass


async def _fetch_douyin_works(
    client: httpx.AsyncClient, ttwid: str, sec: str, max_pages: int = 80,
    cookie: str = "", progress_cb: ProgressCB = None,
) -> tuple[list[dict[str, Any]], dict[str, Any], bool]:
    """翻页拉取某用户全部作品（aweme 列表）。返回 (awemes, profile_author, capped)。

    capped=True 表示因匿名翻页被限流而只拿到了部分作品（通常最近 11~20 个），
    带登录 Cookie（sessionid 等）时可稳定翻到该用户全部作品。

    风控说明（实测 2026-09-05）：
    - 抖音对 `aweme/post` 的连续请求会触发 ArgusSecurityPlugin 风控，表现为
      偶发 403（"Uifid Not Found"）或 200 但 `aweme_list` 为空。二者都是**瞬时**的，
      重试（刷新签名）即可恢复，绝非"已到末尾"。
    - 旧实现 `status_code != 200` 直接 break、空页 empty_streak>=5 直接 break，
      于是首次 403/空页就终止翻页 → 只拿到前面几十~一百多条。
    - 关键 BUG（曾导致 622 作品主页只解析出 96）：a_bogus 签名在重试循环**外**只生成
      一次，所有重试发同一签名 → 抖音判脚本持续 403、重试完全无效。**现签名在循环内每次刷新。**
    - 另一个 BUG：「换新 ttwid 会话」实际没换（登录态 cookie 自带 ttwid，新生成的被丢弃）。
      **现用 `_replace_cookie_ttwid` 只替换 ttwid、保留全部登录态字段。**
    - 稳定性（实测 622 主页曾 200+/400+ 抖动的根因）：撞墙时若**瞬间爆发几十个真实请求**，
      会把 IP 滑动窗口限流打爆 → 每次撞墙位置随机、拿到数量随机。正确做法：
      ① 正常页/瞬时 403 用内层循环**立即重试（无等待）**——这是用户要的"无冷却"；
      ② 仅当内层重试**全部耗尽（确认撞墙）**时，才 `sleep(_WALL_BACKOFF)` 让窗口滑动，
         再换新 ttwid 会话续拉。该退避**只在撞墙时出现**，正常翻页零延迟。
      实测固定 6s 退避 + max_retry=4 + max_resets=3 → 连续 3 次均稳定 621/621/621。
    """
    awemes: list[dict[str, Any]] = []
    seen: set[str] = set()
    profile: dict[str, list] = {}
    capped = False
    # 避免重复 ttwid：登录态 cookie 自带 ttwid，若再前置一个"生成的 ttwid"会造成
    # 两个 ttwid 冲突，抖音可能把请求当匿名新会话、只返回最近 ~20 条作品。
    # 因此 cookie 里已有 ttwid 时直接整串使用；否则用生成的 ttwid 做匿名访客标识。
    if cookie and "ttwid=" in cookie:
        cookie_str = cookie
    elif cookie:
        cookie_str = f"ttwid={ttwid}; {cookie}"
    else:
        cookie_str = f"ttwid={ttwid}"
    # publish_video=0 表示「全部类型」（视频 + 图文），无需再分两次拉。
    cursor = 0
    pages = 0
    transient = 0          # 当前页瞬时风控（403/空页）连续重试次数
    resets = 0             # 「撞风控墙换新会话」已重试次数
    # 撞墙退避：仅在内层重试全部耗尽（确认撞墙）后才等待，让 IP 滑动窗口限流窗口滑动，
    # 避免瞬间爆发几十个真实请求把窗口打爆导致数量随机（200+/400+ 抖动）。
    # 正常页与瞬时 403 的内层重试不等待（用户要的"无冷却"）。
    _WALL_BACKOFF = 8      # 秒
    max_retry = 4          # 单页瞬时失败最大重试次数（仍失败则判定撞墙）
    max_resets = 4         # 撞墙后最多换新 ttwid 会话续拉的次数
    while pages < max_pages:
        params = dict(_DOUYIN_BASE)
        params.update({
            "sec_user_id": sec,
            "count": "50",
            "max_cursor": str(cursor),
            "min_cursor": "0",
            "source_type": "12",
            "publish_video": "0",
            "adapt_scale": "2",
        })
        headers = {
            "User-Agent": UA,
            "Referer": f"https://www.douyin.com/user/{sec}",
            "Cookie": cookie_str,
        }
        # ---- 单页请求：403 / 网络错误 / 非 JSON 一律按瞬时风控重试 ----
        # ⚠️ 关键：_rt + a_bogus 签名必须在**重试循环内部**每次重新生成。
        # 抖音会把「重复相同签名」的请求判为脚本并持续 403；若签名在循环外只生成
        # 一次，则所有重试发的都是同一个签名，重试完全无效 → 撞墙即卡死
        # （实测 622 作品主页曾只解析出 96 个，就是栽在这里）。
        j = None
        first_err = None
        for attempt in range(max_retry):
            params["_rt"] = str((time.time_ns() // 1000) & 0x7FFFFFFF)
            query = urllib.parse.urlencode(params)
            signed_query, _, _ = ABogus(user_agent=UA).generate_abogus(query)
            try:
                r = await client.get(f"{_DOUYIN_POST}?{signed_query}", headers=headers)
            except httpx.HTTPError as exc:
                first_err = first_err or exc
                continue
            if r.status_code != 200:
                # 403 / 5xx：风控，退避后重试（同一签名可能已被标记，下一轮会刷新）
                first_err = first_err or AdapterError(f"抖音返回 {r.status_code}")
                continue
            try:
                j = r.json()
            except ValueError:
                # 偶发被风控返回非 JSON（验证页），退避后重试
                first_err = first_err or AdapterError("抖音返回了非 JSON 内容（可能被风控）")
                continue
            break  # 200 + 可解析 JSON，进入下一步
        if j is None:
            # 整页重试耗尽仍失败：可能是当前会话被风控锁死。带登录态时换新 ttwid
            # 会话续拉；匿名则无法绕过，直接报错/返回已拿到部分。
            if cookie and resets < max_resets:
                # 撞墙：先退避让 IP 限流窗口滑动，再换新 ttwid 会话续拉
                await asyncio.sleep(_WALL_BACKOFF)
                resets += 1
                ttwid = await _ensure_ttwid(client)
                cookie_str = _replace_cookie_ttwid(cookie, ttwid)
                await _call_cb(progress_cb, f"🔄 第 {pages + 1} 页请求被风控，已换新会话继续（第 {resets} 次，已获取 {len(awemes)} 个）")
                continue
            if pages == 0:
                raise AdapterError(
                    f"抖音风控：连续 {max_retry} 次请求被拒绝"
                    + ("，请检查 Cookie 是否有效或稍后重试。" if cookie else "，建议填入登录 Cookie 后重试。")
                )
            await _call_cb(progress_cb, f"⚠️ 第 {pages + 1} 页连续风控，已停止翻页（已获取 {len(awemes)} 个作品）")
            break
        if j.get("status_code") not in (0, None):
            # 业务级错误码（如登录态失效 0x...），非瞬时，停止。
            if pages == 0:
                raise AdapterError(f"抖音解析失败（status_code={j.get('status_code')}）")
            break
        lst = j.get("aweme_list") or []
        if not lst:
            # 有 has_more 却返回空：绝大多数情况是瞬时风控（同一游标单独探测能拿到内容），
            # 少数是真实间隔（私密/已删作品）。按瞬时重试，重试耗尽再判定为间隔并停止。
            if not j.get("has_more"):
                break
            transient += 1
            if transient >= max_retry:
                # 撞风控墙：带登录态换新 ttwid 会话从同一游标续拉；匿名则标记 capped 停止。
                if cookie and resets < max_resets:
                    # 撞墙：先退避让 IP 限流窗口滑动，再换新 ttwid 会话续拉
                    await asyncio.sleep(_WALL_BACKOFF)
                    resets += 1
                    ttwid = await _ensure_ttwid(client)
                    cookie_str = _replace_cookie_ttwid(cookie, ttwid)
                    await _call_cb(progress_cb, f"🔄 第 {pages + 1} 页持续为空，已换新会话继续（第 {resets} 次，已获取 {len(awemes)} 个）")
                    continue
                if not cookie:
                    capped = True
                await _call_cb(progress_cb, f"⚠️ 第 {pages + 1} 页持续为空，已停止翻页（已获取 {len(awemes)} 个作品）")
                break
            continue
        transient = 0
        for aw in lst:
            aid = str(aw.get("aweme_id") or "")
            if aid in seen:
                continue
            seen.add(aid)
            awemes.append(aw)
            if not profile:
                profile = aw.get("author") or {}
        await _call_cb(progress_cb, f"正在获取抖音作品列表… 第 {pages + 1} 页，已获取 {len(awemes)} 个作品")
        if not j.get("has_more"):
            break
        cursor = j.get("max_cursor") or 0
        pages += 1
    return awemes, profile, capped


async def resolve_douyin_profile(
    client: httpx.AsyncClient, text: str, media_type: MediaType, cookie: str = "",
    progress_cb: ProgressCB = None,
) -> list[Author]:
    """解析抖音个人主页链接，拉取该用户全部作品。

    匿名可用（无需 Cookie），但匿名态抖音会限制翻页，只能拿到最近一批作品
    （约 11~20 条）；要拉取该用户全部作品需传入登录态 Cookie（sessionid 等）。
    """
    if not _ABOGUS_OK:
        raise AdapterError("a_bogus 签名模块不可用，请确认已安装 gmssl 依赖。")
    sec_ids = await _extract_douyin_profile_ids(client, text)
    if not sec_ids:
        raise AdapterError("没有从输入中识别到抖音个人主页链接（形如 douyin.com/user/xxxx）。")
    await _call_cb(progress_cb, f"正在获取抖音用户主页作品（共 {len(sec_ids)} 个用户）…")
    ttwid = await _ensure_ttwid(client)
    authors: list[Author] = []
    for sec in sec_ids:
        awemes, profile, capped = await _fetch_douyin_works(
            client, ttwid, sec, cookie=cookie, progress_cb=progress_cb,
        )
        items: list[MediaItem] = []
        for aw in awemes:
            items.extend(_extract_douyin_items(aw, media_type))
        if not items:
            continue
        a = profile or {}
        authors.append(
            Author(
                id=sec,
                nickname=a.get("nickname") or "抖音用户",
                avatar=_best_url(
                    (a.get("avatar_thumb") or {}).get("url_list")
                    or (a.get("avatar_larger") or {}).get("url_list")
                ),
                handle=a.get("unique_id") or str(a.get("short_id") or ""),
                followers=int(a.get("follower_count") or 0),
                platform="douyin",
                home_url=f"https://www.douyin.com/user/{sec}",
                signature=(a.get("signature") or "").strip(),
                items=items,
                capped=capped,
            )
        )
    if not authors:
        raise AdapterError(
            "已识别到抖音个人主页，但当前分类下没有可下载的作品"
            "（该用户可能只发布了另一种类型，或主页为空）。"
        )
    return authors


# ----------------------------------------------------------------- 抖音：合集（创作者公开 playlist，匿名可拉）

_DOUYIN_MIX = "https://www.douyin.com/aweme/v1/web/mix/aweme/"


async def _fetch_douyin_collection(
    client, ttwid, mix_id, cookie="", progress_cb: ProgressCB = None, max_pages: int = 40,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """翻页拉取合集内全部作品（aweme 列表）。返回 (awemes, profile_author)。

    接口与 aweme/post 同构（均返回 aweme_list），仅参数由 sec_user_id 换成 mix_id。
    注意：具体字段名（cursor/max_cursor/count）以抖音线上为准，若失效请按线上响应调整。
    """
    awemes: list[dict[str, Any]] = []
    seen: set[str] = set()
    profile: dict[str, Any] = {}
    cookie_str = f"ttwid={ttwid}" + (f"; {cookie}" if cookie else "")
    cursor = 0
    pages = 0
    empty_streak = 0
    while pages < max_pages:
        params = dict(_DOUYIN_BASE)
        params.update({
            "mix_id": mix_id,
            "count": "50",
            "cursor": str(cursor),
            "min_cursor": "0",
            "max_cursor": str(cursor),
            "source_type": "12",
        })
        query = urllib.parse.urlencode(params)
        signed_query, _, _ = ABogus(user_agent=UA).generate_abogus(query)
        headers = {
            "User-Agent": UA,
            "Referer": f"https://www.douyin.com/collection/{mix_id}",
            "Cookie": cookie_str,
        }
        try:
            r = await client.get(f"{_DOUYIN_MIX}?{signed_query}", headers=headers)
        except httpx.HTTPError as exc:
            raise AdapterError(f"抖音合集请求失败：{exc}") from exc
        if r.status_code != 200:
            break
        try:
            j = r.json()
        except ValueError:
            empty_streak += 1
            if empty_streak >= 3:
                break
            continue
        if j.get("status_code") not in (0, None):
            raise AdapterError("抖音合集接口返回异常（链接可能已失效或需登录）。")
        lst = j.get("aweme_list") or []
        if not lst:
            empty_streak += 1
            if empty_streak >= 2:
                break
            continue
        empty_streak = 0
        for aw in lst:
            aid = str(aw.get("aweme_id") or "")
            if aid in seen:
                continue
            seen.add(aid)
            awemes.append(aw)
            if not profile:
                profile = aw.get("author") or {}
        await _call_cb(progress_cb, f"正在获取抖音合集作品… 第 {pages + 1} 页，已获取 {len(awemes)} 个")
        if not j.get("has_more"):
            break
        cursor = j.get("max_cursor") or cursor
        pages += 1
    return awemes, profile


async def resolve_douyin_collection(
    client, mix_id, media_type: MediaType, cookie: str = "",
    progress_cb: ProgressCB = None,
) -> list[Author]:
    """解析抖音合集（创作者公开的 playlist），拉取合集内全部作品（匿名可用）。"""
    if not _ABOGUS_OK:
        raise AdapterError("a_bogus 签名模块不可用，请确认已安装 gmssl 依赖。")
    if not mix_id:
        raise AdapterError("没有从输入中识别到抖音合集链接（形如 douyin.com/collection/xxxx）。")
    await _call_cb(progress_cb, f"正在解析抖音合集 {mix_id} …")
    ttwid = await _ensure_ttwid(client)
    awemes, profile = await _fetch_douyin_collection(
        client, ttwid, mix_id, cookie=cookie, progress_cb=progress_cb,
    )
    items: list[MediaItem] = []
    for aw in awemes:
        items.extend(_extract_douyin_items(aw, media_type))
    if not items:
        raise AdapterError("该合集没有可下载的作品（可能已失效或为空）。")
    a = profile or {}
    nick = a.get("nickname") or ""
    return [Author(
        id=f"mix_{mix_id}",
        nickname=(nick + " 的合集") if nick else "抖音合集",
        avatar=_best_url(
            (a.get("avatar_thumb") or {}).get("url_list")
            or (a.get("avatar_larger") or {}).get("url_list")
        ),
        handle=a.get("unique_id") or "",
        followers=int(a.get("follower_count") or 0),
        platform="douyin",
        home_url=f"https://www.douyin.com/collection/{mix_id}",
        signature=(a.get("signature") or "").strip(),
        items=items,
    )]


# ----------------------------------------------------------------- 抖音：收藏夹（我的收藏，需登录）

_DOUYIN_FAV = "https://www.douyin.com/aweme/v1/web/aweme/favorite/"


async def _fetch_douyin_favorite(
    client, ttwid, cookie, folder_id="", progress_cb: ProgressCB = None, max_pages: int = 60,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """翻页拉取登录用户收藏夹作品（aweme 列表）。需带登录态 Cookie（sessionid 等）。

    接口与 aweme/post 同构（均返回 aweme_list）。folder_id 可选，用于拉取具体某个收藏夹。
    注意：具体字段名以抖音线上为准，若失效请按线上响应调整。
    """
    awemes: list[dict[str, Any]] = []
    seen: set[str] = set()
    profile: dict[str, Any] = {}
    cookie_str = f"ttwid={ttwid}" + (f"; {cookie}" if cookie else "")
    cursor = 0
    pages = 0
    empty_streak = 0
    while pages < max_pages:
        params = dict(_DOUYIN_BASE)
        params.update({
            "count": "50",
            "cursor": str(cursor),
            "min_cursor": "0",
            "max_cursor": str(cursor),
            "source_type": "12",
        })
        if folder_id:
            params["folder_id"] = folder_id
        query = urllib.parse.urlencode(params)
        signed_query, _, _ = ABogus(user_agent=UA).generate_abogus(query)
        headers = {
            "User-Agent": UA,
            "Referer": "https://www.douyin.com/user/self?showTab=favorite_collection",
            "Cookie": cookie_str,
        }
        try:
            r = await client.get(f"{_DOUYIN_FAV}?{signed_query}", headers=headers)
        except httpx.HTTPError as exc:
            raise AdapterError(f"抖音收藏夹请求失败：{exc}") from exc
        if r.status_code != 200:
            raise AdapterError(
                "抖音收藏夹接口拒绝访问（HTTP %d，Cookie 可能已失效或未登录）。请重新同步抖音登录 Cookie。"
                % r.status_code,
                need_cookie=True,
            )
        try:
            j = r.json()
        except ValueError:
            empty_streak += 1
            if empty_streak >= 3:
                break
            continue
        if j.get("status_code") not in (0, None):
            # 未登录 / Cookie 失效通常返回非 0
            raise AdapterError(
                "抖音收藏夹接口拒绝访问（Cookie 可能已失效或未登录）。请重新同步抖音登录 Cookie。",
                need_cookie=True,
            )
        lst = j.get("aweme_list") or []
        if not lst:
            empty_streak += 1
            if empty_streak >= 2:
                break
            continue
        empty_streak = 0
        for aw in lst:
            aid = str(aw.get("aweme_id") or "")
            if aid in seen:
                continue
            seen.add(aid)
            awemes.append(aw)
            if not profile:
                profile = aw.get("author") or {}
        await _call_cb(progress_cb, f"正在获取抖音收藏夹作品… 第 {pages + 1} 页，已获取 {len(awemes)} 个")
        if not j.get("has_more"):
            break
        cursor = j.get("max_cursor") or cursor
        pages += 1
    return awemes, profile


async def resolve_douyin_favorites(
    client, folder_id="", media_type: MediaType = "auto", cookie: str = "",
    progress_cb: ProgressCB = None,
) -> list[Author]:
    """解析抖音收藏夹（登录用户自己的收藏）。必须传入登录态 Cookie（sessionid 等）。"""
    if not _ABOGUS_OK:
        raise AdapterError("a_bogus 签名模块不可用，请确认已安装 gmssl 依赖。")
    if not cookie:
        raise AdapterError(
            "抖音收藏夹需要登录态。请在右上角「设置」里同步抖音 Cookie（含 sessionid）后重试。",
            need_cookie=True,
        )
    await _call_cb(progress_cb, "正在解析抖音收藏夹…")
    ttwid = await _ensure_ttwid(client)
    awemes, profile = await _fetch_douyin_favorite(
        client, ttwid, cookie, folder_id=folder_id, progress_cb=progress_cb,
    )
    items: list[MediaItem] = []
    for aw in awemes:
        items.extend(_extract_douyin_items(aw, media_type))
    if not items:
        raise AdapterError("收藏夹中没有可下载的作品（可能为空，或当前 Cookie 无权限）。")
    a = profile or {}
    return [Author(
        id="favorites" + (f"_{folder_id}" if folder_id else ""),
        nickname=a.get("nickname") or "我的抖音收藏",
        avatar=_best_url(
            (a.get("avatar_thumb") or {}).get("url_list")
            or (a.get("avatar_larger") or {}).get("url_list")
        ),
        handle=a.get("unique_id") or "",
        followers=int(a.get("follower_count") or 0),
        platform="douyin",
        home_url="https://www.douyin.com/user/self?showTab=favorite_collection",
        signature=(a.get("signature") or "").strip(),
        items=items,
    )]


# ----------------------------------------------------------------- 小红书

_XHS_FEED = "https://edith.xiaohongshu.com/api/sns/web/v1/feed"
_XHS_USER_POSTED = "https://edith.xiaohongshu.com/api/sns/web/v1/user_posted"


def _extract_xhs_id(text: str) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    for m in re.finditer(r"(?:xiaohongshu\.com|xhslink\.com)[^\s]*?/?(?:explore|discovery/item|item)/([0-9a-zA-Z]+)", text):
        nid = m.group(1)
        if nid not in seen:
            seen.add(nid)
            ids.append(nid)
    # 纯 24 位 hex note id
    for m in re.finditer(r"(?<!\w)([0-9a-fA-F]{24})(?!\w)", text):
        if m.group(1) not in seen:
            seen.add(m.group(1))
            ids.append(m.group(1))
    return ids


def _extract_xhs_xsec(text: str) -> str:
    """从分享链接里提取 xsec_token（小红书 2025+ 反爬：笔记详情必须带分享时的 xsec_token）。"""
    m = re.search(r"xsec_token=([^&\s\"'<>]+)", text)
    return m.group(1) if m else ""


def _balanced_json_str(text: str, start: int) -> str | None:
    """从 start 处（'\"noteCard\"' 等 key 位置）平衡提取完整 JSON 对象字符串。"""
    i = text.find("{", start)
    if i < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    for j in range(i, len(text)):
        c = text[j]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return text[i : j + 1]
    return None


def _js_unescape(s: str) -> str:
    """把 SSR 里的 \\uXXXX 转义串还原为真实字符（如 https:\\u002F\\u002F -> https://）。"""
    if not s:
        return s
    try:
        return json.loads('"' + s + '"')
    except ValueError:
        return s


async def _fetch_xhs_note_ssr(
    client: httpx.AsyncClient, nid: str, xsec: str, cookie: str,
) -> dict[str, Any] | None:
    """从笔记页 HTML（SSR）提取笔记详情，绕过已失效的签名接口。"""
    url = f"https://www.xiaohongshu.com/discovery/item/{nid}"
    params: dict[str, str] = {}
    if xsec:
        params["xsec_token"] = xsec
        params["xsec_source"] = "pc_share"
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,*/*",
        "Referer": "https://www.xiaohongshu.com/",
        "Cookie": cookie,
    }
    try:
        r = await client.get(url, params=params, headers=headers)
    except httpx.HTTPError as exc:
        raise AdapterError(f"小红书页面请求失败：{exc}") from exc
    if r.status_code != 200:
        return None
    html = r.text
    # noteCard：图片列表 / 视频信息
    i = html.find('"noteCard"')
    card_raw = _balanced_json_str(html, i) if i >= 0 else None
    card: dict[str, Any] = {}
    if card_raw:
        try:
            card = json.loads(re.sub(r"\bundefined\b|\bNaN\b", "null", card_raw))
        except ValueError:
            pass
    # noteId / title / user（这三者在 SSR 里相邻；user 内部字段顺序不定，如 userId 可能先于 nickname）
    m_id = re.search(r'"noteId":"([0-9a-zA-Z]+)"', html)
    m_title = re.search(r'"noteId":"[0-9a-zA-Z]+".{0,1200}?"title":"((?:[^"\\]|\\.)*)"', html)
    m_user = re.search(
        r'"user":\{"[^{}]*?"nickname":"((?:[^"\\]|\\.)*)"[^{}]*?"avatar":"((?:[^"\\]|\\.)*)"',
        html,
    )
    if not card and not m_id:
        return None
    return {
        "note_id": (m_id.group(1) if m_id else nid),
        "title": _js_unescape(m_title.group(1)) if m_title else "",
        "user": {
            "nickname": _js_unescape(m_user.group(1)) if m_user else "小红书用户",
            "avatar": _js_unescape(m_user.group(2)) if m_user else "",
        },
        "type": card.get("type", "normal"),
        "cover": card.get("cover") or {},
        "image_list": card.get("imageList") or [],
        "video": card.get("video") or {},
    }


def _xhs_headers(cookie: str, a1: str) -> dict[str, str]:
    uri = "/api/sns/web/v1/feed?note_id=&image_formats=jpg,webp,avif"
    sig = xhs_sign.sign(uri, None, a1, ua=UA)
    return {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www.xiaohongshu.com",
        "Referer": "https://www.xiaohongshu.com/",
        "Cookie": cookie,
        "x-s": sig["x-s"],
        "x-t": sig["x-t"],
        "x-s-common": sig["x-s-common"],
    }


async def resolve_xhs(
    client: httpx.AsyncClient, text: str, cookie: str, media_type: MediaType,
    progress_cb: ProgressCB = None,
) -> list[Author]:
    if not cookie:
        raise AdapterError(
            "小红书笔记接口强制要求登录态。请在右上角「设置」里粘贴小红书 Cookie"
            "（需含 web_session、a1）后重试。",
            need_cookie=True,
        )
    ids = _extract_xhs_id(text)
    if not ids:
        raise AdapterError("没有从输入中识别到小红书笔记链接或 ID。")
    xsec = _extract_xhs_xsec(text)

    authors: list[Author] = []
    for i, nid in enumerate(ids):
        await _call_cb(progress_cb, f"正在解析小红书笔记 {i + 1}/{len(ids)} …")
        note = await _fetch_xhs_note_ssr(client, nid, xsec, cookie)
        if not note:
            continue
        media = _extract_xhs(note, media_type)
        if not media:
            continue
        user = note.get("user") or {}
        uid = ""
        authors.append(
            Author(
                id=uid or nid,
                nickname=user.get("nickname") or "小红书用户",
                avatar=user.get("avatar") or "",
                handle="",
                followers=0,
                platform="xhs",
                home_url=f"https://www.xiaohongshu.com/explore/{nid}",
                items=media,
            )
        )
    if not authors:
        raise AdapterError("解析完成但未获取到可下载内容（链接已失效或类型不符）。")
    return authors


def _extract_xhs(note: dict[str, Any], media_type: MediaType) -> list[MediaItem]:
    note_id = note.get("note_id") or ""
    title = (note.get("display_title") or note.get("title") or "").strip()
    cover = note.get("cover") or {}
    cover_url = (
        cover.get("url_default") or cover.get("urlDefault")
        or cover.get("url") or ""
    )
    note_type = note.get("type")

    want_all = media_type in (None, "auto")
    if note_type == "video":
        if not want_all and media_type != "video":
            return []
        video = note.get("video") or {}
        key = (video.get("media") or {}).get("stream") or {}
        url = ""
        for fmt in ("h264", "h265", "av1"):
            streams = key.get(fmt) or []
            if streams:
                s0 = streams[0]
                url = (
                    s0.get("master_url") or s0.get("masterUrl")
                    or s0.get("backup_urls") or s0.get("backupUrls") or [""]
                )
                if isinstance(url, list):
                    url = url[0] if url else ""
                if url:
                    break
        if not url:
            return []
        return [MediaItem(id=str(note_id), type="video", url=url,
                          thumb=cover_url, title=title, ext="mp4")]

    if not want_all and media_type != "image":
        return []
    images = note.get("image_list") or []
    out: list[MediaItem] = []
    for idx, img in enumerate(images):
        info = img.get("info_list") or []
        url = ""
        for i in info:
            if i.get("image_scene") in ("WB_DFT", "WB_PRV"):
                url = i.get("url") or ""
                if i.get("image_scene") == "WB_DFT":
                    break
        if not url:
            url = img.get("url_default") or img.get("urlDefault") or img.get("url") or cover_url
        if not url:
            continue
        out.append(MediaItem(id=f"{note_id}_{idx}", type="image", url=url,
                             thumb=img.get("url_default") or img.get("urlDefault") or url,
                             width=int(img.get("width") or 0),
                             height=int(img.get("height") or 0),
                             title=title, ext="jpg"))
    if not out and cover_url and (want_all or media_type == "image"):
        out.append(MediaItem(id=f"{note_id}_0", type="image", url=cover_url,
                             thumb=cover_url, title=title, ext="jpg"))
    return out


# ----------------------------------------------------------------- 小红书：个人主页作品列表

_XHS_PROFILE_RE = re.compile(r"xiaohongshu\.com/user/profile/([^/?#\s]+)")


def _xhs_profile_headers(cookie: str, a1: str, uri: str) -> dict[str, str]:
    sig = xhs_sign.sign(uri, None, a1, ua=UA)
    return {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www.xiaohongshu.com",
        "Referer": "https://www.xiaohongshu.com/",
        "Cookie": cookie,
        "x-s": sig["x-s"],
        "x-t": sig["x-t"],
        "x-s-common": sig["x-s-common"],
    }


def _extract_xhs_profile_ids(text: str) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    for m in re.finditer(_XHS_PROFILE_RE, text):
        uid = m.group(1)
        if uid not in seen:
            seen.add(uid)
            ids.append(uid)
    return ids


async def _fetch_xhs_profile_notes(
    client: httpx.AsyncClient, uid: str, xsec: str, cookie: str,
) -> list[tuple[str, str]]:
    """抓主页 HTML（SSR），提取第一页笔记的 (note_id, xsec_token) 列表。

    小红书 2025+ 反爬：笔记详情必须带各自的 xsec_token，主页 noteCard 里会带。
    """
    url = f"https://www.xiaohongshu.com/user/profile/{uid}"
    params: dict[str, str] = {}
    if xsec:
        params["xsec_token"] = xsec
        params["xsec_source"] = "pc_user"
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,*/*",
        "Referer": "https://www.xiaohongshu.com/",
        "Cookie": cookie,
    }
    try:
        r = await client.get(url, params=params, headers=headers)
    except httpx.HTTPError as exc:
        raise AdapterError(f"小红书主页请求失败：{exc}") from exc
    if r.status_code != 200:
        return []
    html = r.text
    pairs: list[tuple[str, str]] = []
    seen: set[str] = set()
    for m in re.finditer(r'"noteId":"([0-9a-zA-Z]+)"[^{}]*?"xsecToken":"((?:[^"\\]|\\.)*)"', html):
        nid, tok = m.group(1), m.group(2)
        if nid not in seen:
            seen.add(nid)
            pairs.append((nid, tok))
    return pairs
async def _fetch_xhs_works(
    client: httpx.AsyncClient, cookie: str, a1: str, uid: str, max_pages: int = 60,
    progress_cb: ProgressCB = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    notes: list[dict[str, Any]] = []
    profile: dict[str, Any] = {}
    cursor = ""
    pages = 0
    while pages < max_pages:
        uri = (
            f"/api/sns/web/v1/user_posted?num=30&cursor={cursor}"
            f"&user_id={uid}&image_formats=jpg,webp,avif"
        )
        headers = _xhs_profile_headers(cookie, a1, uri)
        try:
            r = await client.get(
                _XHS_USER_POSTED + "?" + uri.split("?", 1)[1], headers=headers
            )
        except httpx.HTTPError as exc:
            raise AdapterError(f"小红书请求失败：{exc}") from exc
        if r.status_code != 200:
            break
        try:
            data = r.json()
        except ValueError:
            break
        if not data.get("success", False):
            code = data.get("code")
            if code in (-100, -101) or "登录" in (data.get("msg") or ""):
                raise AdapterError("小红书提示需要登录，请重新粘贴有效 Cookie。", need_cookie=True)
            break
        d = data.get("data") or {}
        batch = d.get("notes") or d.get("items") or []
        if not batch:
            break  # 空页直接结束，避免 has_more 异常时死循环
        for note in batch:
            card = note.get("note_card") or note
            if not profile:
                profile = card.get("user") or {}
            notes.append(card)
        await _call_cb(progress_cb, f"正在获取小红书作品列表… 第 {pages + 1} 页，已获取 {len(notes)} 个笔记")
        if not d.get("has_more", False):
            break
        cursor = d.get("cursor") or ""
        pages += 1
    return notes, profile


async def resolve_xhs_profile(
    client: httpx.AsyncClient, text: str, cookie: str, media_type: MediaType,
    progress_cb: ProgressCB = None,
) -> list[Author]:
    """解析小红书个人主页链接，拉取该用户全部笔记（SSR 方案，需 Cookie）。"""
    if not cookie:
        raise AdapterError(
            "小红书个人主页解析需要登录态。请在右上角「设置」里粘贴小红书 Cookie"
            "（需含 web_session、a1）后重试。",
            need_cookie=True,
        )
    uids = _extract_xhs_profile_ids(text)
    if not uids:
        raise AdapterError(
            "没有从输入中识别到小红书个人主页链接（形如 xiaohongshu.com/user/profile/xxxx）。"
        )
    xsec = _extract_xhs_xsec(text)
    await _call_cb(progress_cb, f"正在获取小红书用户主页作品（共 {len(uids)} 个用户）…")
    authors: list[Author] = []
    sem = asyncio.Semaphore(5)

    async def fetch_one(nid: str, tok: str) -> dict[str, Any] | None:
        async with sem:
            try:
                return await _fetch_xhs_note_ssr(client, nid, tok, cookie)
            except Exception:  # noqa: BLE001
                return None

    for uid in uids:
        pairs = await _fetch_xhs_profile_notes(client, uid, xsec, cookie)
        if not pairs:
            continue
        await _call_cb(progress_cb, f"主页共 {len(pairs)} 个笔记，正在逐个解析…")
        notes = await asyncio.gather(*[fetch_one(nid, tok) for nid, tok in pairs])
        notes = [n for n in notes if n]
        items: list[MediaItem] = []
        for note in notes:
            items.extend(_extract_xhs(note, media_type))
        if not items:
            continue
        u = (notes[0].get("user") or {}) if notes else {}
        authors.append(
            Author(
                id=uid,
                nickname=u.get("nickname") or "小红书用户",
                avatar=u.get("avatar") or "",
                handle="",
                followers=0,
                platform="xhs",
                home_url=f"https://www.xiaohongshu.com/user/profile/{uid}",
                items=items,
            )
        )
    if not authors:
        raise AdapterError("已识别到小红书个人主页，但当前分类下没有可下载的作品。")
    return authors


# ----------------------------------------------------------------- 入口

async def parse(
    text: str,
    media_type: MediaType = "auto",
    cookie: str = "",
    platform: str = "auto",
    douyin_cookie: str = "",
    progress_cb: ProgressCB = None,
) -> tuple[list[Author], str, str]:
    """解析链接。返回 (authors, source, notice)。

    media_type="auto"（默认）时自动识别每条内容的类型，视频与图片一并返回，
    由前端按类型分块展示；也可显式传 "video" / "image" 做过滤。
    platform="auto" 时按文本自动识别抖音/小红书并分别解析：
    - 抖音匿名可用（无需 Cookie）；但翻全作品列表需登录 Cookie（douyin_cookie）
    - 小红书强登录，未填 Cookie 时仅给出提示，不阻断抖音结果
    cookie 用于小红书；douyin_cookie 用于抖音（个人主页翻全作品）。
    progress_cb 为可选的异步进度回调，接收进度文本。
    """
    if not text.strip():
        raise AdapterError("请粘贴分享链接或视频 ID。")

    await _call_cb(progress_cb, "正在识别链接类型…")
    force_dy = platform == "douyin"
    force_xhs = platform == "xhs"
    # 早期守卫：文本里是否含任一抖音域名 / 短链 / 纯数字 aweme_id，或小红书链接
    has_dy_domain = bool(re.search(r"(?:v\.douyin\.com|douyin\.com|iesdouyin\.com)", text)) \
        or bool(re.search(r"(?<!\d)\d{15,19}(?!\d)", text))
    has_xhs = force_xhs or (not force_dy and bool(_extract_xhs_id(text)))
    has_xhs_profile = bool(_XHS_PROFILE_RE.search(text))
    if not (has_dy_domain or has_xhs or has_xhs_profile):
        raise AdapterError("没有从输入中识别到抖音或小红书链接。")
    # 目前仅支持抖音：单独粘贴小红书链接时明确提示（抖音 + 小红书混贴则走抖音）
    if (has_xhs or has_xhs_profile) and not (has_dy_domain or force_dy):
        raise AdapterError("目前仅支持抖音链接解析，小红书暂不支持。请粘贴抖音分享链接。")

    async with httpx.AsyncClient(timeout=25, follow_redirects=True, trust_env=False) as client:
        authors: list[Author] = []
        notice = ""

        # 抖音：先统一识别链接类型，再分发到对应解析方案
        # （单作品 / 图集、个人主页、合集、收藏夹），各类型独立解析、结果聚合
        if force_dy or not force_xhs:
            dy_links = await classify_douyin_links(client, text)
            kinds = {l.kind for l in dy_links}
            # single 优先用已解析出的规范 aweme_id（短链重定向已解出的 ID），避免解析时二次重定向
            single_text = "\n".join((l.id or l.raw) for l in dy_links if l.kind == "single")
            profile_text = "\n".join(l.raw for l in dy_links if l.kind == "profile")

            async def _run_kind(kind, coro):
                """解析某一类链接：成功则记录规则+结果；失败则回退本地缓存。"""
                nonlocal notice
                try:
                    res = await coro
                    authors.extend(res)
                    rec_authors = [a.to_dict() for a in res]
                    for l in dy_links:
                        if l.kind != kind:
                            continue
                        for key in _link_keys(l):
                            record_parse_rule(
                                key, kind, canonical_id=l.id,
                                short_code=l.short_code, authors=rec_authors,
                            )
                    return True
                except AdapterError as exc:
                    cached = _cached_authors_for(dy_links, kind)
                    if cached:
                        authors.extend(cached)
                        notice = "部分链接在线解析失败，已自动回退到此前成功解析的本地缓存。"
                        return True
                    if exc.need_cookie and not authors:
                        raise
                    notice = exc.message
                    return False
                except Exception as exc:  # noqa: BLE001
                    cached = _cached_authors_for(dy_links, kind)
                    if cached:
                        authors.extend(cached)
                        notice = "部分链接在线解析失败，已自动回退到此前成功解析的本地缓存。"
                        return True
                    if not authors:
                        raise
                    notice = str(exc)[:200]
                    return False

            if "profile" in kinds and profile_text:
                await _run_kind(
                    "profile",
                    resolve_douyin_profile(
                        client, profile_text, media_type, cookie=douyin_cookie,
                        progress_cb=progress_cb,
                    ),
                )
            if "single" in kinds and single_text:
                await _run_kind(
                    "single",
                    resolve_douyin(
                        client, single_text, media_type, douyin_cookie=douyin_cookie,
                        progress_cb=progress_cb,
                    ),
                )
            for l in [x for x in dy_links if x.kind == "collection"]:
                await _run_kind(
                    "collection",
                    resolve_douyin_collection(
                        client, l.id, media_type, cookie=douyin_cookie,
                        progress_cb=progress_cb,
                    ),
                )
            for l in [x for x in dy_links if x.kind == "favorites"]:
                await _run_kind(
                    "favorites",
                    resolve_douyin_favorites(
                        client, l.folder_id, media_type, cookie=douyin_cookie,
                        progress_cb=progress_cb,
                    ),
                )

        # 小红书：个人主页优先于单条笔记
        if (force_xhs or not force_dy) and has_xhs_profile:
            xhs_profile_ids = _extract_xhs_profile_ids(text)
        else:
            xhs_profile_ids = []
        if xhs_profile_ids:
            try:
                authors += await resolve_xhs_profile(
                    client, text, cookie, media_type, progress_cb=progress_cb,
                )
            except AdapterError as exc:
                if exc.need_cookie:
                    note = "小红书需要登录后才能解析，请在右上角「设置」填入 Cookie。"
                    notice = (notice + "；" + note) if notice else note
                    if not authors:
                        raise
                else:
                    note = exc.message
                    notice = (notice + "；" + note) if notice else note
        elif has_xhs:
            try:
                authors += await resolve_xhs(
                    client, text, cookie, media_type, progress_cb=progress_cb,
                )
            except AdapterError as exc:
                if exc.need_cookie:
                    note = "小红书需要登录后才能解析，请在右上角「设置」填入 Cookie。"
                    notice = (notice + "；" + note) if notice else note
                    if not authors:
                        raise
                else:
                    note = exc.message
                    notice = (notice + "；" + note) if notice else note

    if not authors:
        raise AdapterError(notice or "未解析到可下载内容。")
    return authors, "real", notice
