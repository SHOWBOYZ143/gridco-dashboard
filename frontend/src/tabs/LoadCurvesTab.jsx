import React from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
const fmt=(n)=>n!=null?Number(n).toLocaleString(undefined,{maximumFractionDigits:0}):'—';
const TT={ contentStyle:{ background:'#111827', border:'1px solid rgba(255,255,255,0.07)', borderRadius:8, fontSize:12 }, labelStyle:{color:'#94a3b8'} };
export default function LoadCurvesTab({ data }) {
  const lc=data.load_curve||{};const sd=lc.system_demand||[];const dd=lc.domestic_demand||[];
  if(!sd.length) return <div className="alert alert-info" style={{marginTop:20}}><div className="alert-dot"/>Load curve data not available.</div>;
  const sdMap=Object.fromEntries(sd.map(p=>[p.time,p.value_mw]));
  const ddMap=Object.fromEntries(dd.map(p=>[p.time,p.value_mw]));
  const times=[...new Set([...sd.map(p=>p.time),...dd.map(p=>p.time)])].sort();
  const chartData=times.map(t=>({time:t,system:sdMap[t]??null,domestic:ddMap[t]??null}));
  const peakSD=sd.reduce((max,p)=>p.value_mw>(max?.value_mw||0)?p:max,null);
  const peakDD=dd.reduce((max,p)=>p.value_mw>(max?.value_mw||0)?p:max,null);
  const minSD=sd.reduce((min,p)=>p.value_mw<(min?.value_mw||Infinity)?p:min,null);
  return (
    <div>
      <div className="section-title">C. Load Curves — System &amp; Domestic Demand</div>
      <div className="note" style={{marginBottom:12}}>Extracted via chart image digitization · {lc.accuracy_note||'±1–3% accuracy'}</div>
      <div className="kpi-grid" style={{marginBottom:16}}>
        <div className="kpi-card success"><div className="kpi-label">System Demand Peak</div><div className="kpi-value">{fmt(peakSD?.value_mw)}<span className="kpi-unit">MW</span></div><div className="kpi-sub pos">⏱ {peakSD?.time||'—'}</div></div>
        <div className="kpi-card warning"><div className="kpi-label">Domestic Demand Peak</div><div className="kpi-value">{fmt(peakDD?.value_mw)}<span className="kpi-unit">MW</span></div><div className="kpi-sub warn">⏱ {peakDD?.time||'—'}</div></div>
        <div className="kpi-card"><div className="kpi-label">Overnight Minimum (System Demand)</div><div className="kpi-value">{fmt(minSD?.value_mw)}<span className="kpi-unit">MW</span></div><div className="kpi-sub">{minSD?.time||'—'}</div></div>
        <div className="kpi-card"><div className="kpi-label">Data Points</div><div className="kpi-value">{sd.length}<span className="kpi-unit">pts</span></div><div className="kpi-sub">30-minute intervals</div></div>
      </div>
      <div className="legend">
        <div className="legend-item"><div className="legend-dot" style={{background:'#3b82f6'}}/>System Demand (MW)</div>
        <div className="legend-item"><div className="legend-dot" style={{background:'#f59e0b'}}/>Domestic Demand (MW)</div>
      </div>
      <div className="panel">
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData} margin={{left:10,right:20,top:10,bottom:30}}>
            <defs>
              <linearGradient id="sdGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
              <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="time" tick={{fill:'var(--text-3)',fontSize:10}} axisLine={false} tickLine={false} interval={3} angle={-30} textAnchor="end"/>
            <YAxis tick={{fill:'var(--text-3)',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(1)}k`}/>
            <Tooltip {...TT} formatter={(v,n)=>[`${fmt(v)} MW`,n==='system'?'System Demand':'Domestic Demand']}/>
            <Area type="monotone" dataKey="system" stroke="#3b82f6" strokeWidth={2} fill="url(#sdGrad)" dot={false} connectNulls/>
            <Area type="monotone" dataKey="domestic" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3" fill="url(#ddGrad)" dot={false} connectNulls/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="grid-2">
        {[[sd,'System Demand','#3b82f6',peakSD],[dd,'Domestic Demand','#f59e0b',peakDD]].map(([arr,label,color,peak])=>(
          <div className="panel" key={label}>
            <div className="panel-title">{label}</div>
            <div className="table-scroll" style={{maxHeight:280,overflowY:'auto'}}>
              <table className="data-table">
                <thead><tr><th>Time</th><th className="num">MW</th></tr></thead>
                <tbody>{arr.map((p,i)=>(
                  <tr key={i} style={{background:p===peak?'var(--accent-dim)':''}}>
                    <td style={{color:p===peak?color:'var(--text-2)'}}>{p.time}</td>
                    <td className="num" style={{color:p===peak?color:'var(--text-1)',fontWeight:p===peak?700:400}}>{fmt(p.value_mw)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
