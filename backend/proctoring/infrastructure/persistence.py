import json
from pathlib import Path
from typing import Any

import numpy as np

from proctoring.domain import RegisteredUser


def load_registered_faces(
    file_path: Path,
    registered_faces: dict[str, RegisteredUser],
) -> None:
    if not file_path.exists():
        return

    try:
        payload = json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return

    if not isinstance(payload, dict):
        return

    for key, value in payload.items():
        if not isinstance(value, dict):
            continue
        username = str(value.get("username", "")).strip()
        if not username:
            continue
        first_name = str(value.get("first_name", "")).strip()
        last_name = str(value.get("last_name", "")).strip()
        email = str(value.get("email", "")).strip()

        signatures_raw = value.get("signatures")
        signatures: list[np.ndarray] = []
        if isinstance(signatures_raw, list):
            for raw in signatures_raw:
                if not isinstance(raw, list):
                    continue
                signature = np.array(raw, dtype=np.float32)
                if signature.size > 0:
                    signatures.append(signature)
        else:
            legacy_signature_raw = value.get("signature")
            if isinstance(legacy_signature_raw, list):
                legacy_signature = np.array(legacy_signature_raw, dtype=np.float32)
                if legacy_signature.size > 0:
                    signatures.append(legacy_signature)

        if signatures:
            registered_faces[key] = RegisteredUser(
                username=username,
                signatures=signatures,
                first_name=first_name,
                last_name=last_name,
                email=email,
            )


def save_registered_faces(
    file_path: Path,
    registered_faces: dict[str, RegisteredUser],
) -> None:
    payload: dict[str, dict[str, Any]] = {}
    for key, user in registered_faces.items():
        payload[key] = {
            "username": user.username,
            "signatures": [signature.tolist() for signature in user.signatures],
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email,
        }
    file_path.write_text(
        json.dumps(payload, indent=2),
        encoding="utf-8",
    )
