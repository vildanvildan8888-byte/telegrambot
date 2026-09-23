export const ORDER_STATUSES = Object.freeze({
  new: 'Новый',
  accepted: 'Принят',
  preparing: 'Готовится',
  delivering: 'У курьера',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
});

const transitions = Object.freeze({
  new: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['delivering', 'cancelled'],
  delivering: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
});

export function canTransition(current, next) {
  return transitions[current]?.includes(next) ?? false;
}

export function nextStatuses(current) {
  return transitions[current] ?? [];
}
