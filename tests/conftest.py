import os
import tempfile

import pytest

os.environ.pop('BOOTSTRAP_ADMIN_USERNAME', None)
os.environ.pop('BOOTSTRAP_ADMIN_PASSWORD', None)
os.environ.pop('SENTRY_DSN', None)

from app import create_app, limiter
from db import db
from models import User


class TestConfig:
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False
    SECRET_KEY = 'test-secret-key'
    SESSION_COOKIE_SECURE = False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'


@pytest.fixture
def app():
    # A real temp file rather than sqlite:///:memory: -- avoids the
    # multi-connection gotcha where SQLAlchemy's pool can hand different
    # requests different in-memory databases that don't share tables.
    db_fd, db_path = tempfile.mkstemp(suffix='.db')

    class _Config(TestConfig):
        SQLALCHEMY_DATABASE_URI = f'sqlite:///{db_path}'

    application = create_app(config_class=_Config)
    limiter.reset()  # rate-limit state is process-global; don't leak between tests
    application.config['_db_fd'] = db_fd
    application.config['_db_path'] = db_path
    yield application

    os.close(db_fd)
    os.unlink(db_path)


@pytest.fixture
def client(app):
    return app.test_client()


def _make_user(app, username, display_name, password, is_admin):
    with app.app_context():
        u = User(username=username, display_name=display_name, is_admin=is_admin)
        u.set_password(password)
        db.session.add(u)
        db.session.commit()
        return u.id


@pytest.fixture
def admin_id(app):
    return _make_user(app, 'admin@test.com', 'Admin Test', 'adminpassword123', True)


@pytest.fixture
def standard_id(app):
    return _make_user(app, 'standard@test.com', 'Standard Test', 'standardpassword123', False)


@pytest.fixture
def standard2_id(app):
    return _make_user(app, 'standard2@test.com', 'Standard Two', 'standardpassword123', False)


def _login_as(client, user_id):
    with client.session_transaction() as sess:
        sess['_user_id'] = str(user_id)
        sess['_fresh'] = True


@pytest.fixture
def admin_client(app, admin_id):
    # Each *_client fixture gets its own app.test_client() rather than
    # sharing the `client` fixture -- test clients carry session state via
    # cookies, so two fixtures sharing one client would silently log each
    # other out whenever a test uses more than one actor at once.
    c = app.test_client()
    _login_as(c, admin_id)
    return c


@pytest.fixture
def standard_client(app, standard_id):
    c = app.test_client()
    _login_as(c, standard_id)
    return c


@pytest.fixture
def standard2_client(app, standard2_id):
    c = app.test_client()
    _login_as(c, standard2_id)
    return c
