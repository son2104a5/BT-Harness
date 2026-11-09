function calculateCart(items, voucher) {
  if (!Array.isArray(items)) {
    throw new TypeError('Tham số items phải là một mảng');
  }

  const subtotal = items.reduce((acc, item) => {
    if (typeof item.price !== 'number' || item.price < 0) {
      throw new Error('Đơn giá không hợp lệ');
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('Số lượng không hợp lệ');
    }
    return acc + item.price * item.quantity;
  }, 0);

  let discount = 0;
  if (voucher && typeof voucher.code === 'string') {
    if (voucher.code === 'SALE10') {
      discount = subtotal * 0.1;
    } else if (voucher.code === 'VIP20') {
      discount = subtotal * 0.2;
    }
  }

  discount = Math.min(discount, subtotal);
  const vat = Math.round((subtotal - discount) * 0.1 * 100) / 100;
  const total = Math.round((subtotal - discount + vat) * 100) / 100;

  return {
    subtotal,
    discount,
    vat,
    total
  };
}
