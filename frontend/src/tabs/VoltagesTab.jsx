import React from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
const fmt=(n,d=4)=>n!=null?Number(n).toLocaleString(undefined,{maximumFractionDigits:d}):'—';
const TT={ contentStyle:{ background:'#1e293b', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, fontSize:12, color:'#f1f5f9' }, labelStyle:{ color:'#94a3b8' }, itemStyle:{ color:'#f1f5f9' } };
export default function VoltagesTab({ data }) {
  const voltages=data.system_voltages||[];
  const outside=voltages.filter(v=>v.within_normal_limits===false);
  const chartData=voltages.map(v=>({name:v.node_name,actual:v.actual_kv,nominal:v.nominal_kv,ok:v.within_normal_limits}));
  return (
    <div>
      {outside.length>0&&(
        <div className="alert alert-danger"><div className="alert-dot"/>
          {outside.length} node{outside.length>1?'s':''} outside ±5% nominal: {outside.map(v=>v.node_name).join(', ')}
        </div>
      )}
      <div className="section-title">E. System Voltages at Selected Nodes</div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">Actual vs Nominal</div>
          {voltages.map((v,i)=>{
            const pct=v.nominal_kv>0?Math.min((v.actual_kv/v.nominal_kv)*100,120):0;
            const ok=v.within_normal_limits!==false;
            return (
              <div className="volt-row" key={i}>
                <div className="volt-name">{v.node_name}</div>
                <div className="volt-bar-bg">
                  <div className={`volt-bar ${ok?'volt-bar-ok':'volt-bar-bad'}`} style={{width:`${Math.min(pct,100)}%`}}/>
                </div>
                <div className={`volt-val${ok?'':' bad'}`}>{v.actual_kv} / {v.nominal_kv}</div>
              </div>
            );
          })}
          <div className="note">Green = within ±5% · Red = outside limits</div>
        </div>
        <div className="panel">
          <div className="panel-title">Voltage Compliance Table</div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Node</th><th className="num">Nominal</th><th className="num">Actual</th><th className="num">Dev %</th><th>Status</th></tr></thead>
              <tbody>{voltages.map((v,i)=>(
                <tr key={i}>
                  <td style={{fontWeight:500}}>{v.node_name}</td>
                  <td className="num" style={{color:'var(--text-3)'}}>{v.nominal_kv}</td>
                  <td className="num" style={{color:v.within_normal_limits===false?'var(--red)':'var(--text-1)',fontWeight:v.within_normal_limits===false?700:400}}>{v.actual_kv}</td>
                  <td className="num" style={{color:v.within_normal_limits===false?'var(--red)':'var(--green)'}}>{v.deviation_percent!=null?`${v.deviation_percent.toFixed(1)}%`:'—'}</td>
                  <td><span className={v.within_normal_limits===false?'badge badge-out':'badge badge-ok'}>{v.within_normal_limits===false?'✗ Non Compliant':'✓ Compliant'}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>
      {chartData.length>0&&(
        <div className="panel">
          <div className="panel-title">Actual vs Nominal — Bar Chart</div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{left:10,right:20,top:4,bottom:60}}>
              <XAxis dataKey="name" tick={{fill:'var(--text-3)',fontSize:10}} axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0}/>
              <YAxis tick={{fill:'var(--text-3)',fontSize:11}} axisLine={false} tickLine={false}/>
              <Tooltip {...TT} formatter={(v,n)=>[`${v} kV`,n]}/>
              <Bar dataKey="actual" name="Actual kV" radius={[3,3,0,0]}>
                {chartData.map((d,i)=><Cell key={i} fill={d.ok===false?'#ef4444':'#3b82f6'}/>)}
              </Bar>
              <Line dataKey="nominal" name="Nominal kV" type="monotone" dot={{r:3,fill:'#94a3b8'}} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 2"/>
            </ComposedChart>
          </ResponsiveContainer>
          <div className="note">Red bars = outside ±5% nominal · Dashed line = nominal kV</div>
        </div>
      )}
    </div>
  );
}
