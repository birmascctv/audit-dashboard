function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[\s_.-]+/g, '');
}

function countDelimiterOutsideQuotes(line, delimiter) {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (line[i] === delimiter && !quoted) {
      count++;
    }
  }
  return count;
}

function parseCsvRecords(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim());
  const delimiters = [',', ';', '\t', '|'];
  const delimiter = delimiters
    .map((candidate) => ({
      candidate,
      count: lines.slice(0, 10).reduce((sum, line) => sum + countDelimiterOutsideQuotes(line, candidate), 0),
    }))
    .sort((a, b) => b.count - a.count)[0]?.candidate || ',';

  const records = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((value) => value !== '')) records.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value !== '')) records.push(row);
  return records;
}

export function parseLocalizedNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let text = String(value).trim().replace(/^(?:Rp|IDR)\.?\s*/i, '').replace(/\s/g, '');
  const negative = /^\(.*\)$/.test(text);
  text = text.replace(/[()]/g, '').replace(/[^\d.,+-]/g, '');
  if (!text) return null;

  if (text.includes(',') && text.includes('.')) {
    if (text.lastIndexOf('.') > text.lastIndexOf(',')) {
      text = text.replace(/,/g, '');
    } else {
      text = text.replace(/\./g, '').replace(',', '.');
    }
  } else if (text.includes(',')) {
    const parts = text.split(',');
    if (parts.length > 2 || parts[parts.length - 1].length === 3) text = text.replace(/,/g, '');
    else text = text.replace(',', '.');
  } else if (text.includes('.')) {
    const parts = text.split('.');
    if (parts.length > 2 || parts[parts.length - 1].length === 3) text = text.replace(/\./g, '');
  }

  const number = Number(text);
  if (!Number.isFinite(number)) return null;
  return negative ? -number : number;
}

function normalizeDateString(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(.*)$/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}${match[4] ? ` ${match[4].trim()}` : ''}`.trim();
  }
  return text.replace(/^(\d{4}-\d{2}-\d{2})T/, '$1 ');
}

function findColumn(headers, candidates) {
  for (const candidate of candidates) {
    const index = headers.indexOf(candidate);
    if (index !== -1) return index;
  }
  return -1;
}

export function parseSalesCsv(text) {
  if (!text || typeof text !== 'string') throw new Error('File content is empty or unreadable.');
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ''));
  if (records.length < 2) throw new Error('File contains no data rows or table header.');

  const headerMatchers = {
    salesDateIn: ['salesdatein', 'datein', 'datetime', 'waktu'],
    branch: ['branch', 'cabang', 'store', 'outlet', 'lokasi', 'location'],
    visitPurpose: ['visitpurpose', 'purpose', 'ordermode', 'channel', 'tujuan', 'kunjungan'],
    payment: ['paymentmethod', 'payment', 'metodepembayaran', 'pembayaran', 'carabayar', 'tender'],
    menuCategory: ['menucategory', 'category', 'kategori'],
    menuCategoryDetail: ['menucategorydetail', 'categorydetail', 'brand', 'merk'],
    menu: ['menu', 'menuvariant', 'product', 'itemname', 'item', 'varian', 'produk', 'namamenu', 'namaproduk', 'barang', 'deskripsi'],
    qty: ['qty', 'quantity', 'jumlah', 'kuantitas', 'banyak'],
    price: ['price', 'harga', 'unitprice', 'rate', 'tarif', 'hargasatuan'],
    subtotal: ['subtotal'],
    discount: ['discount', 'diskon', 'potongan'],
    billDiscount: ['billdiscount'],
    totalAfterBillDiscount: ['totalafterbilldiscount'],
  };
  const headerRowIndex = records.findIndex((record) => {
    const normalized = record.map(normalizeHeader);
    return normalized.includes('branch') &&
      normalized.includes('salesdatein') &&
      normalized.includes('visitpurpose') &&
      normalized.includes('paymentmethod') &&
      normalized.includes('menucategory') &&
      normalized.includes('menucategorydetail') &&
      normalized.includes('menu') &&
      normalized.includes('qty') &&
      normalized.includes('price') &&
      normalized.includes('subtotal') &&
      normalized.includes('discount') &&
      normalized.includes('totalafterbilldiscount');
  });
  if (headerRowIndex === -1) {
    throw new Error('Could not find all required columns: Sales Date In, Branch, Visit Purpose, Payment Method, Menu Category, Menu Category Detail, Menu, Qty, Price, Subtotal, Discount, and Total After Bill Discount.');
  }

  const headers = records[headerRowIndex].map(normalizeHeader);
  const columns = Object.fromEntries(
    Object.entries(headerMatchers).map(([name, candidates]) => [name, findColumn(headers, candidates)])
  );
  const parsed = [];
  for (let rowIndex = headerRowIndex + 1; rowIndex < records.length; rowIndex++) {
    const row = records[rowIndex];
    const value = (name) => columns[name] === -1 ? '' : (row[columns[name]] || '');
    const salesDateIn = normalizeDateString(value('salesDateIn'));
    const branch = value('branch').trim();
    const menu = value('menu').trim();
    const qtyRaw = value('qty');
    const priceRaw = value('price');
    const totalRaw = value('totalAfterBillDiscount');
    if (!salesDateIn && !branch) continue;

    const qty = parseLocalizedNumber(qtyRaw);
    const price = parseLocalizedNumber(priceRaw);
    const totalAfterBillDiscount = parseLocalizedNumber(totalRaw);
    if (!salesDateIn || !branch || qty === null || price === null || totalAfterBillDiscount === null) {
      throw new Error(`Invalid required value on CSV row ${rowIndex + 1}. Check Sales Date In, Branch, Qty, Price, and Total After Bill Discount.`);
    }
    parsed.push({
      sales_date_in: salesDateIn,
      branch,
      visit_purpose: value('visitPurpose').trim(),
      payment_method: value('payment').trim(),
      menu_category: value('menuCategory').trim(),
      menu_category_detail: value('menuCategoryDetail').trim(),
      menu,
      qty,
      price,
      subtotal: qty * price,
      discount: (parseLocalizedNumber(value('discount')) ?? 0) + (parseLocalizedNumber(value('billDiscount')) ?? 0),
      total_after_bill_discount: totalAfterBillDiscount,
    });
  }

  if (parsed.length === 0) throw new Error('No sales transaction rows found below the CSV header.');
  return parsed;
}
