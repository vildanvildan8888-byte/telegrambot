import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { pool } from './pool.js';

const categories = [
  { slug: 'burgers', name: '🍔 Бургеры', sort: 1 },
  { slug: 'snacks', name: '🍟 Закуски', sort: 2 },
  { slug: 'drinks', name: '🥤 Напитки', sort: 3 },
];

const products = [
  { category: 'burgers', slug: 'classic-burger', name: 'Классический бургер', description: 'Говяжья котлета, салат, сыр и фирменный соус.', price: 35000 },
  { category: 'burgers', slug: 'chicken-burger', name: 'Чикен бургер', description: 'Хрустящая курица, свежие овощи и соус.', price: 32000 },
  { category: 'snacks', slug: 'fries', name: 'Картофель фри', description: 'Золотистый картофель с солью.', price: 15000 },
  { category: 'snacks', slug: 'nuggets', name: 'Куриные наггетсы', description: 'Куриные наггетсы, 6 штук.', price: 22000 },
  { category: 'drinks', slug: 'cola', name: 'Кола 0,5 л', description: 'Охлаждённый газированный напиток.', price: 10000 },
];

export async function seed(database = pool) {
  await database.query(
    `INSERT INTO restaurants(id, name, currency) VALUES ($1, $2, 'UZS')
     ON CONFLICT (id) DO NOTHING`,
    [config.restaurantId, 'Вкусный двор'],
  );

  for (const category of categories) {
    await database.query(
      `INSERT INTO categories(restaurant_id, slug, name, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (restaurant_id, slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order`,
      [config.restaurantId, category.slug, category.name, category.sort],
    );
  }

  for (const product of products) {
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
