import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

function formatTime(dt) {
    return new Date(dt).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
}

function formatDuration(sec) {
    if (!sec) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const COLORS = ['#ef4444', '#f59e0b', '#6366f1', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

export default function CDRAnalysisView({ caseId, headers }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        setLoading(true);
        fetch(`/api/analysis/cases/${caseId}/cdr`, { headers })
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, [caseId]);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, color: '#94a3b8', flexDirection: 'column', gap: 12 }}>
            <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            Loading CDR records...
        </div>
    );

    if (!data || data.records?.length === 0) return (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
            No CDR records for this case. Upload CDR data via the Ingest tab.
        </div>
    );

    const filtered = data.records.filter(r =>
        !search ||
        r.caller.includes(search) ||
        r.receiver.includes(search) ||
        r.tower_location?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                📞 CDR Analysis — {data.records.length} records
            </h3>

            {/* Call Frequency Chart */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20, marginBottom: 24 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    📊 Call Frequency per Number (Top 10)
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 16 }}>
                    Higher bars indicate more frequent communication — key indicator of network relationships
                </div>
                <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.frequency} margin={{ top: 5, right: 10, bottom: 40, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                            dataKey="number"
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            angle={-35}
                            textAnchor="end"
                            interval={0}
                        />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                        <Tooltip
                            formatter={(val) => [val, 'Total Calls']}
                            labelFormatter={(label) => `Number: ${label}`}
                            contentStyle={{ fontSize: '0.8rem', borderRadius: 8 }}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {data.frequency.map((_, i) => (
                                <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
                {[
                    { label: 'Total Calls', value: data.records.length, icon: '📞' },
                    { label: 'Unique Numbers', value: new Set([...data.records.map(r => r.caller), ...data.records.map(r => r.receiver)]).size, icon: '📱' },
                    { label: 'Towers', value: new Set(data.records.map(r => r.tower_id).filter(Boolean)).size, icon: '📡' },
                    { label: 'Avg Duration', value: Math.round(data.records.reduce((s, r) => s + (r.duration_sec || 0), 0) / data.records.length) + 's', icon: '⏱️' },
                ].map(stat => (
                    <div key={stat.label} style={{
                        background: '#fff', border: '1px solid #e2e8f0',
                        borderRadius: 10, padding: '12px 16px', textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{stat.icon}</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e293b' }}>{stat.value}</div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* CDR Table */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#475569' }}>Call Records</span>
                    <input
                        type="text"
                        placeholder="Search number or tower..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            flex: 1, maxWidth: 280, padding: '6px 12px',
                            border: '1.5px solid #e2e8f0', borderRadius: 7,
                            fontSize: '0.8rem', outline: 'none',
                        }}
                    />
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{filtered.length} shown</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['#', 'Caller', 'Receiver', 'Duration', 'Date & Time', 'Tower', 'Location'].map(h => (
                                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r, i) => (
                                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 ? '#fafafa' : '#fff' }}>
                                    <td style={{ padding: '9px 12px', color: '#94a3b8' }}>{i + 1}</td>
                                    <td style={{ padding: '9px 12px', fontWeight: 600, color: '#ef4444', fontFamily: 'monospace' }}>{r.caller}</td>
                                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: '#1e293b' }}>{r.receiver}</td>
                                    <td style={{ padding: '9px 12px', color: '#475569' }}>{formatDuration(r.duration_sec)}</td>
                                    <td style={{ padding: '9px 12px', color: '#475569', whiteSpace: 'nowrap' }}>{formatTime(r.call_time)}</td>
                                    <td style={{ padding: '9px 12px', color: '#64748b', fontFamily: 'monospace', fontSize: '0.75rem' }}>{r.tower_id || '—'}</td>
                                    <td style={{ padding: '9px 12px', color: '#64748b' }}>{r.tower_location || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
