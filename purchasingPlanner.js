import { getRestockPlanner, validateRestockConfig } from './restockPlanner.js';

const dayMs = 86400000;
const addDays = (date, days) => {
  const result = new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMs);
  return Number.isFinite(result.getTime()) && result.getUTCFullYear() <= 9999 ? result.toISOString().slice(0, 10) : null;
};
const pair = (store, product) => JSON.stringify([store, product]);
const nameKey = (name) => String(name || '').trim().replace(/\s+/g, ' ').toUpperCase();

export function ensurePurchasingSettings(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS purchasing_product_settings (
    store_id TEXT NOT NULL, product_id TEXT NOT NULL, min_stock REAL, lead_days INTEGER,
    PRIMARY KEY (store_id, product_id)
  )`);
}

export function savePurchasingProductSettings(db, { storeId, productId, minStock, leadDays }) {
  if (typeof storeId !== 'string' || typeof productId !== 'string' || !storeId || !productId ||
      (minStock !== null && (typeof minStock !== 'number' || !Number.isFinite(minStock) || minStock < 0 || minStock > 1000000000)) ||
      (leadDays !== null && (!Number.isInteger(leadDays) || leadDays < 1 || leadDays > 365))) {
    throw new Error('Provide a valid product, minimum stock and lead time.');
  }
  if (!db.prepare('SELECT 1 FROM store_stocks WHERE store_id = ? AND product_id = ?').get(storeId, productId)) {
    throw new Error('Product and store not found.');
  }
  ensurePurchasingSettings(db);
  if (minStock === null && leadDays === null) {
    db.prepare('DELETE FROM purchasing_product_settings WHERE store_id = ? AND product_id = ?').run(storeId, productId);
  } else {
    db.prepare(`INSERT INTO purchasing_product_settings (store_id, product_id, min_stock, lead_days) VALUES (?, ?, ?, ?)
      ON CONFLICT(store_id, product_id) DO UPDATE SET min_stock=excluded.min_stock, lead_days=excluded.lead_days`)
      .run(storeId, productId, minStock, leadDays);
  }
}

export function getPurchasingPlanner(stockDb, salesDb, matchStore, today, config) {
  const { settings, occasions } = validateRestockConfig(config);
  const base = getRestockPlanner(stockDb, salesDb, matchStore, today, { settings: { ...settings, historyDays: 30 }, occasions });
  ensurePurchasingSettings(stockDb);
  const overrides = new Map(stockDb.prepare('SELECT * FROM purchasing_product_settings').all().map((row) => [pair(row.store_id, row.product_id), row]));
  const details = new Map(stockDb.prepare(`SELECT ss.store_id, ss.product_id, p.sku
    FROM store_stocks ss JOIN products p ON p.id=ss.product_id`).all().map((row) => [pair(row.store_id, row.product_id), row]));
  const start = addDays(today, -365);
  const end = addDays(today, -1);
  const snapshots = new Map();
  for (const row of stockDb.prepare(`SELECT store_id, product_id, business_date, stock_qty FROM stock_snapshots
    WHERE business_date BETWEEN ? AND ?`).all(start, end)) {
    const key = pair(row.store_id, row.product_id);
    if (!snapshots.has(key)) snapshots.set(key, new Map());
    snapshots.get(key).set(row.business_date, row.stock_qty);
  }
  const history = new Map(), storeDays = new Map();
  for (const row of salesDb.prepare(`SELECT branch, menu, substr(sales_date_in,1,10) date, SUM(qty) qty
    FROM sales_transactions WHERE sales_date_in >= ? AND sales_date_in < ? AND menu <> ''
    GROUP BY branch, menu, substr(sales_date_in,1,10)`).all(start, today)) {
    const store = matchStore(row.branch);
    if (!store) continue;
    if (!storeDays.has(store)) storeDays.set(store, new Set());
    storeDays.get(store).add(row.date);
    const key = pair(store, nameKey(row.menu));
    if (!history.has(key)) history.set(key, new Map());
    const days = history.get(key);
    days.set(row.date, (days.get(row.date) || 0) + Number(row.qty));
  }
  const rows = base.rows.map((row) => {
    const key = pair(row.storeId, row.productId);
    const detail = details.get(key) || {};
    const override = overrides.get(key) || {};
    const observed = snapshots.get(key) || new Map();
    const sold = history.get(pair(row.storeId, nameKey(row.product))) || new Map();
    const coverage = storeDays.get(row.storeId) || new Set();
    const usable90 = Array.from({ length: 90 }, (_, i) => addDays(today, -i - 1))
      .filter((date) => coverage.has(date) && !(observed.has(date) && observed.get(date) != null && Number(observed.get(date)) <= 0));
    const avg90 = row.reason?.startsWith('Ambiguous') || !usable90.length || !usable90.some((date) => sold.has(date))
      ? null : usable90.reduce((sum, date) => sum + (sold.get(date) || 0), 0) / usable90.length;
    const leadDays = override.lead_days ?? settings.leadDays;
    const minStock = override.min_stock ?? null;
    const avg = row.avg;
    const predict = (date) => avg == null ? null : avg * Math.max(0, 1 + occasions.filter((event) => date >= event.start && date <= event.end).reduce((sum, event) => sum + event.adjustment, 0) / 100);
    const forecast = Array.from({ length: Math.max(90, settings.reviewDays + leadDays) }, (_, i) => {
      const date = addDays(today, i);
      return { date, qty: predict(date) };
    });
    const safety = avg == null ? null : avg * settings[`safety${row.abc}`];
    const target = avg == null ? null : Math.max(minStock ?? 0, forecast.slice(0, settings.reviewDays + leadDays).reduce((sum, day) => sum + day.qty, 0) + safety);
    const orderQty = target == null ? null : Math.max(0, Math.ceil(target - Number(row.stock)));
    let remaining = Math.max(0, Number(row.stock));
    let daysLeft = avg == null ? null : remaining === 0 ? 0 : null;
    if (avg != null && daysLeft === null) {
      const boundaries = [...new Set(occasions.flatMap((event) => [event.start, addDays(event.end, 1)])
        .filter((date) => date && date > today))].sort();
      let date = today, elapsed = 0;
      for (const next of [...boundaries, null]) {
        const demand = predict(date);
        const length = next ? (Date.parse(`${next}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / dayMs : Infinity;
        if (demand > 0 && remaining <= demand * length) {
          daysLeft = elapsed + remaining / demand;
          break;
        }
        if (!next) break;
        remaining -= demand * length;
        elapsed += length;
        date = next;
      }
    }
    if (daysLeft != null && Number.isFinite(daysLeft) && daysLeft < 1000000) {
      daysLeft = Math.round(daysLeft * 1e9) / 1e9;
    }
    const dates = Array.from({ length: 365 }, (_, i) => addDays(today, -i - 1));
    const completeYear = dates.every((date) => coverage.has(date) && observed.has(date) && observed.get(date) != null);
    const averageStock = completeYear ? dates.reduce((sum, date) => sum + Number(observed.get(date)), 0) / 365 : null;
    const turnover = completeYear && averageStock > 0 && sold.size > 0 && !row.reason?.startsWith('Ambiguous')
      ? dates.reduce((sum, date) => sum + (sold.get(date) || 0), 0) / averageStock : null;
    return {
      ...row, sku: detail.sku || '', avg30: avg, avg90, usable90: usable90.length,
      minStock, leadDays, leadOverride: override.lead_days ?? null, forecast, safetyQty: safety, target, orderQty, daysLeft,
      stockValue: Number(row.stock) === 0 && row.stock != null ? 0 : null,
      belowMin: row.stock != null && minStock != null ? Number(row.stock) < minStock : null,
      stockoutDate: daysLeft == null ? null : addDays(today, Math.floor(daysLeft)),
      orderBy: daysLeft == null ? null : addDays(today, Math.floor(daysLeft - leadDays)),
      status: daysLeft == null ? 'Unknown' : daysLeft < 7 ? 'Critical' : daysLeft <= 14 ? 'Soon' : 'OK',
      turnover, movementClass: turnover == null ? null : turnover > 12 ? 'Fast' : turnover >= 4 ? 'Medium' : 'Slow',
    };
  });
  rows.sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || a.product.localeCompare(b.product));
  return { ...base, settings, rows };
}
