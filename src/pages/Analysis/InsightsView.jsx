import React, { useState, useEffect } from 'react';

const PAGE_ICONS = {
    index: '📋',
    entities: '👥',
    timeline: '📅',
    leads: '🔍',
    contradictions: '⚠️',
    log: '📜',
};

const PAGE_ORDER = ['index', 'entities', 'leads', 'contradictions', 'timeline', 'log'];

function sortPages(pages) {
    return [...pages].sort((a, b) => {
        const ai = PAGE_ORDER.indexOf(a.page_slug);
        const bi = PAGE_ORDER.indexOf(b.page_slug);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
    });
}

function MarkdownRenderer({ content }) {
    // Very simple markdown → React (headings, bold, bullets, tables, code)
    const lines = content.split('\n');
    const elements = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith('## ')) {
            elements.push(
                <h4 key={i} style={{ margin: '16px 0 6px', fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: 4 }}>
                    {renderInline(line.slice(3))}
                </h4>
            );
        } else if (line.startsWith('# ')) {
            elements.push(
                <h3 key={i} style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                    {renderInline(line.slice(2))}
                </h3>
            );
        } else if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
            const checked = line.startsWith('- [x]');
            elements.push(
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                    <span style={{ marginTop: 2, fontSize: '1rem' }}>{checked ? '✅' : '⬜'}</span>
                    <span style={{ fontSize: '0.85rem', color: checked ? '#64748b' : '#1e293b', textDecoration: checked ? 'line-through' : 'none' }}>
                        {renderInline(line.slice(6))}
                    </span>
                </div>
            );
        } else if (line.startsWith('- ')) {
            elements.push(
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                    <span style={{ color: '#6366f1', marginTop: 1 }}>•</span>
                    <span style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>{renderInline(line.slice(2))}</span>
                </div>
            );
        } else if (line.startsWith('|')) {
            // Table
            elements.push(
                <div key={i} style={{ overflowX: 'auto', marginBottom: 12 }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%' }}>
                        <tbody>
                            {lines.slice(i).filter((l, li) => l.startsWith('|') && li === 0 || (l.startsWith('|') && !l.match(/^\|[-| ]+\|$/))).slice(0, 20).map((row, ri) => (
                                <tr key={ri} style={{ background: ri === 0 ? '#f8fafc' : ri % 2 ? '#fafafa' : '#fff' }}>
                                    {row.split('|').filter((_, ci) => ci > 0 && ci < row.split('|').length - 1).map((cell, ci) => (
                                        <td key={ci} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', fontWeight: ri === 0 ? 600 : 400, color: '#475569' }}>
                                            {renderInline(cell.trim())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            // Skip table rows
            while (i < lines.length && lines[i].startsWith('|')) i++;
            continue;
        } else if (line.trim() === '') {
            // Skip empty
        } else {
            elements.push(
                <p key={i} style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#475569', lineHeight: 1.6 }}>
                    {renderInline(line)}
                </p>
            );
        }
        i++;
    }

    return <div>{elements}</div>;
}

function renderInline(text) {
    // Bold + links
    const parts = text.split(/(\*\*[^*]+\*\*|\[.*?\]\(.*?\)|⚠️|✅|⬜)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} style={{ color: '#1e293b' }}>{part.slice(2, -2)}</strong>;
        }
        if (part.match(/^\[.*?\]\(.*?\)$/)) {
            const label = part.match(/\[(.*?)\]/)[1];
            return <span key={i} style={{ color: '#6366f1', fontWeight: 600 }}>{label}</span>;
        }
        return part;
    });
}

export default function InsightsView({ caseId, headers }) {
    const [wikiData, setWikiData] = useState(null);
    const [activePage, setActivePage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [queryResult, setQueryResult] = useState(null);
    const [querying, setQuerying] = useState(false);
    const [ingestText, setIngestText] = useState('');
    const [ingestType, setIngestType] = useState('FIR');
    const [ingesting, setIngesting] = useState(false);
    const [ingestResult, setIngestResult] = useState(null);
    const [showIngest, setShowIngest] = useState(false);

    const fetchWiki = () => {
        setLoading(true);
        fetch(`/api/analysis/cases/${caseId}/wiki`, { headers })
            .then(r => r.json())
            .then(data => {
                setWikiData(data);
                const sorted = sortPages(data.pages || []);
                setActivePage(sorted[0]?.page_slug || null);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        fetchWiki();
        setQueryResult(null);
        setIngestResult(null);
    }, [caseId]);

    const handleQuery = async () => {
        if (!query.trim()) return;
        setQuerying(true);
        setQueryResult(null);
        try {
            const res = await fetch(`/api/analysis/cases/${caseId}/query`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: query }),
            });
            const data = await res.json();
            setQueryResult(data);
        } catch {
            setQueryResult({ answer: 'Query failed. Please try again.', sourcedFrom: [] });
        }
        setQuerying(false);
    };

    const handleIngest = async () => {
        if (!ingestText.trim()) return;
        setIngesting(true);
        setIngestResult(null);
        try {
            const res = await fetch(`/api/analysis/cases/${caseId}/ingest`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ doc_type: ingestType, content: ingestText }),
            });
            const data = await res.json();
            setIngestResult(data);
            fetchWiki(); // Refresh wiki
        } catch {
            setIngestResult({ success: false });
        }
        setIngesting(false);
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, color: '#94a3b8', flexDirection: 'column', gap: 12 }}>
            <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            Loading case intelligence wiki...
        </div>
    );

    const pages = sortPages(wikiData?.pages || []);
    const lint = wikiData?.lint;
    const currentPageContent = pages.find(p => p.page_slug === activePage)?.content_md || '';

    return (
        <div style={{ display: 'flex', height: 600, overflow: 'hidden' }}>

            {/* Left: Wiki Navigation */}
            <div style={{ width: 200, background: '#f8fafc', borderRight: '1px solid #e2e8f0', padding: '16px 0', overflowY: 'auto', flexShrink: 0 }}>
                <div style={{ padding: '0 14px 10px', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    🧠 Wiki Pages
                </div>
                {pages.map(p => (
                    <button
                        key={p.page_slug}
                        onClick={() => setActivePage(p.page_slug)}
                        style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '9px 14px', border: 'none', cursor: 'pointer',
                            background: activePage === p.page_slug ? '#fff' : 'transparent',
                            borderRight: activePage === p.page_slug ? '3px solid #6366f1' : '3px solid transparent',
                            color: activePage === p.page_slug ? '#4f46e5' : '#475569',
                            fontWeight: activePage === p.page_slug ? 700 : 400,
                            fontSize: '0.82rem',
                            transition: 'all 0.15s',
                        }}
                    >
                        {PAGE_ICONS[p.page_slug] || '📄'} {p.page_slug}
                    </button>
                ))}
                {pages.length === 0 && (
                    <div style={{ padding: '12px 14px', fontSize: '0.78rem', color: '#94a3b8' }}>
                        No wiki pages yet.<br />Ingest a document to start building the knowledge base.
                    </div>
                )}

                {/* Lint / Health check */}
                {lint && lint.missingPages?.length > 0 && (
                    <div style={{ margin: '16px 10px 0', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', fontSize: '0.75rem', color: '#92400e' }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Health Check</div>
                        {lint.suggestions.map((s, i) => <div key={i} style={{ marginBottom: 2 }}>• {s}</div>)}
                    </div>
                )}
            </div>

            {/* Centre: Wiki Page Viewer */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {/* Karpathy attribution banner */}
                <div style={{
                    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                    padding: '10px 20px',
                    display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
                }}>
                    <span style={{ fontSize: '1rem' }}>🧬</span>
                    <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)', letterSpacing: '0.05em' }}>
                            LLM WIKI — Karpathy Docs-to-Knowledge-Graph Pattern
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)' }}>
                            Knowledge compiled once & kept current · Not re-derived on every query
                        </div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 20, fontSize: '0.68rem', color: '#fff' }}>
                            {pages.length} wiki pages
                        </span>
                    </div>
                </div>

                {/* Wiki page content */}
                <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
                    {currentPageContent
                        ? <MarkdownRenderer content={currentPageContent} />
                        : <div style={{ color: '#94a3b8', textAlign: 'center', paddingTop: 40 }}>Select a wiki page</div>
                    }
                </div>

                {/* AI Query Bar */}
                <div style={{ borderTop: '1px solid #e2e8f0', padding: '14px 20px', flexShrink: 0, background: '#fff' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        🔮 Query the Wiki
                    </div>
                    {queryResult && (
                        <div style={{
                            background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
                            padding: '12px 14px', marginBottom: 12, fontSize: '0.83rem', color: '#14532d',
                            lineHeight: 1.6,
                        }}>
                            <div style={{ fontWeight: 700, marginBottom: 6, color: '#166534' }}>
                                AI Response <span style={{ fontWeight: 400, color: '#4ade80', fontSize: '0.72rem' }}>
                                    (from {queryResult.wikiPagesConsulted} wiki pages)
                                </span>
                            </div>
                            {queryResult.answer}
                            {queryResult.sourcedFrom?.length > 0 && (
                                <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#86efac' }}>
                                    Sources: {queryResult.sourcedFrom.map(s => `[${s}]`).join(' ')}
                                </div>
                            )}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="text"
                            placeholder='e.g. "Who are the key suspects?" or "Any contradictions in statements?"'
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleQuery()}
                            style={{
                                flex: 1, padding: '9px 14px', border: '1.5px solid #e2e8f0',
                                borderRadius: 8, fontSize: '0.85rem', outline: 'none',
                            }}
                        />
                        <button
                            onClick={handleQuery}
                            disabled={querying || !query.trim()}
                            style={{
                                padding: '9px 20px', background: querying ? '#e2e8f0' : '#6366f1',
                                color: '#fff', border: 'none', borderRadius: 8,
                                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                                transition: 'background 0.2s',
                            }}
                        >
                            {querying ? '...' : 'Ask AI'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Right: Ingest Panel */}
            <div style={{ width: 280, borderLeft: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                        📥 Ingest Document
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5 }}>
                        Paste document text. The wiki engine will extract entities, events, and update knowledge pages automatically.
                    </div>
                </div>

                <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                            Document Type
                        </label>
                        <select
                            value={ingestType}
                            onChange={e => setIngestType(e.target.value)}
                            style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: '0.82rem', outline: 'none' }}
                        >
                            {['FIR', 'Complaint', 'Witness Statement', 'Accused Statement', 'Seizure Memo', 'Arrest Memo', 'CDR Report', 'Forensic Report', 'Court Order'].map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                            Document Text
                        </label>
                        <textarea
                            value={ingestText}
                            onChange={e => setIngestText(e.target.value)}
                            placeholder="Paste the full text of the document here..."
                            style={{
                                flex: 1, minHeight: 160,
                                padding: '8px 10px', border: '1.5px solid #e2e8f0',
                                borderRadius: 7, fontSize: '0.8rem', resize: 'vertical',
                                outline: 'none', lineHeight: 1.5, color: '#1e293b',
                            }}
                        />
                    </div>

                    {ingestResult && (
                        <div style={{
                            background: ingestResult.success ? '#f0fdf4' : '#fef2f2',
                            border: `1px solid ${ingestResult.success ? '#86efac' : '#fca5a5'}`,
                            borderRadius: 8, padding: '10px 12px', fontSize: '0.78rem',
                            color: ingestResult.success ? '#166534' : '#991b1b',
                        }}>
                            {ingestResult.success ? (
                                <>
                                    ✅ Ingested successfully<br />
                                    <span style={{ color: '#4ade80' }}>
                                        {ingestResult.extracted?.entities?.length || 0} entities · {ingestResult.extracted?.events?.length || 0} events · {ingestResult.extracted?.contradictions?.length || 0} contradictions
                                    </span>
                                </>
                            ) : '❌ Ingest failed. Try again.'}
                        </div>
                    )}

                    <button
                        onClick={handleIngest}
                        disabled={ingesting || !ingestText.trim()}
                        style={{
                            padding: '10px', background: ingesting ? '#e2e8f0' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                            color: '#fff', border: 'none', borderRadius: 8,
                            fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                            transition: 'opacity 0.2s',
                        }}
                    >
                        {ingesting ? '⏳ Processing...' : '📥 Ingest & Update Wiki'}
                    </button>
                </div>
            </div>
        </div>
    );
}
