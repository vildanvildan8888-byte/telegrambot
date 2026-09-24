import { assertBotConfig, config } from './config.js';
import { pool } from './database/pool.js';
import { runMigrations } from './database/migrate.js';
import { seed } from './database/seed.js';
import { createBot } from './bot/index.js';
import { createHttpServer } from './http-server.js';
import { buildWebhookUrl, resolveWebhookSecret } from './webhook.js';
import { createMiniAppApi } from './mini-app/api.js';
import { placeOrder, listCustomerOrders, loadCustomerOrder } from './services/order-service.js';
import { notifyAdminAboutOrder, notifyCustomerAboutOrder } from './bot/order-notifications.js';
import { downloadTelegramProductPhoto } from './mini-app/telegram-photo.js';
import { deleteCartItem, loadCart, setCartItemQuantity } from './services/cart-service.js';
import {
  findTelegramUserById,
  upsertTelegramUser,
} from './repositories/users.js';
import {
  getAvailableProduct,
  getCategoryProducts,
  getRestaurantCategories,
} from './services/catalog-service.js';

let server;
let isShuttingDown = false;

function listen(httpServer, port) {
  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, '0.0.0.0', resolve);
  });
}

function closeServer(httpServer) {
  if (!httpServer?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main() {
  assertBotConfig();
  await pool.query('SELECT 1');
  await runMigrations(pool);
  await seed(pool);

  const bot = createBot();
  bot.botInfo = await bot.telegram.getMe();
  const webhookUrl = buildWebhookUrl(config.webhookUrl);
  const miniAppUrl = new URL('/app/', config.webhookUrl).toString();
  const webhookSecret = resolveWebhookSecret(config.webhookSecret, config.botToken);
  const webhookHandler = bot.webhookCallback('/telegram/webhook', { secretToken: webhookSecret });
  const miniAppHandler = createMiniAppApi({
    botToken: config.botToken,
    sessionSecret: config.webAppSessionSecret,
    restaurantId: config.restaurantId,
    origin: new URL(config.webhookUrl).origin,
    upsertUser: upsertTelegramUser,
    findUserByTelegramId: findTelegramUserById,
    listCategories: getRestaurantCategories,
    listProducts: getCategoryProducts,
    getProduct: getAvailableProduct,
    getCart: loadCart,
    setCartQuantity: setCartItemQuantity,
    deleteCartItem,
    getTelegramPhoto: (fileId) => downloadTelegramProductPhoto(
      fileId,
      config.botToken,
      (id) => bot.telegram.getFile(id),
    ),
    placeOrder,
    listCustomerOrders,
    loadCustomerOrder,
    notifyAdmin: (order) => notifyAdminAboutOrder(bot.telegram, config.adminId, order),
    notifyCustomer: (telegramId, order) => notifyCustomerAboutOrder(bot.telegram, telegramId, order),
  });
  server = createHttpServer({ webhookHandler, webhookSecret, miniAppHandler });
  await listen(server, config.port);

  try {
    await bot.telegram.setWebhook(webhookUrl, {
      secret_token: webhookSecret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    });
    if (config.webAppSessionSecret.length >= 32) {
      try {
        await bot.telegram.setChatMenuButton({
          menu_button: {
            type: 'web_app',
            text: 'Открыть приложение',
            web_app: { url: miniAppUrl },
          },
        });
      } catch (error) {
        console.warn('Не удалось установить кнопку Mini App в меню Telegram:', error.message);
      }
    }
  } catch (error) {
    await closeServer(server);
    throw error;
  }
  console.log(`Telegram webhook настроен для ${config.restaurantId}: ${webhookUrl}`);
}

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Получен ${signal}, завершаю работу…`);
  try {
    await closeServer(server);
  } catch (error) {
    console.error('Ошибка закрытия HTTP-сервера:', error.message);
  }
  await pool.end();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

main().catch(async (error) => {
  console.error('Не удалось запустить бота:', error.message);
  try {
    await closeServer(server);
  } catch (closeError) {
    console.error('Ошибка закрытия HTTP-сервера:', closeError.message);
  }
  await pool.end();
  process.exitCode = 1;
});
