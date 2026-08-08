"""
Low-level Anthropic API client.
"""

import time

import requests

from config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ANTHROPIC_URL, ANTHROPIC_VERSION


def call_anthropic(prompt: str, max_tokens: int = 800) -> dict:
    """Single call to Claude. Returns text, usage, and elapsed_ms."""
    if not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY == "your-api-key-here":
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Add it to .env in the project root."
        )

    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }
    payload = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }

    start = time.perf_counter()
    resp = requests.post(ANTHROPIC_URL, headers=headers, json=payload, timeout=120)
    elapsed_ms = (time.perf_counter() - start) * 1000

    if not resp.ok:
        raise RuntimeError(f"Anthropic API error {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    text = "".join(
        block.get("text", "")
        for block in data.get("content", [])
        if block.get("type") == "text"
    )
    usage = data.get("usage", {})

    return {
        "text": text,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "elapsed_ms": elapsed_ms,
    }
