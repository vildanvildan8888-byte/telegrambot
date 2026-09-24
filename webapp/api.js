const telegramApp = window.Telegram?.WebApp;
const initData = telegramApp?.initData ?? '';

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Не удалось загрузить данные.');
  return result;
}

export async function authenticateTelegram() {
  if (!initData) throw new Error('Откройте приложение через Telegram, чтобы войти.');
  return request('/api/v1/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData }),
  });
}

export function getMe() {
  return request('/api/v1/me');
}

export function getCategories() {
  return request('/api/v1/categories');
}

export function getProducts(categoryId) {
  return request(`/api/v1/products?categoryId=${encodeURIComponent(categoryId)}`);
}

export function getProduct(productId) {
  return request(`/api/v1/products/${encodeURIComponent(productId)}`);
}

export { telegramApp };
