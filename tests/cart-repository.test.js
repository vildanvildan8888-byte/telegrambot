import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const repositorySource = await readFile(new URL('../src/repositories/cart.js', import.meta.url), 'utf8');

test('Mini App cart quantity uses an absolute upsert scoped to an available restaurant product', () => {
  const implementation = repositorySource.match(/export async function setQuantity[\s\S]*?\n}\n/);
  assert.ok(implementation);
  assert.match(implementation[0], /!Number\.isInteger\(quantity\) \|\| quantity < 1 \|\| quantity > 99/);
  assert.match(implementation[0], /WHERE id = \$1 AND restaurant_id = \$2 AND is_available = TRUE/);
  assert.match(implementation[0], /ON CONFLICT \(user_id, product_id\) DO UPDATE/);
  assert.match(implementation[0], /SET quantity = EXCLUDED\.quantity/);
  assert.doesNotMatch(implementation[0], /quantity = cart_items\.quantity \+/);
  assert.match(implementation[0], /\[userId, productId, quantity\]/);
});
