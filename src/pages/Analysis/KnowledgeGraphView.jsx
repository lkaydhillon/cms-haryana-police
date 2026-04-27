import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Spin, Empty, Slider, Tooltip } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleInfo, faXmark, faGear,
  faFileLines, faFilePdf, faFileContract, faLink,
  faCrosshairs, faFileShield,
  faUser, faUserTie, faUserCheck, faCalendarDays,
  faStar,
} from '@fortawesome/free-solid-svg-icons';

const FA = ({ icon, style }) => <FontAwesomeIcon icon={icon} style={{ flexShrink: 0, ...style }} />;

const NODES = {
  case:     { color: '#60a5fa', glow: 'rgba(96,165,250,0.4)',  label: 'Case',    icon: faFileShield },
  accused:  { color: '#f87171', glow: 'rgba(248,113,113,0.4)', label: 'Accused', icon: faUserTie },
  victim:   { color: '#4ade80', glow: 'rgba(74,222,128,0.4)',  label: 'Victim',  icon: faUser },
  witness:  { color: '#fbbf24', glow: 'rgba(251,191,36,0.4)',  label: 'Witness', icon: faUserCheck },
  event:    { color: '#c084fc', glow: 'rgba(192,132,252,0.4)', label: 'Event',   icon: faCalendarDays },
  evidence: { color: '#38bdf8', glow: 'rgba(56,189,248,0.4)',  label: 'Evidence',icon: faFileLines },
};

const DOC_REFS = {
  case:     { label: 'FIR / Complaint Copy',          icon: faFilePdf },
  accused:  { label: 'Accused Statement / Arrest Memo', icon: faFileContract },
  victim:   { label: 'Victim Statement',              icon: faFileContract },
  witness:  { label: 'Witness Statement',             icon: faFileContract },
  event:    { label: 'Case Diary / Evidence Log',     icon: faFileLines },
  evidence: { label: 'Seizure Memo / Lab Report',     icon: faFilePdf },
};

function SliderRow({ label, value, min, max, step, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700, fontFamily: 'monospace' }}>{value}</span>
      </div>
      <Slider min={min} max={max} step={step} value={value} onChange={onChange}
        tooltip={{ open: false }}
        styles={{ track: { backgroundColor: '#3b82f6' }, rail: { backgroundColor: '#1f2d3d' }, handle: { borderColor: '#3b82f6', backgroundColor: '#3b82f6' } }}
      />
    </div>
  );
}

const GRAPH_BG = '#0b0f18';

export default function KnowledgeGraphView({ caseId, caseData }) {
  const [graphData, setGraphData]       = useState(null);
  const [selected, setSelected]         = useState(null);
  const [loading, setLoading]           = useState(true);
  const [ForceGraph, setForceGraph]     = useState(null);
  const [showControls, setShowControls] = useState(false); // collapsed by default
  const [size, setSize]                 = useState({ w: 0, h: 0 });

  const [nodeSize,      setNodeSize]      = useState(6);
  const [linkDistance,  setLinkDistance]  = useState(180);
  const [linkThickness, setLinkThickness] = useState(1.2);
  const [centerForce,   setCenterForce]   = useState(0.05);
  const [repelForce,    setRepelForce]    = useState(350);

  const graphRef    = useRef(null);
  const wrapperRef  = useRef(null);
  const hasCentered = useRef(false);

  // Load ForceGraph2D lazily
  useEffect(() => {
    import('react-force-graph-2d').then(m => setForceGraph(() => m.default));
  }, []);

  // Measure full wrapper size — single source of truth for canvas dimensions
  useEffect(() => {
    if (!wrapperRef.current) return;
    const measure = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const { offsetWidth: w, offsetHeight: h } = el;
      console.log('[KnowledgeGraphView] Container dimensions:', w, h);
      if (w > 0 && h > 0) {
        setSize({ w, h });
      } else {
        // Fallback: use default dimensions if measurement returns 0
        setTimeout(() => setSize({ w: 800, h: 600 }), 100);
      }
    };
    measure();
    // Try measuring after a short delay as backup
    setTimeout(measure, 200);
    const ro = new ResizeObserver(measure);
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch graph data
  useEffect(() => {
    if (!caseId) {
      setGraphData({ nodes: [], links: [] });
      setLoading(false);
      return;
    }
    setLoading(true); setSelected(null); hasCentered.current = false;
    
    // Get fresh headers to avoid stale closure
    const currentToken = localStorage.getItem('token');
    const authHeaders = { Authorization: `Bearer ${currentToken}` };
    console.log('[KnowledgeGraphView] Fetching graph. caseId:', caseId, 'hasToken:', !!currentToken);
    
    fetch(`/api/analysis/cases/${caseId}/graph`, { headers: authHeaders })
      .then(r => {
        if (!r.ok) {
          console.error('[KnowledgeGraphView] Graph API error:', r.status, r.statusText);
          return { nodes: [], links: [] };
        }
        return r.json();
      })
      .then(d => {
        console.log('[KnowledgeGraphView] Graph data loaded:', d?.nodes?.length || 0, 'nodes,', d?.links?.length || 0, 'links');
        setGraphData(d || { nodes: [], links: [] });
        setLoading(false);
      })
      .catch(err => {
        console.error('[KnowledgeGraphView] Graph fetch error:', err);
        setGraphData({ nodes: [], links: [] });
        setLoading(false);
      });
  }, [caseId]);

  // Apply forces when sliders change
  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current.d3Force('charge')?.strength(-repelForce);
    graphRef.current.d3Force('link')?.distance(linkDistance);
    graphRef.current.d3Force('center')?.strength(centerForce);
    graphRef.current.d3ReheatSimulation();
  }, [repelForce, linkDistance, centerForce]);

  // Auto-center once simulation stabilises
  const handleEngineStop = useCallback(() => {
    if (!hasCentered.current && graphRef.current) {
      setTimeout(() => {
        graphRef.current?.zoomToFit(800, 50);
        hasCentered.current = true;
      }, 100);
    }
  }, []);

  const handleNodeClick = useCallback((node) => {
    setSelected(node);
    graphRef.current?.centerAt(node.x, node.y, 800);
    graphRef.current?.zoom(2.5, 800);
  }, []);

  // Canvas node painter
  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    const cfg = NODES[node.type] || NODES.event;
    const r   = (node.val || 5) * (nodeSize / 5);

    // Selection glow ring
    if (selected?.id === node.id) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 6 / globalScale, 0, 2 * Math.PI);
      ctx.fillStyle = cfg.glow;
      ctx.fill();
    }

    // Node body
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = cfg.color;
    ctx.fill();

    // Specular highlight
    ctx.beginPath();
    ctx.arc(node.x, node.y - r * 0.28, r * 0.38, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fill();

    // Label (only when zoomed enough)
    if (globalScale > 0.4) {
      const label = node.label?.length > 18 ? node.label.slice(0, 18) + '…' : (node.label || '');
      const fontSize = Math.max(12 / globalScale, 2.5);
      ctx.font = `600 ${fontSize}px Inter,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 3.5 / globalScale;
      ctx.strokeStyle = GRAPH_BG;
      ctx.strokeText(label, node.x, node.y + r + 2 / globalScale);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(label, node.x, node.y + r + 2 / globalScale);
    }
  }, [nodeSize, selected]);

  const getLinkColor = useCallback((link) => {
    const src = typeof link.source === 'object' ? link.source.type : '';
    return src === 'case' ? 'rgba(96,165,250,0.5)' : 'rgba(100,116,139,0.25)';
  }, []);

  const getArrowLength = useCallback((link) => {
    const src = typeof link.source === 'object' ? link.source.type : '';
    return (link.directed || src === 'case') ? 5 : 0;
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading || !ForceGraph) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 520, background: GRAPH_BG }}>
      <Spin size="large" />
      <div style={{ marginTop: 16, color: '#4a6272', fontSize: 13 }}>Building knowledge graph…</div>
    </div>
  );

  if (!graphData?.nodes?.length) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 520, background: GRAPH_BG }}>
      <Empty description={<span style={{ color: '#4a6272' }}>No graph data. Upload documents to generate relationships.</span>} />
    </div>
  );

// Use measured size, fallback to window dimensions if needed
  const graphWidth = size.w > 0 ? size.w : window.innerWidth - 48;
  const graphHeight = size.h > 0 ? size.h : window.innerHeight - 200;

  return (
    <div
      ref={wrapperRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden', background: GRAPH_BG }}
    >
      {/* ── ForceGraph — fills entire wrapper ──────────────────────────── */}
      <ForceGraph
        ref={graphRef}
        width={graphWidth}
        height={graphHeight}
        graphData={graphData}
          graphData={graphData}
          backgroundColor={GRAPH_BG}
          nodeLabel={() => ''}  // we paint custom tooltips via canvas
          nodeVal={node => (node.val || 5) * (nodeSize / 5)}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => 'replace'}
          linkWidth={linkThickness}
          linkColor={getLinkColor}
          linkDirectionalArrowLength={getArrowLength}
          linkDirectionalArrowRelPos={1}
          linkDirectionalArrowColor={link => {
            const src = typeof link.source === 'object' ? link.source.type : '';
            return src === 'case' ? '#60a5fa' : '#475569';
          }}
          linkLabel={link => link.label || ''}
          onEngineStop={handleEngineStop}
          onNodeClick={handleNodeClick}
          onBackgroundClick={() => setSelected(null)}
        />

      {/* ── Floating toolbar (top-left) ───────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>

        {/* Toggle controls button */}
        <Tooltip title={showControls ? 'Hide controls' : 'Graph controls'} placement="right">
          <button
            onClick={() => setShowControls(p => !p)}
            style={{
              width: 34, height: 34, borderRadius: 8,
              border: `1px solid ${showControls ? '#3b82f6' : '#1f2d3d'}`,
              background: showControls ? 'rgba(59,130,246,0.25)' : 'rgba(13,21,32,0.85)',
              color: showControls ? '#60a5fa' : '#64748b',
              cursor: 'pointer', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.15s',
            }}
          >
            <FA icon={faGear} />
          </button>
        </Tooltip>

        {/* Re-center button */}
        <Tooltip title="Fit all nodes to view" placement="right">
          <button
            onClick={() => graphRef.current?.zoomToFit(400, 60)}
            style={{
              width: 34, height: 34, borderRadius: 8,
              border: '1px solid #1f2d3d',
              background: 'rgba(13,21,32,0.85)',
              color: '#64748b', cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.15s',
            }}
          >
            <FA icon={faCrosshairs} />
          </button>
        </Tooltip>
      </div>

      {/* ── Floating controls + legend panel ─────────────────────────────── */}
      {showControls && (
        <div style={{
          position: 'absolute', top: 12, left: 54, zIndex: 19,
          width: 200, maxHeight: 'calc(100% - 24px)',
          borderRadius: 10, border: '1px solid #1f2d3d',
          background: 'rgba(11,15,24,0.92)', backdropFilter: 'blur(14px)',
          padding: '12px 14px', overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          animation: 'kgFadeIn 0.18s ease',
        }}>
          {/* Legend */}
          <div style={{ fontSize: 9, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 8 }}>Legend</div>
          {Object.entries(NODES).map(([type, cfg]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0, boxShadow: `0 0 6px ${cfg.glow}` }} />
              <FA icon={cfg.icon} style={{ color: cfg.color, fontSize: 10 }} />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{cfg.label}</span>
            </div>
          ))}

          <div style={{ height: 1, background: '#1e293b', margin: '10px 0' }} />

          {/* Display */}
          <div style={{ fontSize: 9, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 8 }}>Display</div>
          <SliderRow label="Node size"      value={nodeSize}      min={2}   max={14}  step={1}   onChange={setNodeSize} />
          <SliderRow label="Link thickness" value={linkThickness} min={0.5} max={5}   step={0.5} onChange={setLinkThickness} />
          <SliderRow label="Link distance"  value={linkDistance}  min={30}  max={300} step={10}  onChange={setLinkDistance} />

          <div style={{ height: 1, background: '#1e293b', margin: '10px 0' }} />

          {/* Forces */}
          <div style={{ fontSize: 9, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 8 }}>Forces</div>
          <SliderRow label="Center force" value={centerForce} min={0}  max={1}   step={0.05} onChange={setCenterForce} />
          <SliderRow label="Repel force"  value={repelForce}  min={30} max={600} step={10}   onChange={setRepelForce} />
        </div>
      )}

      {/* ── Case chip (top-right of canvas) ──────────────────────────────── */}
      {caseData && (
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 18,
          background: 'rgba(11,15,24,0.85)', border: '1px solid #1f2d3d',
          borderRadius: 8, padding: '5px 12px',
          fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(8px)',
        }}>
          <FA icon={faFileShield} style={{ color: '#60a5fa', fontSize: 12 }} />
          <strong style={{ color: '#f1f5f9' }}>{caseData.title?.slice(0, 35)}</strong>
          <span style={{ color: '#38bdf8', fontWeight: 700 }}>{caseData.case_type?.toUpperCase()}</span>
        </div>
      )}

      {/* ── Floating node detail panel (bottom-right) ─────────────────────── */}
      {selected && (
        <div style={{
          position: 'absolute', bottom: 14, right: 14, zIndex: 20,
          width: 280, maxHeight: 'calc(100% - 80px)',
          borderRadius: 12,
          border: `1px solid ${NODES[selected.type]?.color || '#3b82f6'}44`,
          background: 'rgba(11,15,24,0.96)', backdropFilter: 'blur(14px)',
          boxShadow: `0 12px 40px rgba(0,0,0,0.8), 0 0 0 1px ${NODES[selected.type]?.color || '#3b82f6'}22`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'kgSlideUp 0.2s ease',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', flexShrink: 0,
            borderBottom: `1px solid ${NODES[selected.type]?.color || '#3b82f6'}33`,
            background: `${NODES[selected.type]?.color || '#3b82f6'}0d`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 800,
                background: `${NODES[selected.type]?.color}20`,
                border: `1px solid ${NODES[selected.type]?.color}50`,
                color: NODES[selected.type]?.color || '#60a5fa',
                display: 'flex', alignItems: 'center', gap: 5,
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                <FA icon={NODES[selected.type]?.icon || faStar} style={{ fontSize: 10 }} />
                {NODES[selected.type]?.label || selected.type}
              </span>
            </div>
            <button
              onClick={() => setSelected(null)}
              style={{
                background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: 6, cursor: 'pointer', color: '#f87171',
                fontSize: 12, padding: '3px 8px',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <FA icon={faXmark} /> Close
            </button>
          </div>

          {/* Body */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '14px' }}>
            <h4 style={{ margin: '0 0 12px', color: '#f1f5f9', fontSize: 14, fontWeight: 700, lineHeight: 1.4 }}>
              {selected.label}
            </h4>

            {selected.content && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 5 }}>Description</div>
                <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.7, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, padding: '8px 10px' }}>
                  {selected.content}
                </div>
              </div>
            )}

            {selected.details && Object.keys(selected.details).filter(k => selected.details[k]).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 7 }}>Details</div>
                {Object.entries(selected.details).map(([k, v]) => v ? (
                  <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 5, fontSize: 11 }}>
                    <span style={{ color: '#475569', minWidth: 70, flexShrink: 0, textTransform: 'capitalize' }}>{k}:</span>
                    <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{v}</span>
                  </div>
                ) : null)}
              </div>
            )}

            {selected.sourceRefs?.length > 0 && (
              <>
                <div style={{ height: 1, background: '#1e293b', margin: '10px 0' }} />
                <div style={{ fontSize: 9, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 7 }}>Source References</div>
                {selected.sourceRefs.map((ref, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 9px', marginBottom: 5, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6 }}>
                    <FA icon={faLink} style={{ color: '#3b82f6', marginTop: 2, flexShrink: 0, fontSize: 10 }} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#60a5fa' }}>{ref.docType}</div>
                      {ref.date && <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{ref.date}</div>}
                    </div>
                  </div>
                ))}
              </>
            )}

            {DOC_REFS[selected.type] && (
              <>
                <div style={{ height: 1, background: '#1e293b', margin: '10px 0' }} />
                <div style={{
                  padding: '8px 10px', borderRadius: 6,
                  background: `${NODES[selected.type]?.color}08`,
                  borderLeft: `3px solid ${NODES[selected.type]?.color}`,
                  border: `1px solid ${NODES[selected.type]?.color}25`,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 4 }}>Verify via</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
                    <FA icon={DOC_REFS[selected.type].icon} style={{ color: NODES[selected.type]?.color, fontSize: 11 }} />
                    {DOC_REFS[selected.type].label}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes kgSlideUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes kgFadeIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
