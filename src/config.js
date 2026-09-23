import 'dotenv/config';
import { parsePort, validateRuntimeConfig } from './webhook.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('Не задана обязательная переменная окружения DATABASE_URL');

export const config = Object.freeze({
  botToken: process.env.BOT_TOKEN?.trim() || '',
  databaseUrl,
  adminId: process.env.ADMIN_ID?.trim() || '',
  webhookUrl: process.env.WEBHOOK_URL?.trim() || '',
  webhookSecret: process.env.WEBHOOK_SECRET?.trim() || '',
  port: parsePort(process.env.PORT),
  restaurantId: process.env.RESTAURANT_ID?.trim() || 'tasty-yard-demo',
  helpContact: process.env.HELP_CONTACT?.trim() || '@your_support_username',
});

export function assertBotConfig() {
  validateRuntimeConfig(config);
}
