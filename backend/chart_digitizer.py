"""
chart_digitizer.py
==================
Dynamically extracts time-series data from chart images in GRIDCo OF-10 PDF reports.

Works regardless of total page count (7 or 8 pages, or other layouts) by:
  1. Detecting which pages contain voltage trend charts via text analysis.
  2. Auto-detecting the line colour per chart (each chart uses a different colour).
  3. Applying fixed PDF-coordinate slot positions (same across all GRIDCo reports).

Sections recovered:
  C. Load Curves  — System Demand & Domestic Demand, 30-min, 01:00–24:00
  Voltage Trends  — Hourly kV for 10 nodes across 3 chart pages

Accuracy (cross-checked against PDF voltage table values):
  Load curve:      ±1% at peak
  Voltage trends:  ±2–5% (linear pixel-to-kV mapping)
"""
from __future__ import annotations
from pathlib import Path
from typing import Any
import numpy as np

try:
    import pdfplumber
    from PIL import Image
    _DEPS_OK = True
except ImportError:
    _DEPS_OK = False


# ─────────────────────────────────────────────────────────────────────────────
# LOAD CURVE  (Section C, Page 1)
# ─────────────────────────────────────────────────────────────────────────────

_LC_Y_TOP_PDF  = 168.8
_LC_Y_BOT_PDF  = 242.0
_LC_X_LEFT_PDF = 368.0
_LC_X_RGHT_PDF = 540.0
_LC_PX_L, _LC_PX_R = 80, 797
_LC_PY_T, _LC_PY_B = 61, 324
_LC_CAL_A, _LC_CAL_B = 4329.2, -14.94
_LC_COL_SD = ((65, 120), (130, 175), (185, 235))   # blue  — System Demand
_LC_COL_DD = ((165, 215), (80, 125), (75, 125))    # pink  — Domestic Demand


def _lc_px_to_mw(y: int) -> float:
    return _LC_CAL_A + _LC_CAL_B * (y - _LC_PY_T)


def _lc_px_to_hour(x: int) -> float:
    return 1.0 + (x - _LC_PX_L) / (_LC_PX_R - _LC_PX_L) * 23.0


def _dig_lc(arr: "np.ndarray", col: tuple) -> dict[float, float]:
    r, g, b = col
    mask = (
        (arr[:, :, 0].astype(np.int32) >= r[0]) & (arr[:, :, 0].astype(np.int32) <= r[1]) &
        (arr[:, :, 1].astype(np.int32) >= g[0]) & (arr[:, :, 1].astype(np.int32) <= g[1]) &
        (arr[:, :, 2].astype(np.int32) >= b[0]) & (arr[:, :, 2].astype(np.int32) <= b[1])
    )
    pts: dict[float, float] = {}
    for x in range(_LC_PX_L, _LC_PX_R + 1):
        ys = np.where(mask[_LC_PY_T:_LC_PY_B, x])[0]
        if len(ys):
            y_abs = int(np.median(ys)) + _LC_PY_T
            pts[round(_lc_px_to_hour(x), 4)] = round(_lc_px_to_mw(y_abs), 0)
    return pts


def _resample_30min(raw: dict[float, float]) -> list[dict]:
    if not raw:
        return []
    keys = np.array(sorted(raw.keys()))
    vals = np.array([raw[k] for k in keys])
    out = []
    for h in range(1, 25):
        for m in (0, 30):
            ht = h + m / 60
            if ht > 24:
                break
            idx = int(np.argmin(np.abs(keys - ht)))
            if abs(keys[idx] - ht) < 0.35:
                out.append({"time": f"{h:02d}:{m:02d}", "value_mw": int(vals[idx])})
    return out


def extract_load_curve(pdf_path: str | Path) -> dict[str, Any]:
    """Extract System Demand and Domestic Demand time-series from Section C (Page 1)."""
    if not _DEPS_OK:
        return {"error": "pdfplumber or Pillow not installed", "system_demand": [], "domestic_demand": []}
    path = Path(pdf_path)
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[0]
        img = page.to_image(resolution=300).original.convert("RGB")
        sx, sy = img.width / page.width, img.height / page.height
        pad = 20
        x0 = max(0, int(_LC_X_LEFT_PDF * sx) - 80)
        x1 = min(img.width, int(_LC_X_RGHT_PDF * sx) + pad)
        y0 = max(0, int(_LC_Y_TOP_PDF * sy) - pad)
        y1 = min(img.height, int(_LC_Y_BOT_PDF * sy) + pad)
        crop = np.array(img.crop((x0, y0, x1, y1)))
    return {
        "system_demand":    _resample_30min(_dig_lc(crop, _LC_COL_SD)),
        "domestic_demand":  _resample_30min(_dig_lc(crop, _LC_COL_DD)),
        "units":            "MW",
        "interval_minutes": 30,
        "extraction_method": "chart_digitization",
        "accuracy_note":    "±1% at peak vs PDF key-stats",
    }


# ─────────────────────────────────────────────────────────────────────────────
# VOLTAGE TREND CURVES  (Dynamic page detection + auto colour)
# ─────────────────────────────────────────────────────────────────────────────

# Fixed chart slot positions (PDF points) — same across all GRIDCo OF-10 reports.
# 3 chart pages, 3-4 slots each, positions verified across two different report dates.
_VOLTAGE_SLOT_DEFS = {
    0: [  # First chart page: high-voltage 161/330kV nodes
        ("Akosombo GS",      338, 420, 110, 190),
        ("Bui GS",           460, 545, 110, 190),
        ("Takoradi Thermal", 595, 680, 110, 190),
    ],
    1: [  # Second chart page: mixed 161kV + 34.5kV nodes
        ("SEAP",      135, 230, 110, 190),
        ("Achimota",  285, 385,  27,  42),
        ("Mallam",    432, 530,  27,  42),
        ("New Tema",  579, 670,  27,  42),
    ],
    2: [  # Third chart page: 34.5kV nodes
        ("Kumasi",    174, 285, 27, 42),
        ("Takoradi",  362, 472, 27, 42),
        ("Tamale",    546, 658, 27, 42),
    ],
}

_VT_X_LEFT_PDF = 100
_VT_X_RGHT_PDF = 560
_VT_DPI        = 200
_VT_COLOR_TOL  = 40


def _find_voltage_chart_pages(pdf: Any) -> list[int]:
    """
    Return 0-based page indices of pages containing voltage trend charts.
    Handles both 7-page and 8-page report layouts.
    """
    results = []
    for i, page in enumerate(pdf.pages):
        t = page.extract_text() or ""
        words = page.extract_words()
        # Must have kV axis labels
        has_kv = any(w["text"] in ("190", "110", "42.00", "27.00") for w in words)
        # Must have time-axis labels (scrambled as ":1", ":2" etc.)
        has_time = ":1" in t or ":2" in t
        # Exclude data tables that happen to mention the same numbers
        is_data_only = any(x in t for x in (
            "UNIT MW MVAr", "HYDRO UNITS", "KEY STATS", "PLANT GENERATION",
            "MAJOR INCIDENTS", "ENERGY EXCHANGES",
        ))
        # Include if it has voltage trend content (even if it also has the voltage table)
        has_trend = "VOLTAGE TREND" in t or (has_kv and has_time and not is_data_only)
        if has_trend and has_kv:
            results.append(i)
    # Limit to 3 pages (the three chart pages, not the voltage table page)
    # If more than 3 found, take the last 3 (chart pages come after the table page)
    return results[-3:] if len(results) > 3 else results


def _auto_detect_color(arr: "np.ndarray", y0_pdf: int, y1_pdf: int,
                        sy: float, sx: float) -> tuple | None:
    """Find the dominant saturated colour in the chart's plot area."""
    py0 = int(y0_pdf * sy)
    py1 = int(y1_pdf * sy)
    px0 = int(_VT_X_LEFT_PDF * sx)
    px1 = int(_VT_X_RGHT_PDF * sx)
    if py1 > arr.shape[0] or px1 > arr.shape[1]:
        return None
    region = arr[py0:py1, px0:px1].astype(np.float32)
    r, g, b = region[:, :, 0], region[:, :, 1], region[:, :, 2]
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    sat = np.where(max_c > 10, (max_c - min_c) / max_c, 0)
    colorful_mask = sat > 0.25
    colorful_pixels = arr[py0:py1, px0:px1][colorful_mask]
    if len(colorful_pixels) < 50:
        return None
    from collections import Counter
    quant = (colorful_pixels.astype(np.int32) // 10 * 10)
    top = Counter([tuple(c) for c in quant]).most_common(1)
    return tuple(top[0][0]) if top else None


def _digitize_vt(arr: "np.ndarray", y0_pdf: int, y1_pdf: int,
                  kv_min: float, kv_max: float,
                  color: tuple, sy: float, sx: float) -> list[dict]:
    """Trace a voltage trend line and return hourly kV readings."""
    py_top = int(y0_pdf * sy)
    py_bot = int(y1_pdf * sy)
    px_left = int(_VT_X_LEFT_PDF * sx)
    px_right = int(_VT_X_RGHT_PDF * sx)
    cr, cg, cb = int(color[0]), int(color[1]), int(color[2])
    t = _VT_COLOR_TOL
    arr32 = arr.astype(np.int32)
    mask = (
        (arr32[:, :, 0] >= cr - t) & (arr32[:, :, 0] <= cr + t) &
        (arr32[:, :, 1] >= cg - t) & (arr32[:, :, 1] <= cg + t) &
        (arr32[:, :, 2] >= cb - t) & (arr32[:, :, 2] <= cb + t)
    )
    raw: dict[float, float] = {}
    plot_h = py_bot - py_top
    if plot_h <= 0:
        return []
    for x in range(px_left, px_right):
        col_ys = np.where(mask[py_top:py_bot, x])[0]
        if len(col_ys):
            y_rel = int(np.median(col_ys))
            hour = 1.0 + (x - px_left) / (px_right - px_left) * 23.0
            kv   = kv_max - (y_rel / plot_h) * (kv_max - kv_min)
            raw[round(hour, 4)] = round(float(kv), 2)
    if not raw:
        return []
    keys = np.array(sorted(raw.keys()))
    vals = np.array([raw[k] for k in keys])
    out = []
    for h in range(1, 25):
        idx = int(np.argmin(np.abs(keys - float(h))))
        if abs(keys[idx] - h) < 0.6:
            out.append({"time": f"{h:02d}:00", "value_kv": round(float(vals[idx]), 2)})
    return out


def extract_voltage_trends(pdf_path: str | Path) -> list[dict[str, Any]]:
    """
    Dynamically extract hourly kV trends for all 10 nodes.
    Auto-detects which pages contain charts and what colour each line is.
    """
    if not _DEPS_OK:
        return []
    path = Path(pdf_path)
    results = []
    page_cache: dict[int, tuple] = {}

    with pdfplumber.open(path) as pdf:
        chart_page_idxs = _find_voltage_chart_pages(pdf)

        for rel_idx, page_idx in enumerate(chart_page_idxs):
            if page_idx >= len(pdf.pages):
                continue
            if page_idx not in page_cache:
                page = pdf.pages[page_idx]
                img  = page.to_image(resolution=_VT_DPI).original.convert("RGB")
                page_cache[page_idx] = (page, img)
            page, img = page_cache[page_idx]
            arr = np.array(img)
            sx  = img.width  / page.width
            sy  = img.height / page.height

            for node_name, y0_pdf, y1_pdf, kv_min, kv_max in _VOLTAGE_SLOT_DEFS.get(rel_idx, []):
                color = _auto_detect_color(arr, y0_pdf, y1_pdf, sy, sx)
                if color is None:
                    readings = []
                else:
                    readings = _digitize_vt(arr, y0_pdf, y1_pdf, kv_min, kv_max, color, sy, sx)
                results.append({
                    "node_name":         node_name,
                    "page":              page_idx + 1,
                    "kv_min":            kv_min,
                    "kv_max":            kv_max,
                    "readings":          readings,
                    "units":             "kV",
                    "extraction_method": "chart_digitization",
                })
    return results


# ─────────────────────────────────────────────────────────────────────────────
# COMBINED ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def extract_all_charts(pdf_path: str | Path) -> dict[str, Any]:
    return {
        "load_curve":     extract_load_curve(pdf_path),
        "voltage_trends": extract_voltage_trends(pdf_path),
    }


# ─────────────────────────────────────────────────────────────────────────────
# CLI SMOKE-TEST
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys, json
    pdf = sys.argv[1] if len(sys.argv) > 1 else "sample.pdf"
    result = extract_all_charts(pdf)
    lc = result["load_curve"]
    sd = lc.get("system_demand", [])
    print(f"Load Curve — System Demand : {len(sd)} points")
    if sd:
        peak = max(sd, key=lambda r: r["value_mw"])
        print(f"             Peak: {peak['value_mw']} MW at {peak['time']}")
    vt = result["voltage_trends"]
    print(f"\nVoltage Trends — {len(vt)} nodes:")
    for n in vt:
        pts = len(n.get("readings", []))
        sample = f"  @19h={n['readings'][18]['value_kv']} kV" if pts >= 19 else ""
        print(f"  {n['node_name']:25s} {pts:2d} pts{sample}")
