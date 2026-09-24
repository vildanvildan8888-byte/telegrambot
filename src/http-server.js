import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { secretsMatch, WEBHOOK_PATH } from './webhook.js';

const MAX_BODY_BYTES = 1024 * 1024;
const WEBAPP_ASSETS = new Map([
  ['/app/', { file: new URL('../webapp/index.html', import.meta.url), type: 'text/html; charset=utf-8' }],
  ['/app/index.html', { file: new URL('../webapp/index.html', import.meta.url), type: 'text/html; charset=utf-8' }],
  ['/app/style.css', { file: new URL('../webapp/style.css', import.meta.url), type: 'text/css; charset=utf-8' }],
  ['/app/app.js', { file: new URL('../webapp/app.js', import.meta.url), type: 'text/javascript; charset=utf-8' }],
  ['/app/api.js', { file: new URL('../webapp/api.js', import.meta.url), type: 'text/javascript; charset=utf-8' }],
]);
const WEBAPP_CSP = [
  "default-src 'self'",
  "script-src 'self' https://telegram.org",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'self'",
].join('; ');

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });
    request.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        return;
      }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw new Error('JSON body must be an object');
        }
        resolve(body);
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
}

export function createHttpServer({ webhookHandler, webhookSecret, miniAppHandler }) {
  if (typeof webhookHandler !== 'function') throw new TypeError('webhookHandler is required');
  if (!webhookSecret) throw new TypeError('webhookSecret is required');

  return createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (request.method === 'GET' && pathname === '/health') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (pathname === '/app' && request.method === 'GET') {
      response.writeHead(308, { location: '/app/' }).end();
      return;
    }
    if (WEBAPP_ASSETS.has(pathname)) {
      if (request.method !== 'GET') {
        response.setHeader('allow', 'GET');
        sendJson(response, 405, { error: 'Method not allowed' });
        return;
      }
      try {
        const asset = WEBAPP_ASSETS.get(pathname);
        const contents = await readFile(asset.file);
        response.writeHead(200, {
          'content-type': asset.type,
          'content-security-policy': WEBAPP_CSP,
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
          'cache-control': pathname.endsWith('.html') ? 'no-cache' : 'public, max-age=300',
        });
        response.end(contents);
      } catch (error) {
        console.error('Не удалось отдать Mini App:', error.message);
        sendJson(response, 500, { error: 'Mini App temporarily unavailable' });
      }
      return;
    }

    if (pathname.startsWith('/api/v1/')) {
      if (typeof miniAppHandler !== 'function') {
        sendJson(response, 404, { error: 'Not found' });
        return;
      }
      if (!['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) {
        response.setHeader('allow', 'GET, POST, PUT, DELETE');
        sendJson(response, 405, { error: 'Method not allowed' });
        return;
      }
      if (request.method === 'POST' || request.method === 'PUT') {
        const contentType = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
        if (contentType !== 'application/json') {
          request.resume();
          sendJson(response, 415, { error: 'Content-Type must be application/json' });
          return;
        }
        try {
          request.body = await readJsonBody(request);
        } catch (error) {
          sendJson(response, error.statusCode ?? 400, { error: 'Invalid request body' });
          return;
        }
      }
      try {
        await miniAppHandler(request, response, new URL(request.url ?? '/', 'http://localhost'));
        if (!response.writableEnded && !response.headersSent) sendJson(response, 404, { error: 'Not found' });
      } catch (error) {
        console.error('Ошибка обработки Mini App API:', error.message);
        if (!response.headersSent) sendJson(response, 500, { error: 'Request processing failed' });
        else if (!response.writableEnded) response.destroy();
      }
      return;
    }

    if (pathname !== WEBHOOK_PATH || request.url !== WEBHOOK_PATH) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST');
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }
    if (!secretsMatch(webhookSecret, request.headers['x-telegram-bot-api-secret-token'])) {
      request.resume();
      sendJson(response, 403, { error: 'Forbidden' });
      return;
    }
    const contentType = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
      request.resume();
      sendJson(response, 415, { error: 'Content-Type must be application/json' });
      return;
    }
    const contentLength = Number(request.headers['content-length'] ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      request.resume();
      sendJson(response, 413, { error: 'Request body too large' });
      return;
    }

    try {
      request.body = await readJsonBody(request);
      await webhookHandler(request, response, () => sendJson(response, 404, { error: 'Not found' }));
      if (!response.writableEnded && !response.headersSent) sendJson(response, 200, { ok: true });
    } catch (error) {
      console.error('Ошибка обработки Telegram webhook:', error.message);
      if (!response.headersSent) sendJson(response, error.statusCode ?? 500, { error: 'Webhook processing failed' });
      else if (!response.writableEnded) response.destroy();
    }
  });
}
