const EXPECTED_HEADER = [
  'Branch',
  'Location',
  'Product Name',
  'Product Code',
  'Category',
  'Sub Category',
  'Default Unit',
  'Sub Category',
  'Booked Qty',
  'Stock Qty',
  'Stock Value',
];

function normalizeStockDate(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const local = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (local) return `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  throw new Error('CSV metadata is invalid: Stock Date in cell B5 must be a valid date.');
}

function normalizeGeneratedAt(value) {
  const text = String(value || '').trim();
  const local = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (local) {
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = local;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${second}`;
  }
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) {
    throw new Error('CSV metadata is invalid: Generated date/time in cell B4 is not valid.');
  }
  return new Date(timestamp).toISOString();
}

function getMetadataValue(rows, label, cell, rowNumber) {
  const row = rows[rowNumber - 1] || [];
  if (String(row[0] || '').trim().toLowerCase() !== label.toLowerCase()) {
    throw new Error(`CSV template is invalid: expected "${label}" in cell A${rowNumber}.`);
  }
  const value = String(row[cell - 1] || '').trim();
  if (!value) throw new Error(`CSV metadata is missing from cell ${String.fromCharCode(64 + cell)}${rowNumber}.`);
  return value;
}

export function normalizeStockPeriodName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^birmas\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function findStockPeriodExpectedQty(records, storeName, productNames) {
  const match = findStockPeriodProductRow(records, storeName, productNames);
  const quantity = Number(match?.stockQty);
  return Number.isFinite(quantity) ? quantity : null;
}

export function findStockPeriodProductRow(records, storeName, productNames) {
  const normalizedStore = normalizeStockPeriodName(storeName);
  if (!normalizedStore) return null;
  const names = new Set(productNames.map(normalizeStockPeriodName).filter(Boolean));
  const matches = records.filter((row) =>
    normalizeStockPeriodName(row.store) === normalizedStore
    && names.has(normalizeStockPeriodName(row.productName))
  );
  if (matches.length !== 1) return null;
  return matches[0];
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (quoted) {
        quoted = false;
      } else if (cell === '') {
        quoted = true;
      } else {
        throw new Error('CSV contains a quote in an invalid position.');
      }
    } else if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (cell !== '' || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function parseStockQuantity(value, rowNumber) {
  const text = String(value ?? '').trim().replace(/\s/g, '');
  if (!text) throw new Error(`Stock Qty is empty on CSV row ${rowNumber}.`);

  let normalized = text;
  if (normalized.includes(',') && normalized.includes('.')) {
    if (normalized.lastIndexOf('.') > normalized.lastIndexOf(',')) {
      normalized = normalized.replace(/,/g, '');
    } else {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    }
  } else if (normalized.includes(',')) {
    const parts = normalized.split(',');
    if (parts.length > 2 || parts.at(-1).length === 3) {
      normalized = normalized.replace(/,/g, '');
    } else {
      normalized = normalized.replace(',', '.');
    }
  } else if (normalized.includes('.')) {
    const parts = normalized.split('.');
    if (parts.length > 2 || parts.at(-1).length === 3) {
      normalized = normalized.replace(/\./g, '');
    }
  }

  const quantity = Number(normalized);
  if (!Number.isFinite(quantity)) {
    throw new Error(`Stock Qty is not a valid number on CSV row ${rowNumber}.`);
  }
  return quantity;
}

export function parseStockPeriodCsvDetails(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('The uploaded CSV file is empty.');
  }

  let rows;
  try {
    rows = parseCsvRows(text.replace(/^\uFEFF/, ''));
  } catch (err) {
    throw new Error(`CSV template is invalid: ${err.message}`);
  }

  const headerIndex = rows.findIndex((row) =>
    row.length === EXPECTED_HEADER.length
    && row.every((value, index) => value.trim() === EXPECTED_HEADER[index])
  );
  if (headerIndex === -1) {
    throw new Error(
      'CSV template does not match the Stock Period sample. Expected the exact 11-column header: '
      + EXPECTED_HEADER.join(', ')
    );
  }

  if (headerIndex !== 8) {
    throw new Error('CSV template is invalid: the Stock Period table header must be on row 9.');
  }
  const generatedAt = normalizeGeneratedAt(getMetadataValue(rows, 'Generated', 2, 4));
  const stockDate = normalizeStockDate(getMetadataValue(rows, 'Stock Date', 2, 5));
  const storesValue = getMetadataValue(rows, 'Location', 2, 6);
  const stores = [...new Set(storesValue.split(',').map((store) => store.trim()).filter(Boolean))];
  if (!stores.length) throw new Error('CSV metadata is invalid: no stores were listed in cell B6.');

  const records = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some((value) => value.trim())) continue;
    const csvRowNumber = index + 1;
    if (row.length !== EXPECTED_HEADER.length) {
      throw new Error(
        `CSV template is invalid on row ${csvRowNumber}: expected 11 columns, found ${row.length}.`
      );
    }

    const productName = row[2].trim();
    if (!productName) {
      throw new Error(`Product Name is empty on CSV row ${csvRowNumber}.`);
    }
    records.push({
      store: row[1].trim(),
      productName,
      category: row[4].trim(),
      brand: row[5].trim(),
      defaultUnit: row[6].trim(),
      stockQty: parseStockQuantity(row[9], csvRowNumber),
    });
  }

  if (!records.length) throw new Error('The CSV contains no stock data rows.');
  return { generatedAt, stockDate, stores, records };
}

export function parseStockPeriodCsv(text) {
  return parseStockPeriodCsvDetails(text).records;
}

export const STOCK_PERIOD_CSV_TEMPLATE_HEADER = [...EXPECTED_HEADER];
