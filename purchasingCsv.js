import { normalizeDateString, parseLocalizedNumber } from './src/utils/salesCsv.js';

const normalizeHeader = (value) => String(value || '').replace(/^\uFEFF/, '').toLowerCase().replace(/[\s_.-]+/g, '');
const fields = [
  ['purchase_number', 'purchasenumber'],
  ['purchase_date', 'purchasedate'],
  ['required_date', 'requireddate'],
  ['branch', 'branch'],
  ['supplier_name', 'suppliername'],
  ['cost_center', 'costcenter'],
  ['project', 'project'],
  ['product_code', 'productcode'],
  ['category', 'category'],
  ['sub_category', 'subcategory'],
  ['product_name', 'productname'],
  ['unit', 'unit'],
  ['po_qty', 'poqty'],
  ['pricelist_price', 'pricelistprice'],
  ['price', 'price'],
  ['discount', 'discount'],
  ['vat', 'vat'],
  ['total', 'total'],
  ['notes', 'notes'],
  ['additional_info', 'additionalinfo'],
  ['receipt_qty', 'receiptqty'],
  ['status', 'status'],
];
const required = ['purchase_number', 'purchase_date', 'branch', 'supplier_name', 'category', 'product_name', 'unit', 'po_qty'];
const excludedCategories = new Set([
  'INTANGIBLE ASSET', 'ELECTRONIC', 'LAIN LAIN', 'LIGHTER',
  'PERLENGKAPAN OUTLET', 'RENOVATION', 'SUPPLIES',
]);

function splitRecords(text, delimiter) {
  const records = [];
  let record = [], cell = '', quoted = false, line = 1, recordLine = 1;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      record.push(cell.trim()); cell = '';
    } else if ((char === '\r' || char === '\n') && !quoted) {
      record.push(cell.trim());
      records.push({ line: recordLine, values: record });
      if (char === '\r' && text[i + 1] === '\n') i++;
      line++; recordLine = line; record = []; cell = '';
    } else {
      if (char === '\n') line++;
      cell += char;
    }
  }
  record.push(cell.trim());
  if (record.some((value) => value !== '') || record.length > 1) records.push({ line: recordLine, values: record });
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  return records;
}

function delimiterAtHeaderLine(text) {
  const lines = text.split(/\r\n|\n|\r/);
  const header = lines[11] || '';
  const counts = [',', ';', '\t', '|'].map((delimiter) => {
    let count = 0, quoted = false;
    for (let i = 0; i < header.length; i++) {
      if (header[i] === '"') {
        if (quoted && header[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (header[i] === delimiter && !quoted) count++;
    }
    return { delimiter, count };
  });
  return counts.sort((a, b) => b.count - a.count)[0].delimiter;
}

function parseUnit(value) {
  const description = String(value || '').trim();
  const match = description.match(/^(.+?)\s*@\s*([\d.,]+)\s+(.+)$/);
  if (!match) return { purchasing_unit: description, conversion_qty: 1, base_unit: description };
  const conversion = parseLocalizedNumber(match[2]);
  if (!conversion || conversion <= 0) throw new Error(`Invalid unit conversion "${description}".`);
  return { purchasing_unit: match[1].trim(), conversion_qty: conversion, base_unit: match[3].trim() };
}

const normalizeDate = (value, label, line) => {
  const normalized = normalizeDateString(value).trim().slice(0, 10);
  const timestamp = Date.parse(`${normalized}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== normalized) {
    throw new Error(`Invalid ${label} on CSV row ${line}.`);
  }
  return normalized;
};

export function parsePurchasingCsv(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('CSV file is empty or unreadable.');
  const text = input.replace(/^\uFEFF/, '');
  const records = splitRecords(text, delimiterAtHeaderLine(text));
  const header = records.find((row) => row.line === 12);
  if (!header) throw new Error('The purchase-history header must be on row 12.');
  const normalizedHeaders = header.values.map(normalizeHeader);
  const indexes = Object.fromEntries(fields.map(([key, name]) => [key, normalizedHeaders.indexOf(name)]));
  const missing = required.filter((key) => indexes[key] === -1);
  if (missing.length) throw new Error(`Required columns missing from row 12: ${missing.map((key) => fields.find(([field]) => field === key)[1]).join(', ')}.`);
  const rows = [];
  for (const record of records) {
    if (record.line <= 12 || record.values.every((value) => !value)) continue;
    const value = (key) => indexes[key] < 0 ? '' : (record.values[indexes[key]] || '').trim();
    const object = { source_row: record.line };
    for (const [key] of fields) object[key] = value(key);
    for (const key of required) {
      if (!object[key]) throw new Error(`Required field ${key.replaceAll('_', ' ')} is blank on CSV row ${record.line}.`);
    }
    object.purchase_date = normalizeDate(object.purchase_date, 'Purchase Date', record.line);
    object.required_date = object.required_date ? normalizeDate(object.required_date, 'Required Date', record.line) : '';
    object.po_qty = parseLocalizedNumber(object.po_qty);
    if (object.po_qty === null || object.po_qty <= 0) throw new Error(`PO Qty must be a positive number on CSV row ${record.line}.`);
    for (const key of ['pricelist_price', 'price', 'discount', 'vat', 'total', 'receipt_qty']) {
      object[key] = parseLocalizedNumber(object[key]);
    }
    Object.assign(object, parseUnit(object.unit));
    object.equivalent_qty = object.po_qty * object.conversion_qty;
    object.excluded = excludedCategories.has(object.category.toUpperCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim());
    rows.push(object);
  }
  if (!rows.length) throw new Error('No purchase-history records found below the row 12 header.');
  return rows;
}
