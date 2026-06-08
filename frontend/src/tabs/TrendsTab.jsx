import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine, Cell,
} from 'recharts';

const fmt  = (n, d=4) => n != null ? Number(n).toLocaleString(undefined, { maximumFractionDigits: d }) : '—';
const TT   = { contentStyle: { background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12, color: '#f1f5f9' }, labelStyle: { color: '#94a3b8' }, itemStyle: { color: '#f1f5f9' } };
const PLANT_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#84cc16','#a78bfa','#fb923c','#34d399'];

// ── Date helpers ─────────────────────────────────────────────────────────────
const parseDate = r => {
  const d = r?.report_header?.report_date || '';
  const p = d.split(/[-/]/);
  if (p.length === 3) {
    const day   = parseInt(p[0].length === 4 ? p[2] : p[0], 10);
    const month = parseInt(p[1], 10);
    const year  = parseInt(p[0].length === 4 ? p[0] : (p[2].length === 2 ? '20' + p[2] : p[2]), 10);
    return new Date(year, month - 1, day);
  }
  return new Date(0);
};

const shortDate = r => {
  const d = r?.report_header?.report_date || '?';
  const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const p = d.split(/[-/]/);
  if (p.length === 3) {
    const day   = parseInt(p[0].length === 4 ? p[2] : p[0], 10);
    const month = parseInt(p[1], 10);
    return `${day} ${months[month] || '?'}`;
  }
  return d;
};

const monthName = d => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
const weekLabel = (weekNum, month) => `W${weekNum} ${month}`;

// ── Extract series from a report ─────────────────────────────────────────────
const buildSeries = reports => reports.map(r => {
  const k  = r?.key_stats?.[0]  || {};
  const fr = r?.system_frequency?.[0] || {};
  const st = r?.system_stability?.[0] || {};
  const plants = r?.plant_generation || [];
  const sum = grp => plants.filter(p => p.plant_group === grp).reduce((s, p) => s + (p.mw_at_peak || 0), 0);
  const sumGwh = grp => plants.filter(p => p.plant_group === grp).reduce((s, p) => s + (p.total_generation_gwh || 0), 0);
  const total = sum('HYDRO') + sum('THERMAL') + sum('SOLAR') || 1;
  const date  = parseDate(r);
  return {
    r,
    date,
    label:        shortDate(r),
    fullDate:     r?.report_header?.report_date || '?',
    day:          r?.report_header?.report_day  || '',
    month:        monthName(date),
    monthNum:     date.getMonth(),
    weekOfMonth:  Math.ceil(date.getDate() / 7),
    dayOfMonth:   date.getDate(),
    peak_demand:  k.forecast_peak_demand_mw,
    avail_cap:    k.total_available_capacity_mw,
    ghana_peak:   k.ghana_peak_load_mw,
    surplus:      (k.total_available_capacity_mw || 0) - (k.forecast_peak_demand_mw || 0),
    thermal_mw:   sum('THERMAL'),
    hydro_mw:     sum('HYDRO'),
    solar_mw:     sum('SOLAR'),
    total_mw:     sum('HYDRO') + sum('THERMAL') + sum('SOLAR'),
    thermal_gwh:  +sumGwh('THERMAL').toFixed(3),
    hydro_gwh:    +sumGwh('HYDRO').toFixed(3),
    solar_gwh:    +sumGwh('SOLAR').toFixed(4),
    total_gwh:    +(sumGwh('HYDRO') + sumGwh('THERMAL') + sumGwh('SOLAR')).toFixed(3),
    hydro_pct:    +((sum('HYDRO') / total) * 100).toFixed(1),
    thermal_pct:  +((sum('THERMAL') / total) * 100).toFixed(1),
    freq_high:    fr.highest_frequency_hz,
    freq_low:     fr.lowest_frequency_hz,
    incidents:    (r?.major_incidents || []).length,
    still_out:    (r?.major_incidents || []).filter(i => i.still_out).length,
    days_stable:  st.days_since_last_total_collapse,
    fuel_bbls:    (r?.liquid_fuel_stocks || []).reduce((s, f) => s + (f.quantity_bbls || 0), 0),
  };
});

// ── Aggregate helper (for weekly/monthly summaries) ──────────────────────────
const aggregate = (items, labelFn) => {
  if (!items.length) return null;
  const avg = key => items.reduce((s, i) => s + (i[key] || 0), 0) / items.length;
  const sum = key => items.reduce((s, i) => s + (i[key] || 0), 0);
  const max = (arr, key) => arr.reduce((m, i) => (i[key] || 0) > (m[key] || 0) ? i : m, arr[0]);
  const min = (arr, key) => arr.reduce((m, i) => (i[key] || 0) < (m[key] || 0) ? i : m, arr[0]);
  return {
    label:       labelFn(items),
    count:       items.length,
    peak_demand: +avg('peak_demand').toFixed(0),
    avail_cap:   +avg('avail_cap').toFixed(0),
    ghana_peak:  +avg('ghana_peak').toFixed(0),
    surplus:     +avg('surplus').toFixed(0),
    thermal_mw:  +avg('thermal_mw').toFixed(0),
    hydro_mw:    +avg('hydro_mw').toFixed(0),
    total_mw:    +avg('total_mw').toFixed(0),
    total_gwh:   +sum('total_gwh').toFixed(2),
    thermal_gwh: +sum('thermal_gwh').toFixed(2),
    hydro_gwh:   +sum('hydro_gwh').toFixed(2),
    incidents:   sum('incidents'),
    still_out:   sum('still_out'),
    freq_high:   +Math.max(...items.map(i => i.freq_high || 0)).toFixed(2),
    freq_low:    +Math.min(...items.map(i => i.freq_low || 99)).toFixed(2),
    max_peak_day: max(items, 'peak_demand'),
    min_peak_day: min(items, 'peak_demand'),
    items,
  };
};

// ── Shared chart components ───────────────────────────────────────────────────
const Toggle = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', gap: 4 }}>
    {options.map(([id, lbl]) => (
      <button key={id} onClick={() => onChange(id)} style={{
        background: value === id ? 'var(--accent-dim)' : 'var(--bg-card2)',
        border: `1px solid ${value === id ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
        color: value === id ? 'var(--accent)' : 'var(--text-3)',
        borderRadius: 7, padding: '3px 9px', fontSize: 11, cursor: 'pointer', fontWeight: 500,
      }}>{lbl}</button>
    ))}
  </div>
);

const SectionHead = ({ title, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
    <div className="section-title" style={{ margin: 0 }}>{title}</div>
    {right}
  </div>
);

const KPI = ({ label, value, unit, delta, invert }) => {
  const pos = delta == null ? null : (invert ? delta <= 0 : delta >= 0);
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{fmt(value)}<span className="kpi-unit">{unit}</span></div>
      {delta != null && <div className={`kpi-sub ${pos ? 'pos' : 'neg'}`}>{delta >= 0 ? '▲' : '▼'} {fmt(Math.abs(delta), 1)}</div>}
    </div>
  );
};

const ChartPanel = ({ type, data, xKey, series, height = 240, yFmt, ttFmt, stackId, refLine }) => {
  const margin = { left: 10, right: 20, top: 10, bottom: 20 };
  const xAxis  = <XAxis dataKey={xKey} tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />;
  const yAxis  = <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={yFmt} />;
  const grid   = <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />;
  const tt     = <Tooltip {...TT} formatter={ttFmt} />;
  const leg    = <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ color: 'var(--text-2)', fontSize: 11 }}>{v}</span>} />;

  if (type === 'bar') return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={margin}>
        {grid}{xAxis}{yAxis}{tt}{leg}
        {refLine && <ReferenceLine y={refLine.y} stroke={refLine.color} strokeDasharray="4 2" />}
        {series.map(s => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color}
            stackId={stackId} radius={stackId ? [0,0,0,0] : [3,3,0,0]}>
            {s.cells && data.map((d, i) => <Cell key={i} fill={s.cellColor ? s.cellColor(d) : s.color} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={margin}>
        {grid}{xAxis}{yAxis}{tt}{leg}
        {refLine && <ReferenceLine y={refLine.y} stroke={refLine.color} strokeDasharray="4 2" />}
        {series.map(s => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name}
            stroke={s.color} strokeWidth={2} dot={{ r: 3 }} connectNulls
            strokeDasharray={s.dashed ? '5 3' : undefined} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DAILY VIEW (1–6 reports)
// ─────────────────────────────────────────────────────────────────────────────
const DailyView = ({ series }) => {
  const [demType, setDemType] = useState('line');
  const [genType, setGenType] = useState('bar');
  const last = series[series.length - 1];
  const prev = series[series.length - 2];

  const allPlants = [...new Set(series.flatMap(s => (s.r?.plant_generation || []).filter(p => p.plant_group === 'THERMAL' && p.mw_at_peak > 0).map(p => p.plant_name)))];
  const plantSeries = series.map(s => {
    const row = { label: s.label };
    allPlants.forEach(n => { const p = (s.r?.plant_generation || []).find(p => p.plant_name === n); row[n] = p?.mw_at_peak || 0; });
    return row;
  });
  const allHydro = [...new Set(series.flatMap(s => (s.r?.plant_generation || []).filter(p => p.plant_group === 'HYDRO').map(p => p.plant_name)))];
  const hydroSeries = series.map(s => {
    const row = { label: s.label };
    allHydro.forEach(n => { const p = (s.r?.plant_generation || []).find(p => p.plant_name === n); row[n] = p?.mw_at_peak || 0; });
    return row;
  });

  return (
    <div>
      <div className="note" style={{ marginBottom: 10 }}>Latest vs previous day</div>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <KPI label="Peak Demand"   value={last.peak_demand} unit="MW"  delta={prev ? last.peak_demand - prev.peak_demand : null} />
        <KPI label="Avail. Cap."   value={last.avail_cap}   unit="MW"  delta={prev ? last.avail_cap - prev.avail_cap : null} />
        <KPI label="Ghana Peak"    value={last.ghana_peak}  unit="MW"  delta={prev ? last.ghana_peak - prev.ghana_peak : null} />
        <KPI label="Total Gen"     value={last.total_mw}    unit="MW"  delta={prev ? last.total_mw - prev.total_mw : null} />
        <KPI label="Total Energy"  value={last.total_gwh}   unit="GWh" delta={prev ? last.total_gwh - prev.total_gwh : null} />
        <KPI label="Incidents"     value={last.incidents}   unit=""    delta={prev ? last.incidents - prev.incidents : null} invert />
        <KPI label="Still Out"     value={last.still_out}   unit=""    delta={prev ? last.still_out - prev.still_out : null} invert />
        <KPI label="Days Stable"   value={last.days_stable} unit="d"   delta={prev ? last.days_stable - prev.days_stable : null} />
      </div>

      <SectionHead title="Demand & Capacity" right={<Toggle options={[['line','Line'],['bar','Bar']]} value={demType} onChange={setDemType}/>}/>
      <div className="panel" style={{ marginBottom: 12 }}>
        <ChartPanel type={demType} data={series} xKey="label"
          series={[{ key:'peak_demand',name:'Peak Demand',color:'#ef4444'},{ key:'avail_cap',name:'Avail. Cap.',color:'#10b981'},{ key:'ghana_peak',name:'Ghana Peak',color:'#f59e0b',dashed:true}]}
          ttFmt={(v,n)=>[`${fmt(v)} MW`,n]} yFmt={v=>`${(v/1000).toFixed(1)}k`}/>
      </div>

      <SectionHead title="Generation Mix at Peak (MW)" right={<Toggle options={[['bar','Bar'],['line','Line']]} value={genType} onChange={setGenType}/>}/>
      <div className="panel" style={{ marginBottom: 12 }}>
        <ChartPanel type={genType} data={series} xKey="label" stackId={genType==='bar'?'g':undefined}
          series={[{key:'thermal_mw',name:'Thermal',color:'#3b82f6'},{key:'hydro_mw',name:'Hydro',color:'#10b981'},{key:'solar_mw',name:'Solar',color:'#f59e0b'}]}
          ttFmt={(v,n)=>[`${fmt(v)} MW`,n]} yFmt={v=>`${(v/1000).toFixed(1)}k`}/>
      </div>

      <div className="section-title">Total Energy (GWh)</div>
      <div className="panel" style={{ marginBottom: 12 }}>
        <ChartPanel type={genType} data={series} xKey="label" stackId={genType==='bar'?'e':undefined}
          series={[{key:'thermal_gwh',name:'Thermal GWh',color:'#3b82f6'},{key:'hydro_gwh',name:'Hydro GWh',color:'#10b981'},{key:'solar_gwh',name:'Solar GWh',color:'#f59e0b'}]}
          ttFmt={(v,n)=>[`${fmt(v,3)} GWh`,n]}/>
      </div>

      <div className="section-title">Thermal Plants — MW at Peak</div>
      <div className="panel" style={{ marginBottom: 12 }}>
        <ChartPanel type={genType} data={plantSeries} xKey="label" stackId={genType==='bar'?'t':undefined}
          series={allPlants.map((n,i)=>({key:n,name:n,color:PLANT_COLORS[i%PLANT_COLORS.length]}))}
          ttFmt={(v,n)=>[`${fmt(v)} MW`,n]}/>
      </div>

      <div className="section-title">Hydro Plants — MW at Peak</div>
      <div className="panel" style={{ marginBottom: 12 }}>
        <ChartPanel type={genType} data={hydroSeries} xKey="label"
          series={allHydro.map((n,i)=>({key:n,name:n,color:['#10b981','#06b6d4','#34d399','#22d3ee'][i%4]}))}
          ttFmt={(v,n)=>[`${fmt(v)} MW`,n]}/>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">Frequency Range (Hz)</div>
          <ChartPanel type="line" data={series} xKey="label" height={180}
            series={[{key:'freq_high',name:'High Hz',color:'#f59e0b'},{key:'freq_low',name:'Low Hz',color:'#ef4444',dashed:true}]}
            ttFmt={(v,n)=>[`${v} Hz`,n]} refLine={{y:50,color:'rgba(255,255,255,0.15)'}}/>
        </div>
        <div className="panel">
          <div className="panel-title">Incidents per Day</div>
          <ChartPanel type="bar" data={series} xKey="label" height={180}
            series={[{key:'incidents',name:'Total',color:'#6b7280'},{key:'still_out',name:'Still Out',color:'#ef4444'}]}
            ttFmt={(v,n)=>[v,n]}/>
        </div>
      </div>

      <SummaryTable series={series} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY VIEW (7–31 reports)
// ─────────────────────────────────────────────────────────────────────────────
const MonthlyView = ({ series }) => {
  const [activeWeek, setActiveWeek] = useState(null);
  const [genType, setGenType] = useState('bar');

  // Group into weeks (Week 1 = days 1-7, Week 2 = 8-14, etc.)
  const weeks = useMemo(() => {
    const groups = {};
    series.forEach(s => {
      const wk = Math.ceil(s.dayOfMonth / 7);
      if (!groups[wk]) groups[wk] = [];
      groups[wk].push(s);
    });
    return Object.entries(groups)
      .sort(([a],[b]) => +a - +b)
      .map(([wk, items]) => aggregate(items, items => `Week ${wk}`));
  }, [series]);

  const displaySeries = activeWeek != null ? weeks[activeWeek]?.items || series : series;
  const month = series[0]?.month || '';

  // Monthly KPIs
  const avg  = key => series.reduce((s,i) => s+(i[key]||0), 0) / series.length;
  const sum  = key => series.reduce((s,i) => s+(i[key]||0), 0);
  const maxD = series.reduce((m,s) => (s.peak_demand||0) > (m.peak_demand||0) ? s : m, series[0]);
  const minD = series.reduce((m,s) => (s.peak_demand||0) < (m.peak_demand||0) ? s : m, series[0]);

  return (
    <div>
      {/* Monthly summary KPIs */}
      <div className="section-title" style={{ marginTop: 0 }}>Monthly Summary — {month}</div>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <KPI label="Avg Peak Demand"   value={avg('peak_demand').toFixed(0)}  unit="MW" />
        <KPI label="Avg Avail. Cap."   value={avg('avail_cap').toFixed(0)}    unit="MW" />
        <KPI label="Total Energy"      value={sum('total_gwh').toFixed(1)}    unit="GWh" />
        <KPI label="Total Incidents"   value={sum('incidents')}               unit="" />
        <KPI label="Peak Day"          value={maxD?.peak_demand}              unit="MW" />
        <KPI label="Lowest Demand Day" value={minD?.peak_demand}              unit="MW" />
        <KPI label="Avg Hydro Mix"     value={avg('hydro_pct').toFixed(1)}    unit="%" />
        <KPI label="Days with Deficit" value={series.filter(s=>s.surplus<0).length} unit="d" />
      </div>

      {/* Week selector */}
      <div className="section-title">Week-by-Week Breakdown</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setActiveWeek(null)} style={{
          padding: '6px 14px', borderRadius: 8, fontSize: 11, cursor: 'pointer', fontWeight: 500,
          background: activeWeek == null ? 'var(--accent-dim)' : 'var(--bg-card2)',
          border: `1px solid ${activeWeek == null ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
          color: activeWeek == null ? 'var(--accent)' : 'var(--text-3)',
        }}>Full Month ({series.length}d)</button>
        {weeks.map((w, i) => (
          <button key={i} onClick={() => setActiveWeek(activeWeek === i ? null : i)} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 11, cursor: 'pointer', fontWeight: 500,
            background: activeWeek === i ? 'rgba(16,185,129,0.15)' : 'var(--bg-card2)',
            border: `1px solid ${activeWeek === i ? 'rgba(16,185,129,0.4)' : 'var(--border)'}`,
            color: activeWeek === i ? '#10b981' : 'var(--text-3)',
          }}>
            Week {i+1} <span style={{ fontSize: 10, opacity: 0.7 }}>({w.count}d)</span>
          </button>
        ))}
      </div>

      {/* Week summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 8, marginBottom: 14 }}>
        {weeks.map((w, i) => (
          <div key={i} onClick={() => setActiveWeek(activeWeek === i ? null : i)}
            style={{
              padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
              background: activeWeek === i ? 'rgba(16,185,129,0.08)' : 'var(--bg-card)',
              border: `1px solid ${activeWeek === i ? 'rgba(16,185,129,0.35)' : 'var(--border)'}`,
            }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981', marginBottom: 6 }}>Week {i+1} · {w.count} days</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Avg Peak: <strong>{fmt(w.peak_demand)} MW</strong></div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Energy: <strong>{fmt(w.total_gwh, 1)} GWh</strong></div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Incidents: <strong style={{ color: w.incidents > 0 ? 'var(--amber)' : 'var(--green)' }}>{w.incidents}</strong></div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
              Peak: {w.max_peak_day?.label} ({fmt(w.max_peak_day?.peak_demand)} MW)
            </div>
          </div>
        ))}
      </div>

      {/* Daily demand chart for selected period */}
      <SectionHead
        title={activeWeek != null ? `Week ${activeWeek+1} — Daily Demand` : 'Full Month — Daily Peak Demand'}
        right={<Toggle options={[['line','Line'],['bar','Bar']]} value={genType} onChange={setGenType}/>}
      />
      <div className="panel" style={{ marginBottom: 12 }}>
        <ChartPanel type={genType} data={displaySeries} xKey="label" height={260}
          series={[
            { key:'peak_demand',name:'Peak Demand',color:'#ef4444' },
            { key:'avail_cap',name:'Avail. Capacity',color:'#10b981' },
          ]}
          ttFmt={(v,n)=>[`${fmt(v)} MW`,n]} yFmt={v=>`${(v/1000).toFixed(1)}k`}/>
      </div>

      {/* Generation mix */}
      <SectionHead title="Daily Generation Mix" right={<Toggle options={[['bar','Bar'],['line','Line']]} value={genType} onChange={setGenType}/>}/>
      <div className="panel" style={{ marginBottom: 12 }}>
        <ChartPanel type={genType} data={displaySeries} xKey="label" height={220}
          stackId={genType==='bar'?'g':undefined}
          series={[{key:'thermal_mw',name:'Thermal',color:'#3b82f6'},{key:'hydro_mw',name:'Hydro',color:'#10b981'},{key:'solar_mw',name:'Solar',color:'#f59e0b'}]}
          ttFmt={(v,n)=>[`${fmt(v)} MW`,n]} yFmt={v=>`${(v/1000).toFixed(1)}k`}/>
      </div>

      {/* Weekly bar comparison */}
      <div className="section-title">Week-by-Week Comparison</div>
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <div className="panel">
          <div className="panel-title">Avg Peak Demand per Week (MW)</div>
          <ChartPanel type="bar" data={weeks} xKey="label" height={180}
            series={[{key:'peak_demand',name:'Avg Peak',color:'#3b82f6'}]}
            ttFmt={(v,n)=>[`${fmt(v)} MW`,n]}/>
        </div>
        <div className="panel">
          <div className="panel-title">Total Energy per Week (GWh)</div>
          <ChartPanel type="bar" data={weeks} xKey="label" height={180}
            series={[{key:'total_gwh',name:'GWh',color:'#10b981'}]}
            ttFmt={(v,n)=>[`${fmt(v,1)} GWh`,n]}/>
        </div>
        <div className="panel">
          <div className="panel-title">Total Incidents per Week</div>
          <ChartPanel type="bar" data={weeks} xKey="label" height={180}
            series={[{key:'incidents',name:'Incidents',color:'#f59e0b'},{key:'still_out',name:'Still Out',color:'#ef4444'}]}
            ttFmt={(v,n)=>[v,n]}/>
        </div>
        <div className="panel">
          <div className="panel-title">Avg Frequency Range per Week (Hz)</div>
          <ChartPanel type="line" data={weeks} xKey="label" height={180}
            series={[{key:'freq_high',name:'High Hz',color:'#f59e0b'},{key:'freq_low',name:'Low Hz',color:'#ef4444',dashed:true}]}
            ttFmt={(v,n)=>[`${v} Hz`,n]} refLine={{y:50,color:'rgba(255,255,255,0.15)'}}/>
        </div>
      </div>

      <SummaryTable series={displaySeries} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// QUARTERLY VIEW (32–92 reports)
// ─────────────────────────────────────────────────────────────────────────────
const QuarterlyView = ({ series }) => {
  const [activeMonth, setActiveMonth] = useState(null);
  const [genType, setGenType] = useState('bar');

  // Group by month
  const months = useMemo(() => {
    const groups = {};
    series.forEach(s => {
      const key = `${s.date.getFullYear()}-${String(s.monthNum+1).padStart(2,'0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return Object.entries(groups)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([key, items]) => aggregate(items, items => items[0].month));
  }, [series]);

  const displaySeries = activeMonth != null ? months[activeMonth]?.items || series : series;
  const quarter = months.map(m => m.label).join(' / ');

  // Quarter KPIs
  const avg = key => series.reduce((s,i) => s+(i[key]||0),0) / series.length;
  const sum = key => series.reduce((s,i) => s+(i[key]||0),0);

  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>Quarterly Summary — {quarter}</div>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <KPI label="Avg Peak Demand"   value={avg('peak_demand').toFixed(0)} unit="MW" />
        <KPI label="Total Energy"      value={sum('total_gwh').toFixed(1)}   unit="GWh" />
        <KPI label="Total Days"        value={series.length}                 unit="d" />
        <KPI label="Total Incidents"   value={sum('incidents')}              unit="" />
        <KPI label="Avg Thermal Mix"   value={avg('thermal_pct').toFixed(1)} unit="%" />
        <KPI label="Avg Hydro Mix"     value={avg('hydro_pct').toFixed(1)}   unit="%" />
        <KPI label="Deficit Days"      value={series.filter(s=>s.surplus<0).length} unit="d" />
        <KPI label="Avg Freq Low"      value={avg('freq_low').toFixed(2)}    unit="Hz" />
      </div>

      {/* Month selector */}
      <div className="section-title">Monthly Breakdown</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setActiveMonth(null)} style={{
          padding: '6px 14px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
          background: activeMonth == null ? 'var(--accent-dim)' : 'var(--bg-card2)',
          border: `1px solid ${activeMonth == null ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
          color: activeMonth == null ? 'var(--accent)' : 'var(--text-3)', fontWeight: 500,
        }}>Full Quarter</button>
        {months.map((m, i) => (
          <button key={i} onClick={() => setActiveMonth(activeMonth === i ? null : i)} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
            background: activeMonth === i ? 'rgba(245,158,11,0.15)' : 'var(--bg-card2)',
            border: `1px solid ${activeMonth === i ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
            color: activeMonth === i ? '#f59e0b' : 'var(--text-3)', fontWeight: 500,
          }}>
            {m.label} <span style={{ fontSize: 10, opacity: 0.7 }}>({m.count}d)</span>
          </button>
        ))}
      </div>

      {/* Month summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
        {months.map((m, i) => (
          <div key={i} onClick={() => setActiveMonth(activeMonth === i ? null : i)}
            style={{
              padding: '12px 14px', borderRadius: 9, cursor: 'pointer',
              background: activeMonth === i ? 'rgba(245,158,11,0.08)' : 'var(--bg-card)',
              border: `1px solid ${activeMonth === i ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
            }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>{m.label} · {m.count} days</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {[['Avg Peak',`${fmt(m.peak_demand)} MW`],['Total Energy',`${fmt(m.total_gwh,1)} GWh`],['Incidents',m.incidents],['Thermal',`${fmt(m.thermal_gwh,1)} GWh`],['Hydro',`${fmt(m.hydro_gwh,1)} GWh`],['Deficit Days',m.items.filter(s=>s.surplus<0).length]].map(([l,v])=>(
                <div key={l} style={{ fontSize: 11 }}>
                  <div style={{ color: 'var(--text-3)', fontSize: 10 }}>{l}</div>
                  <div style={{ color: 'var(--text-1)', fontWeight: 500 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-3)' }}>
              Peak day: {m.max_peak_day?.label} ({fmt(m.max_peak_day?.peak_demand)} MW)
            </div>
          </div>
        ))}
      </div>

      {/* Monthly comparison charts */}
      <div className="section-title">Monthly Comparison</div>
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <div className="panel">
          <div className="panel-title">Avg Peak Demand (MW)</div>
          <ChartPanel type="bar" data={months} xKey="label" height={180}
            series={[{key:'peak_demand',name:'Avg Peak Demand',color:'#3b82f6'}]}
            ttFmt={(v,n)=>[`${fmt(v)} MW`,n]}/>
        </div>
        <div className="panel">
          <div className="panel-title">Total Energy Generated (GWh)</div>
          <ChartPanel type="bar" data={months} xKey="label" height={180}
            series={[{key:'thermal_gwh',name:'Thermal',color:'#3b82f6'},{key:'hydro_gwh',name:'Hydro',color:'#10b981'}]}
            stackId="e" ttFmt={(v,n)=>[`${fmt(v,1)} GWh`,n]}/>
        </div>
        <div className="panel">
          <div className="panel-title">Incidents per Month</div>
          <ChartPanel type="bar" data={months} xKey="label" height={180}
            series={[{key:'incidents',name:'Total',color:'#f59e0b'},{key:'still_out',name:'Still Out',color:'#ef4444'}]}
            ttFmt={(v,n)=>[v,n]}/>
        </div>
        <div className="panel">
          <div className="panel-title">Frequency Range (Hz)</div>
          <ChartPanel type="line" data={months} xKey="label" height={180}
            series={[{key:'freq_high',name:'High Hz',color:'#f59e0b'},{key:'freq_low',name:'Low Hz',color:'#ef4444',dashed:true}]}
            ttFmt={(v,n)=>[`${v} Hz`,n]} refLine={{y:50,color:'rgba(255,255,255,0.15)'}}/>
        </div>
      </div>

      {/* Drill-down into selected month — daily view */}
      {activeMonth != null && (
        <>
          <div className="section-title">{months[activeMonth]?.label} — Daily Detail</div>
          <div className="panel" style={{ marginBottom: 12 }}>
            <ChartPanel type={genType} data={displaySeries} xKey="label" height={240}
              series={[{key:'peak_demand',name:'Peak Demand',color:'#ef4444'},{key:'avail_cap',name:'Avail. Cap.',color:'#10b981'}]}
              ttFmt={(v,n)=>[`${fmt(v)} MW`,n]} yFmt={v=>`${(v/1000).toFixed(1)}k`}/>
          </div>
        </>
      )}

      <SummaryTable series={displaySeries} compact />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED SUMMARY TABLE
// ─────────────────────────────────────────────────────────────────────────────
const SummaryTable = ({ series, compact }) => (
  <div>
    <div className="section-title">Day-by-Day Summary Table</div>
    <div className="panel">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th><th>Day</th>
              <th className="num">Peak (MW)</th>
              <th className="num">Cap (MW)</th>
              <th className="num">Surplus</th>
              <th className="num">Thermal</th>
              <th className="num">Hydro</th>
              {!compact && <th className="num">Solar</th>}
              <th className="num">GWh</th>
              {!compact && <><th className="num">Thermal GWh</th><th className="num">Hydro GWh</th></>}
              <th className="num">Incidents</th>
              <th className="num">Hz High</th>
              <th className="num">Hz Low</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{s.fullDate}</td>
                <td style={{ color: 'var(--text-3)', fontSize: 11 }}>{s.day?.slice(0,3)}</td>
                <td className="num">{fmt(s.peak_demand)}</td>
                <td className="num">{fmt(s.avail_cap)}</td>
                <td className="num" style={{ color: s.surplus >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                  {s.surplus != null ? (s.surplus >= 0 ? '+' : '') + fmt(s.surplus) : '—'}
                </td>
                <td className="num" style={{ color: '#3b82f6' }}>{fmt(s.thermal_mw)}</td>
                <td className="num" style={{ color: '#10b981' }}>{fmt(s.hydro_mw)}</td>
                {!compact && <td className="num" style={{ color: '#f59e0b' }}>{fmt(s.solar_mw)}</td>}
                <td className="num">{fmt(s.total_gwh, 3)}</td>
                {!compact && <><td className="num" style={{ color: '#3b82f6' }}>{fmt(s.thermal_gwh, 3)}</td><td className="num" style={{ color: '#10b981' }}>{fmt(s.hydro_gwh, 3)}</td></>}
                <td className="num" style={{ color: (s.still_out || 0) > 0 ? 'var(--red)' : 'var(--text-3)' }}>{s.incidents ?? '—'}</td>
                <td className="num" style={{ color: '#f59e0b' }}>{s.freq_high ?? '—'}</td>
                <td className="num" style={{ color: '#ef4444' }}>{s.freq_low ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// COMPARISON VIEW
// ─────────────────────────────────────────────────────────────────────────────
const ComparisonView = ({ series }) => {
  const mid  = Math.floor(series.length / 2);
  const pA   = series.slice(0, mid);
  const pB   = series.slice(mid);

  const avg  = (arr, key) => arr.length ? arr.reduce((s,i) => s+(i[key]||0),0) / arr.length : 0;
  const sum  = (arr, key) => arr.reduce((s,i) => s+(i[key]||0),0);

  const labelA = `${pA[0]?.fullDate} – ${pA[pA.length-1]?.fullDate}`;
  const labelB = `${pB[0]?.fullDate} – ${pB[pB.length-1]?.fullDate}`;

  const metrics = [
    { key: 'peak_demand', label: 'Avg Peak Demand',      unit: 'MW',  fn: avg,  invert: false },
    { key: 'avail_cap',   label: 'Avg Available Cap.',   unit: 'MW',  fn: avg,  invert: false },
    { key: 'surplus',     label: 'Avg Reserve',          unit: 'MW',  fn: avg,  invert: false },
    { key: 'total_gwh',   label: 'Total Energy',         unit: 'GWh', fn: sum,  invert: false },
    { key: 'thermal_gwh', label: 'Thermal Energy',       unit: 'GWh', fn: sum,  invert: false },
    { key: 'hydro_gwh',   label: 'Hydro Energy',         unit: 'GWh', fn: sum,  invert: false },
    { key: 'incidents',   label: 'Total Incidents',      unit: '',    fn: sum,  invert: true  },
    { key: 'freq_low',    label: 'Avg Min Frequency',    unit: 'Hz',  fn: avg,  invert: false },
  ];

  // Overlay chart — index-aligned (day 1 of A vs day 1 of B)
  const maxLen = Math.max(pA.length, pB.length);
  const overlayData = Array.from({ length: maxLen }, (_, i) => ({
    idx: `Day ${i + 1}`,
    period_a: pA[i]?.peak_demand ?? null,
    period_b: pB[i]?.peak_demand ?? null,
    cap_a:    pA[i]?.avail_cap   ?? null,
    cap_b:    pB[i]?.avail_cap   ?? null,
  }));

  const deficitDaysA = pA.filter(s => s.surplus < 0).length;
  const deficitDaysB = pB.filter(s => s.surplus < 0).length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'stretch' }}>
        {[['A', labelA, '#3b82f6', pA], ['B', labelB, '#10b981', pB]].map(([period, label, color, data]) => (
          <div key={period} style={{
            flex: 1, padding: '10px 14px', borderRadius: 10,
            background: `${color}10`, border: `1px solid ${color}40`,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.5px', marginBottom: 2 }}>
              PERIOD {period}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{data.length} days</div>
          </div>
        ))}
      </div>

      {/* KPI comparison grid */}
      <div className="section-title">Key Metrics — Period A vs Period B</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, marginBottom: 16 }}>
        {metrics.map(({ key, label, unit, fn, invert }) => {
          const vA    = fn(pA, key);
          const vB    = fn(pB, key);
          const delta = vB - vA;
          const improved = invert ? delta <= 0 : delta >= 0;
          const deltaColor = delta === 0 ? 'var(--text-3)' : improved ? 'var(--green)' : 'var(--red)';
          return (
            <div key={key} className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="kpi-label">{label}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 10, color: '#3b82f6', marginBottom: 1 }}>Period A</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>
                    {fmt(vA, 2)}<span className="kpi-unit">{unit}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: '#10b981', marginBottom: 1 }}>Period B</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>
                    {fmt(vB, 2)}<span className="kpi-unit">{unit}</span>
                  </div>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 5, fontSize: 11, color: deltaColor, fontWeight: 600 }}>
                {delta >= 0 ? '▲' : '▼'} {fmt(Math.abs(delta), 2)} {unit}
                <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 5 }}>
                  {improved ? '(improved)' : '(declined)'}
                </span>
              </div>
            </div>
          );
        })}
        {/* Deficit days special card */}
        <div className="kpi-card">
          <div className="kpi-label">Deficit Days (Capacity &lt; Forecast)</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 }}>
            <div>
              <div style={{ fontSize: 10, color: '#3b82f6', marginBottom: 1 }}>Period A</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: deficitDaysA > 0 ? 'var(--red)' : 'var(--green)' }}>
                {deficitDaysA}<span className="kpi-unit">d</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#10b981', marginBottom: 1 }}>Period B</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: deficitDaysB > 0 ? 'var(--red)' : 'var(--green)' }}>
                {deficitDaysB}<span className="kpi-unit">d</span>
              </div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 5, fontSize: 11,
            color: deficitDaysB <= deficitDaysA ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
            {deficitDaysB <= deficitDaysA ? '▼ Fewer deficit days' : '▲ More deficit days'}
          </div>
        </div>
      </div>

      {/* Overlay charts */}
      <div className="section-title">Peak Demand Overlay — Day-by-Day</div>
      <div className="panel" style={{ marginBottom: 12 }}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={overlayData} margin={{ left: 10, right: 20, top: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="idx" tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
            <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(1)}k`}/>
            <Tooltip {...TT} formatter={(v, n) => [`${fmt(v)} MW`, n]} />
            <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ color: 'var(--text-2)', fontSize: 11 }}>{v}</span>} />
            <Line type="monotone" dataKey="period_a" name={`Period A Peak (${labelA})`} stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} connectNulls />
            <Line type="monotone" dataKey="period_b" name={`Period B Peak (${labelB})`} stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="section-title">Available Capacity Overlay — Day-by-Day</div>
      <div className="panel" style={{ marginBottom: 12 }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={overlayData} margin={{ left: 10, right: 20, top: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="idx" tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
            <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(1)}k`}/>
            <Tooltip {...TT} formatter={(v, n) => [`${fmt(v)} MW`, n]} />
            <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ color: 'var(--text-2)', fontSize: 11 }}>{v}</span>} />
            <Line type="monotone" dataKey="cap_a" name={`Period A Cap. (${labelA})`} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} connectNulls />
            <Line type="monotone" dataKey="cap_b" name={`Period B Cap. (${labelB})`} stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ROOT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function TrendsTab({ reports, viewMode }) {
  const series  = useMemo(() => buildSeries(reports), [reports]);
  const [compareMode, setCompareMode] = useState(false);

  if (!series.length) return (
    <div className="alert alert-info" style={{ marginTop: 20 }}>
      <div className="alert-dot" />No reports loaded.
    </div>
  );

  const first = series[0], last = series[series.length - 1];
  const canCompare = series.length >= 14;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div className="section-title" style={{ margin: 0 }}>
          {compareMode ? 'Period Comparison' : (
            <>
              {viewMode === 'daily'     && `Daily Trends — ${series.length} day${series.length > 1 ? 's' : ''}`}
              {viewMode === 'monthly'   && `Monthly Trends — ${series.length} days`}
              {viewMode === 'quarterly' && `Quarterly Trends — ${series.length} days`}
            </>
          )}
          <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
            ({first.fullDate} → {last.fullDate})
          </span>
        </div>
        {canCompare && (
          <button onClick={() => setCompareMode(m => !m)} style={{
            padding: '5px 14px', borderRadius: 8, fontSize: 11, cursor: 'pointer', fontWeight: 600,
            background: compareMode ? 'var(--accent-dim)' : 'var(--bg-card2)',
            border: `1px solid ${compareMode ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
            color: compareMode ? 'var(--accent)' : 'var(--text-3)',
          }}>
            {compareMode ? '← Back to Trends' : '⇄ Compare Periods'}
          </button>
        )}
      </div>

      {compareMode
        ? <ComparisonView series={series} />
        : (
          <>
            {viewMode === 'daily'     && <DailyView     series={series} />}
            {viewMode === 'monthly'   && <MonthlyView   series={series} />}
            {viewMode === 'quarterly' && <QuarterlyView series={series} />}
          </>
        )
      }
    </div>
  );
}