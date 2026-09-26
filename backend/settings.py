"""
settings.py - Loads config.yaml, .env and profile.txt in one place.

Every other module imports from here, so paths and secrets are handled
consistently no matter which folder you run the scripts from.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

# Folder that contains this file (backend/). All relative paths start here.
BASE_DIR: Path = Path(__file__).resolve().parent

# Load variables from backend/.env into os.environ (does nothing if missing).
load_dotenv(BASE_DIR / ".env")

# Placeholder value from .env.example; treated the same as "no key".
_PLACEHOLDER_KEY = "your-gemini-api-key-here"


@lru_cache(maxsize=1)
def load_config() -> dict[str, Any]:
    """Read config.yaml once and cache the result."""
    config_path = BASE_DIR / "config.yaml"
    with config_path.open("r", encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}
    return config


def resolve_path(relative_or_absolute: str) -> Path:
    """Turn a path from config.yaml into an absolute path inside backend/."""
    path = Path(relative_or_absolute)
    return path if path.is_absolute() else BASE_DIR / path


def get_db_path() -> Path:
    """Absolute path to the SQLite database file."""
    return resolve_path(load_config()["database"]["path"])


def load_profile() -> str:
    """Return the resume text from profile.txt."""
    profile_path = resolve_path(load_config().get("profile_path", "profile.txt"))
    return profile_path.read_text(encoding="utf-8").strip()


def get_gemini_api_key() -> str:
    """
    Return the Gemini API key from the environment.
    Raises a clear error instead of failing later inside the SDK.
    """
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key or key == _PLACEHOLDER_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Copy backend/.env.example to "
            "backend/.env and paste your key from https://aistudio.google.com/apikey"
        )
    return key


def has_gemini_api_key() -> bool:
    """True if a real-looking key is configured (does not validate it with Google)."""
    try:
        get_gemini_api_key()
        return True
    except RuntimeError:
        return False
