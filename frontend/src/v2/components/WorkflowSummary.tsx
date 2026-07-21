import { Descriptions, Space, Tag, Typography } from 'antd';
import type { WorkflowInstance } from '../types';

function text(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : '—';
}

export function WorkflowSummary({ instance }: { instance: WorkflowInstance }) {
  const context = instance.context ?? {};
  const criteria = Array.isArray(context.acceptanceCriteria)
    ? context.acceptanceCriteria.filter((item): item is string => typeof item === 'string')
    : [];
  const references = Array.isArray(context.references)
    ? context.references.filter((item): item is Record<string, unknown> => (
        Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      ))
    : [];

  return (
    <>
      <Descriptions bordered column={{ xs: 1, sm: 1, md: 2 }} size="small">
        <Descriptions.Item label="WorkflowInstance ID" span={2}>
          <Typography.Text copyable>{instance.workflowInstanceId}</Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="标题">{text(context.title)}</Descriptions.Item>
        <Descriptions.Item label="状态">
          {instance.isTerminal ? <Tag color="green">TERMINAL</Tag> : <Tag color="blue">ACTIVE</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="当前节点">
          {instance.currentNode?.displayName || instance.currentNode?.nodeKey || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="负责人">
          {instance.currentAssigneePrincipalId || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="状态版本">{instance.workflowStateVersion ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Definition Version">
          {instance.definitionVersionId || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="描述" span={2}>
          <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {text(context.description)}
          </Typography.Paragraph>
        </Descriptions.Item>
        <Descriptions.Item label="验收标准" span={2}>
          {criteria.length > 0 ? (
            <ol style={{ margin: 0, paddingInlineStart: 20 }}>
              {criteria.map((criterion, index) => <li key={`${index}-${criterion}`}>{criterion}</li>)}
            </ol>
          ) : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="外部引用" span={2}>
          {references.length > 0 ? (
            <Space direction="vertical" size={4}>
              {references.map((reference, index) => (
                <Typography.Text key={`${String(reference.uri)}-${index}`} copyable>
                  {text(reference.type)} · {text(reference.uri)} · {text(reference.digest)}
                </Typography.Text>
              ))}
            </Space>
          ) : '—'}
        </Descriptions.Item>
      </Descriptions>
    </>
  );
}
