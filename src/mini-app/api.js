import {
  createMiniAppSession,
  miniAppSessionCookie,
  readMiniAppSessionCookie,
  validateTelegramInitData,
  verifyMiniAppSession,
} from './auth.js';
import { ORDER_STATUSES } from '../domain/order-status.js';
import { paymentLabel } from '../domain/format.js';

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function safeUser(user) {
  return {
    telegramId: String(user.telegram_id),
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    phone: user.phone,
    address: user.address,
  };
}

function productView(product) {
  const view = {
    id: String(product.id),
    categoryId: String(product.category_id),
    name: product.name,
    description: product.description,
    price: Number(product.price),
  };
  if (product.photo_url) view.photoUrl = `/api/v1/products/${encodeURIComponent(view.id)}/photo`;
  return view;
}

function cartView(cart) {
  return {
    items: cart.items.map((item) => ({
      productId: String(item.product_id),
      name: item.name,
      price: Number(item.price),
      quantity: Number(item.quantity),
      lineTotal: Number(item.line_total),
      photoUrl: item.photo_url
        ? `/api/v1/products/${encodeURIComponent(String(item.product_id))}/photo`
        : null,
    })),
    total: Number(cart.total),
  };
}

function orderSummary(order) {
  return {
    orderNumber: String(order.order_number),
    total: Number(order.total_amount),
    status: order.status,
    statusLabel: ORDER_STATUSES[order.status] ?? order.status,
    createdAt: order.created_at,
  };
}

function orderDetails(order) {
  return {
    ...orderSummary(order),
    name: order.customer_name,
    phone: order.phone,
    address: order.address,
    comment: order.comment ?? '',
    paymentMethod: order.payment_method,
    paymentLabel: paymentLabel(order.payment_method),
    items: (order.items ?? []).map((item) => ({
      name: item.product_name ?? item.name,
      unitPrice: Number(item.unit_price ?? item.price),
      quantity: Number(item.quantity),
      lineTotal: Number(item.line_total ?? Number(item.unit_price ?? item.price) * Number(item.quantity)),
    })),
  };
}

function parsePositiveId(value) {
  if (!/^\d+$/.test(String(value ?? ''))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function createMiniAppApi({
  botToken,
  sessionSecret,
  restaurantId,
  origin,
  upsertUser,
  findUserByTelegramId,
  listCategories,
  listProducts,
  getProduct,
  getCart,
  setCartQuantity,
  deleteCartItem,
  getTelegramPhoto,
  placeOrder,
  listCustomerOrders,
  loadCustomerOrder,
  notifyAdmin,
  notifyCustomer,
}) {
  const required = [upsertUser, findUserByTelegramId, listCategories, listProducts, getProduct,
    getCart, setCartQuantity, deleteCartItem, getTelegramPhoto, placeOrder,
    listCustomerOrders, loadCustomerOrder, notifyAdmin, notifyCustomer];
  if (required.some((dependency) => typeof dependency !== 'function')) {
    throw new TypeError('Mini App API repository functions are required.');
  }

  return async function handleMiniAppApi(request, response, url) {
    const pathname = url.pathname;
    const method = request.method;

    if (method === 'POST' && pathname === '/api/v1/auth/telegram') {
      if (typeof sessionSecret !== 'string' || sessionSecret.length < 32) {
        json(response, 503, { error: 'Задайте WEBAPP_SESSION_SECRET длиной не менее 32 символов.' });
        return;
      }
      if (request.headers.origin !== origin) {
        json(response, 403, { error: 'Запрос пришёл с недоверенного источника.' });
        return;
      }
      let user;
      try {
        ({ user } = validateTelegramInitData(request.body?.initData, botToken));
      } catch (error) {
        const status = error.message?.includes('не настроена') ? 503 : 401;
        json(response, status, { error: error.message || 'Не удалось выполнить вход через Telegram.' });
        return;
      }
      try {
        const storedUser = await upsertUser(user);
        const session = createMiniAppSession(storedUser.telegram_id, sessionSecret);
        json(response, 200, { ok: true }, { 'set-cookie': miniAppSessionCookie(session) });
      } catch (error) {
        console.error('Ошибка создания сессии Mini App:', error.message);
        json(response, 500, { error: 'Не удалось создать сессию Mini App.' });
      }
      return;
    }

    if (!pathname.startsWith('/api/v1/')) {
      json(response, 404, { error: 'Not found' });
      return;
    }
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) {
      response.setHeader('allow', 'GET, POST, PUT, DELETE');
      json(response, 405, { error: 'Method not allowed' });
      return;
    }

    const sessionToken = readMiniAppSessionCookie(request.headers.cookie);
    const telegramId = verifyMiniAppSession(sessionToken, sessionSecret);
    if (!telegramId) {
      json(response, 401, { error: 'Сессия истекла. Откройте Mini App заново.' });
      return;
    }

    try {
      const user = await findUserByTelegramId(telegramId);
      if (!user) {
        json(response, 401, { error: 'Пользователь не найден. Откройте Mini App заново.' });
        return;
      }

      if ((method === 'POST' || method === 'PUT' || method === 'DELETE') && request.headers.origin !== origin) {
        json(response, 403, { error: 'Запрос пришёл с недоверенного источника.' });
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/orders') {
        const details = {
          name: request.body?.name,
          phone: request.body?.phone,
          address: request.body?.address,
          comment: request.body?.comment ?? '',
          paymentMethod: request.body?.paymentMethod,
        };
        try {
          const order = await placeOrder({ userId: user.id, restaurantId, details });
          const notifications = { customer: false, admin: false };
          try { await notifyCustomer(user.telegram_id, order); notifications.customer = true; }
          catch (error) { console.error('Заказ создан, уведомление клиента не отправлено:', error.message); }
          try { await notifyAdmin(order); notifications.admin = true; }
          catch (error) { console.error('Заказ создан, уведомление администратору не отправлено:', error.message); }
          json(response, 201, { order: orderDetails(order), notifications });
        } catch (error) {
          const status = error.code === 'CHECKOUT_VALIDATION' ? 400
            : error.code === 'EMPTY_CART' ? 409
              : error.code === 'UNAVAILABLE_ITEM' ? 409 : 500;
          if (status === 500) console.error('Ошибка оформления Mini App заказа:', error.message);
          json(response, status, { error: status === 500 ? 'Не удалось оформить заказ.' : error.message });
        }
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/orders') {
        const orders = await listCustomerOrders(user.id, restaurantId);
        json(response, 200, { orders: orders.map(orderSummary) });
        return;
      }

      const customerOrderMatch = pathname.match(/^\/api\/v1\/orders\/(\d+)$/);
      if (method === 'GET' && customerOrderMatch) {
        const orderNumber = parsePositiveId(customerOrderMatch[1]);
        const order = orderNumber
          ? await loadCustomerOrder(orderNumber, user.id, restaurantId)
          : null;
        if (!order) {
          json(response, 404, { error: 'Заказ не найден.' });
          return;
        }
        json(response, 200, { order: orderDetails(order) });
        return;
      }

      const cartPath = pathname.match(/^\/api\/v1\/cart(?:\/items\/(\d+))?$/);
      if (pathname === '/api/v1/cart' && method === 'GET') {
        json(response, 200, { cart: cartView(await getCart(user.id, restaurantId)) });
        return;
      }
      if (cartPath?.[1] && method === 'PUT') {
        const productId = parsePositiveId(cartPath[1]);
        const quantity = request.body?.quantity;
        if (!productId) {
          json(response, 400, { error: 'Укажите корректный товар.' });
          return;
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
          json(response, 400, { error: 'Количество должно быть от 1 до 99.' });
          return;
        }
        const updated = await setCartQuantity(user.id, restaurantId, productId, quantity);
        if (!updated) {
          json(response, 404, { error: 'Товар не найден или больше недоступен.' });
          return;
        }
        json(response, 200, { cart: cartView(await getCart(user.id, restaurantId)) });
        return;
      }
      if (cartPath?.[1] && method === 'DELETE') {
        const productId = parsePositiveId(cartPath[1]);
        const removed = productId && await deleteCartItem(user.id, restaurantId, productId);
        if (!removed) {
          json(response, 404, { error: 'Позиция не найдена в корзине.' });
          return;
        }
        json(response, 200, { cart: cartView(await getCart(user.id, restaurantId)) });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/me') {
        json(response, 200, { user: safeUser(user) });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/categories') {
        const categories = await listCategories(restaurantId);
        json(response, 200, { categories: categories.map((category) => ({
          id: String(category.id),
          slug: category.slug,
          name: category.name,
        })) });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/products') {
        const categoryId = parsePositiveId(url.searchParams.get('categoryId'));
        if (!categoryId) {
          json(response, 400, { error: 'Укажите корректную категорию.' });
          return;
        }
        const products = await listProducts(restaurantId, categoryId);
        json(response, 200, { products: products.map(productView) });
        return;
      }

      const productMatch = pathname.match(/^\/api\/v1\/products\/(\d+)$/);
      const productPhotoMatch = pathname.match(/^\/api\/v1\/products\/(\d+)\/photo$/);
      if (method === 'GET' && productPhotoMatch) {
        const productId = parsePositiveId(productPhotoMatch[1]);
        const product = productId ? await getProduct(restaurantId, productId) : null;
        if (!product?.photo_url) {
          json(response, 404, { error: 'У этого товара пока нет фотографии.' });
          return;
        }
        try {
          const photo = await getTelegramPhoto(product.photo_url);
          response.writeHead(200, {
            'content-type': photo.contentType,
            'content-length': photo.buffer.length,
            'cache-control': 'private, max-age=300',
            'x-content-type-options': 'nosniff',
          });
          response.end(photo.buffer);
        } catch {
          console.warn('Не удалось получить фотографию товара из Telegram.');
          json(response, 502, { error: 'Фотография временно недоступна.' });
        }
        return;
      }
      if (method === 'GET' && productMatch) {
        const productId = parsePositiveId(productMatch[1]);
        const product = productId ? await getProduct(restaurantId, productId) : null;
        if (!product) {
          json(response, 404, { error: 'Товар не найден.' });
          return;
        }
        json(response, 200, { product: productView(product) });
        return;
      }

      json(response, 404, { error: 'Not found' });
    } catch (error) {
      console.error('Ошибка Mini App API:', error.message);
      json(response, 500, { error: 'Не удалось обработать запрос.' });
    }
  };
}
