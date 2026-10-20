import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  findStockPeriodExpectedQty,
  findStockPeriodProductRow,
  parseStockPeriodCsv,
  parseStockPeriodCsvDetails,
  STOCK_PERIOD_CSV_TEMPLATE_HEADER,
} from '../stockPeriodCsv.js';
import {
  getStockPeriodCsvDownload,
  getLatestStockPeriodCsvUpload,
  listStockPeriodCsvUploads,
  saveStockPeriodCsv,
  deleteStockPeriodCsvUpload,
} from '../stockPeriodCsvStore.js';

const header = STOCK_PERIOD_CSV_TEMPLATE_HEADER.join(',');
const preamble = [
  'Stock Period List,,,,,,,,,,',
  'PT. Birmas Merubah Persepsi,,,,,,,,,,',
  ',,,,,,,,,,',
  'Generated,15-10-2026 14:02:42,,,,,,,,,',
  'Stock Date,2026-10-15,,,,,,,,,',
  'Location,BIRMAS SUDIRMAN,,,,,,,,,',
  'Branch,All Branch,,,,,,,,,',
  ',,,,,,,,,,',
];

test('parses only Product Name and Stock Qty from the supplied Stock Period template', async () => {
  const sample = await readFile(new URL('../stock_period_list_15102026.csv', import.meta.url), 'utf8');
  const parsed = parseStockPeriodCsvDetails(sample);
  assert.equal(parsed.records.length, 806);
  assert.equal(parsed.generatedAt, '2026-10-15T14:02:42');
  assert.equal(parsed.stockDate, '2026-10-15');
  assert.deepEqual(parsed.stores, ['BIRMAS SUDIRMAN', 'BIRMAS KUNINGAN', 'BIRMAS KWITANG']);
  assert.deepEqual(parsed.records[0], {
    store: 'BIRMAS KUNINGAN',
    productName: 'ALBENS APPLE CIDER LYCHEE',
    category: 'FIZZY',
    brand: 'ALBENS',
    defaultUnit: 'CAN',
    stockQty: 2,
  });
});

test('accepts the exact header template and parses quoted names and decimal stock quantities', () => {
  const csv = [
    ...preamble,
    header,
    'BRMS,Location,"Product, Example",P-1,CAT,SUB,CAN,Active,0.00,1.50,25.00',
  ].join('\n');
  assert.deepEqual(parseStockPeriodCsv(csv), [
    {
      store: 'Location',
      productName: 'Product, Example',
      category: 'CAT',
      brand: 'SUB',
      defaultUnit: 'CAN',
      stockQty: 1.5,
    },
  ]);
});

test('rejects different table headers and malformed row widths', () => {
  assert.throws(
    () => parseStockPeriodCsv('Product Name,Stock Qty\nItem,1'),
    /does not match the Stock Period sample/,
  );
  assert.throws(
    () => parseStockPeriodCsv([...preamble, header, 'Branch,Location,Only three'].join('\n')),
    /expected 11 columns, found 3/,
  );
});

test('matches expected stock by normalized product and store names, rejects ambiguous names', () => {
  const records = [
    { store: 'BIRMAS SUDIRMAN', productName: 'Example Product', stockQty: 8 },
    { store: 'BIRMAS KUNINGAN', productName: 'Example Product', stockQty: 3 },
  ];
  assert.equal(
    findStockPeriodExpectedQty(records, 'Birmas Sudirman', ['Example Product']),
    8,
  );
  assert.equal(
    findStockPeriodExpectedQty(records, 'Birmas Kwitang', ['Example Product']),
    null,
  );
  assert.equal(
    findStockPeriodExpectedQty(
      [...records, { store: 'SUDIRMAN', productName: 'Example Product', stockQty: 4 }],
      'Sudirman',
      ['Example Product'],
    ),
    null,
  );
});

test('returns the matched CSV row metadata only for a unique store/product match', () => {
  const row = {
    store: 'BIRMAS SUDIRMAN',
    productName: 'Example Product',
    category: 'BEER',
    brand: 'EXAMPLE',
    defaultUnit: 'CAN',
    stockQty: 8,
  };
  assert.deepEqual(
    findStockPeriodProductRow([row], 'Sudirman', ['Example Product']),
    row,
  );
  assert.equal(
    findStockPeriodProductRow([row, { ...row, stockQty: 9 }], 'Sudirman', ['Example Product']),
    null,
  );
});

test('stores uploader, timestamp, filename, and the original CSV for download', () => {
  const database = new DatabaseSync(':memory:');
  try {
    const csvContent = `${header}\nBRMS,SUDIRMAN,Example Product,P-1,BEER,BRAND,CAN,Active,0.00,4.00,100.00`;
    const saved = saveStockPeriodCsv(
      database,
      {
        filename: 'stock-period.csv',
        uploadedBy: 'Test User',
        recordCount: 1,
        generatedAt: '2026-10-15T14:02:42',
        stockDate: '2026-10-15',
        stores: ['BIRMAS SUDIRMAN'],
        records: [{ store: 'SUDIRMAN', productName: 'Example Product', stockQty: 4 }],
        csvContent,
      },
      { uploadedAt: '2026-10-15T08:00:00.000Z' },
    );

    assert.deepEqual(listStockPeriodCsvUploads(database).map((row) => ({ ...row })), [saved]);
    assert.deepEqual({ ...getStockPeriodCsvDownload(database, saved.id) }, {
      id: saved.id,
      filename: 'stock-period.csv',
      uploadedAt: '2026-10-15T08:00:00.000Z',
      csvContent,
    });
    assert.deepEqual(getLatestStockPeriodCsvUpload(database), {
      ...saved,
      records: [{ store: 'SUDIRMAN', productName: 'Example Product', stockQty: 4 }],
    });
    assert.equal(deleteStockPeriodCsvUpload(database, saved.id), true);
    assert.deepEqual(listStockPeriodCsvUploads(database), []);
    assert.equal(getLatestStockPeriodCsvUpload(database), null);
  } finally {
    database.close();
  }
});
