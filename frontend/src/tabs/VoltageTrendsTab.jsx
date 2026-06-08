import React,{useState} from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
const COLORS=['#3b82f6','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#a78bfa'];
const TT={ contentStyle:{ background:'#1e293b', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, fontSize:12, color:'#f1f5f9' }, labelStyle:{ color:'#94a3b8' }, itemStyle:{ color:'#f1f5f9' } };
export default function VoltageTrendsTab({ data }) {
  const trends=data.voltage_trends||[];
  const [selected,setSelected]=useState(trends.slice(0,4).map(n=>n.node_name));
  if(!trends.length) return <div className="alert alert-info" style={{marginTop:20}}><div className="alert-dot"/>Voltage trend data not available.</div>;
  const allTimes=[...new Set(trends.flatMap(n=>n.readings.map(r=>r.time)))].sort();
  const chartData=allTimes.map(t=>{
    const row={time:t};
    trends.forEach(n=>{const r=n.readings.find(r=>r.time===t);if(r)row[n.node_name]=r.value_kv;});
    return row;
  });
  const toggle=name=>setSelected(prev=>prev.includes(name)?prev.filter(n=>n!==name):[...prev,name]);
  const hiNodes=trends.filter(n=>n.kv_max>50);
  const loNodes=trends.filter(n=>n.kv_max<=50);
  const renderChart=(nodes,title,yMin,yMax)=>{
    const vis=nodes.filter(n=>selected.includes(n.node_name));
    if(!vis.length)return null;
    return (
      <div className="panel" key={title} style={{marginBottom:14}}>
        <div className="panel-title">{title}</div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{left:10,right:20,top:10,bottom:20}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
            <XAxis dataKey="time" tick={{fill:'var(--text-3)',fontSize:10}} axisLine={false} tickLine={false} interval={2}/>
            <YAxis tick={{fill:'var(--text-3)',fontSize:11}} axisLine={false} tickLine={false} domain={[yMin,yMax]}/>
            <Tooltip {...TT} formatter={(v,n)=>[`${v} kV`,n]}/>
            {vis.map((n)=>(
              <Line key={n.node_name} type="monotone" dataKey={n.node_name}
                stroke={COLORS[trends.indexOf(n)%COLORS.length]} strokeWidth={2} dot={false} connectNulls/>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };
  return (
    <div>
      <div className="section-title">Voltage Trend Curves — Hourly kV Readings by Node</div>
      <div className="note" style={{marginBottom:12}}>Chart image digitization · Auto-detected colours · ±5% accuracy</div>
      <div className="panel" style={{marginBottom:14}}>
        <div className="panel-title">Select Nodes to Display</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
          {trends.map((n,i)=>{
            const on=selected.includes(n.node_name);
            const c=COLORS[i%COLORS.length];
            return (
              <button key={n.node_name} onClick={()=>toggle(n.node_name)} style={{
                background:on?`rgba(${parseInt(c.slice(1,3),16)},${parseInt(c.slice(3,5),16)},${parseInt(c.slice(5,7),16)},0.15)`:'var(--bg-card2)',
                border:`1px solid ${on?c:'var(--border)'}`,
                color:on?c:'var(--text-3)',borderRadius:7,padding:'5px 12px',fontSize:11,cursor:'pointer',
                display:'flex',alignItems:'center',gap:5,fontWeight:on?600:400,
              }}>
                <span style={{width:8,height:8,borderRadius:2,background:on?c:'var(--text-3)',display:'inline-block'}}/>
                {n.node_name}
                <span style={{fontSize:9,opacity:0.7}}>({n.kv_min}–{n.kv_max} kV)</span>
              </button>
            );
          })}
        </div>
      </div>
      {renderChart(hiNodes,'High Voltage Nodes (110–190 kV)',110,190)}
      {renderChart(loNodes,'34.5 kV Nodes',27,42)}
      <div className="section-title">Hourly kV Readings by Node</div>
      {trends.filter(n=>selected.includes(n.node_name)).map((n)=>{
        const c=COLORS[trends.indexOf(n)%COLORS.length];
        return (
          <details key={n.node_name} style={{marginBottom:6}}>
            <summary style={{
              cursor:'pointer',padding:'9px 14px',background:'var(--bg-card)',
              border:'1px solid var(--border)',borderRadius:9,fontSize:12,
              color:c,fontWeight:500,display:'flex',alignItems:'center',gap:8,
            }}>
              <span style={{width:9,height:9,borderRadius:2,background:c,display:'inline-block',flexShrink:0}}/>
              {n.node_name} &nbsp;·&nbsp; {n.kv_min}–{n.kv_max} kV &nbsp;·&nbsp; {n.readings.length} pts
            </summary>
            <div style={{marginTop:2,padding:'12px',background:'var(--bg-card2)',borderRadius:'0 0 9px 9px',border:'1px solid var(--border)',borderTop:'none'}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(90px,1fr))',gap:4}}>
                {n.readings.map((r,i)=>(
                  <div key={i} style={{fontSize:11,padding:'4px 8px',background:'var(--bg-card)',borderRadius:5,display:'flex',justifyContent:'space-between',border:'1px solid var(--border)'}}>
                    <span style={{color:'var(--text-3)'}}>{r.time}</span>
                    <span style={{color:c,fontWeight:600}}>{r.value_kv}</span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
