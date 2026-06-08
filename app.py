from __future__ import annotations

import json
import tempfile
from dataclasses import asdict
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import streamlit as st

from config import APP_LAYOUT, APP_TITLE
from pdf_parser import parse_pdf_report
from excel_parser import parse_excel_report
from file_helpers import detect_source_type

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(page_title=APP_TITLE, layout=APP_LAYOUT, page_icon="⚡")

# ── Custom CSS ────────────────────────────────────────────────────────────────
st.markdown("""
<style>
  .metric-card {background:#1e2130;border-radius:10px;padding:16px 20px;margin:4px 0;}
  .metric-label {font-size:12px;color:#a0aec0;text-transform:uppercase;letter-spacing:.8px;}
  .metric-value {font-size:28px;font-weight:700;color:#63b3ed;}
  .metric-sub   {font-size:12px;color:#68d391;}
  .section-title{font-size:16px;font-weight:600;color:#e2e8f0;
                 border-left:4px solid #4299e1;padding-left:10px;margin:12px 0 8px;}
  .alert-red    {background:#742a2a;border-radius:6px;padding:8px 12px;
                 color:#fc8181;font-size:13px;margin:4px 0;}
  .alert-green  {background:#1c4532;border-radius:6px;padding:8px 12px;
                 color:#68d391;font-size:13px;margin:4px 0;}
  .badge-out    {background:#742a2a;color:#fc8181;border-radius:4px;
                 padding:2px 8px;font-size:11px;font-weight:600;}
  .badge-ok     {background:#1c4532;color:#68d391;border-radius:4px;
                 padding:2px 8px;font-size:11px;font-weight:600;}
</style>
""", unsafe_allow_html=True)

# ── Sidebar: upload ───────────────────────────────────────────────────────────
st.sidebar.image("https://upload.wikimedia.org/wikipedia/en/thumb/3/33/GRIDCo_logo.png/220px-GRIDCo_logo.png",
                 use_container_width=True)
st.sidebar.title("GRIDCo Daily Report")

uploaded_file = st.sidebar.file_uploader(
    "Upload PDF report", type=["pdf", "xlsx", "xls"])

if uploaded_file is None:
    st.title("⚡ GRIDCo Daily Operations Dashboard")
    st.info("Upload a GRIDCo daily PDF report in the sidebar to begin.")
    st.stop()

# ── Parse ─────────────────────────────────────────────────────────────────────
source_type = detect_source_type(uploaded_file.name)
if source_type == "unknown":
    st.error("Unsupported file type.")
    st.stop()

suffix = Path(uploaded_file.name).suffix.lower()
temp_path = None
try:
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(uploaded_file.getbuffer())
        temp_path = Path(tmp.name)
    with st.spinner("Parsing report…"):
        report = parse_pdf_report(temp_path) if source_type == "pdf" else parse_excel_report(temp_path)
finally:
    if temp_path and temp_path.exists():
        temp_path.unlink()

hdr  = report.report_header
ks   = report.key_stats[0] if report.key_stats else None
freq = report.system_frequency[0] if report.system_frequency else None
stab = report.system_stability[0] if report.system_stability else None

# Sidebar info + download
st.sidebar.success(f"✓ Loaded: {uploaded_file.name}")
if hdr.report_date:
    st.sidebar.write(f"**Date:** {hdr.report_date}  |  **Day:** {hdr.report_day or '—'}")
st.sidebar.download_button(
    "⬇ Download JSON",
    data=json.dumps(report.to_dict(), indent=2),
    file_name=Path(uploaded_file.name).stem + "_parsed.json",
    mime="application/json",
)

# ── Header ────────────────────────────────────────────────────────────────────
col_h1, col_h2 = st.columns([3, 1])
with col_h1:
    st.title(f"⚡ {hdr.reporting_entity or 'GRIDCo'} — Daily Report")
    if hdr.report_date:
        st.caption(f"Report: **{hdr.report_code}** &nbsp;|&nbsp; {hdr.report_day}, {hdr.report_date}")
with col_h2:
    if hdr.source_email:
        st.caption(f"📧 {hdr.source_email}")

st.divider()

# ── Tabs ──────────────────────────────────────────────────────────────────────
tabs = st.tabs([
    "📊 Overview", "⚡ Peak & Generation", "🔋 Unit Loadings",
    "🌐 Grid & Exchanges", "💧 Hydrology & Fuel",
    "⚠️ Incidents & Constraints", "🔌 Voltages",
    "📈 Load Curves", "📉 Voltage Trends", "📋 Raw Data"
])

# ═══════════════════════════════════════════════════════════════════════════
# TAB 1 — OVERVIEW
# ═══════════════════════════════════════════════════════════════════════════
with tabs[0]:
    # Key Stats KPI row
    if ks:
        st.markdown('<div class="section-title">A. Key Statistics</div>', unsafe_allow_html=True)
        c1, c2, c3, c4, c5 = st.columns(5)
        def kpi(col, label, value, sub="", unit="MW"):
            col.markdown(
                f'<div class="metric-card">'
                f'<div class="metric-label">{label}</div>'
                f'<div class="metric-value">{value:,.0f} <span style="font-size:14px;color:#718096">{unit}</span></div>'
                f'<div class="metric-sub">{sub}</div>'
                f'</div>', unsafe_allow_html=True)
        if ks.forecast_peak_demand_mw:
            kpi(c1, "Forecast Peak Demand", ks.forecast_peak_demand_mw)
        if ks.total_available_capacity_mw:
            surplus = (ks.total_available_capacity_mw or 0) - (ks.forecast_peak_demand_mw or 0)
            kpi(c2, "Available Capacity", ks.total_available_capacity_mw,
                f"{'▲' if surplus >= 0 else '▼'} {abs(surplus):,.0f} MW vs demand")
        if ks.ghana_peak_load_mw:
            kpi(c3, "Ghana Peak Load", ks.ghana_peak_load_mw,
                f"at {ks.ghana_peak_load_time or '—'}")
        if ks.highest_peak_load_to_date_mw:
            kpi(c4, "Highest Peak (all-time)", ks.highest_peak_load_to_date_mw,
                f"on {ks.highest_peak_load_date or '—'}")
        if ks.total_installed_capacity_mw:
            kpi(c5, "Installed Capacity", ks.total_installed_capacity_mw)

        # Load relief — always show raw value, even when zero
        st.markdown('<div class="section-title">Load Relief</div>', unsafe_allow_html=True)
        r1, r2 = st.columns(2)
        planned  = ks.load_relief_planned_mw  if ks.load_relief_planned_mw  is not None else 0.0
        effected = ks.load_relief_effected_mw if ks.load_relief_effected_mw is not None else 0.0
        r1.metric("Planned (MW)",  f"{planned:,.2f}")
        r2.metric("Effected (MW)", f"{effected:,.2f}")

    # System Frequency summary
    if freq:
        st.markdown('<div class="section-title">E. System Frequency</div>', unsafe_allow_html=True)
        f1, f2 = st.columns(2)
        f1.metric("Highest Frequency (Hz)", f"{freq.highest_frequency_hz}", f"at {freq.highest_frequency_time}")
        f2.metric("Lowest Frequency (Hz)", f"{freq.lowest_frequency_hz}", f"at {freq.lowest_frequency_time}")

        if freq.bands:
            band_df = pd.DataFrame([{"Band (Hz)": b.band_label, "% of Day": b.percentage_of_day}
                                     for b in freq.bands])
            fig = px.bar(band_df, x="Band (Hz)", y="% of Day",
                         title="Frequency Distribution (% of Day)",
                         color="% of Day",
                         color_continuous_scale=["#fc8181", "#f6ad55", "#68d391", "#4299e1", "#68d391", "#f6ad55", "#fc8181"])
            fig.update_layout(template="plotly_dark", height=300, showlegend=False,
                              coloraxis_showscale=False)
            st.plotly_chart(fig, use_container_width=True)

    # System stability
    if stab:
        st.markdown('<div class="section-title">F. System Stability</div>', unsafe_allow_html=True)
        s1, s2, s3, s4 = st.columns(4)
        s1.metric("Last Total Collapse", stab.date_of_last_total_collapse or "—")
        s2.metric("Days Since Collapse", stab.days_since_last_total_collapse or "—")
        s3.metric("Last Major Disturbance", stab.date_of_last_major_disturbance or "—")
        s4.metric("Days Since Disturbance", stab.days_since_last_major_disturbance or "—")

    # Tomorrow's forecast
    if report.forecasts:
        st.markdown('<div class="section-title">I. Tomorrow\'s Forecast</div>', unsafe_allow_html=True)
        fc = report.forecasts[0]
        fc1, fc2, fc3 = st.columns(3)
        fc1.metric("Forecast Date", fc.forecast_for_date or "—")
        fc2.metric("Available Capacity (MW)", f"{fc.total_available_capacity_mw:,.0f}" if fc.total_available_capacity_mw else "—")
        fc3.metric("Forecast Peak Demand (MW)", f"{fc.forecast_peak_demand_mw:,.0f}" if fc.forecast_peak_demand_mw else "—")

    # Extraction coverage
    with st.expander("📋 Extraction Coverage"):
        status_df = pd.DataFrame([{
            "Section": s["section_name"],
            "Found": "✓" if s["found"] else "✗",
            "Rows": s["row_count"],
            "Notes": "; ".join(s["notes"]) if s["notes"] else "",
        } for s in report.to_dict()["section_statuses"]])
        st.dataframe(status_df, use_container_width=True, hide_index=True)

# ═══════════════════════════════════════════════════════════════════════════
# TAB 2 — PEAK & GENERATION
# ═══════════════════════════════════════════════════════════════════════════
with tabs[1]:
    # B. Peak Data table
    if report.peak_data:
        st.markdown('<div class="section-title">B. Peak Data</div>', unsafe_allow_html=True)
        peak_df = pd.DataFrame([asdict(p) for p in report.peak_data])
        peak_df.columns = [c.replace("_", " ").title() for c in peak_df.columns]
        st.dataframe(peak_df, use_container_width=True, hide_index=True)

        fig = px.bar(peak_df, x="Metric Name", y="Mw",
                     title="Peak Data — MW Values",
                     color="Mw", color_continuous_scale="Blues")
        fig.update_layout(template="plotly_dark", height=350, xaxis_tickangle=-25,
                          coloraxis_showscale=False)
        st.plotly_chart(fig, use_container_width=True)

    # D. Plant Generation
    if report.plant_generation:
        st.markdown('<div class="section-title">D. Plant Generation</div>', unsafe_allow_html=True)
        gen_df = pd.DataFrame([asdict(p) for p in report.plant_generation])

        # Summary by group
        grp = gen_df.groupby("plant_group").agg(
            total_mw=("mw_at_peak", "sum"),
            total_gwh=("total_generation_gwh", "sum"),
            plants=("plant_name", "count"),
        ).reset_index()
        g1, g2 = st.columns(2)
        with g1:
            fig = px.pie(grp, names="plant_group", values="total_mw",
                         title="MW at Peak by Plant Group",
                         color_discrete_sequence=px.colors.qualitative.Plotly)
            fig.update_layout(template="plotly_dark", height=300)
            st.plotly_chart(fig, use_container_width=True)
        with g2:
            fig = px.pie(grp, names="plant_group", values="total_gwh",
                         title="Total Generation (GWh) by Group",
                         color_discrete_sequence=px.colors.qualitative.Plotly)
            fig.update_layout(template="plotly_dark", height=300)
            st.plotly_chart(fig, use_container_width=True)

        # Detail tables by group
        for grp_name in ["HYDRO", "THERMAL", "SOLAR", "CEB"]:
            grp_df = gen_df[gen_df["plant_group"] == grp_name].copy()
            if grp_df.empty:
                continue
            st.markdown(f'<div class="section-title">{grp_name} Plants</div>', unsafe_allow_html=True)
            display_cols = ["plant_name", "plant_code", "mw_at_peak", "total_generation_gwh"]
            if grp_name == "HYDRO":
                display_cols += ["discharge_cfs", "spillage_cfs"]
            elif grp_name == "THERMAL":
                display_cols += ["gas_used_m3", "lco_used_m3", "hfo_used_mton"]
            elif grp_name == "SOLAR":
                display_cols += ["irradiance_wm2"]
            elif grp_name == "CEB":
                display_cols += ["mvar", "mva", "units_count", "power_factor"]
            display_cols = [c for c in display_cols if c in grp_df.columns]
            show = grp_df[display_cols].copy()
            show.columns = [c.replace("_", " ").title() for c in show.columns]
            st.dataframe(show, use_container_width=True, hide_index=True)

        # Bar chart: MW at peak for all thermal plants
        thermal_df = gen_df[(gen_df["plant_group"] == "THERMAL") & (gen_df["mw_at_peak"].notna())]
        if not thermal_df.empty:
            fig = px.bar(thermal_df.sort_values("mw_at_peak", ascending=True),
                         x="mw_at_peak", y="plant_name", orientation="h",
                         title="Thermal Plants — MW at Peak",
                         color="mw_at_peak", color_continuous_scale="Teal")
            fig.update_layout(template="plotly_dark", height=500, coloraxis_showscale=False,
                              yaxis_title="", xaxis_title="MW at Peak")
            st.plotly_chart(fig, use_container_width=True)

# ═══════════════════════════════════════════════════════════════════════════
# TAB 3 — UNIT LOADINGS
# ═══════════════════════════════════════════════════════════════════════════
with tabs[2]:
    if report.unit_loadings:
        ul_df = pd.DataFrame([asdict(u) for u in report.unit_loadings])
        non_total = ul_df[~ul_df["is_total_row"]]
        totals    = ul_df[ul_df["is_total_row"]]

        st.markdown('<div class="section-title">Unit Loadings at Peak — Totals by Plant</div>',
                    unsafe_allow_html=True)
        tot_show = totals[["plant_name", "mw", "mvar", "mva", "power_factor"]].copy()
        tot_show.columns = ["Plant", "MW", "MVAr", "MVA", "PF"]
        tot_show = tot_show.sort_values("MW", ascending=False)
        st.dataframe(tot_show, use_container_width=True, hide_index=True)

        if not totals.empty:
            fig = px.bar(tot_show, x="Plant", y="MW",
                         title="Total MW at Peak by Plant",
                         color="MW", color_continuous_scale="Viridis")
            fig.update_layout(template="plotly_dark", height=380,
                              xaxis_tickangle=-30, coloraxis_showscale=False)
            st.plotly_chart(fig, use_container_width=True)

        st.markdown('<div class="section-title">Individual Unit Loadings</div>', unsafe_allow_html=True)
        plant_filter = st.selectbox("Filter by plant",
                                    ["All"] + sorted(non_total["plant_name"].unique().tolist()))
        filtered = non_total if plant_filter == "All" else non_total[non_total["plant_name"] == plant_filter]
        show = filtered[["plant_group", "plant_name", "unit_id", "mw", "mvar", "mva", "power_factor"]].copy()
        show.columns = ["Group", "Plant", "Unit", "MW", "MVAr", "MVA", "PF"]
        st.dataframe(show, use_container_width=True, hide_index=True)
    else:
        st.info("No unit loading data extracted.")

# ═══════════════════════════════════════════════════════════════════════════
# TAB 4 — GRID & EXCHANGES
# ═══════════════════════════════════════════════════════════════════════════
with tabs[3]:
    col1, col2 = st.columns(2)

    with col1:
        if report.international_lines:
            st.markdown('<div class="section-title">G. International Lines</div>', unsafe_allow_html=True)
            il_df = pd.DataFrame([asdict(l) for l in report.international_lines])
            show = il_df[["line_name","voltage_level_kv","max_load","max_load_direction",
                           "max_load_time","min_load","min_load_direction","min_load_time"]].copy()
            show.columns = ["Line","kV","Max Load","Max Dir","Max Time","Min Load","Min Dir","Min Time"]
            st.dataframe(show, use_container_width=True, hide_index=True)

    with col2:
        if report.energy_exchanges:
            st.markdown('<div class="section-title">H. Energy Exchanges (GWh)</div>', unsafe_allow_html=True)
            ex_df = pd.DataFrame([asdict(e) for e in report.energy_exchanges])
            st.dataframe(ex_df.rename(columns={"exchange_name":"Exchange","energy_gwh":"GWh"}),
                         use_container_width=True, hide_index=True)
            fig = px.bar(ex_df, x="exchange_name", y="energy_gwh",
                         title="Energy Exchanges (GWh)",
                         color="energy_gwh", color_continuous_scale="Sunset")
            fig.update_layout(template="plotly_dark", height=280,
                              xaxis_tickangle=-20, coloraxis_showscale=False,
                              xaxis_title="", yaxis_title="GWh")
            st.plotly_chart(fig, use_container_width=True)

    if report.intertie_programme:
        st.markdown('<div class="section-title">L. Ghana–Côte d\'Ivoire Intertie Programme</div>',
                    unsafe_allow_html=True)
        it_df = pd.DataFrame([asdict(i) for i in report.intertie_programme])
        it_df.columns = [c.replace("_", " ").title() for c in it_df.columns]
        st.dataframe(it_df, use_container_width=True, hide_index=True)

# ═══════════════════════════════════════════════════════════════════════════
# TAB 5 — HYDROLOGY & FUEL
# ═══════════════════════════════════════════════════════════════════════════
with tabs[4]:
    col1, col2 = st.columns(2)

    with col1:
        if report.hydrology:
            st.markdown('<div class="section-title">I. Hydrology Data</div>', unsafe_allow_html=True)
            hy_df = pd.DataFrame([asdict(h) for h in report.hydrology])
            hy_df.columns = [c.replace("_", " ").title() for c in hy_df.columns]
            st.dataframe(hy_df, use_container_width=True, hide_index=True)

            fig = go.Figure()
            for _, row in pd.DataFrame([asdict(h) for h in report.hydrology]).iterrows():
                if row["present_headwater_level"] is not None:
                    fig.add_trace(go.Bar(
                        name=row["station_name"],
                        x=["Present HW", "Previous HW", "Tailwater"],
                        y=[row["present_headwater_level"],
                           row["previous_headwater_level"],
                           row["tailwater_level"]],
                    ))
            fig.update_layout(template="plotly_dark", height=320,
                              title="Headwater Levels", barmode="group")
            st.plotly_chart(fig, use_container_width=True)

    with col2:
        if report.gas_supply:
            st.markdown('<div class="section-title">J. Gas Supply</div>', unsafe_allow_html=True)
            gs_df = pd.DataFrame([asdict(g) for g in report.gas_supply])
            gs_df.columns = [c.replace("_", " ").title() for c in gs_df.columns]
            st.dataframe(gs_df, use_container_width=True, hide_index=True)

    if report.liquid_fuel_stocks:
        st.markdown('<div class="section-title">K. Liquid Fuel Stocks</div>', unsafe_allow_html=True)
        lf_df = pd.DataFrame([asdict(l) for l in report.liquid_fuel_stocks])
        lf_df.columns = [c.replace("_", " ").title() for c in lf_df.columns]
        st.dataframe(lf_df, use_container_width=True, hide_index=True)

        fig = px.bar(pd.DataFrame([asdict(l) for l in report.liquid_fuel_stocks]),
                     x="location", y="quantity_bbls", color="fuel_type",
                     barmode="group", title="Liquid Fuel Stocks (bbls)",
                     color_discrete_sequence=["#4299e1", "#f6ad55"])
        fig.update_layout(template="plotly_dark", height=300, xaxis_title="", yaxis_title="bbls")
        st.plotly_chart(fig, use_container_width=True)

# ═══════════════════════════════════════════════════════════════════════════
# TAB 6 — INCIDENTS & CONSTRAINTS
# ═══════════════════════════════════════════════════════════════════════════
with tabs[5]:
    if report.major_incidents:
        st.markdown('<div class="section-title">M. Major Incidents</div>', unsafe_allow_html=True)
        still_out = [i for i in report.major_incidents if i.still_out]
        if still_out:
            st.markdown(f'<div class="alert-red">⚠️ {len(still_out)} equipment still out of service</div>',
                        unsafe_allow_html=True)

        inc_df = pd.DataFrame([{
            "No": i.incident_no,
            "Equipment": i.equipment_id,
            "Description": i.description_of_event,
            "Time Out": i.time_out or "—",
            "Restored": i.time_restored or "—",
            "Still Out": "🔴" if i.still_out else "✅",
            "Remarks": i.remarks or "",
        } for i in report.major_incidents])
        st.dataframe(inc_df, use_container_width=True, hide_index=True, height=400)

    else:
        st.markdown('<div class="alert-green">✓ No major incidents reported</div>',
                    unsafe_allow_html=True)

    if report.constraints_nits:
        st.markdown('<div class="section-title">N. Constraints on the NITS</div>', unsafe_allow_html=True)
        con_df = pd.DataFrame([{
            "No": c.constraint_no,
            "Constraint": c.constraint_text,
            "Reason": c.reason_for_constraint or "—",
        } for c in report.constraints_nits if c.constraint_no])
        st.dataframe(con_df, use_container_width=True, hide_index=True)

    # O/P/Q
    col1, col2, col3 = st.columns(3)
    with col1:
        st.markdown('<div class="section-title">O. AFLS Operations</div>', unsafe_allow_html=True)
        if report.afls_operations:
            st.dataframe(pd.DataFrame([asdict(a) for a in report.afls_operations]),
                         use_container_width=True, hide_index=True)
        else:
            st.markdown('<div class="alert-green">None reported</div>', unsafe_allow_html=True)
    with col2:
        st.markdown('<div class="section-title">P. Special Load Shedding</div>', unsafe_allow_html=True)
        if report.special_load_shedding:
            st.dataframe(pd.DataFrame([asdict(s) for s in report.special_load_shedding]),
                         use_container_width=True, hide_index=True)
        else:
            st.markdown('<div class="alert-green">None reported</div>', unsafe_allow_html=True)
    with col3:
        st.markdown('<div class="section-title">Q. Miscellaneous</div>', unsafe_allow_html=True)
        if report.miscellaneous:
            st.dataframe(pd.DataFrame([asdict(m) for m in report.miscellaneous]),
                         use_container_width=True, hide_index=True)
        else:
            st.markdown('<div class="alert-green">None reported</div>', unsafe_allow_html=True)

# ═══════════════════════════════════════════════════════════════════════════
# TAB 7 — VOLTAGES
# ═══════════════════════════════════════════════════════════════════════════
with tabs[6]:
    if report.system_voltages:
        st.markdown('<div class="section-title">System Voltages at Selected Nodes (kV)</div>',
                    unsafe_allow_html=True)
        vlt_df = pd.DataFrame([asdict(v) for v in report.system_voltages])
        outside = vlt_df[vlt_df["within_normal_limits"] == False]
        if not outside.empty:
            st.markdown(
                f'<div class="alert-red">⚠️ {len(outside)} node(s) outside ±5% nominal: '
                f'{", ".join(outside["node_name"].tolist())}</div>',
                unsafe_allow_html=True)

        vlt_df["Status"] = vlt_df["within_normal_limits"].map(
            {True: "✅ OK", False: "🔴 Out of limits", None: "—"})
        show_cols = ["node_name", "nominal_kv", "actual_kv", "deviation_percent", "Status"]
        show = vlt_df[show_cols].copy()
        show.columns = ["Node", "Nominal kV", "Actual kV", "Deviation %", "Status"]
        st.dataframe(show, use_container_width=True, hide_index=True)

        # Gauge-style bar chart
        fig = go.Figure()
        colors = ["#fc8181" if not ok else "#68d391"
                  for ok in vlt_df["within_normal_limits"].fillna(True)]
        fig.add_trace(go.Bar(
            x=vlt_df["node_name"],
            y=vlt_df["actual_kv"],
            marker_color=colors,
            name="Actual kV",
        ))
        fig.add_trace(go.Scatter(
            x=vlt_df["node_name"],
            y=vlt_df["nominal_kv"],
            mode="markers",
            marker=dict(symbol="line-ew", size=16, color="white",
                        line=dict(color="white", width=2)),
            name="Nominal kV",
        ))
        fig.update_layout(template="plotly_dark", height=400,
                          title="Actual vs Nominal Voltage (kV) — Red = out of ±5% limits",
                          xaxis_tickangle=-25, xaxis_title="", yaxis_title="kV")
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("No voltage data extracted.")

# ═══════════════════════════════════════════════════════════════════════════
# TAB 8 — RAW DATA
# ═══════════════════════════════════════════════════════════════════════════
with tabs[7]:
    lc_data = getattr(report, 'load_curve', {})
    if lc_data and lc_data.get('system_demand'):
        st.markdown('<div class="section-title">C. Load Curves — System & Domestic Demand (MW)</div>',
                    unsafe_allow_html=True)
        sd = lc_data.get('system_demand', [])
        dd = lc_data.get('domestic_demand', [])
        st.caption(f"Extracted via chart image digitization · {lc_data.get('accuracy_note','')}")

        import plotly.graph_objects as go
        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=[p['time'] for p in sd], y=[p['value_mw'] for p in sd],
            mode='lines', name='System Demand',
            line=dict(color='#4299e1', width=2)
        ))
        if dd:
            fig.add_trace(go.Scatter(
                x=[p['time'] for p in dd], y=[p['value_mw'] for p in dd],
                mode='lines', name='Domestic Demand',
                line=dict(color='#f6ad55', width=2)
            ))
        fig.update_layout(
            template='plotly_dark', height=400,
            xaxis_title='Time (hh:mm)', yaxis_title='MW',
            title='System Demand vs Domestic Demand — 30-min intervals',
            legend=dict(orientation='h', yanchor='bottom', y=1.02)
        )
        fig.update_xaxes(tickangle=-45, nticks=24)
        st.plotly_chart(fig, use_container_width=True)

        c1, c2 = st.columns(2)
        with c1:
            st.markdown('<div class="section-title">System Demand (MW)</div>', unsafe_allow_html=True)
            sd_df = pd.DataFrame(sd)
            sd_df.columns = ['Time', 'MW']
            st.dataframe(sd_df, use_container_width=True, hide_index=True)
        with c2:
            st.markdown('<div class="section-title">Domestic Demand (MW)</div>', unsafe_allow_html=True)
            if dd:
                dd_df = pd.DataFrame(dd)
                dd_df.columns = ['Time', 'MW']
                st.dataframe(dd_df, use_container_width=True, hide_index=True)
    else:
        st.info("Load curve data not yet extracted. Run with chart_digitizer.py installed.")

with tabs[8]:
    vt_data = getattr(report, 'voltage_trends', [])
    if vt_data:
        st.markdown('<div class="section-title">Voltage Trend Curves — Hourly kV by Node</div>',
                    unsafe_allow_html=True)
        st.caption("Extracted via chart image digitization · ±5% accuracy vs PDF table values")

        node_names = [n['node_name'] for n in vt_data]
        selected_nodes = st.multiselect('Select nodes to plot', node_names, default=node_names[:4])

        import plotly.graph_objects as go
        colors = ['#4299e1','#68d391','#f6ad55','#fc8181','#b794f4',
                  '#76e4f7','#fbd38d','#9ae6b4','#fed7d7','#e9d8fd']
        fig = go.Figure()
        for i, node in enumerate(vt_data):
            if node['node_name'] in selected_nodes:
                readings = node.get('readings', [])
                if readings:
                    fig.add_trace(go.Scatter(
                        x=[r['time'] for r in readings],
                        y=[r['value_kv'] for r in readings],
                        mode='lines+markers',
                        name=f"{node['node_name']} ({node['kv_min']}-{node['kv_max']} kV)",
                        line=dict(color=colors[i % len(colors)], width=2),
                        marker=dict(size=4),
                    ))
        fig.update_layout(
            template='plotly_dark', height=450,
            xaxis_title='Time (hh:00)', yaxis_title='kV',
            title='Voltage Trends — Hourly readings',
            legend=dict(orientation='h', yanchor='bottom', y=1.02)
        )
        st.plotly_chart(fig, use_container_width=True)

        st.markdown('<div class="section-title">All node readings</div>', unsafe_allow_html=True)
        for node in vt_data:
            readings = node.get('readings', [])
            if not readings:
                continue
            with st.expander(f"{node['node_name']} — {node['kv_min']}-{node['kv_max']} kV ({len(readings)} hourly pts)"):
                node_df = pd.DataFrame(readings)
                node_df.columns = ['Time', 'kV']
                peak_kv = node_df['kV'].max()
                min_kv  = node_df['kV'].min()
                c1, c2, c3 = st.columns(3)
                c1.metric("Peak kV", f"{peak_kv:.1f}")
                c2.metric("Min kV", f"{min_kv:.1f}")
                c3.metric("Range kV", f"{peak_kv - min_kv:.1f}")
                st.dataframe(node_df, use_container_width=True, hide_index=True)
    else:
        st.info("Voltage trend data not yet extracted.")

with tabs[9]:
    st.markdown('<div class="section-title">Full Parsed JSON</div>', unsafe_allow_html=True)
    st.code(json.dumps(report.to_dict(), indent=2), language="json")
