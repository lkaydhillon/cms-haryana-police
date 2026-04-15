import React, { useState, useEffect } from 'react';

const CATEGORY_CONFIG = {
    registration: { color: '#10b981', bg: '#ecfdf5', label: 'Registration', icon: '📝' },
    statement: { color: '#3b82f6', bg: '#eff6ff', label: 'Statement', icon: '💬' },
    evidence: { color: '#f59e0b', bg: '#fffbeb', label: 'Evidence', icon: '🔍' },
    arrest: { color: '#ef4444', bg: '#fef2f2', label: 'Arrest', icon: '🚨' },
    raid: { color: '#8b5cf6', bg: '#f5f3ff', label: 'Raid', icon: '🏚️' },
    challan: { color: '#6366f1', bg: '#eef2ff', label: 'Challan', icon: '⚖️' },
};

const DEFAULT = { color: '#64748b', bg: '#f8fafc', label: 'Event', icon: '📌' };

function formatDate(dt) {
    return new Date(dt).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatDay(dt) {
    return new Date(dt).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

export default function TimelineView({ caseId, headers }) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/analysis/cases/${caseId}/timeline`, { headers })
            .then(r => r.json())
            .then(data => { setEvents(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, [caseId]);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
            <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                Loading timeline...
            </div>
        </div>
    );

    if (events.length === 0) return (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
            No events recorded for this case yet.
        </div>
    );

    return (
        <div style={{ padding: '24px 32px' }}>
            <h3 style={{ margin: '0 0 24px', fontSize: '1rem', fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                📅 Case Timeline — {events.length} events
            </h3>

            <div style={{ position: 'relative' }}>
                {/* Vertical line */}
                <div style={{ position: 'absolute', left: 28, top: 0, bottom: 0, width: 2, background: 'linear-gradient(to bottom, #6366f1, #e2e8f0)' }} />

                {events.map((evt, idx) => {
                    const cfg = CATEGORY_CONFIG[evt.category] || DEFAULT;
                    return (
                        <div key={evt.id} style={{ display: 'flex', gap: 20, marginBottom: 24, position: 'relative' }}>
                            {/* Icon dot */}
                            <div style={{
                                width: 56, height: 56, minWidth: 56,
                                borderRadius: '50%',
                                background: cfg.bg,
                                border: `2px solid ${cfg.color}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 20, zIndex: 1,
                                boxShadow: `0 0 0 4px white`,
                            }}>
                                {cfg.icon}
                            </div>

                            {/* Content card */}
                            <div style={{
                                flex: 1,
                                background: '#fff',
                                border: `1px solid ${cfg.color}33`,
                                borderLeft: `4px solid ${cfg.color}`,
                                borderRadius: 10,
                                padding: '14px 16px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <span style={{
                                        padding: '2px 10px', borderRadius: 20,
                                        background: cfg.bg, color: cfg.color,
                                        fontSize: '0.7rem', fontWeight: 700,
                                        textTransform: 'uppercase', letterSpacing: '0.05em',
                                        border: `1px solid ${cfg.color}44`,
                                    }}>
                                        {cfg.label}
                                    </span>
                                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                                        {formatDate(evt.event_time)}
                                    </span>
                                </div>
                                <p style={{ margin: '4px 0 6px', fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.5 }}>
                                    {evt.description}
                                </p>
                                {(evt.officer_name || evt.location) && (
                                    <div style={{ display: 'flex', gap: 16, fontSize: '0.78rem', color: '#64748b' }}>
                                        {evt.officer_name && <span>👮 {evt.officer_name}</span>}
                                        {evt.location && <span>📍 {evt.location}</span>}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
