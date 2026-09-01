"""小红书 x-s / x-t 签名（纯 Python 实现）。

小红书 Web 端对 /api/sns/web/* 请求要求 X-s、X-t 头。
算法：md5("urlPATH" + payload + salt) -> 自定义 base64 编码，
再包一层 JSON 描述（x0/x1/x2/x3/x4）后做 base64。

注意：该算法随小红书前端更新会变化，签名失败时上层会抛出可读错误。
"""
from __future__ import annotations

import base64
import hashlib
import json
import time

# 小红书自定义 base64 码表
_LOOKUP = [
    "Z", "m", "s", "e", "r", "b", "B", "o", "H", "Q", "t", "N", "P", "+", "w", "O",
    "c", "z", "a", "/", "L", "p", "n", "g", "G", "8", "y", "J", "q", "4", "2", "K",
    "W", "Y", "j", "0", "D", "S", "f", "d", "i", "k", "x", "3", "V", "T", "1", "6",
    "I", "l", "U", "A", "F", "M", "9", "7", "h", "E", "C", "v", "u", "R", "X", "5",
]

_XHS_SALT = "WSUDD"


def _tri_bit(a: int, b: int, c: int) -> int:
    return (a << 16) | (b << 8) | c


def _encode_chunk(chunk: bytes) -> str:
    n = len(chunk)
    padded = chunk + b"\x00" * (3 - n)
    val = _tri_bit(padded[0], padded[1], padded[2])
    out = [
        _LOOKUP[(val >> 18) & 63],
        _LOOKUP[(val >> 12) & 63],
        _LOOKUP[(val >> 6) & 63] if n > 1 else "=",
        _LOOKUP[val & 63] if n > 2 else "=",
    ]
    return "".join(out)


def _b64_custom(data: bytes) -> str:
    return "".join(_encode_chunk(data[i : i + 3]) for i in range(0, len(data), 3))


def sign(uri: str, payload: object, a1: str = "", *, ua: str = "") -> dict[str, str]:
    """生成 X-s / X-t 请求头。

    uri:     形如 /api/sns/web/v1/search/notes（含 query 时一并传入）
    payload: POST body（dict）或 None（GET）
    a1:      Cookie 里的 a1 值
    """
    xt = str(int(time.time() * 1000))

    if payload is None:
        body = ""
    elif isinstance(payload, str):
        body = payload
    else:
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)

    raw = f"x-s{_XHS_SALT}x-t{xt}{uri}{body}"
    digest = hashlib.md5(raw.encode("utf-8")).hexdigest()
    xs_core = _b64_custom(digest.encode("utf-8"))

    envelope = {
        "signSvn": "56",
        "signType": "x2",
        "appId": "xhs-pc-web",
        "signVersion": "1",
        "payload": xs_core,
    }
    xs = "XYW_" + base64.b64encode(
        json.dumps(envelope, separators=(",", ":")).encode("utf-8")
    ).decode("utf-8")

    return {"x-s": xs, "x-t": xt, "x-s-common": _x_s_common(a1, xs, xt)}


def _x_s_common(a1: str, xs: str, xt: str) -> str:
    payload = {
        "s0": 5,
        "s1": "",
        "x0": "1",
        "x1": "3.7.8-2",
        "x2": "Mac OS",
        "x3": "xhs-pc-web",
        "x4": "4.74.0",
        "x5": a1,
        "x6": xt,
        "x7": xs,
        "x8": "I38rHdgsjopgIvesdVwgIC+oIELmBZ5e3VwXLgFTIxS3bqwErFeexd0ekncAzMFYnqthIhJeSBMDKutRI3KsYorWHPtGrbV0P9WfIi/eWc6eYqtyQApPI37ekmR1QL+5Ii6sdneeSfqYHqwl2qt5B0DoIvMzoVtiIC6eDVwsHVgvIvesWkFbHiwYIiKsIx4bIvesWi7sHVwlIhJejVwsdVw1IEbmIx3sxi7sxVwvIC6ejVwsWlbmIvesWc7sxi7sxVwvIC6ejVwsWlbmIvesWc7sxi7sxVwvIC6ejVwsWlbm",
        "x9": 0,
        "x10": 1,
    }
    return base64.b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("utf-8")
