import { config } from '../../config.js';
import { getRestaurantCategories, getCategoryProducts, getAvailableProduct } from '../../services/catalog-service.js';
import { categoriesKeyboard, categoryScreenKeyboard, MAIN_MENU, productKeyboard, productListKeyboard } from '../keyboards.js';
import { productCardText } from '../messages.js';
import { changeSelectedProductQuantity, selectedProductQuantity } from '../product-quantity.js';

async function updateProductCard(ctx, product) {
  const quantity = selectedProductQuantity(ctx.session, product.id);
  const text = productCardText(product, quantity);
  const keyboard = productKeyboard(product.id, quantity, product.category_id);
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
    const categories = await getRestaurantCategories(config.restaurantId);
    if (!categories.length) {
      return ctx.editMessageText('Меню пока пустое. Попробуйте позже.', categoryScreenKeyboard());
    }
    const message = ctx.callbackQuery?.message;
    const keyboard = categoriesKeyboard(categories);
    if (message?.photo?.length) {
      return ctx.editMessageCaption('🍔 Выберите категорию:', keyboard);
    }
    return ctx.editMessageText('🍔 Выберите категорию:', keyboard);
  });
  bot.action(/^category:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const categoryId = ctx.match[1];
    const products = await getCategoryProducts(config.restaurantId, categoryId);
    if (!products.length) {
      return ctx.editMessageText('В этой категории пока нет доступных блюд.', categoryScreenKeyboard());
    }

    ctx.session.menuCategoryId = Number(categoryId);
    await ctx.editMessageText(
      `${products[0].category_name}\n\nВыберите блюдо:`,
      productListKeyboard(categoryId, products),
    );
  });
  bot.action(/^product:view:(\d+):(\d+)$/, async (ctx) => {
    const [, categoryId, productId] = ctx.match;
    const product = await getAvailableProduct(config.restaurantId, productId);
    if (!product || String(product.category_id) !== categoryId) {
      await ctx.answerCbQuery('Блюдо больше недоступно.', { show_alert: true });
      return;
    }
    ctx.session.menuCategoryId = Number(categoryId);
    await ctx.answerCbQuery();
    return updateProductCard(ctx, product);
  });
  bot.action(/^product:quantity:(\d+):(-1|1)$/, async (ctx) => {
    const product = await getAvailableProduct(config.restaurantId, ctx.match[1]);
    if (!product) return ctx.answerCbQuery('Блюдо больше недоступно.', { show_alert: true });
    const { current, changed } = changeSelectedProductQuantity(
      ctx.session,
      product.id,
      Number(ctx.match[2]),
    );
    if (!changed) return ctx.answerCbQuery(current === 1 ? 'Минимум — 1 блюдо.' : 'Максимум — 99 блюд.');
    await ctx.answerCbQuery();
    await updateProductCard(ctx, product);
  });
}
