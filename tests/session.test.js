import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureSession, getSessionKey } from '../src/bot/session.js';

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
