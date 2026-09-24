import { config } from '../../config.js';
import { placeOrder } from '../../services/order-service.js';
import { loadCart } from '../../services/cart-service.js';
import { updateUserPhone } from '../../repositories/users.js';
import { formatMoney, formatOrderNumber } from '../../domain/format.js';
import { MAIN_MENU, paymentKeyboard, skipCommentKeyboard } from '../keyboards.js';
import { notifyAdminAboutOrder } from '../order-notifications.js';
import { validateCheckoutField } from '../../domain/checkout.js';

async function startCheckout(ctx) {
  const cart = await loadCart(ctx.state.user.id, config.restaurantId);
  if (!cart.items.length) {
    await ctx.reply('Корзина пуста. Сначала добавьте блюда из меню.', MAIN_MENU);
    return;
  }
  ctx.session.checkout = { step: 'name', name: '', phone: '', address: '', comment: '' };
  await ctx.reply('Оформление заказа 1/4. Как вас зовут?', MAIN_MENU);
}

async function choosePayment(ctx, method) {
  const state = ctx.session.checkout;
  if (!state || state.step !== 'payment') {
    await ctx.answerCbQuery('Начните оформление заказа заново.');
    return;
  }

  try {
    const order = await placeOrder({
      userId: ctx.state.user.id,
      restaurantId: config.restaurantId,
      details: { ...state, paymentMethod: method },
    });
    ctx.session.checkout = null;
    await ctx.answerCbQuery('Заказ оформлен');
    await ctx.reply(
      `✅ Заказ ${formatOrderNumber(order.order_number)} получен и отправлен ресторану.\nСумма: ${formatMoney(order.total_amount)}\nОплата: ${method === 'cash' ? 'наличными' : 'картой'} курьеру.`,
      MAIN_MENU,
    );

    try {
      await notifyAdminAboutOrder(ctx.telegram, config.adminId, order);
    } catch (error) {
      console.error(`Заказ ${order.order_number} сохранён, но уведомление администратору не отправлено:`, error.message);
      await ctx.reply('Заказ сохранён. Администратор не получил уведомление — пожалуйста, свяжитесь с рестораном.');
    }
  } catch (error) {
    await ctx.answerCbQuery('Не удалось оформить заказ.', { show_alert: true });
    await ctx.reply(error.message || 'Не удалось оформить заказ. Попробуйте ещё раз.', MAIN_MENU);
  }
}

export function registerCheckoutHandlers(bot) {
  bot.hears('✅ Оформить заказ', startCheckout);
  bot.action('checkout:start', async (ctx) => {
    await ctx.answerCbQuery();
    await startCheckout(ctx);
  });
  bot.action('checkout:skip-comment', async (ctx) => {
    const state = ctx.session.checkout;
    if (!state || state.step !== 'comment') return ctx.answerCbQuery('Шаг уже завершён.');
    state.comment = '';
    state.step = 'payment';
    await ctx.answerCbQuery();
    await ctx.reply('Выберите способ оплаты:', paymentKeyboard());
  });
  bot.action(/^checkout:payment:(cash|card_on_delivery)$/, (ctx) =>
    choosePayment(ctx, ctx.match[1]));

  bot.on('text', async (ctx, next) => {
    const state = ctx.session.checkout;
    if (!state) return next();
    const value = ctx.message.text.trim();
    if (value.startsWith('/')) return next();

    if (state.step === 'name') {
      if (!validateCheckoutField('name', value)) {
        return ctx.reply('Введите имя длиной от 2 до 100 символов.');
      }
      state.name = value;
      state.step = 'phone';
      return ctx.reply('Оформление заказа 2/4. Введите номер телефона, например +998 90 123 45 67.');
    }
    if (state.step === 'phone') {
      if (!validateCheckoutField('phone', value)) return ctx.reply('Не удалось распознать номер. Введите телефон ещё раз.');
      state.phone = value;
      state.step = 'address';
      await updateUserPhone(ctx.state.user.id, value);
      return ctx.reply('Оформление заказа 3/4. Напишите адрес доставки.');
    }
    if (state.step === 'address') {
      if (!validateCheckoutField('address', value)) {
        return ctx.reply('Адрес должен быть от 5 до 300 символов. Уточните улицу и дом.');
      }
      state.address = value;
      state.step = 'comment';
      return ctx.reply('Оформление заказа 4/4. Напишите комментарий к заказу или нажмите «Пропустить».', skipCommentKeyboard());
    }
    if (state.step === 'comment') {
      if (!validateCheckoutField('comment', value)) return ctx.reply('Комментарий слишком длинный (максимум 500 символов).');
      state.comment = value;
      state.step = 'payment';
      return ctx.reply('Выберите способ оплаты:', paymentKeyboard());
    }
    if (state.step === 'payment') return ctx.reply('Выберите способ оплаты на кнопке выше.');
    return next();
  });
}
