import React from 'react';
import { Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

const fmt  = (n, d=4) => n != null ? Number(n).toLocaleString(undefined, { maximumFractionDigits: d }) : '—';
const TT   = { contentStyle: { background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12, color: '#f1f5f9' }, labelStyle: { color: '#94a3b8' }, itemStyle: { color: '#f1f5f9' } };
const GC   = g => g === 'HYDRO' ? '#10b981' : g === 'THERMAL' ? '#3b82f6' : '#f59e0b';
const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

export default function UnitLoadingsTab({ data }) {
  const units  = data.unit_loadings || [];
  const totals = units.filter(u => u.is_total_row);

  const gwhByPlant = Object.fromEntries(
    (data.plant_generation || []).map(p => [p.plant_name, p.total_generation_gwh])
  );

  // Power factor fallback: use unit_loadings total rows when plant_generation doesn't carry it
  const pfByPlant = Object.fromEntries(
    totals
      .filter(t => t.power_factor != null)
      .map(t => [t.plant_name, t.power_factor])
  );

  const groupTotals = totals.filter(t =>
    t.plant_name === 'THERMAL UNITS' || t.plant_name === 'HYDRO UNITS'
  );
  const plantTotals = totals.filter(t =>
    t.plant_name !== 'THERMAL UNITS' && t.plant_name !== 'HYDRO UNITS' && t.plant_name !== 'Unknown'
  );

  const coveredNames = new Set(plantTotals.map(t => t.plant_name));
  const extraPlants  = (data.plant_generation || [])
    .filter(p => p.plant_name && !coveredNames.has(p.plant_name))
    .map(p => ({ plant_name: p.plant_name, plant_group: p.plant_group, mw: p.mw_at_peak, power_factor: p.power_factor, is_total_row: true }));
  const allPlants = [...plantTotals, ...extraPlants];

  const hydroTotal   = groupTotals.find(t => t.plant_name === 'HYDRO UNITS');
  const thermalTotal = groupTotals.find(t => t.plant_name === 'THERMAL UNITS');
  const grandTotal   = (hydroTotal?.mw || 0) + (thermalTotal?.mw || 0);


  // GWh totals per group for donut
  const gwhGroups = {};
  (data.plant_generation || []).forEach(p => {
    if (p.plant_group && p.total_generation_gwh) {
      gwhGroups[p.plant_group] = (gwhGroups[p.plant_group] || 0) + p.total_generation_gwh;
    }
  });
  const donutData = Object.entries(gwhGroups)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k.charAt(0) + k.slice(1).toLowerCase(), value: v, group: k }));

  const sortedTable = [...(data.plant_generation || [])]
    .sort((a, b) => (b.mw_at_peak || 0) - (a.mw_at_peak || 0));

  return (
    <div>

      {/* ── KPI + Chart two-column layout ── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 20 }}>

        {/* Left: KPI cards stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 200 }}>
          {thermalTotal && (
            <div className="kpi-card">
              <div className="kpi-label">Thermal Generation</div>
              <div className="kpi-value" style={{ color: '#3b82f6' }}>
                {fmt(thermalTotal.mw)}<span className="kpi-unit">MW</span>
              </div>
              <div className="kpi-sub">
                {grandTotal > 0 && <span style={{ color: '#3b82f6' }}>{((thermalTotal.mw / grandTotal) * 100).toFixed(0)}% of total</span>}
              </div>
            </div>
          )}
          {hydroTotal && (
            <div className="kpi-card">
              <div className="kpi-label">Hydro Generation</div>
              <div className="kpi-value" style={{ color: '#10b981' }}>
                {fmt(hydroTotal.mw)}<span className="kpi-unit">MW</span>
              </div>
              <div className="kpi-sub">
                {grandTotal > 0 && <span style={{ color: '#10b981' }}>{((hydroTotal.mw / grandTotal) * 100).toFixed(0)}% of total</span>}
              </div>
            </div>
          )}
          {grandTotal > 0 && (
            <div className="kpi-card success">
              <div className="kpi-label">Grand Total at Peak</div>
              <div className="kpi-value">{fmt(grandTotal)}<span className="kpi-unit">MW</span></div>
              <div className="kpi-sub pos">System peak generation</div>
            </div>
          )}
          {donutData.length > 0 && (
            <div className="kpi-card">
              <div className="kpi-label">Total Energy Generated</div>
              <div className="kpi-value">
                {fmt(donutData.reduce((s, d) => s + d.value, 0), 2)}<span className="kpi-unit">GWh</span>
              </div>
              <div className="kpi-sub">Combined output</div>
            </div>
          )}
        </div>

        {/* Right: Donut chart */}
        {donutData.length > 0 && (
          <div className="panel" style={{ flex: 1 }}>
            <div className="panel-title">Energy Output (GWh) — Group Split</div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={85}
                  dataKey="value"
                  paddingAngle={3}
                  label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {donutData.map((d, i) => <Cell key={i} fill={PIE_COLORS[i]} strokeWidth={0} />)}
                </Pie>
                <Tooltip {...TT} formatter={v => [`${fmt(v, 3)} GWh`, '']} />
                <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ color: 'var(--text-2)', fontSize: 11 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
              {donutData.map((d, i) => (
                <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: PIE_COLORS[i], display: 'inline-block' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{d.name}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'monospace' }}>{fmt(d.value, 3)} GWh</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Plant Totals Table ── */}
      <div className="section-title">Plant Generation Summary</div>
      <div className="panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Plant</th>
                <th className="num">MW at Peak</th>
                <th className="num">GWh</th>
                <th className="num">Power Factor</th>
              </tr>
            </thead>
            <tbody>
              {sortedTable.map((t, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 3, height: 28, borderRadius: 2, background: GC(t.plant_group), display: 'inline-block', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 12 }}>{t.plant_name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{t.plant_group}</div>
                      </div>
                    </div>
                  </td>
                  <td className="num">{fmt(t.mw_at_peak)}</td>
                  <td className="num">{fmt(t.total_generation_gwh)}</td>
                  <td className="num" style={{ color: ((t.power_factor ?? pfByPlant[t.plant_name]) || 1) < 0.9 ? 'var(--amber)' : 'var(--text-1)' }}>
                    {(t.power_factor ?? pfByPlant[t.plant_name]) ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
