import { updateUserAddress } from '../../repositories/users.js';
import { MAIN_MENU } from '../keyboards.js';

export function registerProfileHandlers(bot) {
  bot.hears('📍 Мой адрес', async (ctx) => {
    ctx.session.profileStep = 'address';
    const saved = ctx.state.user.address
      ? `Сохранённый адрес: ${ctx.state.user.address}\n\n`
      : '';
    await ctx.reply(`${saved}Напишите адрес доставки. Мы сохраним его для следующих заказов.`, MAIN_MENU);
  });
}

export async function handleProfileText(ctx) {
  if (ctx.session.profileStep !== 'address') return false;
  const address = ctx.message.text.trim();
  if (address.length < 5 || address.length > 300) {
    await ctx.reply('Адрес должен быть от 5 до 300 символов. Попробуйте ещё раз.');
    return true;
  }
  await updateUserAddress(ctx.state.user.id, address);
  ctx.session.profileStep = null;
  await ctx.reply('📍 Адрес сохранён.', MAIN_MENU);
  return true;
}
