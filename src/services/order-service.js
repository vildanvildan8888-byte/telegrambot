import {
  createOrder, getOrder, getUserOrder, listUserOrders, updateOrderStatus,
} from '../repositories/orders.js';
import { PAYMENT_METHODS, validateCheckoutField } from '../domain/checkout.js';

export async function placeOrder(input) {
  const { details } = input;
  for (const field of ['name', 'phone', 'address', 'comment']) {
    if (!validateCheckoutField(field, details[field])) {
      throw Object.assign(new Error(`Проверьте поле «${field}» и попробуйте ещё раз.`), { code: 'CHECKOUT_VALIDATION' });
    }
  }
  if (!PAYMENT_METHODS.includes(details.paymentMethod)) {
    throw Object.assign(new Error('Выберите способ оплаты из предложенных вариантов.'), { code: 'CHECKOUT_VALIDATION' });
  }
  return createOrder(input);
}

export function loadOrder(orderNumber, restaurantId) {
  return getOrder(orderNumber, restaurantId);
}

export function listCustomerOrders(userId, restaurantId) {
  return listUserOrders(userId, restaurantId);
}

export function loadCustomerOrder(orderNumber, userId, restaurantId) {
  return getUserOrder(orderNumber, userId, restaurantId);
}

export function changeOrderStatus(orderNumber, restaurantId, nextStatus) {
  return updateOrderStatus(orderNumber, restaurantId, nextStatus);
}
