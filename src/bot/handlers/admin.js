import { config } from '../../config.js';
import { loadOrder, changeOrderStatus } from '../../services/order-service.js';
import { ORDER_STATUSES } from '../../domain/order-status.js';
import { adminOrderKeyboard, MAIN_MENU } from '../keyboards.js';

export function registerAdminHandlers(bot) {
  bot.action(/^admin:status:(\d+):(accepted|preparing|delivering|delivered|cancelled)$/, async (ctx) => {
    if (String(ctx.from.id) !== config.adminId) {
      await ctx.answerCbQuery('Эта кнопка доступна только администратору.', { show_alert: true });
      return;
    }
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
    if (String(ctx.from.id) !== config.adminId) {
      return ctx.reply('Команда доступна только администратору.', MAIN_MENU);
    }
    return ctx.reply('Новые заказы поступают сюда с кнопками управления.');
  });
}
