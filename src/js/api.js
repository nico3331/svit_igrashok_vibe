// A single API client keeps session and CSRF handling out of UI components.
let csrfToken = null;
export function setCsrf(value) {
  csrfToken = value;
}
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const isForm = body instanceof FormData;
  const response = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'svit-shop',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(!isForm && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const result = await response
    .json()
    .catch(() => ({ error: 'Сервер повернув неочікувану відповідь.' }));
  if (!response.ok) {
    const error = new Error(result.error || 'Не вдалося виконати запит.');
    error.status = response.status;
    throw error;
  }
  return result;
}
export async function session() {
  const result = await api('/auth/me');
  setCsrf(result.csrfToken);
  return result.user;
}
