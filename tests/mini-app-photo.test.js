import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadTelegramProductPhoto } from '../src/mini-app/telegram-photo.js';

test('Telegram product photo is downloaded server-side from the file ID path', async () => {
  let receivedFileId;
  let requestedUrl;
  const photo = await downloadTelegramProductPhoto(
    'stored-telegram-file-id',
    '123456:server-only-token',
    async (fileId) => {
      receivedFileId = fileId;
      return { file_path: 'photos/product_51.jpg' };
    },
    async (url) => {
      requestedUrl = new URL(url);
      return new Response(Buffer.from('jpeg-bytes'), {
        status: 200,
        headers: { 'content-type': 'image/jpeg', 'content-length': '10' },
      });
    },
  );
  assert.equal(receivedFileId, 'stored-telegram-file-id');
  assert.equal(requestedUrl.protocol, 'https:');
  assert.equal(requestedUrl.hostname, 'api.telegram.org');
  assert.equal(requestedUrl.pathname, '/file/bot123456:server-only-token/photos/product_51.jpg');
  assert.equal(photo.contentType, 'image/jpeg');
  assert.equal(photo.buffer.toString(), 'jpeg-bytes');
});

test('Telegram product photo rejects an unsafe path without making an outbound request', async () => {
  let fetched = false;
  await assert.rejects(downloadTelegramProductPhoto(
    'file-id',
    'token',
    async () => ({ file_path: '../../attacker.example/image.png' }),
    async () => { fetched = true; },
  ), /invalid photo path/);
  assert.equal(fetched, false);
});

test('Telegram product photo rejects unsupported and oversized image responses', async () => {
  const getFile = async () => ({ file_path: 'photos/product.jpg' });
  await assert.rejects(downloadTelegramProductPhoto('file-id', 'token', getFile, async () => new Response('text', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  })), /unsupported photo type/);
  await assert.rejects(downloadTelegramProductPhoto('file-id', 'token', getFile, async () => new Response(null, {
    status: 200,
    headers: { 'content-type': 'image/jpeg', 'content-length': String(11 * 1024 * 1024) },
  })), /size limit/);
});
