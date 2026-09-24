import { config } from '../../config.js';
import { getRestaurantCategories, getCategoryProducts, getAvailableProduct } from '../../services/catalog-service.js';
import { categoriesKeyboard, MAIN_MENU, productKeyboard } from '../keyboards.js';
import { productCardText } from '../messages.js';

function selectedQuantity(ctx, productId) {
  ctx.session.productQuantities ??= {};
  return ctx.session.productQuantities[productId] ?? 1;
}

async function updateProductCard(ctx, product) {
  const text = productCardText(product, selectedQuantity(ctx, product.id));
  const keyboard = productKeyboard(product.id, selectedQuantity(ctx, product.id));
  const message = ctx.callbackQuery?.message;
  if (message?.photo?.length) return ctx.editMessageCaption(text, keyboard);
  return ctx.editMessageText(text, keyboard);
}

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
      const text = productCardText(product, selectedQuantity(ctx, product.id));
      if (product.photo_url) {
        try {
          await ctx.replyWithPhoto(product.photo_url, {
            caption: text,
            ...productKeyboard(product.id, selectedQuantity(ctx, product.id)),
          });
          continue;
        } catch (error) {
          console.warn(`Не удалось отправить фото блюда ${product.id}: ${error.message}`);
        }
      }
      await ctx.reply(text, productKeyboard(product.id, selectedQuantity(ctx, product.id)));
    }
  });
  bot.action(/^product:quantity:(\d+):(-1|1)$/, async (ctx) => {
    const product = await getAvailableProduct(config.restaurantId, ctx.match[1]);
    if (!product) return ctx.answerCbQuery('Блюдо больше недоступно.', { show_alert: true });
    const current = selectedQuantity(ctx, product.id);
    const next = Math.max(1, Math.min(99, current + Number(ctx.match[2])));
    if (next === current) return ctx.answerCbQuery(current === 1 ? 'Минимум — 1 блюдо.' : 'Максимум — 99 блюд.');
    ctx.session.productQuantities[product.id] = next;
    await ctx.answerCbQuery();
    await updateProductCard(ctx, product);
  });
}
