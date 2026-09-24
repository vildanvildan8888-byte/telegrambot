import test from 'node:test';
import assert from 'node:assert/strict';

test('Mini App cart client sends only quantity and uses same-origin cart routes', async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.window = { Telegram: { WebApp: { initData: 'signed-init-data' } } };
  globalThis.fetch = async (path, options = {}) => {
    requests.push({ path, options });
    return new Response(JSON.stringify({ cart: { items: [], total: 0 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const api = await import(`../webapp/api.js?cart-client-test=${Date.now()}`);
    await api.setCartItemQuantity('51', 3);
    await api.getCart();
    await api.deleteCartItem('51');

    assert.equal(requests[0].path, '/api/v1/cart/items/51');
    assert.equal(requests[0].options.method, 'PUT');
    assert.deepEqual(JSON.parse(requests[0].options.body), { quantity: 3 });
    assert.equal(requests[0].options.credentials, 'same-origin');
    assert.deepEqual(requests.slice(1).map(({ path, options }) => [path, options.method ?? 'GET']), [
      ['/api/v1/cart', 'GET'],
      ['/api/v1/cart/items/51', 'DELETE'],
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
