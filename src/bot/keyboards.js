import { Markup } from 'telegraf';

export const MAIN_MENU = Markup.keyboard([
  ['🍔 Меню', '🛒 Корзина'],
  ['📦 Мои заказы', '📍 Мой адрес'],
  ['☎️ Помощь'],
]).resize();

export function categoriesKeyboard(categories) {
  return Markup.inlineKeyboard([
    ...categories.map((category) => [
      Markup.button.callback(category.name, `category:${category.id}`),
    ]),
    [Markup.button.callback('🛒 Корзина', 'cart:show')],
  ]);
}

export function productKeyboard(productId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ В корзину', `cart:add:${productId}`)],
    [Markup.button.callback('🛒 Открыть корзину', 'cart:show')],
  ]);
}

export function cartKeyboard(items) {
  const rows = items.map((item) => [
    Markup.button.callback('➖', `cart:change:${item.product_id}:-1`),
    Markup.button.callback(`${item.quantity} шт.`, 'cart:noop'),
    Markup.button.callback('➕', `cart:change:${item.product_id}:1`),
  ]);
  rows.push([Markup.button.callback('✅ Оформить заказ', 'checkout:start')]);
  rows.push([Markup.button.callback('🍔 К меню', 'menu:show')]);
  return Markup.inlineKeyboard(rows);
}

export function paymentKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💵 Наличными курьеру', 'checkout:payment:cash')],
    [Markup.button.callback('💳 Картой курьеру', 'checkout:payment:card_on_delivery')],
  ]);
}

export function skipCommentKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('Пропустить', 'checkout:skip-comment')]]);
}

export function adminOrderKeyboard(order) {
  const actions = {
    new: [['✅ Принять', 'accepted'], ['❌ Отклонить', 'cancelled']],
    accepted: [['👨‍🍳 Начать готовить', 'preparing'], ['❌ Отменить', 'cancelled']],
    preparing: [['🚗 Передать курьеру', 'delivering'], ['❌ Отменить', 'cancelled']],
    delivering: [['✅ Доставлен', 'delivered'], ['❌ Отменить', 'cancelled']],
    delivered: [],
    cancelled: [],
  };
  return Markup.inlineKeyboard((actions[order.status] ?? []).map(([label, status]) => [
    Markup.button.callback(label, `admin:status:${order.order_number}:${status}`),
  ]));
}
