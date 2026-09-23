import { createHmac, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_PATH = '/telegram/webhook';

export function validateRuntimeConfig({ botToken, adminId, webhookUrl }) {
  if (!String(botToken ?? '').trim()) {
    throw new Error('Не задана обязательная переменная окружения BOT_TOKEN');
  }
  if (!String(adminId ?? '').trim()) {
    throw new Error('Не задана обязательная переменная окружения ADMIN_ID');
  }
  if (!/^-?\d+$/.test(String(adminId).trim())) {
    throw new Error('ADMIN_ID должен быть числовым Telegram ID');
  }
  if (!String(webhookUrl ?? '').trim()) {
    throw new Error('Не задана обязательная переменная окружения WEBHOOK_URL');
  }
  buildWebhookUrl(webhookUrl);
}

export function buildWebhookUrl(baseUrl) {
  let parsed;
  try {
    parsed = new URL(String(baseUrl ?? '').trim());
  } catch {
    throw new Error('WEBHOOK_URL должен быть публичным HTTPS URL Render.');
  }

  if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash
      || parsed.username || parsed.password) {
    throw new Error('WEBHOOK_URL должен содержать только базовый HTTPS URL без пути и параметров.');
  }
  return `${parsed.origin}${WEBHOOK_PATH}`;
}

export function resolveWebhookSecret(configuredSecret, botToken) {
  const secret = String(configuredSecret ?? '').trim();
  if (secret && !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    throw new Error('WEBHOOK_SECRET может содержать только латинские буквы, цифры, _ и - (до 256 символов).');
  }
  return secret || createHmac('sha256', botToken).update('telegram-food-delivery-webhook').digest('hex');
}

export function secretsMatch(expected, received) {
  if (typeof received !== 'string') return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function parsePort(value) {
  const port = Number(value || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT должен быть целым числом от 1 до 65535.');
  }
  return port;
}
