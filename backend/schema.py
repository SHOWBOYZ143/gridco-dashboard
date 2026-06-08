from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Union


@dataclass
class ExtractionMeta:
    source_type: str
    source_name: str
    parser_version: str = "1.0.0"
    extraction_timestamp: Optional[str] = None
    sheet_name: Optional[str] = None
    page_range: Optional[str] = None
    confidence: Optional[float] = None
    notes: List[str] = field(default_factory=list)


@dataclass
class SectionStatus:
    section_name: str
    expected: bool = True
    found: bool = False
    reported_none: bool = False
    partially_extracted: bool = False
    row_count: int = 0
    missing_fields: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)


@dataclass
class ReportHeader:
    report_code: Optional[str] = None
    report_title: Optional[str] = None
    reporting_entity: Optional[str] = None
    report_date: Optional[str] = None
    report_day: Optional[str] = None
    forecast_day: Optional[str] = None
    source_email: Optional[str] = None


@dataclass
class KeyStatsRecord:
    forecast_peak_demand_mw: Optional[float] = None
    total_available_capacity_mw: Optional[float] = None
    ghana_peak_load_mw: Optional[float] = None
    ghana_peak_load_mvar: Optional[float] = None
    ghana_peak_load_mva: Optional[float] = None
    ghana_peak_load_time: Optional[str] = None
    load_relief_planned_mw: Optional[float] = None
    load_relief_effected_mw: Optional[float] = None
    highest_peak_load_to_date_mw: Optional[float] = None
    highest_peak_load_date: Optional[str] = None
    total_installed_capacity_mw: Optional[float] = None


@dataclass
class PeakDataRecord:
    metric_name: str
    mw: Optional[float] = None
    mvar: Optional[float] = None
    mva: Optional[float] = None
    time: Optional[str] = None


@dataclass
class LoadCurvePoint:
    time_of_day: str
    system_demand_mw: Optional[float] = None
    domestic_demand_mw: Optional[float] = None
    load_shed_mw: Optional[float] = None


@dataclass
class PlantGenerationRecord:
    plant_group: str
    plant_name: str
    plant_code: Optional[str] = None
    mw_at_peak: Optional[float] = None
    total_generation_gwh: Optional[float] = None
    discharge_cfs: Optional[float] = None
    spillage_cfs: Optional[float] = None
    irradiance_wm2: Optional[float] = None
    gas_used_m3: Optional[float] = None
    lco_used_m3: Optional[float] = None
    dfo_used_m3: Optional[float] = None
    hfo_used_mton: Optional[float] = None
    mvar: Optional[float] = None
    mva: Optional[float] = None
    units_count: Optional[int] = None
    power_factor: Optional[float] = None


@dataclass
class UnitLoadingRecord:
    plant_group: str
    plant_name: str
    unit_id: str
    mw: Optional[float] = None
    mvar: Optional[float] = None
    mva: Optional[float] = None
    power_factor: Optional[float] = None
    is_total_row: bool = False


@dataclass
class FrequencyBandRecord:
    band_label: str
    percentage_of_day: Optional[float] = None


@dataclass
class SystemFrequencyRecord:
    highest_frequency_hz: Optional[float] = None
    highest_frequency_time: Optional[str] = None
    lowest_frequency_hz: Optional[float] = None
    lowest_frequency_time: Optional[str] = None
    bands: List[FrequencyBandRecord] = field(default_factory=list)


@dataclass
class SystemStabilityRecord:
    date_of_last_total_collapse: Optional[str] = None
    days_since_last_total_collapse: Optional[int] = None
    date_of_last_major_disturbance: Optional[str] = None
    days_since_last_major_disturbance: Optional[int] = None


@dataclass
class InternationalLineRecord:
    line_name: str
    voltage_level_kv: Optional[float] = None
    max_load: Optional[float] = None
    max_load_direction: Optional[str] = None
    max_load_time: Optional[str] = None
    min_load: Optional[float] = None
    min_load_direction: Optional[str] = None
    min_load_time: Optional[str] = None


@dataclass
class EnergyExchangeRecord:
    exchange_name: str
    energy_gwh: Optional[float] = None


@dataclass
class ForecastRecord:
    forecast_for_date: Optional[str] = None
    total_available_capacity_mw: Optional[float] = None
    forecast_peak_demand_mw: Optional[float] = None


@dataclass
class HydrologyRecord:
    station_name: str
    date: Optional[str] = None
    present_headwater_level: Optional[float] = None
    previous_headwater_level: Optional[float] = None
    tailwater_level: Optional[float] = None
    change_in_lake_level: Optional[float] = None
    unit_label: Optional[str] = None


@dataclass
class GasSupplyRecord:
    point_name: str
    date: Optional[str] = None
    gas_pressure_bar: Optional[float] = None
    flow_rate_mmscf: Optional[float] = None


@dataclass
class LiquidFuelStockRecord:
    location: str
    date: Optional[str] = None
    fuel_type: str = "LCO"
    quantity_bbls: Optional[float] = None
    expected_duration_days: Optional[float] = None
    assumption: Optional[str] = None


@dataclass
class IntertieProgrammeRecord:
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    vra_mw: Optional[float] = None
    cie_mw: Optional[float] = None


@dataclass
class MajorIncidentRecord:
    incident_no: Optional[int] = None
    equipment_id: Optional[str] = None
    description_of_event: Optional[str] = None
    relay_operation: Optional[str] = None
    time_out: Optional[str] = None
    time_restored: Optional[str] = None
    remarks: Optional[str] = None
    still_out: bool = False


@dataclass
class ConstraintRecord:
    constraint_no: Optional[int] = None
    constraint_text: Optional[str] = None
    reason_for_constraint: Optional[str] = None


@dataclass
class AflsOperationRecord:
    operation_no: Optional[int] = None
    feeder_id: Optional[str] = None
    description_of_event: Optional[str] = None
    time_out: Optional[str] = None
    time_restored: Optional[str] = None
    remarks: Optional[str] = None


@dataclass
class SpecialLoadSheddingRecord:
    event_no: Optional[int] = None
    industry: Optional[str] = None
    description_of_event: Optional[str] = None
    time_out: Optional[str] = None
    time_restored: Optional[str] = None
    remarks: Optional[str] = None


@dataclass
class MiscellaneousRecord:
    event_no: Optional[int] = None
    feeder_id: Optional[str] = None
    description_of_event: Optional[str] = None
    time_out: Optional[str] = None
    time_restored: Optional[str] = None
    remarks: Optional[str] = None


@dataclass
class SystemVoltageRecord:
    node_name: str
    nominal_kv: Optional[float] = None
    actual_kv: Optional[float] = None
    within_normal_limits: Optional[bool] = None
    deviation_percent: Optional[float] = None


@dataclass
class VoltageTrendPoint:
    node_name: str
    time_of_day: str
    voltage_kv: Optional[float] = None


@dataclass
class UnifiedReportSchema:
    extraction_meta: ExtractionMeta
    report_header: ReportHeader = field(default_factory=ReportHeader)
    section_statuses: List[SectionStatus] = field(default_factory=list)
    key_stats: List[KeyStatsRecord] = field(default_factory=list)
    peak_data: List[PeakDataRecord] = field(default_factory=list)
    load_curve: List[LoadCurvePoint] = field(default_factory=list)
    plant_generation: List[PlantGenerationRecord] = field(default_factory=list)
    unit_loadings: List[UnitLoadingRecord] = field(default_factory=list)
    system_frequency: List[SystemFrequencyRecord] = field(default_factory=list)
    system_stability: List[SystemStabilityRecord] = field(default_factory=list)
    international_lines: List[InternationalLineRecord] = field(default_factory=list)
    energy_exchanges: List[EnergyExchangeRecord] = field(default_factory=list)
    forecasts: List[ForecastRecord] = field(default_factory=list)
    hydrology: List[HydrologyRecord] = field(default_factory=list)
    gas_supply: List[GasSupplyRecord] = field(default_factory=list)
    liquid_fuel_stocks: List[LiquidFuelStockRecord] = field(default_factory=list)
    intertie_programme: List[IntertieProgrammeRecord] = field(default_factory=list)
    major_incidents: List[MajorIncidentRecord] = field(default_factory=list)
    constraints_nits: List[ConstraintRecord] = field(default_factory=list)
    afls_operations: List[AflsOperationRecord] = field(default_factory=list)
    special_load_shedding: List[SpecialLoadSheddingRecord] = field(default_factory=list)
    miscellaneous: List[MiscellaneousRecord] = field(default_factory=list)
    system_voltages: List[SystemVoltageRecord] = field(default_factory=list)
    voltage_trends: List[VoltageTrendPoint] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


EXPECTED_SECTIONS = [
    "report_header",
    "key_stats",
    "peak_data",
    "load_curve",
    "plant_generation",
    "unit_loadings",
    "system_frequency",
    "system_stability",
    "international_lines",
    "energy_exchanges",
    "forecasts",
    "hydrology",
    "gas_supply",
    "liquid_fuel_stocks",
    "intertie_programme",
    "major_incidents",
    "constraints_nits",
    "afls_operations",
    "special_load_shedding",
    "miscellaneous",
    "system_voltages",
    "voltage_trends",
]


def build_empty_report(source_type: str, source_name: str) -> UnifiedReportSchema:
    schema = UnifiedReportSchema(
        extraction_meta=ExtractionMeta(source_type=source_type, source_name=source_name)
    )
    schema.section_statuses = [SectionStatus(section_name=name) for name in EXPECTED_SECTIONS]
    return schema


def set_section_status(
    schema: UnifiedReportSchema,
    section_name: str,
    *,
    found: bool,
    reported_none: bool = False,
    partially_extracted: bool = False,
    row_count: int = 0,
    missing_fields: Optional[List[str]] = None,
    notes: Optional[List[str]] = None,
) -> None:
    for status in schema.section_statuses:
        if status.section_name == section_name:
            status.found = found
            status.reported_none = reported_none
            status.partially_extracted = partially_extracted
            status.row_count = row_count
            status.missing_fields = missing_fields or []
            status.notes = notes or []
            return


def compute_voltage_compliance(
    actual_kv: Optional[float],
    nominal_kv: Optional[float],
    tolerance_percent: float = 5.0,
) -> Dict[str, Optional[Union[float, bool]]]:
    if actual_kv is None or nominal_kv is None or nominal_kv == 0:
        return {"within_normal_limits": None, "deviation_percent": None}

    deviation_percent = ((actual_kv - nominal_kv) / nominal_kv) * 100
    within_normal_limits = abs(deviation_percent) <= tolerance_percent
    return {
        "within_normal_limits": within_normal_limits,
        "deviation_percent": round(deviation_percent, 4),
    }