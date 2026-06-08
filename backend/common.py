from __future__ import annotations

import re
from typing import Optional


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def to_float(value) -> Optional[float]:
    if value is None:
        return None
    text = clean_text(str(value)).replace(",", "")
    if text in {"", "-", "None", "none"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def to_int(value) -> Optional[int]:
    number = to_float(value)
    return int(number) if number is not None else None


def looks_like_none_section(text: str) -> bool:
    return clean_text(text).lower() == "none"
