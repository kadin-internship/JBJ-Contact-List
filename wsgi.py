"""Entry point for a production WSGI server (gunicorn), as opposed to
app.py's __main__ block which runs Flask's dev server for local work."""
from app import create_app

app = create_app()
