// src/api/client.js
// fetch 封装 + 全局错误处理

const BASE = '/api';

async function request(method, path, body = null, options = {}) {
  const url = BASE + path;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  };
  if (body !== null) opts.body = JSON.stringify(body);

  let resp;
  try {
    resp = await fetch(url, opts);
  } catch (e) {
    throw new ApiError(0, `网络错误: ${e.message}`, { offline: true });
  }

  const contentType = resp.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await resp.json().catch(() => null) : await resp.text();

  if (!resp.ok) {
    const detail = (isJson && data?.detail) || data || `HTTP ${resp.status}`;
    throw new ApiError(resp.status, detail, data);
  }

  return data;
}

export class ApiError extends Error {
  constructor(status, message, data = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export const api = {
  get: (path, opts) => request('GET', path, null, opts),
  post: (path, body, opts) => request('POST', path, body, opts),
  put: (path, body, opts) => request('PUT', path, body, opts),
  patch: (path, body, opts) => request('PATCH', path, body, opts),
  del: (path, opts) => request('DELETE', path, null, opts),
};

// 探测后端是否可用
export async function probeBackend() {
  try {
    const data = await api.get('/health');
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
