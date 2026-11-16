export function aggregateVisitPurpose(rows, selectedStores) {
  const grouped = new Map();
  for (const item of rows || []) {
    if (selectedStores !== null && !selectedStores.includes(item.branch)) continue;
    const name = item.name || 'Unspecified';
    grouped.set(name, (grouped.get(name) || 0) + Number(item.sales || 0));
  }
  return [...grouped].map(([name, sales]) => ({ name, sales })).sort((a, b) => b.sales - a.sales);
}
