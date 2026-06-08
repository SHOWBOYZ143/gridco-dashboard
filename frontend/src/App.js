import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import './index.css';
import OverviewTab       from './tabs/OverviewTab';
import PeakGenerationTab from './tabs/PeakGenerationTab';
import UnitLoadingsTab   from './tabs/UnitLoadingsTab';
import GridExchangesTab  from './tabs/GridExchangesTab';
import HydrologyFuelTab  from './tabs/HydrologyFuelTab';
import IncidentsTab      from './tabs/IncidentsTab';
import VoltagesTab       from './tabs/VoltagesTab';
import LoadCurvesTab     from './tabs/LoadCurvesTab';
import VoltageTrendsTab  from './tabs/VoltageTrendsTab';
import TrendsTab         from './tabs/TrendsTab';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';


const TABS = [
  { id: 'overview',   label: 'Key Stats' },
  { id: 'peak',       label: 'Peak Data & Generation' },
  { id: 'units',      label: 'Plant Generation Data' },
  { id: 'grid',       label: 'Grid & Energy Exchanges' },
  { id: 'hydro',      label: 'Hydrology & Fuel Stocks' },
  { id: 'incidents',  label: 'Major Incidents' },
  { id: 'voltages',   label: 'Critical Nodes' },
];

// ── Detect view mode from loaded reports ─────────────────────────────────────
function detectViewMode(reports) {
  if (!reports || reports.length === 0) return 'daily';
  if (reports.length <= 6)  return 'daily';
  if (reports.length <= 31) return 'monthly';
  return 'quarterly';
}

// ── Parse date from report header ────────────────────────────────────────────
function parseReportDate(r) {
  const d = r?.report_header?.report_date || '';
  const parts = d.split(/[-/]/);
  if (parts.length === 3) {
    const day   = parseInt(parts[0].length === 4 ? parts[2] : parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year  = parseInt(parts[0].length === 4 ? parts[0] : (parts[2].length === 2 ? '20' + parts[2] : parts[2]), 10);
    return new Date(year, month - 1, day);
  }
  return new Date(0);
}

export default function App() {
  const [reports, setReports]       = useState([]);
  const [activeIdx, setActiveIdx]   = useState(null);
  const [activeTab, setActiveTab]   = useState('overview');
  const [dragOver, setDragOver]     = useState(false);

  // Upload queue state
  const [queue, setQueue]           = useState([]);   // [{file, status, error}]
  const [queueActive, setQueueActive] = useState(false);
  const [queueDone, setQueueDone]   = useState(0);
  const [queueTotal, setQueueTotal] = useState(0);
  const [globalError, setGlobalError] = useState(null);

  const fileInputRef  = useRef();
  const folderInputRef = useRef();

  const report   = activeIdx !== null ? reports[activeIdx] : null;
  const viewMode = detectViewMode(reports);

  // ── Parse a single PDF ────────────────────────────────────────────────────
  const parseSingle = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await axios.post(`${API}/parse`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000,
    });
    return res.data;
  }, []);

  // ── Process a queue of files sequentially ────────────────────────────────
  const processQueue = useCallback(async (files) => {
    if (files.length === 0) return;
    setQueueActive(true);
    setQueueDone(0);
    setQueueTotal(files.length);
    setGlobalError(null);

    const newReports = [];
    const queueItems = files.map(f => ({ name: f.name, status: 'pending', error: null }));
    setQueue(queueItems);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'parsing' } : q));

      try {
        const data = await parseSingle(file);
        newReports.push(data);
        setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'done' } : q));
      } catch (err) {
        const msg = err.response?.data?.detail || err.message || 'Parse error';
        setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'error', error: msg } : q));
      }
      setQueueDone(i + 1);
    }

    // Merge with existing reports, sort by date, deduplicate by date
    setReports(prev => {
      const combined = [...prev, ...newReports];
      const deduped = Object.values(
        combined.reduce((acc, r) => {
          const key = r?.report_header?.report_date || Math.random();
          acc[key] = r;
          return acc;
        }, {})
      );
      const sorted = deduped.sort((a, b) => parseReportDate(a) - parseReportDate(b));
      setActiveIdx(sorted.length - 1);
      return sorted;
    });

    setQueueActive(false);
    setActiveTab('overview');
  }, [parseSingle]);

  // ── File input handlers ───────────────────────────────────────────────────
  const handleFiles = useCallback((fileList) => {
    const pdfs = Array.from(fileList)
      .filter(f => f.name.toLowerCase().endsWith('.pdf'))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (pdfs.length === 0) { setGlobalError('No PDF files found.'); return; }
    processQueue(pdfs);
  }, [processQueue]);

  const onFileChange   = e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; };
  const onFolderChange = e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; };
  const onDrop = e => {
    e.preventDefault(); setDragOver(false);
    const files = e.dataTransfer.files;
    if (files?.length) handleFiles(files);
  };

  const removeReport = (idx, e) => {
    e.stopPropagation();
    setReports(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) { setActiveIdx(null); return next; }
      setActiveIdx(Math.min(idx, next.length - 1));
      return next;
    });
  };

  // ── View mode label ───────────────────────────────────────────────────────
  const viewLabel = { daily: 'Daily', monthly: 'Monthly', quarterly: 'Quarterly' }[viewMode];
  const viewColor = { daily: '#3b82f6', monthly: '#10b981', quarterly: '#f59e0b' }[viewMode];

  const hdr      = report?.report_header   || {};
  const statuses = report?.section_statuses || [];
  const found    = statuses.filter(s => s.found).length;
  const incidents = report?.major_incidents || [];
  const stillOut  = incidents.filter(i => i.still_out).length;

  const renderTab = () => {
    if (activeTab === 'trends') return <TrendsTab reports={reports} viewMode={viewMode} />;
    if (!report) return null;
    switch (activeTab) {
      case 'overview':   return <OverviewTab       data={report} />;
      case 'peak':       return <PeakGenerationTab data={report} />;
      case 'units':      return <UnitLoadingsTab   data={report} />;
      case 'grid':       return <GridExchangesTab  data={report} />;
      case 'hydro':      return <HydrologyFuelTab  data={report} />;
      case 'incidents':  return <IncidentsTab      data={report} allReports={reports} />;
      case 'voltages':   return <VoltagesTab       data={report} />;
      case 'loadcurves': return <LoadCurvesTab     data={report} />;
      case 'volttrends': return <VoltageTrendsTab  data={report} />;
      default:           return null;
    }
  };

  return (
    <div className="app-layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">⚡</div>
          <div className="brand-text">
            <div className="brand-name">ESPM</div>
            <div className="brand-sub">GRIDco. Daily Dashboard</div>
          </div>
        </div>

        {/* Upload zone */}
        <div>
          <span className="upload-label">Upload Reports</span>
          <div
            className={`upload-box ${dragOver ? 'dragover' : ''}`}
            onClick={() => fileInputRef.current.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={onFileChange} />
            <input ref={folderInputRef} type="file" accept=".pdf"
              multiple webkitdirectory="" mozdirectory="" onChange={onFolderChange}
              style={{ display: 'none' }} />
            <div className="upload-icon">📄</div>
            <div className="upload-hint">
              <span>Browse</span> or drag &amp; drop<br />
              Single · Multiple · Folder
            </div>
          </div>
          {/* Folder upload button */}
          <button
            onClick={() => folderInputRef.current.click()}
            style={{
              width: '100%', marginTop: 6, padding: '6px 0',
              background: 'var(--bg-card2)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text-3)', fontSize: 11,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 5,
            }}>
            📁 Upload Folder
          </button>
        </div>

        {/* Upload queue progress */}
        {(queueActive || queue.length > 0) && (
          <div style={{ marginTop: 8 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 11, color: 'var(--text-3)', marginBottom: 5,
            }}>
              <span>{queueActive ? `Parsing ${queueDone} of ${queueTotal}…` : `${queueDone} of ${queueTotal} parsed`}</span>
              {!queueActive && <button onClick={() => setQueue([])} style={{
                background: 'none', border: 'none', color: 'var(--text-3)',
                cursor: 'pointer', fontSize: 10, padding: 0,
              }}>Clear</button>}
            </div>
            {/* Progress bar */}
            <div style={{ background: 'var(--bg-card2)', borderRadius: 4, height: 4, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{
                height: '100%', borderRadius: 4, background: viewColor,
                width: `${queueTotal ? (queueDone / queueTotal) * 100 : 0}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
            {/* Per-file status list (scrollable, max 120px) */}
            <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {queue.map((q, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 10, color: q.status === 'error' ? 'var(--red)' :
                    q.status === 'done' ? 'var(--green)' :
                    q.status === 'parsing' ? viewColor : 'var(--text-3)',
                }}>
                  <span>{q.status === 'done' ? '✓' : q.status === 'error' ? '✗' : q.status === 'parsing' ? '⟳' : '·'}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loaded reports */}
        {reports.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <span className="upload-label" style={{ margin: 0 }}>
                Loaded
                <span style={{
                  marginLeft: 5, background: `${viewColor}22`, color: viewColor,
                  borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700,
                }}>{reports.length}</span>
              </span>
              {/* View mode badge */}
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 8px',
                borderRadius: 6, background: `${viewColor}22`, color: viewColor,
              }}>{viewLabel}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
              {reports.map((r, i) => {
                const h   = r?.report_header || {};
                const inc = (r?.major_incidents || []).filter(x => x.still_out).length;
                const secs = r?.section_statuses || [];
                const pct = secs.length ? Math.round(secs.filter(s => s.found).length / secs.length * 100) : 0;
                const isActive = i === activeIdx;
                return (
                  <div key={i}
                    onClick={() => { setActiveIdx(i); if (activeTab === 'trends') setActiveTab('overview'); }}
                    style={{
                      cursor: 'pointer', padding: '6px 9px', borderRadius: 8,
                      border: `1px solid ${isActive ? viewColor + '70' : 'var(--border)'}`,
                      background: isActive ? viewColor + '12' : 'var(--bg-card2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600,
                        color: isActive ? viewColor : 'var(--text-1)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{h.report_date || `Report ${i + 1}`}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', gap: 5, marginTop: 1 }}>
                        <span>{h.report_day?.slice(0, 3) || '—'}</span>
                        <span style={{ color: pct === 100 ? 'var(--green)' : 'var(--amber)' }}>{pct}%</span>
                        {inc > 0 && <span style={{ color: 'var(--red)' }}>⚠{inc}</span>}
                      </div>
                    </div>
                    <button onClick={e => removeReport(i, e)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-3)', fontSize: 13, padding: '2px 3px', flexShrink: 0,
                    }}>✕</button>
                  </div>
                );
              })}
            </div>
            {/* Clear all */}
            {reports.length > 1 && (
              <button onClick={() => { setReports([]); setActiveIdx(null); setQueue([]); }}
                style={{
                  width: '100%', marginTop: 5, padding: '5px 0',
                  background: 'var(--bg-card2)', border: '1px solid var(--border)',
                  borderRadius: 7, color: 'var(--text-3)', fontSize: 10,
                  cursor: 'pointer',
                }}>Clear all reports</button>
            )}
          </div>
        )}

        {/* Active report stats */}
        {report && (
          <>
            <hr className="sidebar-divider" />
            <div className="coverage-pill">{found} / {statuses.length} sections parsed</div>
            <div className="sidebar-info">
              <div><strong>Report:</strong> {hdr.report_code}</div>
              <div><strong>Date:</strong> {hdr.report_date}</div>
              <div><strong>Day:</strong> {hdr.report_day}</div>
              {stillOut > 0 && (
                <div style={{ marginTop: 6, padding: '5px 9px', background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, color: 'var(--red)', fontSize: 11 }}>
                  ⚠ {stillOut} equipment still out
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      {/* ── Main ── */}
      <main className="main-content">
        {reports.length === 0 && !queueActive && !globalError && (
          <div className="upload-placeholder">
            <div className="upload-placeholder-icon">⚡</div>
            <h3>ESPM — GRIDco. Daily Dashboard</h3>
            <p>Upload one or more GRIDco OF-10 PDFs, or drop an entire month's folder at once.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
              {[['📄 Daily', 'Single PDF'], ['📅 Weekly', '2–6 PDFs'], ['📆 Monthly', 'Up to 31 PDFs'], ['🗂 Quarterly', '32–92 PDFs']].map(([icon, label]) => (
                <div key={label} style={{ padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-2)' }}>
                  {icon} {label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Queue loading overlay */}
        {queueActive && (
          <div className="loading-overlay">
            <div className="spinner" />
            <div className="loading-text">Parsing {queueDone + 1} of {queueTotal}…</div>
            <div className="loading-sub" style={{ marginTop: 6 }}>
              {queue[queueDone]?.name || ''}
            </div>
            <div style={{ width: 200, background: 'var(--bg-card2)', borderRadius: 4, height: 4, marginTop: 14, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4, background: viewColor,
                width: `${queueTotal ? (queueDone / queueTotal) * 100 : 0}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
              {queueTotal - queueDone - 1 > 0 ? `${queueTotal - queueDone - 1} files remaining` : 'Almost done…'}
            </div>
          </div>
        )}

        {globalError && !queueActive && (
          <div className="alert alert-danger" style={{ marginTop: 24 }}>
            <div className="alert-dot" />{globalError}
          </div>
        )}

        {/* Dashboard */}
        {(report || activeTab === 'trends') && reports.length > 0 && !queueActive && (
          <>
            <div className="page-header">
              <div className="page-header-left">
                <h1>
                  <span style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    GRIDco.
                  </span>
                  &nbsp;Daily Operations Report
                </h1>
                <div className="page-header-meta" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {report && <><strong>{hdr.report_code}</strong> &nbsp;·&nbsp; {hdr.report_day}, {hdr.report_date}</>}
                  {activeTab === 'trends' && <span>Comparing <strong>{reports.length}</strong> reports</span>}
                  {/* View mode pill */}
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 9px',
                    borderRadius: 10, background: `${viewColor}22`, color: viewColor,
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>{viewLabel} View</span>
                </div>
              </div>
              {report && <div className="header-badge">✓ {found}/{statuses.length} sections</div>}
            </div>

            {/* Tabs */}
            <div className="tabs-bar">
              {TABS.map(t => (
                <button key={t.id}
                  className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(t.id)}>
                  {t.label}
                  {t.id === 'incidents' && stillOut > 0 && (
                    <span style={{ marginLeft: 5, background: 'var(--red)', color: 'white', borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                      {stillOut}
                    </span>
                  )}
                </button>
              ))}
              {reports.length >= 2 && (
                <button
                  className={`tab-btn ${activeTab === 'trends' ? 'active' : ''}`}
                  onClick={() => setActiveTab('trends')}
                  style={{ color: activeTab === 'trends' ? viewColor : viewColor + 'aa' }}>
                  📈 {viewLabel} Trends ({reports.length}d)
                </button>
              )}
            </div>

            {renderTab()}
          </>
        )}
      </main>
    </div>
  );
}