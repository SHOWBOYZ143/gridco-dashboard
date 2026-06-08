#!/usr/bin/env python3
"""
parse.py — GRIDCo OF-10 Report Parser
======================================
Usage:
    python parse.py <input.pdf> [output.json]

Examples:
    python parse.py OF10_04-05-2026_energydir.pdf
    python parse.py OF10_04-05-2026_energydir.pdf results/04-05-2026.json

If no output path is given, the JSON is saved alongside the PDF with the
same name but a .json extension.
"""

import sys
import json
from pathlib import Path


def main():
    if len(sys.argv) < 2:
        print("Usage: python parse.py <input.pdf> [output.json]")
        print()
        print("Examples:")
        print("  python parse.py OF10_04-05-2026_energydir.pdf")
        print("  python parse.py reports/OF10_04-05-2026.pdf output/04-05-2026.json")
        sys.exit(1)

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(f"Error: file not found — {pdf_path}")
        sys.exit(1)
    if pdf_path.suffix.lower() != ".pdf":
        print(f"Error: expected a .pdf file, got '{pdf_path.suffix}'")
        sys.exit(1)

    # Determine output path
    if len(sys.argv) >= 3:
        out_path = Path(sys.argv[2])
    else:
        out_path = pdf_path.with_suffix(".json")

    # Create output directory if needed
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Parsing: {pdf_path}")

    from pdf_parser import parse_pdf_report

    report = parse_pdf_report(pdf_path)
    data = report.to_dict()

    # Print summary to terminal
    hdr = data.get("report_header", {})
    ks  = data.get("key_stats", [{}])[0]
    statuses = data.get("section_statuses", [])
    found = sum(1 for s in statuses if s["found"])
    total = len(statuses)

    print()
    print(f"  Report:    {hdr.get('report_code')}  {hdr.get('report_day')}  {hdr.get('report_date')}")
    print(f"  Entity:    {hdr.get('reporting_entity')}")
    print()
    print(f"  Sections extracted:  {found} / {total}")
    print()

    # Key stats
    if ks:
        print(f"  Forecast peak demand:    {ks.get('forecast_peak_demand_mw'):>7,.0f} MW")
        print(f"  Total available capacity:{ks.get('total_available_capacity_mw'):>7,.0f} MW")
        print(f"  Ghana peak load:         {ks.get('ghana_peak_load_mw'):>7,.0f} MW  at {ks.get('ghana_peak_load_time')}")
        print(f"  Load relief planned:     {ks.get('load_relief_planned_mw'):>7,.0f} MW")
        print(f"  Load relief effected:    {ks.get('load_relief_effected_mw'):>7,.0f} MW")
        print()

    # Section status table
    print("  Section breakdown:")
    for s in statuses:
        icon = "✓" if s["found"] else "✗"
        notes = f"  [{s['notes'][0]}]" if s.get("notes") else ""
        print(f"    {icon}  {s['section_name']:<30s}  rows={s['row_count']}{notes}")

    # Incidents summary
    incidents = data.get("major_incidents", [])
    still_out = [i for i in incidents if i.get("still_out")]
    if incidents:
        print()
        print(f"  Major incidents: {len(incidents)} total, {len(still_out)} still out")
        for i in still_out:
            print(f"    - #{i['incident_no']} {i['equipment_id']}")

    # Write JSON
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print()
    print(f"JSON saved to: {out_path}  ({out_path.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
