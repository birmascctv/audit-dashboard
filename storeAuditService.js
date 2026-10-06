import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CCTV_DB_PATH = process.env.AUDIT_DB_PATH || path.join(__dirname, 'audit_birmas', 'audit_birmas.db');

let cctvDbInstance = null;

export function getCctvDb() {
  if (!cctvDbInstance) {
    if (fs.existsSync(CCTV_DB_PATH)) {
      cctvDbInstance = new DatabaseSync(CCTV_DB_PATH);
    }
  }
  return cctvDbInstance;
}

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

// 3. Criteria list
export function getCctvCriteria(query = {}) {
  const db = getCctvDb();
  if (!db) return [];
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

    const rows = db.prepare(`
      SELECT criteria_id, name, category, passing_grade, unit, metrics
      FROM criteria
      ${where}
      ORDER BY category, name
    `).all(...params);

    return rows.map((r) => ({
      id: r.criteria_id,
      label: r.name,
      category: r.category,
      passing_grade: r.passing_grade,
      unit: r.unit || null,
      metrics: r.metrics || null,
    }));
  } catch (err) {
    console.error('getCctvCriteria error:', err.message);
    return [];
  }
}

// 4. Category Monthly Trends
export function getCategoryMonthly(category, query = {}) {
  const db = getCctvDb();
  if (!db) return { labels: [], datasets: [] };
  try {
    const storeIds = parseStoresParam(query.stores);
    const year = query.year ? parseInt(query.year, 10) : null;
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

    const params = [storeId];
    let whereYear = '';
    if (year) {
      whereYear = 'AND m.year = ?';
      params.push(year);
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

    const rows = db.prepare(`
      SELECT criteria_id, name, category, passing_grade, unit
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

    let sql = `
      SELECT sc.score_id, sc.audit_id, sc.criteria_id, sc.score, sc.notes,
             a.store_id, s.name AS store_name, a.year, a.month, a.audit_date,
             c.name AS criteria_name, c.category, c.passing_grade, c.unit, c.metrics
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

    sql += ' ORDER BY a.audit_date DESC, sc.score ASC LIMIT 200';

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
      SELECT a.audit_id, a.store_id, s.name AS store_name, a.year, a.month, a.audit_date, a.file_path, a.created_at,
             COUNT(sc.score_id) AS total_scores,
             AVG(sc.score) AS average_score
      FROM audits a
      JOIN stores s ON a.store_id = s.store_id
      LEFT JOIN scores sc ON a.audit_id = sc.audit_id
      GROUP BY a.audit_id
      ORDER BY a.year DESC, a.month DESC, a.audit_date DESC
    `).all();

    return rows.map((r) => ({
      audit_id: r.audit_id,
      store_id: r.store_id,
      store_name: r.store_name,
      year: r.year,
      month: r.month,
      audit_date: r.audit_date,
      file_path: r.file_path,
      created_at: r.created_at,
      filename: r.file_path ? path.basename(r.file_path) : `Audit_${r.store_name}_${r.year}_${r.month}.csv`,
      total_scores: r.total_scores,
      average_score: r.average_score ? Number(r.average_score.toFixed(2)) : null,
    }));
  } catch (err) {
    console.error('getCctvUploadedFiles error:', err.message);
    return [];
  }
}
