import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setStoredToken } from './v2/api-client';

interface TokenFormValues {
  token: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [showAlert, setShowAlert] = useState(false);

  return (
    <div
      style={{
        alignItems: 'center',
        background: '#f5f7fa',
        display: 'flex',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 24,
      }}
    >
      <Card style={{ maxWidth: 440, width: '100%' }}>
        <Typography.Title level={3} style={{ textAlign: 'center' }}>
          ADC V2
        </Typography.Title>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 20, textAlign: 'center' }}>
          svc-workflow 研发交付控制台
        </Typography.Text>

        <Alert
          type="warning"
          showIcon
          message="DEV / CANARY ONLY"
          description="当前认证模式为 Direct Bearer Token Proxy，仅适合开发和受控 Canary 环境。正式多人/生产认证尚未完成。"
          style={{ marginBottom: 16 }}
        />

        <Form<TokenFormValues>
          layout="vertical"
          onFinish={(values) => {
            setStoredToken(values.token.trim());
            setShowAlert(true);
            setTimeout(() => navigate('/v2/worklist', { replace: true }), 300);
          }}
        >
          <Form.Item
            name="token"
            label="Bearer Token"
            rules={[
              { required: true, whitespace: true, message: '请输入 Bearer Token' },
              { pattern: /^[\x21-\x7e]+$/, message: 'Token 只能包含可见 ASCII 字符' },
            ]}
          >
            <Input.TextArea
              rows={4}
              placeholder="在此粘贴你的 JWT Bearer Token"
            />
          </Form.Item>

          {showAlert && (
            <Alert
              type="success"
              showIcon
              message="Token 已保存（localStorage），正在跳转……"
              style={{ marginBottom: 12 }}
            />
          )}

          <Button type="primary" htmlType="submit" block>
            进入控制台
          </Button>
        </Form>

        <Typography.Paragraph
          type="secondary"
          style={{ fontSize: 12, marginTop: 16, textAlign: 'center' }}
        >
          安全说明：Token 仅保存在浏览器 localStorage，仅发送到 ADC V2 后端
          <code style={{ background: '#f5f5f5', padding: '0 4px' }}>/api/v2/*</code>
          路径。Token 不会进入 URL、日志或构建产物。
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
