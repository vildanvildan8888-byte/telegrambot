import { config } from '../../config.js';
import { listUserOrders } from '../../repositories/orders.js';
import { ORDER_STATUSES } from '../../domain/order-status.js';
import { formatMoney, formatOrderNumber } from '../../domain/format.js';
import { MAIN_MENU } from '../keyboards.js';

export function registerOrderHandlers(bot) {
  bot.hears('📦 Мои заказы', async (ctx) => {
    const orders = await listUserOrders(ctx.state.user.id, config.restaurantId);
    if (!orders.length) return ctx.reply('У вас пока нет заказов.', MAIN_MENU);
    const lines = orders.map((order) =>
      `${formatOrderNumber(order.order_number)} · ${ORDER_STATUSES[order.status]} · ${formatMoney(order.total_amount)}`,
    );
    return ctx.reply(`📦 Ваши последние заказы:\n\n${lines.join('\n')}`, MAIN_MENU);
  });
}
