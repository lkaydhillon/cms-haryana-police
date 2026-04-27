import React, { useState, useEffect } from 'react';
import { Timeline, Spin, Typography, Card, Space, Empty, Tag, Drawer, Button, Divider, Alert, List, Badge } from 'antd';
import {
    FileTextOutlined, CommentOutlined, SearchOutlined, AlertOutlined,
    HomeOutlined, SafetyOutlined, PushpinOutlined, CalendarOutlined,
    EyeOutlined, FileDoneOutlined, CameraOutlined, AuditOutlined,
    FileExclamationOutlined, LinkOutlined, PaperClipOutlined,
    DownloadOutlined, FilePdfOutlined, FileWordOutlined, FileExcelOutlined,
    FileUnknownOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

// ── Category configuration ────────────────────────────────────────────────────
const CATEGORY_CONFIG = {
    registration: {
        color: 'green', icon: <FileTextOutlined style={{ fontSize: 16 }} />,
        docIcon: <FileDoneOutlined />, docLabel: 'FIR Copy / Complaint',
    },
    statement: {
        color: 'blue', icon: <CommentOutlined style={{ fontSize: 16 }} />,
        docIcon: <AuditOutlined />, docLabel: 'Statement',
    },
    evidence: {
        color: 'orange', icon: <SearchOutlined style={{ fontSize: 16 }} />,
        docIcon: <CameraOutlined />, docLabel: 'Evidence Record',
    },
    arrest: {
        color: 'red', icon: <AlertOutlined style={{ fontSize: 16 }} />,
        docIcon: <FileExclamationOutlined />, docLabel: 'Arrest Memo',
    },
    raid: {
        color: 'purple', icon: <HomeOutlined style={{ fontSize: 16 }} />,
        docIcon: <HomeOutlined />, docLabel: 'Raid Report',
    },
    challan: {
        color: 'magenta', icon: <SafetyOutlined style={{ fontSize: 16 }} />,
        docIcon: <FileDoneOutlined />, docLabel: 'Challan Documents',
    },
    document_upload: {
        color: 'cyan', icon: <PaperClipOutlined style={{ fontSize: 16 }} />,
        docIcon: <FileTextOutlined />, docLabel: 'Original File',
    },
};

const DEFAULT_CONFIG = {
    color: 'gray', icon: <PushpinOutlined style={{ fontSize: 16 }} />,
    docIcon: <FileTextOutlined />, docLabel: 'Related Document',
};

const COLOR_MAP = {
    green: '#52c41a', blue: '#1890ff', red: '#ff4d4f',
    orange: '#fa8c16', purple: '#722ed1', magenta: '#eb2f96',
    cyan: '#13c2c2', gray: '#8c8c8c',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(dt) {
    return new Date(dt).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatFileSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileName) {
    if (!fileName) return <FileUnknownOutlined />;
    const ext = fileName.split('.').pop().toLowerCase();
    if (ext === 'pdf') return <FilePdfOutlined style={{ color: '#e74c3c' }} />;
    if (['doc', 'docx'].includes(ext)) return <FileWordOutlined style={{ color: '#2b579a' }} />;
    if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileExcelOutlined style={{ color: '#217346' }} />;
    return <FileUnknownOutlined />;
}

// ── Real Document Drawer ───────────────────────────────────────────────────────
// Fetches actual file content from API — PDFs render in iframe, text in viewer
function DocumentDrawer({ open, event, documents, headers, caseId, onClose }) {
    const [fullDoc, setFullDoc] = useState(null);
    const [loadingDoc, setLoadingDoc] = useState(false);
    const [docError, setDocError] = useState(null);

    useEffect(() => {
        if (!open || !event) { setFullDoc(null); setDocError(null); return; }

        let docId = null;

        if (event.record_type === 'document_upload' && event.document?.id) {
            // Direct link: document_upload events carry the document id
            docId = event.document.id;
        } else if (documents?.length > 0) {
            // AI-extracted event: find the uploaded doc whose timestamp is closest to this event
            const sorted = [...documents].sort((a, b) =>
                Math.abs(new Date(a.uploaded_at) - new Date(event.event_time)) -
                Math.abs(new Date(b.uploaded_at) - new Date(event.event_time))
            );
            docId = sorted[0]?.id;
        }

        if (!docId || !caseId) {
            setDocError('No source document linked to this event.');
            return;
        }

        setLoadingDoc(true);
        setDocError(null);
        setFullDoc(null);

        fetch(`/api/analysis/cases/${caseId}/documents/${docId}`, { headers })
            .then(r => { if (!r.ok) throw new Error('Document not found (404)'); return r.json(); })
            .then(d => { setFullDoc(d); setLoadingDoc(false); })
            .catch(e => { setDocError(e.message); setLoadingDoc(false); });
    }, [open, event?.id, caseId]);

    if (!event) return null;

    const cfg = CATEGORY_CONFIG[event.category] || DEFAULT_CONFIG;
    const isPDF = fullDoc?.mime_type === 'application/pdf' ||
        fullDoc?.file_name?.toLowerCase().endsWith('.pdf');

    return (
        <Drawer
            open={open}
            onClose={onClose}
            width={780}
            zIndex={2000}
            styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' } }}
            title={
                <Space>
                    <span style={{ color: COLOR_MAP[cfg.color] }}>{cfg.docIcon}</span>
                    <span>{fullDoc?.doc_type || fullDoc?.file_name || cfg.docLabel}</span>
                    {fullDoc && (
                        <Tag color="success" style={{ margin: 0 }}>
                            <LinkOutlined /> Verified Source
                        </Tag>
                    )}
                </Space>
            }
            extra={
                <Space>
                    {fullDoc?.file_path && (
                        <a href={fullDoc.file_path} target="_blank" rel="noopener noreferrer"
                            download={fullDoc.file_name}>
                            <Button icon={<DownloadOutlined />} size="small">Download</Button>
                        </a>
                    )}
                    <Button onClick={onClose} size="small">Close</Button>
                </Space>
            }
        >
            {/* ── Event meta bar ── */}
            <div style={{
                padding: '10px 20px', borderBottom: '1px solid var(--border)',
                background: 'var(--code-bg)', flexShrink: 0,
            }}>
                <Tag color={cfg.color} style={{ textTransform: 'uppercase', marginBottom: 6 }}>
                    {event.category}
                </Tag>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                    <span><CalendarOutlined /> {formatDate(event.event_time)}</span>
                    {event.location && <span><HomeOutlined /> {event.location}</span>}
                    {event.officer_name && <span><SafetyOutlined /> {event.officer_name}</span>}
                </div>
                {event.description && (
                    <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                        {event.description}
                    </div>
                )}
            </div>

            {/* ── Document viewer ── */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {loadingDoc ? (
                    <div style={{ textAlign: 'center', padding: '80px 0' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 14, color: 'var(--text-dim)', fontSize: 13 }}>
                            Loading original document...
                        </div>
                    </div>
                ) : docError ? (
                    <div style={{ padding: 24 }}>
                        <Alert type="warning" showIcon message="Document Not Found"
                            description={docError} />
                    </div>
                ) : isPDF && fullDoc?.file_path ? (
                    <iframe
                        src={fullDoc.file_path}
                        style={{ width: '100%', flex: 1, border: 'none', minHeight: '72vh' }}
                        title={fullDoc.file_name}
                    />
                ) : fullDoc?.content_text ? (
                    <div style={{
                        flex: 1, overflowY: 'auto',
                        padding: '28px 32px',
                        background: '#fcfcf9',
                        fontFamily: "'Noto Sans Devanagari', 'Courier New', Courier, monospace",
                        fontSize: 14, lineHeight: 1.8,
                        whiteSpace: 'pre-wrap', color: '#1a1a1a',
                        wordBreak: 'break-word',
                    }}>
                        {fullDoc.content_text}
                    </div>
                ) : fullDoc?.file_path ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* For images, show inline */}
                        {fullDoc.mime_type?.startsWith('image/') ? (
                            <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#000', textAlign: 'center' }}>
                                <img src={fullDoc.file_path} alt={fullDoc.file_name} style={{ maxWidth: '100%', height: 'auto' }} />
                            </div>
                        ) : fullDoc.mime_type?.includes('word') || fullDoc.mime_type?.includes('document') ? (
                            <div style={{ padding: 24 }}>
                                <Alert type="info" showIcon message="Word Document"
                                    description="Word documents cannot be previewed inline. Please download to view." />
                            </div>
                        ) : fullDoc.mime_type?.includes('excel') || fullDoc.mime_type?.includes('sheet') ? (
                            <div style={{ padding: 24 }}>
                                <Alert type="info" showIcon message="Spreadsheet"
                                    description="Excel files cannot be previewed inline. Please download to view." />
                            </div>
                        ) : (
                            /* Default: show info with download option */
                            <div style={{ padding: 24 }}>
                                <Alert type="info" showIcon message="Preview Not Available"
                                    description="This file type cannot be previewed. Use Download button to view the file." />
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ padding: 24 }}>
                        <Alert type="warning" showIcon message="No File Attached"
                            description="No source file found for this document." />
                    </div>
                )}
            </div>

            {/* ── Footer metadata ── */}
            {fullDoc && (
                <div style={{
                    padding: '7px 20px', borderTop: '1px solid var(--border)',
                    background: 'var(--code-bg)', fontSize: 11, color: 'var(--text-dim)',
                    display: 'flex', gap: 20, flexWrap: 'wrap', flexShrink: 0,
                }}>
                    <span>📎 {fullDoc.file_name || '—'}</span>
                    <span>📏 {formatFileSize(fullDoc.file_size)}</span>
                    <span>📋 {fullDoc.doc_type}</span>
                    <span>🕐 {formatDate(fullDoc.uploaded_at)}</span>
                </div>
            )}
        </Drawer>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function TimelineView({ caseId, headers }) {
    const [events, setEvents] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [docsLoading, setDocsLoading] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    // For "View Original" from the documents list below the timeline
    const [docDrawerOpen, setDocDrawerOpen] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState(null);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/analysis/cases/${caseId}/timeline`, { headers })
            .then(r => r.json())
            .then(data => { setEvents(data); setLoading(false); })
            .catch(() => setLoading(false));

        setDocsLoading(true);
        fetch(`/api/analysis/cases/${caseId}/documents`, { headers })
            .then(r => r.json())
            .then(data => { setDocuments(data?.documents || data || []); setDocsLoading(false); })
            .catch(() => setDocsLoading(false));
    }, [caseId]);

    const handleEventClick = (evt) => {
        setSelectedEvent(evt);
        setDrawerOpen(true);
    };

    const handleViewOriginal = (doc) => {
        // Open immediately so user sees the drawer (PDF will render via file_path)
        setSelectedDoc(doc);
        setDocDrawerOpen(true);
        // Fetch the full document record which includes content_text for non-PDFs
        fetch(`/api/analysis/cases/${caseId}/documents/${doc.id}`, { headers })
            .then(r => r.json())
            .then(full => setSelectedDoc(full))
            .catch(() => {}); // silently fall back to the partial doc already set
    };

    if (loading) return (
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}><Text type="secondary">Loading timeline...</Text></div>
        </div>
    );

    if (events.length === 0) return (
        <div style={{ padding: '80px 0' }}>
            <Empty 
                description={
                    <div>
                        <div style={{ marginBottom: 8, fontWeight: 500 }}>No documents uploaded yet</div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                            Upload FIR, complaint, statements, evidence documents to build timeline.
                        </div>
                    </div>
                }
            />
        </div>
    );

    return (
        <div style={{ padding: '24px 32px' }}>
            {/* Header */}
            <div style={{ marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
                <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CalendarOutlined style={{ color: '#1890ff' }} />
                    Case Timeline
                    <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 14 }}>
                        ({events.filter(evt => evt.document?.file_path).length} files)
                    </Text>
                </Title>
                <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                    <EyeOutlined /> Click to view or download original file.
                </Text>
            </div>

            {/* Timeline - Show only original uploaded documents (ones with file_path) */}
            <div style={{ paddingLeft: 16 }}>
                <Timeline mode="left">
                    {events.filter(evt => evt.record_type === 'document_upload' && evt.document?.file_path).map((evt) => {
                        const cfg = CATEGORY_CONFIG[evt.category] || DEFAULT_CONFIG;
                        return (
                            <Timeline.Item
                                key={evt.id}
                                color={cfg.color}
                                dot={cfg.icon}
                                label={<Text strong>{formatDate(evt.event_time)}</Text>}
                            >
                                <Card
                                    size="small"
                                    bordered={false}
                                    hoverable
                                    onClick={() => handleEventClick(evt)}
                                    style={{
                                        background: 'var(--code-bg)',
                                        border: '1px solid var(--border)',
                                        marginTop: -6, cursor: 'pointer',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <Tag color={cfg.color} style={{ textTransform: 'uppercase', marginBottom: 8 }}>
                                            {evt.category}
                                        </Tag>
                                        <Button
                                            type="primary"
                                            size="small"
                                            icon={<EyeOutlined />}
                                            style={{ fontSize: 11, borderRadius: 4 }}
                                        >
                                            View Original
                                        </Button>
                                    </div>
                                    <Paragraph 
                                        style={{ 
                                            marginBottom: 6, 
                                            color: '#e2e8f0',
                                            fontFamily: "'Noto Sans Devanagari', 'Segoe UI', sans-serif",
                                            fontSize: 14,
                                            lineHeight: 1.6,
                                            wordBreak: 'break-word',
                                            whiteSpace: 'pre-wrap'
                                        }}
                                    >
                                        {evt.description}
                                    </Paragraph>
                                    {(evt.officer_name || evt.location) && (
                                        <Space size="large" style={{ marginTop: 4 }}>
                                            {evt.officer_name && (
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    <SafetyOutlined /> {evt.officer_name}
                                                </Text>
                                            )}
                                            {evt.location && (
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    <HomeOutlined /> {evt.location}
                                                </Text>
                                            )}
                                        </Space>
                                    )}
                                </Card>
                            </Timeline.Item>
                        );
                    })}
                </Timeline>
            </div>

            {/* Uploaded Documents list */}
            <Divider orientation="left" style={{ marginTop: 32, marginBottom: 16 }}>
                <Space>
                    <PaperClipOutlined />
                    <Text strong>Uploaded Documents</Text>
                    <Badge count={documents.length} showZero style={{ marginLeft: 8 }} />
                </Space>
            </Divider>

            {docsLoading ? (
                <Spin size="small" />
            ) : documents.filter(doc => doc.file_path).length > 0 ? (
                <List
                    size="small"
                    dataSource={documents.filter(doc => doc.file_path)}
                    renderItem={doc => (
                        <Card size="small" style={{ marginBottom: 8, background: 'var(--code-bg)', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Space>
                                    {getFileIcon(doc.file_name)}
                                    <div>
                                        <Text strong style={{ fontSize: 13 }}>{doc.file_name || doc.doc_type}</Text>
                                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                                            {doc.doc_type} · {formatFileSize(doc.file_size)} · {formatDate(doc.uploaded_at)}
                                        </div>
                                    </div>
                                </Space>
                                <Space>
                                    <Button type="primary" size="small" icon={<EyeOutlined />}
                                        onClick={() => handleViewOriginal(doc)}>
                                        View Original
                                    </Button>
                                    {doc.file_path && (
                                        <a href={doc.file_path} target="_blank" rel="noopener noreferrer" download>
                                            <Button size="small" icon={<DownloadOutlined />}>Download</Button>
                                        </a>
                                    )}
                                </Space>
                            </div>
                        </Card>
                    )}
                />
            ) : (
                <Empty description="No documents uploaded yet." image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}

            {/* Timeline event → real document drawer */}
            <DocumentDrawer
                open={drawerOpen}
                event={selectedEvent}
                documents={documents}
                headers={headers}
                caseId={caseId}
                onClose={() => { setDrawerOpen(false); setSelectedEvent(null); }}
            />

            {/* "View Original" from documents list → reuse DocumentDrawer via a synthetic event */}
            <Drawer
                open={docDrawerOpen}
                onClose={() => { setDocDrawerOpen(false); setSelectedDoc(null); }}
                width={780}
                title={
                    <Space>
                        {selectedDoc && getFileIcon(selectedDoc.file_name)}
                        {selectedDoc?.file_name || 'View Document'}
                        {selectedDoc && <Tag color="success" style={{ margin: 0 }}><LinkOutlined /> Verified Source</Tag>}
                    </Space>
                }
                extra={
                    <Space>
                        {selectedDoc?.file_path && (
                            <a href={selectedDoc.file_path} target="_blank" rel="noopener noreferrer" download>
                                <Button icon={<DownloadOutlined />}>Download</Button>
                            </a>
                        )}
                        <Button onClick={() => setDocDrawerOpen(false)}>Close</Button>
                    </Space>
                }
                styles={{ body: { padding: 0 } }}
            >
                {selectedDoc?.mime_type === 'application/pdf' && selectedDoc?.file_path ? (
                    <iframe
                        src={selectedDoc.file_path}
                        style={{ width: '100%', height: '80vh', border: 'none' }}
                        title={selectedDoc.file_name}
                    />
                ) : selectedDoc?.content_text ? (
                    <div style={{
                        padding: '28px 32px', background: '#fcfcf9',
                        fontFamily: '"Courier New", Courier, monospace',
                        fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap',
                        color: '#1a1a1a', maxHeight: '80vh', overflowY: 'auto',
                    }}>
                        {selectedDoc.content_text}
                    </div>
                ) : (
                    <div style={{ padding: 24 }}>
                        <Alert type="info" showIcon message="No Text Content"
                            description="No extractable text. Download the file to view it." />
                    </div>
                )}
                {selectedDoc && (
                    <div style={{
                        padding: '7px 20px', borderTop: '1px solid var(--border)',
                        fontSize: 11, color: 'var(--text-dim)',
                        display: 'flex', gap: 20, flexWrap: 'wrap',
                    }}>
                        <span>📎 {selectedDoc.file_name || '—'}</span>
                        <span>📏 {formatFileSize(selectedDoc.file_size)}</span>
                        <span>📋 {selectedDoc.doc_type}</span>
                        <span>🕐 {formatDate(selectedDoc.uploaded_at)}</span>
                    </div>
                )}
            </Drawer>
        </div>
    );
}
