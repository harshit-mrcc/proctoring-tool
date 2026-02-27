from __future__ import annotations

import time
from typing import Any

import numpy as np
from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from flask import Response

from proctoring.config import (
    ADMIN_PASSWORD,
    LIVE_IDENTITY_MISMATCH_STREAK_THRESHOLD,
    LIVE_MATCH_THRESHOLD,
    LOW_LIGHT_MEAN_THRESHOLD,
    MIN_DOWNLOAD_MBPS,
    PHONE_VISIBLE_STREAK_THRESHOLD,
    REGISTRATION_CENTER_MAX,
    REGISTRATION_MIN_FACE_AREA_RATIO,
    REGISTRATION_SIDE_MIN,
    START_MATCH_THRESHOLD,
    VIOLATION_CAPTURE_COOLDOWN_SECONDS,
)
from proctoring.domain import RegisteredUser
from proctoring.infrastructure import append_violation_event, save_registered_faces
from proctoring.services.identity import (
    collect_registration_image_payloads,
    compute_face_signature,
    decode_data_url_image,
    decode_payload_frame,
    estimate_frame_brightness,
    extract_single_face_crop,
    get_single_face_area_ratio,
    is_face_close_enough,
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
    def is_admin_authenticated() -> bool:
        return bool(session.get("admin_authenticated", False))

    def build_users_summary() -> list[dict[str, Any]]:
        users_summary: list[dict[str, Any]] = []
        for key, user in sorted(state.registered_faces.items(), key=lambda item: item[1].username.lower()):
            events = state.violation_events.get(key, [])
            last_violation = str(events[-1].get("timestamp", "")) if events else ""
            users_summary.append(
                {
                    "key": key,
                    "username": user.username,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "email": user.email,
                    "samples": len(user.signatures),
                    "violation_count": len(events),
                    "last_violation": last_violation,
                }
            )
        return users_summary

    def build_user_events(user_key: str) -> list[dict[str, Any]]:
        events = list(reversed(state.violation_events.get(user_key, [])))
        prepared_events: list[dict[str, Any]] = []
        for event in events:
            relative_path = str(event.get("image_path", "")).strip()
            if not relative_path:
                continue
            prepared_events.append(
                {
                    "timestamp": str(event.get("timestamp", "")),
                    "violations": list(event.get("violations", [])),
                    "image_url": url_for("static", filename=relative_path),
                }
            )
        return prepared_events

    @app.route("/")
    def index() -> str:
        error_code = str(request.args.get("error", "")).strip().lower()
        return render_template(
            "index.html",
            mobile_detected=is_mobile_request(request),
            error_code=error_code,
            min_download_mbps=MIN_DOWNLOAD_MBPS,
        )

    @app.route("/admin/login", methods=["GET", "POST"])
    def admin_login() -> Any:
        if is_admin_authenticated():
            return redirect(url_for("admin_dashboard"))

        error = ""
        if request.method == "POST":
            password = str(request.form.get("password", ""))
            if password == ADMIN_PASSWORD:
                session["admin_authenticated"] = True
                return redirect(url_for("admin_dashboard"))
            error = "Invalid admin password"
        return render_template("admin_login.html", error=error)

    @app.get("/admin/logout")
    def admin_logout() -> Any:
        session.pop("admin_authenticated", None)
        return redirect(url_for("admin_login"))

    @app.get("/admin")
    def admin_dashboard() -> Any:
        if not is_admin_authenticated():
            return redirect(url_for("admin_login"))

        return render_template("admin_dashboard.html", users=build_users_summary())

    @app.get("/admin/user/<path:user_key>")
    def admin_user_detail(user_key: str) -> Any:
        if not is_admin_authenticated():
            return redirect(url_for("admin_login"))

        key = str(user_key).strip().lower()
        user = state.registered_faces.get(key)
        if user is None:
            return redirect(url_for("admin_dashboard"))

        prepared_events = build_user_events(key)

        return render_template("admin_user.html", user=user, user_key=key, events=prepared_events)

    @app.get("/api/setup_config")
    def setup_config() -> Any:
        return jsonify(
            {
                "ok": True,
                "mobile_detected": is_mobile_request(request),
                "min_download_mbps": MIN_DOWNLOAD_MBPS,
            }
        )

    @app.post("/api/admin/login")
    def admin_login_api() -> tuple[Any, int] | Any:
        payload = request.get_json(silent=True) or {}
        password = str(payload.get("password", ""))
        if password == ADMIN_PASSWORD:
            session["admin_authenticated"] = True
            return jsonify({"ok": True})
        return jsonify({"error": "Invalid admin password"}), 401

    @app.post("/api/admin/logout")
    def admin_logout_api() -> Any:
        session.pop("admin_authenticated", None)
        return jsonify({"ok": True})

    @app.get("/api/admin/session")
    def admin_session_api() -> Any:
        return jsonify({"ok": True, "authenticated": is_admin_authenticated()})

    @app.get("/api/admin/users")
    def admin_users_api() -> tuple[Any, int] | Any:
        if not is_admin_authenticated():
            return jsonify({"error": "Unauthorized"}), 401
        return jsonify({"ok": True, "users": build_users_summary()})

    @app.get("/api/admin/user/<path:user_key>")
    def admin_user_detail_api(user_key: str) -> tuple[Any, int] | Any:
        if not is_admin_authenticated():
            return jsonify({"error": "Unauthorized"}), 401

        key = str(user_key).strip().lower()
        user = state.registered_faces.get(key)
        if user is None:
            return jsonify({"error": "User not found"}), 404

        return jsonify(
            {
                "ok": True,
                "user_key": key,
                "user": {
                    "username": user.username,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "email": user.email,
                    "samples": len(user.signatures),
                },
                "events": build_user_events(key),
            }
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
                if not is_face_close_enough(
                    state.analyzer.face_detection,
                    frame,
                    min_area_ratio=REGISTRATION_MIN_FACE_AREA_RATIO,
                ):
                    raise ValueError("Move closer to the camera and keep your face larger in frame.")
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
        state.phone_visible_streaks.pop(key, None)
        state.phone_visible_active.pop(key, None)
        state.violation_capture_last_ts.pop(key, None)
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
            face_area_ratio = None
            if result.face_count == 1:
                face_area_ratio = get_single_face_area_ratio(state.analyzer.face_detection, frame)
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

        close_enough = bool(face_area_ratio is not None and face_area_ratio >= REGISTRATION_MIN_FACE_AREA_RATIO)
        return jsonify(
            {
                "face_count": result.face_count,
                "sideways_score": result.sideways_score,
                "face_area_ratio": face_area_ratio,
                "close_enough": close_enough,
                "pose_hint": pose_hint,
                "center_max": REGISTRATION_CENTER_MAX,
                "side_min": REGISTRATION_SIDE_MIN,
                "min_face_area_ratio": REGISTRATION_MIN_FACE_AREA_RATIO,
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
            state.phone_visible_streaks[key] = 0
            state.phone_visible_active[key] = False
            state.violation_capture_last_ts[key] = 0.0
        else:
            session.pop("verified_user", None)
            state.identity_mismatch_streaks.pop(key, None)
            state.phone_visible_streaks.pop(key, None)
            state.phone_visible_active.pop(key, None)
            state.violation_capture_last_ts.pop(key, None)

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
        phone_detected = state.phone_detector.detect_phone(frame)
        if phone_detected:
            state.phone_visible_streaks[key] = state.phone_visible_streaks.get(key, 0) + 1
        else:
            state.phone_visible_streaks[key] = 0
            state.phone_visible_active[key] = False

        if (
            state.phone_visible_streaks.get(key, 0) >= PHONE_VISIBLE_STREAK_THRESHOLD
            and not state.phone_visible_active.get(key, False)
        ):
            result.violations.append("phone_visible")
            state.phone_visible_active[key] = True

        identity_match: bool | None = None
        identity_score: float | None = None
        if result.face_count == 1:
            try:
                is_sideways = "looking_sideways" in result.violations
                is_low_light = "low_lighting" in result.violations
                if is_sideways:
                    state.identity_mismatch_streaks[key] = 0
                elif is_low_light:
                    # Skip mismatch streak updates in poor lighting to reduce false positives.
                    identity_match = None
                    identity_score = None
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

        if result.violations:
            now_ts = time.time()
            last_capture_ts = float(state.violation_capture_last_ts.get(key, 0.0))
            if (now_ts - last_capture_ts) >= VIOLATION_CAPTURE_COOLDOWN_SECONDS:
                try:
                    append_violation_event(
                        events=state.violation_events,
                        file_path=app.config["VIOLATION_EVENTS_FILE"],
                        captures_dir=app.config["VIOLATION_CAPTURES_DIR"],
                        user_key=key,
                        username=username,
                        violations=list(result.violations),
                        frame_bgr=frame,
                        max_events_per_user=int(app.config["MAX_VIOLATION_EVENTS_PER_USER"]),
                    )
                    state.violation_capture_last_ts[key] = now_ts
                except OSError:
                    pass

        return jsonify(
            {
                "face_count": result.face_count,
                "sideways_score": result.sideways_score,
                "identity_match": identity_match,
                "identity_score": identity_score,
                "identity_mismatch_streak": state.identity_mismatch_streaks.get(key, 0),
                "identity_live_threshold": LIVE_MATCH_THRESHOLD,
                "brightness": brightness,
                "phone_detected": phone_detected,
                "phone_visible_streak": state.phone_visible_streaks.get(key, 0),
                "phone_detector_enabled": state.phone_detector.enabled,
                "violations": result.violations,
            }
        )
