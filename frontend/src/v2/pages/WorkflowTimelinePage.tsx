import { Alert, Button, Card, Empty, Spin, Tag, Timeline, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { describeApiError, v2Api } from '../api';
import { V2PageHeader } from '../components/V2PageHeader';
import type { TimelineEvent } from '../types';

function formatTime(value?: string): string {
  if (!value) return '时间未知';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function WorkflowTimelinePage() {
  const { id = '' } = useParams();
  const [items, setItems] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(undefined);
    try {
      setItems((await v2Api.getTimeline(id)).items);
    } catch (requestError) {
      setError(describeApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <V2PageHeader
        title="Workflow 时间线"
        description="不可变事件直接来自 svc-workflow；ADC 不复制本地事件账本。"
        backTo={`/v2/workflow-instances/${id}`}
        extra={<Button onClick={() => void load()}>刷新</Button>}
      />
      {error && <Alert type="error" showIcon message="时间线加载失败" description={error} style={{ marginBottom: 16 }} />}
      <Card>
        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}><Spin /></div>
        ) : items.length === 0 ? (
          <Empty description="暂无可见事件" />
        ) : (
          <Timeline
            items={items.map((event) => ({
              children: (
                <div>
                  <Typography.Text strong>{event.eventType || 'WORKFLOW_EVENT'}</Typography.Text>
                  {event.transitionEffect && <Tag style={{ marginLeft: 8 }}>{event.transitionEffect}</Tag>}
                  <Typography.Paragraph type="secondary" style={{ margin: '4px 0' }}>
                    {formatTime(event.createdAt)}
                    {event.eventSequence !== undefined ? ` · sequence ${event.eventSequence}` : ''}
                    {event.newWorkflowStateVersion !== undefined
                      ? ` · version ${event.oldWorkflowStateVersion ?? '—'} → ${event.newWorkflowStateVersion}`
                      : ''}
                  </Typography.Paragraph>
                  {event.actorPrincipalId && (
                    <Typography.Text type="secondary">actor: {event.actorPrincipalId}</Typography.Text>
                  )}
                </div>
              ),
            }))}
          />
        )}
      </Card>
    </div>
  );
}
