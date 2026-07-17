import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Flex, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface V2PageHeaderProps {
  title: string;
  description?: string;
  backTo?: string;
  extra?: ReactNode;
}

export function V2PageHeader({ title, description, backTo, extra }: V2PageHeaderProps) {
  const navigate = useNavigate();
  return (
    <Flex justify="space-between" align="flex-start" gap={16} wrap style={{ marginBottom: 24 }}>
      <Flex align="flex-start" gap={12}>
        {backTo && (
          <Button
            type="text"
            aria-label="返回"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(backTo)}
          />
        )}
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>{title}</Typography.Title>
          {description && (
            <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
              {description}
            </Typography.Paragraph>
          )}
        </div>
      </Flex>
      {extra}
    </Flex>
  );
}
