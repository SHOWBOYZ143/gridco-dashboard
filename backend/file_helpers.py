from __future__ import annotations

from pathlib import Path


def detect_source_type(file_name: str) -> str:
    suffix = Path(file_name).suffix.lower()
    if suffix == ".pdf":
        return "pdf"
    if suffix in {".xlsx", ".xls"}:
        return "excel"
    return "unknown"