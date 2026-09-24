import { config } from '../../config.js';
import { loadCart, adjustCartItem, addCartItem, deleteCartItem } from '../../services/cart-service.js';
import { getAvailableProduct } from '../../services/catalog-service.js';
import { cartKeyboard, MAIN_MENU } from '../keyboards.js';
import { cartText } from '../messages.js';

async function editCart(ctx) {
  const cart = await loadCart(ctx.state.user.id, config.restaurantId);
  if (!cart.items.length) {
    return ctx.editMessageText('Корзина пуста. Выберите блюда в меню.', {
      reply_markup: { inline_keyboard: [[{ text: '🍔 К меню', callback_data: 'menu:show' }]] },
    });
  }
  return ctx.editMessageText(cartText(cart), cartKeyboard(cart.items));
}

export async function showCart(ctx) {
  const cart = await loadCart(ctx.state.user.id, config.restaurantId);
  if (!cart.items.length) return ctx.reply('Корзина пуста. Выберите блюда в меню.', MAIN_MENU);
  return ctx.reply(cartText(cart), cartKeyboard(cart.items));
}

export function registerCartHandlers(bot) {
  bot.hears('🛒 Корзина', showCart);
  bot.action('cart:show', async (ctx) => {
    await ctx.answerCbQuery();
    await showCart(ctx);
  });
  bot.action('cart:noop', (ctx) => ctx.answerCbQuery());
  bot.action(/^cart:add:(\d+)(?::(\d+))?$/, async (ctx) => {
    const product = await getAvailableProduct(config.restaurantId, ctx.match[1]);
    if (!product) {
      await ctx.answerCbQuery('Блюдо больше недоступно.', { show_alert: true });
      return;
    }
    const quantity = Math.max(1, Math.min(99, Number(ctx.match[2] ?? 1)));
    const added = await addCartItem(ctx.state.user.id, config.restaurantId, product.id, quantity);
    if (!added) {
      await ctx.answerCbQuery('Блюдо больше недоступно.', { show_alert: true });
      return;
    }
    await ctx.answerCbQuery(`Добавлено: ${product.name} × ${quantity}`);
  });
  bot.action(/^cart:change:(\d+):(-?\d+)$/, async (ctx) => {
    const delta = Number(ctx.match[2]);
    if (![-1, 1].includes(delta)) return ctx.answerCbQuery('Недопустимое изменение.');
    const changed = await adjustCartItem(ctx.state.user.id, config.restaurantId, ctx.match[1], delta);
    if (!changed) {
      await ctx.answerCbQuery('Блюдо больше недоступно.', { show_alert: true });
      return editCart(ctx);
    }
    await ctx.answerCbQuery();
    return editCart(ctx);
  });
  bot.action(/^cart:remove:(\d+)$/, async (ctx) => {
    await deleteCartItem(ctx.state.user.id, config.restaurantId, ctx.match[1]);
    await ctx.answerCbQuery('Позиция удалена.');
    return editCart(ctx);
  });
}
