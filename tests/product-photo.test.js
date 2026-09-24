import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteProductPhoto, saveProductPhoto } from '../src/repositories/catalog-photo.js';
import { largestTelegramPhotoFileId } from '../src/bot/product-photo.js';

function photoDatabase() {
  const product = { id: 12, name: 'Классический бургер', category_id: 3, photo_url: null };
  const calls = [];
  return {
    product,
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (params[0] !== 'tasty-yard-demo' || Number(params[1]) !== product.id) return { rows: [] };
      product.photo_url = sql.includes('SET photo_url = NULL') ? null : params[2];
      return { rows: [{ ...product }] };
    },
  };
}

test('product photo can be saved and replaced with another Telegram file_id', async () => {
  const database = photoDatabase();
  assert.equal((await saveProductPhoto(database, 'tasty-yard-demo', 12, 'telegram-file-1')).photo_url,
    'telegram-file-1');
  assert.equal((await saveProductPhoto(database, 'tasty-yard-demo', 12, 'telegram-file-2')).photo_url,
    'telegram-file-2');
  assert.deepEqual(database.calls.map(({ params }) => params), [
    ['tasty-yard-demo', 12, 'telegram-file-1'],
    ['tasty-yard-demo', 12, 'telegram-file-2'],
  ]);
  assert.match(database.calls[0].sql, /WHERE restaurant_id = \$1 AND id = \$2/);
});

test('deleting product photo sets photo_url to SQL NULL', async () => {
  const database = photoDatabase();
  await saveProductPhoto(database, 'tasty-yard-demo', 12, 'telegram-file-1');
  const removed = await deleteProductPhoto(database, 'tasty-yard-demo', 12);
  assert.equal(removed.photo_url, null);
  assert.match(database.calls.at(-1).sql, /SET photo_url = NULL/);
  assert.deepEqual(database.calls.at(-1).params, ['tasty-yard-demo', 12]);
});

test('product photo mutations do not update products from another restaurant', async () => {
  const database = photoDatabase();
  assert.equal(await saveProductPhoto(database, 'another-restaurant', 12, 'file-id'), null);
  assert.equal(await deleteProductPhoto(database, 'another-restaurant', 12), null);
  assert.equal(database.product.photo_url, null);
});

test('largest available Telegram photo size is selected', () => {
  assert.equal(largestTelegramPhotoFileId([
    { file_id: 'small', width: 90, height: 90 },
    { file_id: 'large', width: 800, height: 800 },
    { file_id: 'medium', width: 320, height: 320 },
  ]), 'large');
  assert.equal(largestTelegramPhotoFileId([{ file_id: 'file-size-fallback', file_size: 10 }]), 'file-size-fallback');
  assert.equal(largestTelegramPhotoFileId([]), null);
});
