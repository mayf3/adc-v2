import { Alert, Button, Card, Empty, Form, Input, Modal, Result, Space, Spin, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { describeApiError, v2Api } from '../api';
import { V2PageHeader } from '../components/V2PageHeader';
import { idempotencyKeyFor, type PendingIdempotencyKey } from '../idempotency';
import type { WorkflowInstance, WorkflowTransition } from '../types';

interface SubmissionValues {
  submissionPayload?: string;
}

export function WorkflowActionPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm<SubmissionValues>();
  const [instance, setInstance] = useState<WorkflowInstance>();
  const [selected, setSelected] = useState<WorkflowTransition>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const pendingTransition = useRef<PendingIdempotencyKey>();

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

  const executable = useMemo(
    () => instance?.outgoingTransitions.filter((transition) => transition.executableForActor === true) ?? [],
    [instance],
  );

  const execute = async (values: SubmissionValues) => {
    if (!selected || !instance) return;
    const transitionDefinitionId = selected.transitionDefinitionId || selected.transitionId;
    if (!transitionDefinitionId || instance.workflowStateVersion === undefined) {
      message.error('动作缺少 transition ID 或 workflow state version，已停止提交。');
      return;
    }

    let submissionPayload: unknown;
    if (values.submissionPayload?.trim()) {
      try {
        submissionPayload = JSON.parse(values.submissionPayload);
      } catch {
        form.setFields([{ name: 'submissionPayload', errors: ['请输入有效 JSON'] }]);
        return;
      }
    }

    setSubmitting(true);
    try {
      const input = {
        transitionDefinitionId,
        expectedWorkflowStateVersion: instance.workflowStateVersion,
        ...(submissionPayload !== undefined ? { submissionPayload } : {}),
      };
      const attempt = idempotencyKeyFor({ workflowInstanceId: id, ...input }, pendingTransition.current);
      pendingTransition.current = attempt;
      await v2Api.executeTransition(id, input, attempt.key);
      message.success('动作已提交到 svc-workflow');
      navigate(`/v2/workflow-instances/${id}`, { replace: true });
    } catch (requestError) {
      message.error(describeApiError(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={{ display: 'grid', placeItems: 'center', minHeight: 320 }}><Spin size="large" /></div>;
  if (!instance) {
    return (
      <Result
        status="error"
        title="动作加载失败"
        subTitle={error}
        extra={<Button onClick={() => navigate(`/v2/workflow-instances/${id}`)}>返回详情</Button>}
      />
    );
  }

  return (
    <div>
      <V2PageHeader
        title="执行 Workflow 动作"
        description="这里只展示并允许提交 svc-workflow 返回 executableForActor=true 的 Transition。"
        backTo={`/v2/workflow-instances/${id}`}
      />
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Alert
        type="warning"
        showIcon
        message={`提交基于 workflow state version ${instance.workflowStateVersion ?? '未知'}；版本冲突时请刷新后重试。`}
        style={{ marginBottom: 16 }}
      />
      <Card title="可执行动作">
        {executable.length === 0 ? (
          <Empty description="当前 actor 没有可执行 Transition" />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {executable.map((transition) => (
              <Card
                key={transition.transitionDefinitionId || transition.transitionId || transition.transitionKey}
                size="small"
              >
                <Space wrap>
                  <Typography.Text strong>
                    {transition.displayName || transition.transitionKey || transition.transitionEffect || '未命名动作'}
                  </Typography.Text>
                  {transition.transitionEffect && <Tag>{transition.transitionEffect}</Tag>}
                  {transition.targetNode && (
                    <Typography.Text type="secondary">
                      → {transition.targetNode.displayName || transition.targetNode.nodeKey}
                    </Typography.Text>
                  )}
                  <Button type="primary" onClick={() => { form.resetFields(); setSelected(transition); }}>
                    选择并提交
                  </Button>
                </Space>
              </Card>
            ))}
          </Space>
        )}
      </Card>

      <Modal
        title={selected ? `提交：${selected.displayName || selected.transitionKey || selected.transitionEffect}` : '提交动作'}
        open={Boolean(selected)}
        okText="确认提交"
        cancelText="取消"
        confirmLoading={submitting}
        onCancel={() => setSelected(undefined)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form<SubmissionValues> form={form} layout="vertical" onFinish={(values) => void execute(values)}>
          {selected?.submissionSchema ? (
            <>
              <Alert
                type="info"
                showIcon
                message="该 Transition 声明了 submission schema，请按 schema 提交 JSON。"
                style={{ marginBottom: 12 }}
              />
              <Typography.Text type="secondary">Schema</Typography.Text>
              <pre style={{ maxHeight: 160, overflow: 'auto', background: '#f5f5f5', padding: 12 }}>
                {JSON.stringify(selected.submissionSchema, null, 2)}
              </pre>
            </>
          ) : null}
          <Form.Item name="submissionPayload" label="Submission payload（JSON，可选）">
            <Input.TextArea rows={6} placeholder='例如：{"summary":"完成内容"}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
