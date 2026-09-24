import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureSession, getSessionKey } from '../src/bot/session.js';
import { changeSelectedProductQuantity, selectedProductQuantity } from '../src/bot/product-quantity.js';
import { clearProductPhoto, showProductPhoto } from '../src/bot/product-photo.js';

test('session keys cover private, group, inline, and senderless chat updates', () => {
  assert.equal(getSessionKey({ from: { id: 7 }, chat: { id: 7 } }), '7:7');
  assert.equal(getSessionKey({ from: { id: 7 }, chat: { id: -42 } }), '7:-42');
  assert.equal(getSessionKey({ from: { id: 7 } }), '7:7');
  assert.equal(getSessionKey({ chat: { id: -42 } }), 'chat:-42');
  assert.equal(getSessionKey({}), undefined);
});

test('session state always provides an object and preserves existing state', () => {
  const missing = {};
  const created = ensureSession(missing);
  assert.deepEqual(created, {});
  created.checkout = { step: 'name' };
  assert.deepEqual(missing.session, { checkout: { step: 'name' } });

  const existing = { session: { profileStep: 'address' } };
  assert.equal(ensureSession(existing), existing.session);
  assert.deepEqual(existing.session, { profileStep: 'address' });
});

test('start, main-menu cancellation, and checkout session assignments are safe without a session key', () => {
  const ctx = { from: { id: 7 } };
  ensureSession(ctx);

  ctx.session.checkout = null;
  ctx.session.profileStep = null;
  ctx.session.checkout = { step: 'name' };
  assert.equal(ctx.session.checkout.step, 'name');

  ctx.session.checkout = null;
  ctx.session.profileStep = null;
  assert.equal(ctx.session.checkout, null);
  assert.equal(ctx.session.profileStep, null);
});

test('selected product quantities are independent and bounded from 1 to 99', () => {
  const session = {};
  assert.equal(selectedProductQuantity(session, 101), 1);
  assert.equal(changeSelectedProductQuantity(session, 101, 1).quantity, 2);
  assert.equal(changeSelectedProductQuantity(session, 202, 1).quantity, 2);
  assert.equal(changeSelectedProductQuantity(session, 101, 1).quantity, 3);
  assert.equal(selectedProductQuantity(session, 202), 2);

  session.productQuantities[303] = 99;
  assert.deepEqual(changeSelectedProductQuantity(session, 303, 1), {
    current: 99, quantity: 99, changed: false,
  });
  assert.deepEqual(changeSelectedProductQuantity(session, 101, -1), {
    current: 3, quantity: 2, changed: true,
  });
});

test('product photos are optional and failed uploads fall back without interrupting the card', async () => {
  const calls = [];
  const ctx = {
    session: {},
    replyWithPhoto: async (url) => {
      calls.push(url);
      throw new Error('Bad Request: wrong file identifier');
    },
  };

  assert.equal(await showProductPhoto(ctx, { id: 1, photo_url: null }), false);
  assert.equal(await showProductPhoto(ctx, { id: 1, photo_url: 'invalid-photo-reference' }), false);
  assert.deepEqual(calls, ['invalid-photo-reference']);
  assert.equal(ctx.session.productPhotoMessage, null);
});

test('a successful product photo is recorded in the active session for cleanup', async () => {
  const sent = [];
  const ctx = {
    session: {},
    replyWithPhoto: async (...args) => {
      sent.push(args);
      return { chat: { id: 7 }, message_id: 88 };
    },
  };

  assert.equal(await showProductPhoto(ctx, {
    id: 2,
    name: 'Чизбургер',
    photo_url: 'telegram-file-id',
  }), true);
  assert.deepEqual(sent, [[
    'telegram-file-id',
    { caption: '📷 Чизбургер' },
  ]]);
  assert.deepEqual(ctx.session.productPhotoMessage, { chatId: 7, messageId: 88 });
});

test('the photo associated with a product card is deleted when leaving the card', async () => {
  const deleted = [];
  const ctx = {
    session: { productPhotoMessage: { chatId: 7, messageId: 99 } },
    telegram: { deleteMessage: async (...args) => deleted.push(args) },
  };

  assert.equal(await clearProductPhoto(ctx), true);
  assert.deepEqual(deleted, [[7, 99]]);
  assert.equal(ctx.session.productPhotoMessage, null);
  assert.equal(await clearProductPhoto(ctx), false);
});
