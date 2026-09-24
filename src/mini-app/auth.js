import { createHmac, timingSafeEqual } from 'node:crypto';

export const MINI_APP_SESSION_COOKIE = 'webapp_session';
export const MINI_APP_SESSION_TTL_SECONDS = 12 * 60 * 60;
export const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 15 * 60;

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest();
}

function safeEqual(left, right) {
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && timingSafeEqual(first, second);
}

export function validateTelegramInitData(rawInitData, botToken, {
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
  futureSkewSeconds = 30,
} = {}) {
  if (typeof rawInitData !== 'string' || rawInitData.length === 0 || rawInitData.length > 16_384) {
    throw new Error('Некорректные данные Telegram Mini App.');
  }
  if (typeof botToken !== 'string' || botToken.length === 0) {
    throw new Error('Авторизация Mini App не настроена.');
  }

  const params = new URLSearchParams(rawInitData);
  const fields = [...params.entries()];
  if (fields.some(([key]) => !key) || new Set(fields.map(([key]) => key)).size !== fields.length) {
    throw new Error('Некорректные данные Telegram Mini App.');
  }
  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f\d]{64}$/i.test(receivedHash)) {
    throw new Error('Подпись Telegram Mini App отсутствует или некорректна.');
  }

  const dataCheckString = fields
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = hmac('WebAppData', botToken);
  const expectedHash = hmac(secretKey, dataCheckString).toString('hex');
  if (!safeEqual(expectedHash, receivedHash.toLowerCase())) {
    throw new Error('Подпись Telegram Mini App не прошла проверку.');
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isSafeInteger(authDate) || authDate <= 0
      || authDate > nowSeconds + futureSkewSeconds
      || nowSeconds - authDate > maxAgeSeconds) {
    throw new Error('Данные Telegram Mini App устарели. Откройте приложение заново.');
  }

  let user;
  try {
    user = JSON.parse(params.get('user') ?? '');
  } catch {
    throw new Error('В данных Telegram Mini App отсутствует пользователь.');
  }
  if (!Number.isSafeInteger(user?.id) || user.id <= 0) {
    throw new Error('В данных Telegram Mini App некорректный пользователь.');
  }
  return { user, authDate };
}

export function createMiniAppSession(telegramId, sessionSecret, {
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = MINI_APP_SESSION_TTL_SECONDS,
} = {}) {
  if (typeof sessionSecret !== 'string' || sessionSecret.length < 32) {
    throw new Error('WEBAPP_SESSION_SECRET должен содержать не менее 32 символов.');
  }
  const payload = Buffer.from(JSON.stringify({
    telegramId: String(telegramId),
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + ttlSeconds,
  })).toString('base64url');
  const signature = hmac(sessionSecret, payload).toString('base64url');
  return `${payload}.${signature}`;
}

export function verifyMiniAppSession(token, sessionSecret, {
  nowSeconds = Math.floor(Date.now() / 1000),
} = {}) {
  if (typeof token !== 'string' || !sessionSecret) return null;
  const [payload, signature, ...extra] = token.split('.');
  if (!payload || !signature || extra.length) return null;

  const expected = hmac(sessionSecret, payload).toString('base64url');
  if (!safeEqual(expected, signature)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!/^\d+$/.test(decoded.telegramId)
        || !Number.isSafeInteger(decoded.issuedAt)
        || !Number.isSafeInteger(decoded.expiresAt)
        || decoded.issuedAt > nowSeconds + 30
        || decoded.expiresAt <= nowSeconds
        || decoded.expiresAt <= decoded.issuedAt
        || decoded.expiresAt - decoded.issuedAt > MINI_APP_SESSION_TTL_SECONDS) return null;
    return decoded.telegramId;
  } catch {
    return null;
  }
}

export function readMiniAppSessionCookie(cookieHeader = '') {
  for (const entry of cookieHeader.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0 || entry.slice(0, separator).trim() !== MINI_APP_SESSION_COOKIE) continue;
    return entry.slice(separator + 1).trim();
  }
  return null;
}

export function miniAppSessionCookie(token) {
  return `${MINI_APP_SESSION_COOKIE}=${token}; Path=/api/v1; Max-Age=${MINI_APP_SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearMiniAppSessionCookie() {
  return `${MINI_APP_SESSION_COOKIE}=; Path=/api/v1; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
