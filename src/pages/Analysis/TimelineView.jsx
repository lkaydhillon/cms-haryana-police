import React, { useState, useEffect } from 'react';
import { Timeline, Spin, Typography, Card, Space, Empty, Tag } from 'antd';
import {
    FileTextOutlined,
    CommentOutlined,
    SearchOutlined,
    AlertOutlined,
    HomeOutlined,
    SafetyOutlined,
    PushpinOutlined,
    CalendarOutlined
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

const CATEGORY_CONFIG = {
    registration: { color: 'green', icon: <FileTextOutlined style={{ fontSize: '16px' }} /> },
    statement: { color: 'blue', icon: <CommentOutlined style={{ fontSize: '16px' }} /> },
    evidence: { color: 'orange', icon: <SearchOutlined style={{ fontSize: '16px' }} /> },
    arrest: { color: 'red', icon: <AlertOutlined style={{ fontSize: '16px' }} /> },
    raid: { color: 'purple', icon: <HomeOutlined style={{ fontSize: '16px' }} /> },
    challan: { color: 'magenta', icon: <SafetyOutlined style={{ fontSize: '16px' }} /> },
};

const DEFAULT_CONFIG = { color: 'gray', icon: <PushpinOutlined style={{ fontSize: '16px' }} /> };

function formatDate(dt) {
    return new Date(dt).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
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
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}><Text type="secondary">Loading timeline...</Text></div>
        </div>
    );

    if (events.length === 0) return (
        <div style={{ padding: '80px 0' }}>
            <Empty description="No events recorded for this case yet." />
        </div>
    );

    return (
        <div style={{ padding: '24px 32px' }}>
            <div style={{ marginBottom: 32, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
                <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                    <CalendarOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                    Case Timeline <Text type="secondary" style={{ marginLeft: 8, fontWeight: 'normal', fontSize: '14px' }}>({events.length} events)</Text>
                </Title>
            </div>

            <div style={{ paddingLeft: 16 }}>
                <Timeline mode="left">
                    {events.map((evt) => {
                        const cfg = CATEGORY_CONFIG[evt.category] || DEFAULT_CONFIG;
                        return (
                            <Timeline.Item
                                key={evt.id}
                                color={cfg.color}
                                dot={cfg.icon}
                                label={<Text strong>{formatDate(evt.event_time)}</Text>}
                            >
                                <Card size="small" bordered={false} style={{ background: 'var(--code-bg)', border: '1px solid var(--border)', boxShadow: '0 1px 2px rgba(0,0,0,0.03)', marginTop: -6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <Tag color={cfg.color} style={{ textTransform: 'uppercase', marginBottom: 8 }}>{evt.category}</Tag>
                                    </div>
                                    <Paragraph style={{ marginBottom: 12 }}>{evt.description}</Paragraph>

                                    {(evt.officer_name || evt.location) && (
                                        <Space size="large" style={{ marginTop: 8 }}>
                                            {evt.officer_name && <Text type="secondary" style={{ fontSize: '12px' }}><SafetyOutlined /> {evt.officer_name}</Text>}
                                            {evt.location && <Text type="secondary" style={{ fontSize: '12px' }}><HomeOutlined /> {evt.location}</Text>}
                                        </Space>
                                    )}
                                </Card>
                            </Timeline.Item>
                        );
                    })}
                </Timeline>
            </div>
        </div>
    );
}
