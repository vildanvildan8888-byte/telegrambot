import { assertBotConfig, config } from './config.js';
import { pool } from './database/pool.js';
import { runMigrations } from './database/migrate.js';
import { seed } from './database/seed.js';
import { createBot } from './bot/index.js';

async function main() {
  assertBotConfig();
  await pool.query('SELECT 1');
  await runMigrations(pool);
  await seed(pool);

  const bot = createBot();
  await bot.launch();
  console.log(`Telegram-бот запущен для ресторана ${config.restaurantId}`);

  const shutdown = async (signal) => {
    console.log(`Получен ${signal}, завершаю работу…`);
    bot.stop(signal);
    await pool.end();
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(async (error) => {
  console.error('Не удалось запустить бота:', error.message);
  await pool.end();
  process.exitCode = 1;
});
