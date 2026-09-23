export function formatMoney(amount) {
  const formatted = new Intl.NumberFormat('ru-RU').format(Number(amount))
    .replaceAll('\u00a0', ' ')
    .replaceAll('\u202f', ' ');
  return `${formatted} сум`;
}

export function paymentLabel(method) {
  return method === 'card_on_delivery' ? 'Картой курьеру' : 'Наличными курьеру';
}

export function formatOrderNumber(orderNumber) {
  return `#${String(orderNumber).padStart(4, '0')}`;
}
