import { assertBotConfig, config } from './config.js';
import { pool } from './database/pool.js';
import { runMigrations } from './database/migrate.js';
import { seed } from './database/seed.js';
import { createBot } from './bot/index.js';
import { createHttpServer } from './http-server.js';
import { buildWebhookUrl, resolveWebhookSecret } from './webhook.js';

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
  const webhookSecret = resolveWebhookSecret(config.webhookSecret, config.botToken);
  const webhookHandler = bot.webhookCallback('/telegram/webhook', { secretToken: webhookSecret });
  server = createHttpServer({ webhookHandler, webhookSecret });
  await listen(server, config.port);

  try {
    await bot.telegram.setWebhook(webhookUrl, {
      secret_token: webhookSecret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    });
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
