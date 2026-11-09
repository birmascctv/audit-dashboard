const DAY_MS = 86400000;
const keyName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const pair = (store, product) => JSON.stringify([store, product]);
const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

export const DEFAULT_RESTOCK_SETTINGS = Object.freeze({
  reviewDays: 7, leadDays: 1, historyDays: 28,
  safetyA: 3, safetyB: 2, safetyC: 1, overstockDays: 60,
});

export function canAccessRestock(user) {
  return user?.userId === 'user-bertha';
}

export function validateRestockConfig(input) {
  if (!input || typeof input !== 'object' || !input.settings || !Array.isArray(input.occasions)) throw new Error('Settings and occasions are required.');
  const limits = { reviewDays: [1, 30], leadDays: [1, 14], historyDays: [14, 90], safetyA: [0, 30], safetyB: [0, 30], safetyC: [0, 30], overstockDays: [4, 365] };
  const settings = {};
  for (const [key, [min, max]] of Object.entries(limits)) {
    const value = input.settings[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be a whole number between ${min} and ${max}.`);
    settings[key] = value;
  }
  if (input.occasions.length > 100) throw new Error('At most 100 occasions are allowed.');
  const validDate = (date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  const occasions = input.occasions.map((event) => {
    const name = typeof event?.name === 'string' ? event.name.trim() : '';
    if (!name || name.length > 100 || !validDate(event.start) || !validDate(event.end) || event.end < event.start) throw new Error('Each occasion needs a name and a valid start and end date.');
    if (typeof event.adjustment !== 'number' || !Number.isFinite(event.adjustment) || event.adjustment < -100 || event.adjustment > 500) throw new Error('Occasion adjustment must be between -100% and 500%.');
    return { name, start: event.start, end: event.end, adjustment: event.adjustment };
  });
  return { settings, occasions };
}

export function getRestockPlanner(stockDb, salesDb, matchStore, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()), config = { settings: DEFAULT_RESTOCK_SETTINGS, occasions: [] }) {
  const { settings, occasions } = validateRestockConfig(config);
  const end = addDays(today, -1);
  const start = addDays(today, -settings.historyDays);
  const annualStart = addDays(today, -365);
  const dates = Array.from({ length: settings.historyDays }, (_, i) => addDays(start, i));
  const stocks = stockDb.prepare(`
    SELECT ss.store_id storeId, ss.product_id productId, ss.observed_stock_qty stock, ss.last_synced lastSynced,
      s.name store, COALESCE(NULLIF(p.product_title,''), NULLIF(p.varian,''), ss.product_id) product
    FROM store_stocks ss JOIN stores s ON s.id=ss.store_id JOIN products p ON p.id=ss.product_id
    WHERE UPPER(TRIM(COALESCE(NULLIF(p.product_title,''), p.varian, ''))) NOT LIKE '%(DRAFT)'
  `).all();
  const snapshots = stockDb.prepare(`
    SELECT store_id storeId, product_id productId, business_date date, stock_qty stock
    FROM stock_snapshots WHERE business_date BETWEEN ? AND ?
  `).all(start, end);
  const sales = salesDb.prepare(`
    SELECT branch, menu, substr(sales_date_in,1,10) date, SUM(qty) qty, SUM(total_after_bill_discount) revenue
    FROM sales_transactions WHERE sales_date_in >= ? AND sales_date_in < ? AND menu <> ''
    GROUP BY branch, menu, substr(sales_date_in,1,10)
  `).all(annualStart, today);
  const branches = new Map(), storeDays = new Map(), salesByKey = new Map();
  for (const sale of sales) {
    const storeId = matchStore(sale.branch);
    if (!storeId) continue;
    if (!branches.has(storeId)) branches.set(storeId, new Set());
    branches.get(storeId).add(sale.branch);
    if (!storeDays.has(storeId)) storeDays.set(storeId, new Set());
    storeDays.get(storeId).add(sale.date);
    const k = pair(storeId, keyName(sale.menu));
    if (!salesByKey.has(k)) salesByKey.set(k, new Map());
    const daily = salesByKey.get(k);
    const old = daily.get(sale.date) || { qty: 0, revenue: 0 };
    daily.set(sale.date, { qty: old.qty + Number(sale.qty), revenue: old.revenue + Number(sale.revenue) });
  }
  const snapshotByKey = new Map();
  for (const snapshot of snapshots) {
    const k = pair(snapshot.storeId, snapshot.productId);
    if (!snapshotByKey.has(k)) snapshotByKey.set(k, new Map());
    snapshotByKey.get(k).set(snapshot.date, snapshot.stock);
  }
  const names = new Map();
  for (const row of stocks) {
    const k = pair(row.storeId, keyName(row.product));
    names.set(k, (names.get(k) || 0) + 1);
  }
  const rows = stocks.map((stock) => {
    const k = pair(stock.storeId, keyName(stock.product));
    const history = salesByKey.get(k);
    const observed = snapshotByKey.get(pair(stock.storeId, stock.productId)) || new Map();
    const coverage = storeDays.get(stock.storeId) || new Set();
    const latest = [...coverage].sort().at(-1) || null;
    const eligible = dates.filter((date) => coverage.has(date) && !(observed.has(date) && observed.get(date) != null && Number(observed.get(date)) <= 0));
    let reason = '';
    if (names.get(k) !== 1 || (branches.get(stock.storeId)?.size || 0) !== 1) reason = 'Ambiguous product or store match';
    else if (!history || !dates.some((date) => history.has(date))) reason = `No exact sales match in the last ${settings.historyDays} days`;
    else if (!latest || latest < addDays(end, -2)) reason = 'Sales data is stale';
    else if (!eligible.length) reason = 'No usable sales days';
    else if (stock.stock == null || !Number.isFinite(Number(stock.stock))) reason = 'Stock unavailable';
    else if (!stock.lastSynced || stock.lastSynced.slice(0, 10) < addDays(today, -2)) reason = 'Stock data is stale';
    const avg = reason ? null : eligible.reduce((sum, date) => sum + (history.get(date)?.qty || 0), 0) / eligible.length;
    const validAvg = avg !== null && avg > 0 ? avg : null;
    if (!reason && validAvg === null) reason = 'No positive demand in usable days';
    const weekdayAverages = Array.from({ length: 7 }, (_, day) => {
      const days = eligible.filter((date) => weekday(date) === day);
      return days.length ? Math.max(0, days.reduce((sum, date) => sum + (history?.get(date)?.qty || 0), 0) / days.length) : validAvg;
    });
    const revenue = history ? [...history.values()].reduce((sum, value) => sum + value.revenue, 0) : 0;
    return {
      ...stock, avg: validAvg, reason, weekdayAverages, revenue,
      coverageDays: dates.filter((date) => coverage.has(date)).length, usableDays: eligible.length, latestSale: latest,
      lowData: eligible.length < 14 || weekdayAverages.some((_, day) => !eligible.some((date) => weekday(date) === day)),
      snapshotDays: [...observed.values()].filter((qty) => qty != null).length,
      zeroDays: [...observed.values()].filter((qty) => qty != null && Number(qty) <= 0).length,
      history: dates.map((date) => ({ date, qty: coverage.has(date) && history ? (history.get(date)?.qty || 0) : null, zeroObserved: observed.has(date) && observed.get(date) != null && Number(observed.get(date)) <= 0 })),
    };
  });
  const ranked = rows.filter((row) => row.revenue > 0 && names.get(pair(row.storeId, keyName(row.product))) === 1 && branches.get(row.storeId)?.size === 1).sort((a, b) => b.revenue - a.revenue);
  const total = ranked.reduce((sum, row) => sum + row.revenue, 0);
  let cumulative = 0;
  for (const row of ranked) {
    const fraction = cumulative / total;
    row.abc = fraction < 0.8 ? 'A' : fraction < 0.95 ? 'B' : 'C';
    cumulative += row.revenue;
  }
  for (const row of rows) {
    if (row.avg != null && !row.abc) { row.reason = 'No positive annual revenue for ABC safety stock'; row.avg = null; }
    const predict = (date) => {
      if (row.avg == null) return null;
      const adjustment = occasions.filter((event) => date >= event.start && date <= event.end).reduce((sum, event) => sum + event.adjustment, 0);
      return row.weekdayAverages[weekday(date)] * Math.max(0, 1 + adjustment / 100);
    };
    row.forecast = Array.from({ length: Math.max(14, settings.reviewDays + settings.leadDays) }, (_, i) => {
      const date = addDays(today, i);
      return { date, qty: predict(date) };
    });
    const targetDemand = row.avg == null ? null : row.forecast.slice(0, settings.reviewDays + settings.leadDays).reduce((sum, day) => sum + day.qty, 0);
    row.safetyQty = row.avg == null ? null : row.avg * settings[`safety${row.abc}`];
    row.orderQty = targetDemand == null ? null : Math.max(0, Math.ceil(targetDemand + row.safetyQty - Number(row.stock)));
    let remaining = Math.max(0, Number(row.stock));
    let daysLeft = row.avg == null ? null : (remaining === 0 ? 0 : null);
    if (row.avg != null && daysLeft === null) {
      for (let i = 0; i < 366; i++) {
        const demand = predict(addDays(today, i));
        if (demand > 0 && remaining <= demand) { daysLeft = i + remaining / demand; break; }
        remaining -= demand;
      }
      if (daysLeft === null) daysLeft = remaining / row.avg + 366;
    }
    row.daysLeft = daysLeft;
    row.status = daysLeft === null ? 'Unknown' : daysLeft <= 1 ? 'Critical' : daysLeft <= 3 ? 'Soon' : daysLeft > settings.overstockDays ? 'Overstock' : 'OK';
    row.orderBy = daysLeft === null ? null : addDays(today, Math.max(0, Math.floor(daysLeft - settings.leadDays)));
  }
  const rank = { Critical: 0, Soon: 1, OK: 2, Overstock: 3, Unknown: 4 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || a.product.localeCompare(b.product));
  return { start, end, today, annualStart, settings, occasions, rows };
}
