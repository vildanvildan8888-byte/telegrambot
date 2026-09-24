import { Markup } from 'telegraf';

export const MAIN_MENU = Markup.keyboard([
  ['🍔 Меню', '🛒 Корзина'],
  ['📦 Мои заказы', '📍 Мой адрес'],
  ['☎️ Помощь'],
]).resize();

export function categoriesKeyboard(categories, webAppUrl) {
  const rows = [
    ...categories.map((category) => [
      Markup.button.callback(category.name, `category:${category.id}`),
    ]),
    [Markup.button.callback('🛒 Корзина', 'cart:show')],
  ];
  if (webAppUrl) rows.push([Markup.button.webApp('🛍 Открыть приложение', webAppUrl)]);
  return Markup.inlineKeyboard(rows);
}

export function categoryScreenKeyboard() {
  return Markup.inlineKeyboard([[
    Markup.button.callback('📂 К категориям', 'menu:show'),
    Markup.button.callback('🛒 Корзина', 'cart:show'),
  ]]);
}

export function productListKeyboard(categoryId, products) {
  return Markup.inlineKeyboard([
    ...products.map((product) => [
      Markup.button.callback(`🍽 ${product.name}`, `product:view:${categoryId}:${product.id}`),
    ]),
    [Markup.button.callback('⬅️ Назад к категориям', 'menu:show')],
    [Markup.button.callback('🛒 Корзина', 'cart:show')],
  ]);
}

export function productKeyboard(productId, quantity = 1, categoryId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('➖', `product:quantity:${productId}:-1`),
      Markup.button.callback(`${quantity} шт.`, 'cart:noop'),
      Markup.button.callback('➕', `product:quantity:${productId}:1`),
    ],
    [Markup.button.callback('🛒 Добавить в корзину', `cart:add:${productId}:${quantity}`)],
    [Markup.button.callback('⬅️ Назад к категории', `category:${categoryId}`)],
  ]);
}

export function cartKeyboard(items) {
  const rows = items.map((item) => [
    Markup.button.callback('➖', `cart:change:${item.product_id}:-1`),
    Markup.button.callback(`${item.quantity} шт.`, 'cart:noop'),
    Markup.button.callback('➕', `cart:change:${item.product_id}:1`),
  ]);
  for (const item of items) {
    rows.push([Markup.button.callback(`🗑 Удалить ${item.name}`, `cart:remove:${item.product_id}`)]);
  }
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

export function adminMenuKeyboard() {
  return Markup.inlineKeyboard([[
    Markup.button.callback('📷 Фотографии товаров', 'admin:photos'),
  ]]);
}

export function adminPhotoCategoriesKeyboard(categories) {
  return Markup.inlineKeyboard([
    ...categories.map((category) => [
      Markup.button.callback(category.name, `admin:photos:category:${category.id}`),
    ]),
    [Markup.button.callback('⬅️ Назад', 'admin:home')],
  ]);
}

export function adminPhotoProductsKeyboard(categoryId, products) {
  return Markup.inlineKeyboard([
    ...products.map((product) => [
      Markup.button.callback(
        `${product.photo_url ? '📷' : '▫️'} ${product.name}`,
        `admin:photos:product:${categoryId}:${product.id}`,
      ),
    ]),
    [Markup.button.callback('⬅️ Назад к категориям', 'admin:photos')],
  ]);
}

export function adminPhotoProductKeyboard(categoryId, productId, hasPhoto) {
  const rows = hasPhoto
    ? [
      [Markup.button.callback('🔄 Заменить фото', `admin:photos:replace:${categoryId}:${productId}`)],
      [Markup.button.callback('🗑 Удалить фото', `admin:photos:delete:${categoryId}:${productId}`)],
    ]
    : [];
  rows.push([Markup.button.callback('⬅️ Назад', `admin:photos:category:${categoryId}`)]);
  return Markup.inlineKeyboard(rows);
}
