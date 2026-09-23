export function getSessionKey(ctx) {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (userId !== undefined && chatId !== undefined) return `${userId}:${chatId}`;
  if (userId !== undefined) return `${userId}:${userId}`;
  if (chatId !== undefined) return `chat:${chatId}`;
  return undefined;
}

export function ensureSession(ctx) {
  if (!ctx.session || typeof ctx.session !== 'object') ctx.session = {};
  return ctx.session;
}
