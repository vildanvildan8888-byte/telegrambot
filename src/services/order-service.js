import { createOrder, getOrder, updateOrderStatus } from '../repositories/orders.js';
import { PAYMENT_METHODS, validateCheckoutField } from '../domain/checkout.js';

export async function placeOrder(input) {
  const { details } = input;
  for (const field of ['name', 'phone', 'address', 'comment']) {
    if (!validateCheckoutField(field, details[field])) {
      throw new Error(`Проверьте поле «${field}» и попробуйте ещё раз.`);
    }
  }
  if (!PAYMENT_METHODS.includes(details.paymentMethod)) {
    throw new Error('Выберите способ оплаты из предложенных вариантов.');
  }
  return createOrder(input);
}

export function loadOrder(orderNumber, restaurantId) {
  return getOrder(orderNumber, restaurantId);
}

export function changeOrderStatus(orderNumber, restaurantId, nextStatus) {
  return updateOrderStatus(orderNumber, restaurantId, nextStatus);
}
