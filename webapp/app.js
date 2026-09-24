import {
  authenticateTelegram,
  createOrder,
  deleteCartItem,
  getCart,
  getCategories,
  getMe,
  getOrder,
  getOrders,
  getProduct,
  getProducts,
  setCartItemQuantity,
  telegramApp,
} from './api.js';

const categoriesElement = document.querySelector('#categories');
const productsElement = document.querySelector('#products');
const statusElement = document.querySelector('#status');
const greetingElement = document.querySelector('#greeting');
const catalogTitleElement = document.querySelector('#catalog-title');
const cartButton = document.querySelector('#cart-button');
const cartButtonCount = document.querySelector('#cart-button-count');
const cartButtonTotal = document.querySelector('#cart-button-total');
const ordersButton = document.querySelector('#orders-button');

let categories = [];
let selectedCategoryId = null;
let selectedProducts = [];
let productRequestId = 0;
let cart = { items: [], total: 0 };
let profile = null;
let checkoutSubmitting = false;
const productQuantities = new Map();

function applyTelegramTheme() {
  const theme = telegramApp?.themeParams ?? {};
  const variables = {
    bg_color: '--tg-theme-bg-color',
    text_color: '--tg-theme-text-color',
    hint_color: '--tg-theme-hint-color',
    secondary_bg_color: '--tg-theme-secondary-bg-color',
    button_color: '--tg-theme-button-color',
    button_text_color: '--tg-theme-button-text-color',
  };
  for (const [key, variable] of Object.entries(variables)) {
    const value = theme[key];
    if (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) {
      document.documentElement.style.setProperty(variable, value);
    }
  }
}

function setStatus(message = '', kind = '') {
  statusElement.textContent = message;
  statusElement.dataset.kind = kind;
}

function formatPrice(price) {
  return `${new Intl.NumberFormat('ru-RU').format(price)} сум`;
}

function updateCartButton() {
  const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  cartButtonCount.textContent = count ? `🛒 Корзина · ${count}` : '🛒 Корзина';
  cartButtonTotal.textContent = count ? formatPrice(cart.total) : 'Пока пуста';
}

function renderCategories() {
  categoriesElement.replaceChildren();
  for (const category of categories) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'category-button';
    button.textContent = category.name;
    button.setAttribute('aria-pressed', String(String(category.id) === String(selectedCategoryId)));
    button.addEventListener('click', () => void selectCategory(category.id));
    categoriesElement.append(button);
  }
}

function renderProducts(products) {
  selectedProducts = products;
  productsElement.replaceChildren();
  if (!products.length) {
    setStatus('В этой категории пока нет блюд.');
    return;
  }
  setStatus();
  for (const product of products) {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    const name = document.createElement('h3');
    name.textContent = product.name;
    const description = document.createElement('p');
    description.textContent = product.description || 'Описание не указано.';
    const price = document.createElement('strong');
    price.className = 'product-price';
    price.textContent = formatPrice(product.price);
    card.append(name, description, price);
    card.addEventListener('click', () => void openProduct(product.id));
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      void openProduct(product.id);
    });
    productsElement.append(card);
  }
}

function renderProductDetails(product) {
  productsElement.replaceChildren();
  const card = document.createElement('article');
  card.className = 'product-detail';
  const media = document.createElement('div');
  media.className = 'product-photo';
  const image = document.createElement('img');
  image.alt = product.name;
  image.hidden = !product.photoUrl;
  const placeholder = document.createElement('div');
  placeholder.className = 'photo-placeholder';
  placeholder.textContent = '🍽️';
  placeholder.hidden = Boolean(product.photoUrl);
  image.addEventListener('error', () => {
    image.hidden = true;
    placeholder.hidden = false;
  });
  if (product.photoUrl) image.src = product.photoUrl;
  const name = document.createElement('h3');
  name.textContent = product.name;
  const description = document.createElement('p');
  description.textContent = product.description || 'Описание не указано.';
  const price = document.createElement('strong');
  price.className = 'product-price';
  price.textContent = formatPrice(product.price);
  const quantityLabel = document.createElement('p');
  quantityLabel.className = 'quantity-label';
  quantityLabel.textContent = 'Количество';
  let quantity = productQuantities.get(String(product.id)) ?? 1;
  const quantityControl = document.createElement('div');
  quantityControl.className = 'quantity-control';
  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'quantity-button';
  minus.textContent = '−';
  const quantityValue = document.createElement('output');
  quantityValue.className = 'quantity-value';
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'quantity-button';
  plus.textContent = '+';
  const selectedTotal = document.createElement('strong');
  selectedTotal.className = 'selected-total';
  const updateQuantity = () => {
    quantityValue.textContent = String(quantity);
    minus.disabled = quantity <= 1;
    plus.disabled = quantity >= 99;
    selectedTotal.textContent = `Итого: ${formatPrice(Number(product.price) * quantity)}`;
    productQuantities.set(String(product.id), quantity);
  };
  minus.addEventListener('click', () => {
    if (quantity > 1) quantity -= 1;
    updateQuantity();
  });
  plus.addEventListener('click', () => {
    if (quantity < 99) quantity += 1;
    updateQuantity();
  });
  quantityControl.append(minus, quantityValue, plus);
  updateQuantity();
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'add-cart-button';
  addButton.textContent = '🛒 Добавить в корзину';
  addButton.addEventListener('click', async () => {
    addButton.disabled = true;
    try {
      const result = await setCartItemQuantity(product.id, quantity);
      cart = result.cart;
      updateCartButton();
      setStatus('Количество товара сохранено в корзине.');
    } catch (error) {
      setStatus(error.message || 'Не удалось обновить корзину.', 'error');
    } finally {
      addButton.disabled = false;
    }
  });
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'back-button';
  back.textContent = '← Назад';
  back.addEventListener('click', () => {
    productRequestId += 1;
    renderProducts(selectedProducts);
  });
  media.append(image, placeholder);
  card.append(media, name, description, price, quantityLabel, quantityControl,
    selectedTotal, addButton, back);
  productsElement.append(card);
  setStatus();
}

async function openProduct(productId) {
  const requestId = ++productRequestId;
  productsElement.replaceChildren();
  setStatus('Загружаем товар…');
  try {
    const result = await getProduct(productId);
    if (requestId !== productRequestId) return;
    renderProductDetails(result.product);
  } catch (error) {
    if (requestId !== productRequestId) return;
    productsElement.replaceChildren();
    setStatus(error.message || 'Не удалось загрузить товар.', 'error');
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'back-button';
    back.textContent = '← Назад';
    back.addEventListener('click', () => {
      productRequestId += 1;
      renderProducts(selectedProducts);
    });
    productsElement.append(back);
  }
}

async function selectCategory(categoryId) {
  const requestId = ++productRequestId;
  selectedCategoryId = categoryId;
  categoriesElement.hidden = false;
  catalogTitleElement.textContent = 'Выберите блюдо';
  cartButton.setAttribute('aria-pressed', 'false');
  renderCategories();
  productsElement.replaceChildren();
  setStatus('Загружаем блюда…');
  try {
    const result = await getProducts(categoryId);
    if (requestId !== productRequestId) return;
    renderProducts(result.products);
  } catch (error) {
    if (requestId !== productRequestId) return;
    setStatus(error.message, 'error');
  }
}

function continueShopping() {
  const categoryId = selectedCategoryId ?? categories[0]?.id;
  if (!categoryId) return;
  void selectCategory(categoryId);
}

function renderCart() {
  productsElement.replaceChildren();
  setStatus();
  if (!cart.items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-cart';
    empty.textContent = '🛒 Корзина пуста';
    productsElement.append(empty);
    const menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'primary-button';
    menu.textContent = 'Перейти в меню';
    menu.addEventListener('click', continueShopping);
    productsElement.append(menu);
  }
  for (const item of cart.items) {
    const row = document.createElement('article');
    row.className = 'cart-item';
    const details = document.createElement('div');
    details.className = 'cart-item-details';
    const name = document.createElement('h3');
    name.textContent = item.name;
    const summary = document.createElement('p');
    summary.textContent = `${formatPrice(item.price)} × ${item.quantity} = ${formatPrice(item.lineTotal)}`;
    details.append(name, summary);
    const actions = document.createElement('div');
    actions.className = 'cart-item-actions';
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'quantity-button compact';
    minus.textContent = '−';
    minus.disabled = item.quantity <= 1;
    const quantity = document.createElement('output');
    quantity.className = 'quantity-value';
    quantity.textContent = String(item.quantity);
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'quantity-button compact';
    plus.textContent = '+';
    minus.addEventListener('click', () => {
      if (item.quantity > 1) void changeCartItem(item.productId, item.quantity - 1);
    });
    plus.disabled = item.quantity >= 99;
    plus.addEventListener('click', () => {
      if (item.quantity < 99) void changeCartItem(item.productId, item.quantity + 1);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-cart-button';
    remove.textContent = 'Удалить';
    remove.addEventListener('click', () => void changeCartItem(item.productId, null, true));
    actions.append(minus, quantity, plus, remove);
    row.append(details, actions);
    productsElement.append(row);
  }
  const total = document.createElement('p');
  total.className = 'cart-total';
  total.textContent = `Итого: ${formatPrice(cart.total)}`;
  if (cart.items.length) {
    productsElement.append(total);
    const checkout = document.createElement('button');
    checkout.type = 'button';
    checkout.className = 'primary-button';
    checkout.textContent = 'Оформить заказ';
    checkout.addEventListener('click', () => void prepareCheckout());
    productsElement.append(checkout);
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'back-button continue-shopping';
    back.textContent = '← Продолжить покупки';
    back.addEventListener('click', continueShopping);
    productsElement.append(back);
  }
}

function cartSignature(value) {
  return JSON.stringify({
    items: value.items.map((item) => [String(item.productId), item.quantity, item.price, item.lineTotal]),
    total: value.total,
  });
}

function appendField(form, labelText, name, value, type = 'text', required = true, maxLength) {
  const label = document.createElement('label');
  label.className = 'form-field';
  label.textContent = labelText;
  const input = document.createElement(name === 'comment' ? 'textarea' : 'input');
  input.name = name;
  if (name !== 'comment') input.type = type;
  input.value = value ?? '';
  input.required = required;
  if (maxLength) input.maxLength = maxLength;
  if (name === 'name') { input.minLength = 2; input.autocomplete = 'name'; }
  if (name === 'phone') { input.minLength = 7; input.maxLength = 20; input.autocomplete = 'tel'; }
  if (name === 'address') { input.minLength = 5; input.autocomplete = 'street-address'; }
  if (name === 'comment') input.rows = 3;
  label.append(input);
  form.append(label);
  return input;
}

function renderCheckoutForm() {
  catalogTitleElement.textContent = 'Оформление заказа';
  productsElement.replaceChildren();
  const form = document.createElement('form');
  form.className = 'checkout-form';
  appendField(form, 'Имя', 'name', profile?.firstName ?? '', 'text', true, 100);
  appendField(form, 'Телефон', 'phone', profile?.phone ?? '', 'tel', true, 20);
  appendField(form, 'Адрес доставки', 'address', profile?.address ?? '', 'text', true, 300);
  appendField(form, 'Комментарий', 'comment', '', 'text', false, 500);
  const paymentTitle = document.createElement('p');
  paymentTitle.className = 'form-section-title';
  paymentTitle.textContent = 'Способ оплаты';
  form.append(paymentTitle);
  for (const [value, labelText] of [['cash', 'Наличные курьеру'], ['card_on_delivery', 'Картой курьеру']]) {
    const label = document.createElement('label');
    label.className = 'payment-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'paymentMethod';
    radio.value = value;
    radio.required = true;
    if (value === 'cash') radio.checked = true;
    label.append(radio, document.createTextNode(labelText));
    form.append(label);
  }
  const total = document.createElement('p');
  total.className = 'cart-total';
  total.textContent = `Итого: ${formatPrice(cart.total)}`;
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'primary-button';
  submit.textContent = 'Оформить заказ';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'back-button continue-shopping';
  back.textContent = '← Вернуться в корзину';
  back.addEventListener('click', () => { catalogTitleElement.textContent = 'Корзина'; renderCart(); });
  form.append(total, submit, back);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (checkoutSubmitting) return;
    checkoutSubmitting = true;
    submit.disabled = true;
    submit.textContent = 'Оформляем…';
    setStatus();
    const data = new FormData(form);
    try {
      const result = await createOrder({
        name: data.get('name'), phone: data.get('phone'), address: data.get('address'),
        comment: data.get('comment'), paymentMethod: data.get('paymentMethod'),
      });
      cart = { items: [], total: 0 };
      updateCartButton();
      renderOrderSuccess(result.order, result.notifications);
      checkoutSubmitting = false;
    } catch (error) {
      setStatus(error.message || 'Не удалось оформить заказ.', 'error');
      submit.disabled = false;
      submit.textContent = 'Оформить заказ';
      checkoutSubmitting = false;
    }
  });
  productsElement.append(form);
  setStatus();
}

async function prepareCheckout() {
  setStatus('Проверяем актуальную корзину…');
  try {
    const latest = (await getCart()).cart;
    const changed = cartSignature(latest) !== cartSignature(cart);
    cart = latest;
    updateCartButton();
    if (!cart.items.length) {
      catalogTitleElement.textContent = 'Корзина';
      renderCart();
      setStatus('Корзина пуста. Добавьте блюда из меню.');
      return;
    }
    if (changed) {
      catalogTitleElement.textContent = 'Корзина';
      renderCart();
      setStatus('Корзина обновилась. Проверьте количество и сумму перед оформлением.');
      return;
    }
    renderCheckoutForm();
  } catch (error) {
    setStatus(error.message || 'Не удалось проверить корзину.', 'error');
  }
}

function renderOrderSuccess(order, notifications = {}) {
  catalogTitleElement.textContent = 'Заказ оформлен';
  productsElement.replaceChildren();
  const card = document.createElement('article');
  card.className = 'order-card';
  const title = document.createElement('h3');
  title.textContent = '✅ Заказ оформлен!';
  const number = document.createElement('p');
  number.textContent = `Заказ №${order.orderNumber}`;
  const total = document.createElement('p');
  total.textContent = `Сумма: ${formatPrice(order.total)}`;
  const status = document.createElement('p');
  status.textContent = `Статус: 🆕 ${order.statusLabel}`;
  card.append(title, number, total, status);
  productsElement.append(card);
  if (notifications.customer === false || notifications.admin === false) {
    setStatus('Заказ сохранён, но одно из Telegram-уведомлений не удалось отправить.');
  } else setStatus();
  const details = makeButton('📦 Мой заказ', 'primary-button', () => void openOrder(order.orderNumber));
  const menu = makeButton('🍔 Вернуться в меню', 'back-button', continueShopping);
  productsElement.append(details, menu);
}

function makeButton(text, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.addEventListener('click', handler);
  return button;
}

function renderOrderList(orders) {
  catalogTitleElement.textContent = 'Мои заказы';
  categoriesElement.hidden = true;
  productsElement.replaceChildren();
  setStatus();
  if (!orders.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-cart';
    empty.textContent = 'У вас пока нет заказов.';
    productsElement.append(empty);
  }
  for (const order of orders) {
    const button = makeButton('', 'order-card order-list-button', () => void openOrder(order.orderNumber));
    const title = document.createElement('strong');
    title.textContent = `Заказ №${order.orderNumber}`;
    const detail = document.createElement('span');
    detail.textContent = `${formatPrice(order.total)} · ${order.statusLabel}`;
    button.append(title, detail);
    productsElement.append(button);
  }
  productsElement.append(makeButton('🍔 К меню', 'back-button continue-shopping', continueShopping));
}

async function openOrders() {
  categoriesElement.hidden = true;
  productsElement.replaceChildren();
  catalogTitleElement.textContent = 'Мои заказы';
  setStatus('Загружаем заказы…');
  try { renderOrderList((await getOrders()).orders); }
  catch (error) { setStatus(error.message || 'Не удалось загрузить заказы.', 'error'); }
}

async function openOrder(orderNumber) {
  categoriesElement.hidden = true;
  productsElement.replaceChildren();
  catalogTitleElement.textContent = `Заказ №${orderNumber}`;
  setStatus('Загружаем заказ…');
  try {
    const order = (await getOrder(orderNumber)).order;
    productsElement.replaceChildren();
    const card = document.createElement('article');
    card.className = 'order-card order-detail-card';
    const lines = [
      `Заказ №${order.orderNumber}`,
      `Дата: ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.createdAt))}`,
      `Статус: ${order.statusLabel}`,
      ...order.items.map((item) => `${item.name} × ${item.quantity} — ${formatPrice(item.lineTotal)}`),
      `Итого: ${formatPrice(order.total)}`,
      `Адрес: ${order.address}`,
      `Оплата: ${order.paymentLabel}`,
      ...(order.comment ? [`Комментарий: ${order.comment}`] : []),
    ];
    for (const line of lines) {
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      card.append(paragraph);
    }
    productsElement.append(card);
    productsElement.append(makeButton('← К моим заказам', 'back-button continue-shopping', () => void openOrders()));
    setStatus();
  } catch (error) { setStatus(error.message || 'Не удалось загрузить заказ.', 'error'); }
}

async function changeCartItem(productId, quantity, remove = false) {
  productsElement.setAttribute('aria-busy', 'true');
  try {
    const result = remove
      ? await deleteCartItem(productId)
      : await setCartItemQuantity(productId, quantity);
    cart = result.cart;
    updateCartButton();
    renderCart();
  } catch (error) {
    setStatus(error.message || 'Не удалось обновить корзину.', 'error');
  } finally {
    productsElement.removeAttribute('aria-busy');
  }
}

async function openCart() {
  productRequestId += 1;
  categoriesElement.hidden = true;
  catalogTitleElement.textContent = 'Корзина';
  cartButton.setAttribute('aria-pressed', 'true');
  productsElement.replaceChildren();
  setStatus('Загружаем корзину…');
  try {
    const result = await getCart();
    cart = result.cart;
    updateCartButton();
    renderCart();
  } catch (error) {
    setStatus(error.message || 'Не удалось загрузить корзину.', 'error');
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'back-button continue-shopping';
    back.textContent = '← Продолжить покупки';
    back.addEventListener('click', continueShopping);
    productsElement.append(back);
  }
}

cartButton.addEventListener('click', () => void openCart());
ordersButton.addEventListener('click', () => void openOrders());

async function start() {
  if (!telegramApp?.initData) {
    setStatus('Откройте эту страницу из Telegram через кнопку «Открыть приложение».', 'error');
    return;
  }

  telegramApp.ready();
  telegramApp.expand();
  applyTelegramTheme();
  telegramApp.onEvent('themeChanged', applyTelegramTheme);
  try {
    await authenticateTelegram();
    const [currentProfile, catalog, currentCart] = await Promise.all([getMe(), getCategories(), getCart()]);
    profile = currentProfile.user;
    cart = currentCart.cart;
    updateCartButton();
    greetingElement.textContent = profile.firstName
      ? `Здравствуйте, ${profile.firstName}!`
      : 'Готовим для вас';
    categories = catalog.categories;
    if (!categories.length) {
      setStatus('Меню пока пустое. Загляните позже.');
      return;
    }
    selectedCategoryId = categories[0].id;
    renderCategories();
    await selectCategory(selectedCategoryId);
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

void start();
