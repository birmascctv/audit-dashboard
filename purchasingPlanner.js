import { ensurePurchasingSchema, isExcludedPurchasingCategory, calculateHolidayWindow } from './purchasingStore.js';

const DAY_MS = 86400000;
const pair = (a, b) => JSON.stringify([a, b]);
const cleanName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
const supplierArea = (storeId) => ['birmas-kuningan', 'birmas-kwitang', 'birmas-sudirman'].includes(storeId) ? 'jakarta' : null;
const supplierProductKey = (name, variant) => cleanName(name) ? pair(cleanName(name), cleanName(variant)) : '';
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const dayOfWeek = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
const daysBetween = (start, end) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS);
const isValidDate = (date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
const normCategory = (value) => cleanName(value).replace(/-/g, ' ');
const excludedCategories = new Set(['INTANGIBLE ASSET', 'ELECTRONIC', 'LAIN LAIN', 'LIGHTER', 'PERLENGKAPAN OUTLET', 'RENOVATION', 'SUPPLIES']);

export const DEFAULT_PURCHASING_SETTINGS = Object.freeze({
  historyWeeks: 8, fastMovingThreshold: 14, defaultLeadDays: 1, overstockDays: 60,
});

export function validatePurchasingSettings(input) {
  const settings = { ...DEFAULT_PURCHASING_SETTINGS, ...(input || {}) };
  for (const [key, min, max] of [
    ['historyWeeks', 1, 52], ['fastMovingThreshold', 0, 100000], ['defaultLeadDays', 1, 365], ['overstockDays', 1, 365],
  ]) {
    if (!Number.isFinite(settings[key]) || !Number.isInteger(settings[key]) || settings[key] < min || settings[key] > max) {
      throw new Error(`${key} must be a whole number between ${min} and ${max}.`);
    }
  }
  return settings;
}

function getSettings(db) {
  ensurePurchasingSchema(db);
  const saved = Object.fromEntries(db.prepare('SELECT key,value FROM purchasing_settings').all().map(({ key, value }) => [key, value]));
  const settings = { ...DEFAULT_PURCHASING_SETTINGS };
  for (const key of Object.keys(settings)) if (saved[key] !== undefined) settings[key] = Number(saved[key]);
  return validatePurchasingSettings(settings);
}

export function savePurchasingSettings(db, input) {
  ensurePurchasingSchema(db);
  const settings = validatePurchasingSettings(input);
  const save = db.prepare('INSERT INTO purchasing_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const [key, value] of Object.entries(settings)) save.run(key, String(value));
  return settings;
}

function areaSupplierDefaults(db) {
  const defaults = new Map(db.prepare('SELECT area,product_key,supplier_name FROM purchasing_area_supplier_defaults').all()
    .map((row) => [pair(row.area, row.product_key), row.supplier_name]));
  const existing = db.prepare(`SELECT ps.store_id, ps.selected_supplier, p.product_title, p.varian
    FROM purchasing_product_settings ps JOIN products p ON p.id=ps.product_id
    LEFT JOIN purchasing_supplier_settings ss ON ss.store_id=ps.store_id AND ss.product_id=ps.product_id
      AND ss.supplier_name=ps.selected_supplier
    WHERE ps.selected_supplier IS NOT NULL AND TRIM(ps.selected_supplier)<>''
    ORDER BY ss.updated_at IS NULL, ss.updated_at, ps.store_id, ps.product_id`).all();
  for (const row of existing) {
    const area = supplierArea(row.store_id);
    const productKey = supplierProductKey(row.product_title, row.varian);
    if (area && productKey && !defaults.has(pair(area, productKey))) {
      defaults.set(pair(area, productKey), row.selected_supplier);
    }
  }
  return defaults;
}

export function savePurchasingProductSettings(db, { storeId, productId, minStock, minStock10, leadDays, movement, supplier }) {
  ensurePurchasingSchema(db);
  if (typeof storeId !== 'string' || typeof productId !== 'string' || !storeId || !productId ||
      (minStock !== null && minStock !== undefined && (!Number.isFinite(minStock) || minStock < 0 || minStock > 1000000000)) ||
      (minStock10 !== null && minStock10 !== undefined && (!Number.isFinite(minStock10) || minStock10 < 0 || minStock10 > 1000000000)) ||
      leadDays != null ||
      (movement !== null && movement !== undefined && !['Fast Moving', 'Slow Moving'].includes(movement)) ||
      (supplier !== null && supplier !== undefined && (typeof supplier !== 'string' || supplier.length > 200))) {
    throw new Error('Provide valid product purchasing settings.');
  }
  if (!db.prepare('SELECT 1 FROM store_stocks WHERE store_id=? AND product_id=?').get(storeId, productId)) throw new Error('Product and outlet not found.');
  const area = supplierArea(storeId);
  if (area && typeof supplier === 'string' && supplier.trim()) {
    const product = db.prepare('SELECT product_title,varian FROM products WHERE id=?').get(productId);
    const productKey = supplierProductKey(product?.product_title, product?.varian);
    if (productKey) {
      const defaultSupplier = areaSupplierDefaults(db).get(pair(area, productKey)) || supplier.trim();
      db.prepare('INSERT OR IGNORE INTO purchasing_area_supplier_defaults(area,product_key,supplier_name) VALUES(?,?,?)')
        .run(area, productKey, defaultSupplier);
    }
  }
  const current = db.prepare('SELECT * FROM purchasing_product_settings WHERE store_id=? AND product_id=?').get(storeId, productId) || {};
  const next = {
    minStock: minStock === undefined ? current.min_stock ?? null : minStock,
    minStock10: minStock10 === undefined ? current.min_stock_10 ?? null : minStock10,
    leadDays: current.lead_days ?? null,
    movement: movement === undefined ? current.movement_override ?? null : movement,
    supplier: supplier === undefined ? current.selected_supplier ?? null : supplier,
  };
  if (Object.values(next).every((value) => value == null || value === '')) {
    db.prepare('DELETE FROM purchasing_product_settings WHERE store_id=? AND product_id=?').run(storeId, productId);
  } else {
    db.prepare(`INSERT INTO purchasing_product_settings (store_id,product_id,min_stock,min_stock_10,lead_days,movement_override,selected_supplier)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(store_id,product_id) DO UPDATE SET min_stock=excluded.min_stock,min_stock_10=excluded.min_stock_10,
      lead_days=excluded.lead_days,movement_override=excluded.movement_override,selected_supplier=excluded.selected_supplier`)
      .run(storeId, productId, next.minStock, next.minStock10, next.leadDays, next.movement, next.supplier);
  }
}

export function saveSupplierSettings(db, input) {
  ensurePurchasingSchema(db);
  const { storeId, productId, supplierName } = input || {};
  const leadDays = input?.leadDays == null || input.leadDays === '' ? null : Number(input.leadDays);
  const moq = input?.moq == null || input.moq === '' ? null : Number(input.moq);
  const conversionQty = input?.conversionQty == null || input.conversionQty === '' ? 1 : Number(input.conversionQty);
  const purchasingUnit = String(input?.purchasingUnit || '').trim();
  const baseUnit = String(input?.baseUnit || '').trim();
  if (typeof storeId !== 'string' || typeof productId !== 'string' || typeof supplierName !== 'string' ||
      !storeId || !productId || !supplierName.trim() || supplierName.length > 200 ||
      (leadDays != null && (!Number.isInteger(leadDays) || leadDays < 1 || leadDays > 365)) ||
      (moq != null && (!Number.isFinite(moq) || moq < 0 || moq > 1000000000)) ||
      !Number.isFinite(conversionQty) || conversionQty <= 0 || conversionQty > 1000000) {
    throw new Error('Enter a valid supplier, lead time, MOQ and unit conversion.');
  }
  if (!db.prepare('SELECT 1 FROM store_stocks WHERE store_id=? AND product_id=?').get(storeId, productId)) throw new Error('Product and outlet not found.');
  db.prepare(`INSERT INTO purchasing_supplier_settings(store_id,product_id,supplier_name,lead_days,moq,purchasing_unit,conversion_qty,base_unit,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(store_id,product_id,supplier_name) DO UPDATE SET
    lead_days=excluded.lead_days,moq=excluded.moq,purchasing_unit=excluded.purchasing_unit,
    conversion_qty=excluded.conversion_qty,base_unit=excluded.base_unit,updated_at=excluded.updated_at`)
    .run(storeId, productId, supplierName.trim(), leadDays, moq, purchasingUnit || null, conversionQty, baseUnit || null, new Date().toISOString());
}

export function savePurchasingHoliday(db, input) {
  ensurePurchasingSchema(db);
  const { id, name, startDate, endDate = startDate, windowStart, windowEnd } = input || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120 ||
      !isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) throw new Error('Enter a holiday name and valid date range.');
  const window = windowStart && windowEnd ? { start: windowStart, end: windowEnd } : calculateHolidayWindow(startDate, endDate);
  if (!isValidDate(window.start) || !isValidDate(window.end) || window.start > startDate || window.end < endDate) {
    throw new Error('The sales calculation window must include the holiday date range.');
  }
  const now = new Date().toISOString();
  if (id == null) {
    return db.prepare(`INSERT INTO purchasing_holidays(name,start_date,end_date,window_start,window_end,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?)`).run(name.trim(), startDate, endDate, window.start, window.end, now, now).lastInsertRowid;
  }
  if (!Number.isInteger(Number(id)) || !db.prepare('SELECT 1 FROM purchasing_holidays WHERE id=?').get(Number(id))) throw new Error('Holiday not found.');
  db.prepare(`UPDATE purchasing_holidays SET name=?,start_date=?,end_date=?,window_start=?,window_end=?,updated_at=? WHERE id=?`)
    .run(name.trim(), startDate, endDate, window.start, window.end, now, Number(id));
  return Number(id);
}

export function deletePurchasingHoliday(db, id) {
  ensurePurchasingSchema(db);
  if (!Number.isInteger(Number(id))) throw new Error('Invalid holiday ID.');
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM purchasing_holiday_adjustments WHERE holiday_id=?').run(Number(id));
    const deleted = db.prepare('DELETE FROM purchasing_holidays WHERE id=?').run(Number(id)).changes > 0;
    db.exec('COMMIT');
    return deleted;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function saveHolidayAdjustment(db, input) {
  ensurePurchasingSchema(db);
  const { holidayId, storeId, adjustmentPct, combinedGroup = '' } = input || {};
  if (!Number.isInteger(Number(holidayId)) || typeof storeId !== 'string' || !storeId ||
      !Number.isFinite(adjustmentPct) || adjustmentPct < -100 || adjustmentPct > 500 ||
      typeof combinedGroup !== 'string' || combinedGroup.length > 120 ||
      !db.prepare('SELECT 1 FROM purchasing_holidays WHERE id=?').get(Number(holidayId)) ||
      !db.prepare('SELECT 1 FROM stores WHERE id=?').get(storeId)) throw new Error('Enter a valid outlet holiday adjustment.');
  const holiday = db.prepare('SELECT * FROM purchasing_holidays WHERE id=?').get(Number(holidayId));
  if (adjustmentPct !== 0) {
    const overlaps = db.prepare(`SELECT h.id,a.combined_group FROM purchasing_holidays h JOIN purchasing_holiday_adjustments a ON a.holiday_id=h.id
      WHERE a.store_id=? AND h.id<>? AND h.start_date<=? AND h.end_date>=? AND a.adjustment_pct<>0`).all(storeId, holidayId, holiday.end_date, holiday.start_date);
    if (overlaps.some((item) => !combinedGroup.trim() || !item.combined_group || item.combined_group !== combinedGroup.trim())) {
      throw new Error('This outlet has overlapping holiday adjustments. Set the same explicit combined group for every overlapping occasion before applying both.');
    }
  }
  db.prepare(`INSERT INTO purchasing_holiday_adjustments(holiday_id,store_id,adjustment_pct,combined_group) VALUES(?,?,?,?)
    ON CONFLICT(holiday_id,store_id) DO UPDATE SET adjustment_pct=excluded.adjustment_pct,combined_group=excluded.combined_group`)
    .run(Number(holidayId), storeId, adjustmentPct, combinedGroup.trim());
}

function salesClassification(total) {
  if (total < 10000000) return 'Super Low';
  if (total < 50000000) return 'Low';
  if (total < 70000000) return 'Medium to Low';
  if (total < 90000000) return 'Medium';
  if (total <= 110000000) return 'Medium to High';
  return 'High';
}

function threeMonthsBefore(date) {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 4, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function getPurchasingPlanner(stockDb, salesDb, matchStore, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()), options = {}) {
  ensurePurchasingSchema(stockDb);
  const settings = getSettings(stockDb);
  const stocks = stockDb.prepare(`SELECT ss.store_id storeId,ss.product_id productId,ss.stock_qty stock,
    ss.last_synced lastSynced,s.name store,
    p.sku,p.product_title productName,p.varian productVariant,p.category,p.default_unit defaultUnit
    FROM store_stocks ss JOIN stores s ON s.id=ss.store_id JOIN products p ON p.id=ss.product_id
    WHERE UPPER(TRIM(COALESCE(NULLIF(p.product_title,''),p.varian,''))) NOT LIKE '%(DRAFT)'`).all();
  const holidays = stockDb.prepare('SELECT * FROM purchasing_holidays ORDER BY start_date,name').all();
  const holidayAdjustments = new Map(stockDb.prepare('SELECT * FROM purchasing_holiday_adjustments').all()
    .map((row) => [pair(row.store_id, row.holiday_id), row]));
  const storeIds = [...new Set(stocks.map((row) => row.storeId))];
  const snapshots = stockDb.prepare('SELECT store_id storeId,product_id productId,business_date date,stock_qty stock FROM stock_snapshots WHERE business_date<=? ORDER BY business_date DESC').all(today);
  const mondayRows = snapshots.filter((row) => dayOfWeek(row.date) === 1);
  const reviewDate = mondayRows[0]?.date || null;
  const mondayStocks = new Map(mondayRows.filter((row) => row.date === reviewDate).map((row) => [pair(row.storeId, row.productId), row.stock]));
  const snapshotByKey = new Map();
  for (const snapshot of snapshots) {
    const key = pair(snapshot.storeId, snapshot.productId);
    if (!snapshotByKey.has(key)) snapshotByKey.set(key, new Map());
    snapshotByKey.get(key).set(snapshot.date, snapshot.stock);
  }
  const reviewIsStale = !reviewDate || daysBetween(reviewDate, today) >= 7;
  const historyStart = options.historyStart || (reviewDate ? addDays(reviewDate, -settings.historyWeeks * 7) : addDays(today, -settings.historyWeeks * 7));
  const historyEnd = options.historyEnd || (reviewDate ? addDays(reviewDate, -1) : addDays(today, -1));
  if ((options.historyStart || options.historyEnd) && (!options.historyStart || !options.historyEnd ||
      !isValidDate(historyStart) || !isValidDate(historyEnd) || historyStart > historyEnd || historyEnd > today ||
      daysBetween(historyStart, historyEnd) >= 730)) {
    throw new Error('Choose a valid sales history range of up to 730 days, ending no later than today.');
  }
  const historyDays = daysBetween(historyStart, historyEnd) + 1;
  const recentSalesStart = threeMonthsBefore(today);
  const selectedHoliday = holidays.find((item) => item.id === Number(options.holidayReferenceId));
  const referenceHoliday = selectedHoliday && holidays.filter((item) => item.name === selectedHoliday.name && item.end_date < today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
  const allSalesStart = '2024-01-01';
  const saleRows = salesDb.prepare(`SELECT branch,menu,substr(sales_date_in,1,10) date,SUM(qty) qty,
    SUM(total_after_bill_discount) revenue FROM sales_transactions
    WHERE sales_date_in>=? AND sales_date_in<? AND menu<>'' GROUP BY branch,menu,substr(sales_date_in,1,10)`)
    .all(allSalesStart, addDays(today, 1));
  const productsByAlias = new Map(), storeSales = new Map(), productSales = new Map(), coverage = new Map();
  const ambiguousSales = new Map();
  const ambiguousReferenceKeys = new Set();
  const stockByKey = new Map(stocks.map((row) => [pair(row.storeId, row.productId), row]));
  for (const row of stocks) {
    if (isExcludedPurchasingCategory(row.category)) continue;
    for (const alias of new Set([row.productName, row.productVariant, row.sku].filter(Boolean).map(cleanName))) {
      const key = pair(row.storeId, alias);
      if (!productsByAlias.has(key)) productsByAlias.set(key, new Set());
      productsByAlias.get(key).add(row.productId);
    }
  }
  for (const sale of saleRows) {
    const storeId = matchStore(sale.branch);
    if (!storeId) continue;
    if (storeId === 'birmas-nomadic' && !storeIds.includes(storeId)) storeIds.push(storeId);
    const saleKey = pair(storeId, sale.date);
    if (!storeSales.has(saleKey)) storeSales.set(saleKey, { revenue: 0, branchNames: new Set() });
    const total = storeSales.get(saleKey);
    total.revenue += Number(sale.revenue) || 0;
    total.branchNames.add(sale.branch);
    if (!coverage.has(storeId)) coverage.set(storeId, new Set());
    coverage.get(storeId).add(sale.date);
    const aliasKey = pair(storeId, cleanName(sale.menu));
    const matches = productsByAlias.get(aliasKey);
    if (matches?.size === 1) {
      const productId = [...matches][0];
      const key = pair(storeId, productId);
      if (!productSales.has(key)) productSales.set(key, new Map());
      const prior = productSales.get(key).get(sale.date) || { qty: 0, revenue: 0 };
      productSales.get(key).set(sale.date, { qty: prior.qty + Number(sale.qty), revenue: prior.revenue + Number(sale.revenue) });
    } else if (matches?.size > 1) {
      if (sale.date >= historyStart && sale.date <= historyEnd && !ambiguousSales.has(aliasKey)) {
        ambiguousSales.set(aliasKey, {
          storeId, store: stockByKey.get(pair(storeId, [...matches][0]))?.store,
          salesName: sale.menu, productIds: [...matches],
        });
      }
      if (referenceHoliday && sale.date >= referenceHoliday.window_start && sale.date <= referenceHoliday.window_end) {
        for (const productId of matches) ambiguousReferenceKeys.add(pair(storeId, productId));
      }
    }
  }
  const ambiguousProductKeys = new Set();
  const ambiguousMatches = [...ambiguousSales.values()].map(({ productIds, ...match }) => ({
    ...match,
    products: productIds.map((productId) => {
      ambiguousProductKeys.add(pair(match.storeId, productId));
      const stock = stockByKey.get(pair(match.storeId, productId));
      return { productId, name: stock.productName, variant: stock.productVariant, sku: stock.sku };
    }),
  })).sort((a, b) => a.store.localeCompare(b.store) || a.salesName.localeCompare(b.salesName));
  const productSettings = new Map(stockDb.prepare('SELECT * FROM purchasing_product_settings').all()
    .map((row) => [pair(row.store_id, row.product_id), row]));
  const areaDefaults = areaSupplierDefaults(stockDb);
  const holidayWindows = holidays.map((event) => ({ start: event.window_start, end: event.window_end }));
  const validHolidays = holidays.filter((event) => event.end_date < today);
  const holidayAnalysis = [];
  const dailyStoreRevenue = new Map([...storeSales].map(([key, value]) => [key, value.revenue]));
  const normalDays = (storeId, date) => {
    const result = [];
    for (let weeks = 1; weeks <= settings.historyWeeks; weeks++) {
      const candidate = addDays(date, -weeks * 7);
      if (!holidayWindows.some((window) => candidate >= window.start && candidate <= window.end) && coverage.get(storeId)?.has(candidate)) result.push(candidate);
    }
    return result;
  };
  for (const storeId of storeIds) {
    for (const holiday of validHolidays) {
      const days = Array.from({ length: daysBetween(holiday.window_start, holiday.window_end) + 1 }, (_, index) => addDays(holiday.window_start, index));
      const actual = days.reduce((sum, date) => sum + (dailyStoreRevenue.get(pair(storeId, date)) || 0), 0);
      const actualCoverage = days.filter((date) => coverage.get(storeId)?.has(date)).length;
      const references = days.map((date) => normalDays(storeId, date));
      const baseline = days.reduce((sum, date, index) => {
        const refs = references[index];
        return sum + (refs.length ? refs.reduce((acc, ref) => acc + (dailyStoreRevenue.get(pair(storeId, ref)) || 0), 0) / refs.length : 0);
      }, 0);
      const baselineComplete = references.every((refs) => refs.length > 0);
      const salesComplete = actualCoverage === days.length;
      holidayAnalysis.push({
        id: `holiday-${holiday.id}-${storeId}`, holidayId: holiday.id, name: holiday.name, storeId,
        startDate: holiday.start_date, endDate: holiday.end_date, windowStart: holiday.window_start, windowEnd: holiday.window_end,
        totalSales: salesComplete ? actual : null, normalBaseline: baselineComplete ? baseline : null,
        actualCoverage, actualDays: days.length,
        differencePct: salesComplete && baselineComplete && baseline ? (actual - baseline) / baseline * 100 : null,
        classification: salesComplete ? salesClassification(actual) : 'Insufficient data', combined: false,
      });
    }
  }
  const merged = [];
  for (const holiday of validHolidays.slice().sort((a, b) => a.window_start.localeCompare(b.window_start))) {
    const last = merged.at(-1);
    if (last && holiday.window_start <= last.windowEnd) {
      last.windowEnd = holiday.window_end > last.windowEnd ? holiday.window_end : last.windowEnd;
      last.names.add(holiday.name);
      last.ids.push(holiday.id);
    } else merged.push({ windowStart: holiday.window_start, windowEnd: holiday.window_end, names: new Set([holiday.name]), ids: [holiday.id] });
  }
  for (const storeId of storeIds) for (const group of merged.filter((item) => item.ids.length > 1)) {
    const dates = Array.from({ length: daysBetween(group.windowStart, group.windowEnd) + 1 }, (_, i) => addDays(group.windowStart, i));
    const actual = dates.reduce((sum, date) => sum + (dailyStoreRevenue.get(pair(storeId, date)) || 0), 0);
    const actualCoverage = dates.filter((date) => coverage.get(storeId)?.has(date)).length;
    const references = dates.map((date) => normalDays(storeId, date));
    const baseline = dates.reduce((sum, date, index) => {
      const refs = references[index];
      return sum + (refs.length ? refs.reduce((acc, ref) => acc + (dailyStoreRevenue.get(pair(storeId, ref)) || 0), 0) / refs.length : 0);
    }, 0);
    const salesComplete = actualCoverage === dates.length;
    const baselineComplete = references.every((refs) => refs.length > 0);
    holidayAnalysis.push({
      id: `combined-${storeId}-${group.windowStart}`, name: `Combined: ${[...group.names].join(' + ')}`,
      storeId, startDate: group.windowStart, endDate: group.windowEnd, windowStart: group.windowStart, windowEnd: group.windowEnd,
      totalSales: salesComplete ? actual : null, normalBaseline: baselineComplete ? baseline : null,
      actualCoverage, actualDays: dates.length,
      differencePct: salesComplete && baselineComplete && baseline ? (actual - baseline) / baseline * 100 : null,
      classification: salesComplete ? salesClassification(actual) : 'Insufficient data', combined: true,
    });
  }
  const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase().replace(/-/g, ' ');
  const historyOptions = new Map();
  for (const record of stockDb.prepare(`SELECT product_name name,supplier_name supplier,purchasing_unit unit,conversion_qty conversion,
      base_unit baseUnit,COUNT(*) uses,MAX(purchase_date) lastDate FROM purchasing_history_records
      GROUP BY product_name,supplier_name,purchasing_unit,conversion_qty,base_unit ORDER BY lastDate DESC`).all()) {
    const key = normalizeName(record.name);
    if (!historyOptions.has(key)) historyOptions.set(key, { suppliers: new Map(), units: new Map() });
    const entry = historyOptions.get(key);
    if (record.supplier && !entry.suppliers.has(record.supplier)) entry.suppliers.set(record.supplier, { supplierName: record.supplier, lastDate: record.lastDate });
    const unitKey = `${record.unit}|${record.conversion}|${record.baseUnit}`;
    if (record.unit && !entry.units.has(unitKey)) entry.units.set(unitKey, { purchasingUnit: record.unit, conversionQty: record.conversion, baseUnit: record.baseUnit, lastDate: record.lastDate });
  }
  const rows = stocks.map((stock) => {
    const key = pair(stock.storeId, stock.productId);
    const orderHistory = historyOptions.get(normalizeName(stock.productName || stock.productVariant));
    const preferences = productSettings.get(key) || {};
    const history = productSales.get(key) || new Map();
    const outletCoverage = coverage.get(stock.storeId) || new Set();
    const matchingSales = history.size > 0;
    const eligible = Array.from({ length: historyDays }, (_, index) => addDays(historyStart, index))
      .filter((date) => outletCoverage.has(date) &&
        !holidayWindows.some((window) => date >= window.start && date <= window.end) &&
        !(snapshotByKey.get(key)?.has(date) && snapshotByKey.get(key).get(date) != null && Number(snapshotByKey.get(key).get(date)) <= 0));
    const syncedAt = new Date(stock.lastSynced || '');
    const syncedDate = Number.isNaN(syncedAt.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(syncedAt);
    const reason = isExcludedPurchasingCategory(stock.category) ? 'Excluded category' :
      !reviewDate || reviewIsStale ? 'No recent Monday stock snapshot' :
        mondayStocks.get(key) == null ? 'Product missing from Monday stock snapshot' :
          syncedDate < reviewDate ? 'Stock not synced since the Monday review' :
          ambiguousProductKeys.has(key) ? 'Sales name matches multiple stock products; recommendation unavailable' :
            !matchingSales ? 'No exact product match in sales history' :
              eligible.length === 0 ? 'No usable sales days in history window' : '';
    const avgDailyRaw = !reason ? eligible.reduce((sum, date) => sum + (history.get(date)?.qty || 0), 0) / eligible.length : null;
    const weekdayAverages = Array.from({ length: 7 }, (_, day) => {
      const dates = eligible.filter((date) => dayOfWeek(date) === day);
      return dates.length ? dates.reduce((sum, date) => sum + (history.get(date)?.qty || 0), 0) / dates.length : null;
    });
    const avgWeeklyRaw = avgDailyRaw == null ? null : avgDailyRaw * 7;
    const referenceDates = referenceHoliday
      ? Array.from({ length: daysBetween(referenceHoliday.window_start, referenceHoliday.window_end) + 1 }, (_, index) => addDays(referenceHoliday.window_start, index))
      : [];
    const referenceComplete = referenceDates.length && referenceDates.every((date) => outletCoverage.has(date));
    const holidayReference = referenceHoliday ? {
      startDate: referenceHoliday.start_date, windowStart: referenceHoliday.window_start, windowEnd: referenceHoliday.window_end,
      qty: referenceComplete && matchingSales && !ambiguousReferenceKeys.has(key)
        ? referenceDates.reduce((sum, date) => sum + (history.get(date)?.qty || 0), 0) : null,
      revenue: referenceComplete && matchingSales && !ambiguousReferenceKeys.has(key)
        ? referenceDates.reduce((sum, date) => sum + (history.get(date)?.revenue || 0), 0) : null,
    } : null;
    const suppliers = stockDb.prepare('SELECT * FROM purchasing_supplier_settings WHERE store_id=? AND product_id=?')
      .all(stock.storeId, stock.productId).map((saved) => ({
        supplierName: saved.supplier_name, leadDays: saved.lead_days, moq: saved.moq, purchasingUnit: saved.purchasing_unit,
        conversionQty: saved.conversion_qty, baseUnit: saved.base_unit, configured: true,
      }));
    const defaultSupplier = areaDefaults.get(pair(supplierArea(stock.storeId), supplierProductKey(stock.productName, stock.productVariant)));
    const selectedSupplierName = preferences.selected_supplier || defaultSupplier || '';
    let supplier = suppliers.find((item) => item.supplierName === selectedSupplierName) || null;
    if (!supplier && selectedSupplierName && !preferences.selected_supplier) {
      supplier = { supplierName: selectedSupplierName, leadDays: null, moq: null, purchasingUnit: null, conversionQty: 1, baseUnit: null, configured: false };
      suppliers.push(supplier);
    }
    const leadDays = supplier?.leadDays ?? settings.defaultLeadDays;
    const conversionQty = supplier?.conversionQty || 1;
    const purchaseUnit = supplier?.purchasingUnit || stock.default_unit || 'Piece';
    const baseUnit = supplier?.baseUnit || stock.defaultUnit || 'Piece';
    const holidayEvents = holidays.filter((holiday) => holiday.end_date >= (reviewDate || today) &&
      holidayAdjustments.has(pair(stock.storeId, holiday.id)))
      .map((holiday) => {
        const adjustment = holidayAdjustments.get(pair(stock.storeId, holiday.id));
        return { ...holiday, adjustmentPct: Number(adjustment.adjustment_pct), combinedGroup: adjustment.combined_group };
      });
    const predict = (date) => {
      if (avgDailyRaw == null) return { qty: null, normalQty: null, adjustmentPct: 0, conflict: false };
      const active = holidayEvents.filter((holiday) => date >= holiday.start_date && date <= holiday.end_date);
      const groups = new Set(active.map((holiday) => holiday.combinedGroup).filter(Boolean));
      const conflict = active.length > 1 && (groups.size !== 1 || active.some((holiday) => !holiday.combinedGroup));
      if (conflict) return { qty: null, normalQty: weekdayAverages[dayOfWeek(date)] ?? avgDailyRaw, adjustmentPct: null, conflict: true };
      const adjustment = active.reduce((sum, holiday) => sum + holiday.adjustmentPct, 0);
      const normalQty = weekdayAverages[dayOfWeek(date)] ?? avgDailyRaw;
      return { qty: normalQty * Math.max(0, 1 + adjustment / 100), normalQty, adjustmentPct: adjustment, conflict: false };
    };
    const forecastDays = Math.max(90, leadDays + 11);
    const forecast = Array.from({ length: forecastDays }, (_, index) => {
      const date = addDays(reviewDate || today, index);
      const demand = predict(date);
      return { date, qty: demand.qty, normalQty: demand.normalQty, adjustmentPct: demand.adjustmentPct, conflict: demand.conflict };
    });
    const holidayConflict = forecast.some((day) => day.conflict);
    const stockAtReview = mondayStocks.get(key) == null ? null : Number(mondayStocks.get(key));
    const expected = (coverageDays) => {
      if (avgDailyRaw == null || stockAtReview == null) return null;
      const horizon = leadDays + 1 + coverageDays;
      const demand = forecast.slice(0, horizon);
      if (demand.length < horizon || demand.some((day) => day.qty == null || day.conflict)) return null;
      const orderUpTo = demand.reduce((sum, day) => sum + day.qty, 0);
      const configuredMinimum = coverageDays === 10 ? preferences.min_stock_10 : preferences.min_stock;
      const minimumStock = configuredMinimum == null ? 0 : Number(configuredMinimum);
      const targetStock = Math.max(orderUpTo, minimumStock);
      const rawBaseQty = Math.max(0, targetStock - stockAtReview);
      const rawPurchaseQty = rawBaseQty / conversionQty;
      const MOQ = supplier?.moq == null ? 0 : Number(supplier.moq);
      const purchaseQty = rawPurchaseQty > 0 ? Math.ceil(Math.max(MOQ, rawPurchaseQty)) : 0;
      return {
        orderUpTo: targetStock, forecastOrderUpTo: orderUpTo, minimumStock,
        rawBaseQty, calculatedQty: purchaseQty, orderQty: purchaseQty,
        equivalentQty: purchaseQty * conversionQty, minimumQty: MOQ,
        demandDuringLead: demand.slice(0, leadDays + 1).reduce((sum, day) => sum + day.qty, 0),
        coverageDemand: demand.slice(leadDays + 1).reduce((sum, day) => sum + day.qty, 0),
        manual: false,
      };
    };
    let remaining = stockAtReview;
    let daysLeft = avgDailyRaw == null || remaining == null ? null : remaining <= 0 ? 0 : null;
    if (daysLeft == null && remaining != null && avgDailyRaw != null) {
      for (let index = 0; index < 730; index++) {
        const demand = predict(addDays(reviewDate, index));
        if (demand.qty == null) { daysLeft = null; break; }
        if (demand.qty > 0 && remaining <= demand.qty) { daysLeft = index + remaining / demand.qty; break; }
        remaining -= demand.qty;
      }
    }
    const expectedStockoutDate = daysLeft == null ? null : addDays(reviewDate || today, Math.floor(daysLeft));
    const recommendedReorderDate = expectedStockoutDate == null ? null : addDays(expectedStockoutDate, -leadDays - 1);
    if (daysLeft != null) daysLeft = Math.ceil(daysLeft);
    const dailySales = avgDailyRaw == null ? null : Math.ceil(avgDailyRaw);
    const weeklySales = avgWeeklyRaw == null ? null : Math.ceil(avgWeeklyRaw);
    const movement = preferences.movement_override || (avgWeeklyRaw == null ? 'Unknown' : avgWeeklyRaw >= settings.fastMovingThreshold ? 'Fast Moving' : 'Slow Moving');
    const recommendation7 = expected(7), recommendation10 = expected(10);
    const maximumProjectedStock7 = recommendation7
      ? Math.max(0, stockAtReview - recommendation7.demandDuringLead) + recommendation7.orderQty * conversionQty : null;
    const maximumProjectedStock10 = recommendation10
      ? Math.max(0, stockAtReview - recommendation10.demandDuringLead) + recommendation10.orderQty * conversionQty : null;
    const effectiveReason = reason || (!recommendation7
      ? holidayConflict ? 'Resolve overlapping holiday adjustments before calculating an order.' : 'The 7-day order recommendation could not be calculated.'
      : '');
    const status = effectiveReason ? 'Unknown' :
      daysLeft != null && daysLeft < 7 ? 'Critical Stock' :
        daysLeft != null && daysLeft <= 14 ? 'Low Stock' :
          daysLeft != null && daysLeft > settings.overstockDays ? 'Overstock' :
            (recommendation7?.calculatedQty > 0 ? 'Reorder Required' : 'Sufficient Stock');
    const daily = history;
    return {
      ...stock, product: stock.productName || stock.productVariant || stock.productId, store: stock.store,
      stock: stock.stock, currentStock: stock.stock,
      reviewStock: stockAtReview, reviewDate, stockReferenceDate: reviewDate,
      avgDaily: dailySales, avgWeekly: weeklySales, avgDailyRaw, avgWeeklyRaw,
      hasRecentSales: [...history].some(([date, sale]) => date >= recentSalesStart && date <= today && sale.qty > 0),
      daysLeft, expectedStockoutDate, recommendedReorderDate,
      movement, movementManual: !!preferences.movement_override, lowData: eligible.length < 28 || weekdayAverages.some((value) => value == null),
      usableDays: eligible.length, historyWeeks: settings.historyWeeks,
      minStock: preferences.min_stock ?? null, minStock10: preferences.min_stock_10 ?? null, leadDays,
      belowMinStock: preferences.min_stock != null && stockAtReview != null && stockAtReview < Number(preferences.min_stock),
      movementOverride: preferences.movement_override || null, selectedSupplier: selectedSupplierName,
      supplier, suppliers, purchasingUnit: purchaseUnit,
      historySuppliers: orderHistory ? [...orderHistory.suppliers.values()] : [],
      historyUnits: orderHistory ? [...orderHistory.units.values()] : [], baseUnit, conversionQty,
      suggestedMinStock7: recommendation7 ? Math.ceil(recommendation7.forecastOrderUpTo) : null,
      suggestedMinStock10: recommendation10 ? Math.ceil(recommendation10.forecastOrderUpTo) : null,
      holidayEvents, holidayConflict, forecast, recommendation7, recommendation10,
      maximumProjectedStock7, maximumProjectedStock10,
      holidayReference,
      orderUpTo: recommendation7?.orderUpTo ?? null, calculatedOrderQty: recommendation7?.calculatedQty ?? null,
      orderQty: recommendation7?.orderQty ?? null, status, reason: effectiveReason,
      history: Array.from({ length: historyDays }, (_, i) => {
        const date = addDays(historyStart, i);
        const stockHistory = snapshotByKey.get(key);
        const observedStock = stockHistory?.get(date);
        return { date, qty: outletCoverage.has(date) ? (daily.get(date)?.qty || 0) : null,
          stock: observedStock == null ? null : Number(observedStock),
          zeroObserved: observedStock != null && Number(observedStock) <= 0 };
      }),
    };
  });
  const allStores = stockDb.prepare('SELECT id,name FROM stores ORDER BY name').all();
  const upcoming = holidays.filter((holiday) => holiday.end_date >= today).map((holiday) => ({
    ...holiday, adjustments: allStores.map((store) => {
      const adjustment = holidayAdjustments.get(pair(store.id, holiday.id));
      return { storeId: store.id, store: store.name, adjustmentPct: adjustment?.adjustment_pct ?? null, combinedGroup: adjustment?.combined_group || '' };
    }),
  }));
  const imports = stockDb.prepare(`SELECT id,filename,file_size fileSize,uploaded_at uploadedAt,uploaded_by uploadedBy,
    row_count rowCount,duplicate_count duplicateCount,archive_byte_length IS NOT NULL archived
    FROM purchasing_history_imports ORDER BY uploaded_at DESC`).all();
  const hasSnapshotLog = stockDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stock_snapshot_sync_log'").get();
  const snapshotSync = hasSnapshotLog ? stockDb.prepare(`SELECT business_date businessDate,captured_at capturedAt,status,row_count rowCount,error
    FROM stock_snapshot_sync_log ORDER BY id DESC LIMIT 1`).get() || null : null;
  const weeklyReview = stockDb.prepare(`SELECT review_date reviewDate,stock_date stockDate,status,row_count rowCount,
    reorder_count reorderCount,error,updated_at updatedAt FROM purchasing_weekly_review_runs ORDER BY review_date DESC LIMIT 1`).get() || null;
  const statusRank = { 'Critical Stock': 0, 'Low Stock': 1, 'Reorder Required': 2, 'Sufficient Stock': 3, Overstock: 4, Unknown: 5 };
  rows.sort((a, b) => statusRank[a.status] - statusRank[b.status] ||
    (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || a.product.localeCompare(b.product));
  return {
    today, reviewDate, reviewIsStale, historyStart, historyEnd, settings, rows, holidays,
    historyOptions: {
      suppliers: stockDb.prepare("SELECT DISTINCT TRIM(supplier_name) v FROM purchasing_history_records WHERE TRIM(supplier_name)<>'' ORDER BY v COLLATE NOCASE").all().map((r) => r.v),
      purchasingUnits: stockDb.prepare("SELECT DISTINCT TRIM(purchasing_unit) v FROM purchasing_history_records WHERE TRIM(purchasing_unit)<>'' ORDER BY v COLLATE NOCASE").all().map((r) => r.v),
      baseUnits: stockDb.prepare("SELECT DISTINCT TRIM(base_unit) v FROM purchasing_history_records WHERE TRIM(base_unit)<>'' ORDER BY v COLLATE NOCASE").all().map((r) => r.v),
    },
    holidayAnalysis, upcomingHolidays: upcoming, imports, snapshotSync, weeklyReview, ambiguousMatches, stores: allStores,
    excludedCategories: [...excludedCategories],
  };
}
