import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { pool } from './pool.js';
import { DEMO_CATEGORIES, DEMO_PRODUCTS } from './demo-menu.js';

export async function seed(database = pool) {
  await database.query(
    `INSERT INTO restaurants(id, name, currency) VALUES ($1, $2, 'UZS')
     ON CONFLICT (id) DO NOTHING`,
    [config.restaurantId, 'Вкусный двор'],
  );

  for (const category of DEMO_CATEGORIES) {
    await database.query(
      `INSERT INTO categories(restaurant_id, slug, name, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (restaurant_id, slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order`,
      [config.restaurantId, category.slug, category.name, category.sort],
    );
  }

  for (const product of DEMO_PRODUCTS) {
    await database.query(
      `INSERT INTO products(restaurant_id, category_id, slug, name, description, price)
       SELECT $1, c.id, $3, $4, $5, $6 FROM categories c
       WHERE c.restaurant_id = $1 AND c.slug = $2
       ON CONFLICT (restaurant_id, slug) DO UPDATE
       SET category_id = EXCLUDED.category_id, name = EXCLUDED.name,
           description = EXCLUDED.description, price = EXCLUDED.price`,
      [config.restaurantId, product.category, product.slug, product.name, product.description, product.price],
    );
  }

  console.log(`Демо-меню готово для ресторана ${config.restaurantId}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seed()
    .then(() => pool.end())
    .catch(async (error) => {
      console.error('Не удалось заполнить демо-меню:', error.message);
      await pool.end();
      process.exitCode = 1;
    });
}
