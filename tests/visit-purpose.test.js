import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateVisitPurpose } from '../src/utils/visitPurpose.js';

test('visit-purpose totals follow chart store selection within globally filtered rows', () => {
  const rows = [
    { branch: 'A', name: 'DINE IN', sales: 40 },
    { branch: 'A', name: 'DELIVERY', sales: 10 },
    { branch: 'B', name: 'DINE IN', sales: 30 },
    { branch: 'B', name: '', sales: 20 },
  ];
  assert.deepEqual(aggregateVisitPurpose(rows, null), [
    { name: 'DINE IN', sales: 70 }, { name: 'Unspecified', sales: 20 }, { name: 'DELIVERY', sales: 10 },
  ]);
  assert.deepEqual(aggregateVisitPurpose(rows, ['B']), [
    { name: 'DINE IN', sales: 30 }, { name: 'Unspecified', sales: 20 },
  ]);
  assert.deepEqual(aggregateVisitPurpose(rows, []), []);
});
