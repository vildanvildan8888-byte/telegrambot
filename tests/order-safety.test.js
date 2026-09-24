import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const repositorySource = await readFile(new URL('../src/repositories/orders.js', import.meta.url), 'utf8');

test('checkout transaction locks cart rows, calculates from database products and clears the cart before commit', () => {
  assert.match(repositorySource, /await client\.query\('BEGIN'\)/);
  assert.match(repositorySource, /SELECT ci\.product_id, ci\.quantity, p\.name, p\.price, p\.is_available[\s\S]*FOR UPDATE OF ci, p/);
  assert.match(repositorySource, /const total = cart\.rows\.reduce\([\s\S]*Number\(item\.price\) \* Number\(item\.quantity\)/);
  assert.match(repositorySource, /INSERT INTO orders\([\s\S]*INSERT INTO order_items\(/);
  assert.match(repositorySource, /DELETE FROM cart_items ci USING products p[\s\S]*await client\.query\('COMMIT'\)/);
  assert.match(repositorySource, /await client\.query\('ROLLBACK'\)/);
});

test('customer order detail query is scoped by order number, authenticated user ID and restaurant ID', () => {
  const start = repositorySource.indexOf('export async function getUserOrder');
  const end = repositorySource.indexOf('export async function getOrder', start);
  const method = repositorySource.slice(start, end);
  assert.match(method, /WHERE o\.order_number = \$1 AND o\.user_id = \$2 AND o\.restaurant_id = \$3/);
  assert.match(method, /\[orderNumber, userId, restaurantId\]/);
  assert.match(method, /if \(!orderResult\.rowCount\) return null/);
});

test('existing order status transitions remain the shared status rules', async () => {
  const { ORDER_STATUSES, canTransition } = await import('../src/domain/order-status.js');
  assert.deepEqual(Object.keys(ORDER_STATUSES), ['new', 'accepted', 'preparing', 'delivering', 'delivered', 'cancelled']);
  assert.equal(canTransition('new', 'accepted'), true);
  assert.equal(canTransition('new', 'delivered'), false);
});
