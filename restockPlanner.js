const DAYS = 30;
const DAY_MS = 86400000;
const keyName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const pair = (store, product) => JSON.stringify([store, product]);

export function canAccessRestock(user) {
  return user?.role === 'superadmin' || user?.userId === 'user-bertha';
}

export function getRestockPlanner(stockDb, salesDb, matchStore, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())) {
  const end = addDays(today, -1);
  const start = addDays(end, -(DAYS - 1));
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
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
  `).all(start, today);
  const branches = new Map();
  const storeDays = new Map();
  const salesByKey = new Map();
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
    else if (!history) reason = 'No exact sales match in the last 30 days';
    else if (!latest || latest < addDays(end, -2)) reason = 'Sales data is stale';
    else if (eligible.length < 7) reason = 'Fewer than 7 usable sales days';
    else if (stock.stock == null || !Number.isFinite(Number(stock.stock))) reason = 'Stock unavailable';
    else if (!stock.lastSynced || stock.lastSynced.slice(0, 10) < addDays(today, -2)) reason = 'Stock data is stale';
    const avg = reason ? null : eligible.reduce((sum, date) => sum + (history.get(date)?.qty || 0), 0) / eligible.length;
    const validAvg = avg !== null && avg > 0 ? avg : null;
    if (!reason && validAvg === null) reason = 'No positive demand in usable days';
    const daysLeft = validAvg === null ? null : Math.max(0, Number(stock.stock)) / validAvg;
    const status = daysLeft === null ? 'Unknown' : daysLeft <= 1 ? 'Critical' : daysLeft <= 3 ? 'Soon' : daysLeft > 60 ? 'Overstock' : 'OK';
    const orderQty = validAvg === null ? null : Math.max(0, Math.ceil(validAvg * 8 - Number(stock.stock)));
    const orderBy = daysLeft === null ? null : addDays(today, Math.max(0, Math.floor(daysLeft - 1)));
    const zeroDays = [...observed.values()].filter((qty) => qty != null && Number(qty) <= 0).length;
    return {
      ...stock, avg: validAvg, daysLeft, status, orderQty, orderBy, reason,
      coverageDays: coverage.size, usableDays: eligible.length, latestSale: latest,
      snapshotDays: [...observed.values()].filter((qty) => qty != null).length, zeroDays,
      revenue: history ? [...history.values()].reduce((sum, value) => sum + value.revenue, 0) : 0,
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
  const rank = { Critical: 0, Soon: 1, OK: 2, Overstock: 3, Unknown: 4 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || a.product.localeCompare(b.product));
  return { start, end, today, rows };
}
