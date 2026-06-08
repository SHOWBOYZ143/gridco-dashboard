import React from 'react';
import { Tooltip, PieChart, Pie, Cell, Legend, ResponsiveContainer } from 'recharts';

const fmt = (n, d=4) => n != null ? Number(n).toLocaleString(undefined, {maximumFractionDigits:d}) : '—';
const TT  = { contentStyle:{ background:'#1e293b', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, fontSize:12, color:'#f1f5f9' }, labelStyle:{ color:'#94a3b8' }, itemStyle:{ color:'#f1f5f9' } };
const PIE_COLORS = ['#3b82f6','#10b981','#f59e0b'];

export default function PeakGenerationTab({ data }) {
  const peakData = data.peak_data    || [];
  const plantGen = data.plant_generation || [];

  const hydro   = plantGen.filter(p => p.plant_group === 'HYDRO');
  const thermal = plantGen.filter(p => p.plant_group === 'THERMAL' && (p.mw_at_peak||0) > 0);
  const solar   = plantGen.filter(p => p.plant_group === 'SOLAR');
  const ceb     = plantGen.filter(p => p.plant_group === 'CEB');

  const hydroGwh   = hydro.reduce((s,p)   => s + (p.total_generation_gwh||0), 0);
  const thermalGwh = thermal.reduce((s,p) => s + (p.total_generation_gwh||0), 0);
  const solarGwh   = solar.reduce((s,p)   => s + (p.total_generation_gwh||0), 0);
  const totalGwh   = hydroGwh + thermalGwh + solarGwh;

  const pieData = [
    { name:'Thermal', value:thermalGwh },
    { name:'Hydro',   value:hydroGwh },
    { name:'Solar',   value:solarGwh },
  ].filter(d => d.value > 0);


  return (
    <div>
      <div className="section-title">B. Peak Data at System Peak</div>
      <div className="panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Metric</th><th className="num">MW</th><th className="num">MVAr</th><th className="num">MVA</th><th className="num">Time</th></tr></thead>
            <tbody>
              {peakData.map((p,i) => (
                <tr key={i}>
                  <td>{p.metric_name}</td>
                  <td className="num">{fmt(p.mw)}</td>
                  <td className="num">{fmt(p.mvar)}</td>
                  <td className="num">{fmt(p.mva)}</td>
                  <td className="num" style={{color:'var(--text-3)'}}>{p.time||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-title">D. Generation Mix at System Peak</div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">Generation Mix by GWh</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                {pieData.map((_,i) => <Cell key={i} fill={PIE_COLORS[i]} strokeWidth={0} />)}
              </Pie>
              <Tooltip {...TT} formatter={v=>[`${fmt(v,3)} GWh`,'']} />
              <Legend iconType="circle" iconSize={8} formatter={v=><span style={{color:'var(--text-2)',fontSize:11}}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <div className="panel-title">Generation Breakdown by Source</div>
          {[
            {label:'Thermal Generation', gwh:thermalGwh, color:'#3b82f6'},
            {label:'Hydro Generation',   gwh:hydroGwh,   color:'#10b981'},
            {label:'Solar Generation',   gwh:solarGwh,   color:'#f59e0b'},
          ].filter(g=>g.gwh>0).map(g=>(
            <div key={g.label} style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:5}}>
                <span style={{color:'var(--text-2)',fontWeight:500}}>{g.label}</span>
                <span style={{color:'var(--text-1)',fontWeight:600}}>{fmt(g.gwh,3)} GWh <span style={{color:'var(--text-3)',fontWeight:400}}>({totalGwh?((g.gwh/totalGwh)*100).toFixed(0):0}%)</span></span>
              </div>
              <div style={{background:'var(--bg-hover)',borderRadius:4,height:5}}>
                <div style={{width:`${totalGwh?(g.gwh/totalGwh)*100:0}%`,height:5,background:g.color,borderRadius:4}} />
              </div>
            </div>
          ))}
          <div style={{borderTop:'1px solid var(--border)',paddingTop:10,marginTop:4,fontSize:12,color:'var(--text-3)',display:'flex',justifyContent:'space-between'}}>
            <span>Total Generation</span><span style={{color:'var(--text-1)',fontWeight:600}}>{fmt(totalGwh,3)} GWh</span>
          </div>
        </div>
      </div>

      <div className="section-title">Thermal Generation Plants</div>
      <div className="panel">
        <table className="data-table">
          <thead><tr><th>Plant</th><th className="num">MW at Peak</th><th className="num">Total Generation (GWh)</th></tr></thead>
          <tbody>
            {thermal.map((p,i)=>(
              <tr key={i}>
                <td style={{fontWeight:500}}>{p.plant_name}</td>
                <td className="num">{fmt(p.mw_at_peak)}</td>
                <td className="num">{fmt(p.total_generation_gwh,3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title">Hydro Generation Plants</div>
      <div className="panel">
        <table className="data-table">
          <thead><tr><th>Plant</th><th className="num">MW at Peak</th><th className="num">Total Generation (GWh)</th><th className="num">Discharge (cfs)</th><th className="num">Spillage (cfs)</th></tr></thead>
          <tbody>
            {hydro.map((p,i)=>(
              <tr key={i}>
                <td style={{fontWeight:500}}>{p.plant_name}{p.plant_code?<span style={{color:'var(--text-3)',marginLeft:5,fontSize:11}}>({p.plant_code})</span>:null}</td>
                <td className="num">{fmt(p.mw_at_peak)}</td>
                <td className="num">{fmt(p.total_generation_gwh,3)}</td>
                <td className="num">{fmt(p.discharge_cfs)}</td>
                <td className="num" style={{color:(p.spillage_cfs||0)>0?'var(--amber)':'var(--text-3)'}}>{fmt(p.spillage_cfs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {solar.length > 0 && (
        <>
          <div className="section-title">Solar Plants</div>
          <div className="panel">
            <table className="data-table">
              <thead><tr><th>Plant</th><th className="num">MW at Peak</th><th className="num">Total Generation (GWh)</th><th className="num">Irradiance (W/m²)</th></tr></thead>
              <tbody>
                {solar.map((p,i)=>(
                  <tr key={i}><td style={{fontWeight:500}}>{p.plant_name}</td><td className="num">{fmt(p.mw_at_peak)}</td><td className="num">{fmt(p.total_generation_gwh,4)}</td><td className="num">{p.irradiance ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {ceb.length > 0 && (
        <>
          <div className="section-title">CEB Plant Loadings at Peak</div>
          <div className="panel">
            <table className="data-table">
              <thead><tr><th>Plant</th><th className="num">Total Generation (GWh)</th><th className="num">MW</th><th className="num">MVAr</th><th className="num">MVA</th><th className="num">Units</th><th className="num">Power Factor</th></tr></thead>
              <tbody>
                {ceb.map((p,i)=>(
                  <tr key={i}><td>{p.plant_name}</td><td className="num">{fmt(p.total_generation_gwh,4)}</td><td className="num">{fmt(p.mw_at_peak)}</td><td className="num">{fmt(p.mvar)}</td><td className="num">{fmt(p.mva)}</td><td className="num">{p.units_count??'—'}</td><td className="num">{p.power_factor??'—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
