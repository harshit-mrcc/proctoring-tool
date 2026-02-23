# Proctoring Tool - POC Documentation

## 1. Project Overview
The **Proctoring Tool** is a Flask-based web proof of concept (POC) for online exam monitoring.  
It validates candidate readiness before exam start, captures face registration samples, verifies identity, and performs live rule-based proctoring during the exam.

### Core Objective
Build a lightweight, practical proctoring pipeline that can:
- Enforce desktop-only usage.
- Verify candidate identity before exam access.
- Monitor exam session behavior in near real time.
- Produce an end summary with a trust score.

## 2. Scope of This POC
This POC demonstrates the full flow from candidate setup to exam completion, including:
- Device, internet, microphone, and lighting pre-checks.
- Multi-pose face registration (front + two side angles).
- Face verification at exam start.
- Continuous violation checks (camera + client behavior).
- Session-end summary (answered/unanswered/violations/trust score).

### Out of Scope (POC Limitations)
- Anti-spoofing (liveness detection with strong guarantees).
- Certified face recognition models.
- Persistent multi-session DB and admin portal.
- Screen recording and evidence storage.
- Distributed scaling and production hardening.

## 3. Technology Stack
- **Backend**: Python, Flask
- **Computer Vision**: OpenCV, MediaPipe
- **Numerical Processing**: NumPy
- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Storage**: Local JSON file (`registered_faces.json`)

Dependencies (from `requirements.txt`):
- `flask==3.1.0`
- `opencv-python==4.10.0.84`
- `mediapipe==0.10.14`
- `numpy==1.26.4`

## 4. High-Level Architecture
Application follows a modular package structure:

- `proctoring/app_factory.py`: Flask app creation and wiring.
- `proctoring/web/routes.py`: HTTP routes and request/response handling.
- `proctoring/services/analyzer.py`: Frame analysis (face count + sideways detection).
- `proctoring/services/identity.py`: Image decoding, face crop/signature, similarity scoring, brightness and phone heuristics.
- `proctoring/infrastructure/persistence.py`: Load/save registered users/signatures.
- `proctoring/state.py`: In-memory runtime state.
- `proctoring/config.py`: Thresholds and configuration constants.
- `templates/*.html`: Candidate setup, registration, screen-share gate, exam UI, summary.
- `static/style.css`: UI styling.

## 5. End-to-End Candidate Flow
1. Candidate opens `/` (setup page).
2. Candidate enters details (first name, last name, optional email, username).
3. System runs pre-checks:
   - Desktop/laptop enforcement
   - Internet speed (minimum configured Mbps)
   - Microphone check
   - Lighting check
4. Candidate proceeds to `/face_register`.
5. System captures 3 face samples via guided pose checks:
   - Center
   - Side 1
   - Opposite side
6. Backend stores generated face signatures for that user.
7. Candidate is verified (`/verify_face`) before access.
8. Candidate opens `/screen_share` and must:
   - Enter fullscreen
   - Share entire screen (monitor, not tab/window)
9. Candidate starts `/exam`.
10. During exam, live monitoring runs every second (`/analyze_frame`) and client-side behavior events are tracked.
11. Candidate ends exam manually or when timer expires.
12. `/thank_you` shows final summary and trust score.

## 6. Proctoring Signals and Rules
### Server-Side (Vision)
- `no_face`: No face detected.
- `multiple_faces`: More than one face detected.
- `looking_sideways`: Side pose beyond threshold.
- `identity_mismatch`: Triggered after consecutive live mismatches.
- `low_lighting`: Frame brightness below threshold.
- `phone_visible`: Rectangle/contour heuristic indicates phone-like object.

### Client-Side (Browser Behavior)
- `tab_hidden`
- `window_blur`
- `fullscreen_exit`
- `navigation_attempt`
- `reload_or_close_attempt`
- `monitor_error`

These are counted and shown in the live violations panel.

## 7. Identity Handling Design
### Registration
- Candidate submits one or more captured images.
- Backend enforces single-face frames.
- Face crop is transformed into a compact signature:
  - Histogram features
  - Normalized patch features
  - Final vector normalization
- Multiple signatures are stored per user.

### Verification
- Current face signature is compared against stored signatures with cosine similarity.
- Start threshold (`START_MATCH_THRESHOLD`) is used before exam access.
- Live threshold (`LIVE_MATCH_THRESHOLD`) is used during monitoring.
- Repeated live mismatches trigger `identity_mismatch`.

## 8. Key Configuration Values
From `proctoring/config.py`:
- `START_MATCH_THRESHOLD = 0.84`
- `LIVE_MATCH_THRESHOLD = 0.78`
- `LIVE_IDENTITY_MISMATCH_STREAK_THRESHOLD = 3`
- `REGISTRATION_CENTER_MAX = 0.10`
- `REGISTRATION_SIDE_MIN = 0.12`
- `MIN_DOWNLOAD_MBPS = 2.0`
- `LOW_LIGHT_MEAN_THRESHOLD = 60.0`

These values are tunable based on environment and desired strictness.

## 9. Data Storage Model
User registration data is stored in local JSON (`registered_faces.json`).

Each record includes:
- `username`
- `first_name`
- `last_name`
- `email`
- `signatures` (array of numeric vectors)

Notes:
- Keys are case-normalized (`username.lower()`).
- Legacy single-signature format is handled during load.

## 10. API Endpoint Summary
### GET
- `/` : Setup page.
- `/device_check` : Device support check.
- `/speed_probe` : Payload endpoint for internet speed measurement.
- `/face_register` : Face registration page.
- `/screen_share` : Screen-share gate page.
- `/exam` : Exam + monitoring page.
- `/thank_you` : Result summary page.

### POST
- `/registration_pose_check` : Pose guidance signal for registration.
- `/register_face` : Register user face signatures.
- `/verify_face` : Verify candidate identity before session.
- `/analyze_frame` : Live frame analysis and violation response.

## 11. Session and Access Controls
- Session key `verified_user` is set after successful `/verify_face`.
- Protected routes (`/exam`, `/screen_share`, `/thank_you`) require registered + verified user context.
- Monitoring endpoint rejects unauthorized or unverified sessions.
- Mobile requests are blocked for core proctoring routes.

## 12. Testing and Validation
Available test file: `tests/test_mass_users.py`

What it validates:
- Save/load integrity for 100 synthetic users and signatures.
- Top-1 synthetic identification accuracy target (>=98%).

This validates persistence and matching logic behavior under scaled synthetic data.

## 13. How to Run
```bash
pip install -r requirements.txt
python proctor.py
```
Open: `http://127.0.0.1:5000`

## 14. Demo Script (POC Presentation)
1. Open setup page and complete pre-checks.
2. Register face with 3 guided poses.
3. Verify identity and enter screen-share gate.
4. Launch exam and trigger sample violations:
   - Look away (sideways)
   - Move out of frame (no_face)
   - Switch tab (tab_hidden)
5. End exam and show trust score on summary page.

## 15. Known Risks / Limitations
- Face matching is lightweight heuristic-based, not production biometric-grade.
- Phone detection is contour heuristic and can generate false positives/negatives.
- Session storage and JSON persistence are not suitable for distributed deployment.
- Client-side events can be bypassed by advanced users without hardened controls.
- No encryption or advanced audit logging included in this POC.

## 16. Future Improvements
- Replace custom signature with robust face embedding model + liveness checks.
- Add relational/NoSQL backend with audit trail and admin dashboards.
- Add role-based access, exam configuration, and attempt history.
- Add secure evidence snapshots for violation events.
- Add containerization, CI, and production deployment pipeline.

## 17. Conclusion
This POC successfully demonstrates a full online proctoring journey with identity onboarding, live behavior monitoring, and post-exam trust scoring using a clear modular architecture. It is suitable for academic submission as a working prototype and foundation for production evolution.
