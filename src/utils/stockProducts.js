export function isDraftStockProduct(item) {
  return /\(DRAFT\)\s*$/i.test(String(item.productTitle || item.varian || ''));
}
