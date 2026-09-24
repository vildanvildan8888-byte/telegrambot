import { config } from '../../config.js';
import {
  deleteManagedProductPhoto,
  getManagedProduct,
  getProductsForManagement,
  getRestaurantCategories,
  saveManagedProductPhoto,
} from '../../services/catalog-service.js';
import { loadOrder, changeOrderStatus } from '../../services/order-service.js';
import { ORDER_STATUSES } from '../../domain/order-status.js';
import { largestTelegramPhotoFileId } from '../product-photo.js';
import {
  adminMenuKeyboard,
  adminOrderKeyboard,
  adminPhotoCategoriesKeyboard,
  adminPhotoProductKeyboard,
  adminPhotoProductsKeyboard,
  MAIN_MENU,
} from '../keyboards.js';

function isAdmin(ctx) {
  return Boolean(config.adminId) && String(ctx.from?.id) === config.adminId;
}

async function denyNonAdmin(ctx) {
  if (isAdmin(ctx)) return false;
  await ctx.answerCbQuery('Эта функция доступна только администратору.', { show_alert: true });
  return true;
}

async function editProductList(ctx, categoryId, notice = '') {
  const products = await getProductsForManagement(config.restaurantId, categoryId);
  const category = (await getRestaurantCategories(config.restaurantId))
    .find((item) => String(item.id) === String(categoryId));
  const title = category?.name ?? 'Категория';
  const text = `${notice ? `${notice}\n\n` : ''}${title}\n\nВыберите товар:`;
  return ctx.editMessageText(text, adminPhotoProductsKeyboard(categoryId, products));
}

async function requestProductPhoto(ctx, categoryId, product, message = ctx.callbackQuery?.message) {
  ctx.session.adminPhotoUpload = {
    categoryId: Number(categoryId),
    productId: Number(product.id),
    productName: product.name,
    chatId: message?.chat?.id,
    messageId: message?.message_id,
  };
  return ctx.editMessageText(
    `📷 Пришлите фотографию для: ${product.name}`,
    adminPhotoProductKeyboard(categoryId, product.id, false),
  );
}

export function registerAdminHandlers(bot) {
  bot.action(/^admin:status:(\d+):(accepted|preparing|delivering|delivered|cancelled)$/, async (ctx) => {
    if (await denyNonAdmin(ctx)) return;
    const [, orderNumber, nextStatus] = ctx.match;
    let updated;
    try {
      updated = await changeOrderStatus(orderNumber, config.restaurantId, nextStatus);
    } catch (error) {
      await ctx.answerCbQuery(error.message || 'Не удалось изменить статус.', { show_alert: true });
      return;
    }

    await ctx.answerCbQuery(`Статус: ${ORDER_STATUSES[nextStatus]}`);
    const order = await loadOrder(orderNumber, config.restaurantId);
    if (order) await ctx.editMessageReplyMarkup(adminOrderKeyboard(order).reply_markup);
    try {
      await ctx.telegram.sendMessage(
        updated.telegramId,
        `📦 Статус заказа #${String(orderNumber).padStart(4, '0')} изменён: ${ORDER_STATUSES[nextStatus]}.`,
        MAIN_MENU,
      );
    } catch (error) {
      console.error(`Статус заказа ${orderNumber} изменён, но клиент не получил уведомление:`, error.message);
      await ctx.reply(`Статус сохранён: ${ORDER_STATUSES[nextStatus]}. Не удалось написать клиенту.`);
    }
  });

  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('Команда доступна только администратору.', MAIN_MENU);
    return ctx.reply('Администрирование «Вкусного двора»:', adminMenuKeyboard());
  });

  bot.action('admin:home', async (ctx) => {
    if (await denyNonAdmin(ctx)) return;
    await ctx.answerCbQuery();
    return ctx.editMessageText('Администрирование «Вкусного двора»:', adminMenuKeyboard());
  });

  bot.action('admin:photos', async (ctx) => {
    if (await denyNonAdmin(ctx)) return;
    await ctx.answerCbQuery();
    ctx.session.adminPhotoUpload = null;
    const categories = await getRestaurantCategories(config.restaurantId);
    return ctx.editMessageText('📷 Фотографии товаров\n\nВыберите категорию:', adminPhotoCategoriesKeyboard(categories));
  });

  bot.action(/^admin:photos:category:(\d+)$/, async (ctx) => {
    if (await denyNonAdmin(ctx)) return;
    await ctx.answerCbQuery();
    ctx.session.adminPhotoUpload = null;
    return editProductList(ctx, ctx.match[1]);
  });

  bot.action(/^admin:photos:product:(\d+):(\d+)$/, async (ctx) => {
    if (await denyNonAdmin(ctx)) return;
    const [, categoryId, productId] = ctx.match;
    const product = await getManagedProduct(config.restaurantId, categoryId, productId);
    if (!product) {
      await ctx.answerCbQuery('Товар не найден.', { show_alert: true });
      return;
    }
    await ctx.answerCbQuery();
    ctx.session.adminPhotoUpload = null;
    if (!product.photo_url) return requestProductPhoto(ctx, categoryId, product);
    return ctx.editMessageText(
      `📷 Фото уже установлено\n\n${product.name}`,
      adminPhotoProductKeyboard(categoryId, productId, true),
    );
  });

  bot.action(/^admin:photos:replace:(\d+):(\d+)$/, async (ctx) => {
    if (await denyNonAdmin(ctx)) return;
    const [, categoryId, productId] = ctx.match;
    const product = await getManagedProduct(config.restaurantId, categoryId, productId);
    if (!product) {
      await ctx.answerCbQuery('Товар не найден.', { show_alert: true });
      return;
    }
    await ctx.answerCbQuery();
    return requestProductPhoto(ctx, categoryId, product);
  });

  bot.action(/^admin:photos:delete:(\d+):(\d+)$/, async (ctx) => {
    if (await denyNonAdmin(ctx)) return;
    const [, categoryId, productId] = ctx.match;
    const product = await deleteManagedProductPhoto(config.restaurantId, productId);
    if (!product) {
      await ctx.answerCbQuery('Товар не найден.', { show_alert: true });
      return;
    }
    ctx.session.adminPhotoUpload = null;
    await ctx.answerCbQuery('Фото удалено.');
    return editProductList(ctx, categoryId, `🗑 Фото удалено для ${product.name}`);
  });

  bot.on('photo', async (ctx, next) => {
    const upload = ctx.session.adminPhotoUpload;
    if (!upload) return next();
    if (!isAdmin(ctx)) {
      ctx.session.adminPhotoUpload = null;
      return next();
    }

    const fileId = largestTelegramPhotoFileId(ctx.message.photo);
    if (!fileId) {
      await ctx.reply('Не удалось определить файл фотографии. Пришлите фото ещё раз.');
      return;
    }

    let product;
    try {
      product = await saveManagedProductPhoto(config.restaurantId, upload.productId, fileId);
    } catch (error) {
      console.error('Не удалось сохранить фотографию товара:', error.message);
      await ctx.reply('Не удалось сохранить фото. Проверьте соединение с базой и пришлите фотографию ещё раз.');
      return;
    }
    ctx.session.adminPhotoUpload = null;
    if (!product) {
      await ctx.reply('Товар больше не найден. Выберите его в админском меню заново.');
      return;
    }

    try {
      await ctx.telegram.editMessageText(
        upload.chatId,
        upload.messageId,
        undefined,
        `✅ Фото сохранено для ${product.name}\n\nВыберите следующий товар:`,
        adminPhotoProductsKeyboard(upload.categoryId, await getProductsForManagement(config.restaurantId, upload.categoryId)),
      );
    } catch (error) {
      console.warn(`Не удалось обновить сообщение админки после сохранения фото: ${error.message}`);
      await ctx.reply(`✅ Фото сохранено для ${product.name}. Выберите следующий товар:`,
        adminPhotoProductsKeyboard(upload.categoryId, await getProductsForManagement(config.restaurantId, upload.categoryId)));
    }
  });
}
