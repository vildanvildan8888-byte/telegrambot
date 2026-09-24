import { formatMoney, formatOrderNumber } from '../domain/format.js';
import { adminOrderKeyboard } from './keyboards.js';
import { orderText } from './messages.js';

export async function notifyAdminAboutOrder(telegram, adminId, order) {
  await telegram.sendMessage(adminId, `🔔 Новый заказ\n\n${orderText(order)}`, adminOrderKeyboard(order));
}

export async function notifyCustomerAboutOrder(telegram, telegramId, order) {
  const payment = order.payment_method === 'card_on_delivery' ? 'картой' : 'наличными';
  await telegram.sendMessage(
    telegramId,
    `✅ Заказ ${formatOrderNumber(order.order_number)} оформлен.\nСумма: ${formatMoney(order.total_amount)}\nОплата: ${payment} курьеру.`,
  );
}
