import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const fmt  = (n, d=4) => n != null ? Number(n).toLocaleString(undefined, {maximumFractionDigits:d}) : '—';
const TooltipStyle = { background:'#1e293b', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, fontSize:12, color:'#f1f5f9' };

// Extract MW value from description brackets e.g. "(120 MW)" or "(120MW)"
const extractMW = (text='') => {
  const match = text.match(/\((\d+(?:\.\d+)?)\s*MW\)/i);
  return match ? parseFloat(match[1]) : null;
};

// Determine if an incident caused load relief — has MW in description or remarks
const isLoadRelief = (inc) => {
  const combined = `${inc.description_of_event||''} ${inc.remarks||''}`;
  return extractMW(combined) !== null;
};

export default function OverviewTab({ data }) {
  const ks   = data.key_stats?.[0]       || {};
  const freq = data.system_frequency?.[0] || {};
  const stab = data.system_stability?.[0] || {};
  const fc   = data.forecasts?.[0]        || {};

  const surplus = (ks.total_available_capacity_mw || 0) - (ks.forecast_peak_demand_mw || 0);
  const bands   = freq.bands || [];
  const freqColors = ['#ef4444','#f97316','#f59e0b','#10b981','#10b981','#3b82f6','#6b7280'];
  const freqBarData = bands.map((b,i) => ({
    label: b.band_label, pct: b.percentage_of_day || 0, fill: freqColors[i] || '#6b7280',
  }));

  // ── Load relief incidents ─────────────────────────────────────────────
  const allIncidents = data.major_incidents || [];
  const reliefIncidents = allIncidents.filter(isLoadRelief);
  const totalReliefMW = reliefIncidents.reduce((sum, inc) => {
    const combined = `${inc.description_of_event||''} ${inc.remarks||''}`;
    return sum + (extractMW(combined) || 0);
  }, 0);

  // ── Generation Adequacy Status ───────────────────────────────────────────
  const available  = ks.total_available_capacity_mw || 0;
  const installed  = ks.total_installed_capacity_mw || 0;
  const forecast   = ks.forecast_peak_demand_mw || 0;
  const reserveMW  = available - forecast;
  const reservePct = forecast > 0 ? (reserveMW / forecast) * 100 : null;
  const loadRelief = ks.load_relief_effected_mw || 0;

  const MIN_RESERVE = 18; // Grid Code minimum reserve margin %

  let adequacyStatus, adequacyColor, adequacyBg, adequacyBorder, adequacyIcon;
  if (loadRelief > 0) {
    adequacyStatus = 'CRITICAL — Load Relief Effected';
    adequacyColor  = '#dc2626'; adequacyBg = 'rgba(220,38,38,0.08)';
    adequacyBorder = 'rgba(220,38,38,0.35)'; adequacyIcon = '🔴';
  } else if (reservePct !== null && reservePct < 0) {
    adequacyStatus = 'CRITICAL — Capacity Deficit';
    adequacyColor  = '#dc2626'; adequacyBg = 'rgba(220,38,38,0.08)';
    adequacyBorder = 'rgba(220,38,38,0.35)'; adequacyIcon = '🔴';
  } else if (reservePct !== null && reservePct < MIN_RESERVE) {
    adequacyStatus = 'CONSTRAINED — Below Minimum Reserve';
    adequacyColor  = '#d97706'; adequacyBg = 'rgba(217,119,6,0.08)';
    adequacyBorder = 'rgba(217,119,6,0.35)'; adequacyIcon = '🟡';
  } else if (reservePct !== null) {
    adequacyStatus = 'ADEQUATE';
    adequacyColor  = '#059669'; adequacyBg = 'rgba(5,150,105,0.08)';
    adequacyBorder = 'rgba(5,150,105,0.35)'; adequacyIcon = '🟢';
  } else {
    adequacyStatus = null;
  }

  return (
    <div>
      {/* ── Generation Adequacy Banner ── */}
      {adequacyStatus && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', borderRadius: 10, marginBottom: 16,
          background: adequacyBg, border: `1px solid ${adequacyBorder}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>{adequacyIcon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: adequacyColor, letterSpacing: '0.3px' }}>
                {adequacyStatus}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                Generation Adequacy Status — Daily Assessment
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, textAlign: 'right' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: adequacyColor }}>
                {reservePct !== null ? `${reservePct >= 0 ? '+' : ''}${reservePct.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Reserve Margin</div>
              <div style={{ fontSize: 9, color: 'var(--text-3)' }}>Min. required: {MIN_RESERVE}%</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: reserveMW >= 0 ? '#059669' : '#dc2626' }}>
                {reserveMW >= 0 ? '+' : ''}{fmt(reserveMW)} MW
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                {reserveMW >= 0 ? 'Surplus' : 'Deficit'}
              </div>
            </div>
            {loadRelief > 0 && (
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>{fmt(loadRelief)} MW</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Load Relief Effected</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Key Stats ── */}
      <div className="section-title">Key Statistics</div>
      <div className="kpi-grid">
        <div className={`kpi-card ${surplus < 0 ? 'danger' : 'success'}`}>
          <div className="kpi-label">Forecast Peak Demand</div>
          <div className="kpi-value">{fmt(ks.forecast_peak_demand_mw)}<span className="kpi-unit">MW</span></div>
        </div>
        <div className={`kpi-card ${surplus < 0 ? 'danger' : 'success'}`}>
          <div className="kpi-label">Available Capacity</div>
          <div className="kpi-value">{fmt(ks.total_available_capacity_mw)}<span className="kpi-unit">MW</span></div>
          <div className={`kpi-sub ${surplus >= 0 ? 'pos' : 'neg'}`}>
            {surplus >= 0 ? '▲' : '▼'} {fmt(Math.abs(surplus))} MW {surplus >= 0 ? 'surplus' : 'deficit'}
          </div>
        </div>
        <div className="kpi-card success">
          <div className="kpi-label">Ghana Peak Load</div>
          <div className="kpi-value">{fmt(ks.ghana_peak_load_mw)}<span className="kpi-unit">MW</span></div>
          <div className="kpi-sub pos">⏱ {ks.ghana_peak_load_time || '—'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Highest Peak Load to Date</div>
          <div className="kpi-value">{fmt(ks.highest_peak_load_to_date_mw)}<span className="kpi-unit">MW</span></div>
          <div className="kpi-sub">{ks.highest_peak_load_date || '—'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Installed Capacity</div>
          <div className="kpi-value">{fmt(ks.total_installed_capacity_mw)}<span className="kpi-unit">MW</span></div>
        </div>
      </div>

      {/* ── Load Relief ── */}
      <div className="section-title">Load Relief</div>
      <div className="grid-2">
        <div className="kpi-card">
          <div className="kpi-label">Planned</div>
          <div className="kpi-value">{(ks.load_relief_planned_mw ?? 0).toFixed(2)}<span className="kpi-unit">MW</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Effected</div>
          <div className="kpi-value">{(ks.load_relief_effected_mw ?? 0).toFixed(2)}<span className="kpi-unit">MW</span></div>
        </div>
      </div>

      {/* ── Incidents causing load relief ── */}
      <div className="section-title">Incidents Resulting in Load Relief</div>
      <div className="panel">
        {/* Summary row */}
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:12, paddingBottom:10, borderBottom:'1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:3 }}>Incidents with load relief</div>
            <div style={{ fontSize:22, fontWeight:700, color: reliefIncidents.length > 0 ? 'var(--red)' : 'var(--green)' }}>
              {reliefIncidents.length}
            </div>
          </div>
          <div style={{ width:'1px', height:36, background:'var(--border)' }}/>
          <div>
            <div style={{ fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:3 }}>Total MW affected</div>
            <div style={{ fontSize:22, fontWeight:700, color: totalReliefMW > 0 ? 'var(--amber)' : 'var(--green)' }}>
              {totalReliefMW > 0 ? `${fmt(totalReliefMW, 1)} MW` : '0 MW'}
            </div>
          </div>
          {reliefIncidents.length === 0 && (
            <div style={{ marginLeft:'auto', padding:'5px 12px', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:7, color:'var(--green)', fontSize:11, fontWeight:500 }}>
              ✓ No load relief incidents today
            </div>
          )}
        </div>

        {/* Incidents table */}
        {reliefIncidents.length > 0 ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width:32 }}>No.</th>
                  <th style={{ width:130 }}>Equipment ID</th>
                  <th>Description</th>
                  <th className="num" style={{ width:80 }}>MW Relief</th>
                  <th className="num" style={{ width:75 }}>Time Out</th>
                  <th className="num" style={{ width:75 }}>Restored</th>
                  <th style={{ width:90 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {reliefIncidents.map((inc, i) => {
                  const combined = `${inc.description_of_event||''} ${inc.remarks||''}`;
                  const mw = extractMW(combined);
                  return (
                    <tr key={i}>
                      <td style={{ color:'var(--text-3)', fontSize:11 }}>{inc.incident_no}</td>
                      <td style={{ fontFamily:'monospace', fontSize:12, color:'var(--accent)', fontWeight:600 }}>{inc.equipment_id}</td>
                      <td style={{ fontSize:12, color:'var(--text-2)' }}>{inc.description_of_event}</td>
                      <td className="num" style={{ color:'var(--amber)', fontWeight:700 }}>
                        {mw != null ? `${fmt(mw, 1)} MW` : '—'}
                      </td>
                      <td className="num" style={{ color:'var(--text-3)' }}>{inc.time_out || '—'}</td>
                      <td className="num">{inc.time_restored || '—'}</td>
                      <td>
                        <span className={inc.still_out ? 'badge badge-out' : 'badge badge-ok'}>
                          {inc.still_out ? 'Still Out' : 'Restored'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop:'2px solid var(--border)' }}>
                  <td colSpan={3} style={{ fontSize:11, fontWeight:600, color:'var(--text-2)', paddingTop:8 }}>Total load relief</td>
                  <td className="num" style={{ color:'var(--amber)', fontWeight:700, fontSize:13, paddingTop:8 }}>{fmt(totalReliefMW, 1)} MW</td>
                  <td colSpan={3}/>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div style={{ fontSize:12, color:'var(--text-3)', textAlign:'center', padding:'12px 0' }}>
            No incidents with load relief recorded for this day.
          </div>
        )}
      </div>

      <div className="grid-2">
        {/* ── Frequency ── */}
        <div className="panel">
          <div className="panel-title">E. System Frequency</div>
          <div className="grid-2" style={{marginBottom:12}}>
            <div style={{background:'var(--bg-card2)',borderRadius:9,padding:'10px 14px'}}>
              <div style={{fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:4}}>Highest</div>
              <div style={{fontSize:20,fontWeight:700,color:'var(--text-1)'}}>{freq.highest_frequency_hz || '—'}<span style={{fontSize:12,color:'var(--text-3)',marginLeft:3}}>Hz</span></div>
              <div style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>at {freq.highest_frequency_time || '—'}</div>
            </div>
            <div style={{background:'var(--bg-card2)',borderRadius:9,padding:'10px 14px'}}>
              <div style={{fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:4}}>Lowest</div>
              <div style={{fontSize:20,fontWeight:700,color:'var(--text-1)'}}>{freq.lowest_frequency_hz || '—'}<span style={{fontSize:12,color:'var(--text-3)',marginLeft:3}}>Hz</span></div>
              <div style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>at {freq.lowest_frequency_time || '—'}</div>
            </div>
          </div>
          <div style={{fontSize:10,color:'var(--text-3)',marginBottom:6}}>% of day within each band</div>
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={freqBarData} margin={{left:0,right:0,top:4,bottom:0}}>
              <XAxis dataKey="label" tick={{fill:'var(--text-3)',fontSize:8}} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={TooltipStyle} formatter={(v)=>[`${v.toFixed(2)}%`,'% of day']} />
              <Bar dataKey="pct" radius={[4,4,0,0]}>
                {freqBarData.map((d,i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── Stability & Forecast ── */}
        <div className="panel">
          <div className="panel-title">F. Stability &amp; I. Forecast</div>
          <div className="grid-2" style={{marginBottom:12}}>
            <div style={{background:'var(--bg-card2)',borderRadius:9,padding:'10px 14px'}}>
              <div style={{fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:4}}>Days Since Collapse</div>
              <div style={{fontSize:22,fontWeight:700,color:'var(--green)'}}>{stab.days_since_last_total_collapse ?? '—'}</div>
              <div style={{fontSize:10,color:'var(--text-3)',marginTop:2}}>{stab.date_of_last_total_collapse || '—'}</div>
            </div>
            <div style={{background:'var(--bg-card2)',borderRadius:9,padding:'10px 14px'}}>
              <div style={{fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:4}}>Days Since Disturbance</div>
              <div style={{fontSize:22,fontWeight:700,color:'var(--amber)'}}>{stab.days_since_last_major_disturbance ?? '—'}</div>
              <div style={{fontSize:10,color:'var(--text-3)',marginTop:2}}>{stab.date_of_last_major_disturbance || '—'}</div>
            </div>
          </div>
          {fc.forecast_for_date && (
            <div style={{borderTop:'1px solid var(--border)',paddingTop:12}}>
              <div style={{fontSize:10,color:'var(--text-3)',marginBottom:8}}>TOMORROW — {fc.forecast_for_date}</div>
              <div className="grid-2">
                <div style={{background:'var(--bg-card2)',borderRadius:9,padding:'10px 14px'}}>
                  <div style={{fontSize:10,color:'var(--text-3)',marginBottom:4}}>Available Capacity</div>
                  <div style={{fontSize:18,fontWeight:700}}>{fmt(fc.total_available_capacity_mw)}<span style={{fontSize:11,color:'var(--text-3)',marginLeft:3}}>MW</span></div>
                </div>
                <div style={{background:'var(--bg-card2)',borderRadius:9,padding:'10px 14px'}}>
                  <div style={{fontSize:10,color:'var(--text-3)',marginBottom:4}}>Forecast Peak</div>
                  <div style={{fontSize:18,fontWeight:700}}>{fmt(fc.forecast_peak_demand_mw)}<span style={{fontSize:11,color:'var(--text-3)',marginLeft:3}}>MW</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}