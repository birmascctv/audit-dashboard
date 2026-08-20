import os
import sqlite3
import pandas as pd

# Adjust path for your droplet
root_folder = "/root/audit_birmas"
db_path = os.path.join(root_folder, "audit_birmas.db")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Tables
cursor.executescript("""
DROP TABLE IF EXISTS store_monthly_avg;
DROP TABLE IF EXISTS category_store_avg;
DROP TABLE IF EXISTS category_global_avg;

CREATE TABLE IF NOT EXISTS stores (
    store_id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS audits (
    audit_id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    file_name TEXT,
    FOREIGN KEY (store_id) REFERENCES stores(store_id)
);

CREATE TABLE IF NOT EXISTS criteria (
    criteria_id INTEGER PRIMARY KEY,
    year INTEGER NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    passing_grade REAL,
    UNIQUE(year, name)
);

CREATE TABLE IF NOT EXISTS scores (
    score_id INTEGER PRIMARY KEY,
    audit_id INTEGER NOT NULL,
    criteria_id INTEGER NOT NULL,
    score REAL,
    pass_fail TEXT,
    notes TEXT,
    FOREIGN KEY (audit_id) REFERENCES audits(audit_id),
    FOREIGN KEY (criteria_id) REFERENCES criteria(criteria_id)
);

CREATE TABLE IF NOT EXISTS audit_summary (
    summary_id INTEGER PRIMARY KEY,
    audit_id INTEGER NOT NULL,
    total_criteria INTEGER,
    passed_count INTEGER,
    not_null_count INTEGER,
    pass_rate REAL,
    FOREIGN KEY (audit_id) REFERENCES audits(audit_id)
);

CREATE TABLE IF NOT EXISTS store_monthly_median (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    median_score REAL,
    FOREIGN KEY (store_id) REFERENCES stores(store_id)
);

CREATE TABLE IF NOT EXISTS category_store_median (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    median_score REAL,
    FOREIGN KEY (store_id) REFERENCES stores(store_id)
);

CREATE TABLE IF NOT EXISTS category_global_median (
    id INTEGER PRIMARY KEY,
    category TEXT NOT NULL,
    median_score REAL
);
""")

# 🔥 Wipe old data before re-import
cursor.executescript("""
DELETE FROM audits;
DELETE FROM scores;
DELETE FROM criteria;
DELETE FROM audit_summary;
DELETE FROM store_monthly_median;
DELETE FROM category_store_median;
DELETE FROM category_global_median;
""")

# Month map
month_map = {
    "Januari": 1, "Februari": 2, "Maret": 3, "April": 4,
    "Mei": 5, "Juni": 6, "Juli": 7, "Agustus": 8,
    "September": 9, "Oktober": 10, "November": 11, "Desember": 12
}

def normalize_month(month_str):
    parts = month_str.strip().split()
    month_name = parts[0]
    return month_map.get(month_name, None)

def median(values):
    if not values:
        return None
    values = sorted(values)
    mid = len(values) // 2
    if len(values) % 2 == 0:
        return round((values[mid - 1] + values[mid]) / 2, 2)
    else:
        return round(values[mid], 2)

# Collect audits first
audit_entries = []

for store_name in sorted(os.listdir(root_folder)):
    store_path = os.path.join(root_folder, store_name)
    if not os.path.isdir(store_path) or store_name == "venv":
        continue

    cursor.execute("INSERT OR IGNORE INTO stores (name) VALUES (?)", (store_name,))
    store_id = cursor.execute("SELECT store_id FROM stores WHERE name=?", (store_name,)).fetchone()[0]

    for year in sorted(os.listdir(store_path)):
        year_path = os.path.join(store_path, year)
        if not os.path.isdir(year_path):
            continue

        for month in os.listdir(year_path):
            month_path = os.path.join(year_path, month)
            if not os.path.isdir(month_path):
                continue

            norm_month = normalize_month(month)
            if norm_month is None:
                print(f"⚠️ Skipped unknown month: {month}")
                continue

            for file in sorted(os.listdir(month_path)):
                if not file.endswith(".csv"):
                    continue
                audit_entries.append((store_id, int(year), norm_month, file, os.path.join(month_path, file)))

# ✅ Sort audits before inserting (year → month → store)
audit_entries.sort(key=lambda x: (x[1], x[2], x[0]))

# Insert audits in order
for store_id, year, month, file, file_path in audit_entries:
    df = pd.read_csv(file_path)

    cursor.execute("""
        INSERT INTO audits (store_id, year, month, file_name)
        VALUES (?,?,?,?)
    """, (store_id, year, month, file))
    audit_id = cursor.lastrowid

    passed_count = 0
    not_null_count = 0

    for _, row in df.iterrows():
        category = str(row.get("Category", "")).strip()
        name = str(row.get("Criteria", "")).strip()

        # Skip Absensi and Maintenance
        if category.lower() in ["absensi", "maintenance"]:
            continue

        passing_grade = row.get("Passing Grade", None)

        cursor.execute("""
            INSERT OR IGNORE INTO criteria (year, category, name, passing_grade)
            VALUES (?,?,?,?)
        """, (year, category, name, passing_grade))
        criteria_id = cursor.execute("SELECT criteria_id FROM criteria WHERE year=? AND name=?", (year, name)).fetchone()[0]

        # Safe float conversion
        raw_score = row.get("Score", None)
        try:
            score_val = float(raw_score) if raw_score is not None else None
        except (ValueError, TypeError):
            score_val = None

        pass_fail = row.get("Pass/Not Pass", None)

        cursor.execute("""
            INSERT INTO scores (audit_id, criteria_id, score, pass_fail, notes)
            VALUES (?,?,?,?,?)
        """, (
            audit_id,
            criteria_id,
            round(score_val, 2) if score_val is not None else None,
            str(pass_fail) if pass_fail is not None else None,
            row.get("Infraction Details", None)
        ))

        if score_val is not None:
            not_null_count += 1
        if isinstance(pass_fail, str) and pass_fail.lower() == "pass":
            passed_count += 1

    cursor.execute("""
        INSERT INTO audit_summary (audit_id, total_criteria, passed_count, not_null_count, pass_rate)
        VALUES (?,?,?,?,?)
    """, (audit_id, len(df), passed_count, not_null_count,
          round((passed_count / not_null_count), 2) if not_null_count > 0 else None))

# ---------------------------
# ✅ Populate medians and pass rates (after audits have been inserted)
# ---------------------------

# Configuration: set FILTER_YEAR to an int (e.g., 2025) and MONTH_RANGE to a tuple (start, end)
# to restrict calculations. Set FILTER_YEAR = None and MONTH_RANGE = None to include all data.
FILTER_YEAR = None        # e.g., 2025 or None
MONTH_RANGE = None        # e.g., (7, 12) or None

def _year_month_filter(alias="a"):
    """
    Returns SQL fragment for optional year/month filtering and a tuple of params.
    alias: table alias for audits (default "a")
    """
    parts = []
    if FILTER_YEAR is not None:
        parts.append(f"{alias}.year = {int(FILTER_YEAR)}")
    if MONTH_RANGE is not None:
        start, end = int(MONTH_RANGE[0]), int(MONTH_RANGE[1])
        parts.append(f"{alias}.month BETWEEN {start} AND {end}")
    if parts:
        return " AND " + " AND ".join(parts)
    return ""

# Ensure the per-category monthly summary tables exist
cursor.executescript("""
CREATE TABLE IF NOT EXISTS category_store_monthly_median (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    median_score REAL,
    median_normalized REAL,
    sample_size INTEGER,
    FOREIGN KEY (store_id) REFERENCES stores(store_id)
);

CREATE TABLE IF NOT EXISTS category_store_monthly_passrate (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    pass_rate REAL,
    sample_size INTEGER,
    FOREIGN KEY (store_id) REFERENCES stores(store_id)
);
""")

# Clear previous median/passrate rows so re-running replaces old summaries
cursor.executescript("""
DELETE FROM store_monthly_median;
DELETE FROM category_store_median;
DELETE FROM category_global_median;
DELETE FROM category_store_monthly_median;
DELETE FROM category_store_monthly_passrate;
""")

# ---------------------------
# 1) Store-monthly median (month → store ordering)
# ---------------------------
# Build filter fragment for audits selection
audit_filter = _year_month_filter(alias="a")

for store_id, year, month in cursor.execute(f"""
    SELECT a.store_id, a.year, a.month
    FROM audits a
    WHERE 1=1 {audit_filter}
    GROUP BY a.year, a.month, a.store_id
    ORDER BY a.year, a.month, a.store_id
""").fetchall():
    scores = [r[0] for r in cursor.execute("""
        SELECT sc.score
        FROM scores sc
        JOIN audits a ON sc.audit_id = a.audit_id
        JOIN criteria c ON sc.criteria_id = c.criteria_id
        WHERE a.store_id=? AND a.year=? AND a.month=?
          AND sc.score IS NOT NULL
          AND LOWER(c.category) != 'maintenance'
    """, (store_id, year, month)).fetchall()]
    med = median(scores)
    cursor.execute(
        "INSERT INTO store_monthly_median (store_id, year, month, median_score) VALUES (?,?,?,?)",
        (store_id, year, month, med)
    )

# ---------------------------
# 2) Category-store-monthly median + pass rate (per category × store × month)
# ---------------------------
groups = cursor.execute(f"""
    SELECT a.store_id, a.year, a.month, c.category
    FROM scores sc
    JOIN audits a ON sc.audit_id = a.audit_id
    JOIN criteria c ON sc.criteria_id = c.criteria_id
    WHERE sc.score IS NOT NULL
      AND LOWER(c.category) != 'maintenance'
      AND LOWER(c.category) != 'absensi'
      { _year_month_filter(alias='a') }
    GROUP BY a.year, a.month, a.store_id, c.category
    ORDER BY a.year, a.month, a.store_id, c.category
""").fetchall()

for store_id, year, month, category in groups:
    # Raw scores for this group
    rows = cursor.execute("""
        SELECT sc.score
        FROM scores sc
        JOIN audits a ON sc.audit_id = a.audit_id
        JOIN criteria c ON sc.criteria_id = c.criteria_id
        WHERE a.store_id=? AND a.year=? AND a.month=? AND c.category=? AND sc.score IS NOT NULL
    """, (store_id, year, month, category)).fetchall()
    scores = [r[0] for r in rows]
    sample_size = len(scores)
    med_raw = median(scores) if sample_size > 0 else None

    # Normalized scores (score / passing_grade) when passing_grade > 0
    norm_rows = cursor.execute("""
        SELECT sc.score, c.passing_grade
        FROM scores sc
        JOIN audits a ON sc.audit_id = a.audit_id
        JOIN criteria c ON sc.criteria_id = c.criteria_id
        WHERE a.store_id=? AND a.year=? AND a.month=? AND c.category=? AND sc.score IS NOT NULL
    """, (store_id, year, month, category)).fetchall()

    normalized = []
    for score_val, pg in norm_rows:
        try:
            if pg is not None and float(pg) > 0:
                normalized.append(float(score_val) / float(pg))
        except (ValueError, TypeError):
            continue

    med_norm = median(normalized) if normalized else None

    # Insert median summary row
    cursor.execute("""
        INSERT INTO category_store_monthly_median
        (store_id, category, year, month, median_score, median_normalized, sample_size)
        VALUES (?,?,?,?,?,?,?)
    """, (store_id, category, year, month, med_raw, med_norm, sample_size))

    # Compute pass rate for this group
    passed = cursor.execute("""
        SELECT COUNT(*)
        FROM scores sc
        JOIN audits a ON sc.audit_id = a.audit_id
        JOIN criteria c ON sc.criteria_id = c.criteria_id
        WHERE a.store_id=? AND a.year=? AND a.month=? AND c.category=? AND LOWER(sc.pass_fail) = 'pass'
    """, (store_id, year, month, category)).fetchone()[0]

    total = cursor.execute("""
        SELECT COUNT(*)
        FROM scores sc
        JOIN audits a ON sc.audit_id = a.audit_id
        JOIN criteria c ON sc.criteria_id = c.criteria_id
        WHERE a.store_id=? AND a.year=? AND a.month=? AND c.category=?
    """, (store_id, year, month, category)).fetchone()[0]

    pass_rate = round(passed / total, 3) if total and total > 0 else None

    cursor.execute("""
        INSERT INTO category_store_monthly_passrate
        (store_id, category, year, month, pass_rate, sample_size)
        VALUES (?,?,?,?,?,?)
    """, (store_id, category, year, month, pass_rate, total))

# ---------------------------
# 3) Category-store aggregate median (across all included months) and global median
#    These are useful for summary views (store-level and global-level medians)
# ---------------------------
# category_store_median: median per store across the filtered months
for store_id, category in cursor.execute(f"""
    SELECT s.store_id, c.category
    FROM scores sc
    JOIN audits a ON sc.audit_id = a.audit_id
    JOIN stores s ON a.store_id = s.store_id
    JOIN criteria c ON sc.criteria_id = c.criteria_id
    WHERE LOWER(c.category) != 'maintenance'
      AND LOWER(c.category) != 'absensi'
      { _year_month_filter(alias='a') }
    GROUP BY s.store_id, c.category
    ORDER BY s.store_id, c.category
""").fetchall():
    scores = [r[0] for r in cursor.execute("""
        SELECT sc.score
        FROM scores sc
        JOIN audits a ON sc.audit_id = a.audit_id
        JOIN criteria c ON sc.criteria_id = c.criteria_id
        WHERE a.store_id=? AND c.category=? AND sc.score IS NOT NULL
    """, (store_id, category)).fetchall()]
    med = median(scores)
    cursor.execute("""
        INSERT INTO category_store_median (store_id, category, median_score)
        VALUES (?,?,?)
    """, (store_id, category, med))

# category_global_median: median across all stores for each category (filtered months)
for (category,) in cursor.execute(f"""
    SELECT c.category
    FROM scores sc
    JOIN audits a ON sc.audit_id = a.audit_id
    JOIN criteria c ON sc.criteria_id = c.criteria_id
    WHERE LOWER(c.category) != 'maintenance'
      AND LOWER(c.category) != 'absensi'
      { _year_month_filter(alias='a') }
    GROUP BY c.category
    ORDER BY c.category
""").fetchall():
    scores = [r[0] for r in cursor.execute("""
        SELECT sc.score
        FROM scores sc
        JOIN audits a ON sc.audit_id = a.audit_id
        JOIN criteria c ON sc.criteria_id = c.criteria_id
        WHERE c.category=? AND sc.score IS NOT NULL
    """, (category,)).fetchall()]
    med = median(scores)
    cursor.execute("INSERT INTO category_global_median (category, median_score) VALUES (?,?)", (category, med))

# Commit and close
conn.commit()
conn.close()
print("Audit data imported successfully.")