#!/usr/bin/env python3
from flask import Flask, jsonify, request
import sqlite3
from collections import defaultdict
from flask_cors import CORS

DB_PATH = "/root/audit-dashboard/audit_birmas/audit_birmas.db"

app = Flask(__name__)
CORS(app)  # enable CORS for dev; tighten in production

def query(sql, params=()):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(sql, params)
    rows = cur.fetchall()
    conn.close()
    return rows

@app.route("/api/categories")
def categories():
    rows = query("SELECT DISTINCT category FROM category_store_monthly_median ORDER BY category")
    return jsonify([r[0] for r in rows])

@app.route("/api/stores")
def stores():
    rows = query("SELECT store_id, name FROM stores ORDER BY name")
    return jsonify([{"store_id": r[0], "name": r[1]} for r in rows])

def rows_to_series(rows):
    out = defaultdict(list)
    for store_id, year, month, val in rows:
        label = f"{int(year):04d}-{int(month):02d}"
        out[str(store_id)].append({"x": label, "y": None if val is None else float(val)})
    for k in out:
        out[k].sort(key=lambda p: p["x"])
    return out

@app.route("/api/category/<category>/monthly")
def category_monthly(category):
    stores_param = request.args.get("stores", "")
    metric = request.args.get("metric", "raw")  # raw or norm
    store_ids = [int(s) for s in stores_param.split(",") if s.strip().isdigit()]
    col = "median_score" if metric == "raw" else "median_normalized"
    params = []
    where_store = ""
    if store_ids:
        where_store = "AND store_id IN ({})".format(",".join("?"*len(store_ids)))
        params.extend(store_ids)
    sql = f"""
        SELECT store_id, year, month, {col}
        FROM category_store_monthly_median
        WHERE category = ?
        {where_store}
        ORDER BY year, month, store_id
    """
    params = [category] + params
    rows = query(sql, params)
    series = rows_to_series(rows)
    return jsonify(series)

@app.route("/api/category/<category>/passrate")
def category_passrate(category):
    stores_param = request.args.get("stores", "")
    store_ids = [int(s) for s in stores_param.split(",") if s.strip().isdigit()]
    params = []
    where_store = ""
    if store_ids:
        where_store = "AND store_id IN ({})".format(",".join("?"*len(store_ids)))
        params.extend(store_ids)
    sql = f"""
        SELECT store_id, year, month, pass_rate
        FROM category_store_monthly_passrate
        WHERE category = ?
        {where_store}
        ORDER BY year, month, store_id
    """
    params = [category] + params
    rows = query(sql, params)
    series = rows_to_series(rows)
    return jsonify(series)

@app.route("/api/drilldown")
def drilldown():
    # expects store, year, month, category
    store = request.args.get("store")
    year = request.args.get("year")
    month = request.args.get("month")
    category = request.args.get("category")
    if not (store and year and month and category):
        return jsonify({"error":"missing params"}), 400
    rows = query("""
        SELECT c.name, c.passing_grade, sc.score, sc.pass_fail, sc.notes
        FROM scores sc
        JOIN criteria c ON sc.criteria_id = c.criteria_id
        JOIN audits a ON sc.audit_id = a.audit_id
        WHERE a.store_id=? AND a.year=? AND a.month=? AND c.category=?
        ORDER BY c.passing_grade ASC, c.name ASC
    """, (store, year, month, category))
    result = [{"name": r[0], "passing_grade": r[1], "score": r[2], "pass_fail": r[3], "notes": r[4]} for r in rows]
    return jsonify(result)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
