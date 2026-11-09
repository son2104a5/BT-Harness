function calculateCart(items, voucher) {
  if (!Array.isArray(items)) throw new Error('Items must be an array');
  let subtotal = 0;
  for (let item of items) {
    subtotal += item.price * item.quantity;
  }
  let discount = 0;
  if (voucher && voucher.code === 'SALE10') {
    discount = subtotal * 0.1;
  }
  const vat = (subtotal - discount) * 0.1;
  return {
    subtotal,
    discount,
    vat,
    total: subtotal - discount + vat
  };
}
