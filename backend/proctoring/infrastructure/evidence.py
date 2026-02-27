import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import cv2
import numpy as np


def load_violation_events(file_path: Path) -> dict[str, list[dict[str, Any]]]:
    if not file_path.exists():
        return {}
    try:
        payload = json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    if not isinstance(payload, dict):
        return {}

    events: dict[str, list[dict[str, Any]]] = {}
    for key, value in payload.items():
        if not isinstance(key, str) or not isinstance(value, list):
            continue
        clean_items: list[dict[str, Any]] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            image_path = str(item.get("image_path", "")).strip()
            timestamp = str(item.get("timestamp", "")).strip()
            violations = item.get("violations", [])
            if not image_path or not timestamp or not isinstance(violations, list):
                continue
            clean_items.append(
                {
                    "timestamp": timestamp,
                    "image_path": image_path,
                    "violations": [str(v) for v in violations if isinstance(v, str)],
                    "username": str(item.get("username", "")).strip(),
                }
            )
        events[key] = clean_items
    return events


def persist_violation_events(file_path: Path, events: dict[str, list[dict[str, Any]]]) -> None:
    file_path.write_text(json.dumps(events, indent=2), encoding="utf-8")


def append_violation_event(
    *,
    events: dict[str, list[dict[str, Any]]],
    file_path: Path,
    captures_dir: Path,
    user_key: str,
    username: str,
    violations: list[str],
    frame_bgr: np.ndarray,
    max_events_per_user: int,
) -> dict[str, Any]:
    captures_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    filename = f"{user_key.replace(' ', '_')}_{ts}_{uuid4().hex[:8]}.jpg"
    full_image_path = captures_dir / filename
    if not cv2.imwrite(str(full_image_path), frame_bgr):
        raise OSError("Could not save violation capture image")

    relative_image_path = str(Path("violation_captures") / filename).replace("\\", "/")
    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "image_path": relative_image_path,
        "violations": violations,
        "username": username,
    }

    per_user = events.setdefault(user_key, [])
    per_user.append(event)
    if len(per_user) > max_events_per_user:
        del per_user[: len(per_user) - max_events_per_user]

    persist_violation_events(file_path, events)
    return event
