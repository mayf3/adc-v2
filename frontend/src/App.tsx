import { ConfigProvider, App as AntApp } from 'antd';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';

import { LoginPage } from './LoginPage';
import { V2BearerRoute } from './v2/components/V2BearerRoute';
import { V2Layout } from './v2/components/V2Layout';
import { CreateWorkflowPage } from './v2/pages/CreateWorkflowPage';
import { WorkflowActionPage } from './v2/pages/WorkflowActionPage';
import { WorkflowDetailPage } from './v2/pages/WorkflowDetailPage';
import { WorkflowTimelinePage } from './v2/pages/WorkflowTimelinePage';
import { WorklistPage } from './v2/pages/WorklistPage';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <V2BearerRoute />,
    children: [
      {
        path: '/v2',
        element: <V2Layout />,
        children: [
          { index: true, element: <Navigate to="worklist" replace /> },
          { path: 'worklist', element: <WorklistPage /> },
          { path: 'create', element: <CreateWorkflowPage /> },
          { path: 'workflow-instances/:id', element: <WorkflowDetailPage /> },
          { path: 'workflow-instances/:id/timeline', element: <WorkflowTimelinePage /> },
          { path: 'workflow-instances/:id/action', element: <WorkflowActionPage /> },
        ],
      },
    ],
  },
  {
    path: '/',
    element: <Navigate to="/v2/worklist" replace />,
  },
  {
    path: '*',
    element: <Navigate to="/v2/worklist" replace />,
  },
]);

export function App() {
  return (
    <ConfigProvider
      theme={{
        cssVar: true,
        token: {
          borderRadius: 8,
          colorPrimary: '#1677ff',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        },
      }}
    >
      <AntApp>
        <RouterProvider router={router} />
      </AntApp>
    </ConfigProvider>
  );
}
