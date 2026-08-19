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

# ✅ Populate medians (restricted to 2025, months 7–12)
# Store-monthly median
for store_id, year, month in cursor.execute("""
    SELECT store_id, year, month
    FROM audits
    WHERE year = 2025 AND month BETWEEN 7 AND 12
    GROUP BY year, month, store_id
    ORDER BY year, month, store_id
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
    cursor.execute("INSERT INTO store_monthly_median (store_id, year, month, median_score) VALUES (?,?,?,?)",
                   (store_id, year, month, med))

# Category-store median
for store_id, category in cursor.execute("""
    SELECT s.store_id, c.category
    FROM scores sc
    JOIN audits a ON sc.audit_id=a.audit_id
    JOIN stores s ON a.store_id=s.store_id
    JOIN criteria c ON sc.criteria_id=c.criteria_id
    WHERE a.year = 2025 AND a.month BETWEEN 7 AND 12
      AND LOWER(c.category) != 'maintenance'
    GROUP BY s.store_id, c.category
    ORDER BY c.category, s.store_id
""").fetchall():
    scores = [r[0] for r in cursor.execute("""
        SELECT sc.score
        FROM scores sc
        JOIN audits a ON sc.audit_id=a.audit_id
        JOIN criteria c ON sc.criteria_id=c.criteria_id
        WHERE a.store_id=? AND c.category=? 
          AND a.year=2025 AND a.month BETWEEN 7 AND 12
          AND sc.score IS NOT NULL
          AND LOWER(c.category) != 'maintenance'
    """, (store_id, category)).fetchall()]
    med = median(scores)
    cursor.execute("INSERT INTO category_store_median (store_id, category, median_score) VALUES (?,?,?)",
                   (store_id, category, med))

# Category-global median
for (category,) in cursor.execute("""
    SELECT c.category
    FROM scores sc
    JOIN audits a ON sc.audit_id=a.audit_id
    JOIN criteria c ON sc.criteria_id=c.criteria_id
    WHERE a.year = 2025 AND a.month BETWEEN 7 AND 12
      AND LOWER(c.category) != 'maintenance'
    GROUP BY c.category
    ORDER BY c.category
""").fetchall():
    scores = [r[0] for r in cursor.execute("""
        SELECT sc.score
        FROM scores sc
        JOIN audits a ON sc.audit_id=a.audit_id
        JOIN criteria c ON sc.criteria_id=c.criteria_id
        WHERE c.category=? 
          AND a.year=2025 AND a.month BETWEEN 7 AND 12
          AND sc.score IS NOT NULL
          AND LOWER(c.category) != 'maintenance'
    """, (category,)).fetchall()]
    med = median(scores)
    cursor.execute("INSERT INTO category_global_median (category, median_score) VALUES (?,?)",
                   (category, med))

conn.commit()
conn.close()
print("Audit data imported succesfully.")
