import { pool } from '../database/pool.js';

export async function listCategories(restaurantId, database = pool) {
  const result = await database.query(
    `SELECT id, slug, name FROM categories
     WHERE restaurant_id = $1 AND is_available = TRUE
     ORDER BY sort_order, name`,
    [restaurantId],
  );
  return result.rows;
}

export async function listProducts(restaurantId, categoryId, database = pool) {
  const result = await database.query(
    `SELECT p.id, p.name, p.description, p.price, p.photo_url, c.name AS category_name
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.restaurant_id = $1 AND p.category_id = $2 AND p.is_available = TRUE
     ORDER BY p.name`,
    [restaurantId, categoryId],
  );
  return result.rows;
}

export async function getProduct(restaurantId, productId, database = pool) {
  const result = await database.query(
    `SELECT id, category_id, name, description, price, photo_url
     FROM products
     WHERE restaurant_id = $1 AND id = $2 AND is_available = TRUE`,
    [restaurantId, productId],
  );
  return result.rows[0] ?? null;
}
