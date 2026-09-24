// Database-injected repository operations keep photo persistence testable without a live PostgreSQL instance.
export async function saveProductPhoto(database, restaurantId, productId, fileId) {
  const result = await database.query(
    `UPDATE products
     SET photo_url = $3
     WHERE restaurant_id = $1 AND id = $2
     RETURNING id, name, category_id, photo_url`,
    [restaurantId, productId, fileId],
  );
  return result.rows[0] ?? null;
}

export async function deleteProductPhoto(database, restaurantId, productId) {
  const result = await database.query(
    `UPDATE products
     SET photo_url = NULL
     WHERE restaurant_id = $1 AND id = $2
     RETURNING id, name, category_id, photo_url`,
    [restaurantId, productId],
  );
  return result.rows[0] ?? null;
}
