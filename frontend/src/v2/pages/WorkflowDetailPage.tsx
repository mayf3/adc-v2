import { ClockCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Result, Space, Spin, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { describeApiError, v2Api } from '../api';
import { V2PageHeader } from '../components/V2PageHeader';
import { WorkflowSummary } from '../components/WorkflowSummary';
import type { WorkflowInstance } from '../types';

export function WorkflowDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [instance, setInstance] = useState<WorkflowInstance>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(undefined);
    try {
      setInstance(await v2Api.getWorkflowInstance(id));
    } catch (requestError) {
      setError(describeApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div style={{ display: 'grid', placeItems: 'center', minHeight: 320 }}><Spin size="large" /></div>;
  if (!instance) {
    return (
      <Result
        status="error"
        title="WorkflowInstance 加载失败"
        subTitle={error}
        extra={<Button onClick={() => navigate('/v2/worklist')}>返回工作台</Button>}
      />
    );
  }

  const executableCount = instance.outgoingTransitions.filter((item) => item.executableForActor).length;

  return (
    <div>
      <V2PageHeader
        title={(instance.context?.title as string | undefined) || '研发事项详情'}
        description="详情、当前节点和可执行动作均实时读取 svc-workflow。"
        backTo="/v2/worklist"
        extra={(
          <Space>
            <Button
              icon={<ClockCircleOutlined />}
              onClick={() => navigate(`/v2/workflow-instances/${id}/timeline`)}
            >
              时间线
            </Button>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              disabled={executableCount === 0}
              onClick={() => navigate(`/v2/workflow-instances/${id}/action`)}
            >
              执行动作{executableCount > 0 ? ` (${executableCount})` : ''}
            </Button>
          </Space>
        )}
      />
      {error && <Alert type="warning" showIcon message="刷新失败，当前显示上一次结果" description={error} />}
      <Card>
        <WorkflowSummary instance={instance} />
      </Card>
      <Card title="动作可用性" style={{ marginTop: 16 }}>
        {instance.outgoingTransitions.length === 0 ? (
          <Typography.Text type="secondary">当前详情没有 outgoing transitions。</Typography.Text>
        ) : (
          <Space wrap>
            {instance.outgoingTransitions.map((transition) => (
              <Button
                key={transition.transitionDefinitionId || transition.transitionId || transition.transitionKey}
                disabled={!transition.executableForActor}
                onClick={() => transition.executableForActor && navigate(`/v2/workflow-instances/${id}/action`)}
              >
                {transition.displayName || transition.transitionKey || transition.transitionEffect || '未命名动作'}
                {!transition.executableForActor && transition.blockedReason ? ` · ${transition.blockedReason}` : ''}
              </Button>
            ))}
          </Space>
        )}
      </Card>
    </div>
  );
}
