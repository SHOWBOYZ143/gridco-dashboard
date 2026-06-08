import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const fmt = (n,d=4) => n!=null ? Number(n).toLocaleString(undefined,{maximumFractionDigits:d}) : '—';
const TT  = { contentStyle:{ background:'#1e293b', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, fontSize:12, color:'#f1f5f9' }, labelStyle:{ color:'#94a3b8' }, itemStyle:{ color:'#f1f5f9' } };

export default function GridExchangesTab({ data }) {
  const lines    = data.international_lines || [];
  const exchanges = data.energy_exchanges   || [];
  const intertie = data.intertie_programme  || [];

  const exchData = exchanges.map((e,i) => ({
    name: e.exchange_name.replace('Energy ','').replace(' to ','→').replace(' from ','←'),
    gwh:  e.energy_gwh,
  }));
  const COLORS = ['#3b82f6','#ef4444','#10b981','#6b7280','#8b5cf6'];

  return (
    <div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">G. International Lines</div>
          <table className="data-table">
            <thead><tr><th>Line</th><th className="num">kV</th><th className="num">Max (MW)</th><th className="num">Min (MW)</th></tr></thead>
            <tbody>
              {lines.map((l,i)=>(
                <tr key={i}>
                  <td style={{fontWeight:500}}>{l.line_name}</td>
                  <td className="num" style={{color:'var(--text-3)'}}>{l.voltage_level_kv}</td>
                  <td className="num">{fmt(l.max_load,1)} <span style={{fontSize:10,color:'var(--accent)'}}>{l.max_load_direction}</span> <span style={{fontSize:10,color:'var(--text-3)'}}>{l.max_load_time}</span></td>
                  <td className="num">{fmt(l.min_load,1)} <span style={{fontSize:10,color:'var(--accent)'}}>{l.min_load_direction}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <div className="panel-title">H. Energy Exchanges (GWh)</div>
          {exchanges.map((e,i)=>(
            <div className="row-item" key={i}>
              <span className="row-label">{e.exchange_name}</span>
              <span className="row-value" style={{color:(e.energy_gwh||0)>0?'var(--green)':'var(--text-2)'}}>
                {(e.energy_gwh||0).toFixed(4)} GWh
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="panel-title">Energy Exchanges Chart</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={exchData} margin={{left:10,right:20,top:4,bottom:24}}>
            <XAxis dataKey="name" tick={{fill:'var(--text-3)',fontSize:10}} axisLine={false} tickLine={false} angle={-10} textAnchor="end" />
            <YAxis tick={{fill:'var(--text-3)',fontSize:11}} axisLine={false} tickLine={false} />
            <Tooltip {...TT} formatter={v=>[`${Number(v).toFixed(4)} GWh`,'Energy']} />
            <Bar dataKey="gwh" radius={[4,4,0,0]}>
              {exchData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {intertie.length>0 && (
        <>
          <div className="section-title">L. Ghana–Côte d'Ivoire Intertie Programme</div>
          <div className="panel">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Start</th><th>End</th><th className="num">VRA (MW)</th><th className="num">CIE (MW)</th></tr></thead>
              <tbody>
                {intertie.map((t,i)=>(
                  <tr key={i}>
                    <td style={{color:'var(--text-2)'}}>{t.date||'—'}</td><td>{t.start_time}</td><td>{t.end_time}</td>
                    <td className="num">{t.vra_mw}</td>
                    <td className="num" style={{color:(t.cie_mw||0)>0?'var(--green)':'var(--text-3)'}}>{t.cie_mw}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
