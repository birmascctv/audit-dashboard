#!/usr/bin/env python3
"""
Unified backend for audit-dashboard

Endpoints
- GET  /api/stats/categories?year=&month=&top=
- GET  /api/stats/store-trend?store_id=&limit=
- GET  /api/categories
- GET  /api/stores
- GET  /api/category/<category>/monthly?stores=&metric=
- GET  /api/category/<category>/passrate?stores=
- GET  /api/drilldown?store=&year=&month=&category=
"""
from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import os
from collections import defaultdict
from urllib.parse import unquote

# Configuration
DB_PATH = os.environ.get("AUDIT_DB_PATH", "/root/audit-dashboard/audit_birmas/audit_birmas.db")
DEFAULT_LIMIT_RECENT = 50

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def query_rows(sql, params=()):
    conn = get_conn()
    try:
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        return rows
    finally:
        conn.close()


def rows_to_series(rows):
    out = defaultdict(list)
    for store_id, year, month, val in rows:
        label = f"{int(year):04d}-{int(month):02d}"
        out[str(store_id)].append({"x": label, "y": None if val is None else float(val)})
    for k in out:
        out[k].sort(key=lambda p: p["x"])
    return out


def latest_year_month(conn):
    row = conn.execute("""
        SELECT year, month
        FROM audits
        ORDER BY year DESC, month DESC
        LIMIT 1
    """).fetchone()
    if row:
        return int(row["year"]), int(row["month"])
    return None, None


def parse_stores_param(raw):
    """
    Robust parsing for the 'stores' query parameter.
    Accepts:
      - empty string -> None (means all stores)
      - "1" -> [1]
      - "1,2,3" -> [1,2,3]
      - "1:1" or "1,2:1" -> strips trailing colon-suffix and parses numbers
    Returns None if no valid store ids found.
    """
    if not raw:
        return None
    # strip any trailing colon-suffix like ":1"
    raw = raw.split(':', 1)[0]
    parts = [p.strip() for p in raw.split(',') if p.strip()]
    ids = []
    for p in parts:
        if p.isdigit():
            ids.append(int(p))
        else:
            # ignore non-numeric parts
            app.logger.warning('Ignoring non-numeric store id part: %s', p)
    return ids if ids else None


# -------------------------
# Chart endpoints (from app.py)
# -------------------------
@app.route("/api/stats/categories")
def categories_stats():
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    top = request.args.get("top", type=int)

    conn = get_conn()
    try:
        if year is None or month is None:
            ly, lm = latest_year_month(conn)
            if ly is None:
                return jsonify({"labels": [], "datasets": []})
            if year is None:
                year = ly
            if month is None:
                month = lm

        cur = conn.execute("""
            SELECT category,
                   AVG(median_score) AS avg_median_score,
                   SUM(COALESCE(sample_size,0)) AS total_samples
            FROM category_store_monthly_median
            WHERE year = ? AND month = ?
            GROUP BY category
            ORDER BY avg_median_score DESC
        """, (year, month))

        rows = cur.fetchall()
        if not rows:
            return jsonify({"labels": [], "datasets": []})

        if top:
            rows = rows[:top]

        labels = [r["category"] for r in rows]
        data = [None if r["avg_median_score"] is None else round(r["avg_median_score"], 2) for r in rows]

        payload = {
            "labels": labels,
            "datasets": [
                {
                    "label": f"Median score {year}-{month:02d}",
                    "data": data,
                    "backgroundColor": "#ef4444"
                }
            ],
            "meta": {
                "year": year,
                "month": month,
                "total_categories": len(labels)
            }
        }
        return jsonify(payload)
    finally:
        conn.close()


@app.route("/api/stats/store-trend")
def store_trend():
    store_id = request.args.get("store_id", type=int)
    if not store_id:
        return jsonify({"error": "store_id required"}), 400
    limit = request.args.get("limit", default=24, type=int)

    rows = query_rows("""
        SELECT year, month, median_score
        FROM store_monthly_median
        WHERE store_id = ?
        ORDER BY year, month
        LIMIT ?
    """, (store_id, limit))

    labels = [f"{r['year']}-{int(r['month']):02d}" for r in rows]
    data = [None if r["median_score"] is None else round(r["median_score"], 2) for r in rows]

    return jsonify({
        "labels": labels,
        "datasets": [
            {
                "label": f"Store {store_id} median",
                "data": data,
                "borderColor": "#ef4444",
                "fill": False
            }
        ]
    })

# -------------------------
# Endpoints from api.py
# -------------------------
@app.route("/api/categories")
def categories():
    rows = query_rows("SELECT DISTINCT category FROM category_store_monthly_median ORDER BY category")
    return jsonify([r[0] for r in rows])


@app.route("/api/stores")
def stores():
    rows = query_rows("SELECT store_id, name FROM stores ORDER BY name")
    return jsonify([{"store_id": r[0], "name": r[1]} for r in rows])


@app.route("/api/category/<category>/monthly")
def category_monthly(category):
    category = unquote(category)
    stores_param = request.args.get("stores", "")
    year = request.args.get("year", type=int)
    metric = request.args.get("metric", "raw")  # raw or norm

    store_ids = parse_stores_param(stores_param)
    col = "median_score" if metric == "raw" else "median_normalized"

    params = [category]
    where_store = ""
    if store_ids:
        where_store = "AND store_id IN ({})".format(",".join("?" * len(store_ids)))
        params.extend(store_ids)
    where_year = ""
    if year:
        where_year = "AND year = ?"
        params.append(year)

    sql = f"""
        SELECT m.store_id, s.name AS store_name, m.year, m.month, {col}
        FROM category_store_monthly_median m
        JOIN stores s ON m.store_id = s.store_id
        WHERE m.category = ?
        {where_store}
        {where_year}
        ORDER BY m.year, m.month, m.store_id
    """
    rows = query_rows(sql, params)

    labels = sorted({f"{r['year']}-{int(r['month']):02d}" for r in rows})
    datasets = {}
    for r in rows:
        sid = r["store_id"]
        name = r["store_name"]
        if sid not in datasets:
            datasets[sid] = {
                "label": name,
                "data": [],
                "borderColor": f"hsl({sid * 47 % 360}, 70%, 50%)",  # consistent color per store_id
                "fill": False
            }
        datasets[sid]["data"].append(None if r[col] is None else float(r[col]))

    return jsonify({"labels": labels, "datasets": list(datasets.values())})


@app.route("/api/category/<category>/passrate")
def category_passrate(category):
    category = unquote(category)
    stores_param = request.args.get("stores", "")
    year = request.args.get("year", type=int)

    store_ids = parse_stores_param(stores_param)

    params = [category]
    where_store = ""
    if store_ids:
        where_store = "AND store_id IN ({})".format(",".join("?" * len(store_ids)))
        params.extend(store_ids)
    where_year = ""
    if year:
        where_year = "AND year = ?"
        params.append(year)

    sql = f"""
        SELECT m.store_id, s.name AS store_name, m.year, m.month, m.pass_rate
        FROM category_store_monthly_passrate m
        JOIN stores s ON m.store_id = s.store_id
        WHERE m.category = ?
        {where_store}
        {where_year}
        ORDER BY m.year, m.month, m.store_id
    """
    rows = query_rows(sql, params)

    labels = sorted({f"{r['year']}-{int(r['month']):02d}" for r in rows})
    datasets = {}
    for r in rows:
        sid = r["store_id"]
        name = r["store_name"]
        if sid not in datasets:
            datasets[sid] = {
                "label": f"{name} Pass Rate",
                "data": [],
                "borderColor": f"hsl({sid * 47 % 360}, 70%, 50%)",
                "fill": False
            }
        datasets[sid]["data"].append(None if r["pass_rate"] is None else float(r["pass_rate"]))

    return jsonify({"labels": labels, "datasets": list(datasets.values())})


@app.route("/api/passing-grades")
def passing_grades():
    rows = query_rows("""
        SELECT DISTINCT category, passing_grade
        FROM criteria
        ORDER BY category
    """)
    result = {r["category"]: r["passing_grade"] for r in rows}
    return jsonify(result)


@app.route("/api/drilldown")
def drilldown():
    store = request.args.get("store")
    year = request.args.get("year")
    month = request.args.get("month")
    category = request.args.get("category")
    if not (store and year and month and category):
        return jsonify({"error": "missing params"}), 400

    rows = query_rows("""
        SELECT c.name, c.passing_grade, sc.score, sc.pass_fail, sc.notes
        FROM scores sc
        JOIN criteria c ON sc.criteria_id = c.criteria_id
        JOIN audits a ON sc.audit_id = a.audit_id
        WHERE a.store_id=? AND a.year=? AND a.month=? AND c.category=?
        ORDER BY c.passing_grade ASC, c.name ASC
    """, (store, year, month, category))

    result = [{"name": r[0], "passing_grade": r[1], "score": r[2], "pass_fail": r[3], "notes": r[4]} for r in rows]
    return jsonify(result)


# -------------------------
# Health endpoint
# -------------------------
@app.route("/api/health")
def health():
    try:
        conn = get_conn()
        conn.execute("SELECT 1").fetchone()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


if __name__ == "__main__":
    # Development server
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
