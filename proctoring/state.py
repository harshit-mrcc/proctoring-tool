from dataclasses import dataclass, field

from proctoring.domain import RegisteredUser
from proctoring.services import ProctorAnalyzer


@dataclass
class AppState:
    analyzer: ProctorAnalyzer
    registered_faces: dict[str, RegisteredUser] = field(default_factory=dict)
    identity_mismatch_streaks: dict[str, int] = field(default_factory=dict)


def create_app_state() -> AppState:
    return AppState(analyzer=ProctorAnalyzer())
