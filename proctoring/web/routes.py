from __future__ import annotations

from typing import Any

import numpy as np
from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from flask import Response

from proctoring.config import (
    LIVE_IDENTITY_MISMATCH_STREAK_THRESHOLD,
    LIVE_MATCH_THRESHOLD,
    LOW_LIGHT_MEAN_THRESHOLD,
    MIN_DOWNLOAD_MBPS,
    REGISTRATION_CENTER_MAX,
    REGISTRATION_SIDE_MIN,
    START_MATCH_THRESHOLD,
)
from proctoring.domain import RegisteredUser
from proctoring.infrastructure import save_registered_faces
from proctoring.services.identity import (
    collect_registration_image_payloads,
    compute_face_signature,
    decode_data_url_image,
    decode_payload_frame,
    detect_phone_like_object,
    estimate_frame_brightness,
    extract_single_face_crop,
    verify_identity_for_user,
)
from proctoring.state import AppState
from proctoring.web.request_utils import (
    ensure_registered_and_verified,
    get_verified_user_key,
    is_mobile_request,
    mobile_not_supported_response,
    normalize_username,
    parse_non_negative_int,
    is_valid_person_name,
)


def register_routes(app: Flask, state: AppState) -> None:
    @app.route("/")
    def index() -> str:
        error_code = str(request.args.get("error", "")).strip().lower()
        return render_template(
            "index.html",
            mobile_detected=is_mobile_request(request),
            error_code=error_code,
            min_download_mbps=MIN_DOWNLOAD_MBPS,
        )

    @app.get("/device_check")
    def device_check() -> Any:
        mobile = is_mobile_request(request)
        return jsonify({"ok": True, "is_mobile": mobile, "supported": not mobile})

    @app.get("/speed_probe")
    def speed_probe() -> Response:
        return Response(b"0" * 256_000, mimetype="application/octet-stream")

    @app.get("/exam")
    def exam() -> str:
        if is_mobile_request(request):
            return redirect(url_for("index", error="mobile"))

        access = ensure_registered_and_verified(request.args.get("username"), state.registered_faces)
        if access is None:
            return redirect(url_for("index"))
        _, user = access
        from_setup = request.args.get("proctor") == "1"
        return render_template("exam.html", username=user.username, from_setup=from_setup)

    @app.get("/screen_share")
    def screen_share() -> str:
        if is_mobile_request(request):
            return redirect(url_for("index", error="mobile"))

        access = ensure_registered_and_verified(request.args.get("username"), state.registered_faces)
        if access is None:
            return redirect(url_for("index"))
        _, user = access
        return render_template("screen_share.html", username=user.username)

    @app.get("/face_register")
    def face_register() -> str:
        if is_mobile_request(request):
            return redirect(url_for("index", error="mobile"))

        username = str(request.args.get("username", "")).strip()
        if not username:
            return redirect(url_for("index"))
        return render_template("face_register.html", username=username)

    @app.get("/thank_you")
    def thank_you() -> str:
        access = ensure_registered_and_verified(request.args.get("username"), state.registered_faces)
        if access is None:
            return redirect(url_for("index"))
        _, user = access

        answered = parse_non_negative_int(request.args.get("answered", "0"))
        unanswered = parse_non_negative_int(request.args.get("unanswered", "0"))
        violations = parse_non_negative_int(request.args.get("violations", "0"))
        trust_score = max(0, 100 - (violations * 5))

        return render_template(
            "thank_you.html",
            username=user.username,
            answered=answered,
            unanswered=unanswered,
            violations=violations,
            trust_score=trust_score,
        )

    @app.post("/register_face")
    def register_face() -> tuple[Any, int] | Any:
        if is_mobile_request(request):
            return mobile_not_supported_response()

        payload = request.get_json(silent=True) or {}
        username, key = normalize_username(payload.get("username"))
        first_name = str(payload.get("first_name", "")).strip()
        last_name = str(payload.get("last_name", "")).strip()
        email = str(payload.get("email", "")).strip()
        if not username:
            return jsonify({"error": "Username is required"}), 400
        if not is_valid_person_name(first_name):
            return jsonify({"error": "Valid first name is required"}), 400
        if not is_valid_person_name(last_name):
            return jsonify({"error": "Valid last name is required"}), 400

        image_payloads = collect_registration_image_payloads(payload)
        if not image_payloads:
            return jsonify({"error": "At least one image is required"}), 400

        signatures: list[np.ndarray] = []
        try:
            for encoded_image in image_payloads:
                frame = decode_data_url_image(encoded_image)
                face_crop = extract_single_face_crop(state.analyzer.face_detection, frame)
                signatures.append(compute_face_signature(face_crop))
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

        if not signatures:
            return jsonify({"error": "Could not build face signatures"}), 400

        state.registered_faces[key] = RegisteredUser(
            username=username,
            signatures=signatures,
            first_name=first_name,
            last_name=last_name,
            email=email,
        )
        state.identity_mismatch_streaks.pop(key, None)
        try:
            save_registered_faces(app.config["REGISTERED_FACES_FILE"], state.registered_faces)
        except OSError:
            return jsonify({"error": "Face captured but could not save to disk"}), 500

        return jsonify(
            {
                "ok": True,
                "message": f"Face registered for {username} with {len(signatures)} samples",
            }
        )

    @app.post("/registration_pose_check")
    def registration_pose_check() -> tuple[Any, int] | Any:
        if is_mobile_request(request):
            return mobile_not_supported_response()

        payload = request.get_json(silent=True) or {}
        try:
            frame = decode_payload_frame(payload)
            result = state.analyzer.analyze(frame)
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

        pose_hint = "unknown"
        if result.face_count == 1 and result.sideways_score is not None:
            score = float(result.sideways_score)
            if abs(score) <= REGISTRATION_CENTER_MAX:
                pose_hint = "center"
            elif score >= REGISTRATION_SIDE_MIN:
                pose_hint = "right"
            elif score <= -REGISTRATION_SIDE_MIN:
                pose_hint = "left"

        return jsonify(
            {
                "face_count": result.face_count,
                "sideways_score": result.sideways_score,
                "pose_hint": pose_hint,
                "center_max": REGISTRATION_CENTER_MAX,
                "side_min": REGISTRATION_SIDE_MIN,
            }
        )

    @app.post("/verify_face")
    def verify_face() -> tuple[Any, int] | Any:
        if is_mobile_request(request):
            return mobile_not_supported_response()

        payload = request.get_json(silent=True) or {}
        username, key = normalize_username(payload.get("username"))
        if not username:
            return jsonify({"error": "Username is required"}), 400
        if key not in state.registered_faces:
            return jsonify({"error": "User is not registered"}), 400

        try:
            frame = decode_payload_frame(payload)
            is_match, score = verify_identity_for_user(
                registered_faces=state.registered_faces,
                face_detection=state.analyzer.face_detection,
                username=username,
                frame_bgr=frame,
                threshold=START_MATCH_THRESHOLD,
            )
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

        if is_match:
            session["verified_user"] = key
            state.identity_mismatch_streaks[key] = 0
        else:
            session.pop("verified_user", None)
            state.identity_mismatch_streaks.pop(key, None)

        return jsonify({"ok": True, "match": is_match, "score": score, "threshold": START_MATCH_THRESHOLD})

    @app.post("/analyze_frame")
    def analyze_frame() -> tuple[Any, int] | Any:
        if is_mobile_request(request):
            return mobile_not_supported_response()

        payload = request.get_json(silent=True) or {}
        username, key = normalize_username(payload.get("username"))

        if not username:
            return jsonify({"error": "Username is required"}), 400
        if get_verified_user_key() != key:
            return jsonify({"error": "Unauthorized monitoring session"}), 403
        if key not in state.registered_faces:
            return jsonify({"error": "User is not registered"}), 400

        try:
            frame = decode_payload_frame(payload)
            result = state.analyzer.analyze(frame)
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400
        brightness = estimate_frame_brightness(frame)
        if brightness < LOW_LIGHT_MEAN_THRESHOLD:
            result.violations.append("low_lighting")
        if detect_phone_like_object(frame):
            result.violations.append("phone_visible")

        identity_match: bool | None = None
        identity_score: float | None = None
        if result.face_count == 1:
            try:
                is_sideways = "looking_sideways" in result.violations
                if is_sideways:
                    state.identity_mismatch_streaks[key] = 0
                else:
                    identity_match, identity_score = verify_identity_for_user(
                        registered_faces=state.registered_faces,
                        face_detection=state.analyzer.face_detection,
                        username=username,
                        frame_bgr=frame,
                        threshold=LIVE_MATCH_THRESHOLD,
                    )
                    if identity_match:
                        state.identity_mismatch_streaks[key] = 0
                    else:
                        state.identity_mismatch_streaks[key] = state.identity_mismatch_streaks.get(key, 0) + 1

                if state.identity_mismatch_streaks.get(key, 0) >= LIVE_IDENTITY_MISMATCH_STREAK_THRESHOLD:
                    result.violations.append("identity_mismatch")
            except Exception as exc:
                return jsonify({"error": str(exc)}), 400

        return jsonify(
            {
                "face_count": result.face_count,
                "sideways_score": result.sideways_score,
                "identity_match": identity_match,
                "identity_score": identity_score,
                "identity_mismatch_streak": state.identity_mismatch_streaks.get(key, 0),
                "identity_live_threshold": LIVE_MATCH_THRESHOLD,
                "brightness": brightness,
                "violations": result.violations,
            }
        )
