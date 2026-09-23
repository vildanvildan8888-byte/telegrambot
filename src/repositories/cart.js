import { pool } from '../database/pool.js';
import { calculateCartTotal } from '../domain/cart.js';

export async function changeQuantity(userId, restaurantId, productId, delta, database = pool) {
  if (![1, -1].includes(delta)) throw new Error('Количество можно менять только на одну позицию.');
  const product = await database.query(
    'SELECT id FROM products WHERE id = $1 AND restaurant_id = $2 AND is_available = TRUE',
    [productId, restaurantId],
  );
  if (!product.rowCount) return false;

  if (delta > 0) {
    await database.query(
      `INSERT INTO cart_items(user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id) DO UPDATE
       SET quantity = cart_items.quantity + EXCLUDED.quantity, updated_at = NOW()`,
      [userId, productId, delta],
    );
  } else {
    await database.query(
      'DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2 AND quantity = 1',
      [userId, productId],
    );
    await database.query(
      `UPDATE cart_items SET quantity = quantity - 1, updated_at = NOW()
       WHERE user_id = $1 AND product_id = $2 AND quantity > 1`,
      [userId, productId],
    );
  }
  return true;
}

export async function getCart(userId, restaurantId, database = pool) {
  const result = await database.query(
    `SELECT p.id AS product_id, p.name, p.price, p.photo_url, ci.quantity,
            p.price * ci.quantity AS line_total
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1 AND p.restaurant_id = $2 AND p.is_available = TRUE
     ORDER BY p.name`,
    [userId, restaurantId],
  );
  const items = result.rows;
  const total = calculateCartTotal(items);
  return { items, total };
}
