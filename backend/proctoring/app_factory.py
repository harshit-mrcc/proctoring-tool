from pathlib import Path

from flask import Flask

from proctoring.config import (
    MAX_VIOLATION_EVENTS_PER_USER,
    REGISTERED_FACES_FILE,
    SECRET_KEY,
    VIOLATION_CAPTURES_DIR,
    VIOLATION_EVENTS_FILE,
)
from proctoring.infrastructure import load_registered_faces, load_violation_events
from proctoring.state import create_app_state
from proctoring.web import register_routes


def create_app() -> Flask:
    base_dir = Path(__file__).resolve().parent.parent
    app = Flask(
        __name__,
        template_folder=str(base_dir / "templates"),
        static_folder=str(base_dir / "static"),
    )
    app.config["SECRET_KEY"] = SECRET_KEY
    app.config["REGISTERED_FACES_FILE"] = REGISTERED_FACES_FILE
    app.config["VIOLATION_EVENTS_FILE"] = VIOLATION_EVENTS_FILE
    app.config["VIOLATION_CAPTURES_DIR"] = VIOLATION_CAPTURES_DIR
    app.config["MAX_VIOLATION_EVENTS_PER_USER"] = MAX_VIOLATION_EVENTS_PER_USER

    state = create_app_state()
    load_registered_faces(app.config["REGISTERED_FACES_FILE"], state.registered_faces)
    state.violation_events = load_violation_events(app.config["VIOLATION_EVENTS_FILE"])
    register_routes(app, state)
    return app
