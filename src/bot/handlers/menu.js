import { config } from '../../config.js';
import { getRestaurantCategories, getCategoryProducts } from '../../services/catalog-service.js';
import { categoriesKeyboard, MAIN_MENU, productKeyboard } from '../keyboards.js';
import { formatMoney } from '../../domain/format.js';

export async function showMenu(ctx) {
  const categories = await getRestaurantCategories(config.restaurantId);
  if (!categories.length) {
    return ctx.reply('Меню пока пустое. Попробуйте позже.', MAIN_MENU);
  }
  return ctx.reply('🍔 Выберите категорию:', categoriesKeyboard(categories));
}

export function registerMenuHandlers(bot) {
  bot.hears('🍔 Меню', showMenu);
  bot.action('menu:show', async (ctx) => {
    await ctx.answerCbQuery();
    await showMenu(ctx);
  });
  bot.action(/^category:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const products = await getCategoryProducts(config.restaurantId, ctx.match[1]);
    if (!products.length) return ctx.reply('В этой категории пока нет доступных блюд.', MAIN_MENU);

    await ctx.reply('Выберите блюдо:', MAIN_MENU);
    for (const product of products) {
      const text = `🍽 ${product.name}\n${product.description}\nЦена: ${formatMoney(product.price)}`;
      if (product.photo_url) {
        try {
          await ctx.replyWithPhoto(product.photo_url, {
            caption: text,
            ...productKeyboard(product.id),
          });
          continue;
        } catch (error) {
          console.warn(`Не удалось отправить фото блюда ${product.id}: ${error.message}`);
        }
      }
      await ctx.reply(text, productKeyboard(product.id));
    }
  });
}
