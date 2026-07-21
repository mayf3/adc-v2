import { Navigate, Outlet, useLocation } from 'react-router-dom';

export function V2BearerRoute() {
  const location = useLocation();
  let token: string | null = null;
  try {
    token = localStorage.getItem('adc_v2_token');
  } catch {
    // Storage may be unavailable
  }

  // This is only a client-side presence check. svc-workflow remains the
  // authority for bearer validation, actor identity, scopes, and permissions.
  return token
    ? <Outlet />
    : <Navigate to="/login" replace state={{ from: location }} />;
}
