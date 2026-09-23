import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, formatOrderNumber, paymentLabel } from '../src/domain/format.js';
import { canTransition, nextStatuses, ORDER_STATUSES } from '../src/domain/order-status.js';
import { PAYMENT_METHODS, validateCheckoutField } from '../src/domain/checkout.js';
import { calculateCartTotal } from '../src/domain/cart.js';

test('форматирует суммы и номера заказов', () => {
  assert.equal(formatMoney(87000), '87 000 сум');
  assert.equal(formatOrderNumber('1001'), '#1001');
  assert.equal(paymentLabel('card_on_delivery'), 'Картой курьеру');
});

test('разрешает только последовательные статусы заказа', () => {
  assert.equal(canTransition('new', 'accepted'), true);
  assert.equal(canTransition('new', 'delivered'), false);
  assert.deepEqual(nextStatuses('preparing'), ['delivering', 'cancelled']);
  assert.equal(ORDER_STATUSES.delivered, 'Доставлен');
});

test('проверяет поля формы оформления заказа', () => {
  assert.equal(validateCheckoutField('name', 'Али'), true);
  assert.equal(validateCheckoutField('name', 'А'), false);
  assert.equal(validateCheckoutField('phone', '+998 90 123 45 67'), true);
  assert.equal(validateCheckoutField('phone', 'не телефон'), false);
  assert.equal(validateCheckoutField('address', 'Ташкент, улица Навои, 10'), true);
  assert.equal(validateCheckoutField('comment', 'Без лука'), true);
  assert.deepEqual(PAYMENT_METHODS, ['cash', 'card_on_delivery']);
});

test('считает итог корзины по текущим ценам и количеству', () => {
  assert.equal(calculateCartTotal([
    { price: 35000, quantity: 2 },
    { price: 15000, quantity: 1 },
  ]), 85000);
  assert.equal(calculateCartTotal([]), 0);
});
