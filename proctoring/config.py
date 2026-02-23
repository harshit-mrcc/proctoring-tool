from pathlib import Path

SECRET_KEY = "proctoring-tool-dev-key"

START_MATCH_THRESHOLD = 0.84
LIVE_MATCH_THRESHOLD = 0.78
LIVE_IDENTITY_MISMATCH_STREAK_THRESHOLD = 3

REGISTRATION_CENTER_MAX = 0.10
REGISTRATION_SIDE_MIN = 0.12

REGISTERED_FACES_FILE = Path("registered_faces.json")
MIN_DOWNLOAD_MBPS = 2.0
LOW_LIGHT_MEAN_THRESHOLD = 60.0

MOBILE_UA_TOKENS = (
    "android",
    "iphone",
    "ipad",
    "ipod",
    "windows phone",
    "mobile",
    "opera mini",
    "iemobile",
)
