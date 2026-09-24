import {
  createMiniAppSession,
  miniAppSessionCookie,
  readMiniAppSessionCookie,
  validateTelegramInitData,
  verifyMiniAppSession,
} from './auth.js';

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
  return {
    id: String(product.id),
    categoryId: String(product.category_id),
    name: product.name,
    description: product.description,
    price: Number(product.price),
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
}) {
  const required = [upsertUser, findUserByTelegramId, listCategories, listProducts, getProduct];
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
    if (method !== 'GET') {
      response.setHeader('allow', 'GET, POST');
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
