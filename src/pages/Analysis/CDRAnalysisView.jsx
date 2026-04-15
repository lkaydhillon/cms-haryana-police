import React, { useState, useEffect } from 'react';
import { Table, Input, Card, Row, Col, Statistic, Typography, Spin, Empty } from 'antd';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
    PhoneOutlined,
    MobileOutlined,
    ClusterOutlined,
    FieldTimeOutlined,
    SearchOutlined,
    SignalFilled
} from '@ant-design/icons';

const { Title, Text } = Typography;

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

const COLORS = ['#ef4444', '#f59e0b', '#1890ff', '#10b981', '#722ed1', '#eb2f96'];

export default function CDRAnalysisView({ caseId, headers }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isDarkMode, setIsDarkMode] = useState(false);

    useEffect(() => {
        const matchMedia = window.matchMedia('(prefers-color-scheme: dark)');
        setIsDarkMode(matchMedia.matches);
        const handler = (e) => setIsDarkMode(e.matches);
        matchMedia.addEventListener('change', handler);

        setLoading(true);
        fetch(`/api/analysis/cases/${caseId}/cdr`, { headers })
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));

        return () => matchMedia.removeEventListener('change', handler);
    }, [caseId]);

    if (loading) return (
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}><Text type="secondary">Loading CDR records...</Text></div>
        </div>
    );

    if (!data || data.records?.length === 0) return (
        <div style={{ padding: '80px 0' }}>
            <Empty description="No CDR records for this case. Upload CDR data via the AI Insights tab." />
        </div>
    );

    const filtered = data.records.filter(r =>
        !search ||
        r.caller.includes(search) ||
        r.receiver.includes(search) ||
        r.tower_location?.toLowerCase().includes(search.toLowerCase())
    );

    const uniqueNumbers = new Set([...data.records.map(r => r.caller), ...data.records.map(r => r.receiver)]).size;
    const uniqueTowers = new Set(data.records.map(r => r.tower_id).filter(Boolean)).size;
    const avgDuration = Math.round(data.records.reduce((s, r) => s + (r.duration_sec || 0), 0) / data.records.length);

    const columns = [
        { title: '#', dataIndex: 'id', render: (_, __, i) => i + 1, width: 60 },
        { title: 'Caller', dataIndex: 'caller', render: text => <Text strong type="danger" style={{ fontFamily: 'monospace' }}>{text}</Text> },
        { title: 'Receiver', dataIndex: 'receiver', render: text => <Text code>{text}</Text> },
        { title: 'Duration', dataIndex: 'duration_sec', render: sec => formatDuration(sec) },
        { title: 'Date & Time', dataIndex: 'call_time', render: time => formatTime(time) },
        { title: 'Tower', dataIndex: 'tower_id', render: text => text ? <Tag color="blue">{text}</Tag> : '—' },
        { title: 'Location', dataIndex: 'tower_location', render: text => text || '—' },
    ];

    const gridLineColor = isDarkMode ? '#303030' : '#e8e8e8';
    const tickColor = isDarkMode ? '#9 ca3af' : '#6b7280';

    return (
        <div style={{ padding: 24 }}>
            <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                    <SignalFilled style={{ marginRight: 8, color: '#1890ff' }} />
                    CDR Analysis <Text type="secondary" style={{ marginLeft: 8, fontWeight: 'normal', fontSize: '14px' }}>({data.records.length} records)</Text>
                </Title>
            </div>

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={12} sm={6}>
                    <Card bordered={false} style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
                        <Statistic title="Total Calls" value={data.records.length} prefix={<PhoneOutlined />} valueStyle={{ color: '#1890ff', fontWeight: 600 }} />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card bordered={false} style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
                        <Statistic title="Unique Numbers" value={uniqueNumbers} prefix={<MobileOutlined />} valueStyle={{ color: '#52c41a', fontWeight: 600 }} />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card bordered={false} style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
                        <Statistic title="Cell Towers" value={uniqueTowers} prefix={<ClusterOutlined />} valueStyle={{ color: '#faad14', fontWeight: 600 }} />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card bordered={false} style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
                        <Statistic title="Avg Duration" value={avgDuration} suffix="s" prefix={<FieldTimeOutlined />} valueStyle={{ color: '#722ed1', fontWeight: 600 }} />
                    </Card>
                </Col>
            </Row>

            {/* Call Frequency Chart */}
            <Card title="Call Frequency per Number (Top 10)" bordered={false} style={{ marginBottom: 24, border: '1px solid var(--border)' }}>
                <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data.frequency} margin={{ top: 20, right: 30, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridLineColor} vertical={false} />
                        <XAxis dataKey="number" stroke={tickColor} tick={{ fill: tickColor, fontSize: 12 }} angle={-30} textAnchor="end" height={60} />
                        <YAxis stroke={tickColor} tick={{ fill: tickColor, fontSize: 12 }} allowDecimals={false} />
                        <RechartsTooltip
                            cursor={{ fill: isDarkMode ? '#262626' : '#f5f5f5' }}
                            contentStyle={{ backgroundColor: isDarkMode ? '#1f1f1f' : '#fff', borderColor: gridLineColor, borderRadius: '8px' }}
                            itemStyle={{ color: isDarkMode ? '#fff' : '#000' }}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
                            {data.frequency.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </Card>

            {/* CDR Table */}
            <Card
                title="Call Records"
                bordered={false}
                style={{ border: '1px solid var(--border)' }}
                extra={<Input placeholder="Search number or tower..." prefix={<SearchOutlined />} value={search} onChange={e => setSearch(e.target.value)} style={{ width: 250 }} />}
            >
                <Table
                    dataSource={filtered}
                    columns={columns}
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 15, showSizeChanger: true }}
                    scroll={{ x: 'max-content' }}
                />
            </Card>
        </div>
    );
}
