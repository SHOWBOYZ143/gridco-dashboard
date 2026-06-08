from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path


def export_report_json(report, output_path: str | Path) -> Path:
    path = Path(output_path)
    path.write_text(json.dumps(asdict(report), indent=2), encoding="utf-8")
    return path