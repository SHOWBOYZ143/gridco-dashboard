from __future__ import annotations

from pathlib import Path
from datetime import datetime
from collections import defaultdict
import re
import pdfplumber

try:
    from chart_digitizer import extract_all_charts as _extract_charts
    _CHART_DIGITIZER_AVAILABLE = True
except Exception:
    _CHART_DIGITIZER_AVAILABLE = False

from config import PARSER_VERSION
from schema import (
    ReportHeader, KeyStatsRecord, PeakDataRecord,
    PlantGenerationRecord, UnitLoadingRecord,
    SystemFrequencyRecord, FrequencyBandRecord,
    SystemStabilityRecord, InternationalLineRecord,
    EnergyExchangeRecord, ForecastRecord,
    HydrologyRecord, GasSupplyRecord,
    LiquidFuelStockRecord, IntertieProgrammeRecord,
    MajorIncidentRecord, ConstraintRecord,
    AflsOperationRecord, SpecialLoadSheddingRecord,
    MiscellaneousRecord, SystemVoltageRecord,
    build_empty_report, set_section_status, compute_voltage_compliance,
)
from common import clean_text, to_float, to_int
from peak_extractor import extract_peak_data as _smart_extract_peak, extract_ghana_peak


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def parse_pdf_report(file_path: str | Path):
    path = Path(file_path)
    schema = build_empty_report(source_type="pdf", source_name=path.name)
    schema.extraction_meta.parser_version = PARSER_VERSION
    schema.extraction_meta.extraction_timestamp = datetime.utcnow().isoformat()

    pages_text: list[str] = []
    pages_words: list[list[dict]] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            pages_text.append(page.extract_text() or "")
            pages_words.append(page.extract_words() or [])

    p1       = pages_text[0] if len(pages_text) > 0 else ""
    p1_words = pages_words[0] if len(pages_words) > 0 else []
    p2       = pages_text[1] if len(pages_text) > 1 else ""

    def _find_page(*markers):
        for t in pages_text:
            if all(m in t for m in markers):
                return t
        return ""

    def _find_page_idx(*markers):
        for i, t in enumerate(pages_text):
            if all(m in t for m in markers):
                return i
        return -1

    p3             = _find_page("I. HYDROLOGY", "J. GAS SUPPLY")
    p5             = _find_page("N. CONSTRAINTS ON THE NITS")
    p6_idx         = _find_page_idx("E. SYSTEM VOLTAGES")
    p6             = pages_text[p6_idx] if p6_idx >= 0 else ""
    incidents_text = "\n".join(pages_text[2:max(p6_idx, 4)])

    # ── A. Report Header ─────────────────────────────────────────────────────
    schema.report_header = _extract_report_header(p1)
    set_section_status(schema, "report_header", found=True, row_count=1)

    # ── A. Key Stats ──────────────────────────────────────────────────────────
    p1_reconstructed = _reconstruct_page_from_words(p1_words) if p1_words else ""
    p1_combined = p1 + "\n" + p1_reconstructed
    ghana = extract_ghana_peak(p1_combined, p1_words)
    ks = _extract_key_stats(p1_combined, ghana)
    if ks:
        schema.key_stats.append(ks)
        set_section_status(schema, "key_stats", found=True, row_count=1)
    else:
        set_section_status(schema, "key_stats", found=False, notes=["Not detected"])

    # ── B. Peak Data ──────────────────────────────────────────────────────────
    peak = _smart_extract_peak(p1_combined, p1_words)
    schema.peak_data.extend(peak)
    set_section_status(schema, "peak_data", found=bool(peak), row_count=len(peak))

    # ── C. Load Curves ────────────────────────────────────────────────────────
    set_section_status(schema, "load_curve", found=False,
                       notes=["Load curve is an embedded chart image; numerical data not extractable from PDF text."])

    # ── D. Plant Generation ───────────────────────────────────────────────────
    plant_gen = _extract_plant_generation(p1)
    schema.plant_generation.extend(plant_gen)
    set_section_status(schema, "plant_generation", found=bool(plant_gen), row_count=len(plant_gen))

    # ── Unit Loadings (page 2) ────────────────────────────────────────────────
    unit_loads = _extract_unit_loadings(p2, pages_words[1] if len(pages_words) > 1 else None)
    schema.unit_loadings.extend(unit_loads)
    set_section_status(schema, "unit_loadings", found=bool(unit_loads), row_count=len(unit_loads))

    # ── E. System Frequency ───────────────────────────────────────────────────
    freq = _extract_system_frequency(p1)
    if freq:
        schema.system_frequency.append(freq)
        set_section_status(schema, "system_frequency", found=True, row_count=1)
    else:
        set_section_status(schema, "system_frequency", found=False)

    # ── F. System Stability ───────────────────────────────────────────────────
    stab = _extract_system_stability(p1)
    if stab:
        schema.system_stability.append(stab)
        set_section_status(schema, "system_stability", found=True, row_count=1)
    else:
        set_section_status(schema, "system_stability", found=False)

    # ── G. International Lines ────────────────────────────────────────────────
    intl = _extract_international_lines(p1)
    schema.international_lines.extend(intl)
    set_section_status(schema, "international_lines", found=bool(intl), row_count=len(intl))

    # ── H. Energy Exchanges ───────────────────────────────────────────────────
    exch = _extract_energy_exchanges(p1)
    schema.energy_exchanges.extend(exch)
    set_section_status(schema, "energy_exchanges", found=bool(exch), row_count=len(exch))

    # ── I. Forecasts ──────────────────────────────────────────────────────────
    forecasts = _extract_forecasts(p1)
    schema.forecasts.extend(forecasts)
    set_section_status(schema, "forecasts", found=bool(forecasts), row_count=len(forecasts))

    # ── I. Hydrology (page 3) ─────────────────────────────────────────────────
    hydro = _extract_hydrology(p3)
    schema.hydrology.extend(hydro)
    set_section_status(schema, "hydrology", found=bool(hydro), row_count=len(hydro))

    # ── J. Gas Supply (page 3) ────────────────────────────────────────────────
    gas = _extract_gas_supply(p3)
    schema.gas_supply.extend(gas)
    set_section_status(schema, "gas_supply", found=bool(gas), row_count=len(gas))

    # ── K. Liquid Fuel Stocks (page 3) ────────────────────────────────────────
    fuel = _extract_liquid_fuel_stocks(p3)
    schema.liquid_fuel_stocks.extend(fuel)
    set_section_status(schema, "liquid_fuel_stocks", found=bool(fuel), row_count=len(fuel))

    # ── L. Intertie Programme (page 3) ────────────────────────────────────────
    intertie = _extract_intertie_programme(p3)
    schema.intertie_programme.extend(intertie)
    set_section_status(schema, "intertie_programme", found=bool(intertie), row_count=len(intertie))

    # ── M. Major Incidents (pages 3–5) ────────────────────────────────────────
    incidents = _extract_major_incidents(incidents_text)
    schema.major_incidents.extend(incidents)
    set_section_status(schema, "major_incidents", found=bool(incidents), row_count=len(incidents))

    # ── N. Constraints (page 5) ───────────────────────────────────────────────
    constraints = _extract_constraints(p5)
    schema.constraints_nits.extend(constraints)
    set_section_status(schema, "constraints_nits", found=bool(constraints), row_count=len(constraints))

    # ── O. AFLS Operations ────────────────────────────────────────────────────
    afls = _extract_afls(p5)
    schema.afls_operations.extend(afls)
    set_section_status(schema, "afls_operations", found=True, row_count=len(afls),
                       notes=["None reported"] if not afls else [])

    # ── P. Special Load Shedding ──────────────────────────────────────────────
    sls = _extract_special_load_shedding(p5)
    schema.special_load_shedding.extend(sls)
    set_section_status(schema, "special_load_shedding", found=True, row_count=len(sls),
                       notes=["None reported"] if not sls else [])

    # ── Q. Miscellaneous ──────────────────────────────────────────────────────
    misc = _extract_miscellaneous(p5)
    schema.miscellaneous.extend(misc)
    set_section_status(schema, "miscellaneous", found=True, row_count=len(misc),
                       notes=["None reported"] if not misc else [])

    # ── E. System Voltages (page 6) ───────────────────────────────────────────
    voltages = _extract_system_voltages(p6)
    schema.system_voltages.extend(voltages)
    set_section_status(schema, "system_voltages", found=bool(voltages), row_count=len(voltages))

    # ── Chart Digitization — Load Curve & Voltage Trends ─────────────────────
    if _CHART_DIGITIZER_AVAILABLE:
        try:
            charts = _extract_charts(path)
            lc = charts.get("load_curve", {})
            if lc.get("system_demand"):
                schema.load_curve = lc
                set_section_status(schema, "load_curve", found=True,
                                   row_count=len(lc["system_demand"]),
                                   notes=["Extracted via chart image digitization (±1%)"])
            else:
                set_section_status(schema, "load_curve", found=False,
                                   notes=["Chart digitization returned no data"])
            vt = charts.get("voltage_trends", [])
            total_pts = sum(len(n.get("readings", [])) for n in vt)
            if total_pts > 0:
                schema.voltage_trends = vt
                set_section_status(schema, "voltage_trends", found=True,
                                   row_count=total_pts,
                                   notes=[f"Extracted {len(vt)} nodes via chart digitization (±5%)"])
            else:
                set_section_status(schema, "voltage_trends", found=False,
                                   notes=["Chart digitization returned no voltage data"])
        except Exception as e:
            set_section_status(schema, "load_curve", found=False,
                               notes=[f"Error: {str(e)}"])
            set_section_status(schema, "voltage_trends", found=False,
                               notes=[f"Error: {str(e)}"])
    else:
        set_section_status(schema, "load_curve", found=False,
                           notes=["chart_digitizer.py not found"])
        set_section_status(schema, "voltage_trends", found=False,
                           notes=["chart_digitizer.py not found"])

    return schema


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _words_to_rows(words: list[dict], x_cutoff: float = 330, bucket: int = 3) -> dict[int, str]:
    rows: dict[int, list[tuple[float, str]]] = defaultdict(list)
    for w in words:
        if w["x0"] < x_cutoff:
            ry = round(w["top"] / bucket) * bucket
            rows[ry].append((w["x0"], w["text"]))
    return {y: " ".join(t for _, t in sorted(v)) for y, v in sorted(rows.items())}


# ─────────────────────────────────────────────────────────────────────────────
# A. REPORT HEADER
# ─────────────────────────────────────────────────────────────────────────────

def _extract_report_header(text: str) -> ReportHeader:
    code  = re.search(r"(OF-\d+)", text)
    date  = re.search(r"OF-\d+\s+\w+\s+(\d{2}-\d{2}-\d{2,4})", text)
    day   = re.search(r"OF-\d+\s+(\w+)\s+\d{2}-\d{2}-\d{2,4}", text)
    fday  = re.search(r"(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s*\n\s*(\d{2}-\d{2}-\d{2,4})", text, re.I)
    email = re.search(r"([\w.\-]+@[\w.\-]+)", text)
    return ReportHeader(
        report_code=code.group(1) if code else None,
        report_title="DAILY REPORT" if "DAILY REPORT" in text else None,
        reporting_entity="GHANA GRID COMPANY LTD" if "GHANA GRID COMPANY LTD" in text else None,
        report_date=date.group(1) if date else None,
        report_day=day.group(1) if day else None,
        forecast_day=fday.group(1) if fday else None,
        source_email=email.group(1) if email else None,
    )


# ─────────────────────────────────────────────────────────────────────────────
# A. KEY STATS — FIXED
# Handles "GHANA/CEB PEAK LOAD", wrapped lines, missing MVAr/MVA columns
# ─────────────────────────────────────────────────────────────────────────────

def _extract_key_stats(text: str, ghana: dict) -> KeyStatsRecord | None:
    def cap(label: str):
        m = re.search(label + r"\s+([\d,]+(?:\.\d+)?)", text)
        return to_float(m.group(1)) if m else None

    hpl_date_m = re.search(r"HIGHEST PEAK LOAD TO DATE\s+[\d,]+\s+([\d\w\-]+)", text)

    rec = KeyStatsRecord(
        forecast_peak_demand_mw=cap(r"FORECAST PEAK DEMAND"),
        total_available_capacity_mw=cap(r"TOTAL AVAILABLE CAPACITY"),
        ghana_peak_load_mw=ghana["mw"],
        ghana_peak_load_mvar=ghana["mvar"],
        ghana_peak_load_mva=ghana["mva"],
        ghana_peak_load_time=ghana["time"],
        load_relief_planned_mw=cap(r"LOAD RELIEF PLANNED"),
        load_relief_effected_mw=cap(r"LOAD RELIEF EFFECTED"),
        highest_peak_load_to_date_mw=cap(r"HIGHEST PEAK LOAD TO DATE"),
        highest_peak_load_date=hpl_date_m.group(1) if hpl_date_m else None,
        total_installed_capacity_mw=cap(r"TOTAL INSTALLED CAPACITY"),
    )
    vals = [rec.forecast_peak_demand_mw, rec.total_available_capacity_mw,
            rec.ghana_peak_load_mw, rec.highest_peak_load_to_date_mw]
    return rec if any(v is not None for v in vals) else None


def _reconstruct_page_from_words(words: list[dict]) -> str:
    """Reconstruct full-width text rows from word bbox. No x_cutoff, tight y-bucketing."""
    rows: dict[int, list[tuple[float, str]]] = defaultdict(list)
    for w in words:
        ry = round(w["top"] / 2) * 2
        rows[ry].append((w["x0"], w["text"]))
    lines = []
    for y in sorted(rows.keys()):
        line = " ".join(t for _, t in sorted(rows[y]))
        line = re.sub(r"\b([A-Z])(?: ([A-Z]))+\b", lambda m: m.group(0).replace(" ", ""), line)
        lines.append(line)
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# D. PLANT GENERATION DATA
# ─────────────────────────────────────────────────────────────────────────────

def _extract_plant_generation(text: str) -> list[PlantGenerationRecord]:
    records: list[PlantGenerationRecord] = []

    for name, code in [("Akosombo GS", "A1"), ("Kpong GS", "Z19"), ("Bui GS", "BU54")]:
        m = re.search(
            re.escape(name) + r"\s+\(" + re.escape(code) + r"\)\s+"
            r"([\d,]+(?:\.\d+)?)\s+([\d.]+)\s+([\d,]+\.?\d*)\s+([\d.]+)", text)
        if m:
            records.append(PlantGenerationRecord(
                plant_group="HYDRO", plant_name=name, plant_code=code,
                mw_at_peak=to_float(m.group(1)), total_generation_gwh=to_float(m.group(2)),
                discharge_cfs=to_float(m.group(3)), spillage_cfs=to_float(m.group(4)),
            ))

    solar_block_m = re.search(r"^SOLAR\b.*?^THERMAL\b", text, re.S | re.M)
    solar_block = solar_block_m.group(0) if solar_block_m else ""
    for name, code in [("Bui GS", "BU54"), ("KALEO", "KL88")]:
        m = re.search(
            re.escape(name) + r"\s+\(" + re.escape(code) + r"\)\s+([\d.]+)\s+([\d.]+)",
            solar_block)
        if m:
            records.append(PlantGenerationRecord(
                plant_group="SOLAR", plant_name=name, plant_code=code,
                total_generation_gwh=to_float(m.group(1)),
                irradiance_wm2=to_float(m.group(2)),
            ))

    thermal_defs = [
        ("TAPCO", "TT32"), ("TICO", "TT32"), ("TT1PP", "TP47"), ("CENIT", "TP47"),
        ("TT2PP", "ST50"), ("Sunon Asogli Plant", "SG51"),
        ("Takoradi Thermal Extension", "TE66"), ("KTPP", "KT67"),
        ("Anwomaso Thermal", "AT91"), ("Cenpower", "CP76"), ("Karpower", "KA77"),
        ("AKSA", "AK79"), ("Amandi", "AM84"), ("Bridge Power", "BD85"),
        ("GENSER", None), ("AKSA Anwomaso", "AX95"),
    ]

    def _v(g: str):
        return None if g.strip() in ("-", "") else to_float(g)

    for name, code in thermal_defs:
        code_part = r"\s+\(" + re.escape(code) + r"\)" if code else r""
        m = re.search(
            re.escape(name) + code_part + r"\s+"
            r"([\d,]+(?:\.\d+)?)\s+([\d.]+)\s+([\d,]+\.?\d*|-)\s+([\d.]+|-)\s+([\d.]+|-)\s+([\d.]+|-)",
            text)
        if m:
            records.append(PlantGenerationRecord(
                plant_group="THERMAL", plant_name=name, plant_code=code,
                mw_at_peak=to_float(m.group(1)), total_generation_gwh=to_float(m.group(2)),
                gas_used_m3=_v(m.group(3)), lco_used_m3=_v(m.group(4)),
                dfo_used_m3=_v(m.group(5)), hfo_used_mton=_v(m.group(6)),
            ))

    for name in ["Nangbeto", "Togo Tag", "Benin Tag", "Contour Global", "CAI", "CEET"]:
        m = re.search(
            re.escape(name) + r"\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s*([\d.]+)?",
            text)
        if m:
            records.append(PlantGenerationRecord(
                plant_group="CEB", plant_name=name,
                total_generation_gwh=to_float(m.group(1)), mw_at_peak=to_float(m.group(2)),
                mvar=to_float(m.group(3)), mva=to_float(m.group(4)),
                units_count=to_int(m.group(5)),
                power_factor=to_float(m.group(6)) if m.group(6) else None,
            ))

    return records


# ─────────────────────────────────────────────────────────────────────────────
# UNIT LOADINGS (page 2)
# ─────────────────────────────────────────────────────────────────────────────

_PLANT_HEADER_MAP: dict[str, str] = {
    "Akosombo GS": "HYDRO", "Kpong GS": "HYDRO", "Bui GS": "HYDRO",
    "HYDRO UNITS": "HYDRO", "THERMAL UNITS": "THERMAL",
    "Takoradi Thermal (T3)": "THERMAL", "Kpone Thermal": "THERMAL",
    "Anwomaso Thermal": "THERMAL", "Karpower": "THERMAL",
    "Cenpower": "THERMAL", "AKSA": "THERMAL", "Amandi": "THERMAL",
    "Bridgepower": "THERMAL", "AKSA Anwomaso": "THERMAL",
    "GENSER": "THERMAL", "TAPCO": "THERMAL", "TICO": "THERMAL",
    "TT1PP": "THERMAL", "CENIT": "THERMAL", "TT2PP": "THERMAL",
    "Sunon Asogli": "THERMAL",
}

_UNIT_PAT  = re.compile(r"\b([A-Z0-9]{2,6}G\d{1,2})\b\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)")
_TOTAL_PAT = re.compile(r"^Total\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)", re.I | re.M)


def _extract_unit_loadings(text: str, page_words: list | None = None) -> list[UnitLoadingRecord]:
    if page_words:
        return _extract_unit_loadings_bbox(page_words)
    return _extract_unit_loadings_linescan(text)


def _extract_unit_loadings_bbox(page_words: list) -> list[UnitLoadingRecord]:
    from collections import defaultdict
    records: list[UnitLoadingRecord] = []

    col_x_bounds = [
        (0,   200),
        (200, 370),
        (370, 600),
    ]

    def get_col(x: float) -> int:
        for i, (lo, hi) in enumerate(col_x_bounds):
            if lo <= x < hi:
                return i
        return 2

    col_rows: list[dict] = [defaultdict(list), defaultdict(list), defaultdict(list)]
    for w in page_words:
        c = get_col(w["x0"])
        y = round(w["top"] / 3) * 3
        col_rows[c][y].append(w)

    num_re  = re.compile(r"^-?[\d.]+$")
    unit_re = re.compile(r"^[A-Z0-9]{2,6}G\d{1,2}$")

    for col_idx, rows in enumerate(col_rows):
        x_min, x_max = col_x_bounds[col_idx]
        current_plant = "Unknown"
        current_group = "THERMAL"

        for y in sorted(rows.keys()):
            words_in_row = sorted(
                [w for w in rows[y] if x_min <= w["x0"] < x_max],
                key=lambda w: w["x0"]
            )
            if not words_in_row:
                continue

            texts  = [w["text"] for w in words_in_row]
            joined = " ".join(texts)

            if any(h in joined for h in ("UNIT MW MVAr", "UNIT LOADINGS", "energydir",
                                          "ENERGY CONSERVATION", "appliances", "Turn off")):
                continue

            nums   = [t for t in texts if num_re.match(t)]
            units_ = [t for t in texts if unit_re.match(t)]

            if not nums and not units_ and re.search(r"[A-Za-z]", joined):
                candidate = joined.strip()
                for name, grp in _PLANT_HEADER_MAP.items():
                    if name in candidate:
                        current_plant = name
                        current_group = grp
                        break
                continue

            if texts and texts[0].lower() == "total" and len(nums) >= 3:
                try:
                    records.append(UnitLoadingRecord(
                        plant_group=current_group, plant_name=current_plant,
                        unit_id="Total",
                        mw=to_float(nums[0]), mvar=to_float(nums[1]),
                        mva=to_float(nums[2]),
                        power_factor=to_float(nums[3]) if len(nums) > 3 else None,
                        is_total_row=True,
                    ))
                except Exception:
                    pass
                continue

            if texts and unit_re.match(texts[0]) and len(nums) >= 3:
                try:
                    records.append(UnitLoadingRecord(
                        plant_group=current_group, plant_name=current_plant,
                        unit_id=texts[0],
                        mw=to_float(nums[0]), mvar=to_float(nums[1]),
                        mva=to_float(nums[2]),
                        power_factor=to_float(nums[3]) if len(nums) > 3 else None,
                        is_total_row=False,
                    ))
                except Exception:
                    pass

    return records


def _extract_unit_loadings_linescan(text: str) -> list[UnitLoadingRecord]:
    records: list[UnitLoadingRecord] = []
    current_plant, current_group = "Unknown", "THERMAL"
    for line in text.split("\n"):
        for ph, grp in _PLANT_HEADER_MAP.items():
            if ph in line and not re.search(r"\d+G\d+", line):
                current_plant, current_group = ph, grp
                break
        for m in _UNIT_PAT.finditer(line):
            records.append(UnitLoadingRecord(
                plant_group=current_group, plant_name=current_plant,
                unit_id=m.group(1), mw=to_float(m.group(2)),
                mvar=to_float(m.group(3)), mva=to_float(m.group(4)),
                power_factor=to_float(m.group(5)), is_total_row=False,
            ))
        tm = _TOTAL_PAT.search(line)
        if tm and not _UNIT_PAT.search(line):
            records.append(UnitLoadingRecord(
                plant_group=current_group, plant_name=current_plant,
                unit_id="Total", mw=to_float(tm.group(1)),
                mvar=to_float(tm.group(2)), mva=to_float(tm.group(3)),
                power_factor=to_float(tm.group(4)), is_total_row=True,
            ))
    return records


# ─────────────────────────────────────────────────────────────────────────────
# E. SYSTEM FREQUENCY
# ─────────────────────────────────────────────────────────────────────────────

def _extract_system_frequency(text: str) -> SystemFrequencyRecord | None:
    hf = re.search(r"Highest Frequency\s+([\d.]+)\s+(\d{2}:\d{2})", text)
    lf = re.search(r"Lowest Frequency\s+([\d.]+)\s+(\d{2}:\d{2})", text)
    if not hf and not lf:
        return None

    band_labels = ["< 49.0", "49.0 - 49.5", "49.5 - 49.8", "49.8 - 50.2",
                   "50.2 - 50.5", "50.5 - 51.0", "> 51.0"]
    band_m = re.search(r"<\s*49\.0.*?>\s*51\.0.*?\n([\d.\s]+)", text, re.S)
    band_vals: list[float | None] = []
    if band_m:
        band_vals = [to_float(v) for v in band_m.group(1).split()
                     if re.match(r"[\d.]+", v)]

    bands = [FrequencyBandRecord(
        band_label=lbl,
        percentage_of_day=band_vals[i] if i < len(band_vals) else None,
    ) for i, lbl in enumerate(band_labels)]

    return SystemFrequencyRecord(
        highest_frequency_hz=to_float(hf.group(1)) if hf else None,
        highest_frequency_time=hf.group(2) if hf else None,
        lowest_frequency_hz=to_float(lf.group(1)) if lf else None,
        lowest_frequency_time=lf.group(2) if lf else None,
        bands=bands,
    )


# ─────────────────────────────────────────────────────────────────────────────
# F. SYSTEM STABILITY
# ─────────────────────────────────────────────────────────────────────────────

def _extract_system_stability(text: str) -> SystemStabilityRecord | None:
    tc_d = re.search(r"Date of Last Total Collapse:\s*([\d\w\-]+)", text)
    tc_n = re.search(r"No\. of Days since Last Total Collapse:\s*(\d+)", text)
    md_d = re.search(r"Date of Last Major Disturbance:\s*([\d\w\-]+)", text)
    md_n = re.search(r"No\. of Days since Last Major Disturbance:\s*(\d+)", text)
    if not any([tc_d, tc_n, md_d, md_n]):
        return None
    return SystemStabilityRecord(
        date_of_last_total_collapse=tc_d.group(1) if tc_d else None,
        days_since_last_total_collapse=to_int(tc_n.group(1)) if tc_n else None,
        date_of_last_major_disturbance=md_d.group(1) if md_d else None,
        days_since_last_major_disturbance=to_int(md_n.group(1)) if md_n else None,
    )


# ─────────────────────────────────────────────────────────────────────────────
# G. INTERNATIONAL LINES
# ─────────────────────────────────────────────────────────────────────────────

def _extract_international_lines(text: str) -> list[InternationalLineRecord]:
    g_m = re.search(r"G\. INTERNATIONAL LINES(.*?)H\. ENERGY", text, re.S)
    if not g_m:
        return []
    g = g_m.group(1)

    line_defs = [
        ("P3BN Line", "225"), ("AF1L & AF2L Lines", "161"),
        ("DA1DV Line", "330"), ("NY6ZA Line", "225"),
    ]

    max_m = re.search(
        r"Maximum Load\s+(-?[\d.]+)\s+(\w+)\s+Maximum Load\s+(-?[\d.]+)\s+(\w+)"
        r"\s+Maximum Load\s+(-?[\d.]+)\s+(\w+)\s+Maximum Load\s+(-?[\d.]+)\s+(\w+)", g)
    t1_m  = re.search(
        r"Time\s+([\d:.]+)\s+h\s+Time\s+([\d:.]+)\s+h\s+Time\s+([\d:.]+)\s+h\s+Time\s+([\d:.]+)\s+h", g)
    min_m = re.search(
        r"Minimum Load\s+(-?[\d.]+)\s+(\w+)\s+Minimum Load\s+(-?[\d.]+)\s+(\w+)"
        r"\s+Minimum Load\s+(-?[\d.]+)\s+(\w+)\s+Minimum Load\s+(-?[\d.]+)\s+(\w+)", g)
    t2_m  = re.findall(
        r"Time\s+([\d:.]+)\s+h\s+Time\s+([\d:.]+)\s+h\s+Time\s+([\d:.]+)\s+h\s+Time\s+([\d:.]+)\s+h", g)

    min_times = list(t2_m[1]) if len(t2_m) > 1 else [None]*4
    max_times = list(t1_m.groups()) if t1_m else [None]*4

    records = []
    for i, (name, kv) in enumerate(line_defs):
        records.append(InternationalLineRecord(
            line_name=name,
            voltage_level_kv=to_float(kv),
            max_load=to_float(max_m.group(1+i*2)) if max_m else None,
            max_load_direction=max_m.group(2+i*2) if max_m else None,
            max_load_time=max_times[i] if i < len(max_times) else None,
            min_load=to_float(min_m.group(1+i*2)) if min_m else None,
            min_load_direction=min_m.group(2+i*2) if min_m else None,
            min_load_time=min_times[i] if i < len(min_times) else None,
        ))
    return records


# ─────────────────────────────────────────────────────────────────────────────
# H. ENERGY EXCHANGES
# ─────────────────────────────────────────────────────────────────────────────

def _extract_energy_exchanges(text: str) -> list[EnergyExchangeRecord]:
    labels = [
        "Energy Export to CIE", "Energy Import from CIE", "Energy Export to CEB",
        "Energy wheeled from CIE to CEB", "Energy Export to SONABEL",
    ]
    records = []
    for label in labels:
        m = re.search(r"([\d.]+)\s+" + re.escape(label), text)
        if m:
            records.append(EnergyExchangeRecord(exchange_name=label, energy_gwh=to_float(m.group(1))))
    return records


# ─────────────────────────────────────────────────────────────────────────────
# I. FORECASTS
# ─────────────────────────────────────────────────────────────────────────────

def _extract_forecasts(text: str) -> list[ForecastRecord]:
    fm  = re.search(r"I\. FORECASTS for:\s*\w+\s*([\d\-]+)", text)
    tac = re.search(r"([\d.]+)\s+Total Available Capacity", text)
    fpd = re.search(r"([\d.]+)\s+Forecast Peak Demand", text)
    if not any([fm, tac, fpd]):
        return []
    return [ForecastRecord(
        forecast_for_date=fm.group(1) if fm else None,
        total_available_capacity_mw=to_float(tac.group(1)) if tac else None,
        forecast_peak_demand_mw=to_float(fpd.group(1)) if fpd else None,
    )]


# ─────────────────────────────────────────────────────────────────────────────
# I. HYDROLOGY
# ─────────────────────────────────────────────────────────────────────────────

def _extract_hydrology(text: str) -> list[HydrologyRecord]:
    station_names = ["Akosombo (ft)", "Akosombo (m)", "Bui (m)", "Nangbeto (m)"]
    row_pats = [
        ("present",   r"Present Headwater level\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)"),
        ("previous",  r"Previous Headwater level\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)"),
        ("tailwater", r"Tailwater level\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)"),
        ("change",    r"Change in Lake level\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)"),
    ]
    rows: dict[str, list] = {}
    for key, pat in row_pats:
        m = re.search(pat, text)
        rows[key] = [to_float(m.group(i)) for i in range(1, 5)] if m else [None] * 4

    return [HydrologyRecord(
        station_name=sname,
        present_headwater_level=rows["present"][i],
        previous_headwater_level=rows["previous"][i],
        tailwater_level=rows["tailwater"][i],
        change_in_lake_level=rows["change"][i],
    ) for i, sname in enumerate(station_names)]


# ─────────────────────────────────────────────────────────────────────────────
# J. GAS SUPPLY
# ─────────────────────────────────────────────────────────────────────────────

def _extract_gas_supply(text: str) -> list[GasSupplyRecord]:
    defs = [
        ("Ghana Gas",                    r"Ghana Gas\s+([\d.]+)(?:\s+([\d.]+))?"),
        ("ENI",                          r"ENI\s+([\d.]+)\s+([\d.]+)"),
        ("Itoki",                        r"Itoki\s+([\d.]+)\s+([\d.]+)"),
        ("Reverse Flow (Takoradi-Tema)", r"Reverse Flow \(Takoradi-Tema\)\s+([\d.]+)\s+([\d.]+)"),
        ("Takoradi Consumption",         r"Takoradi Consumption\s+([\d.]+)"),
        ("Tema Consumption",             r"Tema Consumption\s+([\d.]+)"),
    ]
    records = []
    for name, pat in defs:
        m = re.search(pat, text)
        if m:
            pressure = to_float(m.group(1))
            flow = to_float(m.group(2)) if m.lastindex and m.lastindex >= 2 and m.group(2) else None
            records.append(GasSupplyRecord(point_name=name, gas_pressure_bar=pressure, flow_rate_mmscf=flow))
    return records


# ─────────────────────────────────────────────────────────────────────────────
# K. LIQUID FUEL STOCKS
# ─────────────────────────────────────────────────────────────────────────────

def _extract_liquid_fuel_stocks(text: str) -> list[LiquidFuelStockRecord]:
    records = []
    pat = re.compile(
        r"(Takoradi|Tema)\s+([\d,]+\.?\d*)\s+([\d.]+)\s+day\(s\)\s+(.+?)\s+([\d,]+\.?\d*)\s*$",
        re.M,
    )
    for m in pat.finditer(text):
        loc = m.group(1)
        records.append(LiquidFuelStockRecord(
            location=loc, fuel_type="LCO",
            quantity_bbls=to_float(m.group(2)),
            expected_duration_days=to_float(m.group(3)),
            assumption=clean_text(m.group(4)),
        ))
        records.append(LiquidFuelStockRecord(
            location=loc, fuel_type="DFO",
            quantity_bbls=to_float(m.group(5)),
        ))
    return records


# ─────────────────────────────────────────────────────────────────────────────
# L. INTERTIE PROGRAMME
# ─────────────────────────────────────────────────────────────────────────────

def _extract_intertie_programme(text: str) -> list[IntertieProgrammeRecord]:
    pat = re.compile(
        r"(\d{2}[\.:]\d{2})\s*h\s*-\s*(\d{2}[\.:]\d{2})\s*h\s*:\s*"
        r"VRA\s*=\s*(-?[\d.]+)\s*MW\s+CIE\s*=\s*(-?[\d.]+)\s*MW"
    )
    date_m = re.search(r"(?:FRIDAY|SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY)\s+([\d\-]+)", text, re.I)
    date_str = date_m.group(1) if date_m else None
    return [IntertieProgrammeRecord(
        date=date_str, start_time=m.group(1), end_time=m.group(2),
        vra_mw=to_float(m.group(3)), cie_mw=to_float(m.group(4)),
    ) for m in pat.finditer(text)]


# ─────────────────────────────────────────────────────────────────────────────
# M. MAJOR INCIDENTS
# ─────────────────────────────────────────────────────────────────────────────

def _extract_major_incidents(text: str) -> list[MajorIncidentRecord]:
    pat = re.compile(
        r"^(\d{1,3})([A-Z][^\n]+?)\s+([\d:.]+h|….h)\s+([\d:.]+h|….h)"
        r"(?:\s+(Was out at[^\n]+))?",
        re.M,
    )
    seen: set[int] = set()
    records: list[MajorIncidentRecord] = []

    for m in pat.finditer(text):
        raw_no = m.group(1)
        raw_eq = m.group(2)

        fused    = raw_no + raw_eq
        m_letter = re.match(r"^(\d{1,3})([A-Z][A-Z0-9\-]+)", fused)
        m_digit  = re.match(r"^(\d)(\d+[A-Z]\w*)", fused)
        if m_letter and (not m_digit or len(m_letter.group(1)) <= 2):
            no_str, eq_code = m_letter.group(1), m_letter.group(2)
        elif m_digit:
            no_str, eq_code = m_digit.group(1), m_digit.group(2)
        else:
            no_str, eq_code = raw_no, raw_eq.split()[0] if raw_eq.split() else raw_eq

        no   = to_int(no_str)
        rest = fused[len(no_str) + len(eq_code):].strip()

        suffix_m = re.match(r"^\s*(Line|unit|Lne|Substation)", rest, re.I)
        if suffix_m:
            eq_code += " " + suffix_m.group(1)
            rest = rest[suffix_m.end():].strip()

        if no in seen:
            continue
        seen.add(no)

        t_out  = m.group(3).rstrip("h").strip()
        t_rest = m.group(4).rstrip("h").strip()
        records.append(MajorIncidentRecord(
            incident_no=no,
            equipment_id=eq_code,
            description_of_event=rest,
            time_out=t_out if "…" not in t_out else None,
            time_restored=t_rest if "…" not in t_rest else None,
            remarks=clean_text(m.group(5)) if m.group(5) else None,
            still_out="…" in m.group(3) or "…" in m.group(4),
        ))
    return records


# ─────────────────────────────────────────────────────────────────────────────
# N. CONSTRAINTS
# ─────────────────────────────────────────────────────────────────────────────

def _extract_constraints(text: str) -> list[ConstraintRecord]:
    n_m = re.search(r"N\. CONSTRAINTS ON THE NITS(.*?)O\. AFLS", text, re.S)
    if not n_m:
        return []
    block = n_m.group(1)
    pat = re.compile(r"(\d+)([A-Z].+?)(?=\d+[A-Z]|$)", re.S)
    records = []
    for m in pat.finditer(block.strip()):
        no   = to_int(m.group(1))
        rest = clean_text(m.group(2))
        reason_m = re.search(
            r"(Primary Frequency Control|Prevent spilling.*?Dam|Maintain voltages.*?values|"
            r"Station service|Avoid overloading.*?transformers\.?)",
            rest, re.I | re.S)
        if reason_m:
            ct     = rest[:reason_m.start()].strip()
            reason = clean_text(reason_m.group(0))
        else:
            ct, reason = rest, None
        records.append(ConstraintRecord(
            constraint_no=no, constraint_text=ct, reason_for_constraint=reason))
    return records


# ─────────────────────────────────────────────────────────────────────────────
# O / P / Q
# ─────────────────────────────────────────────────────────────────────────────

def _extract_afls(text: str) -> list[AflsOperationRecord]:
    m = re.search(r"O\. AFLS OPERATIONS(.*?)P\. SPECIAL", text, re.S)
    if not m or re.search(r"\bNone\b", m.group(1), re.I):
        return []
    records = []
    for r in re.finditer(r"(\d+)\s+(\S+)\s+(.+?)\s+([\d:]+h?)\s+([\d:]+h?)\s*(.*?)$", m.group(1), re.M):
        records.append(AflsOperationRecord(
            operation_no=to_int(r.group(1)), feeder_id=r.group(2),
            description_of_event=clean_text(r.group(3)),
            time_out=r.group(4), time_restored=r.group(5),
            remarks=clean_text(r.group(6)) if r.group(6) else None,
        ))
    return records


def _extract_special_load_shedding(text: str) -> list[SpecialLoadSheddingRecord]:
    m = re.search(r"P\. SPECIAL LOAD SHEDDING.*?(.*?)Q\. MISCELLANEOUS", text, re.S)
    if not m or re.search(r"\bNone\b", m.group(1), re.I):
        return []
    records = []
    for r in re.finditer(r"(\d+)\s+(\S+)\s+(.+?)\s+([\d:]+h?)\s+([\d:]+h?)\s*(.*?)$", m.group(1), re.M):
        records.append(SpecialLoadSheddingRecord(
            event_no=to_int(r.group(1)), industry=r.group(2),
            description_of_event=clean_text(r.group(3)),
            time_out=r.group(4), time_restored=r.group(5),
            remarks=clean_text(r.group(6)) if r.group(6) else None,
        ))
    return records


def _extract_miscellaneous(text: str) -> list[MiscellaneousRecord]:
    m = re.search(r"Q\. MISCELLANEOUS\s*(.*?)$", text, re.S)
    if not m or re.search(r"\bNone\b", m.group(1), re.I):
        return []
    records = []
    for r in re.finditer(r"(\d+)\s+(\S+)\s+(.+?)\s+([\d:]+h?)\s+([\d:]+h?)\s*(.*?)$", m.group(1), re.M):
        records.append(MiscellaneousRecord(
            event_no=to_int(r.group(1)), feeder_id=r.group(2),
            description_of_event=clean_text(r.group(3)),
            time_out=r.group(4), time_restored=r.group(5),
            remarks=clean_text(r.group(6)) if r.group(6) else None,
        ))
    return records


# ─────────────────────────────────────────────────────────────────────────────
# E. SYSTEM VOLTAGES (page 6)
# ─────────────────────────────────────────────────────────────────────────────

def _extract_system_voltages(text: str) -> list[SystemVoltageRecord]:
    records = []
    stop_pos = len(text)
    for pat in [r"Voltages outside", r"VOLTAGE TREND"]:
        m = re.search(pat, text)
        if m and m.start() < stop_pos:
            stop_pos = m.start()
    block = text[:stop_pos]

    known_nodes = {
        "Prestea", "Akosombo GS", "Kpong GS", "Bui GS", "Takoradi Thermal",
        "SEAP (Sunon Asogli P.)", "KTPS", "ATPS", "Karpower",
        "Achimota", "Mallam", "New Tema", "Kumasi", "Takoradi",
        "Tamale", "Bolgatanga", "Kenyase",
    }
    node_pat = re.compile(r"^(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$", re.M)

    for m in node_pat.finditer(block):
        name = clean_text(m.group(1))
        if not name or name not in known_nodes:
            continue
        nominal = to_float(m.group(2))
        actual  = to_float(m.group(3))
        if nominal is None or actual is None:
            continue
        if nominal > 0 and actual > nominal * 3:
            continue
        comp = compute_voltage_compliance(actual, nominal)
        records.append(SystemVoltageRecord(
            node_name=name, nominal_kv=nominal, actual_kv=actual,
            within_normal_limits=comp["within_normal_limits"],
            deviation_percent=comp["deviation_percent"],
        ))
    return records