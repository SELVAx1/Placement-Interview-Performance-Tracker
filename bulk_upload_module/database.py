import sqlite3
import uuid
import os
from datetime import datetime
try:
    from .config import DB_PATH
except ImportError:
    from config import DB_PATH

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes tables specifically required for the bulk upload processes."""
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Drives Table (Context for round results)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS drives (
            id TEXT PRIMARY KEY,
            company_name TEXT NOT NULL,
            company_type TEXT DEFAULT 'PRODUCT',
            job_role TEXT NOT NULL,
            ctc_lpa REAL NOT NULL,
            required_cgpa REAL DEFAULT 0.0,
            allowed_branches TEXT DEFAULT 'All',
            location TEXT DEFAULT 'On Campus',
            total_rounds INTEGER DEFAULT 4,
            drive_date TEXT,
            status TEXT DEFAULT 'Active',
            current_round INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Migrations for existing drives table columns
    for col_def in [
        ("company_type", "TEXT DEFAULT 'PRODUCT'"),
        ("required_cgpa", "REAL DEFAULT 0.0"),
        ("allowed_branches", "TEXT DEFAULT 'All'"),
        ("location", "TEXT DEFAULT 'On Campus'"),
        ("total_rounds", "INTEGER DEFAULT 4"),
        ("drive_date", "TEXT"),
        ("status", "TEXT DEFAULT 'Active'"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE drives ADD COLUMN {col_def[0]} {col_def[1]}")
            conn.commit()
        except sqlite3.OperationalError:
            pass
    conn.commit()

    # 2. Student Drive Results / Shortlist Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS student_drive_results (
            id TEXT PRIMARY KEY,
            drive_id TEXT NOT NULL,
            gmail TEXT NOT NULL,
            result TEXT NOT NULL,
            round INTEGER DEFAULT 1,
            score REAL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (drive_id) REFERENCES drives(id),
            UNIQUE(drive_id, gmail)
        )
    """)

    # 3. User Accounts & Access Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS authenticate (
            uuid TEXT PRIMARY KEY,
            gmail TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 4. Student Academic Profiles Roster Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS students_roster (
            student_id TEXT PRIMARY KEY,
            register_number TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            department TEXT NOT NULL,
            cgpa REAL NOT NULL,
            tenth_percentage REAL,
            twelfth_percentage REAL,
            skills TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 5. Bulk Upload Audit Logs Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS upload_logs (
            log_id TEXT PRIMARY KEY,
            upload_type TEXT NOT NULL,
            filename TEXT NOT NULL,
            total_rows INTEGER NOT NULL,
            processed_count INTEGER NOT NULL,
            skipped_count INTEGER NOT NULL,
            status TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()

    # Insert a default demo drive if table is empty
    cursor.execute("SELECT COUNT(*) as count FROM drives")
    if cursor.fetchone()["count"] == 0:
        demo_drives = [
            ("tcs-drive-2026", "TCS Digital", "Software Engineer", 7.5, 1),
            ("zoho-drive-2026", "Zoho Corporation", "Member Technical Staff", 8.4, 1),
            ("infosys-drive-2026", "Infosys", "Systems Engineer Specialist", 6.0, 1),
        ]
        cursor.executemany("""
            INSERT INTO drives (id, company_name, job_role, ctc_lpa, current_round)
            VALUES (?, ?, ?, ?, ?)
        """, demo_drives)
        conn.commit()

    try:
        cursor.execute("ALTER TABLE students_roster ADD COLUMN year TEXT DEFAULT '4th Year'")
        conn.commit()
    except sqlite3.OperationalError:
        pass

    conn.close()


# ==============================================================
# 1. DRIVE RESULTS / SHORTLIST DB OPERATIONS
# ==============================================================

def get_drive(drive_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, company_name, company_type, job_role, ctc_lpa, required_cgpa, 
               allowed_branches, location, total_rounds, drive_date, status, current_round, created_at 
        FROM drives WHERE id = ?
    """, (drive_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_all_drives():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, company_name, company_type, job_role, ctc_lpa, required_cgpa, 
               allowed_branches, location, total_rounds, drive_date, status, current_round, created_at 
        FROM drives ORDER BY created_at DESC
    """)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def upsert_company_drive_record(
    company_name: str,
    job_role: str,
    ctc_lpa: float,
    company_type: str = "PRODUCT",
    required_cgpa: float = 0.0,
    allowed_branches: str = "All",
    location: str = "On Campus",
    total_rounds: int = 4,
    drive_date: str = None,
    status: str = "Active",
    drive_id: str = None
):
    conn = get_connection()
    cursor = conn.cursor()

    comp_clean = company_name.strip()
    role_clean = job_role.strip()

    # Check existing drive by ID or (company_name, job_role)
    if drive_id:
        cursor.execute("SELECT id FROM drives WHERE id = ?", (drive_id,))
    else:
        cursor.execute("SELECT id FROM drives WHERE LOWER(company_name) = ? AND LOWER(job_role) = ?",
                       (comp_clean.lower(), role_clean.lower()))

    existing = cursor.fetchone()

    if existing:
        target_id = existing["id"]
        cursor.execute("""
            UPDATE drives 
            SET company_name = ?, job_role = ?, ctc_lpa = ?, company_type = ?, 
                required_cgpa = ?, allowed_branches = ?, location = ?, 
                total_rounds = ?, drive_date = ?, status = ?
            WHERE id = ?
        """, (comp_clean, role_clean, ctc_lpa, company_type, required_cgpa,
              allowed_branches, location, total_rounds, drive_date, status, target_id))
        action = "Updated"
    else:
        # Generate clean ID slug or UUID
        slug = f"{comp_clean.lower().replace(' ', '-')}-{role_clean.lower().replace(' ', '-')}-2026"
        slug = "".join(c for c in slug if c.isalnum() or c == '-')
        target_id = slug if len(slug) <= 40 else str(uuid.uuid4())

        cursor.execute("""
            INSERT INTO drives (
                id, company_name, job_role, ctc_lpa, company_type, 
                required_cgpa, allowed_branches, location, total_rounds, drive_date, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (target_id, comp_clean, role_clean, ctc_lpa, company_type,
              required_cgpa, allowed_branches, location, total_rounds, drive_date, status))
        action = "Created"

    conn.commit()
    conn.close()

    return {
        "id": target_id,
        "company_name": comp_clean,
        "job_role": role_clean,
        "ctc_lpa": ctc_lpa,
        "company_type": company_type,
        "required_cgpa": required_cgpa,
        "allowed_branches": allowed_branches,
        "total_rounds": total_rounds,
        "location": location,
        "drive_date": drive_date,
        "status": status,
        "action": action
    }

def process_shortlist_record(drive_id: str, email: str, base_round: int = None):
    """
    Shortlist Mode: Candidate email was provided in the Excel without a verdict.
    Increments round by +1 and marks 'Shortlisted for Round N'.
    """
    conn = get_connection()
    cursor = conn.cursor()
    email_clean = email.strip().lower()

    cursor.execute("SELECT total_rounds FROM drives WHERE id = ?", (drive_id,))
    d_row = cursor.fetchone()
    total_rounds = d_row["total_rounds"] if (d_row and "total_rounds" in d_row.keys() and d_row["total_rounds"]) else 4

    # Find existing student round in this drive
    cursor.execute("SELECT round FROM student_drive_results WHERE drive_id = ? AND LOWER(gmail) = ?", (drive_id, email_clean))
    existing = cursor.fetchone()

    if existing and existing["round"] is not None:
        new_round = existing["round"] + 1
    else:
        new_round = (base_round or 1) + 1

    if new_round <= total_rounds:
        result_str = f"Shortlisted for Round {new_round}"
    else:
        new_round = total_rounds
        result_str = "Selected"

    record_id = str(uuid.uuid4())

    cursor.execute("""
        INSERT INTO student_drive_results (id, drive_id, gmail, result, round, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(drive_id, gmail) DO UPDATE SET
            round = excluded.round,
            result = excluded.result,
            updated_at = CURRENT_TIMESTAMP
    """, (record_id, drive_id, email_clean, result_str, new_round))

    conn.commit()
    conn.close()

    return {"gmail": email_clean, "round": new_round, "result": result_str, "status": "Promoted"}

def process_verdict_record(drive_id: str, email: str, verdict: str, round_num: int = None, score: float = None):
    """
    Verdict Mode: Explicit result status provided in Excel (e.g., 'Selected', 'Rejected').
    Intermediate round 'Selected' advances candidate to next round.
    Final round 'Selected' marks candidate as 'Offered'.
    """
    import re
    conn = get_connection()
    cursor = conn.cursor()
    email_clean = email.strip().lower()

    cursor.execute("SELECT total_rounds, current_round FROM drives WHERE id = ?", (drive_id,))
    d_row = cursor.fetchone()
    total_rounds = d_row["total_rounds"] if (d_row and "total_rounds" in d_row.keys() and d_row["total_rounds"]) else 4
    base_round = d_row["current_round"] if (d_row and "current_round" in d_row.keys() and d_row["current_round"]) else 1

    cursor.execute("SELECT round, result FROM student_drive_results WHERE drive_id = ? AND LOWER(gmail) = ?", (drive_id, email_clean))
    existing = cursor.fetchone()

    eval_round = round_num or (existing["round"] if existing and existing["round"] else base_round) or 1

    v_str = str(verdict or "").strip()
    v_lower = v_str.lower()

    if any(k in v_lower for k in ["not select", "not-select", "unselect", "reject", "fail", "eliminated", "absent"]):
        verdict_clean = "Rejected"
        target_round = eval_round
    elif re.search(r'round\s*(\d+)', v_lower) and any(w in v_lower for w in ["shortlist", "for round", "to round"]):
        m_r = re.search(r'round\s*(\d+)', v_lower)
        target_r = int(m_r.group(1))
        if target_r <= total_rounds:
            target_round = target_r
            verdict_clean = f"Shortlisted for Round {target_r}"
        else:
            target_round = total_rounds
            verdict_clean = "Offered"
    elif any(k in v_lower for k in ["selecte", "select", "selet", "selct", "pass", "cleared", "passed", "qualif"]):
        if eval_round < total_rounds:
            target_round = eval_round + 1
            verdict_clean = f"Shortlisted for Round {eval_round + 1}"
        else:
            target_round = total_rounds
            verdict_clean = "Selected"
    elif any(k in v_lower for k in ["offer", "offered", "placed", "hired"]):
        target_round = total_rounds
        verdict_clean = "Offered"
    elif any(k in v_lower for k in ["hold", "waiting", "pending"]):
        target_round = eval_round
        verdict_clean = "On Hold"
    else:
        target_round = eval_round
        verdict_clean = v_str.capitalize() if v_str else "Selected"

    record_id = str(uuid.uuid4())

    cursor.execute("""
        INSERT INTO student_drive_results (id, drive_id, gmail, result, round, score, updated_at)
        VALUES (?, ?, ?, ?, COALESCE(?, 1), ?, CURRENT_TIMESTAMP)
        ON CONFLICT(drive_id, gmail) DO UPDATE SET
            result = excluded.result,
            round = excluded.round,
            score = COALESCE(excluded.score, student_drive_results.score),
            updated_at = CURRENT_TIMESTAMP
    """, (record_id, drive_id, email_clean, verdict_clean, target_round, score))

    conn.commit()
    conn.close()

    return {"gmail": email_clean, "result": verdict_clean, "round": target_round or 1, "score": score, "status": "Updated"}

def get_drive_results(drive_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, drive_id, gmail, result, round, score, updated_at 
        FROM student_drive_results 
        WHERE drive_id = ? 
        ORDER BY updated_at DESC
    """, (drive_id,))
    results = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return results


# ==============================================================
# 2. USER ACCESS / ACCOUNT DB OPERATIONS
# ==============================================================

def upsert_user_account(email: str, role: str = "Student", password: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    email_clean = email.strip().lower()

    # Normalize role
    role_map = {
        "student": "Student",
        "mentor": "Mentor",
        "coordinator": "Coordinator",
        "admin": "Coordinator",
        "recruiter": "Recruiter",
        "department": "Department",
        "dept": "Department"
    }
    normalized_role = role_map.get(role.strip().lower(), "Student")

    cursor.execute("SELECT uuid, password FROM authenticate WHERE LOWER(gmail) = ?", (email_clean,))
    existing = cursor.fetchone()

    if existing:
        final_password = password if password else existing["password"]
        cursor.execute("""
            UPDATE authenticate 
            SET role = ?, password = ? 
            WHERE LOWER(gmail) = ?
        """, (normalized_role, final_password, email_clean))
        action = "Updated"
        user_uuid = existing["uuid"]
    else:
        user_uuid = str(uuid.uuid4())
        final_password = password if password else f"{normalized_role.lower()}123"
        cursor.execute("""
            INSERT INTO authenticate (uuid, gmail, password, role)
            VALUES (?, ?, ?, ?)
        """, (user_uuid, email_clean, final_password, normalized_role))
        action = "Created"

    conn.commit()
    conn.close()

    return {
        "uuid": user_uuid,
        "gmail": email_clean,
        "role": normalized_role,
        "action": action
    }

def get_all_users():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT uuid, gmail, role, is_active, created_at FROM authenticate ORDER BY created_at DESC")
    users = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return users


# ==============================================================
# 3. STUDENT ROSTER DB OPERATIONS
# ==============================================================

def upsert_student_roster_record(register_number: str, name: str, email: str, department: str,
                                 cgpa: float, tenth: float = None, twelfth: float = None, skills: str = "", year: str = "4th Year"):
    conn = get_connection()
    cursor = conn.cursor()
    email_clean = email.strip().lower()
    reg_clean = register_number.strip().upper()
    student_id = str(uuid.uuid4())

    cursor.execute("""
        SELECT student_id, register_number, email FROM students_roster
        WHERE LOWER(email) = ? OR UPPER(register_number) = ?
    """, (email_clean, reg_clean))
    existing = cursor.fetchone()

    if existing:
        cursor.execute("""
            UPDATE students_roster SET
                name = ?,
                register_number = ?,
                email = ?,
                department = ?,
                cgpa = ?,
                tenth_percentage = ?,
                twelfth_percentage = ?,
                skills = ?,
                year = COALESCE(?, year, '4th Year'),
                updated_at = CURRENT_TIMESTAMP
            WHERE student_id = ?
        """, (
            name.strip(),
            reg_clean,
            email_clean,
            department.strip().upper(),
            cgpa,
            tenth,
            twelfth,
            skills.strip(),
            year,
            existing["student_id"]
        ))
        action = "Updated"
    else:
        cursor.execute("""
            INSERT INTO students_roster (
                student_id, register_number, name, email, department, cgpa, tenth_percentage, twelfth_percentage, skills, year
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            student_id, reg_clean, name.strip(), email_clean, department.strip().upper(),
            cgpa, tenth, twelfth, skills.strip(), year
        ))
        action = "Created"

    # Synchronize student auth account in authenticate table if it exists
    try:
        cursor.execute("SELECT uuid FROM authenticate WHERE LOWER(gmail) = ?", (email_clean,))
        user_auth = cursor.fetchone()
        if user_auth:
            cursor.execute("UPDATE authenticate SET department = ? WHERE LOWER(gmail) = ?", (department.strip().upper(), email_clean))
        else:
            cursor.execute("""
                INSERT INTO authenticate (uuid, gmail, password, role, department)
                VALUES (?, ?, 'student123', 'Student', ?)
            """, (str(uuid.uuid4()), email_clean, department.strip().upper()))
    except Exception:
        pass

    conn.commit()
    conn.close()

    return {
        "register_number": reg_clean,
        "name": name.strip(),
        "email": email_clean,
        "department": department.strip().upper(),
        "cgpa": cgpa,
        "year": year,
        "action": action
    }

def get_all_student_roster():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT student_id, register_number, name, email, department, cgpa, tenth_percentage, twelfth_percentage, skills, created_at
        FROM students_roster
        ORDER BY created_at DESC
    """)
    students = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return students


# ==============================================================
# 4. AUDIT LOGGING
# ==============================================================

def record_upload_log(upload_type: str, filename: str, total_rows: int, processed_count: int, skipped_count: int, status: str = "SUCCESS"):
    conn = get_connection()
    cursor = conn.cursor()
    log_id = str(uuid.uuid4())

    cursor.execute("""
        INSERT INTO upload_logs (log_id, upload_type, filename, total_rows, processed_count, skipped_count, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (log_id, upload_type, filename, total_rows, processed_count, skipped_count, status))

    conn.commit()
    conn.close()
    return log_id

def get_upload_logs():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT log_id, upload_type, filename, total_rows, processed_count, skipped_count, status, created_at FROM upload_logs ORDER BY created_at DESC")
    logs = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return logs
