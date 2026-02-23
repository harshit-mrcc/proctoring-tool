from typing import Any
import re

from flask import Request, jsonify, session

from proctoring.config import MOBILE_UA_TOKENS
from proctoring.domain import RegisteredUser


def normalize_username(value: Any) -> tuple[str, str]:
    username = str(value or "").strip()
    return username, username.lower()


def parse_non_negative_int(value: Any, default: int = 0) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return default


_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z' -]{0,48}$")


def is_valid_person_name(value: str) -> bool:
    return bool(_NAME_RE.fullmatch(value.strip()))


def get_verified_user_key() -> str:
    return str(session.get("verified_user", "")).strip().lower()


def ensure_registered_and_verified(
    username: str,
    registered_faces: dict[str, RegisteredUser],
) -> tuple[str, RegisteredUser] | None:
    _, key = normalize_username(username)
    if not key:
        return None
    user = registered_faces.get(key)
    if user is None or get_verified_user_key() != key:
        return None
    return key, user


def is_mobile_request(req: Request) -> bool:
    ch_mobile = (req.headers.get("Sec-CH-UA-Mobile") or "").strip().strip('"')
    if ch_mobile == "?1":
        return True

    user_agent = (req.user_agent.string or "").lower()
    desktop_markers = ("windows nt", "x11;", "cros", "linux x86_64")
    is_desktop_ua = any(marker in user_agent for marker in desktop_markers) or (
        "macintosh" in user_agent and "mobile" not in user_agent
    )
    if is_desktop_ua:
        return False

    if any(token in user_agent for token in MOBILE_UA_TOKENS):
        return True

    # Extra mobile/tablet signatures often missed in minimal UA token lists.
    mobile_markers = (
        "blackberry",
        "bb10",
        "silk",
        "kindle",
        "tablet",
        "mobile safari",
        "webos",
        "playbook",
    )
    if any(marker in user_agent for marker in mobile_markers):
        return True

    # iPadOS can report Mac platform while still being touch-mobile.
    if "macintosh" in user_agent and "mobile" in user_agent:
        return True

    ch_platform = (req.headers.get("Sec-CH-UA-Platform") or "").strip().strip('"').lower()
    if ch_platform in {"android", "ios", "ipados"}:
        return True

    return False


def mobile_not_supported_response(status_code: int = 400) -> tuple[Any, int]:
    return jsonify({"error": "Mobile devices are not supported. Please use a desktop/laptop browser."}), status_code
