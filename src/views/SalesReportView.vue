<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { BarChart3, Download, FileSpreadsheet, Package, RefreshCw, Store, Trash2, TrendingUp, UploadCloud } from 'lucide-vue-next';
import UploadSalesCsvModal from '../components/UploadSalesCsvModal.vue';
import AnalyticsPieChart, { PIE_CHART_COLORS } from '../components/AnalyticsPieChart.vue';
import AnalyticsLineChart from '../components/AnalyticsLineChart.vue';
import AnalyticsBarChart from '../components/AnalyticsBarChart.vue';

const activeTab = ref('analytics');
const period = ref('all');
const jakartaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const anchorDate = ref(jakartaToday());
const customStartDate = ref('');
const customEndDate = ref('');
const selectedStores = ref(null);
const stores = ref([]);
const summary = ref({});
const files = ref([]);
const rows = ref([]);
const totalRows = ref(0);
const page = ref(1);
const pageSize = 100;
const rawSearch = ref('');
const pivotSearch = ref('');
const pivotDropdownOpen = ref(false);
const selectedPivotProduct = ref('');
const productChartStores = ref(null);
const promotionChartStores = ref(null);
const promotionChartPromos = ref(null);
const promotionSearch = ref('');
const topProductStores = ref(null);
const categoryChartStores = ref(null);
const categoryChartCategories = ref(null);
const categoryChartMetric = ref('sales');
const visitPurposeChartStores = ref(null);
const paymentBarStores = ref(null);
const paymentChartStore = ref('all');
const monthStore = ref('all');
const paymentBarPayments = ref(null);
const timeRangeStart = ref('');
const timeRangeEnd = ref('');
const timeSelectedStores = ref(null);
const timeSummary = ref({});
const timeRangeError = ref('');
const weekdayTooltip = ref(null);
const stockCompareStore = ref('');
const stockCompareDate = ref(jakartaToday());
const stockCompare = ref({ rows: [], needsSnapshots: true, collectingSince: null });
const stockCompareError = ref('');
const stockCompareLoading = ref(false);
const hourTooltip = ref(null);
const loading = ref(false);
const error = ref('');
const uploadOpen = ref(false);
const deletingFile = ref(null);
const deleting = ref(false);
let reportRequestId = 0;
let timeRequestId = 0;

const periodOptions = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'custom', label: 'Date range' },
  { id: 'all', label: 'All time' },
];
const range = computed(() => {
  if (period.value === 'all') return {};
  if (period.value === 'custom') {
    return {
      ...(customStartDate.value ? { startDate: customStartDate.value } : {}),
      ...(customEndDate.value ? { endDate: customEndDate.value } : {}),
    };
  }
  const base = new Date(`${anchorDate.value}T12:00:00`);
  const format = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  if (period.value === 'day') return { startDate: format(base), endDate: format(base) };
  if (period.value === 'week') {
    const start = new Date(base);
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { startDate: format(start), endDate: format(end) };
  }
  if (period.value === 'lastMonth') {
    const start = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    const end = new Date(base.getFullYear(), base.getMonth(), 0);
    return { startDate: format(start), endDate: format(end) };
  }
  return {
    startDate: format(new Date(base.getFullYear(), base.getMonth(), 1)),
    endDate: format(new Date(base.getFullYear(), base.getMonth() + 1, 0)),
  };
});
const chartStoreOptions = computed(() => selectedStores.value === null
  ? stores.value
  : stores.value.filter((store) => selectedStores.value.includes(store.name)));
const visitPurposeStoreOptions = computed(() => [...new Set((summary.value.byStoreVisitPurpose || []).map((item) => item.branch))].sort());
const paymentBarRows = computed(() => {
  const totals = new Map();
  for (const item of summary.value.storePayments || []) {
    if (paymentBarStores.value !== null && !paymentBarStores.value.includes(item.branch)) continue;
    if (paymentBarPayments.value !== null && !paymentBarPayments.value.includes(item.payment_method)) continue;
    totals.set(item.branch, (totals.get(item.branch) || 0) + Number(item.sales || 0));
  }
  return [...totals].map(([name, sales]) => ({ name, sales }))
    .sort((a, b) => b.sales - a.sales)
    .map((item) => ({ ...item, details: paymentBarPayments.value === null ? 'All payment methods' : paymentBarPayments.value.join(', ') }));
});
const paymentBarTotal = computed(() => paymentBarRows.value.reduce((sum, item) => sum + item.sales, 0));
const dateRangeError = computed(() => period.value === 'custom' &&
  customStartDate.value && customEndDate.value && customStartDate.value > customEndDate.value
  ? 'The start date must be on or before the end date.'
  : '');
const hourlyValues = computed(() => {
  const byHour = new Map((timeSummary.value.hourlySales || []).map((item) => [Number(item.hour), Number(item.sales)]));
  const byStore = new Map();
  for (const item of timeSummary.value.hourlyByStore || []) {
    const hour = Number(item.hour);
    if (!byStore.has(hour)) byStore.set(hour, []);
    byStore.get(hour).push({ name: item.branch, sales: Number(item.sales) || 0 });
  }
  const paymentsByHourStore = new Map();
  for (const item of timeSummary.value.hourlyByPayment || []) {
    const key = `${Number(item.hour)}|${item.branch}`;
    if (!paymentsByHourStore.has(key)) paymentsByHourStore.set(key, []);
    paymentsByHourStore.get(key).push({ name: item.payment_method, sales: Number(item.sales) || 0 });
  }
  const paymentsByHour = new Map();
  for (const item of timeSummary.value.hourlyByPayment || []) {
    const hour = Number(item.hour);
    if (!paymentsByHour.has(hour)) paymentsByHour.set(hour, new Map());
    const payments = paymentsByHour.get(hour);
    payments.set(item.payment_method, (payments.get(item.payment_method) || 0) + Number(item.sales || 0));
  }
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    sales: byHour.get(hour) || 0,
    payments: [...(paymentsByHour.get(hour) || new Map())].map(([name, sales]) => ({ name, sales }))
      .sort((a, b) => b.sales - a.sales),
    stores: (byStore.get(hour) || []).filter((store) => store.sales > 0).map((store) => ({
      ...store,
      payments: paymentsByHourStore.get(`${hour}|${store.name}`) || [],
    })),
  })).sort((a, b) => ((a.hour + 13) % 24) - ((b.hour + 13) % 24));
});
const weeklyValues = computed(() => {
  const storesByWeek = new Map();
  for (const item of timeSummary.value.weeklyByStore || []) {
    if (!storesByWeek.has(item.week_start)) storesByWeek.set(item.week_start, []);
    storesByWeek.get(item.week_start).push({ name: item.branch, sales: Number(item.sales) || 0 });
  }
  return (timeSummary.value.weeklySales || []).map((item) => ({
    key: item.week_start,
    name: `Week of ${item.week_start}`,
    month: item.month || item.week_start.slice(0, 7),
    shortName: item.week_start,
    sales: Number(item.sales) || 0,
    revenueOnly: true,
    stores: (storesByWeek.get(item.week_start) || []).filter((store) => store.sales > 0),
  }));
});
const weeklyMonthRows = computed(() => {
  const months = new Map();
  for (const week of weeklyValues.value) {
    if (!months.has(week.month)) months.set(week.month, []);
    months.get(week.month).push(week);
  }
  return [...months].map(([month, weeks]) => ({
    month: new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`)),
    weeks,
  }));
});
const weekdayValues = computed(() => {
  const revenue = new Map((timeSummary.value.weekdaySales || []).map((item) => [Number(item.weekday), Number(item.sales) || 0]));
  const products = new Map();
  for (const item of timeSummary.value.weekdayTopProducts || []) {
    if (!products.has(Number(item.weekday))) products.set(Number(item.weekday), []);
    products.get(Number(item.weekday)).push({ name: item.menu, qty: Number(item.qty) || 0, sales: Number(item.sales) || 0 });
  }
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((name, weekday) => ({
    name, weekday, sales: revenue.get(weekday) || 0, topProducts: products.get(weekday) || [],
  }));
});
const maxWeekdaySales = computed(() => Math.max(1, ...weekdayValues.value.map((item) => item.sales)));
const topProductWindows = computed(() => [
  { title: 'Last 7 days', key: 'topProductsLastWeek' },
  { title: 'This month', key: 'topProductsThisMonth' },
].map((window) => {
  const byStore = new Map();
  for (const item of summary.value[window.key] || []) {
    if (!byStore.has(item.branch)) byStore.set(item.branch, []);
    byStore.get(item.branch).push(item);
  }
  return { ...window, stores: [...byStore].map(([name, products]) => ({ name, products })) };
}));
const monthlyValues = computed(() => {
  const storesByMonth = new Map();
  for (const item of timeSummary.value.monthlyByStore || []) {
    if (!storesByMonth.has(item.month)) storesByMonth.set(item.month, []);
    storesByMonth.get(item.month).push({ name: item.branch, sales: Number(item.sales) || 0 });
  }
  const paymentsByMonthStore = new Map();
  for (const item of timeSummary.value.monthlyByPayment || []) {
    const key = `${item.month}|${item.branch}`;
    if (!paymentsByMonthStore.has(key)) paymentsByMonthStore.set(key, []);
    paymentsByMonthStore.get(key).push({ name: item.payment_method, sales: Number(item.sales) || 0 });
  }
  const paymentsByMonth = new Map();
  for (const item of timeSummary.value.monthlyByPayment || []) {
    if (!paymentsByMonth.has(item.month)) paymentsByMonth.set(item.month, new Map());
    const payments = paymentsByMonth.get(item.month);
    payments.set(item.payment_method, (payments.get(item.payment_method) || 0) + Number(item.sales || 0));
  }
  return (timeSummary.value.monthlySales || []).map((item) => ({
    key: item.month,
    name: new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(`${item.month}-01T12:00:00`)),
    sales: Number(item.sales) || 0,
    payments: [...(paymentsByMonth.get(item.month) || new Map())].map(([name, sales]) => ({ name, sales }))
      .sort((a, b) => b.sales - a.sales),
    stores: (storesByMonth.get(item.month) || []).filter((store) => store.sales > 0).map((store) => ({
      ...store,
      payments: paymentsByMonthStore.get(`${item.month}|${store.name}`) || [],
    })),
  }));
});
const pivotPaymentMethods = computed(() => [...new Set((summary.value.variantByStorePayment || []).map((item) => item.payment_method))]);
const allPivotRows = computed(() => {
  const grouped = new Map();
  for (const entry of summary.value.variantByStorePayment || []) {
    if (productChartStores.value !== null && !productChartStores.value.includes(entry.branch)) continue;
    if (!grouped.has(entry.item)) grouped.set(entry.item, { item: entry.item, total: 0, methods: {} });
    const item = grouped.get(entry.item);
    item.methods[entry.payment_method] = (item.methods[entry.payment_method] || 0) + (Number(entry.sales) || 0);
    item.total += Number(entry.sales) || 0;
  }
  return [...grouped.values()].sort((a, b) => b.total - a.total);
});
const pivotRows = computed(() => allPivotRows.value.filter((item) =>
  !pivotSearch.value || pivotSearch.value === 'ALL PRODUCT' || item.item.toLowerCase().includes(pivotSearch.value.toLowerCase())));
const pages = computed(() => Math.max(1, Math.ceil(totalRows.value / pageSize)));
const topStores = computed(() => (summary.value.byStore || []).slice(0, 3));
const brandOptions = computed(() => [...new Set((summary.value.byStoreBrand || []).map((item) => item.name))].sort());
const selectedBrandRows = computed(() => (summary.value.byStoreBrand || [])
  .filter((item) => brandChartStore.value === 'all' || item.branch === brandChartStore.value)
  .filter((item) => brandChartBrand.value === 'all' || item.name === brandChartBrand.value));
const brandLineItems = computed(() => {
  const selected = selectedBrandRows.value.reduce((brands, item) => {
    const current = brands.get(item.name) || { name: item.name, sales: 0, units: 0, details: brandChartStore.value === 'all' ? 'Selected stores' : item.branch };
    current.sales += Number(item.sales || 0);
    current.units += Number(item.units || 0);
    brands.set(item.name, current);
    return brands;
  }, new Map());
  return [...selected.values()].sort((a, b) => b.sales - a.sales);
});
const visibleBrandTable = brandLineItems;
const categoryOptions = computed(() => [...new Set((summary.value.byStoreCategory || []).map((item) => item.name))].sort());
const categoryStoreOptions = computed(() => [...new Set((summary.value.byStoreCategory || []).map((item) => item.branch))].sort());
const paymentMethodOptions = computed(() => [...new Set((summary.value.storePayments || []).map((item) => item.payment_method))].sort());
const filteredCategoryChartItems = computed(() => (summary.value.byStoreCategory || [])
  .filter((item) => categoryChartStores.value === null || categoryChartStores.value.includes(item.branch))
  .filter((item) => categoryChartCategories.value === null || categoryChartCategories.value.includes(item.name))
  .reduce((categories, item) => {
    const current = categories.get(item.name) || { name: item.name, sales: 0, units: 0, details: categoryChartStores.value === null ? 'All stores' : categoryChartStores.value.join(', ') };
    current.sales += Number(item.sales || 0);
    current.units += Number(item.units || 0);
    categories.set(item.name, current);
    return categories;
  }, new Map()));
const visibleCategoryTable = computed(() => [...filteredCategoryChartItems.value.values()]
  .map((item) => ({ ...item, name: item.name || 'Unspecified' }))
  .sort((a, b) => Number(b[categoryChartMetric.value]) - Number(a[categoryChartMetric.value])));
const visiblePromotions = computed(() => (summary.value.promotions || [])
  .filter((item) => promotionChartStores.value === null || promotionChartStores.value.includes(item.branch))
  .filter((item) => promotionChartPromos.value === null || promotionChartPromos.value.includes(item.name))
  .sort((a, b) => Number(b.sales) - Number(a.sales)));
const promotionOptions = computed(() => [...new Set((summary.value.promotions || []).map((item) => item.name))]
  .filter((name) => name.toLowerCase().includes(promotionSearch.value.trim().toLowerCase()))
  .sort((a, b) => a.localeCompare(b)));
const paymentShareCharts = computed(() => {
  const methods = new Map();
  const selectedPaymentStores = paymentBarStores.value === null ? selectedStores.value : paymentBarStores.value;
  const compareStores = selectedPaymentStores !== null && selectedPaymentStores.length > 1;
  const salesByMethod = new Map();
  const storeNames = chartStoreOptions.value.map((store) => store.name);
  for (const item of summary.value.storePayments || []) {
    if (paymentBarStores.value !== null && !paymentBarStores.value.includes(item.branch)) continue;
    if (paymentBarPayments.value !== null && !paymentBarPayments.value.includes(item.payment_method)) continue;
    if (!salesByMethod.has(item.payment_method)) salesByMethod.set(item.payment_method, new Map());
    const methodSales = salesByMethod.get(item.payment_method);
    methodSales.set(item.branch, (methodSales.get(item.branch) || 0) + Number(item.sales || 0));
  }
  if (compareStores) {
    for (const [method, storeSales] of salesByMethod) {
      methods.set(method, storeNames.map((name) => ({ name, sales: storeSales.get(name) || 0 })));
    }
  } else {
    const methodTotals = new Map();
    for (const [method, storeSales] of salesByMethod) {
      methodTotals.set(method, [...storeSales.values()].reduce((sum, sales) => sum + sales, 0));
    }
    methods.set('Payment methods', [...methodTotals].map(([name, sales]) => ({ name, sales })));
  }
  return [...methods].map(([name, items]) => ({
    name,
    items,
    total: items.reduce((sum, item) => sum + item.sales, 0),
  })).filter((chart) => chart.items.length)
    .sort((a, b) => compareStores ? a.name.localeCompare(b.name) : b.total - a.total);
});
const paymentShareAllStores = computed(() => {
  const selectedPaymentStores = paymentBarStores.value === null ? selectedStores.value : paymentBarStores.value;
  return selectedPaymentStores === null;
});
const paymentShareLegendItems = computed(() => (paymentShareCharts.value[0]?.items || [])
  .map((item, index) => ({ ...item, color: PIE_CHART_COLORS[index % PIE_CHART_COLORS.length] })));
const paymentTableRows = computed(() => {
  const byName = new Map();
  for (const row of summary.value.storePayments || []) {
    byName.set(row.payment_method, (byName.get(row.payment_method) || 0) + Number(row.sales || 0));
  }
  return [...byName].map(([name, sales]) => ({ name, sales }))
    .sort((a, b) => b.sales - a.sales);
});
const visiblePromotionChartItems = computed(() => {
  const values = new Map();
  const hasStoreFilter = promotionChartStores.value !== null;
  for (const row of visiblePromotions.value) {
    const name = hasStoreFilter ? row.name : row.branch;
    const current = values.get(name) || { name, sales: 0, units: 0, startDate: '', endDate: '', storeSales: new Map() };
    current.sales += Number(row.sales || 0);
    current.units += Number(row.units || 0);
    current.startDate = current.startDate && row.start_date
      ? (current.startDate < row.start_date ? current.startDate : row.start_date)
      : current.startDate || row.start_date || '';
    current.endDate = current.endDate && row.end_date
      ? (current.endDate > row.end_date ? current.endDate : row.end_date)
      : current.endDate || row.end_date || '';
    const store = current.storeSales.get(row.branch) || {
      units: 0,
      sales: 0,
      startDate: row.start_date,
      endDate: row.end_date,
    };
    store.units += Number(row.units || 0);
    store.sales += Number(row.sales || 0);
    store.startDate = store.startDate && row.start_date ? (store.startDate < row.start_date ? store.startDate : row.start_date) : store.startDate || row.start_date;
    store.endDate = store.endDate && row.end_date ? (store.endDate > row.end_date ? store.endDate : row.end_date) : store.endDate || row.end_date;
    current.storeSales.set(row.branch, store);
    values.set(name, current);
  }
  return [...values.values()].map((item) => ({
    ...item,
    sortDate: item.startDate,
    details: hasStoreFilter
      ? [...item.storeSales].map(([store, metrics]) => promotionChartStores.value.length > 1
        ? `${store}: ${Number(metrics.units).toLocaleString('id-ID')} units · ${formatMoney(metrics.sales)} · ${metrics.startDate} – ${metrics.endDate}`
        : `${metrics.startDate} – ${metrics.endDate}`).join('\n')
      : '',
  })).sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.name.localeCompare(b.name));
});
const paymentDonutItems = computed(() => {
  const totals = new Map();
  for (const item of summary.value.storePayments || []) {
    if (paymentChartStore.value !== 'all' && item.branch !== paymentChartStore.value) continue;
    totals.set(item.payment_method, (totals.get(item.payment_method) || 0) + Number(item.sales || 0));
  }
  return [...totals].map(([name, sales]) => ({ name, sales })).filter((item) => item.sales > 0).sort((a, b) => b.sales - a.sales);
});
const monthStoreNames = computed(() => [...new Set((timeSummary.value.monthlyByStore || []).map((item) => item.branch))].sort());
const monthStoreRows = computed(() => (timeSummary.value.monthlySales || []).map((month) => {
  const bySales = new Map((timeSummary.value.monthlyByStore || []).filter((item) => item.month === month.month)
    .map((item) => [item.branch, Number(item.sales) || 0]));
  const label = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(`${month.month}-01T12:00:00`));
  const total = monthStore.value === 'all' ? Number(month.sales) || 0 : bySales.get(monthStore.value) || 0;
  return { key: month.month, name: label, bySales, sales: total };
}));
const monthChartItems = computed(() => monthStoreRows.value.map(({ name, sales }) => ({ name, sales })));
let autoRefreshTimer = null;
const selectedPivotRow = computed(() => {
  if (selectedPivotProduct.value === '__all__') {
    return allPivotRows.value.reduce((combined, row) => {
      combined.total += row.total;
      for (const [method, sales] of Object.entries(row.methods)) {
        combined.methods[method] = (combined.methods[method] || 0) + sales;
      }
      return combined;
    }, { item: 'ALL PRODUCT', total: 0, methods: {} });
  }
  return allPivotRows.value.find((row) => row.item === selectedPivotProduct.value) || allPivotRows.value[0] || null;
});
const selectedPivotTotal = computed(() => selectedPivotRow.value?.total || 0);
const visiblePivotRows = computed(() => pivotRows.value.slice(0, 100));
const filteredTopProducts = computed(() => (summary.value.topProductsByStore || [])
  .filter((item) => topProductStores.value === null || topProductStores.value.includes(item.branch)));
const visibleTopProducts = computed(() => topProductStores.value === null
  ? summary.value.topProductsAllStores || []
  : filteredTopProducts.value);
const selectedStoreLabel = computed(() => selectedStores.value === null
  ? 'All stores'
  : selectedStores.value.length
    ? selectedStores.value.join(', ')
    : 'No stores selected');
const visitPurposeRows = computed(() => (summary.value.topVisitPurposes || [])
  .map((item) => ({ ...item, name: item.name || 'Unspecified' })));
const visitPurposeChartRows = computed(() => {
  const grouped = new Map();
  for (const item of summary.value.byStoreVisitPurpose || []) {
    if (visitPurposeChartStores.value !== null && !visitPurposeChartStores.value.includes(item.branch)) continue;
    const name = item.name || 'Unspecified';
    grouped.set(name, (grouped.get(name) || 0) + Number(item.sales || 0));
  }
  return [...grouped].map(([name, sales]) => ({ name, sales }))
    .sort((a, b) => b.sales - a.sales);
});
const productPaymentPieItems = computed(() => selectedPivotRow.value
  ? pivotPaymentMethods.value.map((method) => ({ name: method, sales: Number(selectedPivotRow.value.methods[method] || 0) })).filter((item) => item.sales > 0)
  : []);
const maxHourSales = computed(() => Math.max(1, ...hourlyValues.value.map((item) => item.sales)));
const maxWeeklySales = computed(() => Math.max(1, ...weeklyValues.value.map((item) => item.sales)));
const maxMonthlySales = computed(() => Math.max(1, ...monthlyValues.value.map((item) => item.sales)));

function formatMoney(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
function choosePivotRow(product) {
  selectedPivotProduct.value = product;
  pivotSearch.value = product;
}
function heatmapStyle(value, maximum, lightColor, darkColor) {
  const intensity = Math.min(1, Math.max(0, Number(value || 0) / Math.max(Number(maximum) || 0, 1)));
  const parseColor = (hex) => hex.match(/[a-f\d]{2}/gi).map((part) => Number.parseInt(part, 16));
  const light = parseColor(lightColor);
  const dark = parseColor(darkColor);
  const color = light.map((channel, index) => Math.round(channel + (dark[index] - channel) * intensity));
  return {
    backgroundColor: `rgb(${color.join(' ')})`,
    color: intensity >= 0.62 ? '#ffffff' : '#0f172a',
    borderColor: intensity >= 0.62 ? 'rgba(15, 23, 42, 0.18)' : 'rgba(148, 163, 184, 0.45)',
  };
}
async function loadTimeSummary() {
  const requestId = ++timeRequestId;
  timeRangeError.value = timeRangeStart.value && timeRangeEnd.value && timeRangeStart.value > timeRangeEnd.value
    ? 'The start date must be on or before the end date.'
    : '';
  if (timeRangeError.value) {
    timeSummary.value = {};
    return;
  }

  try {
    const result = await getJson(`/api/sales/time-series?${queryString({
      ...(timeRangeStart.value ? { startDate: timeRangeStart.value } : {}),
      ...(timeRangeEnd.value ? { endDate: timeRangeEnd.value } : {}),
      ...(timeSelectedStores.value !== null ? { storeIds: timeSelectedStores.value.join(',') } : {}),
    })}`);
    if (requestId === timeRequestId) timeSummary.value = result.timeSeries || {};
  } catch (loadError) {
    if (requestId === timeRequestId) {
      timeSummary.value = {};
      timeRangeError.value = loadError.message || 'Could not load sales time-range data.';
    }
  }
}
function choosePivotProduct(product) {
  pivotSearch.value = product === '__all__' ? 'ALL PRODUCT' : product;
  selectedPivotProduct.value = product;
  pivotDropdownOpen.value = false;
}
function closePivotDropdown(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) pivotDropdownOpen.value = false;
}
function toggleGlobalStore(storeName) {
  toggleChecklistSelection(selectedStores, storeName, stores.value.map((store) => store.name));
}
function setGlobalStoresAll(event) {
  setChecklistAll(selectedStores, event.target.checked);
}
function togglePaymentBarStore(storeName) {
  toggleChecklistSelection(paymentBarStores, storeName, chartStoreOptions.value.map((store) => store.name));
}
function setPaymentBarStoresAll(event) {
  setChecklistAll(paymentBarStores, event.target.checked);
}
function togglePaymentBarPayment(paymentName) {
  toggleChecklistSelection(paymentBarPayments, paymentName, paymentMethodOptions.value);
}
function setPaymentBarPaymentsAll(event) {
  setChecklistAll(paymentBarPayments, event.target.checked);
}
function toggleCategoryStore(storeName) {
  toggleChecklistSelection(categoryChartStores, storeName, categoryStoreOptions.value);
}
function setCategoryStoresAll(event) {
  setChecklistAll(categoryChartStores, event.target.checked);
}
function toggleCategory(categoryName) {
  toggleChecklistSelection(categoryChartCategories, categoryName, categoryOptions.value);
}
function setCategoriesAll(event) {
  setChecklistAll(categoryChartCategories, event.target.checked);
}
function toggleVisitPurposeStore(storeName) {
  toggleChecklistSelection(visitPurposeChartStores, storeName, visitPurposeStoreOptions.value);
}
function setVisitPurposeStoresAll(event) {
  setChecklistAll(visitPurposeChartStores, event.target.checked);
}
function toggleTopProductStore(storeName) {
  toggleChecklistSelection(topProductStores, storeName, chartStoreOptions.value.map((store) => store.name));
}
function setTopProductStoresAll(event) {
  setChecklistAll(topProductStores, event.target.checked);
}
function toggleProductChartStore(storeName) {
  toggleChecklistSelection(productChartStores, storeName, chartStoreOptions.value.map((store) => store.name));
}
function setProductChartStoresAll(event) {
  setChecklistAll(productChartStores, event.target.checked);
}
function toggleTimeStore(storeName) {
  toggleChecklistSelection(timeSelectedStores, storeName, chartStoreOptions.value.map((store) => store.name));
}
function setTimeStoresAll(event) {
  setChecklistAll(timeSelectedStores, event.target.checked);
}
function toggleChecklistSelection(selection, value, allValues) {
  const current = selection.value === null ? [...allValues] : [...selection.value];
  const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  selection.value = next.length === allValues.length ? null : next;
}
function setChecklistAll(selection, enabled) {
  selection.value = enabled ? null : [];
}
function togglePromotionStore(storeName) {
  toggleChecklistSelection(promotionChartStores, storeName, chartStoreOptions.value.map((store) => store.name));
}
function setPromotionStoresAll(event) {
  setChecklistAll(promotionChartStores, event.target.checked);
}
function togglePromotionPromo(promoName) {
  const names = [...new Set((summary.value.promotions || []).map((item) => item.name))];
  toggleChecklistSelection(promotionChartPromos, promoName, names);
}
function setPromotionPromosAll(event) {
  setChecklistAll(promotionChartPromos, event.target.checked);
}
function checklistLabel(selection, allLabel, itemLabel) {
  return selection === null ? allLabel : `${selection.length} ${itemLabel}`;
}
function coordinateDropdowns(event) {
  const target = event.target instanceof Element ? event.target : null;
  const current = target?.closest('details');
  const pivotDropdown = target?.closest('[data-dropdown="pivot"]');
  queueMicrotask(() => {
    const openDetails = document.querySelectorAll('.sales-report details[open]');
    openDetails.forEach((details) => { details.open = Boolean(current?.open && details === current); });
    if (!pivotDropdown) pivotDropdownOpen.value = false;
  });
}
function showTimeTooltip(event, slot) {
  const x = Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2;
  const y = Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2;
  hourTooltip.value = {
    hour: slot.hour !== undefined
      ? `${String(slot.hour).padStart(2, '0')}:00–${String(slot.hour).padStart(2, '0')}:59`
      : slot.name,
    allStores: timeSelectedStores.value === null,
    payments: slot.payments,
    stores: slot.revenueOnly ? [] : slot.stores,
    sales: slot.sales,
    topProducts: slot.topProducts,
    x: Math.max(12, Math.min(x + 14, window.innerWidth - 380)),
    y: Math.max(12, Math.min(y + 14, window.innerHeight - 400)),
  };
}
function moveTimeTooltip(event) {
  if (!hourTooltip.value) return;
  const x = Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2;
  const y = Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2;
  hourTooltip.value = {
    ...hourTooltip.value,
    x: Math.max(12, Math.min(x + 14, window.innerWidth - 380)),
    y: Math.max(12, Math.min(y + 14, window.innerHeight - 400)),
  };
}
function formatPercent(value, total) {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '0.0%';
}
function formatDateTime(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 16);
}
function filters(includeSearch = false) {
  return {
    ...range.value,
    ...(selectedStores.value !== null ? { storeIds: selectedStores.value.join(',') } : {}),
    ...(includeSearch && rawSearch.value.trim() ? { search: rawSearch.value.trim() } : {}),
  };
}
function queryString(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && (value !== '' || key === 'storeIds')) params.set(key, String(value));
  }
  return params.toString();
}
async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || `Request failed (HTTP ${response.status}).`);
  return result;
}
async function loadReport() {
  const requestId = ++reportRequestId;
  if (dateRangeError.value) {
    error.value = dateRangeError.value;
    summary.value = {};
    rows.value = [];
    totalRows.value = 0;
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const base = filters();
    const [summaryResult, rawResult] = await Promise.all([
      getJson(`/api/sales/summary?${queryString(base)}`),
      activeTab.value === 'raw'
        ? getJson(`/api/sales/report?${queryString({ ...filters(true), limit: pageSize, offset: (page.value - 1) * pageSize })}`)
        : Promise.resolve(null),
    ]);
    if (requestId !== reportRequestId) return;
    summary.value = summaryResult.summary || {};
    if (rawResult) {
      rows.value = rawResult.transactions || [];
      totalRows.value = rawResult.total || 0;
    }
  } catch (loadError) {
    if (requestId === reportRequestId) error.value = loadError.message || 'Could not load sales data.';
  } finally {
    if (requestId === reportRequestId) loading.value = false;
  }
}
async function loadStockCompare() {
  if (!stockCompareStore.value || !stockCompareDate.value) return;
  stockCompareLoading.value = true;
  stockCompareError.value = '';
  try {
    const result = await getJson(`/api/sales/stock-compare?${queryString({ store: stockCompareStore.value, date: stockCompareDate.value })}`);
    stockCompare.value = result;
  } catch (loadError) {
    stockCompareError.value = loadError.message || 'Could not load stock comparison.';
  } finally {
    stockCompareLoading.value = false;
  }
}
async function loadFiles() {
  try {
    const result = await getJson('/api/sales/files');
    files.value = result.files || [];
  } catch (loadError) {
    error.value = loadError.message || 'Could not load imported sales files.';
  }
}
async function loadStores() {
  try {
    const result = await getJson('/api/sales/stores');
    stores.value = result.stores || [];
    if (!stockCompareStore.value) stockCompareStore.value = stores.value[0]?.name || '';
  } catch (loadError) {
    error.value = loadError.message || 'Could not load sales branches.';
  }
}
function setTab(tab) {
  activeTab.value = tab;
  page.value = 1;
  loadReport();
}
function handleImported() {
  uploadOpen.value = false;
  page.value = 1;
  loadStores();
  loadFiles();
  loadReport();
  loadTimeSummary();
}
function downloadFile(file) {
  const link = document.createElement('a');
  link.href = `/api/sales/files/${encodeURIComponent(file.id)}/download`;
  link.download = file.filename || 'sales_clean.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
async function deleteFile() {
  if (!deletingFile.value) return;
  deleting.value = true;
  try {
    const result = await getJson(`/api/sales/files/${encodeURIComponent(deletingFile.value.id)}`, { method: 'DELETE' });
    if (!result.success) throw new Error('Could not delete imported sales data.');
    deletingFile.value = null;
    await Promise.all([loadFiles(), loadStores(), loadReport(), loadTimeSummary()]);
  } catch (deleteError) {
    error.value = deleteError.message || 'Could not delete imported sales data.';
  } finally {
    deleting.value = false;
  }
}

watch([period, anchorDate, customStartDate, customEndDate, selectedStores], () => {
  page.value = 1;
  loadReport();
  timeRangeStart.value = range.value.startDate || '';
  timeRangeEnd.value = range.value.endDate || '';
});
watch(selectedStores, (selection) => {
  const selected = selection === null ? null : [...selection];
  paymentBarStores.value = selected;
  promotionChartStores.value = selected;
  topProductStores.value = selected;
  categoryChartStores.value = selected;
  visitPurposeChartStores.value = selected;
  productChartStores.value = selected;
  timeSelectedStores.value = selected;
}, { deep: true });
watch([rawSearch, page], () => {
  if (activeTab.value === 'raw') loadReport();
});
watch([timeRangeStart, timeRangeEnd, timeSelectedStores], loadTimeSummary);
watch([stockCompareStore, stockCompareDate], loadStockCompare);
watch(() => summary.value.latestBusinessDate, (date) => { if (date && !stockCompareDate.value) stockCompareDate.value = date; });
watch([pivotRows, allPivotRows], ([filteredItems, allItems]) => {
  if (selectedPivotProduct.value === '__all__') return;
  if (!allItems.some((item) => item.item === selectedPivotProduct.value) ||
      (pivotSearch.value && !filteredItems.some((item) => item.item === selectedPivotProduct.value))) {
    selectedPivotProduct.value = filteredItems[0]?.item || '';
  }
});

onMounted(() => {
  loadStores();
  loadFiles();
  loadReport();
  loadTimeSummary();
  loadStockCompare();
  autoRefreshTimer = setInterval(() => {
    if (document.hidden || loading.value || uploadOpen.value) return;
    loadReport();
    loadTimeSummary();
    loadStockCompare();
  }, 60000);
});
onBeforeUnmount(() => clearInterval(autoRefreshTimer));
</script>

<template>
  <main class="sales-report flex flex-col space-y-5" @click="coordinateDropdowns">
    <section class="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex items-center gap-3">
        <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><TrendingUp class="h-5 w-5" /></div>
        <div>
          <h1 class="text-xl font-black text-slate-900">Sales Report</h1>
          <p class="text-xs text-slate-500">Clean CSV-backed sales analytics and source columns</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-800" @click="uploadOpen = true">
          <UploadCloud class="h-4 w-4" />Upload CSV
        </button>
        <button type="button" class="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50" :disabled="loading" title="Refresh" @click="loadReport(); loadFiles(); loadStores(); loadTimeSummary(); loadStockCompare()">
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
        </button>
      </div>
    </section>


    <template v-if="activeTab === 'analytics'">
      <section class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><TrendingUp class="h-4 w-4 text-emerald-600" />Total net sales</p>
          <p class="mt-2 text-2xl font-black text-slate-900">{{ formatMoney(summary.totalNetSales) }}</p>
          <p class="mt-1 text-xs text-slate-500">Customer-paid amount after bill discount</p>
        </article>
        <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><Package class="h-4 w-4 text-teal-600" />Units sold</p>
          <p class="mt-2 text-2xl font-black text-slate-900">{{ Number(summary.totalUnitsSold || 0).toLocaleString('id-ID') }}</p>
          <p class="mt-1 text-xs text-slate-500">{{ Number(summary.totalLineItems || 0).toLocaleString('id-ID') }} clean sales rows</p>
        </article>
        <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><Store class="h-4 w-4 text-blue-600" />Top Stores</p>
          <ol class="mt-2 space-y-1.5">
            <li v-for="(store,index) in topStores" :key="store.name" class="flex items-center justify-between gap-2 text-xs">
              <span class="truncate font-semibold text-slate-800"><span class="mr-1 text-teal-700">{{ index + 1 }}.</span>{{ store.name }}</span>
              <span class="whitespace-nowrap font-mono font-bold text-slate-900">{{ formatMoney(store.sales) }}</span>
            </li>
            <li v-if="!topStores.length" class="text-xs text-slate-400">No store sales in this period.</li>
          </ol>
        </article>
      </section>
      <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article v-for="window in topProductWindows" :key="window.key" class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 class="mb-3 text-sm font-bold text-slate-900">Top 5 products per store · {{ window.title }}</h2>
          <div v-if="window.stores.length" class="grid gap-3 sm:grid-cols-2">
            <div v-for="store in window.stores" :key="store.name" class="rounded-xl bg-slate-50 p-3">
              <h3 class="mb-2 truncate text-xs font-bold text-slate-700">{{ store.name }}</h3>
              <ol class="space-y-1.5">
                <li v-for="product in store.products" :key="product.menu" class="flex items-start justify-between gap-2 text-[11px]">
                  <span class="min-w-0"><span class="mr-1 font-bold text-teal-700">{{ product.rank }}.</span><span class="font-medium text-slate-800">{{ product.menu }}</span><span class="ml-1 text-slate-500">×{{ Number(product.qty).toLocaleString('id-ID') }}</span></span>
                  <span class="shrink-0 font-mono text-slate-600">{{ formatMoney(product.sales) }}</span>
                </li>
              </ol>
            </div>
          </div>
          <p v-else class="text-xs text-slate-400">No product sales in this period for the selected stores.</p>
        </article>
      </section>
    </template>

    <p v-if="error" class="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{{ error }}</p>

    <nav class="flex gap-2">
      <button v-for="tab in [{id:'analytics',label:'Analytics'},{id:'raw',label:'Raw'}]" :key="tab.id" type="button"
        class="rounded-xl px-5 py-2.5 text-sm font-bold"
        :class="activeTab === tab.id ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
        @click="setTab(tab.id)">{{ tab.label }}</button>
    </nav>

    <section class="flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <label class="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Period</label>
        <div class="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          <button v-for="option in periodOptions" :key="option.id" type="button" class="rounded-lg px-3 py-1.5 text-xs font-bold"
            :class="period === option.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'"
            @click="period = option.id">{{ option.label }}</button>
        </div>
      </div>
      <label v-if="period !== 'all'" class="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {{ period === 'day' ? 'Day' : period === 'custom' ? 'Start date' : 'Reference date' }}
        <input v-if="period === 'custom'" v-model="customStartDate" type="date" class="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800">
        <input v-else v-model="anchorDate" type="date" class="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800">
      </label>
      <label v-if="period === 'custom'" class="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        End date
        <input v-model="customEndDate" type="date" class="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800">
      </label>
      <details class="relative text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <summary class="flex min-w-40 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800">
          {{ checklistLabel(selectedStores, 'All stores', 'stores') }}<span aria-hidden="true">▾</span>
        </summary>
        <div class="absolute left-0 z-30 mt-1 max-h-72 w-64 overflow-auto rounded-xl border border-slate-200 bg-white p-2 normal-case shadow-xl">
          <label class="flex gap-2 border-b border-slate-100 px-2 py-2 text-xs font-semibold"><input type="checkbox" :checked="selectedStores === null" @change="setGlobalStoresAll">All stores</label>
          <label v-for="store in stores" :key="store.name" class="flex gap-2 px-2 py-1.5 text-xs"><input type="checkbox" :checked="selectedStores === null || selectedStores.includes(store.name)" @change="toggleGlobalStore(store.name)">{{ store.name }}</label>
        </div>
      </details>
      <p v-if="range.startDate || range.endDate" class="pb-2 text-xs text-slate-500">{{ range.startDate || 'Beginning' }} – {{ range.endDate || 'Latest' }}</p>
    </section>

    <template v-if="activeTab === 'analytics'">
      <section class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div><h2 class="text-sm font-bold text-slate-900">Sales by Visit Purpose</h2><p class="text-[11px] text-slate-500">Current store selection: {{ selectedStoreLabel }}</p></div>
          </header>
          <div class="overflow-x-auto">
            <table class="sales-data-table w-full text-left text-xs"><thead class="bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><tr><th class="px-4 py-2">Visit purpose</th><th class="px-4 py-2 text-right">Sales</th><th class="px-4 py-2 text-right">Share</th></tr></thead>
              <tbody class="sales-table-body"><tr v-for="item in visitPurposeRows" :key="item.name" class="border-t border-slate-100"><td class="px-4 py-2 font-semibold">{{ item.name }}</td><td class="px-4 py-2 text-right font-mono">{{ formatMoney(item.sales) }}</td><td class="px-4 py-2 text-right">{{ formatPercent(item.sales, summary.totalNetSales) }}</td></tr>
                <tr v-if="!visitPurposeRows.length"><td colspan="3" class="p-6 text-center text-slate-400">No visit-purpose sales in this period.</td></tr>
              </tbody>
            </table>
          </div>
        </article>
        <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h3 class="text-xs font-bold text-slate-700">Visit Purpose Sales Distribution</h3>
            <details class="relative">
              <summary class="flex min-w-36 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs">{{ checklistLabel(visitPurposeChartStores, 'All stores', 'stores') }} <span aria-hidden="true">▾</span></summary>
              <div class="absolute right-0 z-20 mt-1 max-h-64 w-56 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <label class="flex gap-2 border-b border-slate-100 px-2 py-2 text-xs font-semibold"><input type="checkbox" :checked="visitPurposeChartStores === null" @change="setVisitPurposeStoresAll">All stores</label>
                <label v-for="store in visitPurposeStoreOptions" :key="store" class="flex gap-2 px-2 py-1.5 text-xs"><input type="checkbox" :checked="visitPurposeChartStores === null || visitPurposeChartStores.includes(store)" @change="toggleVisitPurposeStore(store)">{{ store }}</label>
              </div>
            </details>
          </header>
          <AnalyticsPieChart :items="visitPurposeChartRows" show-values-on-hover empty-label="No visit-purpose sales for this store and period." />
        </article>
      </section>

      <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div><h2 class="text-sm font-bold text-slate-900">Promotion Performance</h2><p class="text-[11px] text-slate-500">Promo names come from Menu and are not treated as product brands.</p></div>
          <div class="flex flex-wrap gap-2">
            <details class="relative">
              <summary class="flex min-w-32 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs">{{ checklistLabel(promotionChartStores, 'All stores', 'stores') }}<span aria-hidden="true">▾</span></summary>
              <div class="absolute right-0 z-20 mt-1 max-h-64 w-56 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <label class="flex gap-2 border-b border-slate-100 px-2 py-2 text-xs font-semibold"><input type="checkbox" :checked="promotionChartStores === null" @change="setPromotionStoresAll">All stores</label>
                <label v-for="store in chartStoreOptions" :key="store.name" class="flex gap-2 px-2 py-1.5 text-xs"><input type="checkbox" :checked="promotionChartStores === null || promotionChartStores.includes(store.name)" @change="togglePromotionStore(store.name)">{{ store.name }}</label>
              </div>
            </details>
            <details class="relative">
              <summary class="flex min-w-36 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs">{{ checklistLabel(promotionChartPromos, 'All promotions', 'promotions') }}<span aria-hidden="true">▾</span></summary>
              <div class="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <input v-model="promotionSearch" type="search" placeholder="Search promotions..." class="mb-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs" aria-label="Search promotions">
                <div class="max-h-56 overflow-auto">
                  <label class="flex gap-2 border-b border-slate-100 px-2 py-2 text-xs font-semibold"><input type="checkbox" :checked="promotionChartPromos === null" @change="setPromotionPromosAll">All promotions</label>
                  <label v-for="promo in promotionOptions" :key="promo" class="flex gap-2 px-2 py-1.5 text-xs"><input type="checkbox" :checked="promotionChartPromos === null || promotionChartPromos.includes(promo)" @change="togglePromotionPromo(promo)"><span class="truncate">{{ promo }}</span></label>
                  <p v-if="!promotionOptions.length" class="px-2 py-3 text-xs text-slate-400">No matching promotions.</p>
                </div>
              </div>
            </details>
          </div>
        </header>
        <div class="grid grid-cols-1 lg:grid-cols-2">
          <div class="h-96 overflow-auto">
            <table class="sales-data-table w-full table-fixed text-left text-xs"><colgroup><col class="w-[25%]"><col><col class="w-[12%]"><col class="w-[26%]"></colgroup><thead class="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><tr><th class="px-1 py-2">Store</th><th class="px-1 py-2">Promotion</th><th class="px-1 py-2 text-right">Units</th><th class="px-1 py-2 text-right">Sales</th></tr></thead>
              <tbody class="sales-table-body"><tr v-for="(item,index) in visiblePromotions" :key="`${item.branch}-${item.name}-${index}`"><td class="break-words px-1 py-2 font-semibold">{{ item.branch }}</td><td class="break-words px-1 py-2">{{ item.name }}</td><td class="break-all px-1 py-2 text-right">{{ Number(item.units).toLocaleString('id-ID') }}</td><td class="break-all px-1 py-2 text-right font-mono">{{ formatMoney(item.sales) }}</td></tr>
                <tr v-if="!visiblePromotions.length"><td colspan="4" class="p-6 text-center text-slate-400">No promotion sales for this store and period.</td></tr>
              </tbody>
            </table>
          </div>
          <div class="border-t border-slate-100 lg:col-span-1 lg:border-l lg:border-t-0">
            <header class="px-4 pt-3 text-xs font-bold text-slate-700">Promotion Sales Share by Store</header>
            <AnalyticsLineChart :items="visiblePromotionChartItems" metric="sales" :x-axis-label="promotionChartStores === null ? 'Store' : 'Promotion'" :x-axis-font-size="12" :line-color="promotionChartStores === null ? '#0f766e' : '#7c3aed'" :show-percent="false" :sort-items="false" empty-label="No promotion sales for this selection." />
          </div>
        </div>
      </section>

      <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div><h2 class="text-sm font-bold text-slate-900">Sales by Menu Category</h2><p class="text-[11px] text-slate-500">Beer, craft beer, liquor, etc. Includes the PROMO category.</p></div>
          <details class="relative">
            <summary class="flex min-w-32 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs">{{ checklistLabel(categoryChartStores, 'All stores', 'stores') }}<span aria-hidden="true">▾</span></summary>
            <div class="absolute right-0 z-20 mt-1 max-h-64 w-56 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              <label class="flex gap-2 border-b border-slate-100 px-2 py-2 text-xs font-semibold"><input type="checkbox" :checked="categoryChartStores === null" @change="setCategoryStoresAll">All stores</label>
              <label v-for="store in categoryStoreOptions" :key="store" class="flex gap-2 px-2 py-1.5 text-xs"><input type="checkbox" :checked="categoryChartStores === null || categoryChartStores.includes(store)" @change="toggleCategoryStore(store)">{{ store }}</label>
            </div>
          </details>
        </header>
        <div class="grid grid-cols-1 lg:grid-cols-2">
          <div class="max-h-[24rem] overflow-auto">
            <table class="w-full text-left text-xs"><thead class="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><tr><th class="px-4 py-2">Menu category</th><th class="px-4 py-2 text-right">Units</th><th class="px-4 py-2 text-right">Sales</th></tr></thead>
              <tbody class="sales-table-body">
                <tr v-for="item in visibleCategoryTable" :key="item.name" class="border-t border-slate-100"><td class="px-4 py-2 font-semibold">{{ item.name }}</td><td class="px-4 py-2 text-right">{{ Number(item.units).toLocaleString('id-ID') }}</td><td class="px-4 py-2 text-right font-mono">{{ formatMoney(item.sales) }}</td></tr>
                <tr v-if="!visibleCategoryTable.length"><td colspan="3" class="p-6 text-center text-slate-400">No category sales for this store and period.</td></tr>
              </tbody>
            </table>
          </div>
          <div class="border-t border-slate-100 lg:border-l lg:border-t-0">
            <header class="px-4 pt-3 text-xs font-bold text-slate-700">Category Sales Share</header>
            <AnalyticsLineChart :items="visibleCategoryTable" metric="sales" x-axis-label="Category" :x-axis-font-size="12" line-color="#0f766e" :sort-items="false" empty-label="No category sales for this selection." />
          </div>
        </div>
      </section>

      <section class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header class="border-b border-slate-100 px-4 py-3"><h2 class="text-sm font-bold text-slate-900">Sales by Payment Method</h2><p class="text-[11px] text-slate-500">Amounts allocated across split tenders when a bill uses multiple methods</p></header>
          <div class="min-h-[22rem] overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><tr><th class="px-4 py-2">Payment method</th><th class="px-4 py-2 text-right">Sales</th><th class="px-4 py-2 text-right">Share</th></tr></thead>
              <tbody class="sales-table-body"><tr v-for="item in summary.payments || []" :key="item.name" class="border-t border-slate-100">
                <td class="px-4 py-2.5 font-semibold text-slate-800">{{ item.name }}</td><td class="px-4 py-2.5 text-right font-mono">{{ formatMoney(item.sales) }}</td><td class="px-4 py-2.5 text-right font-mono">{{ formatPercent(item.sales, summary.totalNetSales) }}</td>
              </tr></tbody>
            </table>
          </div>
        </article>
        <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div><h3 class="text-sm font-bold text-slate-900">Payment Share Chart</h3><p class="text-[11px] text-slate-500">Share of net sales by payment method.</p></div>
            <select v-model="paymentChartStore" class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
              <option value="all">All stores</option><option v-for="store in stores" :key="store.name" :value="store.name">{{ store.name }}</option>
            </select>
          </header>
          <AnalyticsPieChart :items="paymentDonutItems" show-values-on-hover show-legend-values empty-label="No payment sales for this selection." />
        </article>
      </section>

      <section class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header class="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div class="flex min-w-0 flex-col gap-2">
            <div><h2 class="text-sm font-bold text-slate-900">Sales by Product Variant</h2><p class="text-[11px] text-slate-500">Click a product row to show its payment mix. ALL PRODUCT includes promotions and matches net sales.</p></div>
            <div class="relative" data-dropdown="pivot" @focusout="closePivotDropdown">
              <input v-model="pivotSearch" type="search" placeholder="Select or search product variant..." autocomplete="off"
                class="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                aria-label="Search product variants" aria-haspopup="listbox" :aria-expanded="pivotDropdownOpen"
                @focus="pivotDropdownOpen = true" @click="pivotDropdownOpen = true">
              <ul v-if="pivotDropdownOpen" role="listbox" aria-label="Product variants"
                class="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                <li role="option" :aria-selected="selectedPivotProduct === '__all__'">
                  <button type="button" class="w-full rounded px-3 py-2 text-left text-xs font-bold hover:bg-teal-50"
                    @mousedown.prevent @click="choosePivotProduct('__all__')">ALL PRODUCT</button>
                </li>
                <li v-for="item in pivotRows" :key="item.item" role="option" :aria-selected="selectedPivotRow?.item === item.item">
                  <button type="button" class="w-full rounded px-3 py-2 text-left text-xs hover:bg-teal-50"
                    @mousedown.prevent @click="choosePivotProduct(item.item)">{{ item.item }}</button>
                </li>
              </ul>
            </div>
          </div>
        </header>
        <div class="max-h-[30rem] overflow-auto">
          <table class="sales-data-table w-full min-w-[720px] text-left text-[11px]"><thead class="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><tr><th class="sticky left-0 bg-slate-50 px-3 py-2">Product</th><th v-for="method in pivotPaymentMethods" :key="method" class="whitespace-nowrap px-3 py-2 text-right">{{ method }}</th><th class="px-3 py-2 text-right">Total</th></tr></thead>
            <tbody class="sales-table-body"><tr v-for="item in visiblePivotRows" :key="item.item" tabindex="0" role="button" :aria-label="`Show payment mix for ${item.item}`" class="cursor-pointer border-t border-slate-100 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-600" :class="selectedPivotRow?.item === item.item ? 'outline outline-1 outline-teal-500' : ''" @click="choosePivotRow(item.item)" @keydown.enter="choosePivotRow(item.item)" @keydown.space.prevent="choosePivotRow(item.item)">
              <th class="sticky left-0 bg-white px-3 py-2 text-left font-semibold">{{ item.item }}</th>
              <td v-for="method in pivotPaymentMethods" :key="method" class="whitespace-nowrap px-3 py-2 text-right"><span class="block font-mono">{{ formatMoney(item.methods[method] || 0) }}</span><span class="text-[9px] text-slate-500">{{ formatPercent(item.methods[method] || 0, item.total) }}</span></td>
              <td class="whitespace-nowrap px-3 py-2 text-right font-bold font-mono">{{ formatMoney(item.total) }}</td>
            </tr><tr v-if="!visiblePivotRows.length"><td :colspan="pivotPaymentMethods.length + 2" class="p-8 text-center text-slate-400">No matching product sales</td></tr></tbody>
          </table>
        </div>
        </article>
        <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div class="min-w-0"><h3 class="text-xs font-bold text-slate-700">Selected Product Payment Method</h3><p v-if="selectedPivotRow" class="mt-1 break-words text-base font-extrabold text-slate-900">{{ selectedPivotRow.item }}</p><p v-if="selectedPivotRow" class="mt-1 text-[11px] font-semibold text-teal-800">Product sales: {{ formatMoney(selectedPivotTotal) }}</p></div>
            <details class="relative">
              <summary class="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs">{{ checklistLabel(productChartStores, 'All stores', 'stores') }} <span aria-hidden="true">▾</span></summary>
              <div class="absolute right-0 z-20 mt-1 max-h-64 w-56 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <label class="flex gap-2 border-b border-slate-100 px-2 py-2 text-xs font-semibold"><input type="checkbox" :checked="productChartStores === null" @change="setProductChartStoresAll">All stores</label>
                <label v-for="store in chartStoreOptions" :key="store.name" class="flex gap-2 px-2 py-1.5 text-xs"><input type="checkbox" :checked="productChartStores === null || productChartStores.includes(store.name)" @change="toggleProductChartStore(store.name)">{{ store.name }}</label>
              </div>
            </details>
          </header>
          <AnalyticsPieChart :items="productPaymentPieItems" :max-items="20" show-values-on-hover empty-label="Choose a product with sales to see payment mix." />
        </article>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <article class="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div><h2 class="text-sm font-bold text-slate-900">Top Products</h2><p class="text-[11px] text-slate-500">Top ten by customer-paid sales across all stores, or for the selected store.</p></div>
          <details class="relative">
            <summary class="flex min-w-36 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs">{{ checklistLabel(topProductStores, 'All stores', 'stores') }} <span aria-hidden="true">▾</span></summary>
            <div class="absolute right-0 z-20 mt-1 max-h-64 w-56 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              <label class="flex gap-2 border-b border-slate-100 px-2 py-2 text-xs font-semibold"><input type="checkbox" :checked="topProductStores === null" @change="setTopProductStoresAll">All stores</label>
              <label v-for="store in chartStoreOptions" :key="store.name" class="flex gap-2 px-2 py-1.5 text-xs"><input type="checkbox" :checked="topProductStores === null || topProductStores.includes(store.name)" @change="toggleTopProductStore(store.name)">{{ store.name }}</label>
            </div>
          </details>
        </header>
        <div class="max-h-[30rem] overflow-auto">
          <table class="sales-data-table w-full text-left text-xs"><thead class="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><tr><th class="px-4 py-2">Store scope</th><th class="px-4 py-2">Product</th><th class="px-4 py-2 text-right">Sales</th></tr></thead>
            <tbody class="sales-table-body"><tr v-for="(item,index) in visibleTopProducts" :key="`${item.branch}-${item.menu}-${index}`" class="border-t border-slate-100"><td class="px-4 py-2 font-semibold">{{ item.branch }}</td><td class="px-4 py-2">{{ item.menu }}</td><td class="px-4 py-2 text-right font-mono">{{ formatMoney(item.sales) }}</td></tr><tr v-if="!visibleTopProducts.length"><td colspan="3" class="p-6 text-center text-slate-400">No product sales for this store and period.</td></tr></tbody>
          </table>
        </div>
        </article>
      </section>

      <section class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h2 class="text-sm font-bold text-slate-900">Store Sales per Month</h2>
            <select v-model="monthStore" class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"><option value="all">All stores</option><option v-for="name in monthStoreNames" :key="name" :value="name">{{ name }}</option></select>
          </header>
          <div class="max-h-[24rem] overflow-auto">
            <table class="w-full text-left text-xs"><thead class="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><tr><th class="px-4 py-2">Month</th><th v-for="name in (monthStore === 'all' ? monthStoreNames : [monthStore])" :key="name" class="px-4 py-2 text-right">{{ name }}</th><th v-if="monthStore === 'all'" class="px-4 py-2 text-right">Total</th></tr></thead>
              <tbody class="sales-table-body"><tr v-for="row in monthStoreRows" :key="row.key" class="border-t border-slate-100"><td class="px-4 py-2 font-semibold">{{ row.name }}</td><td v-for="name in (monthStore === 'all' ? monthStoreNames : [monthStore])" :key="name" class="px-4 py-2 text-right font-mono">{{ formatMoney(row.bySales.get(name) || 0) }}</td><td v-if="monthStore === 'all'" class="px-4 py-2 text-right font-mono font-bold">{{ formatMoney(row.sales) }}</td></tr>
                <tr v-if="!monthStoreRows.length"><td colspan="9" class="p-6 text-center text-slate-400">No monthly sales yet.</td></tr></tbody>
            </table>
          </div>
        </article>
        <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header class="border-b border-slate-100 px-4 py-3"><h3 class="text-xs font-bold text-slate-700">Store Sales per Month Chart</h3></header>
          <AnalyticsBarChart :items="monthChartItems" value-axis="rupiah" :max-items="24" x-axis-label="Month" empty-label="No monthly sales yet." heatmap />
        </article>
      </section>

      <section class="space-y-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <header class="flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 pb-4">
          <div><h2 class="flex items-center gap-2 text-sm font-bold text-slate-900"><BarChart3 class="h-4 w-4 text-indigo-600" />Sales by Time Range</h2><p class="text-[11px] text-slate-500">Hourly, weekday, weekly, and monthly revenue · business dates run 06:00–05:59 Jakarta time.</p></div>
          <div class="flex flex-wrap items-end gap-3">
            <label class="text-[10px] font-bold uppercase text-slate-500">From
              <input v-model="timeRangeStart" type="date" class="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium normal-case text-slate-800">
            </label>
            <label class="text-[10px] font-bold uppercase text-slate-500">To
              <input v-model="timeRangeEnd" type="date" class="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium normal-case text-slate-800">
            </label>
            <details class="relative">
              <summary class="flex min-w-36 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs">{{ checklistLabel(timeSelectedStores, 'All stores', 'stores') }} <span aria-hidden="true">▾</span></summary>
              <div class="absolute right-0 z-20 mt-1 max-h-64 w-56 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <label class="flex gap-2 border-b border-slate-100 px-2 py-2 text-xs font-semibold"><input type="checkbox" :checked="timeSelectedStores === null" @change="setTimeStoresAll">All stores</label>
                <label v-for="store in chartStoreOptions" :key="store.name" class="flex gap-2 px-2 py-1.5 text-xs"><input type="checkbox" :checked="timeSelectedStores === null || timeSelectedStores.includes(store.name)" @change="toggleTimeStore(store.name)">{{ store.name }}</label>
              </div>
            </details>
          </div>
          <p v-if="timeRangeError" class="w-full text-xs text-rose-700">{{ timeRangeError }}</p>
        </header>

        <div class="grid grid-cols-1 gap-4">
          <article class="rounded-xl border border-slate-100 p-3">
            <h3 class="mb-3 text-xs font-bold text-slate-700">Sales by Hour</h3>
            <div class="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
              <button v-for="slot in hourlyValues" :key="slot.hour" type="button"
                class="rounded-lg border p-2 text-center shadow-sm transition hover:z-10 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                :style="heatmapStyle(slot.sales, maxHourSales, '#ecfeff', '#0e7490')"
                :aria-label="`${String(slot.hour).padStart(2,'0')}:00 sales ${formatMoney(slot.sales)}`"
                @pointerenter="showTimeTooltip($event, slot)" @pointermove="moveTimeTooltip" @pointerleave="hourTooltip = null"
                @focus="showTimeTooltip($event, slot)" @blur="hourTooltip = null">
                <span class="block text-xs font-bold">{{ String(slot.hour).padStart(2, '0') }}:00</span>
                <span class="mt-1 block truncate text-[9px]">{{ formatMoney(slot.sales) }}</span>
              </button>
            </div>
          </article>
          <article class="rounded-xl border border-slate-100 p-3">
            <h3 class="mb-3 text-xs font-bold text-slate-700">Sales by Day</h3>
            <div class="grid grid-cols-7 gap-1.5">
              <button v-for="slot in weekdayValues" :key="slot.weekday" type="button"
                class="min-w-0 rounded-lg border p-2 text-center shadow-sm transition hover:z-10 hover:scale-[1.03] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-600"
                :style="heatmapStyle(slot.sales, maxWeekdaySales, '#ecfeff', '#0e7490')"
                :aria-label="`${slot.name}: ${formatMoney(slot.sales)}`"
                @pointerenter="showTimeTooltip($event, slot)" @pointermove="moveTimeTooltip" @pointerleave="hourTooltip = null"
                @focus="showTimeTooltip($event, slot)" @blur="hourTooltip = null">
                <span class="block truncate text-[10px] font-bold sm:text-xs">{{ slot.name.slice(0, 3) }}</span><span class="mt-1 block truncate text-[8px] sm:text-[10px]">{{ formatMoney(slot.sales) }}</span>
              </button>
            </div>
          </article>
          <article class="rounded-xl border border-slate-100 p-3">
            <h3 class="mb-3 text-xs font-bold text-slate-700">Sales by Week</h3>
            <div class="max-h-80 space-y-2 overflow-x-auto overflow-y-auto">
              <div v-for="month in weeklyMonthRows" :key="month.month" class="flex min-w-max items-center gap-2 rounded-lg bg-slate-50 p-2">
                <span class="w-24 shrink-0 text-xs font-bold text-slate-700">{{ month.month }}</span>
                <button v-for="slot in month.weeks" :key="slot.key" type="button"
                  class="min-w-28 rounded-lg border p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  :style="heatmapStyle(slot.sales, maxWeeklySales, '#eef2ff', '#4338ca')"
                  :aria-label="`${slot.name} sales ${formatMoney(slot.sales)}`"
                  @pointerenter="showTimeTooltip($event, slot)" @pointermove="moveTimeTooltip" @pointerleave="hourTooltip = null"
                  @focus="showTimeTooltip($event, slot)" @blur="hourTooltip = null">
                  <span class="block text-xs font-bold">Week of {{ slot.shortName }}</span><span class="mt-1 block text-[10px]">{{ formatMoney(slot.sales) }}</span>
                </button>
              </div>
              <p v-if="!weeklyMonthRows.length" class="p-4 text-center text-xs text-slate-400">No weekly sales yet.</p>
            </div>
          </article>
          <article class="rounded-xl border border-slate-100 p-3">
            <h3 class="mb-3 text-xs font-bold text-slate-700">Sales by Month</h3>
            <div class="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-6">
              <button v-for="slot in monthlyValues" :key="slot.key" type="button"
                class="rounded-lg border p-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-600"
                :style="heatmapStyle(slot.sales, maxMonthlySales, '#fff7ed', '#c2410c')"
                :aria-label="`${slot.name} sales ${formatMoney(slot.sales)}`"
                @pointerenter="showTimeTooltip($event, slot)" @pointermove="moveTimeTooltip" @pointerleave="hourTooltip = null"
                @focus="showTimeTooltip($event, slot)" @blur="hourTooltip = null">
                <span class="block text-xs font-bold">{{ slot.name }}</span><span class="mt-1 block truncate text-[9px]">{{ formatMoney(slot.sales) }}</span>
              </button>
            </div>
          </article>
        </div>
        <section class="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <header class="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div><h3 class="text-sm font-bold text-slate-900">Stock vs Sold</h3><p class="text-[11px] text-slate-500">Opening snapshot before 06:00, sales in the business day, and next-morning closing snapshot.</p></div>
            <div class="flex flex-wrap gap-2">
              <label class="text-[10px] font-bold uppercase text-slate-500">Store<select v-model="stockCompareStore" class="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium normal-case text-slate-800"><option v-for="store in stores" :key="store.name" :value="store.name">{{ store.name }}</option></select></label>
              <label class="text-[10px] font-bold uppercase text-slate-500">Business date<input v-model="stockCompareDate" type="date" class="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium normal-case text-slate-800"></label>
            </div>
          </header>
          <p v-if="stockCompareError" class="text-xs text-rose-700">{{ stockCompareError }}</p>
          <p v-else-if="stockCompareLoading" class="text-xs text-slate-500">Loading stock comparison…</p>
          <p v-else-if="stockCompare.needsSnapshots" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Needs stock snapshots from two consecutive mornings ({{ stockCompare.requiredDates?.join(' and ') || 'selected date and following day' }}); collecting since {{ stockCompare.collectingSince || 'the next successful inventory sync' }}.</p>
          <div v-else class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table class="w-full min-w-[760px] text-left text-xs"><thead class="bg-slate-100 text-[10px] font-bold uppercase text-slate-500"><tr><th class="px-3 py-2">Product (sales / stock)</th><th class="px-3 py-2 text-right">Opening</th><th class="px-3 py-2 text-right">Sold</th><th class="px-3 py-2 text-right">Expected closing</th><th class="px-3 py-2 text-right">Actual closing</th><th class="px-3 py-2 text-right">Difference</th><th class="px-3 py-2">Status</th></tr></thead>
              <tbody><tr v-for="(row,index) in stockCompare.rows" :key="`${row.product}-${index}`" class="border-t border-slate-100"><td class="px-3 py-2 font-medium">{{ row.product }}<span v-if="row.stockProduct && row.stockProduct !== row.product" class="block text-[10px] text-slate-500">Matched stock: {{ row.stockProduct }}</span></td><td class="px-3 py-2 text-right">{{ row.opening ?? '—' }}</td><td class="px-3 py-2 text-right">{{ row.sold ?? '—' }}</td><td class="px-3 py-2 text-right">{{ row.expectedClosing ?? '—' }}</td><td class="px-3 py-2 text-right">{{ row.actualClosing ?? '—' }}</td><td class="px-3 py-2 text-right">{{ row.difference ?? '—' }}</td><td class="px-3 py-2"><span :class="row.status === 'matched' ? 'text-emerald-700' : row.status === 'mismatch' ? 'text-amber-700' : 'text-slate-500'">{{ row.status }}</span></td></tr>
                <tr v-if="!stockCompare.rows.length"><td colspan="7" class="p-5 text-center text-slate-400">No stock or sales products found for this store and date.</td></tr></tbody></table>
          </div>
        </section>
      </section>
    </template>

    <template v-else>
      <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div><h2 class="text-sm font-bold text-slate-900">Raw Clean Sales Records</h2><p class="text-[11px] text-slate-500">Showing {{ totalRows.toLocaleString() }} matching rows · up to 100 records per page</p></div>
          <input v-model="rawSearch" type="search" placeholder="Search branch, menu, payment..." class="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs sm:w-72">
        </header>
        <div>
          <table class="w-full table-fixed text-left text-[10px] leading-tight">
            <colgroup>
              <col class="w-[12%]"><col class="w-[8%]"><col class="w-[9%]"><col class="w-[9%]">
              <col class="w-[9%]"><col class="w-[10%]"><col class="w-[12%]"><col class="w-[4%]">
              <col class="w-[8%]"><col class="w-[9%]"><col class="w-[10%]">
            </colgroup>
            <thead class="bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><tr>
              <th v-for="heading in ['Sales Date In','Branch','Visit Purpose','Payment Method','Menu Category','Menu Category Detail','Menu','Qty','Price','Subtotal','Total']" :key="heading" class="break-words px-1 py-2">{{ heading }}</th>
            </tr></thead>
            <tbody><tr v-for="(row,index) in rows" :key="`${row.sales_date_in}-${index}`" class="border-t border-slate-100 hover:bg-slate-50/70">
              <td class="break-all px-1 py-1.5">{{ formatDateTime(row.sales_date_in) }}</td><td class="break-words px-1 py-1.5">{{ row.branch }}</td><td class="break-words px-1 py-1.5">{{ row.visit_purpose }}</td><td class="break-words px-1 py-1.5">{{ row.payment_method }}</td><td class="break-words px-1 py-1.5">{{ row.menu_category }}</td><td class="break-words px-1 py-1.5">{{ row.menu_category_detail }}</td><td class="break-words px-1 py-1.5 font-medium text-slate-900">{{ row.menu }}</td><td class="break-all px-1 py-1.5 text-right">{{ row.qty }}</td><td class="break-all px-1 py-1.5 text-right">{{ formatMoney(row.price) }}</td><td class="break-all px-1 py-1.5 text-right">{{ formatMoney(row.subtotal) }}</td><td class="break-all px-1 py-1.5 text-right font-semibold">{{ formatMoney(row.total_after_bill_discount) }}</td>
            </tr><tr v-if="!rows.length"><td colspan="11" class="p-10 text-center text-slate-400">No sales rows found for these filters.</td></tr></tbody>
          </table>
        </div>
        <footer class="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <span>Page {{ page }} of {{ pages }}</span><div class="flex gap-2"><button class="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40" :disabled="page <= 1" @click="page--">Previous</button><button class="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40" :disabled="page >= pages" @click="page++">Next</button></div>
        </footer>
      </section>

    </template>

    <Teleport v-if="hourTooltip" to="body">
      <div class="pointer-events-none fixed z-[100] max-h-[70vh] max-w-[22rem] overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white shadow-xl" :style="{ left: `${hourTooltip.x}px`, top: `${hourTooltip.y}px` }">
        <p class="font-bold">{{ hourTooltip.hour }}</p>
        <p v-if="hourTooltip.sales !== undefined" class="mt-1 font-mono">{{ formatMoney(hourTooltip.sales) }}</p>
        <template v-if="hourTooltip.topProducts?.length">
          <p class="mt-1 text-[10px] font-bold uppercase text-slate-400">Top products · qty · revenue</p>
          <p v-for="product in hourTooltip.topProducts" :key="product.name" class="flex justify-between gap-3"><span class="truncate">{{ product.name }} · {{ product.qty }}</span><span class="shrink-0 font-mono">{{ formatMoney(product.sales) }}</span></p>
        </template>
        <template v-if="hourTooltip.stores?.length">
          <p class="mt-1 text-[10px] font-bold uppercase text-slate-400">Revenue per store</p>
          <p v-for="store in hourTooltip.stores" :key="store.name" class="flex justify-between gap-4"><span>{{ store.name }}</span><span class="font-mono">{{ formatMoney(store.sales) }}</span></p>
        </template>
      </div>
    </Teleport>

    <div v-if="deletingFile" class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <section class="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
        <h2 class="font-bold text-slate-900">Delete this sales import?</h2><p class="text-sm text-slate-600">This deletes {{ deletingFile.row_count }} clean sales rows from <strong>{{ deletingFile.filename }}</strong> and updates analytics.</p>
        <div class="flex justify-end gap-2"><button class="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100" :disabled="deleting" @click="deletingFile = null">Cancel</button><button class="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50" :disabled="deleting" @click="deleteFile">{{ deleting ? 'Deleting…' : 'Delete import' }}</button></div>
      </section>
    </div>

    <UploadSalesCsvModal :is-open="uploadOpen" @close="uploadOpen = false" @imported="handleImported">
      <template #history>
      <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header class="border-b border-slate-100 px-4 py-3"><h2 class="flex items-center gap-2 text-sm font-bold text-slate-900"><FileSpreadsheet class="h-4 w-4 text-teal-700" />Imported CSV batches</h2><p class="text-[11px] text-slate-500">Downloads contain the 12 clean columns, not unused original report fields.</p></header>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[700px] text-left text-xs">
            <thead class="bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><tr><th class="px-4 py-2">File</th><th class="px-4 py-2">Uploaded</th><th class="px-4 py-2">Stores</th><th class="px-4 py-2 text-right">Rows</th><th class="px-4 py-2 text-right">Net sales</th><th class="px-4 py-2 text-right">Actions</th></tr></thead>
            <tbody><tr v-for="file in files" :key="file.id" class="border-t border-slate-100"><td class="px-4 py-3 font-semibold text-slate-800">{{ file.filename }}</td><td class="whitespace-nowrap px-4 py-3">{{ formatDateTime(file.uploaded_at) }}</td><td class="px-4 py-3">{{ file.stores || '—' }}</td><td class="px-4 py-3 text-right">{{ Number(file.row_count).toLocaleString() }}</td><td class="whitespace-nowrap px-4 py-3 text-right">{{ formatMoney(file.total_revenue) }}</td><td class="px-4 py-3"><div class="flex justify-end gap-2"><button class="rounded-lg border border-slate-200 p-2 text-teal-700 hover:bg-teal-50" title="Download clean CSV" @click="downloadFile(file)"><Download class="h-3.5 w-3.5" /></button><button class="rounded-lg border border-slate-200 p-2 text-rose-600 hover:bg-rose-50" title="Delete this batch" @click="deletingFile = file"><Trash2 class="h-3.5 w-3.5" /></button></div></td></tr>
              <tr v-if="!files.length"><td colspan="6" class="p-8 text-center text-slate-400">No imported CSV batches.</td></tr></tbody>
          </table>
        </div>
      </section>
      </template>
    </UploadSalesCsvModal>
  </main>
</template>

<style scoped>
.sales-report :deep(tbody tr:nth-child(even) > td),
.sales-report :deep(tbody tr:nth-child(even) > th) {
  background-color: #eff6ff;
}

.sales-report :deep(tbody tr:hover > td),
.sales-report :deep(tbody tr:hover > th) {
  background-color: #dbeafe;
}
</style>

<style scoped>
.sales-report :deep(tbody tr:nth-child(even) > td),
.sales-report :deep(tbody tr:nth-child(even) > th) {
  background-color: #eff6ff;
}

.sales-report :deep(tbody tr:hover > td),
.sales-report :deep(tbody tr:hover > th) {
  background-color: #dbeafe;
}
</style>

<style scoped>
.sales-report :deep(tbody tr:nth-child(even) > td),
.sales-report :deep(tbody tr:nth-child(even) > th) {
  background-color: #eff6ff;
}

.sales-report :deep(tbody tr:hover > td),
.sales-report :deep(tbody tr:hover > th) {
  background-color: #dbeafe;
}
</style>
