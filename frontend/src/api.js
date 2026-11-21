const TOKEN_KEY = 'tongchuang_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = token => token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { ...options, headers, body: options.body && !(options.body instanceof FormData) && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login') {
      setToken(null);
      window.dispatchEvent(new Event('tongchuang:unauthorized'));
    }
    const error = new Error(payload.error?.message || '网络请求失败，请稍后重试');
    error.code = payload.error?.code;
    error.details = payload.error?.details;
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

export async function downloadFile(path, filename) {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error?.message || '下载失败');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename || '同窗进阶练习.pdf'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
