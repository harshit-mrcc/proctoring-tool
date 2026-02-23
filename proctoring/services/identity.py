from __future__ import annotations

import base64
from typing import Any

import cv2
import numpy as np

from proctoring.domain import RegisteredUser


def decode_data_url_image(data_url: str) -> np.ndarray:
    if not data_url or "," not in data_url:
        raise ValueError("Invalid image payload")

    encoded = data_url.split(",", 1)[1]
    img_bytes = base64.b64decode(encoded)
    nparr = np.frombuffer(img_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Could not decode frame")
    return frame


def decode_payload_frame(payload: dict[str, Any], key: str = "image") -> np.ndarray:
    return decode_data_url_image(str(payload.get(key, "")))


def collect_registration_image_payloads(payload: dict[str, Any]) -> list[str]:
    image_data = payload.get("image", "")
    images_data = payload.get("images")

    if isinstance(images_data, list):
        return [str(item) for item in images_data if isinstance(item, str)]
    if isinstance(image_data, str) and image_data:
        return [image_data]
    return []


def _clip_bbox(
    x: int,
    y: int,
    w: int,
    h: int,
    frame_w: int,
    frame_h: int,
    pad_ratio: float = 0.2,
) -> tuple[int, int, int, int]:
    pad_x = int(w * pad_ratio)
    pad_y = int(h * pad_ratio)
    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(frame_w, x + w + pad_x)
    y2 = min(frame_h, y + h + pad_y)
    return x1, y1, x2, y2


def extract_single_face_crop(face_detection: Any, frame_bgr: np.ndarray) -> np.ndarray:
    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    detections = face_detection.process(frame_rgb).detections or []

    if len(detections) == 0:
        raise ValueError("No face detected")
    if len(detections) > 1:
        raise ValueError("Multiple faces detected")

    det = detections[0]
    bbox = det.location_data.relative_bounding_box
    frame_h, frame_w = frame_bgr.shape[:2]

    x = int(bbox.xmin * frame_w)
    y = int(bbox.ymin * frame_h)
    w = int(bbox.width * frame_w)
    h = int(bbox.height * frame_h)
    x1, y1, x2, y2 = _clip_bbox(x, y, w, h, frame_w, frame_h)

    face_crop = frame_bgr[y1:y2, x1:x2]
    if face_crop.size == 0:
        raise ValueError("Face crop failed")
    return face_crop


def compute_face_signature(face_crop_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2GRAY)
    normalized = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_AREA)

    hist = cv2.calcHist([normalized], [0], None, [32], [0, 256]).flatten()
    hist = hist / (np.linalg.norm(hist) + 1e-8)

    patch = cv2.resize(normalized, (24, 24), interpolation=cv2.INTER_AREA).astype(np.float32)
    patch = patch.flatten()
    patch = (patch - patch.mean()) / (patch.std() + 1e-8)
    patch = patch / (np.linalg.norm(patch) + 1e-8)

    signature = np.concatenate([hist, patch])
    signature = signature / (np.linalg.norm(signature) + 1e-8)
    return signature.astype(np.float32)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8
    return float(np.dot(a, b) / denom)


def verify_identity_for_user(
    registered_faces: dict[str, RegisteredUser],
    face_detection: Any,
    username: str,
    frame_bgr: np.ndarray,
    threshold: float,
) -> tuple[bool, float]:
    user = registered_faces.get(username.lower())
    if user is None:
        raise ValueError("User is not registered")

    face_crop = extract_single_face_crop(face_detection, frame_bgr)
    signature = compute_face_signature(face_crop)
    best_score = max(cosine_similarity(signature, reference) for reference in user.signatures)
    return best_score >= threshold, best_score


def estimate_frame_brightness(frame_bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    return float(np.mean(gray))


def detect_phone_like_object(frame_bgr: np.ndarray) -> bool:
    """
    Lightweight heuristic for phone-in-hand detection.
    Detects medium/large rectangular objects with phone-like aspect ratio.
    """
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 70, 160)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    frame_h, frame_w = frame_bgr.shape[:2]
    frame_area = float(frame_h * frame_w)

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < frame_area * 0.03:
            continue

        perimeter = cv2.arcLength(contour, True)
        if perimeter <= 0:
            continue
        approx = cv2.approxPolyDP(contour, 0.03 * perimeter, True)
        if len(approx) != 4:
            continue

        x, y, w, h = cv2.boundingRect(approx)
        if w <= 0 or h <= 0:
            continue

        aspect_ratio = w / float(h)
        normalized_ratio = aspect_ratio if aspect_ratio <= 1.0 else 1.0 / aspect_ratio
        if 0.45 <= normalized_ratio <= 0.75:
            if (w * h) >= frame_area * 0.05:
                return True

    return False
