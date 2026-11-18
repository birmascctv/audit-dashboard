const statuses = ['all', 'needs-order', 'Critical Stock', 'Low Stock', 'Reorder Required', 'Overstock', 'Sufficient Stock', 'Unknown'];

export function isReorderStockEligible(row) {
  if (row.currentStock == null || !Number.isFinite(Number(row.currentStock))) return false;
  const stock = Number(row.currentStock);
  return stock > 0 || (stock === 0 && row.hasRecentSales === true);
}

export function normalizePurchasingPreferences(value, today) {
  const input = value && typeof value === 'object' ? value : {};
  const choose = (key, options, fallback) => options.includes(input[key]) ? input[key] : fallback;
  const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const start = input.historyStart;
  const end = input.historyEnd;
  const validRange = date(start) && date(end) && start <= end && end <= today &&
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 < 730;
  return {
    store: typeof input.store === 'string' && input.store.length <= 200 ? input.store : 'all',
    status: choose('status', statuses, 'all'),
    movement: choose('movement', ['all', 'Fast Moving', 'Slow Moving', 'Unknown'], 'all'),
    search: typeof input.search === 'string' ? input.search.slice(0, 200) : '',
    coverage: choose('coverage', ['7', '10', 'both'], '7'),
    sort: choose('sort', ['urgent', 'product'], 'urgent'),
    range: validRange ? { historyStart: start, historyEnd: end } : null,
  };
}

export function summarizeOutletSync(rows, now = Date.now()) {
  let latest = null;
  let oldest = null;
  let missing = 0;
  for (const row of rows) {
    const time = row.lastSynced ? Date.parse(row.lastSynced) : NaN;
    if (!Number.isFinite(time) || time > now) { missing++; continue; }
    latest = latest == null ? time : Math.max(latest, time);
    oldest = oldest == null ? time : Math.min(oldest, time);
  }
  const age = (time) => {
    if (time == null) return 'Unavailable';
    const minutes = Math.floor((now - time) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours} hr ago`;
    return `${Math.floor(hours / 24)} days ago`;
  };
  return { latest, oldest, missing, latestAge: age(latest), oldestAge: age(oldest) };
}
