import { pool } from '../database/pool.js';

export async function upsertTelegramUser(from, database = pool) {
  const result = await database.query(
    `INSERT INTO users(telegram_id, username, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE
       SET username = EXCLUDED.username,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           updated_at = NOW()
     RETURNING id, telegram_id, phone, address`,
    [String(from.id), from.username ?? null, from.first_name ?? '', from.last_name ?? null],
  );
  return result.rows[0];
}

export async function updateUserAddress(userId, address, database = pool) {
  await database.query(
    'UPDATE users SET address = $2, updated_at = NOW() WHERE id = $1',
    [userId, address],
  );
}

export async function updateUserPhone(userId, phone, database = pool) {
  await database.query(
    'UPDATE users SET phone = $2, updated_at = NOW() WHERE id = $1',
    [userId, phone],
  );
}
