import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { parseLocalizedNumber, parseSalesCsv } from '../src/utils/salesCsv.js';
import {
  allocatePaymentSales,
  CSV_COLUMNS,
  initializeSalesDatabase,
  insertSalesRows,
  makeWhere,
} from '../salesDb.js';

const headings = CSV_COLUMNS.map(([, label]) => label).join(',');

test('parses the checked-in clean CSV with the selected schema and full rupiah values', () => {
  const csv = fs.readFileSync(new URL('../data/sales_clean.csv', import.meta.url), 'utf8');
  const rows = parseSalesCsv(csv);
  assert.equal(rows.length, 16563);
  assert.equal(parseLocalizedNumber('40,000.00'), 40000);
  assert.equal(rows[0].price, 85000);
  assert.equal(rows[0].subtotal, rows[0].qty * rows[0].price);
  assert.equal(rows.at(-1).total_after_bill_discount, 15400);
  assert.equal(rows.find((row) => row.discount > 0).discount, 3750);
  assert.deepEqual(Object.keys(rows[0]), CSV_COLUMNS.map(([key]) => key));
});

test('preserves promo rows and computes subtotal from quantity and price', () => {
  const csv = `${headings},Bill Discount\n2026-01-02T10:15:00,TEBET,DINE IN,CASH,PROMO,PROMO,BUY 1 GET 1,2,"40,000.00",1,5000,"75,000.00",1000`;
  const [row] = parseSalesCsv(csv);
  assert.equal(row.sales_date_in, '2026-01-02 10:15:00');
  assert.equal(row.menu_category, 'PROMO');
  assert.equal(row.menu_category_detail, 'PROMO');
  assert.equal(row.menu, 'BUY 1 GET 1');
  assert.equal(row.subtotal, 80000);
  assert.equal(row.discount, 6000);
  assert.equal(row.total_after_bill_discount, 75000);
});

test('rejects uploads that omit a required clean field', () => {
  const csv = `${headings.replace(',Discount,Total After Bill Discount', ',Discount')}\n2026-01-02,TEBET,DINE IN,CASH,PROMO,PROMO,Promo,1,10000,10000,0`;
  assert.throws(() => parseSalesCsv(csv), /Could not find all required columns/);
});

test('allocates split-tender sales proportionally and keeps amounts balanced', () => {
  const rows = allocatePaymentSales([
    { payment_method: 'CASH (2.000),QRIS BCA (8.000)', sales: 10000 },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.fromEntries(rows.map((row) => [row.payment_method, row.sales])), {
    CASH: 2000,
    'QRIS BCA': 8000,
  });
  assert.equal(rows.reduce((sum, row) => sum + row.sales, 0), 10000);
});

test('stores only clean sales fields and always computes subtotal', () => {
  const db = new DatabaseSync(':memory:');
  try {
    initializeSalesDatabase(db);
    insertSalesRows(db, {
      fileId: 'test-import',
      filename: 'test.csv',
      rows: [{
        sales_date_in: '2026-01-02 10:15:00',
        branch: 'TEBET',
        visit_purpose: 'DINE IN',
        payment_method: 'CASH',
        menu_category: 'BEER',
        menu_category_detail: 'BRAND',
        menu: 'PRODUCT',
        qty: 2,
        price: 40000,
        subtotal: 1,
        discount: 1000,
        total_after_bill_discount: 79000,
      }],
    });

    const stored = db.prepare('SELECT * FROM sales_transactions').get();
    assert.equal(stored.subtotal, 80000);
    assert.equal(stored.total_after_bill_discount, 79000);
    assert.deepEqual(
      db.prepare('PRAGMA table_info(sales_transactions)').all().map((column) => column.name).slice(3),
      CSV_COLUMNS.map(([key]) => key),
    );
  } finally {
    db.close();
  }
});

test('skips rows that already exist in the database (same Sales Date In and Menu) and counts them', () => {
  const db = new DatabaseSync(':memory:');
  try {
    initializeSalesDatabase(db);
    const firstRow = {
      sales_date_in: '2026-01-02 10:15:00',
      branch: 'TEBET',
      visit_purpose: 'DINE IN',
      payment_method: 'CASH',
      menu_category: 'BEER',
      menu_category_detail: 'BINTANG',
      menu: 'BINTANG BOTOL 620ML',
      qty: 1,
      price: 60000,
      subtotal: 60000,
      discount: 0,
      total_after_bill_discount: 60000,
    };
    const firstResult = insertSalesRows(db, { fileId: 'import-1', filename: 'a.csv', rows: [firstRow] });
    assert.equal(firstResult.row_count, 1);
    assert.equal(firstResult.duplicate_count, 0);

    // Re-uploading a different CSV containing the same row plus one new row should
    // skip the already-imported row and only insert the new one.
    const secondResult = insertSalesRows(db, {
      fileId: 'import-2',
      filename: 'b.csv',
      rows: [
        firstRow,
        { ...firstRow, menu: 'BINTANG BOTOL 620ML COPY', total_after_bill_discount: 60000 },
      ],
    });
    assert.equal(secondResult.duplicate_count, 1);

    const totalRows = db.prepare('SELECT COUNT(*) AS count FROM sales_transactions').get().count;
    assert.equal(totalRows, 2);
  } finally {
    db.close();
  }
});

test('filters sales by multiple selected stores, no stores, and custom date ranges', () => {
  const db = new DatabaseSync(':memory:');
  try {
    initializeSalesDatabase(db);
    insertSalesRows(db, {
      fileId: 'filter-test',
      filename: 'filter-test.csv',
      rows: [
        { sales_date_in: '2026-01-02 10:00:00', branch: 'SUDIRMAN', qty: 1, price: 100, discount: 0, total_after_bill_discount: 100 },
        { sales_date_in: '2026-01-03 10:00:00', branch: 'KWITANG', qty: 1, price: 200, discount: 0, total_after_bill_discount: 200 },
        { sales_date_in: '2026-01-04 10:00:00', branch: 'KUNINGAN', qty: 1, price: 300, discount: 0, total_after_bill_discount: 300 },
      ],
    });

    const forStores = makeWhere({ storeIds: 'SUDIRMAN,KWITANG', startDate: '2026-01-02', endDate: '2026-01-03' });
    const selected = db.prepare(`SELECT branch FROM sales_transactions ${forStores.sql} ORDER BY branch`).all(...forStores.values);
    assert.deepEqual(selected.map((row) => row.branch), ['KWITANG', 'SUDIRMAN']);

    const none = makeWhere({ storeIds: '' });
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM sales_transactions ${none.sql}`).get(...none.values).count, 0);
  } finally {
    db.close();
  }
});
