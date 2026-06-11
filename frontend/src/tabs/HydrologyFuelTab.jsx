import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
const fmt=(n,d=4)=>n!=null?Number(n).toLocaleString(undefined,{maximumFractionDigits:d}):'—';
const TT={ contentStyle:{ background:'#1e293b', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, fontSize:12, color:'#f1f5f9' }, labelStyle:{ color:'#94a3b8' }, itemStyle:{ color:'#f1f5f9' } };
export default function HydrologyFuelTab({ data }) {
  const hydrology=(data.hydrology||[]).filter(h=>h.station_name!=='Nangbeto (m)');const gas=data.gas_supply||[];const fuel=data.liquid_fuel_stocks||[];
  const hydroChart=hydrology.filter(h=>h.present_headwater_level!=null).map(h=>({name:h.station_name,present:h.present_headwater_level,previous:h.previous_headwater_level}));
  const fuelChart=fuel.map(f=>({name:`${f.location} ${f.fuel_type}`,qty:f.quantity_bbls}));
  return (
    <div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">I. Hydrology Data</div>
          <table className="data-table">
            <thead><tr><th>Station</th><th className="num">Present HW</th><th className="num">Previous HW</th><th className="num">Change</th></tr></thead>
            <tbody>{hydrology.map((h,i)=>(
              <tr key={i}>
                <td style={{fontWeight:500}}>{h.station_name}</td>
                <td className="num">{fmt(h.present_headwater_level)}</td>
                <td className="num" style={{color:'var(--text-3)'}}>{fmt(h.previous_headwater_level)}</td>
                <td className="num" style={{color:(h.change_in_lake_level||0)<0?'var(--red)':'var(--green)',fontWeight:600}}>
                  {h.change_in_lake_level!=null?((h.change_in_lake_level>0?'+':'')+h.change_in_lake_level.toFixed(2)):'—'}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="panel">
          <div className="panel-title">J. Gas Supply</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Supply Point</th>
                <th className="num">Gas Pressure (bar)</th>
                <th className="num">Flow Rate (mmscf)</th>
              </tr>
            </thead>
            <tbody>{gas.map((g,i)=>(
              <tr key={i}>
                <td style={{fontWeight:500}}>{g.point_name}</td>
                <td className="num">{g.gas_pressure_bar!=null?fmt(g.gas_pressure_bar):'—'}</td>
                <td className="num">{g.flow_rate_mmscf!=null?fmt(g.flow_rate_mmscf):'—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      {hydroChart.length>0&&(
        <div className="panel">
          <div className="panel-title">Headwater Levels</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hydroChart} margin={{left:10,right:20,top:4,bottom:28}}>
              <XAxis dataKey="name" tick={{fill:'var(--text-3)',fontSize:10}} axisLine={false} tickLine={false} angle={-10} textAnchor="end"/>
              <YAxis tick={{fill:'var(--text-3)',fontSize:11}} axisLine={false} tickLine={false}/>
              <Tooltip {...TT}/>
              <Legend iconType="circle" iconSize={8} formatter={v=><span style={{color:'var(--text-2)',fontSize:11}}>{v}</span>}/>
              <Bar dataKey="present" name="Present HW" fill="#3b82f6" radius={[4,4,0,0]}/>
              <Bar dataKey="previous" name="Previous HW" fill="#1d4ed8" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="section-title">K. Liquid Fuel Stocks</div>
      <div className="panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Location</th><th>Fuel Type</th><th className="num">Quantity (bbls)</th><th className="num">Duration</th><th>Assumption</th></tr></thead>
            <tbody>{fuel.map((f,i)=>(
              <tr key={i}>
                <td style={{fontWeight:500}}>{f.location}</td>
                <td><span className="badge badge-blue">{f.fuel_type}</span></td>
                <td className="num">{fmt(f.quantity_bbls,0)}</td>
                <td className="num" style={{color:f.expected_duration_days!=null&&f.expected_duration_days<3?'var(--red)':'var(--text-1)'}}>{f.expected_duration_days!=null?`${f.expected_duration_days} days`:'—'}</td>
                <td style={{fontSize:11,color:'var(--text-3)'}}>{f.assumption||'—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      {fuelChart.length>0&&(
        <div className="panel">
          <div className="panel-title">Fuel Stocks (bbls)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={fuelChart} margin={{left:10,right:20,top:4,bottom:36}}>
              <XAxis dataKey="name" tick={{fill:'var(--text-3)',fontSize:10}} axisLine={false} tickLine={false} angle={-12} textAnchor="end"/>
              <YAxis tick={{fill:'var(--text-3)',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
              <Tooltip {...TT} formatter={v=>[Number(v).toLocaleString()+' bbls','Quantity']}/>
              <Bar dataKey="qty" radius={[4,4,0,0]}>
                {fuelChart.map((_,i)=><Cell key={i} fill={i%2===0?'#3b82f6':'#1d4ed8'}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
