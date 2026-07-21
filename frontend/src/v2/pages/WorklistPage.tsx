import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Segmented, Space, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiStatus, describeApiError, v2Api } from '../api';
import { V2PageHeader } from '../components/V2PageHeader';
import type { WorklistItem } from '../types';

export function WorklistPage() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<'assigned' | 'creator-drafts'>('assigned');
  const [items, setItems] = useState<WorklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setItems(await v2Api.getWorklist(kind));
    } catch (requestError) {
      setItems([]);
      setError(describeApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => { void load(); }, [load]);

  const columns: ColumnsType<WorklistItem> = [
    {
      title: '研发事项',
      dataIndex: 'title',
      render: (title: string | undefined, item) => (
        <Link to={`/v2/workflow-instances/${item.workflowInstanceId}`}>
          {title || item.workflowInstanceId}
        </Link>
      ),
    },
    {
      title: '当前节点',
      render: (_, item) => item.currentNode?.displayName || item.currentNode?.nodeKey || '—',
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status?: string) => status ? <Tag>{status}</Tag> : '—',
    },
    { title: '负责人', dataIndex: 'assignee', render: (assignee?: string | null) => assignee || '—' },
    {
      title: '操作',
      width: 120,
      render: (_, item) => (
        <Button type="link" onClick={() => navigate(`/v2/workflow-instances/${item.workflowInstanceId}`)}>
          查看
        </Button>
      ),
    },
  ];

  return (
    <div>
      <V2PageHeader
        title="V2 工作台"
        description="研发事项直接来自 svc-workflow，ADC 不维护本地 Requirement 列表。"
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/v2/create')}>
              新建研发事项
            </Button>
          </Space>
        )}
      />

      {error && <Alert type="error" showIcon message="工作台加载失败" description={error} style={{ marginBottom: 16 }} />}

      <Card>
        <Segmented
          value={kind}
          options={[
            { label: '我需要处理', value: 'assigned' },
            { label: '我的草稿', value: 'creator-drafts' },
          ]}
          onChange={(value) => setKind(value as 'assigned' | 'creator-drafts')}
          style={{ marginBottom: 16 }}
        />
        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 220 }}><Spin /></div>
        ) : items.length === 0 && !error ? (
          <Empty description="当前没有可见的 WorkflowInstance" />
        ) : (
          <Table rowKey="workflowInstanceId" columns={columns} dataSource={items} pagination={false} />
        )}
      </Card>

      <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
        权威来源：svc-workflow WorkflowInstance
      </Typography.Paragraph>
    </div>
  );
}
