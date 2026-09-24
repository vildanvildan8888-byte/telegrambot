export function selectedProductQuantity(session, productId) {
  session.productQuantities ??= {};
  return session.productQuantities[productId] ?? 1;
}

export function changeSelectedProductQuantity(session, productId, delta) {
  if (delta !== -1 && delta !== 1) throw new Error('Количество можно менять только на одну позицию.');
  const current = selectedProductQuantity(session, productId);
  const next = Math.max(1, Math.min(99, current + delta));
  session.productQuantities[productId] = next;
  return { current, quantity: next, changed: next !== current };
}
