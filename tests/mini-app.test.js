import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { createMiniAppApi } from '../src/mini-app/api.js';
import { validateTelegramInitData } from '../src/mini-app/auth.js';

const SIGNING_KEY = 'test-key-for-initdata-signature';
const SESSION_SECRET = 'unit-test-webapp-session-secret-long-enough';
const ORIGIN = 'https://tasty-yard.example';
const RESTAURANT_ID = 'tasty-yard-demo';

function signedInitData(user, authDate = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'unit-test-query',
    user: JSON.stringify(user),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(SIGNING_KEY).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function testDependencies() {
  const users = new Map();
  const internalIds = new Map();
  const calls = [];
  const cartItems = new Map();
  const customerOrders = [];
  let orderSequence = 1000;
  let orderQueue = Promise.resolve();
  const categories = [
    { id: 7, slug: 'burgers', name: '🍔 Бургеры' },
    { id: 9, slug: 'snacks', name: '🍟 Закуски' },
    { id: 8, slug: 'drinks', name: '🥤 Напитки' },
  ];
  const products = [
    { id: 51, category_id: 7, name: 'Классический бургер', description: 'Говядина и сыр.', price: 35000,
      photo_url: 'telegram-photo-51' },
    { id: 52, category_id: 7, name: 'Чикен бургер', description: 'Курица и салат.', price: 32000 },
    { id: 61, category_id: 8, name: 'Домашний лимонад', description: 'Лимон и мята.', price: 12000 },
    { id: 71, category_id: 9, name: 'Картофель фри', description: 'Золотистый картофель.', price: 15000 },
  ];
  return {
    calls,
    api: createMiniAppApi({
      botToken: SIGNING_KEY,
      sessionSecret: SESSION_SECRET,
      restaurantId: RESTAURANT_ID,
      origin: ORIGIN,
      upsertUser: async (from) => {
        const user = {
          id: internalIds.get(String(from.id)) ?? Number(from.id) + 1000,
          telegram_id: String(from.id),
          username: from.username ?? null,
          first_name: from.first_name ?? '',
          last_name: from.last_name ?? null,
          phone: null,
          address: null,
        };
        internalIds.set(user.telegram_id, user.id);
        users.set(user.telegram_id, user);
        return user;
      },
      findUserByTelegramId: async (telegramId) => users.get(String(telegramId)) ?? null,
      listCategories: async (restaurantId) => {
        calls.push(['categories', restaurantId]);
        return categories;
      },
      listProducts: async (restaurantId, categoryId) => {
        calls.push(['products', restaurantId, categoryId]);
        return restaurantId === RESTAURANT_ID
          ? products.filter((product) => product.category_id === categoryId)
          : [];
      },
      getProduct: async (restaurantId, productId) => {
        calls.push(['product', restaurantId, productId]);
        return restaurantId === RESTAURANT_ID
          ? products.find((product) => product.id === productId) ?? null
          : null;
      },
      getCart: async (userId, restaurantId) => {
        calls.push(['cart', userId, restaurantId]);
        const items = [...cartItems.values()]
          .filter((entry) => entry.userId === userId && restaurantId === RESTAURANT_ID)
          .map((entry) => {
            const product = products.find((item) => item.id === entry.productId);
            return {
              product_id: product.id,
              name: product.name,
              price: product.price,
              photo_url: product.photo_url ?? null,
              quantity: entry.quantity,
              line_total: product.price * entry.quantity,
            };
          });
        return { items, total: items.reduce((sum, item) => sum + item.line_total, 0) };
      },
      setCartQuantity: async (userId, restaurantId, productId, quantity) => {
        calls.push(['setCartQuantity', userId, restaurantId, productId, quantity]);
        const product = products.find((item) => item.id === productId);
        if (!product || restaurantId !== RESTAURANT_ID) return false;
        cartItems.set(`${userId}:${productId}`, { userId, productId, quantity });
        return true;
      },
      deleteCartItem: async (userId, restaurantId, productId) => {
        calls.push(['deleteCartItem', userId, restaurantId, productId]);
        const key = `${userId}:${productId}`;
        return restaurantId === RESTAURANT_ID && cartItems.delete(key);
      },
      placeOrder: (input) => {
        const place = async () => {
          calls.push(['placeOrder', input.userId, input.restaurantId, input.details]);
          const details = input.details;
          if (!['cash', 'card_on_delivery'].includes(details.paymentMethod)
            || String(details.name ?? '').trim().length < 2
            || !/^\+?[\d ()-]{7,20}$/.test(String(details.phone ?? '').trim())
            || String(details.address ?? '').trim().length < 5
            || String(details.comment ?? '').length > 500) {
            throw Object.assign(new Error('Проверьте данные заказа.'), { code: 'CHECKOUT_VALIDATION' });
          }
          const entries = [...cartItems.values()].filter((entry) => entry.userId === input.userId);
          if (!entries.length) throw Object.assign(new Error('Корзина пуста.'), { code: 'EMPTY_CART' });
          const items = entries.map((entry) => {
            const product = products.find((item) => item.id === entry.productId);
            return { product_id: product.id, product_name: product.name, name: product.name,
              price: product.price, unit_price: product.price, quantity: entry.quantity,
              line_total: product.price * entry.quantity };
          });
          for (const entry of entries) cartItems.delete(`${entry.userId}:${entry.productId}`);
          const order = {
            id: ++orderSequence, order_number: orderSequence, status: 'new',
            total_amount: items.reduce((sum, item) => sum + item.line_total, 0),
            created_at: new Date().toISOString(), customer_name: details.name, phone: details.phone,
            address: details.address, comment: details.comment, payment_method: details.paymentMethod,
            user_id: input.userId, restaurant_id: input.restaurantId, items,
          };
          customerOrders.push(order);
          return order;
        };
        const result = orderQueue.then(place, place);
        orderQueue = result.then(() => undefined, () => undefined);
        return result;
      },
      listCustomerOrders: async (userId, restaurantId) => {
        calls.push(['listCustomerOrders', userId, restaurantId]);
        return customerOrders.filter((order) => order.user_id === userId && order.restaurant_id === restaurantId);
      },
      loadCustomerOrder: async (orderNumber, userId, restaurantId) => {
        calls.push(['loadCustomerOrder', orderNumber, userId, restaurantId]);
        return customerOrders.find((order) => order.order_number === orderNumber
          && order.user_id === userId && order.restaurant_id === restaurantId) ?? null;
      },
      notifyAdmin: async (order) => { calls.push(['notifyAdmin', order.order_number]); },
      notifyCustomer: async (telegramId, order) => { calls.push(['notifyCustomer', telegramId, order.order_number]); },
      getTelegramPhoto: async (fileId) => {
        calls.push(['telegramPhoto', fileId]);
        if (fileId !== 'telegram-photo-51') throw new Error('file missing');
        return { buffer: Buffer.from('test-image'), contentType: 'image/jpeg' };
      },
    }),
  };
}

async function withApi(api, run) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'POST' || request.method === 'PUT') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      try {
        request.body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        request.body = {};
      }
    }
    await api(request, response, url);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function authenticate(base, initData = signedInitData({ id: 101, first_name: 'Али' }), extra = {}) {
  return fetch(`${base}/api/v1/auth/telegram`, {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      ...extra.headers,
    },
    body: JSON.stringify({ initData, ...extra.body }),
  });
}

test('a correctly signed Telegram initData value passes verification', () => {
  const now = 1_800_000_000;
  const user = { id: 101, first_name: 'Али' };
  const verified = validateTelegramInitData(signedInitData(user, now), SIGNING_KEY, { nowSeconds: now });
  assert.deepEqual(verified.user, user);
  assert.equal(verified.authDate, now);
});

test('Telegram initData with an invalid hash is rejected', () => {
  const params = new URLSearchParams(signedInitData({ id: 101 }));
  params.set('hash', '0'.repeat(64));
  assert.throws(() => validateTelegramInitData(params.toString(), SIGNING_KEY), /не прошла проверку/);
});

test('Telegram initData with an expired auth_date is rejected', () => {
  const now = 1_800_000_000;
  const old = signedInitData({ id: 101 }, now - 601);
  assert.throws(() => validateTelegramInitData(old, SIGNING_KEY, {
    nowSeconds: now,
    maxAgeSeconds: 600,
  }), /устарели/);
});

test('unauthenticated requests cannot retrieve /api/v1/me', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const response = await fetch(`${base}/api/v1/me`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).user, undefined);
    assert.deepEqual(calls, []);
  });
});

test('the authenticated Telegram user remains the only identity for /me', async () => {
  const { api } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base, signedInitData({ id: 101, first_name: 'Али' }), {
      body: { telegram_id: '202', user_id: 202 },
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);

    const response = await fetch(`${base}/api/v1/me?telegram_id=202&user_id=202`, {
      headers: { cookie: cookie.split(';', 1)[0] },
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.user.telegramId, '101');
    assert.equal(body.user.firstName, 'Али');
    assert.equal(Object.hasOwn(body.user, 'id'), false);
  });
});

test('catalog categories come from the configured restaurant repository', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const response = await fetch(`${base}/api/v1/categories`, { headers: { cookie } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.categories.map((item) => item.slug), ['burgers', 'snacks', 'drinks']);
    assert.deepEqual(calls.at(-1), ['categories', RESTAURANT_ID]);
  });
});

test('catalog products return server names, descriptions and prices for a validated category', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const response = await fetch(`${base}/api/v1/products?categoryId=7`, { headers: { cookie } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.products.length, 2);
    assert.deepEqual(body.products[0], {
      id: '51', categoryId: '7', name: 'Классический бургер',
      description: 'Говядина и сыр.', price: 35000, photoUrl: '/api/v1/products/51/photo',
    });
    assert.deepEqual(calls.at(-1), ['products', RESTAURANT_ID, 7]);
  });
});

test('catalog product details are limited to an available product in the configured restaurant', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const response = await fetch(`${base}/api/v1/products/51`, { headers: { cookie } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.product.name, 'Классический бургер');
    assert.equal(body.product.price, 35000);
    assert.equal(Object.hasOwn(body.product, 'photo_url'), false);
    assert.deepEqual(calls.at(-1), ['product', RESTAURANT_ID, 51]);
  });
});

test('product details endpoint resolves IDs for burgers, drinks and snacks', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];

    for (const [id, name, categoryId] of [
      [51, 'Классический бургер', '7'],
      [52, 'Чикен бургер', '7'],
      [61, 'Домашний лимонад', '8'],
      [71, 'Картофель фри', '9'],
    ]) {
      const response = await fetch(`${base}/api/v1/products/${id}`, { headers: { cookie } });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.product.id, String(id));
      assert.equal(body.product.categoryId, categoryId);
      assert.equal(body.product.name, name);
    }

    assert.deepEqual(calls.filter(([type]) => type === 'product').map(([, restaurantId, id]) => [restaurantId, id]), [
      [RESTAURANT_ID, 51],
      [RESTAURANT_ID, 52],
      [RESTAURANT_ID, 61],
      [RESTAURANT_ID, 71],
    ]);
  });
});

test('authenticated cart reads the shared cart and passes the internal database user ID', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const response = await fetch(`${base}/api/v1/cart`, { headers: { cookie } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { cart: { items: [], total: 0 } });
    assert.deepEqual(calls.at(-1), ['cart', 1101, RESTAURANT_ID]);
  });
});

test('cart PUT adds and replaces a quantity while prices and totals come from the server', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const first = await fetch(`${base}/api/v1/cart/items/51`, {
      method: 'PUT',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: 3, user_id: 999, price: 1, total: 1 }),
    });
    assert.equal(first.status, 200);
    const firstCart = (await first.json()).cart;
    assert.equal(firstCart.items[0].quantity, 3);
    assert.equal(firstCart.items[0].price, 35000);
    assert.equal(firstCart.items[0].lineTotal, 105000);
    assert.equal(firstCart.total, 105000);
    assert.deepEqual(calls.find(([type]) => type === 'setCartQuantity'), ['setCartQuantity', 1101,
      RESTAURANT_ID, 51, 3]);

    const update = await fetch(`${base}/api/v1/cart/items/51`, {
      method: 'PUT',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: 4 }),
    });
    assert.equal(update.status, 200);
    const updatedCart = (await update.json()).cart;
    assert.equal(updatedCart.items.length, 1);
    assert.equal(updatedCart.items[0].quantity, 4);
    assert.equal(updatedCart.total, 140000);
  });
});

test('cart PUT rejects quantities below 1 or above 99', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    for (const quantity of [0, 100]) {
      const response = await fetch(`${base}/api/v1/cart/items/51`, {
        method: 'PUT',
        headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ quantity }),
      });
      assert.equal(response.status, 400);
    }
    assert.equal(calls.some(([type]) => type === 'setCartQuantity'), false);
  });
});

test('unauthenticated users cannot write to the Mini App cart', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const response = await fetch(`${base}/api/v1/cart/items/51`, {
      method: 'PUT',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: 2 }),
    });
    assert.equal(response.status, 401);
    assert.equal(calls.some(([type]) => type === 'setCartQuantity'), false);
  });
});

test('cart writes reject an untrusted Origin and unavailable products', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const crossOrigin = await fetch(`${base}/api/v1/cart/items/51`, {
      method: 'PUT',
      headers: { cookie, origin: 'https://attacker.example', 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: 2 }),
    });
    assert.equal(crossOrigin.status, 403);

    const unavailable = await fetch(`${base}/api/v1/cart/items/999`, {
      method: 'PUT',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: 2 }),
    });
    assert.equal(unavailable.status, 404);
    assert.deepEqual(calls.filter(([type]) => type === 'setCartQuantity'), [
      ['setCartQuantity', 1101, RESTAURANT_ID, 999, 2],
    ]);
  });
});

test('cart updates and reads are isolated to the authenticated Telegram user', async () => {
  const { api } = testDependencies();
  await withApi(api, async (base) => {
    const firstLogin = await authenticate(base, signedInitData({ id: 101 }));
    const firstCookie = firstLogin.headers.get('set-cookie').split(';', 1)[0];
    const put = await fetch(`${base}/api/v1/cart/items/51`, {
      method: 'PUT',
      headers: { cookie: firstCookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: 2 }),
    });
    assert.equal(put.status, 200);

    const secondLogin = await authenticate(base, signedInitData({ id: 202 }));
    const secondCookie = secondLogin.headers.get('set-cookie').split(';', 1)[0];
    const secondCart = await fetch(`${base}/api/v1/cart`, { headers: { cookie: secondCookie } });
    assert.deepEqual((await secondCart.json()).cart, { items: [], total: 0 });
    const forbiddenDelete = await fetch(`${base}/api/v1/cart/items/51`, {
      method: 'DELETE',
      headers: { cookie: secondCookie, origin: ORIGIN },
    });
    assert.equal(forbiddenDelete.status, 404);

    const firstCart = await fetch(`${base}/api/v1/cart`, { headers: { cookie: firstCookie } });
    assert.equal((await firstCart.json()).cart.items[0].quantity, 2);
  });
});

test('cart DELETE removes the selected item and returns a recalculated server total', async () => {
  const { api } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    await fetch(`${base}/api/v1/cart/items/51`, {
      method: 'PUT',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: 2 }),
    });
    const response = await fetch(`${base}/api/v1/cart/items/51`, {
      method: 'DELETE',
      headers: { cookie, origin: ORIGIN },
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).cart, { items: [], total: 0 });
  });
});

test('product photo endpoint proxies a stored Telegram file ID without exposing the bot token', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const productResponse = await fetch(`${base}/api/v1/products/51`, { headers: { cookie } });
    const product = (await productResponse.json()).product;
    assert.equal(product.photoUrl, '/api/v1/products/51/photo');

    const photo = await fetch(`${base}${product.photoUrl}`, { headers: { cookie } });
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/jpeg');
    assert.equal(await photo.text(), 'test-image');
    assert.deepEqual(calls.at(-1), ['telegramPhoto', 'telegram-photo-51']);
    assert.equal(product.photoUrl.includes(SIGNING_KEY), false);
  });
});

test('product without a photo returns no photo URL and photo endpoint responds 404', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const product = await fetch(`${base}/api/v1/products/52`, { headers: { cookie } });
    assert.equal(Object.hasOwn((await product.json()).product, 'photoUrl'), false);
    const photo = await fetch(`${base}/api/v1/products/52/photo`, { headers: { cookie } });
    assert.equal(photo.status, 404);
    assert.equal(calls.some(([type]) => type === 'telegramPhoto'), false);
  });
});

test('Telegram auth rejects requests from an untrusted web origin', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const response = await authenticate(base, signedInitData({ id: 101 }), {
      headers: { origin: 'https://attacker.example' },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(calls, []);
  });
});

test('changing product or user IDs cannot read another user or a product outside this catalog', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base, signedInitData({ id: 101, first_name: 'Али' }));
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const foreignUser = await fetch(`${base}/api/v1/me/202`, { headers: { cookie } });
    assert.equal(foreignUser.status, 404);
    const foreignProduct = await fetch(`${base}/api/v1/products/999`, { headers: { cookie } });
    assert.equal(foreignProduct.status, 404);
    assert.deepEqual(calls.at(-1), ['product', RESTAURANT_ID, 999]);
  });
});

const validOrderDetails = {
  name: 'Али', phone: '+998 90 123 45 67', address: 'Ташкент, улица Навои, 10',
  comment: 'Без лука', paymentMethod: 'cash',
};

async function addProductToCart(base, cookie, productId = 51, quantity = 2) {
  return fetch(`${base}/api/v1/cart/items/${productId}`, {
    method: 'PUT',
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ quantity }),
  });
}

test('Mini App order endpoint requires an authenticated Telegram session', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const response = await fetch(`${base}/api/v1/orders`, {
      method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify(validOrderDetails),
    });
    assert.equal(response.status, 401);
    assert.equal(calls.some(([type]) => type === 'placeOrder'), false);
  });
});

test('Mini App checkout uses authenticated user, current server price, clears cart and notifies both sides', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    await addProductToCart(base, cookie, 51, 2);
    const response = await fetch(`${base}/api/v1/orders`, {
      method: 'POST',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ ...validOrderDetails, user_id: 202, total: 1, price: 1, status: 'delivered' }),
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.order.total, 70000);
    assert.equal(body.order.items[0].unitPrice, 35000);
    assert.equal(body.order.items[0].quantity, 2);
    assert.equal(body.order.items[0].lineTotal, 70000);
    assert.equal(body.order.status, 'new');
    assert.deepEqual(body.notifications, { customer: true, admin: true });
    assert.deepEqual(calls.find(([type]) => type === 'placeOrder').slice(1, 3), [1101, RESTAURANT_ID]);
    assert.equal(Object.hasOwn(body.order, 'user_id'), false);
    assert.equal(Object.hasOwn(body.order, 'id'), false);
    assert.equal(calls.some(([type, id]) => type === 'notifyCustomer' && id === '101'), true);
    assert.equal(calls.some(([type]) => type === 'notifyAdmin'), true);
    const refreshed = await fetch(`${base}/api/v1/cart`, { headers: { cookie } });
    assert.deepEqual((await refreshed.json()).cart, { items: [], total: 0 });
  });
});

test('empty Mini App cart and unsupported payment methods are rejected', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const empty = await fetch(`${base}/api/v1/orders`, {
      method: 'POST', headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify(validOrderDetails),
    });
    assert.equal(empty.status, 409);
    await addProductToCart(base, cookie);
    const invalid = await fetch(`${base}/api/v1/orders`, {
      method: 'POST', headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ ...validOrderDetails, paymentMethod: 'online' }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(calls.some(([type]) => type === 'notifyAdmin'), false);
  });
});

test('order history and detail endpoints are scoped to the signed-in user and restaurant', async () => {
  const { api, calls } = testDependencies();
  await withApi(api, async (base) => {
    const firstLogin = await authenticate(base, signedInitData({ id: 101 }));
    const firstCookie = firstLogin.headers.get('set-cookie').split(';', 1)[0];
    await addProductToCart(base, firstCookie, 51, 1);
    const created = await fetch(`${base}/api/v1/orders`, {
      method: 'POST', headers: { cookie: firstCookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify(validOrderDetails),
    });
    const order = (await created.json()).order;

    const list = await fetch(`${base}/api/v1/orders`, { headers: { cookie: firstCookie } });
    const listed = (await list.json()).orders;
    assert.equal(list.status, 200);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].status, 'new');
    assert.equal(listed[0].statusLabel, 'Новый');

    const detail = await fetch(`${base}/api/v1/orders/${order.orderNumber}`, { headers: { cookie: firstCookie } });
    const detailBody = await detail.json();
    assert.equal(detail.status, 200);
    assert.equal(detailBody.order.address, validOrderDetails.address);
    assert.equal(detailBody.order.paymentMethod, 'cash');
    assert.equal(detailBody.order.items[0].name, 'Классический бургер');

    const secondLogin = await authenticate(base, signedInitData({ id: 202 }));
    const secondCookie = secondLogin.headers.get('set-cookie').split(';', 1)[0];
    const foreignList = await fetch(`${base}/api/v1/orders`, { headers: { cookie: secondCookie } });
    const foreignDetail = await fetch(`${base}/api/v1/orders/${order.orderNumber}`, { headers: { cookie: secondCookie } });
    assert.deepEqual((await foreignList.json()).orders, []);
    assert.equal(foreignDetail.status, 404);
    assert.deepEqual(calls.filter(([type]) => type === 'loadCustomerOrder').at(-1),
      ['loadCustomerOrder', Number(order.orderNumber), 1202, RESTAURANT_ID]);
  });
});

test('repeated Mini App checkout submission cannot create two orders from the same cart', async () => {
  const { api } = testDependencies();
  await withApi(api, async (base) => {
    const login = await authenticate(base);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    await addProductToCart(base, cookie, 51, 1);
    const submit = () => fetch(`${base}/api/v1/orders`, {
      method: 'POST', headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify(validOrderDetails),
    });
    const responses = await Promise.all([submit(), submit()]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  });
});
