import React, { useState, useEffect } from 'react';
import { Card, Select, Tabs, Tag, Typography, Space, Spin, Empty } from 'antd';
import {
    ClockCircleOutlined,
    ShareAltOutlined,
    PhoneOutlined,
    BulbOutlined,
    FolderOpenOutlined,
    PieChartOutlined
} from '@ant-design/icons';
import TimelineView from './TimelineView';
import KnowledgeGraphView from './KnowledgeGraphView';
import CDRAnalysisView from './CDRAnalysisView';
import InsightsView from './InsightsView';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

export default function AnalysisPage() {
    const [cases, setCases] = useState([]);
    const [selectedCaseId, setSelectedCaseId] = useState(null);
    const [selectedCase, setSelectedCase] = useState(null);
    const [activeTab, setActiveTab] = useState('timeline');
    const [loading, setLoading] = useState(true);

    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    useEffect(() => {
        fetch('/api/analysis/cases', { headers })
            .then(r => r.json())
            .then(data => {
                setCases(data);
                if (data.length > 0) {
                    setSelectedCaseId(data[0].id);
                    setSelectedCase(data[0]);
                }
                setLoading(false);
            })
            .catch((e) => {
                console.error(e);
                setLoading(false);
            });
    }, []);

    const handleCaseChange = (id) => {
        setSelectedCaseId(id);
        setSelectedCase(cases.find(c => c.id === id) || null);
        setActiveTab('timeline');
    };

    const statusColor = (status) => {
        const map = { open: 'warning', investigation: 'processing', challan: 'purple', closed: 'success' };
        return map[status] || 'default';
    };

    const typeColor = (type) => type === 'fir' ? 'error' : 'gold';

    const tabItems = [
        { key: 'timeline', label: <span><ClockCircleOutlined /> Timeline</span>, children: selectedCaseId ? <TimelineView caseId={selectedCaseId} headers={headers} /> : null },
        { key: 'graph', label: <span><ShareAltOutlined /> Knowledge Graph</span>, children: selectedCaseId ? <KnowledgeGraphView caseId={selectedCaseId} headers={headers} /> : null },
        { key: 'cdr', label: <span><PhoneOutlined /> CDR Analysis</span>, children: selectedCaseId ? <CDRAnalysisView caseId={selectedCaseId} headers={headers} /> : null },
        { key: 'insights', label: <span><BulbOutlined /> AI Insights</span>, children: selectedCaseId ? <InsightsView caseId={selectedCaseId} headers={headers} /> : null },
    ];

    return (
        <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <Title level={3} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <PieChartOutlined style={{ color: '#1890ff' }} />
                    Case Analytics & Visualization
                </Title>
                <Text type="secondary">
                    LLM Wiki Graph · Entity Relationship · CDR Analysis · Investigation Insights
                </Text>
            </div>

            {/* Case Selector Card */}
            <Card style={{ marginBottom: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <Text strong type="secondary"><FolderOpenOutlined /> SELECT CASE</Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                        <Select
                            showSearch
                            style={{ flex: 1, minWidth: 300 }}
                            placeholder="Select a case"
                            value={selectedCaseId}
                            onChange={handleCaseChange}
                            size="large"
                            loading={loading}
                            optionFilterProp="children"
                        >
                            {cases.map(c => (
                                <Option key={c.id} value={c.id}>
                                    [{c.case_type.toUpperCase()}] {c.title} — {c.status}
                                </Option>
                            ))}
                        </Select>

                        {selectedCase && (
                            <Space style={{ marginTop: 4 }}>
                                <Tag color={typeColor(selectedCase.case_type)}>{selectedCase.case_type.toUpperCase()}</Tag>
                                <Tag color={statusColor(selectedCase.status)}>{selectedCase.status.toUpperCase()}</Tag>
                                <Text type="secondary">
                                    IO: <Text strong>{selectedCase.io_name || '—'}</Text> · {selectedCase.offense_section || 'No section'}
                                </Text>
                            </Space>
                        )}
                    </div>
                    {selectedCase && (
                        <Paragraph style={{ margin: 0, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                            {selectedCase.description}
                        </Paragraph>
                    )}
                </div>
            </Card>

            {/* Tab Content */}
            <Card style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', minHeight: 600 }} bodyStyle={{ padding: '0 0 24px 0' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '100px 0' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 16 }}><Text type="secondary">Loading case data...</Text></div>
                    </div>
                ) : !selectedCaseId ? (
                    <div style={{ padding: '100px 0' }}>
                        <Empty description="No cases found. Register a complaint to begin." />
                    </div>
                ) : (
                    <Tabs
                        activeKey={activeTab}
                        onChange={setActiveTab}
                        items={tabItems}
                        size="large"
                        tabBarStyle={{ padding: '0 24px', marginBottom: 0, backgroundColor: 'var(--code-bg)', borderBottom: '1px solid var(--border)' }}
                    />
                )}
            </Card>
        </div>
    );
}
