// Standardized Sales Analytics Data & Cross-Tabulation Calculators
// Accurately models the three core analytics reports provided by Birmas Management:
// 1. Daily Outlet Revenue Matrix (Reconciliation by Outlet & Channel/Payment Method)
// 2. Weekly Product Sales by Category, Brand/Detail & Outlet
// 3. Promo Sales Performance by Channel & Outlet

// Format Indonesian Rupiah
export function formatRupiah(val) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val || 0);
}

export function parseNumberClean(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/[^0-9.-]+/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// -------------------------------------------------------------
// 1. RAW REFERENCE BENCHMARK: Daily Sales Revenue Matrix (September 2026)
// -------------------------------------------------------------
export const SEPTEMBER_DAILY_MATRIX = [
  {
    date: '09/01/2026',
    outlets: {
      sudirman: { gofood: 414000, grabfood: 120000, grabmart: 0, shopeefood: 271000, qris: 2004000, transfer: 0, edc: 0, tunai: 1744000, total: 4553000 },
      kwitang: { gofood: 264000, grabfood: 160000, grabmart: 0, shopeefood: 254000, qris: 2359000, transfer: 0, tunai: 1758000, total: 4795000 },
      kuningan: { gofood: 70000, grabfood: 0, grabmart: 0, shopeefood: 670000, qris: 1349000, transfer: 0, tunai: 0, total: 2089000 },
      lebakBulus: { gofood: 485000, grabfood: 0, grabmart: 0, shopeefood: 894000, qris: 1111000, transfer: 0, tunai: 720000, total: 3210000 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 108000, grabfood: 204000, grabmart: 0, shopeefood: 500000, qris: 348000, transfer: 0, edc: 0, tunai: 0, total: 1160000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/02/2026',
    outlets: {
      sudirman: { gofood: 210000, grabfood: 86000, grabmart: 0, shopeefood: 463000, qris: 6163000, transfer: 0, edc: 0, tunai: 206000, total: 7128000 },
      kwitang: { gofood: 349000, grabfood: 284000, grabmart: 0, shopeefood: 356000, qris: 1315000, transfer: 0, tunai: 1524000, total: 3828000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 165000, qris: 1085000, transfer: 0, tunai: 0, total: 1250000 },
      lebakBulus: { gofood: 336000, grabfood: 0, grabmart: 320000, shopeefood: 1545000, qris: 1595000, transfer: 0, tunai: 792000, total: 4588000 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 48000, grabfood: 0, grabmart: 0, shopeefood: 1472000, qris: 225000, transfer: 0, edc: 0, tunai: 0, total: 1745000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/03/2026',
    outlets: {
      sudirman: { gofood: 990000, grabfood: 0, grabmart: 0, shopeefood: 1564000, qris: 3381000, transfer: 0, edc: 0, tunai: 38000, total: 5973000 },
      kwitang: { gofood: 457000, grabfood: 165000, grabmart: 75000, shopeefood: 590000, qris: 1871000, transfer: 0, tunai: 2990000, total: 6148000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 643000, qris: 2224000, transfer: 0, tunai: 0, total: 2867000 },
      lebakBulus: { gofood: 356000, grabfood: 0, grabmart: 109000, shopeefood: 2941000, qris: 1268000, transfer: 0, tunai: 314000, total: 4988000 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 100000, grabfood: 0, grabmart: 0, shopeefood: 1130000, qris: 774000, transfer: 0, edc: 0, tunai: 0, total: 2004000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/04/2026',
    outlets: {
      sudirman: { gofood: 311000, grabfood: 190000, grabmart: 0, shopeefood: 1981000, qris: 8318000, transfer: 0, edc: 0, tunai: 328000, total: 11128000 },
      kwitang: { gofood: 780000, grabfood: 1885000, grabmart: 0, shopeefood: 938000, qris: 2452000, transfer: 0, tunai: 2428000, total: 8483000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 1411000, qris: 2466000, transfer: 0, tunai: 0, total: 3877000 },
      lebakBulus: { gofood: 80000, grabfood: 0, grabmart: 438000, shopeefood: 3415000, qris: 2924000, transfer: 0, tunai: 528000, total: 7385000 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 20000, grabfood: 0, grabmart: 0, shopeefood: 1323000, qris: 216000, transfer: 0, edc: 0, tunai: 0, total: 1559000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/05/2026',
    outlets: {
      sudirman: { gofood: 278000, grabfood: 416000, grabmart: 492000, shopeefood: 3799000, qris: 5522000, transfer: 0, edc: 0, tunai: 584000, total: 11091000 },
      kwitang: { gofood: 1345000, grabfood: 829000, grabmart: 0, shopeefood: 1165000, qris: 2264000, transfer: 0, tunai: 4911000, total: 10514000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 1994000, qris: 1934000, transfer: 0, tunai: 0, total: 3928000 },
      lebakBulus: { gofood: 258000, grabfood: 0, grabmart: 1024000, shopeefood: 3820000, qris: 3460250, transfer: 0, tunai: 755000, total: 9317250 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 0, grabfood: 148000, grabmart: 0, shopeefood: 1742000, qris: 641000, transfer: 0, edc: 0, tunai: 0, total: 2531000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/06/2026',
    outlets: {
      sudirman: { gofood: 0, grabfood: 367000, grabmart: 126000, shopeefood: 1044000, qris: 1938000, transfer: 0, edc: 0, tunai: 94000, total: 3569000 },
      kwitang: { gofood: 26000, grabfood: 360000, grabmart: 0, shopeefood: 908000, qris: 1559000, transfer: 0, tunai: 1323000, total: 4176000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 708000, qris: 402000, transfer: 0, tunai: 0, total: 1110000 },
      lebakBulus: { gofood: 546000, grabfood: 0, grabmart: 198000, shopeefood: 2318000, qris: 1254000, transfer: 0, tunai: 1104000, total: 5420000 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 700000, grabfood: 68000, grabmart: 172000, shopeefood: 2243000, qris: 407000, transfer: 0, edc: 0, tunai: 0, total: 3590000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/07/2026',
    outlets: {
      sudirman: { gofood: 0, grabfood: 428000, grabmart: 0, shopeefood: 696000, qris: 1807000, transfer: 0, edc: 0, tunai: 106000, total: 3037000 },
      kwitang: { gofood: 160000, grabfood: 86000, grabmart: 194000, shopeefood: 0, qris: 607000, transfer: 0, tunai: 1391000, total: 2438000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 462000, qris: 1352000, transfer: 0, tunai: 0, total: 1814000 },
      lebakBulus: { gofood: 204000, grabfood: 0, grabmart: 0, shopeefood: 475000, qris: 0, transfer: 0, tunai: 300000, total: 979000 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 439000, grabfood: 0, grabmart: 0, shopeefood: 1399000, qris: 146000, transfer: 0, edc: 0, tunai: 0, total: 1984000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/08/2026',
    outlets: {
      sudirman: { gofood: 105000, grabfood: 92000, grabmart: 162000, shopeefood: 795000, qris: 3035000, transfer: 0, edc: 0, tunai: 0, total: 4189000 },
      kwitang: { gofood: 166000, grabfood: 279000, grabmart: 0, shopeefood: 368000, qris: 1121000, transfer: 72000, tunai: 1813000, total: 3819000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 908000, qris: 688000, transfer: 0, tunai: 0, total: 1596000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 84000, grabfood: 0, grabmart: 0, shopeefood: 1531000, qris: 723000, transfer: 0, edc: 0, tunai: 0, total: 2338000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/09/2026',
    outlets: {
      sudirman: { gofood: 204000, grabfood: 0, grabmart: 0, shopeefood: 512000, qris: 2517000, transfer: 0, edc: 0, tunai: 0, total: 3233000 },
      kwitang: { gofood: 940000, grabfood: 0, grabmart: 0, shopeefood: 144000, qris: 900000, transfer: 0, tunai: 2069000, total: 4053000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 750000, qris: 1614000, transfer: 1080000, tunai: 0, total: 3444000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 100000, grabfood: 150000, grabmart: 0, shopeefood: 1416000, qris: 473000, transfer: 0, edc: 0, tunai: 0, total: 2139000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/10/2026',
    outlets: {
      sudirman: { gofood: 0, grabfood: 0, grabmart: 92000, shopeefood: 2285000, qris: 2798000, transfer: 0, edc: 0, tunai: 0, total: 5175000 },
      kwitang: { gofood: 763000, grabfood: 68000, grabmart: 0, shopeefood: 93000, qris: 1443000, transfer: 0, tunai: 2531000, total: 4898000 },
      kuningan: { gofood: 140000, grabfood: 0, grabmart: 0, shopeefood: 323000, qris: 1666000, transfer: 796000, tunai: 0, total: 2925000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 536000, qris: 812000, transfer: 909000, edc: 0, tunai: 0, total: 2257000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/11/2026',
    outlets: {
      sudirman: { gofood: 245000, grabfood: 248000, grabmart: 120000, shopeefood: 2151000, qris: 6321000, transfer: 0, edc: 0, tunai: 477000, total: 9562000 },
      kwitang: { gofood: 423000, grabfood: 193000, grabmart: 92000, shopeefood: 809000, qris: 1456000, transfer: 0, tunai: 1420000, total: 4393000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 1343000, transfer: 1685000, tunai: 0, total: 3028000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 256000, grabfood: 0, grabmart: 0, shopeefood: 198000, qris: 665000, transfer: 151000, edc: 0, tunai: 0, total: 1270000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/12/2026',
    outlets: {
      sudirman: { gofood: 643000, grabfood: 0, grabmart: 72000, shopeefood: 746000, qris: 6358000, transfer: 0, edc: 0, tunai: 338000, total: 8157000 },
      kwitang: { gofood: 325000, grabfood: 326000, grabmart: 135000, shopeefood: 431000, qris: 2329000, transfer: 0, tunai: 2988000, total: 6534000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 1813000, transfer: 1429000, tunai: 0, total: 3242000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 100000, grabfood: 729000, grabmart: 39000, shopeefood: 3045000, qris: 713000, transfer: 0, edc: 110000, tunai: 67000, total: 4803000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/13/2026',
    outlets: {
      sudirman: { gofood: 98000, grabfood: 0, grabmart: 0, shopeefood: 867000, qris: 2400000, transfer: 0, edc: 0, tunai: 158000, total: 3523000 },
      kwitang: { gofood: 102000, grabfood: 234000, grabmart: 135000, shopeefood: 779000, qris: 1644000, transfer: 0, tunai: 1295000, total: 4189000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 216000, qris: 1107000, transfer: 1225000, tunai: 0, total: 2548000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 12000, grabfood: 220000, grabmart: 132000, shopeefood: 1926000, qris: 89000, transfer: 0, edc: 0, tunai: 0, total: 2379000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/14/2026',
    outlets: {
      sudirman: { gofood: 204000, grabfood: 360000, grabmart: 0, shopeefood: 1460000, qris: 2748000, transfer: 0, edc: 0, tunai: 17000, total: 4789000 },
      kwitang: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 163000, qris: 1695000, transfer: 0, tunai: 1458000, total: 3316000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 1439000, transfer: 1186000, tunai: 0, total: 2625000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 625000, transfer: 0, edc: 0, tunai: 0, total: 625000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/15/2026',
    outlets: {
      sudirman: { gofood: 1044000, grabfood: 587000, grabmart: 0, shopeefood: 1886000, qris: 2609000, transfer: 0, edc: 0, tunai: 182000, total: 6308000 },
      kwitang: { gofood: 0, grabfood: 0, grabmart: 88000, shopeefood: 75000, qris: 73000, transfer: 843000, tunai: 1378000, total: 2457000 },
      kuningan: { gofood: 0, grabfood: 53000, grabmart: 0, shopeefood: 286000, qris: 644000, transfer: 1127000, tunai: 0, total: 2110000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 494000, transfer: 170000, edc: 0, tunai: 0, total: 664000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/16/2026',
    outlets: {
      sudirman: { gofood: 160000, grabfood: 537000, grabmart: 33000, shopeefood: 1581000, qris: 2037000, transfer: 0, edc: 0, tunai: 322000, total: 4670000 },
      kwitang: { gofood: 632000, grabfood: 588000, grabmart: 0, shopeefood: 526000, qris: 629000, transfer: 0, tunai: 1397000, total: 3772000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 732000, transfer: 473000, tunai: 0, total: 1205000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 102000, grabfood: 0, grabmart: 0, shopeefood: 398000, qris: 62000, transfer: 0, edc: 0, tunai: 0, total: 562000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/17/2026',
    outlets: {
      sudirman: { gofood: 204000, grabfood: 120000, grabmart: 0, shopeefood: 1096000, qris: 3075000, transfer: 0, edc: 0, tunai: 0, total: 4495000 },
      kwitang: { gofood: 159000, grabfood: 345000, grabmart: 576000, shopeefood: 862000, qris: 1103000, transfer: 0, tunai: 1716000, total: 4761000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 489000, transfer: 462000, tunai: 0, total: 951000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 296000, grabfood: 0, grabmart: 0, shopeefood: 480000, qris: 912000, transfer: 0, edc: 0, tunai: 0, total: 1688000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/18/2026',
    outlets: {
      sudirman: { gofood: 66000, grabfood: 491000, grabmart: 0, shopeefood: 2404000, qris: 10090000, transfer: 0, edc: 0, tunai: 273000, total: 13324000 },
      kwitang: { gofood: 294000, grabfood: 487000, grabmart: 92000, shopeefood: 295000, qris: 2926000, transfer: 0, tunai: 2183000, total: 6277000 },
      kuningan: { gofood: 30000, grabfood: 0, grabmart: 0, shopeefood: 276000, qris: 1581000, transfer: 800000, tunai: 0, total: 2687000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 1859000, transfer: 116000, edc: 0, tunai: 0, total: 1975000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/19/2026',
    outlets: {
      sudirman: { gofood: 340000, grabfood: 607000, grabmart: 349000, shopeefood: 1327000, qris: 4705000, transfer: 0, edc: 2254000, tunai: 797000, total: 10379000 },
      kwitang: { gofood: 924000, grabfood: 375000, grabmart: 0, shopeefood: 1191000, qris: 1781000, transfer: 0, tunai: 3978000, total: 8249000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 432000, transfer: 1427000, tunai: 0, total: 1859000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 350000, grabfood: 92000, grabmart: 66000, shopeefood: 1156000, qris: 28000, transfer: 0, edc: 0, tunai: 0, total: 1692000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/20/2026',
    outlets: {
      sudirman: { gofood: 332000, grabfood: 0, grabmart: 0, shopeefood: 1644000, qris: 5244000, transfer: 0, edc: 0, tunai: 1121000, total: 8341000 },
      kwitang: { gofood: 364000, grabfood: 208000, grabmart: 0, shopeefood: 178000, qris: 126000, transfer: 0, tunai: 1524000, total: 2400000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 1303000, transfer: 198000, tunai: 0, total: 1501000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 144000, grabfood: 102000, grabmart: 0, shopeefood: 1495000, qris: 84000, transfer: 0, edc: 0, tunai: 0, total: 1825000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/21/2026',
    outlets: {
      sudirman: { gofood: 0, grabfood: 465000, grabmart: 0, shopeefood: 299000, qris: 1820000, transfer: 0, edc: 0, tunai: 348000, total: 2932000 },
      kwitang: { gofood: 297000, grabfood: 153000, grabmart: 0, shopeefood: 457000, qris: 1403000, transfer: 0, tunai: 3162000, total: 5472000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 810000, transfer: 1139000, tunai: 0, total: 1949000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 301000, transfer: 0, edc: 0, tunai: 0, total: 301000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/22/2026',
    outlets: {
      sudirman: { gofood: 0, grabfood: 166000, grabmart: 0, shopeefood: 834000, qris: 1932000, transfer: 286000, edc: 0, tunai: 102000, total: 3320000 },
      kwitang: { gofood: 104000, grabfood: 406000, grabmart: 0, shopeefood: 417000, qris: 1115000, transfer: 0, tunai: 1751000, total: 3793000 },
      kuningan: { gofood: 0, grabfood: 291000, grabmart: 0, shopeefood: 0, qris: 682000, transfer: 1505000, tunai: 0, total: 2478000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 1130000, transfer: 243000, edc: 0, tunai: 0, total: 1373000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/23/2026',
    outlets: {
      sudirman: { gofood: 0, grabfood: 330000, grabmart: 310000, shopeefood: 999000, qris: 2270000, transfer: 0, edc: 0, tunai: 364000, total: 4273000 },
      kwitang: { gofood: 213000, grabfood: 102000, grabmart: 360000, shopeefood: 323000, qris: 1390000, transfer: 0, tunai: 352000, total: 2740000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 437000, transfer: 1281000, tunai: 0, total: 1718000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 524000, transfer: 809000, edc: 0, tunai: 733000, total: 2066000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/24/2026',
    outlets: {
      sudirman: { gofood: 0, grabfood: 99000, grabmart: 0, shopeefood: 848000, qris: 2610000, transfer: 0, edc: 3594000, tunai: 231000, total: 7382000 },
      kwitang: { gofood: 796000, grabfood: 764000, grabmart: 0, shopeefood: 129000, qris: 2739000, transfer: 0, tunai: 2779000, total: 7207000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 605000, transfer: 941000, tunai: 0, total: 1546000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 199000, grabfood: 0, grabmart: 0, shopeefood: 125000, qris: 969000, transfer: 75000, edc: 0, tunai: 0, total: 1368000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/25/2026',
    outlets: {
      sudirman: { gofood: 204000, grabfood: 308000, grabmart: 0, shopeefood: 1845000, qris: 10707000, transfer: 0, edc: 0, tunai: 226000, total: 13290000 },
      kwitang: { gofood: 192000, grabfood: 0, grabmart: 0, shopeefood: 1160000, qris: 1617000, transfer: 0, tunai: 994000, total: 3963000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 1712000, transfer: 3671000, tunai: 0, total: 5383000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 812000, grabfood: 0, grabmart: 0, shopeefood: 1307000, qris: 0, transfer: 675000, edc: 0, tunai: 0, total: 2794000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/26/2026',
    outlets: {
      sudirman: { gofood: 261000, grabfood: 602000, grabmart: 0, shopeefood: 675000, qris: 7641000, transfer: 0, edc: 0, tunai: 306000, total: 9485000 },
      kwitang: { gofood: 110000, grabfood: 236000, grabmart: 46000, shopeefood: 1060000, qris: 2330000, transfer: 0, tunai: 1555000, total: 5337000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 3013000, transfer: 1628000, tunai: 0, total: 4641000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 33000, qris: 622000, transfer: 0, edc: 0, tunai: 0, total: 655000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/27/2026',
    outlets: {
      sudirman: { gofood: 429000, grabfood: 160000, grabmart: 500000, shopeefood: 643000, qris: 3736000, transfer: 0, edc: 0, tunai: 179000, total: 5647000 },
      kwitang: { gofood: 1756000, grabfood: 0, grabmart: 0, shopeefood: 512000, qris: 2618000, transfer: 0, tunai: 1846000, total: 6732000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 64000, qris: 1190000, transfer: 1198000, tunai: 0, total: 2452000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 1182000, transfer: 33000, edc: 0, tunai: 0, total: 1215000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/28/2026',
    outlets: {
      sudirman: { gofood: 102000, grabfood: 144000, grabmart: 74000, shopeefood: 1332000, qris: 1517000, transfer: 0, edc: 0, tunai: 399000, total: 3568000 },
      kwitang: { gofood: 106000, grabfood: 265000, grabmart: 39000, shopeefood: 526000, qris: 1225000, transfer: 110000, tunai: 538000, total: 2809000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 509000, transfer: 1206000, tunai: 0, total: 1715000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 10000, grabfood: 212000, grabmart: 0, shopeefood: 719000, qris: 58000, transfer: 0, edc: 0, tunai: 0, total: 999000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/29/2026',
    outlets: {
      sudirman: { gofood: 0, grabfood: 120000, grabmart: 0, shopeefood: 540000, qris: 2710000, transfer: 0, edc: 63000, tunai: 537000, total: 3970000 },
      kwitang: { gofood: 236000, grabfood: 238000, grabmart: 0, shopeefood: 901000, qris: 1297000, transfer: 85000, tunai: 2078000, total: 4835000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 174000, transfer: 2408000, tunai: 0, total: 2582000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 1888000, transfer: 0, edc: 0, tunai: 0, total: 1888000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  },
  {
    date: '09/30/2026',
    outlets: {
      sudirman: { gofood: 162000, grabfood: 345000, grabmart: 0, shopeefood: 1179000, qris: 4112000, transfer: 0, edc: 0, tunai: 14000, total: 5812000 },
      kwitang: { gofood: 883000, grabfood: 0, grabmart: 0, shopeefood: 226000, qris: 1096000, transfer: 0, tunai: 1233000, total: 3438000 },
      kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 1793000, transfer: 1346000, tunai: 0, total: 3139000 },
      lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
      nomadic: { gofood: 102000, grabfood: 0, grabmart: 0, shopeefood: 252000, qris: 0, transfer: 0, edc: 0, tunai: 0, total: 354000 },
      nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
    }
  }
];

export const SEPTEMBER_MATRIX_TOTALS = {
  sudirman: { gofood: 7006000, grabfood: 7388000, grabmart: 2330000, shopeefood: 37766000, qris: 122125000, transfer: 286000, edc: 5911000, tunai: 9491000, total: 192303000 },
  kwitang: { gofood: 13166000, grabfood: 9124000, grabmart: 1819000, shopeefood: 15834000, qris: 47253000, transfer: 267000, tunai: 58363000, total: 145826000 },
  kuningan: { gofood: 584000, grabfood: 0, grabmart: 1915000, shopeefood: 32049000, qris: 39711000, transfer: 0, tunai: 0, total: 74259000 },
  lebakBulus: { gofood: 2265000, grabfood: 0, grabmart: 2089000, shopeefood: 15408000, qris: 11612250, transfer: 0, tunai: 4513000, total: 35887250 },
  kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
  nomadic: { gofood: 3982000, grabfood: 1777000, grabmart: 1929000, shopeefood: 35037000, qris: 7493000, transfer: 675000, edc: 843000, tunai: 67000, total: 51803000 },
  nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
};

// -------------------------------------------------------------
// 2. RAW REFERENCE BENCHMARK: Weekly Product Sales by Category & Brand/Detail (May 2026)
// -------------------------------------------------------------
export const WEEKLY_CATEGORY_MATRIX = [
  // Anggur
  { category: 'Anggur', detail: 'ANGGUR MERAH 275ML', kwitang: [3, 0, 1, 1, 5], sudirman: [2, 2, 1, 2, 7], kuningan: [7, 1, 0, 2, 10], nomadic: [4, 1, 6, 2, 13], bali: [0, 0, 0, 0, 0], lebakBulus: [5, 2, 2, 2, 11] },
  { category: 'Anggur', detail: 'ANGGUR MERAH 620ML', kwitang: [16, 7, 2, 7, 32], sudirman: [4, 10, 5, 4, 23], kuningan: [4, 8, 3, 4, 19], nomadic: [3, 2, 2, 3, 10], bali: [0, 0, 0, 0, 0], lebakBulus: [9, 0, 12, 8, 29] },
  { category: 'Anggur', detail: 'ANGGUR MERAH GOLD 275ML', kwitang: [2, 4, 7, 3, 16], sudirman: [3, 3, 1, 2, 9], kuningan: [4, 5, 3, 1, 13], nomadic: [1, 3, 4, 2, 10], bali: [0, 0, 0, 0, 0], lebakBulus: [10, 1, 6, 8, 25] },
  { category: 'Anggur', detail: 'ANGGUR MERAH GOLD 620ML', kwitang: [34, 27, 25, 39, 125], sudirman: [18, 10, 12, 6, 46], kuningan: [9, 8, 4, 6, 27], nomadic: [1, 3, 1, 1, 6], bali: [0, 0, 0, 0, 0], lebakBulus: [10, 18, 7, 22, 57] },
  { category: 'Anggur', detail: 'ANGGUR PUTIH 620ML', kwitang: [6, 7, 1, 5, 19], sudirman: [6, 8, 12, 8, 34], kuningan: [11, 4, 6, 11, 32], nomadic: [3, 0, 0, 2, 5], bali: [0, 0, 0, 0, 0], lebakBulus: [11, 0, 6, 7, 24] },
  { category: 'Anggur', detail: 'AO', kwitang: [67, 35, 32, 42, 176], sudirman: [0, 0, 2, 1, 3], kuningan: [0, 0, 0, 0, 0], nomadic: [2, 1, 3, 1, 7], bali: [0, 0, 0, 0, 0], lebakBulus: [4, 2, 1, 4, 11] },
  { category: 'Anggur', detail: 'INTISARI', kwitang: [81, 57, 64, 58, 260], sudirman: [54, 33, 16, 31, 134], kuningan: [15, 20, 18, 17, 70], nomadic: [0, 0, 0, 0, 0], bali: [0, 0, 0, 0, 0], lebakBulus: [26, 24, 14, 23, 87] },
  { category: 'Anggur', detail: 'INTISARI HIJAU', kwitang: [3, 1, 2, 6, 12], sudirman: [9, 6, 2, 1, 18], kuningan: [7, 4, 5, 1, 17], nomadic: [3, 0, 1, 1, 5], bali: [0, 0, 0, 0, 0], lebakBulus: [2, 5, 6, 6, 19] },
  { category: 'Anggur', detail: 'INTISARI BLACK CURRANT', kwitang: [9, 12, 7, 13, 41], sudirman: [9, 11, 16, 8, 44], kuningan: [21, 10, 11, 18, 60], nomadic: [5, 2, 16, 3, 26], bali: [0, 0, 0, 0, 0], lebakBulus: [13, 9, 15, 9, 46] },
  { category: 'Anggur', detail: 'API BLACK CURRANT', kwitang: [0, 0, 1, 1, 2], sudirman: [0, 15, 1, 0, 16], kuningan: [0, 17, 8, 1, 26], nomadic: [0, 0, 0, 0, 0], bali: [0, 0, 0, 0, 0], lebakBulus: [0, 1, 1, 0, 2] },
  { category: 'Anggur', detail: 'API HIJAU', kwitang: [12, 8, 9, 8, 37], sudirman: [20, 8, 2, 8, 38], kuningan: [13, 13, 0, 11, 37], nomadic: [4, 5, 2, 1, 12], bali: [0, 0, 0, 0, 0], lebakBulus: [16, 10, 11, 14, 51] },
  { category: 'Anggur', detail: 'API PUTIH', kwitang: [1, 7, 0, 0, 8], sudirman: [6, 1, 9, 8, 24], kuningan: [3, 14, 0, 7, 24], nomadic: [5, 1, 1, 1, 8], bali: [0, 0, 0, 0, 0], lebakBulus: [6, 7, 1, 11, 25] },
  { category: 'Anggur', detail: 'ATLAS ROSE PINK', kwitang: [4, 0, 1, 3, 8], sudirman: [9, 11, 6, 3, 29], kuningan: [0, 5, 2, 5, 12], nomadic: [0, 0, 3, 1, 4], bali: [0, 0, 0, 0, 0], lebakBulus: [2, 1, 1, 0, 4] },
  { category: 'Anggur', detail: 'ATLAS LYCHEE', kwitang: [18, 12, 16, 9, 55], sudirman: [23, 21, 20, 21, 85], kuningan: [22, 16, 5, 8, 51], nomadic: [2, 3, 5, 3, 13], bali: [0, 0, 0, 0, 0], lebakBulus: [13, 14, 15, 12, 54] },
  { category: 'Anggur', detail: 'ATLAS PEACH', kwitang: [0, 2, 3, 0, 5], sudirman: [13, 7, 4, 3, 27], kuningan: [1, 1, 2, 1, 5], nomadic: [0, 0, 0, 0, 0], bali: [0, 0, 0, 0, 0], lebakBulus: [0, 2, 2, 4, 8] },
  { category: 'Anggur', detail: 'KAWA KAWA MERAH', kwitang: [9, 9, 2, 1, 21], sudirman: [1, 2, 2, 1, 6], kuningan: [0, 0, 1, 1, 2], nomadic: [6, 0, 2, 2, 10], bali: [0, 0, 0, 0, 0], lebakBulus: [2, 3, 3, 4, 12] },
  { category: 'Anggur', detail: 'KAWA KAWA HIJAU', kwitang: [18, 10, 13, 14, 55], sudirman: [14, 3, 10, 9, 36], kuningan: [9, 3, 9, 7, 28], nomadic: [6, 0, 1, 4, 11], bali: [0, 0, 0, 0, 0], lebakBulus: [10, 4, 8, 10, 32] },
  { category: 'Anggur', detail: 'KAWA KAWA BLACK CURRANT', kwitang: [14, 9, 6, 9, 38], sudirman: [16, 6, 1, 7, 30], kuningan: [12, 14, 11, 6, 43], nomadic: [9, 6, 1, 5, 21], bali: [0, 0, 0, 0, 0], lebakBulus: [14, 6, 14, 7, 41] },
  // Beer
  { category: 'Beer', detail: 'ASAHI', kwitang: [6, 0, 0, 1, 7], sudirman: [1, 3, 2, 3, 9], kuningan: [0, 2, 1, 1, 4], nomadic: [0, 0, 0, 0, 0], bali: [0, 0, 0, 0, 0], lebakBulus: [7, 0, 4, 6, 17] },
  { category: 'Beer', detail: 'CORONA EXTRA', kwitang: [4, 2, 0, 3, 9], sudirman: [15, 2, 7, 6, 30], kuningan: [1, 2, 2, 2, 7], nomadic: [1, 4, 2, 1, 8], bali: [0, 0, 0, 0, 0], lebakBulus: [6, 6, 4, 1, 17] },
  { category: 'Beer', detail: 'BINTANG 320ML', kwitang: [5, 10, 9, 7, 31], sudirman: [20, 8, 9, 7, 44], kuningan: [13, 18, 2, 3, 36], nomadic: [1, 0, 6, 1, 8], bali: [0, 0, 0, 0, 0], lebakBulus: [34, 39, 15, 45, 133] },
  { category: 'Beer', detail: 'BINTANG 500ML', kwitang: [18, 22, 17, 18, 75], sudirman: [30, 13, 24, 8, 75], kuningan: [8, 9, 11, 8, 36], nomadic: [7, 0, 9, 7, 23], bali: [5, 2, 4, 2, 13], lebakBulus: [35, 51, 24, 47, 157] },
  { category: 'Beer', detail: 'BINTANG BOTOL 620ML', kwitang: [29, 14, 9, 34, 86], sudirman: [15, 9, 14, 31, 69], kuningan: [27, 17, 14, 5, 63], nomadic: [6, 1, 4, 3, 14], bali: [2, 0, 5, 1, 8], lebakBulus: [33, 29, 27, 23, 112] },
  { category: 'Beer', detail: 'BINTANG RADLER LEMON 330ML', kwitang: [17, 23, 8, 16, 64], sudirman: [35, 35, 22, 28, 120], kuningan: [16, 19, 22, 19, 76], nomadic: [13, 11, 0, 0, 24], bali: [4, 0, 0, 1, 5], lebakBulus: [32, 33, 23, 37, 125] },
  { category: 'Beer', detail: 'GUINNESS STOUT 320ML', kwitang: [1, 4, 2, 6, 13], sudirman: [3, 2, 4, 1, 10], kuningan: [0, 0, 0, 0, 0], nomadic: [0, 0, 0, 0, 0], bali: [0, 0, 0, 0, 0], lebakBulus: [2, 9, 5, 5, 21] },
  { category: 'Beer', detail: 'GUINNESS DRAUGH IN CAN 440ML', kwitang: [2, 1, 2, 4, 9], sudirman: [6, 6, 1, 2, 15], kuningan: [11, 3, 2, 2, 18], nomadic: [0, 0, 0, 0, 0], bali: [0, 0, 0, 0, 0], lebakBulus: [2, 10, 4, 1, 17] },
  { category: 'Beer', detail: 'GUINNESS STOUT 620ML', kwitang: [10, 19, 10, 25, 64], sudirman: [21, 12, 7, 22, 62], kuningan: [17, 8, 8, 18, 51], nomadic: [2, 0, 0, 1, 3], bali: [0, 0, 0, 0, 0], lebakBulus: [11, 6, 10, 14, 41] },
  { category: 'Beer', detail: 'HEINEKEN 330ML', kwitang: [13, 11, 1, 1, 26], sudirman: [7, 4, 1, 5, 17], kuningan: [3, 3, 3, 4, 13], nomadic: [4, 4, 3, 1, 12], bali: [0, 0, 0, 0, 0], lebakBulus: [15, 12, 6, 5, 38] },
  { category: 'Beer', detail: 'SINGARAJA 620ML', kwitang: [55, 33, 24, 36, 148], sudirman: [35, 29, 16, 32, 112], kuningan: [80, 87, 47, 53, 267], nomadic: [80, 42, 29, 38, 189], bali: [0, 0, 0, 0, 0], lebakBulus: [87, 55, 31, 71, 244] },
  // Craft Beer
  { category: 'Craft Beer', detail: 'BEACHES CERVEZA', kwitang: [1, 0, 0, 0, 1], sudirman: [0, 0, 1, 4, 5], kuningan: [0, 0, 0, 0, 0], nomadic: [0, 0, 0, 0, 0], bali: [0, 0, 0, 0, 0], lebakBulus: [7, 0, 0, 12, 19] },
  { category: 'Craft Beer', detail: 'KURA KURA ISLAND ALE', kwitang: [0, 6, 0, 0, 6], sudirman: [3, 1, 0, 1, 5], kuningan: [0, 8, 3, 1, 12], nomadic: [4, 0, 0, 0, 4], bali: [0, 1, 6, 6, 13], lebakBulus: [0, 1, 5, 1, 7] },
  { category: 'Craft Beer', detail: 'KURA KURA LAGER', kwitang: [0, 5, 0, 0, 5], sudirman: [3, 0, 0, 0, 3], kuningan: [1, 1, 0, 0, 2], nomadic: [0, 0, 0, 0, 0], bali: [0, 0, 0, 0, 0], lebakBulus: [2, 1, 0, 1, 4] },
  { category: 'Craft Beer', detail: 'KURA KURA EASY ALE', kwitang: [0, 4, 0, 0, 4], sudirman: [2, 5, 0, 4, 11], kuningan: [0, 2, 0, 0, 2], nomadic: [0, 0, 0, 0, 0], bali: [0, 0, 0, 0, 0], lebakBulus: [3, 2, 3, 2, 10] },
  { category: 'Craft Beer', detail: 'KURA KURA SESSION HAZY', kwitang: [0, 0, 0, 0, 0], sudirman: [4, 5, 0, 4, 13], kuningan: [0, 1, 0, 0, 1], nomadic: [1, 0, 0, 0, 1], bali: [3, 3, 4, 0, 10], lebakBulus: [1, 4, 4, 2, 11] },
  { category: 'Craft Beer', detail: 'KURA KURA IPA', kwitang: [0, 0, 0, 0, 0], sudirman: [4, 4, 1, 7, 16], kuningan: [1, 0, 0, 0, 1], nomadic: [0, 0, 0, 2, 2], bali: [0, 0, 0, 0, 0], lebakBulus: [2, 2, 1, 0, 5] },
  // Fizzy
  { category: 'Fizzy', detail: 'ICELAND MIX BERRY LEMONADE', kwitang: [3, 1, 0, 0, 4], sudirman: [5, 2, 4, 3, 14], kuningan: [2, 1, 2, 2, 7], nomadic: [0, 0, 3, 0, 3], bali: [0, 0, 0, 0, 0], lebakBulus: [7, 5, 5, 4, 21] },
  { category: 'Fizzy', detail: 'ICELAND MIX BLUE LAGOON', kwitang: [7, 2, 0, 2, 11], sudirman: [5, 2, 10, 3, 20], kuningan: [2, 1, 1, 3, 7], nomadic: [0, 0, 6, 2, 8], bali: [0, 0, 0, 0, 0], lebakBulus: [2, 5, 1, 7, 15] },
  { category: 'Fizzy', detail: 'ICELAND MIX LYCHEE MARTINI', kwitang: [5, 5, 0, 0, 10], sudirman: [13, 10, 7, 7, 37], kuningan: [3, 7, 0, 3, 13], nomadic: [0, 1, 4, 4, 9], bali: [0, 0, 0, 0, 0], lebakBulus: [2, 8, 4, 4, 18] },
  // Liquor
  { category: 'Liquor', detail: 'CAPTAIN MORGAN GOLD', kwitang: [0, 3, 0, 2, 5], sudirman: [0, 1, 0, 2, 3], kuningan: [2, 0, 0, 0, 2], nomadic: [2, 0, 1, 0, 3], bali: [0, 0, 0, 0, 0], lebakBulus: [2, 4, 2, 1, 9] },
  { category: 'Liquor', detail: 'DRUM BLACK', kwitang: [6, 1, 1, 5, 13], sudirman: [6, 2, 2, 3, 13], kuningan: [1, 2, 1, 1, 5], nomadic: [0, 0, 1, 2, 3], bali: [0, 0, 0, 0, 0], lebakBulus: [5, 2, 0, 6, 13] },
  { category: 'Liquor', detail: 'ICELAND VODKA 250ML', kwitang: [11, 5, 6, 5, 27], sudirman: [4, 2, 2, 5, 13], kuningan: [5, 3, 1, 1, 10], nomadic: [0, 0, 0, 2, 2], bali: [0, 0, 0, 0, 0], lebakBulus: [6, 2, 4, 2, 14] },
  { category: 'Liquor', detail: 'ICELAND VODKA 700ML', kwitang: [6, 5, 0, 6, 17], sudirman: [2, 3, 4, 5, 14], kuningan: [3, 0, 0, 3, 6], nomadic: [0, 0, 1, 1, 2], bali: [0, 0, 0, 0, 0], lebakBulus: [2, 1, 0, 1, 4] },
  { category: 'Liquor', detail: 'FRIENDSHIP BLACK TEA 650ML', kwitang: [0, 0, 3, 0, 3], sudirman: [20, 6, 25, 17, 68], kuningan: [12, 10, 11, 4, 37], nomadic: [0, 0, 0, 0, 0], bali: [0, 0, 0, 0, 0], lebakBulus: [2, 4, 3, 3, 12] },
  // Soju
  { category: 'Soju', detail: 'WIJA LYCHEE', kwitang: [1, 0, 1, 0, 2], sudirman: [11, 20, 2, 9, 42], kuningan: [1, 2, 0, 2, 5], nomadic: [4, 0, 0, 2, 6], bali: [0, 0, 0, 0, 0], lebakBulus: [1, 6, 1, 0, 8] },
  { category: 'Soju', detail: 'CHAM JOEUN LYCHEE', kwitang: [7, 0, 0, 0, 7], sudirman: [12, 0, 3, 2, 17], kuningan: [0, 5, 1, 3, 9], nomadic: [0, 0, 0, 0, 0], bali: [0, 0, 0, 0, 0], lebakBulus: [0, 3, 2, 10, 15] },
  // Mixer
  { category: 'Mixer', detail: 'COCA COLA KALENG', kwitang: [0, 5, 1, 4, 10], sudirman: [18, 9, 6, 14, 47], kuningan: [10, 11, 5, 5, 31], nomadic: [0, 0, 0, 0, 0], bali: [0, 0, 0, 0, 0], lebakBulus: [5, 2, 2, 1, 10] },
  { category: 'Mixer', detail: 'SCHWEPPES TONIC WATER', kwitang: [8, 0, 2, 0, 10], sudirman: [24, 15, 3, 39, 81], kuningan: [15, 3, 6, 6, 30], nomadic: [10, 9, 0, 10, 29], bali: [0, 0, 0, 0, 0], lebakBulus: [6, 3, 1, 5, 15] },
  // Lain Lain
  { category: 'Lain Lain', detail: 'CRYSTALLINE', kwitang: [0, 4, 6, 0, 10], sudirman: [36, 34, 10, 25, 105], kuningan: [35, 14, 4, 6, 59], nomadic: [2, 1, 0, 3, 6], bali: [0, 0, 0, 0, 0], lebakBulus: [1, 3, 1, 4, 9] },
  { category: 'Lain Lain', detail: 'GELAS CUP', kwitang: [19, 5, 7, 11, 42], sudirman: [154, 96, 56, 122, 428], kuningan: [97, 70, 0, 30, 197], nomadic: [21, 1, 18, 25, 65], bali: [0, 0, 0, 0, 0], lebakBulus: [8, 6, 14, 21, 49] },
];

export const WEEKLY_MATRIX_TOTALS = {
  kwitang: [578, 426, 316, 429, 1749],
  sudirman: [833, 574, 446, 648, 2501],
  kuningan: [581, 524, 264, 365, 1734],
  nomadic: [245, 115, 142, 157, 659],
  bali: [16, 7, 19, 12, 54],
  lebakBulus: [554, 487, 356, 544, 1941],
  overallGrandTotal: 8638
};

// -------------------------------------------------------------
// 3. RAW REFERENCE BENCHMARK: Promo Sales Performance (May - Oct 2026)
// -------------------------------------------------------------
export const PROMO_CAMPAIGN_RECORDS = [
  { month: 'May 2026', fromDate: '05/11/2026', toDate: '05/17/2026', outlet: 'LEBAK BULUS', promo: 'PROMO HEMAT BINTANG BOTOL', gofood: 3, grabfood: 0, grabmart: 0, shopeefood: 0, dineIn: 3, takeAway: 0, waOrder: 0, grandTotal: 6 },
  { month: 'May 2026', fromDate: '05/11/2026', toDate: '05/17/2026', outlet: 'LEBAK BULUS', promo: 'PROMO HEMAT BINTANG KALENG', gofood: 2, grabfood: 0, grabmart: 0, shopeefood: 0, dineIn: 3, takeAway: 0, waOrder: 0, grandTotal: 5 },
  { month: 'May 2026', fromDate: '05/11/2026', toDate: '05/17/2026', outlet: 'LEBAK BULUS', promo: 'PROMO HEMAT WIJA BELI3 GRATIS1', gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, dineIn: 1, takeAway: 0, waOrder: 0, grandTotal: 1 },
  { month: 'May 2026', fromDate: '05/11/2026', toDate: '05/17/2026', outlet: 'LEBAK BULUS', promo: 'PROMO SINGARAJA 3 BOTOL', gofood: 3, grabfood: 0, grabmart: 0, shopeefood: 4, dineIn: 2, takeAway: 0, waOrder: 0, grandTotal: 9 },
  { month: 'May 2026', fromDate: '05/11/2026', toDate: '05/17/2026', outlet: 'LEBAK BULUS', promo: 'PROMO ROYAL BLACK POKKA530', gofood: 1, grabfood: 0, grabmart: 0, shopeefood: 0, dineIn: 0, takeAway: 0, waOrder: 0, grandTotal: 1 },
  { month: 'May 2026', fromDate: '05/25/2026', toDate: '05/31/2026', outlet: 'LEBAK BULUS', promo: 'PROMO SINGARAJA 3 BOTOL', gofood: 5, grabfood: 0, grabmart: 0, shopeefood: 4, dineIn: 9, takeAway: 0, waOrder: 0, grandTotal: 18 },
  { month: 'May 2026', fromDate: '05/01/2026', toDate: '05/03/2026', outlet: 'SUDIRMAN', promo: 'PROMO HEMAT ALBENS', gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 1, dineIn: 0, takeAway: 0, waOrder: 0, grandTotal: 1 },
  { month: 'May 2026', fromDate: '05/01/2026', toDate: '05/03/2026', outlet: 'KUNINGAN', promo: 'PROMO SINGARAJA 3 BOTOL', gofood: 0, grabfood: 0, grabmart: 1, shopeefood: 2, dineIn: 1, takeAway: 0, waOrder: 0, grandTotal: 4 },
  { month: 'May 2026', fromDate: '05/01/2026', toDate: '05/03/2026', outlet: 'KWITANG', promo: 'PROMO HEMAT BINTANG BOTOL', gofood: 0, grabfood: 1, grabmart: 0, shopeefood: 0, dineIn: 2, takeAway: 0, waOrder: 0, grandTotal: 3 },
  { month: 'May 2026', fromDate: '05/01/2026', toDate: '05/03/2026', outlet: 'KWITANG', promo: 'PROMO SINGARAJA 3 BOTOL', gofood: 1, grabfood: 1, grabmart: 0, shopeefood: 0, dineIn: 3, takeAway: 0, waOrder: 0, grandTotal: 5 },
  { month: 'May 2026', fromDate: '05/04/2026', toDate: '05/10/2026', outlet: 'NOMADIC', promo: 'PROMO BDG SINGARAJA', gofood: 3, grabfood: 0, grabmart: 0, shopeefood: 13, dineIn: 0, takeAway: 0, waOrder: 0, grandTotal: 16 },
  { month: 'June 2026', fromDate: '06/01/2026', toDate: '06/07/2026', outlet: 'KUNINGAN', promo: 'PROMO SINGARAJA 3 BOTOL', gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 12, dineIn: 0, takeAway: 0, waOrder: 0, grandTotal: 12 },
  { month: 'June 2026', fromDate: '06/01/2026', toDate: '06/07/2026', outlet: 'KWITANG', promo: 'PROMO SINGARAJA 3 BOTOL', gofood: 4, grabfood: 1, grabmart: 0, shopeefood: 0, dineIn: 7, takeAway: 0, waOrder: 0, grandTotal: 12 },
  { month: 'June 2026', fromDate: '06/01/2026', toDate: '06/07/2026', outlet: 'NOMADIC', promo: 'PROMO BDG SINGARAJA', gofood: 7, grabfood: 0, grabmart: 0, shopeefood: 18, dineIn: 0, takeAway: 0, waOrder: 2, grandTotal: 27 },
  { month: 'June 2026', fromDate: '06/08/2026', toDate: '06/14/2026', outlet: 'KUNINGAN', promo: 'PROMO SINGARAJA 3 BOTOL', gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 15, dineIn: 0, takeAway: 0, waOrder: 0, grandTotal: 15 },
  { month: 'June 2026', fromDate: '06/08/2026', toDate: '06/14/2026', outlet: 'NOMADIC', promo: 'PROMO BDG SINGARAJA', gofood: 9, grabfood: 0, grabmart: 0, shopeefood: 17, dineIn: 0, takeAway: 0, waOrder: 0, grandTotal: 26 },
  { month: 'July 2026', fromDate: '07/13/2026', toDate: '07/19/2026', outlet: 'KUNINGAN', promo: 'PROMO SINGARAJA 3 BOTOL', gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 17, dineIn: 10, takeAway: 0, waOrder: 0, grandTotal: 27 },
  { month: 'July 2026', fromDate: '07/20/2026', toDate: '07/26/2026', outlet: 'SUDIRMAN', promo: 'PROMO SINGARAJA 3 BOTOL', gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, dineIn: 24, takeAway: 0, waOrder: 0, grandTotal: 24 },
  { month: 'August 2026', fromDate: '08/01/2026', toDate: '08/09/2026', outlet: 'LEBAK BULUS', promo: 'PROMO SINGARAJA 3 BOTOL', gofood: 1, grabfood: 0, grabmart: 5, shopeefood: 12, dineIn: 0, takeAway: 7, waOrder: 0, grandTotal: 25 },
  { month: 'August 2026', fromDate: '08/01/2026', toDate: '08/09/2026', outlet: 'NOMADIC', promo: 'PROMO BDG SINGARAJA', gofood: 1, grabfood: 0, grabmart: 0, shopeefood: 19, dineIn: 1, takeAway: 0, waOrder: 0, grandTotal: 21 },
  { month: 'September 2026', fromDate: '09/01/2026', toDate: '09/06/2026', outlet: 'LEBAK BULUS', promo: 'PROMO SINGARAJA 3 BOTOL', gofood: 0, grabfood: 0, grabmart: 1, shopeefood: 2, dineIn: 0, takeAway: 21, waOrder: 0, grandTotal: 24 },
  { month: 'September 2026', fromDate: '09/21/2026', toDate: '09/27/2026', outlet: 'SUDIRMAN', promo: 'PROMO SINGARAJA 3 BOTOL', gofood: 0, grabfood: 0, grabmart: 3, shopeefood: 0, dineIn: 0, takeAway: 17, waOrder: 0, grandTotal: 20 },
  { month: 'October 2026', fromDate: '10/01/2026', toDate: '10/04/2026', outlet: 'SUDIRMAN', promo: 'PROMO SINGARAJA 3 BOTOL', gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, dineIn: 0, takeAway: 17, waOrder: 0, grandTotal: 17 },
  { month: 'October 2026', fromDate: '10/01/2026', toDate: '10/04/2026', outlet: 'KWITANG', promo: 'PROMO SINGARAJA 3 BOTOL', gofood: 1, grabfood: 0, grabmart: 0, shopeefood: 0, dineIn: 0, takeAway: 9, waOrder: 0, grandTotal: 10 },
  { month: 'October 2026', fromDate: '10/01/2026', toDate: '10/04/2026', outlet: 'KUNINGAN', promo: 'PROMO SINGARAJA 3 BOTOL', gofood: 1, grabfood: 0, grabmart: 0, shopeefood: 3, dineIn: 5, takeAway: 0, waOrder: 0, grandTotal: 9 }
];

// -------------------------------------------------------------
// DYNAMIC AGGREGATION: Computes Live Cross-Tabulation from any Uploaded CSV
// -------------------------------------------------------------

/**
 * Computes Daily Revenue Matrix across Outlets and Payment Channels from CSV transactions
 */
export function computeDailyOutletMatrixFromTransactions(transactions = []) {
  if (!transactions || transactions.length === 0) {
    return { matrix: SEPTEMBER_DAILY_MATRIX, totals: SEPTEMBER_MATRIX_TOTALS, isBenchmark: true };
  }

  const dateMap = new Map();
  const totals = {
    sudirman: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, edc: 0, tunai: 0, total: 0 },
    kwitang: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
    kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
    lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
    kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
    nomadic: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, edc: 0, tunai: 0, total: 0 },
    nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
  };

  const getOutletKey = (stName = '') => {
    const s = String(stName).toLowerCase();
    if (s.includes('sudirman')) return 'sudirman';
    if (s.includes('kwitang')) return 'kwitang';
    if (s.includes('kuningan') || s.includes('kunngan')) return 'kuningan';
    if (s.includes('lebak') || s.includes('bulus')) return 'lebakBulus';
    if (s.includes('gading')) return 'kelapaGading';
    if (s.includes('nomadic') || s.includes('bandung')) return 'nomadic';
    if (s.includes('nusa') || s.includes('bali')) return 'nusadua';
    return 'sudirman';
  };

  const getChannelKey = (visitPurpose = '', paymentMethod = '') => {
    const vp = String(visitPurpose).toUpperCase();
    const pm = String(paymentMethod).toUpperCase();

    if (vp.includes('GOFOOD') || vp.includes('GO FOOD') || pm.includes('GOFOOD')) return 'gofood';
    if (vp.includes('GRABFOOD') || vp.includes('GRAB FOOD') || pm.includes('GRABFOOD')) return 'grabfood';
    if (vp.includes('GRABMART') || vp.includes('GRAB MART') || pm.includes('GRABMART')) return 'grabmart';
    if (vp.includes('SHOPEE') || pm.includes('SHOPEE')) return 'shopeefood';

    if (pm.includes('QRIS')) return 'qris';
    if (pm.includes('TRANSFER') || pm.includes('TRF') || pm.includes('BCA TF')) return 'transfer';
    if (pm.includes('EDC') || pm.includes('DEBIT') || pm.includes('KREDIT') || pm.includes('CARD')) return 'edc';
    if (pm.includes('TUNAI') || pm.includes('CASH')) return 'tunai';

    return 'qris'; // fallback
  };

  for (const tx of transactions) {
    const rawDate = tx.sales_date || (tx.date ? String(tx.date).slice(0, 10) : '2026-09-01');
    // Normalize date format MM/DD/YYYY
    let formattedDate = rawDate;
    if (rawDate.includes('-')) {
      const parts = rawDate.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        formattedDate = `${parts[1]}/${parts[2]}/${parts[0]}`;
      }
    }

    if (!dateMap.has(formattedDate)) {
      dateMap.set(formattedDate, {
        date: formattedDate,
        outlets: {
          sudirman: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, edc: 0, tunai: 0, total: 0 },
          kwitang: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
          kuningan: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
          lebakBulus: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
          kelapaGading: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, tunai: 0, total: 0 },
          nomadic: { gofood: 0, grabfood: 0, grabmart: 0, shopeefood: 0, qris: 0, transfer: 0, edc: 0, tunai: 0, total: 0 },
          nusadua: { edc: 0, qris: 0, tunai: 0, total: 0 }
        }
      });
    }

    const row = dateMap.get(formattedDate);
    const outletKey = getOutletKey(tx.store_name || tx.branch);
    const channelKey = getChannelKey(tx.visit_purpose, tx.payment_method);
    const amount = Number(tx.total || tx.subtotal || 0);

    if (row.outlets[outletKey]) {
      if (row.outlets[outletKey][channelKey] !== undefined) {
        row.outlets[outletKey][channelKey] += amount;
      }
      row.outlets[outletKey].total += amount;
    }

    if (totals[outletKey]) {
      if (totals[outletKey][channelKey] !== undefined) {
        totals[outletKey][channelKey] += amount;
      }
      totals[outletKey].total += amount;
    }
  }

  const matrix = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  return { matrix, totals, isBenchmark: false };
}

/**
 * Computes Weekly Product Sales grouped by Category and Brand/Variant from CSV transactions
 */
export function computeWeeklyCategoryMatrixFromTransactions(transactions = []) {
  if (!transactions || transactions.length === 0) {
    return { matrix: WEEKLY_CATEGORY_MATRIX, totals: WEEKLY_MATRIX_TOTALS, isBenchmark: true };
  }

  const productMap = new Map();

  const getWeekIndex = (dateStr) => {
    try {
      const d = new Date(dateStr);
      const day = d.getDate();
      if (isNaN(day)) return 0;
      if (day <= 10) return 0; // Week 1 (01-10)
      if (day <= 17) return 1; // Week 2 (11-17)
      if (day <= 24) return 2; // Week 3 (18-24)
      return 3;                // Week 4 (25-31)
    } catch {
      return 0;
    }
  };

  const getOutletSlot = (stName = '') => {
    const s = String(stName).toLowerCase();
    if (s.includes('kwitang')) return 'kwitang';
    if (s.includes('sudirman')) return 'sudirman';
    if (s.includes('kuningan') || s.includes('kunngan')) return 'kuningan';
    if (s.includes('nomadic') || s.includes('bandung')) return 'nomadic';
    if (s.includes('nusa') || s.includes('bali')) return 'bali';
    if (s.includes('lebak') || s.includes('bulus')) return 'lebakBulus';
    return 'sudirman';
  };

  for (const tx of transactions) {
    const cat = tx.category || tx.menu_category || 'Beverage';
    const detail = tx.brand || tx.variant || tx.item_name || 'Retail Item';
    const key = `${cat}___${detail}`;

    if (!productMap.has(key)) {
      productMap.set(key, {
        category: cat,
        detail: detail,
        kwitang: [0, 0, 0, 0, 0],
        sudirman: [0, 0, 0, 0, 0],
        kuningan: [0, 0, 0, 0, 0],
        nomadic: [0, 0, 0, 0, 0],
        bali: [0, 0, 0, 0, 0],
        lebakBulus: [0, 0, 0, 0, 0]
      });
    }

    const item = productMap.get(key);
    const slot = getOutletSlot(tx.store_name || tx.branch);
    const weekIdx = getWeekIndex(tx.date || tx.sales_date);
    const qty = Number(tx.qty || 1);

    if (item[slot]) {
      item[slot][weekIdx] += qty;
      item[slot][4] += qty; // total slot
    }
  }

  const matrix = Array.from(productMap.values()).sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.detail.localeCompare(b.detail);
  });

  return { matrix, isBenchmark: false };
}
