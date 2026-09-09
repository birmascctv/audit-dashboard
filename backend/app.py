#!/usr/bin/env python3
"""
Unified backend for audit-dashboard

Endpoints
- GET  /api/stats/categories?year=&month=&top=
- GET  /api/stats/store-trend?store_id=&limit=
- GET  /api/categories
- GET  /api/stores
- GET  /api/criteria
- GET  /api/category/<category>/monthly?stores=&metric=
- GET  /api/category/<category>/criterion/<criterion>/monthly?stores=&year=
- GET  /api/category/<category>/passrate?stores=
- GET  /api/passing-grades
- GET  /api/drilldown?store=&year=&month=&category=
"""
from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import os
import sys
from collections import defaultdict
from urllib.parse import unquote
import statistics

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


# Distinct, high-contrast qualitative color palette used for per-store lines/
# bars (avoids the old hsl(id*47 % 360) formula, which produced two
# similar-looking greens). Also reused (offset) for per-category series.
COLOR_PALETTE = [
    "#ef4444",  # red
    "#22c55e",  # green
    "#3b82f6",  # blue
    "#f59e0b",  # amber
    "#a855f7",  # purple
    "#06b6d4",  # cyan
    "#ec4899",  # pink
    "#84cc16",  # lime
    "#f97316",  # orange
    "#14b8a6",  # teal
]


def color_for_id(entity_id):
    """Deterministic, high-contrast color for a store/category id."""
    return COLOR_PALETTE[(int(entity_id) - 1) % len(COLOR_PALETTE)]


def table_has_column(table, column):
    """Return True if SQLite table has the given column."""
    conn = get_conn()
    try:
        cur = conn.execute(f"PRAGMA table_info({table})")
        cols = [r["name"] for r in cur.fetchall()]
        return column in cols
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
# Endpoints from api.py (extended)
# -------------------------
@app.route("/api/categories")
def categories():
    rows = query_rows("SELECT DISTINCT category FROM category_store_monthly_median ORDER BY category")
    return jsonify([r[0] for r in rows])


@app.route("/api/stores")
def stores():
    rows = query_rows("SELECT store_id, name FROM stores ORDER BY name")
    return jsonify([{"store_id": r[0], "name": r[1]} for r in rows])


@app.route("/api/criteria")
def criteria_list():
    """
    Return list of criteria with id, label (name), category, unit (if available) and passing_grade.

    Query params:
      - year: only return criteria recorded for this exact year (e.g. 2025)
      - exclude_year: only return criteria NOT recorded for this year (e.g. 2025)
    """
    try:
        year = request.args.get("year", type=int)
        exclude_year = request.args.get("exclude_year", type=int)

        where = ""
        params = []
        if year is not None:
            where = "WHERE year = ?"
            params.append(str(year))
        elif exclude_year is not None:
            where = "WHERE year != ?"
            params.append(str(exclude_year))

        include_unit = table_has_column("criteria", "unit")
        if include_unit:
            rows = query_rows(f"""
                SELECT criteria_id, name, category, passing_grade, unit
                FROM criteria
                {where}
                ORDER BY category, name
            """, params)
            out = []
            for r in rows:
                out.append({
                    "id": r["criteria_id"],
                    "label": r["name"],
                    "category": r["category"],
                    "passing_grade": r["passing_grade"],
                    "unit": r["unit"] if "unit" in r.keys() else None
                })
        else:
            rows = query_rows(f"""
                SELECT criteria_id, name, category, passing_grade
                FROM criteria
                {where}
                ORDER BY category, name
            """, params)
            out = []
            for r in rows:
                out.append({
                    "id": r["criteria_id"],
                    "label": r["name"],
                    "category": r["category"],
                    "passing_grade": r["passing_grade"],
                    "unit": None
                })
        return jsonify(out)
    except Exception:
        app.logger.exception("criteria_list failed")
        return jsonify([]), 500


@app.route("/api/category/<category>/monthly")
def category_monthly(category):
    try:
        category = unquote(category)
        stores_param = request.args.get("stores", "")
        year = request.args.get("year", type=int)
        metric = request.args.get("metric", "raw")  # raw or norm

        store_ids = parse_stores_param(stores_param)
        col = "median_score" if metric == "raw" else "median_normalized"

        params = [category]
        where_store = ""
        if store_ids:
            # qualify the column with the table alias to avoid ambiguity
            where_store = "AND m.store_id IN ({})".format(",".join("?" * len(store_ids)))
            params.extend(store_ids)
        where_year = ""
        if year:
            where_year = "AND m.year = ?"
            params.append(year)

        sql = f"""
            SELECT m.store_id AS m_store_id, s.name AS store_name, m.year, m.month, {col}
            FROM category_store_monthly_median m
            JOIN stores s ON m.store_id = s.store_id
            WHERE m.category = ?
            {where_store}
            {where_year}
            ORDER BY m.year, m.month, m.store_id
        """
        rows = query_rows(sql, params)

        labels = sorted({f"{r['year']}-{int(r['month']):02d}" for r in rows})
        label_index = {lbl: i for i, lbl in enumerate(labels)}
        datasets = {}
        for r in rows:
            sid = r["m_store_id"]
            name = r["store_name"]
            if sid not in datasets:
                datasets[sid] = {
                    "label": name,
                    "data": [None] * len(labels),
                    "borderColor": color_for_id(sid),  # consistent color per store_id
                    "fill": False
                }
            lbl = f"{r['year']}-{int(r['month']):02d}"
            datasets[sid]["data"][label_index[lbl]] = None if r[col] is None else float(r[col])

        return jsonify({"labels": labels, "datasets": list(datasets.values())})
    except Exception:
        app.logger.exception("category_monthly failed for category=%s stores=%s year=%s", category, request.args.get("stores"), request.args.get("year"))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/category/<category>/criterion/<criterion>/monthly")
def category_criterion_monthly(category, criterion):
    """
    Return monthly series for a single criterion within a category.
    'criterion' may be criteria_id (numeric) or criteria name (string).
    This endpoint aggregates scores per store/year/month for the given criterion,
    using the median across all audits recorded in that month per store.
    """
    try:
        category = unquote(category)
        # criterion may be passed in path or as query param; prefer path param
        crit_raw = criterion if criterion is not None else request.args.get("criterion")
        stores_param = request.args.get("stores", "")
        year = request.args.get("year", type=int)

        store_ids = parse_stores_param(stores_param)

        # resolve criterion id if a name was provided
        conn = get_conn()
        try:
            crit_id = None
            if str(crit_raw).isdigit():
                crit_id = int(crit_raw)
            else:
                row = conn.execute("SELECT criteria_id FROM criteria WHERE name = ? AND category = ? LIMIT 1", (crit_raw, category)).fetchone()
                if row:
                    crit_id = int(row["criteria_id"])

            if not crit_id:
                # try to find by id in path param
                row = conn.execute("SELECT criteria_id FROM criteria WHERE criteria_id = ? LIMIT 1", (crit_raw,)).fetchone()
                if row:
                    crit_id = int(row["criteria_id"])

            if not crit_id:
                return jsonify({"error": "criterion not found"}), 404

            params = [crit_id]
            where_store = ""
            if store_ids:
                where_store = "AND a.store_id IN ({})".format(",".join("?" * len(store_ids)))
                params.extend(store_ids)
            where_year = ""
            if year:
                where_year = "AND a.year = ?"
                params.append(year)

            # Fetch raw per-audit scores; the median (not average) is used
            # per store/year/month so that multiple audits within the same
            # month don't produce non-integer values when every individual
            # score is itself an integer.
            sql = f"""
                SELECT a.store_id AS a_store_id, s.name AS store_name, a.year, a.month,
                       sc.score AS score
                FROM scores sc
                JOIN audits a ON sc.audit_id = a.audit_id
                JOIN stores s ON a.store_id = s.store_id
                WHERE sc.criteria_id = ?
                {where_store}
                {where_year}
                ORDER BY a.year, a.month, a.store_id
            """
            rows = conn.execute(sql, params).fetchall()

            # group raw scores per (store, label) so we can compute the
            # median across all audits recorded in that month
            groups = defaultdict(list)
            store_names = {}
            raw_by_label = defaultdict(list)
            for r in rows:
                sid = r["a_store_id"]
                store_names[sid] = r["store_name"]
                lbl = f"{r['year']}-{int(r['month']):02d}"
                if r["score"] is not None:
                    groups[(sid, lbl)].append(float(r["score"]))
                    # raw (ungrouped) scores across ALL selected stores for
                    # this month, used for the true "sum of all data divided
                    # by count of all data" average — NOT an average of
                    # per-store medians, so a store with more audits in a
                    # given month contributes proportionally more data points
                    raw_by_label[lbl].append(float(r["score"]))

            labels = sorted({lbl for (_, lbl) in groups.keys()})
            label_index = {lbl: i for i, lbl in enumerate(labels)}
            datasets = {}
            for (sid, lbl), scores in groups.items():
                if sid not in datasets:
                    datasets[sid] = {
                        "label": store_names[sid],
                        "data": [None] * len(labels),
                        "borderColor": color_for_id(sid),
                        "fill": False
                    }
                datasets[sid]["data"][label_index[lbl]] = statistics.median(scores) if scores else None

            average = []
            average_count = []
            for lbl in labels:
                vals = raw_by_label.get(lbl) or []
                average.append(round(sum(vals) / len(vals), 3) if vals else None)
                average_count.append(len(vals))

            return jsonify({"labels": labels, "datasets": list(datasets.values()), "average": average, "average_count": average_count})
        finally:
            conn.close()
    except Exception:
        app.logger.exception("category_criterion_monthly failed for category=%s criterion=%s", category, criterion)
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/category/<category>/passrate")
def category_passrate(category):
    try:
        category = unquote(category)
        stores_param = request.args.get("stores", "")
        year = request.args.get("year", type=int)

        store_ids = parse_stores_param(stores_param)

        params = [category]
        where_store = ""
        if store_ids:
            # qualify the column with the table alias to avoid ambiguity
            where_store = "AND m.store_id IN ({})".format(",".join("?" * len(store_ids)))
            params.extend(store_ids)
        where_year = ""
        if year:
            where_year = "AND m.year = ?"
            params.append(year)

        sql = f"""
            SELECT m.store_id AS m_store_id, s.name AS store_name, m.year, m.month, m.pass_rate
            FROM category_store_monthly_passrate m
            JOIN stores s ON m.store_id = s.store_id
            WHERE m.category = ?
            {where_store}
            {where_year}
            ORDER BY m.year, m.month, m.store_id
        """
        rows = query_rows(sql, params)

        labels = sorted({f"{r['year']}-{int(r['month']):02d}" for r in rows})
        label_index = {lbl: i for i, lbl in enumerate(labels)}
        datasets = {}
        for r in rows:
            sid = r["m_store_id"]
            name = r["store_name"]
            if sid not in datasets:
                datasets[sid] = {
                    "label": name,
                    "data": [None] * len(labels),
                    "borderColor": color_for_id(sid),
                    "fill": False
                }
            lbl = f"{r['year']}-{int(r['month']):02d}"
            datasets[sid]["data"][label_index[lbl]] = None if r["pass_rate"] is None else float(r["pass_rate"])

        return jsonify({"labels": labels, "datasets": list(datasets.values())})
    except Exception:
        app.logger.exception("category_passrate failed for category=%s stores=%s year=%s", category, request.args.get("stores"), request.args.get("year"))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/store/<int:store_id>/passrate")
def store_passrate(store_id):
    """
    Mirror of /api/category/<category>/passrate but pivoted: one chart per
    store, with categories as the grouped/clustered bar series instead of
    stores. Powers the "Store Passing Rate" section.
    """
    try:
        year = request.args.get("year", type=int)

        params = [store_id]
        where_year = ""
        if year:
            where_year = "AND m.year = ?"
            params.append(year)

        sql = f"""
            SELECT m.category, m.year, m.month, m.pass_rate
            FROM category_store_monthly_passrate m
            WHERE m.store_id = ?
            {where_year}
            ORDER BY m.year, m.month, m.category
        """
        rows = query_rows(sql, params)

        # stable category -> color index, based on alphabetical order of all
        # known categories (independent of any per-request filtering)
        all_categories = sorted({r["category"] for r in query_rows("SELECT DISTINCT category FROM category_store_monthly_passrate")})
        category_index = {c: i + 1 for i, c in enumerate(all_categories)}

        labels = sorted({f"{r['year']}-{int(r['month']):02d}" for r in rows})
        label_index = {lbl: i for i, lbl in enumerate(labels)}
        datasets = {}
        for r in rows:
            cat = r["category"]
            if cat not in datasets:
                datasets[cat] = {
                    "label": cat,
                    "data": [None] * len(labels),
                    "borderColor": color_for_id(category_index.get(cat, 1)),
                    "fill": False
                }
            lbl = f"{r['year']}-{int(r['month']):02d}"
            datasets[cat]["data"][label_index[lbl]] = None if r["pass_rate"] is None else float(r["pass_rate"])

        return jsonify({"labels": labels, "datasets": list(datasets.values())})
    except Exception:
        app.logger.exception("store_passrate failed for store_id=%s year=%s", store_id, request.args.get("year"))
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/passing-grades")
def passing_grades():
    """
    Return a mapping of category -> {
      categoryPassingGrade: <number>,
      unit: <optional unit string>,
      criteria: { <criterion_name_or_id>: <passing_grade>, ... }
    }

    categoryPassingGrade is computed as the median of the criteria passing grades for that category
    when an explicit category-level value is not available.

    Query params:
      - year: only consider criteria recorded for this exact year (e.g. 2025)
      - exclude_year: only consider criteria NOT recorded for this year (e.g. 2025)
    """
    try:
        year = request.args.get("year", type=int)
        exclude_year = request.args.get("exclude_year", type=int)

        where = ""
        params = []
        if year is not None:
            where = "WHERE year = ?"
            params.append(str(year))
        elif exclude_year is not None:
            where = "WHERE year != ?"
            params.append(str(exclude_year))

        include_unit = table_has_column("criteria", "unit")
        if include_unit:
            rows = query_rows(f"""
                SELECT criteria_id, name, category, passing_grade, unit
                FROM criteria
                {where}
                ORDER BY category, name
            """, params)
        else:
            rows = query_rows(f"""
                SELECT criteria_id, name, category, passing_grade
                FROM criteria
                {where}
                ORDER BY category, name
            """, params)
        by_cat = {}
        for r in rows:
            cat = r["category"]
            if cat not in by_cat:
                by_cat[cat] = {"criteria": {}, "unit": None, "values": []}
            # key by criteria_id (not name) — criteria with the same name
            # can exist across different years (e.g. 2025 vs 2026) with
            # different passing grades, and must not collide/overwrite
            key = str(r["criteria_id"])
            val = r["passing_grade"]
            by_cat[cat]["criteria"][key] = val
            if val is not None:
                try:
                    by_cat[cat]["values"].append(float(val))
                except Exception:
                    pass
            if by_cat[cat]["unit"] is None and include_unit and "unit" in r.keys():
                by_cat[cat]["unit"] = r["unit"]

        result = {}
        for cat, info in by_cat.items():
            vals = info["values"]
            cat_pass = None
            if vals:
                try:
                    cat_pass = float(statistics.median(vals))
                except Exception:
                    cat_pass = None
            result[cat] = {
                "categoryPassingGrade": cat_pass,
                "unit": info.get("unit") or None,
                "criteria": info["criteria"]
            }
        return jsonify(result)
    except Exception:
        app.logger.exception("passing_grades failed")
        return jsonify({}), 500


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
# Upload Data endpoint
# -------------------------
AUDIT_ROOT = "/root/audit-dashboard/audit_birmas"
IMPORT_SCRIPT = os.path.join(AUDIT_ROOT, "import_audit_data.py")
REIMPORT_LOCK_PATH = os.path.join(AUDIT_ROOT, ".reimport.lock")
REQUIRED_UPLOAD_COLUMNS = {"Category", "Criteria", "Score", "Passing Grade"}
MONTH_NAMES = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
]


@app.route("/api/months")
def api_months():
    return jsonify(MONTH_NAMES)


def _run_reimport():
    """Serialize + re-run the CSV->SQLite import script so the DB reflects
    whatever is currently on disk under audit_birmas/. Gunicorn runs several
    worker *processes*, so an in-process lock wouldn't be shared between
    them; a flock on a dedicated lock file works across processes."""
    import subprocess
    import fcntl
    with open(REIMPORT_LOCK_PATH, "w") as lockfile:
        fcntl.flock(lockfile, fcntl.LOCK_EX)
        try:
            proc = subprocess.run(
                [sys.executable, IMPORT_SCRIPT],
                cwd=AUDIT_ROOT, capture_output=True, text=True, timeout=300
            )
            if proc.returncode != 0:
                raise RuntimeError(f"import script failed (exit {proc.returncode}): {proc.stderr[-2000:]}")
        finally:
            fcntl.flock(lockfile, fcntl.LOCK_UN)


@app.route("/api/upload", methods=["POST"])
def upload_data():
    import shutil
    import tempfile
    import re
    from datetime import datetime

    store = (request.form.get("store") or "").strip()
    year = (request.form.get("year") or "").strip()
    month = (request.form.get("month") or "").strip()
    confirm = (request.form.get("confirm") or "").strip() == "1"
    file = request.files.get("file")

    if not store or not year or not month or not file or not file.filename:
        return jsonify({"status": "error", "mode": None,
                         "message": "Store, year, month, and a CSV file are all required."}), 400

    if not year.isdigit():
        return jsonify({"status": "error", "mode": None, "message": "Year must be a number."}), 400

    if month not in MONTH_NAMES:
        return jsonify({"status": "error", "mode": None, "message": "Invalid month."}), 400

    if not file.filename.lower().endswith(".csv"):
        return jsonify({"status": "error", "mode": None,
                         "message": "Data failed to upload: only .csv files are accepted."}), 400

    # The uploaded filename itself is never sanitized/renamed (spaces are
    # kept as-is) — we only strip any directory portion (os.path.basename)
    # and reject path-traversal characters, so the file on disk keeps
    # exactly the name the user uploaded it with.
    filename = os.path.basename(file.filename).strip()
    if not filename or filename in (".", "..") or "/" in filename or "\\" in filename:
        return jsonify({"status": "error", "mode": None,
                         "message": "Invalid file name."}), 400

    # Sanity check to help catch accidental wrong month/year selections:
    # every real audit CSV filename ends with "<Month> <Year>.csv" (e.g.
    # "Birmas - Kuningan per 09 Juli 2025.csv"), so if the selected
    # month/year don't appear at the end of the filename, ask the user to
    # confirm before proceeding (unless they already did, via confirm=1).
    name_no_ext = re.sub(r"\.csv$", "", filename, flags=re.IGNORECASE).strip()
    expected_suffix = re.compile(rf"{re.escape(month)}\s+{re.escape(year)}\s*$", re.IGNORECASE)
    if not confirm and not expected_suffix.search(name_no_ext):
        return jsonify({
            "status": "confirm_required", "mode": None,
            "message": f"The file name \"{filename}\" doesn't seem to end with \"{month} {year}\" "
                       f"— please double-check the store/year/month you selected match this file. "
                       f"Click Upload again to proceed anyway."
        }), 200

    # Read + validate the uploaded CSV's format (columns) before writing
    # anything to disk.
    try:
        import pandas as pd
        raw_bytes = file.read()
        with tempfile.NamedTemporaryFile(suffix=".csv") as tmp:
            tmp.write(raw_bytes)
            tmp.flush()
            new_df = pd.read_csv(tmp.name)
    except Exception as e:
        app.logger.exception("upload: failed to parse CSV")
        return jsonify({"status": "error", "mode": None,
                         "message": f"Data failed to upload for other reasons (could not read CSV: {e})."}), 500

    missing_cols = REQUIRED_UPLOAD_COLUMNS - set(str(c).strip() for c in new_df.columns)
    if missing_cols:
        return jsonify({"status": "error", "mode": None,
                         "message": f"Data has different table format (failed to upload). "
                                    f"Missing columns: {', '.join(sorted(missing_cols))}."}), 400

    # Store names contain spaces (e.g. "Birmas Kelapa Gading") and must
    # match the existing on-disk folder name exactly, so we don't run them
    # through secure_filename() (which would turn spaces into underscores
    # and break the match) — instead just reject path-traversal characters
    # and require it to already be a known store.
    known_stores = {r[0] for r in query_rows("SELECT name FROM stores")}
    if store not in known_stores or "/" in store or "\\" in store or ".." in store:
        return jsonify({"status": "error", "mode": None,
                         "message": "Unknown store selected."}), 400

    # month folder omits the year suffix (e.g. "Januari") since
    # import_audit_data.py's normalize_month() only reads the first
    # whitespace-separated token anyway, so "Januari" and "Januari 2026"
    # are handled identically.
    target_dir = os.path.join(AUDIT_ROOT, store, year, month)
    try:
        os.makedirs(target_dir, exist_ok=True)
    except Exception as e:
        app.logger.exception("upload: failed to create target directory")
        return jsonify({"status": "error", "mode": None,
                         "message": f"Data failed to upload for other reasons (could not create folder: {e})."}), 500

    target_path = os.path.join(target_dir, filename)

    mode = "added"
    backup_path = None
    existed_before = os.path.exists(target_path)

    if existed_before:
        try:
            old_df = pd.read_csv(target_path)
            # Compare on the normalized data content, not on incidental
            # differences (like a trailing "No" or column ordering).
            def _norm(df):
                cols = [c for c in ["Category", "Criteria", "Score", "Passing Grade", "Pass/Not Pass", "Infraction Details"] if c in df.columns]
                d = df[cols].copy()
                for c in d.columns:
                    d[c] = d[c].astype(str).str.strip()
                return d.sort_values(list(d.columns)).reset_index(drop=True)

            if _norm(old_df).equals(_norm(new_df)):
                return jsonify({"status": "unchanged", "mode": "unchanged",
                                 "message": "Data is the same as what's already on file, no need to save."})
        except Exception:
            # If the existing file can't be parsed for comparison, fall
            # through and treat this as an update (safer than blocking).
            app.logger.warning("upload: could not compare against existing file, treating as update")

        # Keep the old file around (per user's request) instead of
        # overwriting it outright.
        ts = datetime.now().strftime("%Y%m%d%H%M%S")
        backup_path = target_path + f".bak-{ts}.csv"
        shutil.move(target_path, backup_path)
        mode = "updated"

    try:
        with open(target_path, "wb") as f:
            f.write(raw_bytes)
    except Exception as e:
        app.logger.exception("upload: failed to save file")
        if backup_path:
            shutil.move(backup_path, target_path)
        return jsonify({"status": "error", "mode": None,
                         "message": f"Data failed to upload for other reasons (could not save file: {e})."}), 500

    try:
        _run_reimport()
    except Exception as e:
        app.logger.exception("upload: reimport failed, rolling back")
        # Roll back the file-system change so disk state matches the DB.
        try:
            if mode == "added":
                os.remove(target_path)
            elif mode == "updated" and backup_path:
                os.remove(target_path)
                shutil.move(backup_path, target_path)
        except Exception:
            app.logger.exception("upload: rollback of saved file also failed")
        return jsonify({"status": "error", "mode": None,
                         "message": f"Data failed to upload for other reasons (database update failed: {e})."}), 500

    verb = "added" if mode == "added" else "updated"
    return jsonify({"status": "success", "mode": mode,
                     "message": f"Data uploaded successfully and {verb} for {store} / {month} {year}."})


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
