import {
  getProduct,
  getProductForManagement,
  listCategories,
  listProducts,
  listProductsForManagement,
  removeProductPhoto,
  updateProductPhoto,
} from '../repositories/catalog.js';

export function getRestaurantCategories(restaurantId) {
  return listCategories(restaurantId);
}

export function getCategoryProducts(restaurantId, categoryId) {
  return listProducts(restaurantId, categoryId);
}

export function getAvailableProduct(restaurantId, productId) {
  return getProduct(restaurantId, productId);
}

export function getProductsForManagement(restaurantId, categoryId) {
  return listProductsForManagement(restaurantId, categoryId);
}

export function getManagedProduct(restaurantId, categoryId, productId) {
  return getProductForManagement(restaurantId, categoryId, productId);
}

export function saveManagedProductPhoto(restaurantId, productId, fileId) {
  return updateProductPhoto(restaurantId, productId, fileId);
}

export function deleteManagedProductPhoto(restaurantId, productId) {
  return removeProductPhoto(restaurantId, productId);
}
