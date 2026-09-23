import { getProduct, listCategories, listProducts } from '../repositories/catalog.js';

export function getRestaurantCategories(restaurantId) {
  return listCategories(restaurantId);
}

export function getCategoryProducts(restaurantId, categoryId) {
  return listProducts(restaurantId, categoryId);
}

export function getAvailableProduct(restaurantId, productId) {
  return getProduct(restaurantId, productId);
}
