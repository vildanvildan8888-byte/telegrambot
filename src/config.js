import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('Не задана обязательная переменная окружения DATABASE_URL');

export const config = Object.freeze({
  botToken: process.env.BOT_TOKEN?.trim() || '',
  databaseUrl,
  adminId: process.env.ADMIN_ID?.trim() || '',
  restaurantId: process.env.RESTAURANT_ID?.trim() || 'tasty-yard-demo',
  helpContact: process.env.HELP_CONTACT?.trim() || '@your_support_username',
});

export function assertBotConfig() {
  if (!config.botToken) throw new Error('Не задана обязательная переменная окружения BOT_TOKEN');
  if (!config.adminId) throw new Error('Не задана обязательная переменная окружения ADMIN_ID');
  if (!/^-?\d+$/.test(config.adminId)) {
    throw new Error('ADMIN_ID должен быть числовым Telegram ID');
  }
}
