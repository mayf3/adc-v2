import {
  LogoutOutlined,
  PlusCircleOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Button, Layout, Menu, Space, Typography } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { setStoredToken } from '../api-client';

const { Header, Content } = Layout;

export function V2Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedKey = location.pathname.startsWith('/v2/create')
    ? '/v2/create'
    : '/v2/worklist';

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <Header
        style={{
          alignItems: 'center',
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          gap: 24,
          height: 'auto',
          minHeight: 64,
          paddingInline: 24,
        }}
      >
        <Space direction="vertical" size={0} style={{ minWidth: 230 }}>
          <Typography.Text strong>ADC V2</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            svc-workflow 研发交付控制台
          </Typography.Text>
        </Space>
        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={[
            { key: '/v2/worklist', icon: <UnorderedListOutlined />, label: '工作台' },
            { key: '/v2/create', icon: <PlusCircleOutlined />, label: '新建事项' },
          ]}
          onClick={({ key }) => navigate(key)}
          style={{ borderBottom: 0, flex: 1, minWidth: 260 }}
        />
        <Button
          icon={<LogoutOutlined />}
          onClick={() => {
            setStoredToken(null);
            navigate('/login', { replace: true });
          }}
        >
          退出
        </Button>
      </Header>
      <Content style={{ margin: '0 auto', maxWidth: 1200, padding: 24, width: '100%' }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
