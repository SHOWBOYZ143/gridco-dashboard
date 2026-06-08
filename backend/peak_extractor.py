"""
peak_extractor.py
─────────────────
Smart peak data extractor that auto-detects the PDF layout and picks
the right strategy.

Two known layouts exist in GRIDco OF-10 PDFs:

  LAYOUT A — "Inline" (most days)
    Labels and values appear on the same line:
    "TOTAL GENERATION AT PEAK  4166  1339  4376  22:16h"

  LAYOUT B — "Split" (some days, e.g. 03-05-26)
    The load curve chart physically overlaps the peak table.
    pdfplumber reads all LEFT-column labels first, then all
    RIGHT-column values appear as orphaned rows much later:
    "GHANA PEAK LOAD AND TIME h"   ← label, no values
    ...many lines later...
    "4022  1109  4172  0:01"       ← values, no label

This module detects which layout is present and applies the right
extraction method automatically.
"""

from __future__ import annotations
from collections import defaultdict
import re

from schema import PeakDataRecord, KeyStatsRecord
from common import to_float, clean_text

# ── Known peak table labels (in order) ───────────────────────────────────────
PEAK_LABELS = [
    "TOTAL GENERATION AT PEAK",
    "CEB GENERATION",
    "GHANA/CEB PEAK LOAD",
    "VALCO LOAD AT PEAK",
    "CIE SUPPLY WHEELED TO CEB",
    "CIE SUPPLY TO GHANA AT PEAK",
    "NIGERIA SUPPLY TO CEB",
    "GHANA SUPPLY TO CIE AT PEAK",
    "CEB LOAD AT PEAK",
    "GHANA SUPPLY TO CEB AT PEAK",
    "CEB SUPPLY TO GHANA AT PEAK",
    "GHANA SUPPLY TO SONABEL AT PEAK",
    "SONABEL SUPPLY TO GHANA AT PEAK",
    "DOMESTIC LOAD AT PEAK",
    "DOMESTIC PEAK LOAD AND TIME",
]

# Regex that works for Layout A (inline)
_INLINE_PAT = re.compile(
    r"(" + "|".join(re.escape(l) for l in PEAK_LABELS) + r")\s+"
    r"(-?[\d,]+(?:\.\d+)?)"
    r"(?:\s+(-?[\d,]+(?:\.\d+)?))?"
    r"(?:\s+(-?[\d,]+(?:\.\d+)?))?"
    r"(?:\s+(\d{2}:\d{2})h?)?",
    re.I,
)

_NUM_PAT  = re.compile(r"^-?[\d,]+(?:\.\d+)?$")
_TIME_PAT = re.compile(r"^\d{2}:\d{2}$")


# ─────────────────────────────────────────────────────────────────────────────
# LAYOUT DETECTOR
# ─────────────────────────────────────────────────────────────────────────────

def detect_layout(text: str, words: list[dict]) -> str:
    """
    Returns 'A' (inline) or 'B' (split/chart-separated).

    Detection logic:
    - In Layout A, at least one label has numbers on the same text line.
    - In Layout B, labels appear with just 'h' after them (no numbers),
      and value rows appear separately with no label prefix.
    """
    # Check if any label has values immediately after it in raw text
    for label in PEAK_LABELS[:5]:   # check first 5 labels
        m = re.search(
            re.escape(label) + r"\s+(-?[\d,]+)",
            text, re.I
        )
        if m:
            return "A"

    # Also check reconstructed word text
    if words:
        reconstructed = _reconstruct(words)
        for label in PEAK_LABELS[:5]:
            m = re.search(re.escape(label) + r"\s+(-?[\d,]+)", reconstructed, re.I)
            if m:
                return "A"

    return "B"


# ─────────────────────────────────────────────────────────────────────────────
# SHARED HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _reconstruct(words: list[dict]) -> str:
    """Reconstruct full-width text from word bboxes. No x cutoff, tight y-bucket."""
    rows: dict[int, list[tuple[float, str]]] = defaultdict(list)
    for w in words:
        ry = round(w["top"] / 2) * 2
        rows[ry].append((w["x0"], w["text"]))
    lines = []
    for y in sorted(rows.keys()):
        line = " ".join(t for _, t in sorted(rows[y]))
        # Collapse spaced single uppercase chars: "G H A N A" → "GHANA"
        line = re.sub(r"\b([A-Z])(?: ([A-Z]))+\b", lambda m: m.group(0).replace(" ", ""), line)
        lines.append(line)
    return "\n".join(lines)


def _get_value_rows(words: list[dict], x_threshold: float = 280) -> list[tuple[int, list, list]]:
    """
    Return all right-side rows (x > threshold) that contain 3+ numbers.
    Returns list of (y_bucket, nums_list, times_list).
    """
    right: dict[int, list[tuple[float, str]]] = defaultdict(list)
    for w in words:
        if w["x0"] > x_threshold:
            ry = round(w["top"] / 3) * 3
            right[ry].append((w["x0"], w["text"]))

    result = []
    for ry, items in sorted(right.items()):
        tokens = [t for _, t in sorted(items)]
        nums  = [t for t in tokens if _NUM_PAT.match(t.replace(",", ""))]
        times = [t for t in tokens if _TIME_PAT.match(t)]
        if len(nums) >= 3:
            result.append((ry, nums, times))
    return result


def _get_label_rows(words: list[dict], x_threshold: float = 280) -> list[tuple[int, str]]:
    """
    Return all left-side rows that match a known peak label.
    Returns list of (y_bucket, label_string).
    """
    left: dict[int, list[tuple[float, str]]] = defaultdict(list)
    for w in words:
        if w["x0"] < x_threshold:
            ry = round(w["top"] / 3) * 3
            left[ry].append((w["x0"], w["text"]))

    def collapse(s: str) -> str:
        return re.sub(r"(?<=[A-Z]) (?=[A-Z])", "", s)

    result = []
    for ry, items in sorted(left.items()):
        line = collapse(" ".join(t for _, t in sorted(items)))
        for lbl in PEAK_LABELS:
            if lbl in line:
                result.append((ry, lbl))
                break
    return result


# ─────────────────────────────────────────────────────────────────────────────
# LAYOUT A — INLINE EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def extract_peak_layout_a(text: str, words: list[dict]) -> list[PeakDataRecord]:
    """
    Layout A: labels and values are on the same line.
    Uses regex matching on raw + reconstructed text.
    """
    seen: set[str] = set()
    records: list[PeakDataRecord] = []

    def search(source: str):
        for m in _INLINE_PAT.finditer(source):
            label = clean_text(m.group(1))
            if label in seen:
                continue
            seen.add(label)
            records.append(PeakDataRecord(
                metric_name=label,
                mw=to_float(m.group(2)),
                mvar=to_float(m.group(3)) if m.group(3) else None,
                mva=to_float(m.group(4)) if m.group(4) else None,
                time=m.group(5) if m.group(5) else None,
            ))

    search(text)
    if len(records) < 5 and words:
        search(_reconstruct(words))

    return records


# ─────────────────────────────────────────────────────────────────────────────
# LAYOUT B — SPLIT / POSITIONAL EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def extract_peak_layout_b(words: list[dict]) -> list[PeakDataRecord]:
    """
    Layout B: labels and values are separated by the chart image.
    Matches labels to value rows by closest y-coordinate.
    """
    label_rows = _get_label_rows(words)
    value_rows = _get_value_rows(words)

    if not label_rows or not value_rows:
        return []

    records: list[PeakDataRecord] = []
    used: set[int] = set()
    seen: set[str] = set()

    for ly, label in label_rows:
        if label in seen:
            continue

        # Find nearest unused value row by y distance
        best_idx, best_dist = -1, float("inf")
        for vi, (vy, nums, times) in enumerate(value_rows):
            if vi in used:
                continue
            dist = abs(ly - vy)
            if dist < best_dist:
                best_dist = dist
                best_idx = vi

        # Only accept if reasonably close (within 250pt vertically)
        if best_idx == -1 or best_dist > 250:
            continue

        used.add(best_idx)
        seen.add(label)
        _, nums, times = value_rows[best_idx]

        records.append(PeakDataRecord(
            metric_name=label,
            mw=to_float(nums[0]) if nums else None,
            mvar=to_float(nums[1]) if len(nums) > 1 else None,
            mva=to_float(nums[2]) if len(nums) > 2 else None,
            time=times[0] if times else None,
        ))

    return records


# ─────────────────────────────────────────────────────────────────────────────
# MAIN ENTRY — auto-detect and extract
# ─────────────────────────────────────────────────────────────────────────────

def extract_peak_data(text: str, words: list[dict]) -> list[PeakDataRecord]:
    """
    Auto-detects layout and runs the appropriate extraction strategy.
    Falls back to the other strategy if the primary returns fewer than 3 rows.
    """
    layout = detect_layout(text, words)

    if layout == "A":
        records = extract_peak_layout_a(text, words)
        # Fallback to Layout B if A didn't get enough rows
        if len(records) < 3 and words:
            b_records = extract_peak_layout_b(words)
            if len(b_records) > len(records):
                records = b_records
    else:
        records = extract_peak_layout_b(words)
        # Fallback to Layout A if B didn't get enough rows
        if len(records) < 3:
            a_records = extract_peak_layout_a(text, words)
            if len(a_records) > len(records):
                records = a_records

    return records


# ─────────────────────────────────────────────────────────────────────────────
# GHANA PEAK LOAD — key stats helper
# ─────────────────────────────────────────────────────────────────────────────

def extract_ghana_peak(text: str, words: list[dict]) -> dict:
    """
    Extract Ghana Peak Load MW, MVAr, MVA, and Time.
    Tries inline regex first (Layout A), then positional matching (Layout B).
    Returns a dict with keys: mw, mvar, mva, time  (all may be None).
    """
    result = {"mw": None, "mvar": None, "mva": None, "time": None}

    # Layout A — inline regex
    for pattern in [
        r"GHANA(?:/CEB)? PEAK LOAD(?:\s+AND\s+TIME)?\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(\d{2}:\d{2})h?",
        r"GHANA(?:/CEB)? PEAK LOAD(?:\s+AND\s+TIME)?\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)",
        r"GHANA(?:/CEB)? PEAK LOAD(?:\s+AND\s+TIME)?\s+([\d,]+(?:\.\d+)?)",
    ]:
        m = re.search(pattern, text, re.I)
        if m:
            result["mw"]   = to_float(m.group(1))
            result["mvar"] = to_float(m.group(2)) if m.lastindex >= 2 else None
            result["mva"]  = to_float(m.group(3)) if m.lastindex >= 3 else None
            try:
                result["time"] = m.group(4)
            except IndexError:
                t_m = re.search(r"GHANA(?:/CEB)? PEAK LOAD[^\n]*?(\d{2}:\d{2})h?", text, re.I)
                result["time"] = t_m.group(1) if t_m else None
            return result

    # Layout B — positional: find label y, match nearest right-side value row
    if words:
        ghana_y = None
        for w in words:
            if "GHANA" in w["text"] and w["x0"] < 280:
                ghana_y = w["top"]
                break

        if ghana_y is not None:
            value_rows = _get_value_rows(words)
            best_idx, best_dist = -1, float("inf")
            for vi, (vy, nums, times) in enumerate(value_rows):
                dist = abs(vy - ghana_y)
                if dist < best_dist:
                    best_dist = dist
                    best_idx = vi

            if best_idx != -1 and best_dist <= 250:
                _, nums, times = value_rows[best_idx]
                result["mw"]   = to_float(nums[0]) if nums else None
                result["mvar"] = to_float(nums[1]) if len(nums) > 1 else None
                result["mva"]  = to_float(nums[2]) if len(nums) > 2 else None
                result["time"] = times[0] if times else None

    return result