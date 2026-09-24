import { formatMoney, formatOrderNumber, paymentLabel } from '../domain/format.js';
import { ORDER_STATUSES } from '../domain/order-status.js';

export function cartText(cart) {
  const lines = cart.items.map((item) =>
    `• ${item.name} × ${item.quantity} — ${formatMoney(item.line_total)}`,
  );
  return `🛒 Корзина\n\n${lines.join('\n')}\n\nИтого: ${formatMoney(cart.total)}`;
}

export function productCardText(product, quantity = 1) {
  const unitPrice = Number(product.price);
  return [
    `🍽 ${product.name}`,
    product.description || 'Описание не указано.',
    `Цена: ${formatMoney(unitPrice)}`,
    `Количество: ${quantity}`,
    `Итого: ${formatMoney(unitPrice * quantity)}`,
  ].join('\n\n');
}

export function orderText(order) {
  const items = order.items.map((item) => {
    const name = item.product_name ?? item.name;
    const total = item.line_total ?? Number(item.price) * Number(item.quantity);
    return `• ${name} × ${item.quantity} — ${formatMoney(total)}`;
  });
  const number = formatOrderNumber(order.order_number);
  return [
    `📦 Заказ ${number} · ${ORDER_STATUSES[order.status] ?? order.status}`,
    ...items,
    `Сумма: ${formatMoney(order.total_amount)}`,
    `Оплата: ${paymentLabel(order.payment_method)}`,
    `Имя: ${order.customer_name}`,
    `Телефон: ${order.phone}`,
    `Адрес: ${order.address}`,
    ...(order.comment ? [`Комментарий: ${order.comment}`] : []),
  ].join('\n');
}
