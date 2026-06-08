import React, { useState, useMemo } from 'react';

export default function IncidentsTab({ data, allReports = [] }) {
  const incidents   = data.major_incidents       || [];
  const constraints = data.constraints_nits      || [];
  const afls        = data.afls_operations       || [];
  const sls         = data.special_load_shedding || [];
  const misc        = data.miscellaneous         || [];
  const stillOut    = incidents.filter(i => i.still_out);
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'out' ? incidents.filter(i => i.still_out) : incidents;

  // ── Plant Unavailability Tracker across all loaded reports ────────────────
  const unavailabilityMap = useMemo(() => {
    if (allReports.length < 2) return [];

    const parseDate = r => {
      const d = r?.report_header?.report_date || '';
      const p = d.split(/[-/]/);
      if (p.length === 3) {
        const day   = parseInt(p[0].length === 4 ? p[2] : p[0], 10);
        const month = parseInt(p[1], 10);
        const year  = parseInt(p[0].length === 4 ? p[0] : ('20' + p[2]), 10);
        return new Date(year, month - 1, day);
      }
      return null;
    };

    // Build map: equipmentId → { firstSeen, lastSeen, daysOut, description, everRestored }
    const tracker = {};
    const sortedReports = [...allReports].sort((a, b) => {
      const da = parseDate(a), db = parseDate(b);
      return (da || 0) - (db || 0);
    });

    sortedReports.forEach(r => {
      const date = parseDate(r);
      const incs = r.major_incidents || [];
      incs.forEach(inc => {
        const id = inc.equipment_id;
        if (!id) return;
        if (!tracker[id]) {
          tracker[id] = {
            id,
            description: inc.description_of_event || '—',
            firstSeen: date,
            lastSeen: date,
            daysOut: 1,
            stillOut: inc.still_out,
            restoredDate: null,
          };
        } else {
          if (date > tracker[id].lastSeen) {
            tracker[id].lastSeen = date;
            tracker[id].stillOut = inc.still_out;
          }
          tracker[id].daysOut = Math.max(1,
            Math.round((tracker[id].lastSeen - tracker[id].firstSeen) / (1000 * 60 * 60 * 24)) + 1
          );
          if (!inc.still_out && inc.time_restored) {
            tracker[id].restoredDate = inc.time_restored;
          }
        }
      });
    });

    return Object.values(tracker)
      .sort((a, b) => b.daysOut - a.daysOut);
  }, [allReports]);

  const persistentlyOut = unavailabilityMap.filter(e => e.stillOut);
  const recentlyRestored = unavailabilityMap.filter(e => !e.stillOut && e.daysOut > 1);

  const fmtDate = d => d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';

  return (
    <div>
      {stillOut.length > 0 && (
        <div className="alert alert-danger">
          <div className="alert-dot"/>
          {stillOut.length} equipment still out of service: {stillOut.map(i => i.equipment_id).join(', ')}
        </div>
      )}

      {/* ── Plant Unavailability Tracker ── */}
      {allReports.length >= 2 && unavailabilityMap.length > 0 && (
        <>
          <div className="section-title">Equipment Unavailability Tracker</div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>

            {/* Persistently Out */}
            <div className="panel" style={{ flex: 1 }}>
              <div className="panel-title" style={{ color: '#dc2626' }}>
                Still Out ({persistentlyOut.length})
              </div>
              {persistentlyOut.length === 0
                ? <span className="badge-none">None currently out</span>
                : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Equipment</th>
                        <th>Description</th>
                        <th className="num">First Out</th>
                        <th className="num">Days Out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {persistentlyOut.map((e, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent)', fontSize: 12 }}>{e.id}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{e.description}</td>
                          <td className="num" style={{ color: 'var(--text-3)', fontSize: 11 }}>{fmtDate(e.firstSeen)}</td>
                          <td className="num">
                            <span style={{
                              fontWeight: 700, fontSize: 12,
                              color: e.daysOut >= 7 ? '#dc2626' : e.daysOut >= 3 ? '#d97706' : 'var(--text-1)',
                            }}>
                              {e.daysOut}d
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </div>

            {/* Recently Restored */}
            {recentlyRestored.length > 0 && (
              <div className="panel" style={{ flex: 1 }}>
                <div className="panel-title" style={{ color: '#059669' }}>
                  Restored During Period ({recentlyRestored.length})
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Equipment</th>
                      <th>Description</th>
                      <th className="num">First Out</th>
                      <th className="num">Days Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentlyRestored.map((e, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent)', fontSize: 12 }}>{e.id}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{e.description}</td>
                        <td className="num" style={{ color: 'var(--text-3)', fontSize: 11 }}>{fmtDate(e.firstSeen)}</td>
                        <td className="num" style={{ fontWeight: 600, fontSize: 12, color: '#059669' }}>{e.daysOut}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Today's Incidents ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>M. Major Incidents — {incidents.length} Total</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['all', `All (${incidents.length})`], ['out', `Still Out (${stillOut.length})`]].map(([f, l]) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? 'var(--accent-dim)' : 'var(--bg-card2)',
              border: `1px solid ${filter === f ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
              color: filter === f ? 'var(--accent)' : 'var(--text-3)',
              borderRadius: 7, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontWeight: 500,
            }}>{l}</button>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>No.</th>
                <th style={{ width: 130 }}>Equipment ID</th>
                <th>Description</th>
                <th className="num" style={{ width: 75 }}>Time Out</th>
                <th className="num" style={{ width: 75 }}>Restored</th>
                <th style={{ width: 90 }}>Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>{filtered.map((inc, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--text-3)', fontSize: 11 }}>{inc.incident_no}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{inc.equipment_id}</td>
                <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{inc.description_of_event}</td>
                <td className="num" style={{ color: 'var(--text-3)' }}>{inc.time_out || '—'}</td>
                <td className="num">{inc.time_restored || '—'}</td>
                <td><span className={inc.still_out ? 'badge badge-out' : 'badge badge-ok'}>{inc.still_out ? 'Still Out' : 'Restored'}</span></td>
                <td style={{ fontSize: 11, color: 'var(--text-3)' }}>{inc.remarks || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      <div className="section-title">N. Constraints on the National Interconnected Transmission System (NITS)</div>
      <div className="panel">
        <table className="data-table">
          <thead><tr><th style={{ width: 35 }}>No.</th><th>Constraint Description</th><th>Reason for Constraint</th></tr></thead>
          <tbody>{constraints.filter(c => c.constraint_no && c.constraint_text).map((c, i) => (
            <tr key={i}>
              <td style={{ color: 'var(--text-3)', fontSize: 11 }}>{c.constraint_no}</td>
              <td style={{ fontSize: 12 }}>{c.constraint_text}</td>
              <td style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.reason_for_constraint || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div className="grid-3">
        {[
          ['O. AFLS Operations', afls, 'feeder_id', 'description_of_event'],
          ['P. Special Load Shedding', sls, 'industry', 'description_of_event'],
          ['Q. Miscellaneous', misc, null, 'description_of_event'],
        ].map(([title, items, idKey, descKey]) => (
          <div className="panel" style={{ marginBottom: 0 }} key={title}>
            <div className="panel-title">{title}</div>
            {items.length === 0
              ? <span className="badge-none">None reported</span>
              : items.map((it, i) => (
                <div key={i} style={{ fontSize: 12, marginBottom: 7 }}>
                  {idKey && <div style={{ color: 'var(--accent)', fontWeight: 500 }}>{it[idKey]}</div>}
                  <div style={{ color: 'var(--text-2)', fontSize: 11 }}>{it[descKey]}</div>
                </div>
              ))
            }
          </div>
        ))}
      </div>
    </div>
  );
}
