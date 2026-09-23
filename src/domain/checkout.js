export const PAYMENT_METHODS = Object.freeze(['cash', 'card_on_delivery']);

export function validateCheckoutField(field, value) {
  const text = String(value ?? '').trim();
  if (field === 'name') return text.length >= 2 && text.length <= 100;
  if (field === 'phone') return /^\+?[\d ()-]{7,20}$/.test(text);
  if (field === 'address') return text.length >= 5 && text.length <= 300;
  if (field === 'comment') return text.length <= 500;
  return false;
}
