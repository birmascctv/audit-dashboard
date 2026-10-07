import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIT_DB_PATH = process.env.AUDIT_DB_PATH || path.join(__dirname, 'audit_birmas', 'audit_birmas.db');

let storeAuditDbInstance = null;

export function getStoreAuditDb() {
  if (!storeAuditDbInstance) {
    if (fs.existsSync(AUDIT_DB_PATH)) {
      storeAuditDbInstance = new DatabaseSync(AUDIT_DB_PATH);
      try {
        storeAuditDbInstance.exec('ALTER TABLE criteria ADD COLUMN unit TEXT;');
      } catch (_) {}
    }
  }
  return storeAuditDbInstance;
}

export function resetStoreAuditDb() {
  if (storeAuditDbInstance) {
    try {
      storeAuditDbInstance.close();
    } catch (_) {}
    storeAuditDbInstance = null;
  }
}

// Backward-compatible alias
export const getCctvDb = getStoreAuditDb;

const COLOR_PALETTE = [
  '#a855f7', // Store 1: Lebak Bulus (purple)
  '#00d4ff', // Store 2: Kelapa Gading (electric blue)
  '#eab308', // Store 3: Kuningan (yellow)
  '#22c55e', // Store 4: Kwitang (green)
  '#ef4444', // Store 5: Sudirman (red)
  '#f97316', // Store 6: Tebet (orange)
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#14b8a6',
];

export function colorForId(entityId) {
  const id = parseInt(entityId, 10) || 1;
  return COLOR_PALETTE[(id - 1) % COLOR_PALETTE.length];
}

export function colorForCategory(categoryName, defaultIndex = 1) {
  if (String(categoryName).trim().toLowerCase() === 'aplikasi') {
    return '#facc15';
  }
  return colorForId(defaultIndex);
}

function parseStoresParam(raw) {
  if (!raw) return null;
  const clean = String(raw).split(':')[0];
  const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);
  const ids = parts.map((p) => parseInt(p, 10)).filter((n) => !isNaN(n));
  return ids.length > 0 ? ids : null;
}

function computeMedian(arr) {
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].filter((v) => v !== null && v !== undefined && !isNaN(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// 1. Stores list
export function getCctvStores() {
  const db = getCctvDb();
  if (!db) return [];
  try {
    return db.prepare('SELECT store_id, name FROM stores ORDER BY name').all();
  } catch (err) {
    console.error('getCctvStores error:', err.message);
    return [];
  }
}

// 2. Categories list
export function getCctvCategories() {
  const db = getCctvDb();
  if (!db) return [];
  try {
    const rows = db.prepare('SELECT DISTINCT category FROM category_store_monthly_median ORDER BY category').all();
    return rows.map((r) => r.category);
  } catch (err) {
    console.error('getCctvCategories error:', err.message);
    return [];
  }
}

// 3. Store criteria list
export function getStoreCriteria(query = {}) {
  const db = getStoreAuditDb();
  if (!db) return [];
  try {
    const year = query.year ? parseInt(query.year, 10) : null;
    const excludeYear = query.exclude_year ? parseInt(query.exclude_year, 10) : null;

    if (year !== null) {
      // Find criteria that are active in audits for the specified year
      const rows = db.prepare(`
        SELECT DISTINCT c.criteria_id, c.name, c.category, c.passing_grade, c.metrics, c.unit
        FROM criteria c
        JOIN scores sc ON c.criteria_id = sc.criteria_id
        JOIN audits a ON sc.audit_id = a.audit_id
        WHERE a.year = ?
        ORDER BY c.category, c.name
      `).all(year);

      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          id: r.criteria_id,
          label: r.name,
          category: r.category,
          passing_grade: r.passing_grade,
          unit: r.unit || null,
          metrics: r.metrics || null,
        }));
      }
    } else if (excludeYear !== null) {
      const rows = db.prepare(`
        SELECT DISTINCT c.criteria_id, c.name, c.category, c.passing_grade, c.metrics, c.unit
        FROM criteria c
        JOIN scores sc ON c.criteria_id = sc.criteria_id
        JOIN audits a ON sc.audit_id = a.audit_id
        WHERE a.year != ?
        ORDER BY c.category, c.name
      `).all(excludeYear);

      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          id: r.criteria_id,
          label: r.name,
          category: r.category,
          passing_grade: r.passing_grade,
          unit: r.unit || null,
          metrics: r.metrics || null,
        }));
      }
    }

    const colNames = db.prepare('PRAGMA table_info(criteria)').all().map((c) => c.name);
    const selectCols = ['criteria_id', 'name', 'category', 'passing_grade'];
    if (colNames.includes('unit')) selectCols.push('unit');
    if (colNames.includes('metrics')) selectCols.push('metrics');

    const rows = db.prepare(`
      SELECT ${selectCols.join(', ')}
      FROM criteria
      ORDER BY category, name
    `).all();

    return rows.map((r) => ({
      id: r.criteria_id,
      label: r.name,
      category: r.category,
      passing_grade: r.passing_grade,
      unit: r.unit || null,
      metrics: r.metrics || null,
    }));
  } catch (err) {
    console.error('getStoreCriteria error:', err.message);
    return [];
  }
}

// Backward-compatible alias
export const getCctvCriteria = getStoreCriteria;

// 4. Category Monthly Trends
export function getCategoryMonthly(category, query = {}) {
  const db = getCctvDb();
  if (!db) return { labels: [], datasets: [] };
  try {
    const storeIds = parseStoresParam(query.stores);
    const year = query.year ? parseInt(query.year, 10) : null;
    const excludeYear = query.exclude_year ? parseInt(query.exclude_year, 10) : null;
    const metric = query.metric === 'norm' ? 'median_normalized' : 'median_score';

    const params = [category];
    let whereStore = '';
    if (storeIds && storeIds.length > 0) {
      whereStore = `AND m.store_id IN (${storeIds.map(() => '?').join(',')})`;
      params.push(...storeIds);
    }
    let whereYear = '';
    if (year) {
      whereYear = 'AND m.year = ?';
      params.push(year);
    } else if (excludeYear) {
      whereYear = 'AND m.year != ?';
      params.push(excludeYear);
    }

    const sql = `
      SELECT m.store_id AS m_store_id, s.name AS store_name, m.year, m.month, ${metric} AS score_val
      FROM category_store_monthly_median m
      JOIN stores s ON m.store_id = s.store_id
      WHERE m.category = ?
      ${whereStore}
      ${whereYear}
      ORDER BY m.year, m.month, m.store_id
    `;

    const rows = db.prepare(sql).all(...params);
    const labelsSet = new Set(rows.map((r) => `${String(r.year).padStart(4, '0')}-${String(r.month).padStart(2, '0')}`));
    const labels = Array.from(labelsSet).sort();
    const labelIndex = Object.fromEntries(labels.map((lbl, i) => [lbl, i]));

    const datasetsMap = new Map();
    for (const r of rows) {
      const sid = r.m_store_id;
      if (!datasetsMap.has(sid)) {
        datasetsMap.set(sid, {
          label: r.store_name,
          data: new Array(labels.length).fill(null),
          borderColor: colorForId(sid),
          fill: false,
        });
      }
      const lbl = `${String(r.year).padStart(4, '0')}-${String(r.month).padStart(2, '0')}`;
      datasetsMap.get(sid).data[labelIndex[lbl]] = r.score_val !== null && r.score_val !== undefined ? Number(r.score_val) : null;
    }

    return { labels, datasets: Array.from(datasetsMap.values()) };
  } catch (err) {
    console.error('getCategoryMonthly error:', err.message);
    return { labels: [], datasets: [] };
  }
}

// 5. Category Criterion Monthly
export function getCategoryCriterionMonthly(category, criterion, query = {}) {
  const db = getCctvDb();
  if (!db) return { labels: [], datasets: [], average: [], average_count: [] };
  try {
    let critId = null;
    if (criterion && /^\d+$/.test(String(criterion))) {
      critId = parseInt(criterion, 10);
    } else {
      const row = db.prepare('SELECT criteria_id FROM criteria WHERE name = ? AND category = ? LIMIT 1').get(criterion, category);
      if (row) critId = row.criteria_id;
      else {
        const row2 = db.prepare('SELECT criteria_id FROM criteria WHERE criteria_id = ? LIMIT 1').get(criterion);
        if (row2) critId = row2.criteria_id;
      }
    }

    if (!critId) {
      return { labels: [], datasets: [], average: [], average_count: [] };
    }

    const storeIds = parseStoresParam(query.stores);
    const year = query.year ? parseInt(query.year, 10) : null;
    const excludeYear = query.exclude_year ? parseInt(query.exclude_year, 10) : null;

    const params = [critId];
    let whereStore = '';
    if (storeIds && storeIds.length > 0) {
      whereStore = `AND a.store_id IN (${storeIds.map(() => '?').join(',')})`;
      params.push(...storeIds);
    }
    let whereYear = '';
    if (year) {
      whereYear = 'AND a.year = ?';
      params.push(year);
    } else if (excludeYear) {
      whereYear = 'AND a.year != ?';
      params.push(excludeYear);
    }

    const sql = `
      SELECT a.store_id AS a_store_id, s.name AS store_name, a.year, a.month, sc.score AS score
      FROM scores sc
      JOIN audits a ON sc.audit_id = a.audit_id
      JOIN stores s ON a.store_id = s.store_id
      WHERE sc.criteria_id = ?
      ${whereStore}
      ${whereYear}
      ORDER BY a.year, a.month, a.store_id
    `;

    const rows = db.prepare(sql).all(...params);

    const groups = new Map(); // key: "sid:lbl" -> array of numbers
    const storeNames = new Map();
    const rawByLabel = new Map(); // lbl -> array of numbers

    for (const r of rows) {
      const sid = r.a_store_id;
      storeNames.set(sid, r.store_name);
      const lbl = `${String(r.year).padStart(4, '0')}-${String(r.month).padStart(2, '0')}`;
      if (r.score !== null && r.score !== undefined) {
        const val = Number(r.score);
        const groupKey = `${sid}:${lbl}`;
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push(val);

        if (!rawByLabel.has(lbl)) rawByLabel.set(lbl, []);
        rawByLabel.get(lbl).push(val);
      }
    }

    const labels = Array.from(rawByLabel.keys()).sort();
    const labelIndex = Object.fromEntries(labels.map((lbl, i) => [lbl, i]));

    const datasetsMap = new Map();
    for (const [key, scores] of groups.entries()) {
      const [sidStr, lbl] = key.split(':');
      const sid = parseInt(sidStr, 10);
      if (!datasetsMap.has(sid)) {
        datasetsMap.set(sid, {
          label: storeNames.get(sid) || `Store ${sid}`,
          data: new Array(labels.length).fill(null),
          borderColor: colorForId(sid),
          fill: false,
        });
      }
      datasetsMap.get(sid).data[labelIndex[lbl]] = computeMedian(scores);
    }

    const average = [];
    const average_count = [];
    for (const lbl of labels) {
      const vals = rawByLabel.get(lbl) || [];
      if (vals.length > 0) {
        average.push(Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3)));
        average_count.push(vals.length);
      } else {
        average.push(null);
        average_count.push(0);
      }
    }

    return {
      labels,
      datasets: Array.from(datasetsMap.values()),
      average,
      average_count,
    };
  } catch (err) {
    console.error('getCategoryCriterionMonthly error:', err.message);
    return { labels: [], datasets: [], average: [], average_count: [] };
  }
}

// 6. Category Pass Rate
export function getCategoryPassrate(category, query = {}) {
  const db = getCctvDb();
  if (!db) return { labels: [], datasets: [] };
  try {
    const storeIds = parseStoresParam(query.stores);
    const year = query.year ? parseInt(query.year, 10) : null;

    const params = [category];
    let whereStore = '';
    if (storeIds && storeIds.length > 0) {
      whereStore = `AND m.store_id IN (${storeIds.map(() => '?').join(',')})`;
      params.push(...storeIds);
    }
    let whereYear = '';
    if (year) {
      whereYear = 'AND m.year = ?';
      params.push(year);
    }

    const sql = `
      SELECT m.store_id AS m_store_id, s.name AS store_name, m.year, m.month, m.pass_rate
      FROM category_store_monthly_passrate m
      JOIN stores s ON m.store_id = s.store_id
      WHERE m.category = ?
      ${whereStore}
      ${whereYear}
      ORDER BY m.year, m.month, m.store_id
    `;

    const rows = db.prepare(sql).all(...params);
    const labels = Array.from(new Set(rows.map((r) => `${String(r.year).padStart(4, '0')}-${String(r.month).padStart(2, '0')}`))).sort();
    const labelIndex = Object.fromEntries(labels.map((lbl, i) => [lbl, i]));

    const datasetsMap = new Map();
    for (const r of rows) {
      const sid = r.m_store_id;
      if (!datasetsMap.has(sid)) {
        datasetsMap.set(sid, {
          label: r.store_name,
          data: new Array(labels.length).fill(null),
          borderColor: colorForId(sid),
          fill: false,
        });
      }
      const lbl = `${String(r.year).padStart(4, '0')}-${String(r.month).padStart(2, '0')}`;
      datasetsMap.get(sid).data[labelIndex[lbl]] = r.pass_rate !== null && r.pass_rate !== undefined ? Number(r.pass_rate) : null;
    }

    return { labels, datasets: Array.from(datasetsMap.values()) };
  } catch (err) {
    console.error('getCategoryPassrate error:', err.message);
    return { labels: [], datasets: [] };
  }
}

// 7. Store Pass Rate (Pivoted per category)
export function getStorePassrate(storeId, query = {}) {
  const db = getCctvDb();
  if (!db) return { labels: [], datasets: [] };
  try {
    const year = query.year ? parseInt(query.year, 10) : null;
    const excludeYear = query.exclude_year ? parseInt(query.exclude_year, 10) : null;

    const params = [storeId];
    let whereYear = '';
    if (year) {
      whereYear = 'AND m.year = ?';
      params.push(year);
    } else if (excludeYear) {
      whereYear = 'AND m.year != ?';
      params.push(excludeYear);
    }

    const sql = `
      SELECT m.category, m.year, m.month, m.pass_rate
      FROM category_store_monthly_passrate m
      WHERE m.store_id = ?
      ${whereYear}
      ORDER BY m.year, m.month, m.category
    `;

    const rows = db.prepare(sql).all(...params);
    const allCategories = Array.from(new Set(db.prepare('SELECT DISTINCT category FROM category_store_monthly_passrate').all().map((r) => r.category))).sort();
    const categoryIndexMap = Object.fromEntries(allCategories.map((c, i) => [c, i + 1]));

    const labels = Array.from(new Set(rows.map((r) => `${String(r.year).padStart(4, '0')}-${String(r.month).padStart(2, '0')}`))).sort();
    const labelIndex = Object.fromEntries(labels.map((lbl, i) => [lbl, i]));

    const datasetsMap = new Map();
    for (const r of rows) {
      const cat = r.category;
      if (!datasetsMap.has(cat)) {
        datasetsMap.set(cat, {
          label: cat,
          data: new Array(labels.length).fill(null),
          borderColor: colorForCategory(cat, categoryIndexMap[cat] || 1),
          fill: false,
        });
      }
      const lbl = `${String(r.year).padStart(4, '0')}-${String(r.month).padStart(2, '0')}`;
      datasetsMap.get(cat).data[labelIndex[lbl]] = r.pass_rate !== null && r.pass_rate !== undefined ? Number(r.pass_rate) : null;
    }

    return { labels, datasets: Array.from(datasetsMap.values()) };
  } catch (err) {
    console.error('getStorePassrate error:', err.message);
    return { labels: [], datasets: [] };
  }
}

// 8. Passing grades map
export function getPassingGrades(query = {}) {
  const db = getCctvDb();
  if (!db) return {};
  try {
    const year = query.year ? parseInt(query.year, 10) : null;
    const excludeYear = query.exclude_year ? parseInt(query.exclude_year, 10) : null;

    let where = '';
    const params = [];
    if (year !== null) {
      where = 'WHERE year = ?';
      params.push(String(year));
    } else if (excludeYear !== null) {
      where = 'WHERE year != ?';
      params.push(String(excludeYear));
    }

    const colNames = db.prepare('PRAGMA table_info(criteria)').all().map((c) => c.name);
    const selectCols = ['criteria_id', 'name', 'category', 'passing_grade'];
    if (colNames.includes('unit')) selectCols.push('unit');

    const rows = db.prepare(`
      SELECT ${selectCols.join(', ')}
      FROM criteria
      ${where}
      ORDER BY category, name
    `).all(...params);

    const byCat = {};
    for (const r of rows) {
      const cat = r.category;
      if (!byCat[cat]) {
        byCat[cat] = { criteria: {}, unit: r.unit || null, values: [] };
      }
      const key = String(r.criteria_id);
      byCat[cat].criteria[key] = r.passing_grade;
      if (r.passing_grade !== null && r.passing_grade !== undefined) {
        byCat[cat].values.push(Number(r.passing_grade));
      }
    }

    const result = {};
    for (const [cat, info] of Object.entries(byCat)) {
      result[cat] = {
        categoryPassingGrade: computeMedian(info.values) || 80,
        unit: info.unit,
        criteria: info.criteria,
      };
    }
    return result;
  } catch (err) {
    console.error('getPassingGrades error:', err.message);
    return {};
  }
}

// 9. Drilldown Endpoint
export function getCctvDrilldown(query = {}) {
  const db = getCctvDb();
  if (!db) return { infractions: [], summary: {} };
  try {
    const storeId = query.store ? parseInt(query.store, 10) : null;
    const year = query.year ? parseInt(query.year, 10) : null;
    const month = query.month ? parseInt(query.month, 10) : null;
    const category = query.category || null;

    const colNames = db.prepare('PRAGMA table_info(criteria)').all().map((c) => c.name);
    const unitCol = colNames.includes('unit') ? 'c.unit' : 'NULL AS unit';
    const metricsCol = colNames.includes('metrics') ? 'c.metrics' : 'NULL AS metrics';

    let sql = `
      SELECT sc.score_id, sc.audit_id, sc.criteria_id, sc.score, sc.notes,
             a.store_id, s.name AS store_name, a.year, a.month, a.file_name,
             c.name AS criteria_name, c.category, c.passing_grade, ${unitCol}, ${metricsCol}
      FROM scores sc
      JOIN audits a ON sc.audit_id = a.audit_id
      JOIN stores s ON a.store_id = s.store_id
      JOIN criteria c ON sc.criteria_id = c.criteria_id
      WHERE 1=1
    `;
    const params = [];
    if (storeId) {
      sql += ' AND a.store_id = ?';
      params.push(storeId);
    }
    if (year) {
      sql += ' AND a.year = ?';
      params.push(year);
    }
    if (month) {
      sql += ' AND a.month = ?';
      params.push(month);
    }
    if (category) {
      sql += ' AND c.category = ?';
      params.push(category);
    }

    sql += ' ORDER BY a.year DESC, a.month DESC, sc.score ASC LIMIT 200';

    const rows = db.prepare(sql).all(...params);
    return {
      infractions: rows,
      total: rows.length,
    };
  } catch (err) {
    console.error('getCctvDrilldown error:', err.message);
    return { infractions: [], summary: {} };
  }
}

// 10. Uploaded CCTV Files
export function getCctvUploadedFiles() {
  const db = getCctvDb();
  if (!db) return [];
  try {
    const rows = db.prepare(`
      SELECT 
        a.audit_id, a.store_id, s.name AS store_name, a.year, a.month, a.file_name,
        COUNT(sc.score_id) AS total_scores,
        SUM(CASE WHEN LOWER(sc.pass_fail) = 'pass' OR (sc.score IS NOT NULL AND c.passing_grade IS NOT NULL AND sc.score >= c.passing_grade) THEN 1 ELSE 0 END) AS passed_count,
        SUM(CASE WHEN sc.score IS NOT NULL OR (sc.pass_fail IS NOT NULL AND sc.pass_fail != '') THEN 1 ELSE 0 END) AS not_null_count,
        AVG(sc.score) AS average_score
      FROM audits a
      JOIN stores s ON a.store_id = s.store_id
      LEFT JOIN scores sc ON a.audit_id = sc.audit_id
      LEFT JOIN all_criteria c ON sc.criteria_id = c.criteria_id
      GROUP BY a.audit_id
      ORDER BY a.year DESC, a.month DESC, a.audit_id DESC
    `).all();

    const indonesianMonths = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    return rows.map((r) => {
      const monthName = indonesianMonths[(r.month || 1) - 1] || 'Januari';
      const possiblePaths = [
        r.file_name ? path.join(__dirname, 'audit_birmas', r.store_name || '', String(r.year), monthName, r.file_name) : null,
        r.file_name ? path.join(__dirname, 'audit_birmas', r.store_name || '', r.file_name) : null,
        r.file_name ? path.join(__dirname, 'audit_birmas', r.file_name) : null,
      ].filter(Boolean);

      let mtime = null;
      let sizeBytes = 12800;

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          try {
            const stats = fs.statSync(p);
            mtime = stats.mtime.toISOString();
            sizeBytes = stats.size;
            break;
          } catch {}
        }
      }

      // Extract inspection date from filename if available (e.g., "Log Auditor OL Sudirman 4 Agustus 2026.csv")
      let auditDate = `${monthName} ${r.year}`;
      if (r.file_name) {
        const dateMatch = r.file_name.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i) || r.file_name.match(/(per\s+\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
        if (dateMatch) {
          auditDate = dateMatch[0].replace(/^per\s+/i, '');
        }
      }

      const notNull = r.not_null_count || 0;
      const passed = r.passed_count || 0;
      const passRate = notNull > 0 ? Math.round((passed / notNull) * 1000) / 10 : null;

      const timestamp = mtime || `${r.year}-${String(r.month).padStart(2, '0')}-01T00:00:00.000Z`;

      return {
        audit_id: r.audit_id,
        store_id: r.store_id,
        store_name: r.store_name,
        year: r.year,
        month: r.month,
        month_name: monthName,
        audit_date: auditDate,
        file_name: r.file_name || `Audit_${r.store_name}_${r.year}_${monthName}.csv`,
        filename: r.file_name || `Audit_${r.store_name}_${r.year}_${monthName}.csv`,
        timestamp: timestamp,
        created_at: timestamp,
        file_size: sizeBytes,
        total_scores: r.total_scores,
        total_criteria: r.total_scores,
        passed_count: passed,
        not_null_count: notNull,
        pass_rate: passRate,
        average_score: r.average_score ? Number(r.average_score.toFixed(2)) : null,
      };
    });
  } catch (err) {
    console.error('getCctvUploadedFiles error:', err.message);
    return [];
  }
}

// 11. Helper to parse CSV lines safely with automatic delimiter detection
export function parseCsvRows(text) {
  if (!text) return [];
  // Strip UTF-8 BOM if present
  const cleanText = text.replace(/^\uFEFF/, '');

  // Detect delimiter: compare comma, semicolon, and tab counts on first non-empty lines
  const sampleLines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 5);
  let commaCount = 0;
  let semiCount = 0;
  let tabCount = 0;
  for (const line of sampleLines) {
    commaCount += (line.match(/,/g) || []).length;
    semiCount += (line.match(/;/g) || []).length;
    tabCount += (line.match(/\t/g) || []).length;
  }
  let delimiter = ',';
  if (semiCount > commaCount && semiCount >= tabCount) {
    delimiter = ';';
  } else if (tabCount > commaCount && tabCount > semiCount) {
    delimiter = '\t';
  }

  const lines = [];
  let row = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(current.trim());
      current = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(current.trim());
      current = '';
      if (row.some((cell) => cell.length > 0)) {
        lines.push(row);
      }
      row = [];
    } else {
      current += char;
    }
  }
  if (current || row.length > 0) {
    row.push(current.trim());
    if (row.some((cell) => cell.length > 0)) {
      lines.push(row);
    }
  }
  return lines;
}

// Helper to compute median
function calculateMedian(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
  } else {
    return Math.round(sorted[mid] * 100) / 100;
  }
}

// Helper to recompute aggregates for a store, year, month
function recomputeStoreMonthAggregates(db, storeId, year, month) {
  try {
    // 1. store_monthly_median
    const storeScores = db.prepare(`
      SELECT sc.score
      FROM scores sc
      JOIN audits a ON sc.audit_id = a.audit_id
      JOIN all_criteria c ON sc.criteria_id = c.criteria_id
      WHERE a.store_id = ? AND a.year = ? AND a.month = ?
        AND sc.score IS NOT NULL
        AND LOWER(c.category) != 'maintenance'
    `).all(storeId, year, month).map((r) => r.score);

    const storeMed = calculateMedian(storeScores);

    db.prepare(`
      DELETE FROM store_monthly_median WHERE store_id = ? AND year = ? AND month = ?
    `).run(storeId, year, month);

    if (storeMed !== null) {
      db.prepare(`
        INSERT INTO store_monthly_median (store_id, year, month, median_score)
        VALUES (?, ?, ?, ?)
      `).run(storeId, year, month, storeMed);
    }

    // 2. category_store_monthly_median & category_store_monthly_passrate
    const catRows = db.prepare(`
      SELECT DISTINCT c.category
      FROM scores sc
      JOIN audits a ON sc.audit_id = a.audit_id
      JOIN all_criteria c ON sc.criteria_id = c.criteria_id
      WHERE a.store_id = ? AND a.year = ? AND a.month = ?
        AND sc.score IS NOT NULL
        AND LOWER(c.category) != 'maintenance'
        AND LOWER(c.category) != 'absensi'
    `).all(storeId, year, month);

    for (const { category } of catRows) {
      const catScores = db.prepare(`
        SELECT sc.score, c.passing_grade
        FROM scores sc
        JOIN audits a ON sc.audit_id = a.audit_id
        JOIN all_criteria c ON sc.criteria_id = c.criteria_id
        WHERE a.store_id = ? AND a.year = ? AND a.month = ? AND c.category = ?
          AND sc.score IS NOT NULL
      `).all(storeId, year, month, category);

      const rawScores = catScores.map((r) => r.score);
      const sampleSize = rawScores.length;
      const medRaw = calculateMedian(rawScores);

      const normalized = [];
      for (const r of catScores) {
        if (r.passing_grade && Number(r.passing_grade) > 0) {
          normalized.push(Number(r.score) / Number(r.passing_grade));
        }
      }
      const medNorm = calculateMedian(normalized);

      db.prepare(`
        DELETE FROM category_store_monthly_median
        WHERE store_id = ? AND year = ? AND month = ? AND category = ?
      `).run(storeId, year, month, category);

      db.prepare(`
        INSERT INTO category_store_monthly_median
        (store_id, category, year, month, median_score, median_normalized, sample_size)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storeId, category, year, month, medRaw, medNorm, sampleSize);

      const passedRow = db.prepare(`
        SELECT COUNT(*) as cnt
        FROM scores sc
        JOIN audits a ON sc.audit_id = a.audit_id
        JOIN all_criteria c ON sc.criteria_id = c.criteria_id
        WHERE a.store_id = ? AND a.year = ? AND a.month = ? AND c.category = ?
          AND LOWER(sc.pass_fail) = 'pass'
      `).get(storeId, year, month, category);

      const totalRow = db.prepare(`
        SELECT COUNT(*) as cnt
        FROM scores sc
        JOIN audits a ON sc.audit_id = a.audit_id
        JOIN all_criteria c ON sc.criteria_id = c.criteria_id
        WHERE a.store_id = ? AND a.year = ? AND a.month = ? AND c.category = ?
      `).get(storeId, year, month, category);

      const passedCount = passedRow?.cnt || 0;
      const totalCatScores = totalRow?.cnt || 0;
      const catPassRate = totalCatScores > 0 ? Math.round((passedCount / totalCatScores) * 1000) / 1000 : null;

      db.prepare(`
        DELETE FROM category_store_monthly_passrate
        WHERE store_id = ? AND year = ? AND month = ? AND category = ?
      `).run(storeId, year, month, category);

      db.prepare(`
        INSERT INTO category_store_monthly_passrate
        (store_id, category, year, month, pass_rate, sample_size)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(storeId, category, year, month, catPassRate, totalCatScores);
    }
  } catch (err) {
    console.error('[recomputeStoreMonthAggregates] Error:', err.message);
  }
}

// 12. Process and store audit CSV upload
export function processAuditUpload({ storeName, year, month, fileName, fileBuffer, confirm }) {
  const db = getCctvDb();
  if (!db) {
    return { success: false, status: 'error', message: 'Database connection not available.' };
  }

  // 1. Validate file content
  if (!fileBuffer || fileBuffer.length === 0) {
    return {
      success: false,
      status: 'error',
      errorType: 'EMPTY_FILE',
      message: 'Uploaded CSV file contains no data rows. Please ensure your audit CSV file is not empty.',
    };
  }

  const csvText = fileBuffer.toString('utf-8').trim();
  if (!csvText) {
    return {
      success: false,
      status: 'error',
      errorType: 'EMPTY_FILE',
      message: 'Uploaded CSV file contains no data rows. Please ensure your audit CSV file is not empty.',
    };
  }

  // 2. Parse CSV
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return {
      success: false,
      status: 'error',
      errorType: 'EMPTY_FILE',
      message: 'Uploaded CSV file contains no data rows besides the header line.',
    };
  }

  // Find the actual header row (in case title/metadata rows precede the table)
  let headerRowIdx = -1;
  let colIdx = {
    category: -1,
    criteria: -1,
    metrics: -1,
    score: -1,
    passingGrade: -1,
    passFail: -1,
    notes: -1,
  };

  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const rowCols = rows[r].map((h) => (h || '').toLowerCase().trim().replace(/^["']|["']$/g, ''));
    const catIdx = rowCols.findIndex((h) => h === 'category' || h.includes('category') || h.includes('kategori'));
    const critIdx = rowCols.findIndex((h) => h === 'criteria' || h.includes('criteria') || h.includes('kriteria') || h.includes('indikator') || h.includes('item'));
    const scoreIdx = rowCols.findIndex((h) => h === 'score' || h.includes('score') || h.includes('nilai') || h.includes('skor') || h.includes('poin') || h.includes('hasil'));

    if (catIdx !== -1 && (critIdx !== -1 || scoreIdx !== -1)) {
      headerRowIdx = r;
      colIdx.category = catIdx;
      colIdx.criteria = critIdx !== -1 ? critIdx : 2;
      colIdx.score = scoreIdx !== -1 ? scoreIdx : 4;
      colIdx.metrics = rowCols.findIndex((h) => h === 'metrics' || h.includes('metric') || h.includes('metrik') || h.includes('parameter') || h.includes('deskripsi'));
      colIdx.passingGrade = rowCols.findIndex((h) => h === 'passing grade' || h.includes('passing') || h.includes('grade') || h.includes('target') || h.includes('standar') || h.includes('batas') || h.includes('pg') || h.includes('bobot'));
      colIdx.passFail = rowCols.findIndex((h) => h === 'pass/not pass' || h.includes('pass') || h.includes('status') || h.includes('kelulusan') || h.includes('keterangan'));
      colIdx.notes = rowCols.findIndex((h) => h === 'infraction details' || h.includes('infraction') || h.includes('detail') || h.includes('notes') || h.includes('catatan') || h.includes('temuan'));
      break;
    }
  }

  if (headerRowIdx === -1 || colIdx.category === -1) {
    return {
      success: false,
      status: 'error',
      errorType: 'INCORRECT_STRUCTURE',
      message: 'Data has different table format (failed to upload). Expected standard columns: Category (or Kategori), Criteria (or Kriteria), Score (or Nilai), Passing Grade (or Target).',
    };
  }

  // 3. Normalize store and month
  const INDO_MONTHS = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  let monthNum = 1;
  let monthName = 'Januari';
  if (typeof month === 'number' || (!isNaN(parseInt(month, 10)) && parseInt(month, 10) >= 1 && parseInt(month, 10) <= 12)) {
    monthNum = Math.max(1, Math.min(12, parseInt(month, 10)));
    monthName = INDO_MONTHS[monthNum - 1];
  } else {
    const cleanMonth = String(month || '').trim().toLowerCase();
    const idx = INDO_MONTHS.findIndex((m) => m.toLowerCase() === cleanMonth);
    if (idx !== -1) {
      monthNum = idx + 1;
      monthName = INDO_MONTHS[idx];
    }
  }

  const cleanStoreInput = String(storeName || '').trim().toLowerCase().replace(/^birmas\s+/i, '');
  const existingStores = db.prepare('SELECT store_id, name FROM stores').all();
  let storeMatch = existingStores.find((s) => {
    const cleanS = String(s.name).trim().toLowerCase().replace(/^birmas\s+/i, '');
    return cleanS === cleanStoreInput || String(s.name).trim().toLowerCase() === String(storeName).trim().toLowerCase();
  });

  let storeId;
  let officialStoreName;
  if (storeMatch) {
    storeId = storeMatch.store_id;
    officialStoreName = storeMatch.name;
  } else {
    officialStoreName = storeName.toLowerCase().startsWith('birmas') ? storeName : `Birmas ${storeName}`;
    const ins = db.prepare('INSERT INTO stores (name) VALUES (?)').run(officialStoreName);
    storeId = Number(ins.lastInsertRowid);
  }

  const yr = parseInt(year, 10) || 2026;
  const targetTable = yr === 2025 ? 'criteria2025' : 'criteria';

  // 4. Check for existing audit record
  const existingAudit = db.prepare(`
    SELECT audit_id, file_name FROM audits
    WHERE store_id = ? AND year = ? AND month = ?
      AND (file_name = ? OR LOWER(file_name) = LOWER(?))
    LIMIT 1
  `).get(storeId, yr, monthNum, fileName, fileName);

  // If existing audit found and not confirmed overwrite:
  if (existingAudit && !confirm) {
    const existingScoresCount = db.prepare('SELECT COUNT(*) as count FROM scores WHERE audit_id = ?').get(existingAudit.audit_id)?.count || 0;
    const nonSkippedRows = rows.slice(headerRowIdx + 1).filter((r) => {
      const cat = (r[colIdx.category] || '').trim().toLowerCase();
      const crit = (r[colIdx.criteria] || '').trim();
      return crit && cat !== 'absensi' && cat !== 'maintenance';
    });

    if (existingScoresCount > 0 && existingScoresCount === nonSkippedRows.length) {
      return {
        success: true,
        status: 'unchanged',
        message: `File already exists: exact same audit records are already recorded for ${officialStoreName} (${monthName} ${yr}). No changes needed.`,
      };
    } else {
      return {
        success: true,
        status: 'confirm_required',
        message: `File "${fileName}" already exists for ${officialStoreName} (${monthName} ${yr}) with different data. Click "Upload Anyway" to replace it.`,
      };
    }
  }

  // 5. Save physical file to disk
  try {
    const dirPath = path.join(__dirname, 'audit_birmas', officialStoreName, String(yr), monthName);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(path.join(dirPath, fileName), fileBuffer);
  } catch (err) {
    console.warn('[processAuditUpload] Warning writing file to disk:', err.message);
  }

  // 6. Insert / Replace audit record
  let auditId;
  if (existingAudit) {
    auditId = existingAudit.audit_id;
    db.prepare('DELETE FROM scores WHERE audit_id = ?').run(auditId);
    db.prepare('DELETE FROM audit_summary WHERE audit_id = ?').run(auditId);
    db.prepare('UPDATE audits SET file_name = ? WHERE audit_id = ?').run(fileName, auditId);
  } else {
    const ins = db.prepare('INSERT INTO audits (store_id, year, month, file_name) VALUES (?, ?, ?, ?)').run(storeId, yr, monthNum, fileName);
    auditId = Number(ins.lastInsertRowid);
  }

  // 7. Parse rows and insert criteria & scores
  let totalCriteria = 0;
  let passedCount = 0;
  let notNullCount = 0;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const rawCat = (colIdx.category !== -1 ? r[colIdx.category] : '') || '';
    const rawCrit = (colIdx.criteria !== -1 ? r[colIdx.criteria] : '') || '';
    const category = rawCat.trim();
    const criteriaName = rawCrit.replace(/\s*\(\d+\)\s*$/, '').trim();

    if (!criteriaName || category.toLowerCase() === 'absensi' || category.toLowerCase() === 'maintenance') {
      continue;
    }

    totalCriteria++;

    let rawScore = (colIdx.score !== -1 ? r[colIdx.score] : '') || '';
    let scoreVal = null;
    if (rawScore !== '' && rawScore !== null && rawScore !== undefined && rawScore !== '-') {
      const cleanNum = String(rawScore).trim().replace(',', '.');
      const parsed = parseFloat(cleanNum);
      if (!isNaN(parsed)) scoreVal = parsed;
    }

    let rawPg = (colIdx.passingGrade !== -1 ? r[colIdx.passingGrade] : '') || '';
    let pgVal = null;
    if (rawPg !== '' && rawPg !== null && rawPg !== undefined) {
      const cleanPg = String(rawPg).trim().replace(',', '.');
      const parsed = parseFloat(cleanPg);
      if (!isNaN(parsed)) pgVal = parsed;
    }

    let rawMetrics = (colIdx.metrics !== -1 ? r[colIdx.metrics] : '') || '';
    let metricsVal = rawMetrics.trim() || null;

    // Fallback passing grade & metrics from criteria database if omitted
    if (pgVal === null) {
      try {
        const critMeta = db.prepare('SELECT passing_grade, metrics FROM all_criteria WHERE name = ? LIMIT 1').get(criteriaName);
        if (critMeta && critMeta.passing_grade !== null) {
          pgVal = critMeta.passing_grade;
          if (!metricsVal) metricsVal = critMeta.metrics;
        } else {
          pgVal = 3.0;
        }
      } catch (_) {
        pgVal = 3.0;
      }
    }

    let rawPassFail = (colIdx.passFail !== -1 ? r[colIdx.passFail] : '') || '';
    let passFailVal = rawPassFail.trim() || null;
    if (!passFailVal && scoreVal !== null && pgVal !== null) {
      passFailVal = scoreVal >= pgVal ? 'Pass' : 'Not Pass';
    }

    let rawNotes = (colIdx.notes !== -1 ? r[colIdx.notes] : '') || '';
    let notesVal = rawNotes.trim() || null;

    // Ensure criteria exists in target table
    try {
      db.prepare(`
        INSERT OR IGNORE INTO ${targetTable} (year, category, name, passing_grade, metrics)
        VALUES (?, ?, ?, ?, ?)
      `).run(yr, category, criteriaName, pgVal, metricsVal);
    } catch (_) {}

    // Find criteria_id
    let critRow = db.prepare(`
      SELECT criteria_id FROM ${targetTable}
      WHERE year = ? AND name = ?
      LIMIT 1
    `).get(yr, criteriaName);

    if (!critRow) {
      critRow = db.prepare(`
        SELECT criteria_id FROM ${targetTable}
        WHERE name = ?
        LIMIT 1
      `).get(criteriaName);
    }

    const criteriaId = critRow?.criteria_id;
    if (!criteriaId) continue;

    db.prepare(`
      INSERT INTO scores (audit_id, criteria_id, score, pass_fail, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(auditId, criteriaId, scoreVal, passFailVal, notesVal);

    if (scoreVal !== null || (passFailVal && passFailVal.trim() !== '')) notNullCount++;
    if (passFailVal && passFailVal.toLowerCase() === 'pass') passedCount++;
  }

  // 8. Update audit_summary
  const passRate = notNullCount > 0 ? Math.round((passedCount / notNullCount) * 1000) / 1000 : null;
  db.prepare(`
    INSERT OR REPLACE INTO audit_summary (audit_id, total_criteria, passed_count, not_null_count, pass_rate)
    VALUES (?, ?, ?, ?, ?)
  `).run(auditId, totalCriteria, passedCount, notNullCount, passRate);

  // 9. Recompute aggregates for this store, year, month
  recomputeStoreMonthAggregates(db, storeId, yr, monthNum);

  return {
    success: true,
    status: 'success',
    message: `Audit file "${fileName}" successfully processed and stored for ${officialStoreName} (${monthName} ${yr})!`,
    audit_id: auditId,
  };
}
