from pathlib import Path

from flask import Flask

from proctoring.config import REGISTERED_FACES_FILE, SECRET_KEY
from proctoring.infrastructure import load_registered_faces
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

    state = create_app_state()
    load_registered_faces(app.config["REGISTERED_FACES_FILE"], state.registered_faces)
    register_routes(app, state)
    return app
