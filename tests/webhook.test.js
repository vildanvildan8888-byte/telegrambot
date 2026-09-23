import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWebhookUrl,
  parsePort,
  resolveWebhookSecret,
  secretsMatch,
  validateRuntimeConfig,
  WEBHOOK_PATH,
} from '../src/webhook.js';

test('builds a Telegram endpoint from a public Render base URL', () => {
  assert.equal(buildWebhookUrl('https://tasty-yard.onrender.com/'),
    `https://tasty-yard.onrender.com${WEBHOOK_PATH}`);
  assert.throws(() => buildWebhookUrl('http://tasty-yard.onrender.com'), /HTTPS/);
  assert.throws(() => buildWebhookUrl('https://example.com/prefix'), /HTTPS URL/);
});

test('validates startup settings and rejects an empty bot token before starting', () => {
  const valid = {
    botToken: 'fake-token-for-validation',
    adminId: '123456',
    webhookUrl: 'https://tasty-yard.onrender.com',
  };
  assert.doesNotThrow(() => validateRuntimeConfig(valid));
  assert.throws(() => validateRuntimeConfig({ ...valid, botToken: '' }), /BOT_TOKEN/);
  assert.throws(() => validateRuntimeConfig({ ...valid, adminId: 'admin' }), /числовым/);
  assert.throws(() => validateRuntimeConfig({ ...valid, webhookUrl: '' }), /WEBHOOK_URL/);
});

test('uses a stable derived webhook secret unless a valid secret is configured', () => {
  const first = resolveWebhookSecret('', 'fake-token-for-validation');
  assert.equal(first, resolveWebhookSecret('', 'fake-token-for-validation'));
  assert.equal(resolveWebhookSecret('custom_secret-123', 'token'), 'custom_secret-123');
  assert.throws(() => resolveWebhookSecret('bad secret', 'token'), /WEBHOOK_SECRET/);
  assert.equal(secretsMatch(first, first), true);
  assert.equal(secretsMatch(first, 'wrong'), false);
});

test('validates Render port values', () => {
  assert.equal(parsePort('10000'), 10000);
  assert.equal(parsePort(undefined), 3000);
  assert.throws(() => parsePort('abc'), /PORT/);
});
