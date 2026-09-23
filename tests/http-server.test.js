import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpServer } from '../src/http-server.js';

async function withServer(options, run) {
  const server = createHttpServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('health endpoint returns status ok', async () => {
  await withServer({ webhookHandler: async () => {}, webhookSecret: 'secret' }, async (base) => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
});

test('rejects invalid webhook secrets before processing updates', async () => {
  let handled = false;
  await withServer({ webhookHandler: async () => { handled = true; }, webhookSecret: 'correct' }, async (base) => {
    const response = await fetch(`${base}/telegram/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wrong' },
      body: JSON.stringify({ update_id: 1 }),
    });
    assert.equal(response.status, 403);
    assert.equal(handled, false);
  });
});

test('parses and forwards a valid Telegram webhook update', async () => {
  let received;
  await withServer({
    webhookSecret: 'correct',
    webhookHandler: async (request, response) => {
      received = request.body;
      response.writeHead(200).end();
    },
  }, async (base) => {
    const update = { update_id: 42, message: { text: '/start' } };
    const response = await fetch(`${base}/telegram/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'correct' },
      body: JSON.stringify(update),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, update);
  });
});

test('rejects malformed JSON and unknown routes', async () => {
  await withServer({ webhookHandler: async () => {}, webhookSecret: 'correct' }, async (base) => {
    const logError = console.error;
    console.error = () => {};
    let malformed;
    try {
      malformed = await fetch(`${base}/telegram/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'correct' },
        body: '{',
      });
    } finally {
      console.error = logError;
    }
    assert.equal(malformed.status, 400);
    const missing = await fetch(`${base}/missing`);
    assert.equal(missing.status, 404);
  });
});
