function calculateCart(items, voucher) {
  var subtotal = 0;
  for (var i = 0; i < items.length; i++) {
    subtotal += items[i].price * items[i].quantity;
  }
  var discount = 0;
  if (voucher.code == 'SALE10') {
    discount = 50000;
  }
  var vat = subtotal * 0.1;
  return {
    subtotal: subtotal,
    discount: discount,
    vat: vat,
    total: subtotal - discount + vat
  };
}
