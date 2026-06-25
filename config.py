import os
from datetime import timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _normalize_database_url(url):
    # Some providers (older Heroku-style connection strings) hand out
    # postgres:// -- SQLAlchemy only accepts the postgresql:// scheme.
    if url and url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url


class Config:
    SQLALCHEMY_DATABASE_URI = _normalize_database_url(os.environ.get("DATABASE_URL")) or f"sqlite:///{os.path.join(BASE_DIR, 'contacts.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me")

    # Render sets RENDER=true on every deployed service; use that to harden
    # session cookies in production without breaking local http:// dev.
    SESSION_COOKIE_SECURE = bool(os.environ.get("RENDER"))
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
