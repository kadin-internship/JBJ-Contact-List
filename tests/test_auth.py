from models import User


def test_login_page_loads(client):
    res = client.get('/login')
    assert res.status_code == 200


def test_protected_route_redirects_when_not_logged_in(client):
    res = client.get('/')
    assert res.status_code == 302
    assert '/login' in res.headers['Location']


def test_login_success(client, admin_id):
    res = client.post('/login', data={'username': 'admin@test.com', 'password': 'adminpassword123'})
    assert res.status_code == 302
    # now logged in -- protected route should no longer redirect to /login
    res = client.get('/')
    assert res.status_code == 200


def test_login_wrong_password(client, admin_id):
    res = client.post('/login', data={'username': 'admin@test.com', 'password': 'wrong-password'})
    assert res.status_code == 200
    assert b'Invalid username or password' in res.data


def test_login_unknown_user(client):
    res = client.post('/login', data={'username': 'nobody@test.com', 'password': 'whatever123'})
    assert res.status_code == 200
    assert b'Invalid username or password' in res.data


def test_login_rate_limit_blocks_after_ten_attempts(client, admin_id):
    for _ in range(10):
        res = client.post('/login', data={'username': 'admin@test.com', 'password': 'wrong'})
        assert res.status_code == 200
    res = client.post('/login', data={'username': 'admin@test.com', 'password': 'wrong'})
    assert res.status_code == 429


def test_password_reset_requires_admin(standard_client, admin_id):
    res = standard_client.post(f'/api/users/{admin_id}/reset-password', json={'password': 'newpassword123'})
    assert res.status_code == 403


def test_password_reset_rejects_short_password(admin_client, standard_id):
    res = admin_client.post(f'/api/users/{standard_id}/reset-password', json={'password': 'short'})
    assert res.status_code == 400


def test_password_reset_changes_password(app, admin_client, standard_id, client):
    res = admin_client.post(f'/api/users/{standard_id}/reset-password', json={'password': 'brandnewpassword123'})
    assert res.status_code == 200

    with app.app_context():
        user = db_get(app, standard_id)
        assert user.check_password('brandnewpassword123')
        assert not user.check_password('standardpassword123')

    # the new password actually logs in
    res = client.post('/login', data={'username': 'standard@test.com', 'password': 'brandnewpassword123'})
    assert res.status_code == 302


def db_get(app, user_id):
    from db import db
    return db.session.get(User, user_id)
