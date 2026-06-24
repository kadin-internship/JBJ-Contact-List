"""Create an employee login. Run interactively so the password never ends
up in shell history or logs:

    .venv/bin/python create_user.py
"""
import getpass
import sys

from app import create_app
from db import db
from models import User


def main():
    app = create_app()
    with app.app_context():
        username = input('Username: ').strip()
        if not username:
            print('Username is required.')
            sys.exit(1)
        if User.query.filter_by(username=username).first():
            print(f'A user named "{username}" already exists.')
            sys.exit(1)

        display_name = input('Display name (shown in the app, e.g. "Jane Doe"): ').strip()
        if not display_name:
            display_name = username

        password = getpass.getpass('Password: ')
        if len(password) < 8:
            print('Password must be at least 8 characters.')
            sys.exit(1)
        confirm = getpass.getpass('Confirm password: ')
        if password != confirm:
            print('Passwords did not match.')
            sys.exit(1)

        is_admin = input('Make this user an admin? [y/N]: ').strip().lower() == 'y'

        user = User(username=username, display_name=display_name, is_admin=is_admin)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        print(f'Created user "{username}" ({display_name}).')


if __name__ == '__main__':
    main()
