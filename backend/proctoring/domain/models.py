from dataclasses import dataclass

import numpy as np


@dataclass
class AnalysisResult:
    face_count: int
    sideways_score: float | None
    violations: list[str]


@dataclass
class RegisteredUser:
    username: str
    signatures: list[np.ndarray]
    first_name: str = ""
    last_name: str = ""
    email: str = ""
