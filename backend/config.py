"""
Central configuration for the Prompt Bench backend.

This module loads .env from the project root and exposes the runtime settings
used by the API layer and the Anthropic client.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
ANTHROPIC_VERSION = os.getenv("ANTHROPIC_VERSION", "2023-06-01")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "5001"))
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
