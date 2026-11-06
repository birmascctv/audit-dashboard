import assert from 'node:assert/strict';
import test from 'node:test';
import { isDraftStockProduct } from '../src/utils/stockProducts.js';

test('only product names ending in (DRAFT) are excluded', () => {
  assert.equal(isDraftStockProduct({ productTitle: 'Cola (DRAFT)  ' }), true);
  assert.equal(isDraftStockProduct({ varian: 'Cola (draft)' }), true);
  assert.equal(isDraftStockProduct({ productTitle: 'Cola (DRAFT) large' }), false);
  assert.equal(isDraftStockProduct({ productTitle: 'Draft beer' }), false);
  assert.equal(isDraftStockProduct({}), false);
});
