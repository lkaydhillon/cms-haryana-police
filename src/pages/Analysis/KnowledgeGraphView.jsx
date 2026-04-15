import React, { useState, useEffect, useCallback } from 'react';
import { Card, Spin, Typography, Empty, Space, Tag, Descriptions, Button } from 'antd';
import { ShareAltOutlined, InfoCircleOutlined, CloseOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const NODE_COLORS = {
    case: '#1890ff', // blue
    accused: '#ff4d4f', // red
    victim: '#52c41a', // green
    witness: '#faad14', // yellow
    event: '#722ed1', // purple
};

const NODE_LABELS = {
    case: 'Case',
    accused: 'Accused',
    victim: 'Victim',
    witness: 'Witness',
    event: 'Event',
};

let ForceGraph2D;

export default function KnowledgeGraphView({ caseId, headers }) {
    const [graphData, setGraphData] = useState(null);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);
    const [ForceGraphComp, setForceGraphComp] = useState(null);
    const [isDarkMode, setIsDarkMode] = useState(false);

    useEffect(() => {
        // Detect dark mode from the root element's styling or rely on CSS vars.
        // In many antd+vite apps, dark mode sets data-theme="dark" or similar, 
        // but computing window style also works. The user uses index.css dark prefers-color-scheme.
        const matchMedia = window.matchMedia('(prefers-color-scheme: dark)');
        setIsDarkMode(matchMedia.matches);
        const handler = (e) => setIsDarkMode(e.matches);
        matchMedia.addEventListener('change', handler);

        import('react-force-graph-2d').then(mod => {
            setForceGraphComp(() => mod.default);
        });

        return () => matchMedia.removeEventListener('change', handler);
    }, []);

    useEffect(() => {
        setLoading(true);
        setSelected(null);
        fetch(`/api/analysis/cases/${caseId}/graph`, { headers })
            .then(r => r.json())
            .then(data => { setGraphData(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, [caseId]);

    const handleNodeClick = useCallback((node) => {
        setSelected(node);
    }, []);

    if (loading || !ForceGraphComp) return (
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}><Text type="secondary">Rendering knowledge graph...</Text></div>
        </div>
    );

    if (!graphData || graphData.nodes?.length === 0) return (
        <div style={{ padding: '80px 0' }}>
            <Empty
                image={<ShareAltOutlined style={{ fontSize: 64, color: '#e8e8e8' }} />}
                description="No graph data for this case. Add persons and events to see relationships."
            />
        </div>
    );

    return (
        <div style={{ display: 'flex', height: 600, width: '100%' }}>
            {/* Graph Area */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {/* Legend Overlay */}
                <Card size="small" style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <Title level={5} style={{ margin: '0 0 12px', fontSize: 13 }}><ShareAltOutlined /> Legend</Title>
                    <Space direction="vertical" size={4}>
                        {Object.entries(NODE_COLORS).map(([type, color]) => (
                            <div key={type} style={{ display: 'flex', alignItems: 'center' }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, marginRight: 8 }} />
                                <Text style={{ fontSize: 13 }}>{NODE_LABELS[type]}</Text>
                            </div>
                        ))}
                        <Text type="secondary" style={{ fontSize: 11, marginTop: 8 }}><InfoCircleOutlined /> Click node for details</Text>
                    </Space>
                </Card>

                <ForceGraphComp
                    graphData={graphData}
                    width={undefined}
                    nodeLabel="label"
                    nodeColor={node => NODE_COLORS[node.type] || '#94a3b8'}
                    nodeVal={node => node.val || 5}
                    linkLabel="label"
                    linkDirectionalArrowLength={4}
                    linkDirectionalArrowRelPos={1}
                    linkColor={() => isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}
                    onNodeClick={handleNodeClick}
                    nodeCanvasObjectMode={() => 'after'}
                    nodeCanvasObject={(node, ctx, globalScale) => {
                        const label = node.label?.length > 20 ? node.label.slice(0, 20) + '…' : node.label;
                        const fontSize = Math.max(12 / globalScale, 3);
                        ctx.font = `600 ${fontSize}px Inter, sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';

                        // Text color logic for readability
                        ctx.fillStyle = isDarkMode ? '#f0f0f0' : '#1f1f1f';

                        // Text stroke for contrast
                        ctx.lineWidth = 2 / globalScale;
                        ctx.strokeStyle = isDarkMode ? '#141414' : '#ffffff';
                        ctx.strokeText(label, node.x, node.y + (node.val || 5) / 1.5 + 4);
                        ctx.fillText(label, node.x, node.y + (node.val || 5) / 1.5 + 4);
                    }}
                />
            </div>

            {/* Side Panel for Node Details */}
            {selected && (
                <div style={{ width: 320, borderLeft: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Title level={5} style={{ margin: 0 }}>Node Details</Title>
                        <Button type="text" icon={<CloseOutlined />} onClick={() => setSelected(null)} />
                    </div>

                    <div style={{ padding: '20px', overflowY: 'auto' }}>
                        <Tag color={NODE_COLORS[selected.type]} style={{ marginBottom: 16, fontSize: 13, padding: '4px 12px' }}>
                            {NODE_LABELS[selected.type] || selected.type.toUpperCase()}
                        </Tag>

                        <Title level={4} style={{ marginTop: 0, marginBottom: 24, fontSize: '18px' }}>{selected.label}</Title>

                        {selected.details && (
                            <Descriptions column={1} size="small" layout="vertical" bordered>
                                {Object.entries(selected.details).map(([k, v]) => v && (
                                    <Descriptions.Item key={k} label={<span style={{ textTransform: 'capitalize', color: 'var(--text)' }}>{k}</span>}>
                                        <Text strong>{v}</Text>
                                    </Descriptions.Item>
                                ))}
                            </Descriptions>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
