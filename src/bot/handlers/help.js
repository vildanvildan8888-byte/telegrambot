import { config } from '../../config.js';
import { MAIN_MENU } from '../keyboards.js';

export function registerHelpHandlers(bot) {
  bot.hears('☎️ Помощь', (ctx) => ctx.reply(
    `По вопросам заказа напишите: ${config.helpContact}`,
    MAIN_MENU,
  ));
}
