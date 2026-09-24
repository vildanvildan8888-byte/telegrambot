import { authenticateTelegram, getCategories, getMe, getProduct, getProducts, telegramApp } from './api.js';

const categoriesElement = document.querySelector('#categories');
const productsElement = document.querySelector('#products');
const statusElement = document.querySelector('#status');
const greetingElement = document.querySelector('#greeting');

let categories = [];
let selectedCategoryId = null;
let selectedProducts = [];
let productRequestId = 0;

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
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'product-card';
    const name = document.createElement('h3');
    name.textContent = product.name;
    const description = document.createElement('p');
    description.textContent = product.description || 'Описание не указано.';
    const price = document.createElement('strong');
    price.className = 'product-price';
    price.textContent = formatPrice(product.price);
    card.append(name, description, price);
    card.addEventListener('click', () => void openProduct(product.id));
    productsElement.append(card);
  }
}

function renderProductDetails(product) {
  productsElement.replaceChildren();
  const card = document.createElement('article');
  card.className = 'product-detail';
  const name = document.createElement('h3');
  name.textContent = product.name;
  const description = document.createElement('p');
  description.textContent = product.description || 'Описание не указано.';
  const price = document.createElement('strong');
  price.className = 'product-price';
  price.textContent = formatPrice(product.price);
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'back-button';
  back.textContent = '← Назад';
  back.addEventListener('click', () => {
    productRequestId += 1;
    renderProducts(selectedProducts);
  });
  card.append(name, description, price, back);
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
  productRequestId += 1;
  selectedCategoryId = categoryId;
  renderCategories();
  productsElement.replaceChildren();
  setStatus('Загружаем блюда…');
  try {
    const result = await getProducts(categoryId);
    renderProducts(result.products);
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

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
    const [profile, catalog] = await Promise.all([getMe(), getCategories()]);
    greetingElement.textContent = profile.user.firstName
      ? `Здравствуйте, ${profile.user.firstName}!`
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
