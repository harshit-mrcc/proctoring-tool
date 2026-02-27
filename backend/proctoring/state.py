from dataclasses import dataclass, field
from typing import Any

from proctoring.domain import RegisteredUser
from proctoring.config import (
    PHONE_DETECTOR_CONFIDENCE,
    PHONE_DETECTOR_FRAME_SKIP,
    PHONE_DETECTOR_IMAGE_SIZE,
    PHONE_DETECTOR_IOU,
    PHONE_DETECTOR_MAX_DIM,
    PHONE_DETECTOR_MODEL_PATH,
)
from proctoring.services import ProctorAnalyzer
from proctoring.services.identity import PhoneDetector


@dataclass
class AppState:
    analyzer: ProctorAnalyzer
    phone_detector: PhoneDetector
    registered_faces: dict[str, RegisteredUser] = field(default_factory=dict)
    identity_mismatch_streaks: dict[str, int] = field(default_factory=dict)
    phone_visible_streaks: dict[str, int] = field(default_factory=dict)
    phone_visible_active: dict[str, bool] = field(default_factory=dict)
    violation_events: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    violation_capture_last_ts: dict[str, float] = field(default_factory=dict)


def create_app_state() -> AppState:
    return AppState(
        analyzer=ProctorAnalyzer(),
        phone_detector=PhoneDetector(
            model_path=PHONE_DETECTOR_MODEL_PATH,
            confidence=PHONE_DETECTOR_CONFIDENCE,
            iou=PHONE_DETECTOR_IOU,
            image_size=PHONE_DETECTOR_IMAGE_SIZE,
            frame_skip=PHONE_DETECTOR_FRAME_SKIP,
            max_dim=PHONE_DETECTOR_MAX_DIM,
        ),
    )
