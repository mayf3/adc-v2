const BASE_URL = '/api/v2';

interface ApiClient {
  get(path: string, config?: { params?: Record<string, string | undefined> }): Promise<{ data: unknown }>;
  post(path: string, body?: unknown, config?: { headers?: Record<string, string> }): Promise<{ data: unknown }>;
}

async function request(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  config?: { params?: Record<string, string | undefined>; headers?: Record<string, string> },
): Promise<{ data: unknown }> {
  let url = `${BASE_URL}${path}`;
  if (config?.params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(config.params)) {
      if (value !== undefined) search.set(key, value);
    }
    const suffix = search.toString();
    if (suffix) url += `?${suffix}`;
  }

  const headers: Record<string, string> = {
    ...(config?.headers ?? {}),
  };
  // Inject stored token if available
  const token = getStoredToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const apiError = new Error(
      (errorData as { error?: { message?: string } })?.error?.message ?? `HTTP ${response.status}`,
    ) as Error & { status?: number; response?: unknown };
    apiError.status = response.status;
    apiError.response = errorData;
    throw apiError;
  }

  return { data: await response.json() };
}

function getStoredToken(): string | null {
  try {
    return localStorage.getItem('adc_v2_token');
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem('adc_v2_token', token);
    } else {
      localStorage.removeItem('adc_v2_token');
    }
  } catch {
    // Storage may be unavailable
  }
}

export const apiClient: ApiClient = {
  get: (path, config) => request('GET', path, undefined, config),
  post: (path, body, config) => request('POST', path, body, config),
};
