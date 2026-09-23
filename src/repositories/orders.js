import { pool } from '../database/pool.js';
import { canTransition } from '../domain/order-status.js';

export async function createOrder({ userId, restaurantId, details }, database = pool) {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const cart = await client.query(
      `SELECT ci.product_id, ci.quantity, p.name, p.price, p.is_available
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1 AND p.restaurant_id = $2
       FOR UPDATE OF ci, p`,
      [userId, restaurantId],
    );
    if (!cart.rowCount) throw new Error('Корзина пуста. Добавьте товары перед оформлением.');
    if (cart.rows.some((item) => !item.is_available)) {
      throw new Error('Одно из блюд больше недоступно. Обновите корзину.');
    }

    const total = cart.rows.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.quantity), 0,
    );
    const created = await client.query(
      `INSERT INTO orders(restaurant_id, user_id, customer_name, phone, address, comment, payment_method, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, order_number, status, total_amount, created_at`,
      [restaurantId, userId, details.name, details.phone, details.address, details.comment,
        details.paymentMethod, total],
    );
    const order = created.rows[0];

    for (const item of cart.rows) {
      await client.query(
        `INSERT INTO order_items(order_id, product_id, product_name, unit_price, quantity, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, item.product_id, item.name, item.price, item.quantity,
          Number(item.price) * Number(item.quantity)],
      );
    }
    await client.query(
      `DELETE FROM cart_items ci USING products p
       WHERE ci.product_id = p.id AND ci.user_id = $1 AND p.restaurant_id = $2`,
      [userId, restaurantId],
    );
    await client.query('UPDATE users SET phone = $2, address = $3, updated_at = NOW() WHERE id = $1',
      [userId, details.phone, details.address]);
    await client.query('COMMIT');
    return { ...order, items: cart.rows };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listUserOrders(userId, restaurantId, database = pool) {
  const result = await database.query(
    `SELECT id, order_number, status, total_amount, created_at
     FROM orders WHERE user_id = $1 AND restaurant_id = $2
     ORDER BY created_at DESC LIMIT 10`,
    [userId, restaurantId],
  );
  return result.rows;
}

export async function getOrder(orderNumber, restaurantId, database = pool) {
  const orderResult = await database.query(
    `SELECT o.*, u.telegram_id
     FROM orders o JOIN users u ON u.id = o.user_id
     WHERE o.order_number = $1 AND o.restaurant_id = $2`,
    [orderNumber, restaurantId],
  );
  if (!orderResult.rowCount) return null;
  const order = orderResult.rows[0];
  const itemsResult = await database.query(
    'SELECT product_name, unit_price, quantity, line_total FROM order_items WHERE order_id = $1 ORDER BY id',
    [order.id],
  );
  return { ...order, items: itemsResult.rows };
}

export async function updateOrderStatus(orderNumber, restaurantId, nextStatus, database = pool) {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT o.id, o.status, u.telegram_id FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.order_number = $1 AND o.restaurant_id = $2 FOR UPDATE OF o`,
      [orderNumber, restaurantId],
    );
    if (!found.rowCount) throw new Error('Заказ не найден.');
    const current = found.rows[0];
    if (!canTransition(current.status, nextStatus)) {
      throw new Error('Этот переход статуса сейчас недоступен.');
    }
    await client.query(
      'UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1',
      [current.id, nextStatus],
    );
    await client.query('COMMIT');
    return { telegramId: current.telegram_id, previousStatus: current.status, status: nextStatus };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
