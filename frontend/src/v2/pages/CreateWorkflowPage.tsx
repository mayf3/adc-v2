import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Select, Space, Spin, Typography, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { describeApiError, v2Api } from '../api';
import { V2PageHeader } from '../components/V2PageHeader';
import { idempotencyKeyFor, type PendingIdempotencyKey } from '../idempotency';
import type { CreateWorkflowInput, DefinitionBinding } from '../types';

interface CreateFormValues {
  scenarioKey: string;
  title: string;
  description: string;
  acceptanceCriteria: Array<{ value?: string }>;
  references?: Array<{ type?: string; uri?: string; digest?: string }>;
  additionalContext?: string;
}

export function CreateWorkflowPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm<CreateFormValues>();
  const [bindings, setBindings] = useState<DefinitionBinding[]>([]);
  const [loadingBindings, setLoadingBindings] = useState(true);
  const [bindingError, setBindingError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const pendingCreate = useRef<PendingIdempotencyKey>();

  useEffect(() => {
    let active = true;
    void v2Api.getDefinitionBindings()
      .then((items) => {
        if (!active) return;
        setBindings(items);
        if (items.length === 1) form.setFieldValue('scenarioKey', items[0].scenarioKey);
      })
      .catch((error) => { if (active) setBindingError(describeApiError(error)); })
      .finally(() => { if (active) setLoadingBindings(false); });
    return () => { active = false; };
  }, [form]);

  const submit = async (values: CreateFormValues) => {
    let additionalContext: Record<string, unknown> | undefined;
    if (values.additionalContext?.trim()) {
      try {
        const parsed = JSON.parse(values.additionalContext) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          form.setFields([{ name: 'additionalContext', errors: ['请输入 JSON object'] }]);
          return;
        }
        additionalContext = parsed as Record<string, unknown>;
      } catch {
        form.setFields([{ name: 'additionalContext', errors: ['请输入有效 JSON'] }]);
        return;
      }
    }

    const input: CreateWorkflowInput = {
      scenarioKey: values.scenarioKey,
      title: values.title.trim(),
      description: values.description.trim(),
      acceptanceCriteria: values.acceptanceCriteria
        .map((item) => item?.value?.trim())
        .filter((item): item is string => Boolean(item)),
      references: (values.references ?? []).map((reference) => ({
        type: reference.type!.trim(),
        uri: reference.uri!.trim(),
        digest: reference.digest!.trim(),
      })),
      ...(additionalContext ? { additionalContext } : {}),
    };

    setSubmitting(true);
    try {
      const attempt = idempotencyKeyFor(input, pendingCreate.current);
      pendingCreate.current = attempt;
      const instance = await v2Api.createWorkflowInstance(input, attempt.key);
      if (!instance.workflowInstanceId) throw new Error('svc-workflow 未返回 workflowInstanceId');
      message.success('研发事项已创建');
      navigate(`/v2/workflow-instances/${instance.workflowInstanceId}`, { replace: true });
    } catch (error) {
      message.error(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <V2PageHeader
        title="新建研发事项"
        description="提交后直接创建 svc-workflow WorkflowInstance，不先创建本地 Requirement。"
        backTo="/v2/worklist"
      />
      {bindingError && (
        <Alert
          type="error"
          showIcon
          message="Definition Binding 加载失败"
          description={bindingError}
          style={{ marginBottom: 16 }}
        />
      )}
      <Card style={{ maxWidth: 820 }}>
        <Spin spinning={loadingBindings}>
          <Form<CreateFormValues>
            form={form}
            layout="vertical"
            initialValues={{ acceptanceCriteria: [{ value: '' }], references: [] }}
            onFinish={(values) => void submit(values)}
          >
            <Form.Item
              name="scenarioKey"
              label="研发场景"
              rules={[{ required: true, message: '请选择研发场景' }]}
              extra="场景由 ADC Definition Binding 映射到 svc-workflow Definition Version。"
            >
              <Select
                placeholder="选择场景"
                disabled={bindings.length === 0}
                options={bindings.map((binding) => ({
                  value: binding.scenarioKey,
                  label: binding.displayName
                    ? `${binding.displayName} (${binding.scenarioKey})`
                    : binding.scenarioKey,
                }))}
              />
            </Form.Item>
            <Form.Item name="title" label="标题" rules={[{ required: true, whitespace: true, message: '请输入标题' }]}>
              <Input maxLength={200} showCount />
            </Form.Item>
            <Form.Item
              name="description"
              label="问题与目标"
              rules={[{ required: true, whitespace: true, message: '请描述问题与目标' }]}
            >
              <Input.TextArea rows={5} maxLength={5000} showCount />
            </Form.Item>
            <Form.List name="acceptanceCriteria">
              {(fields, { add, remove }) => (
                <Form.Item label="验收标准" required>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {fields.map((field, index) => (
                      <Space.Compact key={field.key} style={{ width: '100%' }}>
                        <Form.Item
                          {...field}
                          name={[field.name, 'value']}
                          noStyle
                          rules={[{ required: true, whitespace: true, message: '请输入验收标准' }]}
                        >
                          <Input placeholder={`验收标准 ${index + 1}`} />
                        </Form.Item>
                        <Button
                          aria-label={`删除验收标准 ${index + 1}`}
                          icon={<MinusCircleOutlined />}
                          disabled={fields.length === 1}
                          onClick={() => remove(field.name)}
                        />
                      </Space.Compact>
                    ))}
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ value: '' })}>
                      添加验收标准
                    </Button>
                  </Space>
                </Form.Item>
              )}
            </Form.List>
            <Form.List name="references">
              {(fields, { add, remove }) => (
                <Form.Item
                  label="不可变外部引用（可选）"
                  extra="ADC 只保存 URI 与 digest，不上传或复制交付物。"
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {fields.map((field, index) => (
                      <Card key={field.key} size="small">
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Space.Compact style={{ width: '100%' }}>
                            <Form.Item
                              {...field}
                              name={[field.name, 'type']}
                              noStyle
                              rules={[
                                { required: true, message: '请输入引用类型' },
                                { pattern: /^[a-z][a-z0-9_]{0,63}$/, message: '使用小写字母、数字或下划线' },
                              ]}
                            >
                              <Input placeholder="类型，例如 git_commit" style={{ width: '32%' }} />
                            </Form.Item>
                            <Form.Item
                              {...field}
                              name={[field.name, 'uri']}
                              noStyle
                              rules={[{ required: true, whitespace: true, message: '请输入 URI' }]}
                            >
                              <Input placeholder="不可变 URI" style={{ width: '43%' }} />
                            </Form.Item>
                            <Form.Item
                              {...field}
                              name={[field.name, 'digest']}
                              noStyle
                              rules={[{ required: true, whitespace: true, message: '请输入 digest' }]}
                            >
                              <Input placeholder="sha256:..." style={{ width: '25%' }} />
                            </Form.Item>
                          </Space.Compact>
                          <Button
                            danger
                            type="text"
                            icon={<MinusCircleOutlined />}
                            onClick={() => remove(field.name)}
                          >
                            删除引用 {index + 1}
                          </Button>
                        </Space>
                      </Card>
                    ))}
                    <Button
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={() => add({ type: 'git_commit', uri: '', digest: '' })}
                    >
                      添加外部引用
                    </Button>
                  </Space>
                </Form.Item>
              )}
            </Form.List>
            <Form.Item
              name="additionalContext"
              label="补充上下文（JSON object，可选）"
              extra="不能覆盖 title、description、acceptanceCriteria 或 references。"
            >
              <Input.TextArea rows={3} maxLength={5000} showCount placeholder='例如：{"priority":"P1"}' />
            </Form.Item>
            <Alert
              type="info"
              showIcon
              message="本次创建不上传本地附件；外部交付物只通过 immutable reference 关联。"
              style={{ marginBottom: 20 }}
            />
            <Space>
              <Button type="primary" htmlType="submit" loading={submitting} disabled={bindings.length === 0}>
                创建 WorkflowInstance
              </Button>
              <Button onClick={() => navigate('/v2/worklist')}>取消</Button>
            </Space>
          </Form>
        </Spin>
      </Card>
      <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
        创建请求使用独立 Idempotency-Key；浏览器不会保存本地业务副本。
      </Typography.Paragraph>
    </div>
  );
}
