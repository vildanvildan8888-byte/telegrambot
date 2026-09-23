export function calculateCartTotal(items) {
  return items.reduce((sum, item) =>
    sum + Number(item.price) * Number(item.quantity), 0);
}
