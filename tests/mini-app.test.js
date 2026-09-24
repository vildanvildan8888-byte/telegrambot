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
  const calls = [];
  const categories = [
    { id: 7, slug: 'burgers', name: '🍔 Бургеры' },
    { id: 9, slug: 'snacks', name: '🍟 Закуски' },
    { id: 8, slug: 'drinks', name: '🥤 Напитки' },
  ];
  const products = [
    { id: 51, category_id: 7, name: 'Классический бургер', description: 'Говядина и сыр.', price: 35000 },
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
          telegram_id: String(from.id),
          username: from.username ?? null,
          first_name: from.first_name ?? '',
          last_name: from.last_name ?? null,
          phone: null,
          address: null,
        };
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
    }),
  };
}

async function withApi(api, run) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'POST') {
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
      description: 'Говядина и сыр.', price: 35000,
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
