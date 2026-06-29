from models import User, Contact
from db import db


def test_user_password_is_hashed_not_stored_plaintext(app):
    with app.app_context():
        u = User(username='x@test.com', display_name='X', is_admin=False)
        u.set_password('supersecretpassword')
        assert u.password_hash != 'supersecretpassword'
        assert u.check_password('supersecretpassword')
        assert not u.check_password('wrongpassword')


def test_user_to_dict_excludes_password_hash(app):
    with app.app_context():
        u = User(username='x@test.com', display_name='X', is_admin=True)
        u.set_password('supersecretpassword')
        db.session.add(u)
        db.session.commit()
        d = u.to_dict()
        assert 'password_hash' not in d
        assert d['is_admin'] is True


def test_contact_to_dict_round_trips_lists(app):
    with app.app_context():
        c = Contact(first_name='Jane', last_name='Doe', lists=['A', 'B'])
        db.session.add(c)
        db.session.commit()
        d = c.to_dict()
        assert d['lists'] == ['A', 'B']
        assert d['data_complete'] is False
