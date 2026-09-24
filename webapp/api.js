const telegramApp = window.Telegram?.WebApp;
const initData = telegramApp?.initData ?? '';

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error('Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.');
  }
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

export function getCart() {
  return request('/api/v1/cart');
}

export function setCartItemQuantity(productId, quantity) {
  return request(`/api/v1/cart/items/${encodeURIComponent(productId)}`, {
    method: 'PUT',
    body: JSON.stringify({ quantity }),
  });
}

export function deleteCartItem(productId) {
  return request(`/api/v1/cart/items/${encodeURIComponent(productId)}`, { method: 'DELETE' });
}

export function createOrder(details) {
  return request('/api/v1/orders', { method: 'POST', body: JSON.stringify(details) });
}

export function getOrders() {
  return request('/api/v1/orders');
}

export function getOrder(orderNumber) {
  return request(`/api/v1/orders/${encodeURIComponent(orderNumber)}`);
}

export { telegramApp };
