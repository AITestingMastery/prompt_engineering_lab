"""
Compatibility entrypoint.

Keeps the original startup command working:
    python app.py
"""

from config import BACKEND_PORT
from main import app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=BACKEND_PORT, reload=True)
