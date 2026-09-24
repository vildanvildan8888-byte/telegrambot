const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function downloadTelegramProductPhoto(fileId, botToken, getTelegramFile, fetchImpl = fetch) {
  if (typeof fileId !== 'string' || !fileId || typeof botToken !== 'string' || !botToken) {
    throw new Error('Telegram photo configuration is unavailable.');
  }
  if (typeof getTelegramFile !== 'function') throw new TypeError('getTelegramFile is required.');

  const file = await getTelegramFile(fileId);
  const filePath = file?.file_path;
  if (typeof filePath !== 'string' || !/^[A-Za-z\d_./-]+$/.test(filePath)
      || filePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Telegram returned an invalid photo path.');
  }

  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const response = await fetchImpl(fileUrl, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('Telegram photo download failed.');

  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(contentType)) throw new Error('Telegram returned an unsupported photo type.');
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_PHOTO_BYTES) throw new Error('Telegram photo exceeds the size limit.');

  const chunks = [];
  let size = 0;
  if (!response.body) throw new Error('Telegram photo response is empty.');
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_PHOTO_BYTES) {
      await response.body.cancel().catch(() => {});
      throw new Error('Telegram photo exceeds the size limit.');
    }
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks, size);
  if (!buffer.length) throw new Error('Telegram photo has an invalid size.');
  return { buffer, contentType };
}
