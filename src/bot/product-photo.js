export function largestTelegramPhotoFileId(photoSizes = []) {
  return photoSizes.reduce((largest, candidate) => {
    if (!candidate?.file_id) return largest;
    if (!largest) return candidate;
    const area = (candidate.width ?? 0) * (candidate.height ?? 0);
    const largestArea = (largest.width ?? 0) * (largest.height ?? 0);
    if (area > largestArea || (area === largestArea && (candidate.file_size ?? 0) > (largest.file_size ?? 0))) {
      return candidate;
    }
    return largest;
  }, null)?.file_id ?? null;
}

export function editProductCard(ctx, caption, keyboard) {
  if (ctx.callbackQuery?.message?.photo?.length) {
    return ctx.editMessageCaption(caption, keyboard);
  }
  return ctx.editMessageText(caption, keyboard);
}

export async function showProductPhoto(ctx, product, caption, keyboard) {
  if (!product.photo_url) return false;

  try {
    const message = await ctx.replyWithPhoto(product.photo_url, {
      caption,
      ...keyboard,
    });
    ctx.session.productPhotoMessage = {
      chatId: message.chat.id,
      messageId: message.message_id,
    };
    return true;
  } catch (error) {
    console.warn(`Не удалось загрузить фото блюда ${product.id}: ${error.message}`);
    ctx.session.productPhotoMessage = null;
    return false;
  }
}

export async function clearProductPhoto(ctx) {
  const currentMessage = ctx.callbackQuery?.message;
  const photoMessage = ctx.session.productPhotoMessage ?? (
    currentMessage?.photo?.length
      ? { chatId: currentMessage.chat.id, messageId: currentMessage.message_id }
      : null
  );
  ctx.session.productPhotoMessage = null;
  if (!photoMessage) return false;

  try {
    await ctx.telegram.deleteMessage(photoMessage.chatId, photoMessage.messageId);
    return true;
  } catch (error) {
    ctx.session.productPhotoMessage = photoMessage;
    console.warn(`Не удалось удалить фото карточки: ${error.message}`);
    return false;
  }
}
