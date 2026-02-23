import tempfile
import unittest
from pathlib import Path

import numpy as np

from proctoring.domain import RegisteredUser
from proctoring.infrastructure.persistence import load_registered_faces, save_registered_faces
from proctoring.services.identity import cosine_similarity


def _normalized_vector(rng: np.random.Generator, dim: int) -> np.ndarray:
    vec = rng.normal(0.0, 1.0, size=dim).astype(np.float32)
    norm = np.linalg.norm(vec) + 1e-8
    return vec / norm


def _build_user_signatures(
    rng: np.random.Generator,
    base_vec: np.ndarray,
    samples: int = 3,
    noise_scale: float = 0.03,
) -> list[np.ndarray]:
    signatures: list[np.ndarray] = []
    for _ in range(samples):
        noise = rng.normal(0.0, noise_scale, size=base_vec.shape[0]).astype(np.float32)
        vec = base_vec + noise
        vec = vec / (np.linalg.norm(vec) + 1e-8)
        signatures.append(vec.astype(np.float32))
    return signatures


class TestMassUserSimulation(unittest.TestCase):
    def test_save_and_load_100_users(self) -> None:
        rng = np.random.default_rng(42)
        users: dict[str, RegisteredUser] = {}
        dim = 64
        count = 100

        for idx in range(count):
            username = f"user{idx:03d}"
            key = username.lower()
            base = _normalized_vector(rng, dim)
            signatures = _build_user_signatures(rng, base, samples=3)
            users[key] = RegisteredUser(
                username=username,
                signatures=signatures,
                first_name=f"First{idx}",
                last_name=f"Last{idx}",
                email=f"user{idx:03d}@example.com",
            )

        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "registered_faces_test.json"
            save_registered_faces(file_path, users)

            loaded: dict[str, RegisteredUser] = {}
            load_registered_faces(file_path, loaded)

        self.assertEqual(len(loaded), count)
        sample = loaded["user000"]
        self.assertEqual(sample.first_name, "First0")
        self.assertEqual(sample.last_name, "Last0")
        self.assertEqual(sample.email, "user000@example.com")
        self.assertEqual(len(sample.signatures), 3)

    def test_identification_top1_correct_for_100_users(self) -> None:
        rng = np.random.default_rng(7)
        dim = 96
        count = 100

        user_bases: dict[str, np.ndarray] = {}
        user_refs: dict[str, list[np.ndarray]] = {}
        for idx in range(count):
            username = f"user{idx:03d}"
            base = _normalized_vector(rng, dim)
            user_bases[username] = base
            user_refs[username] = _build_user_signatures(rng, base, samples=3, noise_scale=0.025)

        correct = 0
        for username, base in user_bases.items():
            probe_noise = rng.normal(0.0, 0.02, size=dim).astype(np.float32)
            probe = base + probe_noise
            probe = probe / (np.linalg.norm(probe) + 1e-8)

            best_user = None
            best_score = -1.0
            for candidate_user, refs in user_refs.items():
                score = max(cosine_similarity(probe, ref) for ref in refs)
                if score > best_score:
                    best_score = score
                    best_user = candidate_user

            if best_user == username:
                correct += 1

        accuracy = correct / count
        self.assertGreaterEqual(
            accuracy,
            0.98,
            f"Expected >=98% top-1 accuracy for synthetic data, got {accuracy:.2%}",
        )


if __name__ == "__main__":
    unittest.main()
