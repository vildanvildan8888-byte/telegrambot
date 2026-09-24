import { addQuantity, changeQuantity, getCart, removeCartItem, setQuantity } from '../repositories/cart.js';

export function loadCart(userId, restaurantId) {
  return getCart(userId, restaurantId);
}

export function adjustCartItem(userId, restaurantId, productId, delta) {
  if (delta !== -1 && delta !== 1) {
    throw new Error('Количество можно менять только на одну позицию за раз.');
  }
  return changeQuantity(userId, restaurantId, productId, delta);
}

export function addCartItem(userId, restaurantId, productId, quantity) {
  return addQuantity(userId, restaurantId, productId, quantity);
}

export function setCartItemQuantity(userId, restaurantId, productId, quantity) {
  return setQuantity(userId, restaurantId, productId, quantity);
}

export function deleteCartItem(userId, restaurantId, productId) {
  return removeCartItem(userId, restaurantId, productId);
}
