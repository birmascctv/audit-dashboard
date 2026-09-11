#!/usr/bin/env python3
"""
Robust import script for audit_birmas CSVs -> SQLite.

Key fixes:
 - Detect and repair foreign-key mismatch where scores referenced criteria_old.
 - Recreate scores table to reference criteria if needed, copying existing rows.
 - Ordered deletes (children first) to avoid FK errors.
 - Safe schema creation + commits, defensive CSV parsing, and final verification.
"""
import os
import sqlite3
import sys
import traceback
import re
import pandas as pd
from datetime import datetime

# -------------------------
# Configuration
# -------------------------
root_folder = "/root/audit-dashboard/audit_birmas"
db_path = os.path.join(root_folder, "audit_birmas.db")

FILTER_YEAR = None
MONTH_RANGE = None

# -------------------------
# Helpers
# -------------------------
def _year_month_filter(alias="a"):
    parts = []
    if FILTER_YEAR is not None:
        parts.append(f"{alias}.year = {int(FILTER_YEAR)}")
    if MONTH_RANGE is not None:
        start, end = int(MONTH_RANGE[0]), int(MONTH_RANGE[1])
        parts.append(f"{alias}.month BETWEEN {start} AND {end}")
    if parts:
        return " AND " + " AND ".join(parts)
    return ""

def median(values):
    if not values:
        return None
    values = sorted(values)
    mid = len(values) // 2
    if len(values) % 2 == 0:
        return round((values[mid - 1] + values[mid]) / 2, 2)
    else:
        return round(values[mid], 2)

def safe_fetchone_first(colrow):
    return colrow[0] if colrow else None

def normalize_criteria_name(name):
    """
    Some 2026 audit templates append a trailing quantity/index in
    parentheses to the criterion name, e.g. "Asbak (2)", "Meja (1)",
    "Tabung CO2 (1)" — this is a per-store note of how many physical units
    exist, not a distinct criterion, and each store only ever records one
    such row per real-world criterion (never both the plain and the
    suffixed form together). Left as-is, these variants would fragment a
    single logical criterion into several different criteria_id rows
    (one per distinct store naming), breaking cross-store comparisons.
    """
    return re.sub(r"\s*\(\d+\)\s*$", "", str(name)).strip()

# -------------------------
# Pre-checks
# -------------------------
if not os.path.isdir(root_folder):
    print(f"ERROR: root_folder does not exist: {root_folder}", file=sys.stderr)
    sys.exit(1)
if not os.access(root_folder, os.W_OK):
    print(f"ERROR: no write permission for folder: {root_folder}", file=sys.stderr)
    sys.exit(1)

# -------------------------
# Connect DB
# -------------------------
conn = None
try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Ensure foreign keys on for normal operations
    cursor.execute("PRAGMA foreign_keys = ON;")

    # -------------------------
    # Detect if existing scores FK references criteria_old
    # If so, recreate scores to reference criteria instead.
    # -------------------------
    def scores_references_criteria_old():
        try:
            fk_rows = cursor.execute("PRAGMA foreign_key_list('scores')").fetchall()
            # PRAGMA foreign_key_list returns rows where the 3rd column is the referenced table name
            for r in fk_rows:
                # r format: (id, seq, table, from, to, on_update, on_delete, match)
                if len(r) >= 3 and r[2] == 'criteria_old':
                    return True
            return False
        except sqlite3.OperationalError:
            # scores table may not exist yet
            return False

    if scores_references_criteria_old():
        print("Detected scores -> criteria_old foreign key. Repairing schema to reference criteria.")
        # Temporarily disable FK enforcement to perform schema change
        cursor.execute("PRAGMA foreign_keys = OFF;")
        conn.commit()

        # Rename existing scores to scores_old (if exists)
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='scores';")
        if cursor.fetchone():
            cursor.execute("ALTER TABLE scores RENAME TO scores_old;")
            conn.commit()
            print("Renamed existing scores -> scores_old")

        # Create new scores table referencing criteria(criteria_id)
        cursor.executescript("""
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
        """)
        conn.commit()
        print("Created new scores table referencing criteria(criteria_id).")

        # If scores_old exists, copy rows across (criteria_id values are preserved)
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='scores_old';")
        if cursor.fetchone():
            # Copy rows where columns match; ignore conflicts
            cursor.executescript("""
            INSERT OR IGNORE INTO scores (score_id, audit_id, criteria_id, score, pass_fail, notes)
              SELECT score_id, audit_id, criteria_id, score, pass_fail, notes FROM scores_old;
            """)
            conn.commit()
            print("Copied rows from scores_old into new scores table (if any).")

            # Drop the old table
            cursor.executescript("""
            DROP TABLE IF EXISTS scores_old;
            """)
            conn.commit()
            print("Dropped scores_old.")

        # Re-enable foreign keys
        cursor.execute("PRAGMA foreign_keys = ON;")
        conn.commit()
        print("Foreign key enforcement re-enabled after schema repair.")

    # -------------------------
    # Create schema (idempotent) and commit
    # -------------------------
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
        metrics TEXT,
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
    conn.commit()
    print("Schema created/ensured and committed.")

    # -------------------------
    # Migration: older DBs created before the "metrics" column existed on
    # criteria won't have it yet (CREATE TABLE IF NOT EXISTS is a no-op on
    # an existing table) — add it if missing.
    # -------------------------
    existing_cols = [r[1] for r in cursor.execute("PRAGMA table_info(criteria)").fetchall()]
    if "metrics" not in existing_cols:
        cursor.execute("ALTER TABLE criteria ADD COLUMN metrics TEXT;")
        conn.commit()
        print("Added missing 'metrics' column to criteria table.")

    # -------------------------
    # If some DB objects still reference criteria_old, create a compatibility table
    # (only if necessary). This avoids 'no such table' errors for legacy objects.
    # -------------------------
    try:
        # If criteria_old does not exist, create it with same columns as criteria
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='criteria_old';")
        if not cursor.fetchone():
            cursor.executescript("""
            CREATE TABLE IF NOT EXISTS criteria_old (
                criteria_id INTEGER PRIMARY KEY,
                year INTEGER,
                category TEXT,
                name TEXT,
                passing_grade REAL
            );
            """)
            # populate from criteria if criteria has rows
            cursor.execute("SELECT COUNT(*) FROM criteria;")
            ccount = cursor.fetchone()[0]
            if ccount > 0:
                cursor.executescript("""
                INSERT OR IGNORE INTO criteria_old (criteria_id, year, category, name, passing_grade)
                  SELECT criteria_id, year, category, name, passing_grade FROM criteria;
                """)
            conn.commit()
            print("Compatibility table criteria_old created and populated (if criteria had rows).")
        else:
            print("criteria_old table already exists; leaving as-is.")
    except Exception:
        conn.rollback()
        print("Warning: could not ensure criteria_old compatibility table (continuing).", file=sys.stderr)

    # -------------------------
    # Wipe old import data (child tables first, then parents)
    # -------------------------
    cursor.executescript("""
    DELETE FROM scores;
    DELETE FROM audit_summary;
    DELETE FROM category_store_monthly_passrate;
    DELETE FROM category_store_monthly_median;
    DELETE FROM category_store_median;
    DELETE FROM category_global_median;
    DELETE FROM store_monthly_median;
    DELETE FROM audits;
    DELETE FROM criteria;
    """)
    conn.commit()
    print("Old import data wiped and committed (ordered deletes).")

    # verify no FK violations remain
    cursor.execute("PRAGMA foreign_key_check;")
    fk_violations = cursor.fetchall()
    if fk_violations:
        print("ERROR: foreign key violations after delete:", fk_violations, file=sys.stderr)
        conn.rollback()
        raise RuntimeError("FK violations after delete")

    # -------------------------
    # Month map and normalization helper
    # -------------------------
    month_map = {
        "Januari": 1, "Februari": 2, "Maret": 3, "April": 4,
        "Mei": 5, "Juni": 6, "Juli": 7, "Agustus": 8,
        "September": 9, "Oktober": 10, "November": 11, "Desember": 12
    }
    def normalize_month(month_str):
        if not month_str:
            return None
        parts = month_str.strip().split()
        month_name = parts[0]
        return month_map.get(month_name, None)

    # -------------------------
    # Collect audit CSV entries
    # -------------------------
    audit_entries = []
    for store_name in sorted(os.listdir(root_folder)):
        store_path = os.path.join(root_folder, store_name)
        if not os.path.isdir(store_path) or store_name in ("venv", ".venv"):
            continue
        cursor.execute("INSERT OR IGNORE INTO stores (name) VALUES (?)", (store_name,))
        conn.commit()
        store_id_row = cursor.execute("SELECT store_id FROM stores WHERE name=?", (store_name,)).fetchone()
        store_id = safe_fetchone_first(store_id_row)
        if store_id is None:
            print(f"WARNING: could not get store_id for {store_name}, skipping", file=sys.stderr)
            continue
        for year in sorted(os.listdir(store_path)):
            year_path = os.path.join(store_path, year)
            if not os.path.isdir(year_path):
                continue
            try:
                year_int = int(year)
            except ValueError:
                print(f"Skipping non-year folder {year} under {store_name}")
                continue
            for month in sorted(os.listdir(year_path)):
                month_path = os.path.join(year_path, month)
                if not os.path.isdir(month_path):
                    continue
                norm_month = normalize_month(month)
                if norm_month is None:
                    print(f"⚠️ Skipped unknown month folder: {month} (store {store_name} / year {year})")
                    continue
                for file in sorted(os.listdir(month_path)):
                    if not file.lower().endswith(".csv"):
                        continue
                    file_path = os.path.join(month_path, file)
                    audit_entries.append((store_id, year_int, norm_month, file, file_path))

    audit_entries.sort(key=lambda x: (x[1], x[2], x[0]))
    print(f"Found {len(audit_entries)} CSV audit files to import.")

    # -------------------------
    # Insert audits and scores
    # -------------------------
    for store_id, year, month, file, file_path in audit_entries:
        try:
            df = pd.read_csv(file_path)
        except Exception as e:
            print(f"ERROR reading CSV {file_path}: {e}", file=sys.stderr)
            continue

        cursor.execute("INSERT INTO audits (store_id, year, month, file_name) VALUES (?,?,?,?)",
                       (store_id, year, month, file))
        audit_id = cursor.lastrowid

        passed_count = 0
        not_null_count = 0
        row_count = 0

        for _, row in df.iterrows():
            row_count += 1
            category = str(row.get("Category", "")).strip()
            name = normalize_criteria_name(row.get("Criteria", ""))
            if category.lower() in ["absensi", "maintenance"]:
                continue
            passing_grade = row.get("Passing Grade", None)
            raw_metrics = row.get("Metrics", None)
            metrics = str(raw_metrics).strip() if raw_metrics is not None and str(raw_metrics).strip().lower() != "nan" and str(raw_metrics).strip() != "" else None
            cursor.execute("INSERT OR IGNORE INTO criteria (year, category, name, passing_grade, metrics) VALUES (?,?,?,?,?)",
                           (year, category, name, passing_grade, metrics))
            # Metrics is the scoring rubric text for this criterion (same
            # meaning every time it's recorded) — backfill it onto the
            # criteria row if it's still empty there, in case an earlier
            # file for this criterion/year happened to have it blank.
            if metrics is not None:
                cursor.execute(
                    "UPDATE criteria SET metrics = ? WHERE year=? AND name=? AND (metrics IS NULL OR metrics = '')",
                    (metrics, year, name)
                )
            criteria_row = cursor.execute("SELECT criteria_id FROM criteria WHERE year=? AND name=?", (year, name)).fetchone()
            criteria_id = safe_fetchone_first(criteria_row)
            if criteria_id is None:
                print(f"WARNING: criteria_id missing for {name} (year {year})", file=sys.stderr)
                continue
            raw_score = row.get("Score", None)
            try:
                score_val = float(raw_score) if raw_score is not None and str(raw_score).strip() != "" else None
            except (ValueError, TypeError):
                score_val = None
            pass_fail = row.get("Pass/Not Pass", None)
            cursor.execute("INSERT INTO scores (audit_id, criteria_id, score, pass_fail, notes) VALUES (?,?,?,?,?)",
                           (audit_id, criteria_id,
                            round(score_val, 2) if score_val is not None else None,
                            str(pass_fail) if pass_fail is not None else None,
                            row.get("Infraction Details", None)))
            if score_val is not None:
                not_null_count += 1
            if isinstance(pass_fail, str) and pass_fail.lower() == "pass":
                passed_count += 1

        pass_rate = round((passed_count / not_null_count), 3) if not_null_count > 0 else None
        cursor.execute("INSERT INTO audit_summary (audit_id, total_criteria, passed_count, not_null_count, pass_rate) VALUES (?,?,?,?,?)",
                       (audit_id, row_count, passed_count, not_null_count, pass_rate))

    conn.commit()
    print("Inserted audits, criteria, scores, and summaries. Committed.")

    # -------------------------
    # Compute medians and pass rates (store-monthly, category-store-monthly, aggregates)
    # -------------------------
    audit_filter = _year_month_filter(alias="a")

    rows = cursor.execute(f"""
        SELECT a.store_id, a.year, a.month
        FROM audits a
        WHERE 1=1 {audit_filter}
        GROUP BY a.year, a.month, a.store_id
        ORDER BY a.year, a.month, a.store_id
    """).fetchall()

    for store_id, year, month in rows:
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
    conn.commit()
    print("Computed and inserted store_monthly_median.")

    groups = cursor.execute(f"""
        SELECT a.store_id, a.year, a.month, c.category
        FROM scores sc
        JOIN audits a ON sc.audit_id = a.audit_id
        JOIN criteria c ON sc.criteria_id = c.criteria_id
        WHERE sc.score IS NOT NULL
          AND LOWER(c.category) != 'maintenance'
          AND LOWER(c.category) != 'absensi'
          {audit_filter}
        GROUP BY a.year, a.month, a.store_id, c.category
        ORDER BY a.year, a.month, a.store_id, c.category
    """).fetchall()

    for store_id, year, month, category in groups:
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

        cursor.execute("""
            INSERT INTO category_store_monthly_median
            (store_id, category, year, month, median_score, median_normalized, sample_size)
            VALUES (?,?,?,?,?,?,?)
        """, (store_id, category, year, month, med_raw, med_norm, sample_size))

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

    conn.commit()
    print("Computed and inserted category_store_monthly_median and passrate.")

    agg_rows = cursor.execute(f"""
        SELECT s.store_id, c.category
        FROM scores sc
        JOIN audits a ON sc.audit_id = a.audit_id
        JOIN stores s ON a.store_id = s.store_id
        JOIN criteria c ON sc.criteria_id = c.criteria_id
        WHERE LOWER(c.category) != 'maintenance'
          AND LOWER(c.category) != 'absensi'
          {audit_filter}
        GROUP BY s.store_id, c.category
        ORDER BY s.store_id, c.category
    """).fetchall()

    for store_id, category in agg_rows:
        scores = [r[0] for r in cursor.execute("""
            SELECT sc.score
            FROM scores sc
            JOIN audits a ON sc.audit_id = a.audit_id
            JOIN criteria c ON sc.criteria_id = c.criteria_id
            WHERE a.store_id=? AND c.category=? AND sc.score IS NOT NULL
        """, (store_id, category)).fetchall()]
        med = median(scores)
        cursor.execute("INSERT INTO category_store_median (store_id, category, median_score) VALUES (?,?,?)",
                       (store_id, category, med))

    conn.commit()
    print("Inserted category_store_median aggregates.")

    global_cats = cursor.execute(f"""
        SELECT c.category
        FROM scores sc
        JOIN audits a ON sc.audit_id = a.audit_id
        JOIN criteria c ON sc.criteria_id = c.criteria_id
        WHERE LOWER(c.category) != 'maintenance'
          AND LOWER(c.category) != 'absensi'
          {audit_filter}
        GROUP BY c.category
        ORDER BY c.category
    """).fetchall()

    for (category,) in global_cats:
        scores = [r[0] for r in cursor.execute("""
            SELECT sc.score
            FROM scores sc
            JOIN audits a ON sc.audit_id = a.audit_id
            JOIN criteria c ON sc.criteria_id = c.criteria_id
            WHERE c.category=? AND sc.score IS NOT NULL
        """, (category,)).fetchall()]
        med = median(scores)
        cursor.execute("INSERT INTO category_global_median (category, median_score) VALUES (?,?)", (category, med))

    conn.commit()
    print("Inserted category_global_median aggregates.")

    # Final verification
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
    tables = [r[0] for r in cursor.fetchall()]
    print("Tables in DB:", tables)
    for t in tables:
        try:
            cnt = cursor.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        except Exception:
            cnt = "n/a"
        print(f"  {t}: {cnt} rows")

    print("Audit data imported successfully at", datetime.utcnow().isoformat(), "UTC")

except Exception:
    print("FATAL ERROR during import:", file=sys.stderr)
    traceback.print_exc()
    if conn:
        conn.rollback()
    sys.exit(1)
finally:
    if conn:
        conn.close()
