import { Telegraf, session } from 'telegraf';
import { config } from '../config.js';
import { upsertTelegramUser } from '../repositories/users.js';
import { MAIN_MENU } from './keyboards.js';
import { showMenu, registerMenuHandlers } from './handlers/menu.js';
import { registerCartHandlers } from './handlers/cart.js';
import { registerOrderHandlers } from './handlers/orders.js';
import { registerProfileHandlers, handleProfileText } from './handlers/profile.js';
import { registerCheckoutHandlers } from './handlers/checkout.js';
import { registerAdminHandlers } from './handlers/admin.js';
import { registerHelpHandlers } from './handlers/help.js';

export function createBot(token = config.botToken) {
  const bot = new Telegraf(token);
  bot.use(session());
  bot.use(async (ctx, next) => {
    if (ctx.from) ctx.state.user = await upsertTelegramUser(ctx.from);
    return next();
  });
  bot.hears(/^(🍔 Меню|🛒 Корзина|📦 Мои заказы|📍 Мой адрес|☎️ Помощь)$/, async (ctx, next) => {
    if (ctx.session.checkout || ctx.session.profileStep) {
      ctx.session.checkout = null;
      ctx.session.profileStep = null;
      await ctx.reply('Текущий ввод отменён.');
    }
    return next();
  });

  bot.start(async (ctx) => {
    ctx.session.checkout = null;
    ctx.session.profileStep = null;
    await ctx.reply('Добро пожаловать в «Вкусный двор»! Заказать доставку можно в меню ниже.', MAIN_MENU);
    await showMenu(ctx);
  });

  registerMenuHandlers(bot);
  registerCartHandlers(bot);
  registerOrderHandlers(bot);
  registerProfileHandlers(bot);
  registerCheckoutHandlers(bot);
  registerAdminHandlers(bot);
  registerHelpHandlers(bot);

  bot.on('text', async (ctx, next) => {
    if (await handleProfileText(ctx)) return;
    return next();
  });

  bot.catch((error, ctx) => {
    console.error(`Ошибка при обработке Telegram update ${ctx.update.update_id}:`, error.message);
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery('Произошла ошибка. Попробуйте ещё раз.', { show_alert: true }).catch(() => {});
    }
  });

  return bot;
}
