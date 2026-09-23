import { changeQuantity, getCart } from '../repositories/cart.js';

export function loadCart(userId, restaurantId) {
  return getCart(userId, restaurantId);
}

export function adjustCartItem(userId, restaurantId, productId, delta) {
  if (delta !== -1 && delta !== 1) {
    throw new Error('Количество можно менять только на одну позицию за раз.');
  }
  return changeQuantity(userId, restaurantId, productId, delta);
}
