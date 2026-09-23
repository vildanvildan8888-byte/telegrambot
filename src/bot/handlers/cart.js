import { config } from '../../config.js';
import { loadCart, adjustCartItem } from '../../services/cart-service.js';
import { getAvailableProduct } from '../../services/catalog-service.js';
import { cartKeyboard, MAIN_MENU } from '../keyboards.js';
import { cartText } from '../messages.js';
import { formatMoney } from '../../domain/format.js';

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
  bot.action(/^cart:add:(\d+)$/, async (ctx) => {
    const product = await getAvailableProduct(config.restaurantId, ctx.match[1]);
    if (!product) {
      await ctx.answerCbQuery('Блюдо больше недоступно.', { show_alert: true });
      return;
    }
    await adjustCartItem(ctx.state.user.id, config.restaurantId, product.id, 1);
    await ctx.answerCbQuery(`${product.name} добавлен в корзину`);
    await ctx.reply(`Добавлено: ${product.name} — ${formatMoney(product.price)}`, MAIN_MENU);
  });
  bot.action(/^cart:change:(\d+):(-?\d+)$/, async (ctx) => {
    const delta = Number(ctx.match[2]);
    if (![-1, 1].includes(delta)) return ctx.answerCbQuery('Недопустимое изменение.');
    const changed = await adjustCartItem(ctx.state.user.id, config.restaurantId, ctx.match[1], delta);
    if (!changed) {
      await ctx.answerCbQuery('Блюдо больше недоступно.', { show_alert: true });
      return showCart(ctx);
    }
    await ctx.answerCbQuery();
    await showCart(ctx);
  });
}
