const PACK_LITRES = [1, 4, 10, 20];

function normalizePack(value) {
  const pack = Number(value);
  return PACK_LITRES.includes(pack) ? pack : null;
}

function isTintedProduct(product) {
  return Boolean(product?.attrs?.tinted);
}

function isTintedSaleItem(item) {
  if (!item) return false;
  if (item.tinted === true) return true;
  return isTintedProduct(item.product);
}

module.exports = { PACK_LITRES, normalizePack, isTintedProduct, isTintedSaleItem };
