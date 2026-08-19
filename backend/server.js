const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');

const app = express();
app.use(cors());

// Point to your existing DB in audit_birmas
const db = new Database('D:\\audit-dashboard\\audit_birmas\\audit_birmas.db');

// Utility: median calculation
function median(values) {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 !== 0
    ? values[mid]
    : (values[mid - 1] + values[mid]) / 2;
}

// Endpoint: 2025 data
app.get('/api/median/2025', (req, res) => {
  const rows = db.prepare(`
    SELECT s.store_id, a.year, a.month, c.category, sc.score
    FROM scores sc
    JOIN audits a ON sc.audit_id = a.audit_id
    JOIN stores s ON a.store_id = s.store_id
    JOIN criteria c ON sc.criteria_id = c.criteria_id
    WHERE a.year = 2025
  `).all();

  const grouped = {};
  rows.forEach(r => {
    const key = `${r.store_id}-${r.category}-${r.month}`;
    if (!grouped[key]) grouped[key] = [];
    if (r.score !== null) grouped[key].push(r.score);
  });

  const result = Object.entries(grouped).map(([key, scores]) => {
    const [store_id, category, month] = key.split('-');
    return {
      store_id: parseInt(store_id),
      category,
      month: parseInt(month),
      median: median(scores)
    };
  });

  res.json(result);
});

// Endpoint: other years
app.get('/api/median/others', (req, res) => {
  const rows = db.prepare(`
    SELECT s.store_id, a.year, a.month, c.category, sc.score
    FROM scores sc
    JOIN audits a ON sc.audit_id = a.audit_id
    JOIN stores s ON a.store_id = s.store_id
    JOIN criteria c ON sc.criteria_id = c.criteria_id
    WHERE a.year != 2025
  `).all();

  const grouped = {};
  rows.forEach(r => {
    const key = `${r.store_id}-${r.category}-${r.year}-${r.month}`;
    if (!grouped[key]) grouped[key] = [];
    if (r.score !== null) grouped[key].push(r.score);
  });

  const result = Object.entries(grouped).map(([key, scores]) => {
    const [store_id, category, year, month] = key.split('-');
    return {
      store_id: parseInt(store_id),
      category,
      year: parseInt(year),
      month: parseInt(month),
      median: median(scores)
    };
  });

  res.json(result);
});

app.listen(3000, () => console.log('Backend running on http://localhost:3000'));
