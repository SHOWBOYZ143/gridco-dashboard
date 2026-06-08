from __future__ import annotations

from pathlib import Path
from datetime import datetime
import pandas as pd

from config import PARSER_VERSION
from schema import build_empty_report, set_section_status


def parse_excel_report(file_path: str | Path):
    path = Path(file_path)
    schema = build_empty_report(source_type="excel", source_name=path.name)
    schema.extraction_meta.parser_version = PARSER_VERSION
    schema.extraction_meta.extraction_timestamp = datetime.utcnow().isoformat()

    workbook = pd.ExcelFile(path)
    schema.extraction_meta.notes.append(f"Workbook sheets: {', '.join(workbook.sheet_names)}")

    set_section_status(
        schema,
        "report_header",
        found=True,
        row_count=1,
        notes=["Excel parser skeleton created. Map sheet fields next."],
    )

    return schema