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
