import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

from sqlalchemy import create_engine, delete, func, inspect, select, text, update
from sqlalchemy.orm import sessionmaker

from orm_models import (
    Base,
    Drive,
    Intervention,
    InterventionAction,
    MentorNote,
    MentorStudent,
    StudentDriveResult,
    StudentRoster,
    UploadLog,
    User,
)

DB_PATH = os.path.join(os.path.dirname(__file__), "database.db")
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DB_PATH.replace(os.sep, '/')}")
engine_options = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}
engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(sep=" ", timespec="seconds")


def _as_dict(entity):
    return {column.key: getattr(entity, column.key) for column in entity.__mapper__.column_attrs}


@contextmanager
def session_scope():
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database and create tables if they do not exist."""
    try:
        Base.metadata.create_all(engine)
    except Exception:
        pass
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create the authenticate table as required
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS authenticate (
            uuid TEXT PRIMARY KEY,
            gmail TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        )
    """)
    
    # Create the drives table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS drives (
            id TEXT PRIMARY KEY,
            company_name TEXT NOT NULL,
            job_role TEXT NOT NULL,
            ctc_lpa REAL NOT NULL,
            min_cgpa REAL NOT NULL,
            allowed_branches TEXT NOT NULL,
            location TEXT NOT NULL,
            status TEXT NOT NULL,
            deadline TEXT,
            current_round INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create the student drive results table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS student_drive_results (
            id TEXT PRIMARY KEY,
            drive_id TEXT NOT NULL,
            gmail TEXT NOT NULL,
            result TEXT NOT NULL,
            round INTEGER DEFAULT 1,
            score REAL,
            max_score REAL,
            feedback TEXT,
            weakness_area TEXT,
            rejection_reason TEXT,
            attempt_date TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(drive_id, gmail)
        )
    """)
    conn.commit()

    # Migrations for pre-existing database tables
    for col_def in [
        ("min_cgpa", "REAL DEFAULT 0.0"),
        ("allowed_branches", "TEXT DEFAULT 'All'"),
        ("location", "TEXT DEFAULT 'On Campus'"),
        ("status", "TEXT DEFAULT 'Active'"),
        ("deadline", "TEXT"),
        ("current_round", "INTEGER DEFAULT 1"),
        ("company_type", "TEXT DEFAULT 'PRODUCT'"),
        ("required_cgpa", "REAL DEFAULT 0.0"),
        ("total_rounds", "INTEGER DEFAULT 4"),
        ("drive_date", "TEXT"),
        ("description", "TEXT")
    ]:
        try:
            cursor.execute(f"ALTER TABLE drives ADD COLUMN {col_def[0]} {col_def[1]}")
            conn.commit()
        except sqlite3.OperationalError:
            pass

    for col_def in [
        ("round", "INTEGER DEFAULT 1"),
        ("score", "REAL")
    ]:
        try:
            cursor.execute(f"ALTER TABLE student_drive_results ADD COLUMN {col_def[0]} {col_def[1]}")
            conn.commit()
        except sqlite3.OperationalError:
            pass

    for col_def in [
        ("is_active", "BOOLEAN DEFAULT 1"),
        ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    ]:
        try:
            cursor.execute(f"ALTER TABLE authenticate ADD COLUMN {col_def[0]} {col_def[1]}")
            conn.commit()
        except sqlite3.OperationalError:
            pass

    try:
        cursor.execute("ALTER TABLE student_drive_results ADD COLUMN round INTEGER DEFAULT 1")
        conn.commit()
    except sqlite3.OperationalError:
        pass

    for column, definition in [
        ("score", "REAL"),
        ("max_score", "REAL"),
        ("feedback", "TEXT"),
        ("weakness_area", "TEXT"),
        ("rejection_reason", "TEXT"),
        ("attempt_date", "TEXT"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE student_drive_results ADD COLUMN {column} {definition}")
            conn.commit()
        except sqlite3.OperationalError:
            pass

    try:
        cursor.execute("ALTER TABLE authenticate ADD COLUMN department TEXT DEFAULT 'CSE'")
        conn.commit()
    except sqlite3.OperationalError:
        pass

    for col_name, col_type in [
        ("year", "TEXT DEFAULT '4th Year'"),
        ("phone", "TEXT"),
        ("linkedin_url", "TEXT"),
        ("github_url", "TEXT"),
        ("portfolio_url", "TEXT"),
        ("resume_filename", "TEXT"),
        ("resume_url", "TEXT"),
        ("leetcode_handle", "TEXT"),
        ("leetcode_solved_month", "INTEGER DEFAULT 0"),
        ("leetcode_total_solved", "INTEGER DEFAULT 0"),
        ("codeforces_handle", "TEXT"),
        ("codeforces_solved_month", "INTEGER DEFAULT 0"),
        ("codeforces_rating", "INTEGER DEFAULT 0"),
        ("codechef_handle", "TEXT"),
        ("codechef_solved_month", "INTEGER DEFAULT 0"),
        ("codechef_stars", "TEXT"),
        ("hackerrank_handle", "TEXT"),
        ("hackerrank_solved_month", "INTEGER DEFAULT 0"),
        ("hackerrank_score", "INTEGER DEFAULT 0"),
        ("atcoder_handle", "TEXT"),
        ("atcoder_solved_month", "INTEGER DEFAULT 0"),
        ("atcoder_rating", "INTEGER DEFAULT 0"),
        ("monthly_total_solved", "INTEGER DEFAULT 0"),
        ("updated_at", "TEXT")
    ]:
        try:
            cursor.execute(f"ALTER TABLE students_roster ADD COLUMN {col_name} {col_type}")
            conn.commit()
        except sqlite3.OperationalError:
            pass
    # Create mentor_notes table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mentor_notes (
            note_id TEXT PRIMARY KEY,
            mentor_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create mentor_students table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mentor_students (
            id TEXT PRIMARY KEY,
            mentor_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(mentor_id, student_id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS interventions (
            id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL,
            student_gmail TEXT NOT NULL,
            title TEXT NOT NULL,
            failure_summary TEXT NOT NULL,
            ai_analysis TEXT NOT NULL,
            priority TEXT NOT NULL DEFAULT 'MEDIUM',
            status TEXT NOT NULL DEFAULT 'OPEN',
            created_by TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS intervention_actions (
            id TEXT PRIMARY KEY,
            intervention_id TEXT NOT NULL,
            title TEXT NOT NULL,
            weakness_area TEXT,
            resources TEXT,
            assigned_to TEXT,
            completed INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            due_date TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(intervention_id) REFERENCES interventions(id) ON DELETE CASCADE
        )
    """)

    # Create students_roster table
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

    # Create upload_logs table
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

    # Create rounds table for recruitment pipelines
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS rounds (
            round_id TEXT PRIMARY KEY,
            drive_id TEXT NOT NULL,
            round_number INTEGER NOT NULL,
            round_name TEXT NOT NULL,
            round_type TEXT DEFAULT 'TECHNICAL',
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(drive_id, round_number)
        )
    """)
    conn.commit()

    # Seed demo users if empty
    cursor.execute("SELECT COUNT(*) as count FROM authenticate")
    row = cursor.fetchone()
    if row["count"] == 0:
        seed_users = [
            (str(uuid.uuid4()), "coordinator@gmail.com", "coord123", "Coordinator"),
            (str(uuid.uuid4()), "student@gmail.com", "student123", "Student"),
            (str(uuid.uuid4()), "mentor@gmail.com", "mentor123", "Mentor"),
            (str(uuid.uuid4()), "department@gmail.com", "dept123", "Department"),
            (str(uuid.uuid4()), "dept.cse@gmail.com", "dept123", "Department"),
            (str(uuid.uuid4()), "recruiter@gmail.com", "recruiter123", "Recruiter")
        ]
        cursor.executemany("""
            INSERT INTO authenticate (uuid, gmail, password, role)
            VALUES (?, ?, ?, ?)
        """, seed_users)
        conn.commit()
        print("Database seeded with sample demo accounts.")
    else:
        # Ensure coordinator account exists
        cursor.execute("SELECT uuid FROM authenticate WHERE LOWER(gmail) = 'coordinator@gmail.com'")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO authenticate (uuid, gmail, password, role)
                VALUES (?, ?, ?, ?)
            """, (str(uuid.uuid4()), "coordinator@gmail.com", "coord123", "Coordinator"))
            conn.commit()

        # Ensure mentor account exists
        cursor.execute("SELECT uuid FROM authenticate WHERE LOWER(gmail) = 'mentor@gmail.com'")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO authenticate (uuid, gmail, password, role)
                VALUES (?, ?, ?, ?)
            """, (str(uuid.uuid4()), "mentor@gmail.com", "mentor123", "Mentor"))
            conn.commit()
            print("Seeded Mentor demo account.")

        # Ensure department account exists
        cursor.execute("SELECT uuid FROM authenticate WHERE LOWER(gmail) = 'department@gmail.com'")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO authenticate (uuid, gmail, password, role)
                VALUES (?, ?, ?, ?)
            """, (str(uuid.uuid4()), "department@gmail.com", "dept123", "Department"))
            conn.commit()

        cursor.execute("SELECT uuid FROM authenticate WHERE LOWER(gmail) = 'dept.cse@gmail.com'")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO authenticate (uuid, gmail, password, role)
                VALUES (?, ?, ?, ?)
            """, (str(uuid.uuid4()), "dept.cse@gmail.com", "dept123", "Department"))
            conn.commit()

        cursor.execute("SELECT uuid FROM authenticate WHERE LOWER(gmail) = 'student@gmail.com'")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO authenticate (uuid, gmail, password, role)
                VALUES (?, ?, ?, ?)
            """, (str(uuid.uuid4()), "student@gmail.com", "student123", "Student"))
            conn.commit()

        cursor.execute("SELECT uuid FROM authenticate WHERE LOWER(gmail) = 'recruiter@gmail.com'")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO authenticate (uuid, gmail, password, role)
                VALUES (?, ?, ?, ?)
            """, (str(uuid.uuid4()), "recruiter@gmail.com", "recruiter123", "Recruiter"))
            conn.commit()

        # Migrate/remove legacy Admin role records to Coordinator
        cursor.execute("UPDATE authenticate SET role = 'Coordinator' WHERE LOWER(role) = 'admin'")
        cursor.execute("DELETE FROM authenticate WHERE LOWER(gmail) = 'admin@gmail.com'")
        conn.commit()

    cursor.execute("SELECT uuid FROM authenticate WHERE LOWER(gmail) = 'mentor@gmail.com'")
    demo_mentor = cursor.fetchone()
    if demo_mentor:
        cursor.execute("SELECT uuid FROM authenticate WHERE LOWER(role) = 'student'")
        demo_students = cursor.fetchall()
        cursor.executemany("""
            INSERT OR IGNORE INTO mentor_students (id, mentor_id, student_id)
            VALUES (?, ?, ?)
        """, [(str(uuid.uuid4()), demo_mentor["uuid"], student["uuid"]) for student in demo_students])
        conn.commit()

    # Seed sample drives if drives table is empty
    cursor.execute("SELECT COUNT(*) as count FROM drives")
    d_row = cursor.fetchone()
    if d_row["count"] == 0:
        sample_drives = [
            (str(uuid.uuid4()), "Microsoft", "Software Engineer - SDE I", 18.5, 8.0, "CSE, IT, ECE, AIDS", "Bangalore / Remote", "Active", "2026-10-15"),
            (str(uuid.uuid4()), "Goldman Sachs", "Analyst - Technology Division", 22.0, 8.5, "CSE, ECE, EEE", "Hyderabad", "Active", "2026-10-20"),
            (str(uuid.uuid4()), "Amazon", "Applied Scientist / SDE", 28.0, 8.2, "CSE, IT, AIDS", "Chennai", "Upcoming", "2026-11-01")
        ]
        cursor.executemany("""
            INSERT INTO drives (id, company_name, job_role, ctc_lpa, min_cgpa, allowed_branches, location, status, deadline)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, sample_drives)
        conn.commit()
        print("Database seeded with sample recruitment drives.")

    # Ensure interview process rounds exist for all drives
    cursor.execute("SELECT id, company_name, total_rounds FROM drives")
    all_drives_for_rounds = cursor.fetchall()
    standard_round_templates = [
        (1, "Online Assessment (Aptitude & Coding)", "CODING", "Aptitude, Core CS MCQs, and algorithmic coding challenge."),
        (2, "Technical Interview I (DSA & Problem Solving)", "TECHNICAL", "Live data structures, problem solving, time & space complexity."),
        (3, "Technical Interview II (System Design & Projects)", "TECHNICAL", "System design, databases, architecture, and project walkthrough."),
        (4, "HR & Managerial Discussion", "HR", "Leadership principles, behavioral assessment, and cultural fitment."),
        (5, "Executive & Final Offer Discussion", "MANAGERIAL", "Compensation alignment, executive interview, and offer rollout.")
    ]
    for d in all_drives_for_rounds:
        d_id = d["id"]
        t_rounds = d["total_rounds"] or 4
        cursor.execute("SELECT COUNT(*) as count FROM rounds WHERE drive_id = ?", (d_id,))
        if cursor.fetchone()["count"] == 0:
            rounds_to_insert = []
            for r_num, r_name, r_type, r_desc in standard_round_templates[:t_rounds]:
                rounds_to_insert.append((str(uuid.uuid4()), d_id, r_num, r_name, r_type, r_desc))
            cursor.executemany("""
                INSERT OR IGNORE INTO rounds (round_id, drive_id, round_number, round_name, round_type, description)
                VALUES (?, ?, ?, ?, ?, ?)
            """, rounds_to_insert)
            conn.commit()

    # Ensure students_roster has academic year values set
    cursor.execute("UPDATE students_roster SET year = '4th Year' WHERE (year IS NULL OR year = '') AND (register_number LIKE '2021%' OR register_number LIKE '21%')")
    cursor.execute("UPDATE students_roster SET year = '3rd Year' WHERE (year IS NULL OR year = '') AND (register_number LIKE '2022%' OR register_number LIKE '22%')")
    cursor.execute("UPDATE students_roster SET year = '2nd Year' WHERE (year IS NULL OR year = '') AND (register_number LIKE '2023%' OR register_number LIKE '23%')")
    cursor.execute("UPDATE students_roster SET year = '1st Year' WHERE (year IS NULL OR year = '') AND (register_number LIKE '2024%' OR register_number LIKE '24%')")
    cursor.execute("UPDATE students_roster SET year = '4th Year' WHERE year IS NULL OR year = ''")
    conn.commit()

    # Seed demo students across years and departments if roster is small
    sample_roster = [
        (str(uuid.uuid4()), "2021CS101", "Rahul Sharma", "rahul.sharma@college.edu", "CSE", 7.8, 89.5, 85.2, "Python, SQL, Java", "4th Year"),
        (str(uuid.uuid4()), "2021CS102", "Ananya Reddy", "ananya.reddy@college.edu", "CSE", 8.5, 92.0, 88.0, "Java, Spring Boot, React", "4th Year"),
        (str(uuid.uuid4()), "2021IT103", "Vikram Patel", "vikram.patel@college.edu", "IT", 6.9, 78.0, 72.0, "Python, HTML, CSS", "4th Year"),
        (str(uuid.uuid4()), "2021EC104", "Deepa Krishnan", "deepa.krishnan@college.edu", "ECE", 7.2, 85.0, 80.0, "C++, Embedded Systems", "4th Year"),
        (str(uuid.uuid4()), "2021CS105", "Sneha Gupta", "sneha.gupta@college.edu", "CSE", 9.1, 95.0, 93.5, "DSA, System Design, C++, AWS", "4th Year"),
        (str(uuid.uuid4()), "2021EC106", "Arjun Menon", "arjun.menon@college.edu", "ECE", 7.5, 88.0, 82.0, "C, Python, IoT", "4th Year"),
        (str(uuid.uuid4()), "2021CS107", "Priya Nair", "priya.nair@college.edu", "CSE", 8.2, 90.5, 87.0, "Python, ML, Data Science", "4th Year"),
        (str(uuid.uuid4()), "2021CS108", "Demo Student", "student@gmail.com", "CSE", 8.4, 91.0, 88.5, "Python, React, FastAPI", "4th Year"),
        (str(uuid.uuid4()), "2022CS201", "Karthik Sundaram", "karthik.sundaram@college.edu", "CSE", 8.6, 92.5, 90.0, "Java, DSA, Spring Boot", "3rd Year"),
        (str(uuid.uuid4()), "2022IT202", "Meera Nambiar", "meera.nambiar@college.edu", "IT", 7.9, 86.0, 84.0, "React, Node.js, TypeScript", "3rd Year"),
        (str(uuid.uuid4()), "2022EC203", "Rohan Joshi", "rohan.joshi@college.edu", "ECE", 8.1, 89.0, 85.5, "VLSI, Embedded C, Python", "3rd Year"),
        (str(uuid.uuid4()), "2022EE204", "Divya Ramesh", "divya.ramesh@college.edu", "EEE", 7.4, 82.0, 79.0, "Power Electronics, MATLAB, C", "3rd Year"),
        (str(uuid.uuid4()), "2023CS301", "Aditya Varma", "aditya.varma@college.edu", "CSE", 8.8, 94.0, 92.0, "C++, Data Structures, Python", "2nd Year"),
        (str(uuid.uuid4()), "2023IT302", "Pooja Hegde", "pooja.hegde@college.edu", "IT", 8.2, 90.0, 88.0, "Python, Web Development, UI/UX", "2nd Year"),
        (str(uuid.uuid4()), "2023ME303", "Siddharth Rao", "siddharth.rao@college.edu", "MECH", 7.1, 80.0, 76.0, "CAD, SolidWorks, Python", "2nd Year"),
        (str(uuid.uuid4()), "2024CS401", "Varun Kapoor", "varun.kapoor@college.edu", "CSE", 8.5, 93.0, 91.0, "C, Python, Problem Solving", "1st Year"),
        (str(uuid.uuid4()), "2024EC402", "Kavya Swaminathan", "kavya.swaminathan@college.edu", "ECE", 8.9, 95.0, 93.0, "C, Mathematics, Digital Logic", "1st Year")
    ]
    for row in sample_roster:
        cursor.execute("""
            INSERT OR IGNORE INTO students_roster (student_id, register_number, name, email, department, cgpa, tenth_percentage, twelfth_percentage, skills, year)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, row)
    conn.commit()

    # Seed or populate coding profile metrics and resume info for demo accounts if empty
    cursor.execute("""
        UPDATE students_roster
        SET phone = COALESCE(phone, '+91 98765 43210'),
            linkedin_url = COALESCE(linkedin_url, 'https://linkedin.com/in/alex-rivera-cs'),
            github_url = COALESCE(github_url, 'https://github.com/alexrivera-dev'),
            portfolio_url = COALESCE(portfolio_url, 'https://alexrivera.dev'),
            resume_filename = COALESCE(resume_filename, 'Demo_Student_Resume.pdf'),
            resume_url = COALESCE(resume_url, '/static/uploads/resumes/Demo_Student_Resume.pdf'),
            leetcode_handle = COALESCE(leetcode_handle, 'alex_coder'),
            leetcode_solved_month = CASE WHEN leetcode_solved_month IS NULL OR leetcode_solved_month = 0 THEN 22 ELSE leetcode_solved_month END,
            leetcode_total_solved = CASE WHEN leetcode_total_solved IS NULL OR leetcode_total_solved = 0 THEN 340 ELSE leetcode_total_solved END,
            codeforces_handle = COALESCE(codeforces_handle, 'alex_cf'),
            codeforces_solved_month = CASE WHEN codeforces_solved_month IS NULL OR codeforces_solved_month = 0 THEN 14 ELSE codeforces_solved_month END,
            codeforces_rating = CASE WHEN codeforces_rating IS NULL OR codeforces_rating = 0 THEN 1380 ELSE codeforces_rating END,
            codechef_handle = COALESCE(codechef_handle, 'alex_cc'),
            codechef_solved_month = CASE WHEN codechef_solved_month IS NULL OR codechef_solved_month = 0 THEN 11 ELSE codechef_solved_month END,
            codechef_stars = COALESCE(codechef_stars, '3-Star'),
            hackerrank_handle = COALESCE(hackerrank_handle, 'alex_hr'),
            hackerrank_solved_month = CASE WHEN hackerrank_solved_month IS NULL OR hackerrank_solved_month = 0 THEN 15 ELSE hackerrank_solved_month END,
            hackerrank_score = CASE WHEN hackerrank_score IS NULL OR hackerrank_score = 0 THEN 520 ELSE hackerrank_score END,
            atcoder_handle = COALESCE(atcoder_handle, 'alex_atc'),
            atcoder_solved_month = CASE WHEN atcoder_solved_month IS NULL OR atcoder_solved_month = 0 THEN 8 ELSE atcoder_solved_month END,
            atcoder_rating = CASE WHEN atcoder_rating IS NULL OR atcoder_rating = 0 THEN 890 ELSE atcoder_rating END,
            monthly_total_solved = 70
        WHERE LOWER(email) = 'student@gmail.com' AND (leetcode_handle IS NULL OR leetcode_handle = '')
    """)
    cursor.execute("""
        UPDATE students_roster
        SET phone = COALESCE(phone, '+91 98111 22334'),
            linkedin_url = COALESCE(linkedin_url, 'https://linkedin.com/in/rahul-sharma'),
            github_url = COALESCE(github_url, 'https://github.com/rahulsharma'),
            resume_filename = COALESCE(resume_filename, 'Demo_Student_Resume.pdf'),
            resume_url = COALESCE(resume_url, '/static/uploads/resumes/Demo_Student_Resume.pdf'),
            leetcode_handle = COALESCE(leetcode_handle, 'rahul_codes'),
            leetcode_solved_month = CASE WHEN leetcode_solved_month IS NULL OR leetcode_solved_month = 0 THEN 15 ELSE leetcode_solved_month END,
            leetcode_total_solved = CASE WHEN leetcode_total_solved IS NULL OR leetcode_total_solved = 0 THEN 210 ELSE leetcode_total_solved END,
            codeforces_handle = COALESCE(codeforces_handle, 'rahul_s'),
            codeforces_solved_month = CASE WHEN codeforces_solved_month IS NULL OR codeforces_solved_month = 0 THEN 10 ELSE codeforces_solved_month END,
            codeforces_rating = CASE WHEN codeforces_rating IS NULL OR codeforces_rating = 0 THEN 1250 ELSE codeforces_rating END,
            codechef_handle = COALESCE(codechef_handle, 'rahul_cc'),
            codechef_solved_month = CASE WHEN codechef_solved_month IS NULL OR codechef_solved_month = 0 THEN 8 ELSE codechef_solved_month END,
            codechef_stars = COALESCE(codechef_stars, '2-Star'),
            hackerrank_handle = COALESCE(hackerrank_handle, 'rahul_hr'),
            hackerrank_solved_month = CASE WHEN hackerrank_solved_month IS NULL OR hackerrank_solved_month = 0 THEN 12 ELSE hackerrank_solved_month END,
            hackerrank_score = CASE WHEN hackerrank_score IS NULL OR hackerrank_score = 0 THEN 410 ELSE hackerrank_score END,
            atcoder_handle = COALESCE(atcoder_handle, 'rahul_at'),
            atcoder_solved_month = CASE WHEN atcoder_solved_month IS NULL OR atcoder_solved_month = 0 THEN 5 ELSE atcoder_solved_month END,
            atcoder_rating = CASE WHEN atcoder_rating IS NULL OR atcoder_rating = 0 THEN 750 ELSE atcoder_rating END,
            monthly_total_solved = 50
        WHERE LOWER(email) = 'rahul.sharma@college.edu' AND (leetcode_handle IS NULL OR leetcode_handle = '')
    """)
    cursor.execute("""
        UPDATE students_roster
        SET phone = COALESCE(phone, '+91 98222 33445'),
            linkedin_url = COALESCE(linkedin_url, 'https://linkedin.com/in/vikram-patel'),
            github_url = COALESCE(github_url, 'https://github.com/vikrampatel'),
            resume_filename = COALESCE(resume_filename, 'Demo_Student_Resume.pdf'),
            resume_url = COALESCE(resume_url, '/static/uploads/resumes/Demo_Student_Resume.pdf'),
            leetcode_handle = COALESCE(leetcode_handle, 'vikram_p'),
            leetcode_solved_month = CASE WHEN leetcode_solved_month IS NULL OR leetcode_solved_month = 0 THEN 8 ELSE leetcode_solved_month END,
            leetcode_total_solved = CASE WHEN leetcode_total_solved IS NULL OR leetcode_total_solved = 0 THEN 95 ELSE leetcode_total_solved END,
            codeforces_handle = COALESCE(codeforces_handle, 'vikram_cf'),
            codeforces_solved_month = CASE WHEN codeforces_solved_month IS NULL OR codeforces_solved_month = 0 THEN 5 ELSE codeforces_solved_month END,
            codeforces_rating = CASE WHEN codeforces_rating IS NULL OR codeforces_rating = 0 THEN 1050 ELSE codeforces_rating END,
            codechef_handle = COALESCE(codechef_handle, 'vikram_cc'),
            codechef_solved_month = CASE WHEN codechef_solved_month IS NULL OR codechef_solved_month = 0 THEN 4 ELSE codechef_solved_month END,
            codechef_stars = COALESCE(codechef_stars, '2-Star'),
            hackerrank_handle = COALESCE(hackerrank_handle, 'vikram_hr'),
            hackerrank_solved_month = CASE WHEN hackerrank_solved_month IS NULL OR hackerrank_solved_month = 0 THEN 6 ELSE hackerrank_solved_month END,
            hackerrank_score = CASE WHEN hackerrank_score IS NULL OR hackerrank_score = 0 THEN 310 ELSE hackerrank_score END,
            atcoder_handle = COALESCE(atcoder_handle, 'vikram_atc'),
            atcoder_solved_month = CASE WHEN atcoder_solved_month IS NULL OR atcoder_solved_month = 0 THEN 2 ELSE atcoder_solved_month END,
            atcoder_rating = CASE WHEN atcoder_rating IS NULL OR atcoder_rating = 0 THEN 610 ELSE atcoder_rating END,
            monthly_total_solved = 25
        WHERE LOWER(email) = 'vikram.patel@college.edu' AND (leetcode_handle IS NULL OR leetcode_handle = '')
    """)
    # Automatically compute monthly_total_solved for all records
    cursor.execute("""
        UPDATE students_roster
        SET monthly_total_solved = (
            COALESCE(leetcode_solved_month, 0) +
            COALESCE(codeforces_solved_month, 0) +
            COALESCE(codechef_solved_month, 0) +
            COALESCE(hackerrank_solved_month, 0) +
            COALESCE(atcoder_solved_month, 0)
        )
        WHERE monthly_total_solved IS NULL OR monthly_total_solved = 0
    """)
    conn.commit()

    # Seed sample realistic interventions if empty
    cursor.execute("SELECT COUNT(*) as count FROM interventions")
    if cursor.fetchone()["count"] == 0:
        iv_seed = [
            (
                "iv-vikram-patel-01",
                "c20f81de-9536-4b19-bf49-4205d7180dd5",
                "vikram.patel@college.edu",
                "Critical DSA & Algorithmic Problem Solving Remediation",
                "Failed Round 1 Online Coding Assessment with 35% score. Weakness in recursion, arrays, and time complexity.",
                "Targeted 3-week coding practice plan required on LeetCode Easy/Medium and weekly mock assessments.",
                "HIGH",
                "OPEN",
                "coordinator@gmail.com"
            ),
            (
                "iv-deepa-krishnan-02",
                "4753c63e-a1b8-41f3-b2ad-e6814221e0b0",
                "deepa.krishnan@college.edu",
                "Core Technical & System Architecture Refinement",
                "Struggled in Technical Interview Round 2 on Object-Oriented Design and SQL database queries.",
                "Needs focused mentoring on SQL joins, OOP fundamentals, and mock technical interview practice.",
                "MEDIUM",
                "IN PROGRESS",
                "coordinator@gmail.com"
            ),
            (
                "iv-divya-ramesh-03",
                "divya-ramesh-uuid-03",
                "divya.ramesh@college.edu",
                "Quantitative Aptitude & Logical Reasoning Foundation",
                "Scored 42% in Aptitude diagnostic. Needs speed enhancement in time & work and probability.",
                "Daily timed quiz practice and shortcut techniques training with department mentor.",
                "MEDIUM",
                "OPEN",
                "coordinator@gmail.com"
            )
        ]
        cursor.executemany("""
            INSERT OR IGNORE INTO interventions (id, student_id, student_gmail, title, failure_summary, ai_analysis, priority, status, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, iv_seed)

        actions_seed = [
            ("act-v1", "iv-vikram-patel-01", "Solve 15 LeetCode Easy & 10 Medium Array problems", "DSA & Algorithms", "LeetCode Curated 75", "Vikram Patel", 0, "Focus on two-pointer technique", "2026-10-18"),
            ("act-v2", "iv-vikram-patel-01", "1:1 Aptitude session with Prof. Anitha", "Core Aptitude", "Campus Placement Prep LMS", "Prof. Anitha S", 1, "Completed session on Oct 4", "2026-10-10"),
            ("act-v3", "iv-vikram-patel-01", "Re-take DSA Mock Test on portal", "Assessment Speed", "Portal Assessment Hub", "Vikram Patel", 0, "Scheduled for Friday 4 PM", "2026-10-22"),
            ("act-d1", "iv-deepa-krishnan-02", "Complete SQL Queries & Indexing Assignment", "Relational Databases", "Mode Analytics SQL Tutorial", "Deepa Krishnan", 1, "Submitted assignment", "2026-10-12"),
            ("act-d2", "iv-deepa-krishnan-02", "Mock Technical Interview with Mentor Dr. Ramesh", "OOP & System Design", "Internal Mock Room 2", "Dr. Ramesh Kumar", 0, "Booked for next Tuesday", "2026-10-19"),
            ("act-dr1", "iv-divya-ramesh-03", "Complete 50 Quantitative Practice Questions", "Time & Work, Probability", "R.S. Aggarwal Aptitude LMS", "Divya Ramesh", 0, "Complete module 3", "2026-10-25")
        ]
        cursor.executemany("""
            INSERT OR IGNORE INTO intervention_actions (id, intervention_id, title, weakness_area, resources, assigned_to, completed, notes, due_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, actions_seed)
        conn.commit()
        
    conn.close()

def get_user_by_gmail(gmail: str):
    """Fetch user record from 'authenticate' table by gmail."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT uuid, gmail, password, role, department FROM authenticate WHERE LOWER(gmail) = LOWER(?)", (gmail.strip(),))
    user = cursor.fetchone()
    conn.close()
    if user:
        return dict(user)
    return None

def get_user_by_id(user_id: str):
    """Fetch a user record by the authenticated UUID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT uuid, gmail, password, role, department FROM authenticate WHERE uuid = ?",
        (user_id,)
    )
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None

def get_all_users():
    """Retrieve all accounts (without secrets) for demo quick-fill feature."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT uuid, gmail, role FROM authenticate")
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return users

def get_all_drives():
    """Fetch all placement drives from SQLite with dynamic results count, description, and total_rounds."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT d.id, d.company_name, d.job_role, d.ctc_lpa, d.min_cgpa, d.allowed_branches, d.location, d.status, d.deadline,
               d.description, COALESCE(d.total_rounds, 4) as total_rounds, d.current_round, d.created_at,
               COUNT(sdr.id) as results_count
        FROM drives d
        LEFT JOIN student_drive_results sdr ON d.id = sdr.drive_id
        GROUP BY d.id
        ORDER BY d.created_at DESC
    """)
    drives = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return drives

def create_drive(company_name: str, job_role: str, ctc_lpa: float, min_cgpa: float, allowed_branches: str, location: str, status: str = "Active", deadline: str = None, description: str = None, total_rounds: int = 4, rounds: list = None):
    """Create a new placement drive record with customized total rounds, description, and round pipelines."""
    conn = get_db_connection()
    cursor = conn.cursor()
    drive_id = str(uuid.uuid4())
    t_rounds = int(total_rounds or 4)
    if t_rounds < 1:
        t_rounds = 1

    cursor.execute("""
        INSERT INTO drives (id, company_name, job_role, ctc_lpa, min_cgpa, allowed_branches, location, status, deadline, description, total_rounds, current_round)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    """, (drive_id, company_name, job_role, ctc_lpa, min_cgpa, allowed_branches, location, status, deadline, description, t_rounds))

    # Populate configured selection rounds in `rounds` table
    if rounds and len(rounds) > 0:
        for idx, r in enumerate(rounds):
            r_num = int(r.get("round_number") or (idx + 1))
            r_name = str(r.get("round_name") or f"Round {r_num}").strip()
            r_type = str(r.get("round_type") or "TECHNICAL").strip().upper()
            r_desc = str(r.get("description") or "").strip()
            r_id = str(r.get("round_id") or f"round-{drive_id}-{r_num}")
            cursor.execute("""
                INSERT INTO rounds (round_id, drive_id, round_number, round_name, round_type, description)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(drive_id, round_number) DO UPDATE SET
                    round_name = excluded.round_name,
                    round_type = excluded.round_type,
                    description = excluded.description
            """, (r_id, drive_id, r_num, r_name, r_type, r_desc))
    else:
        # Generate default progressive rounds matching configured total_rounds
        std_defaults = [
            (1, "Online Assessment (Aptitude & Coding)", "CODING", "Aptitude, Core CS MCQs, and algorithmic coding challenge."),
            (2, "Technical Interview I (DSA & Problem Solving)", "TECHNICAL", "Live data structures, problem solving, time & space complexity."),
            (3, "Technical Interview II (System Design & Projects)", "TECHNICAL", "System design, databases, architecture, and project walkthrough."),
            (4, "HR & Managerial Discussion", "HR", "Leadership principles, behavioral assessment, and cultural fitment."),
            (5, "Executive Leadership Interview", "MANAGERIAL", "Director / Leadership interview, fitment, and offer discussion."),
            (6, "Founder / Partner Discussion", "HR", "Final alignment, compensation, and onboarding roadmap.")
        ]
        for r_num in range(1, t_rounds + 1):
            if r_num <= len(std_defaults):
                d_item = std_defaults[r_num - 1]
                r_name, r_type, r_desc = d_item[1], d_item[2], d_item[3]
            else:
                r_name, r_type, r_desc = f"Round {r_num} Evaluation", "TECHNICAL", f"Round {r_num} evaluation stage for candidates."
            
            cursor.execute("""
                INSERT INTO rounds (round_id, drive_id, round_number, round_name, round_type, description)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(drive_id, round_number) DO UPDATE SET
                    round_name = excluded.round_name,
                    round_type = excluded.round_type,
                    description = excluded.description
            """, (f"round-{drive_id}-{r_num}", drive_id, r_num, r_name, r_type, r_desc))

    conn.commit()
    cursor.execute("""
        SELECT id, company_name, job_role, ctc_lpa, min_cgpa, allowed_branches, location, status,
               deadline, description, COALESCE(total_rounds, 4) as total_rounds, current_round, created_at
        FROM drives WHERE id = ?
    """, (drive_id,))
    new_drive = dict(cursor.fetchone())
    conn.close()

    new_drive["rounds"] = get_drive_rounds(drive_id)
    return new_drive

def update_drive(
    drive_id: str,
    company_name: str = None,
    job_role: str = None,
    ctc_lpa: float = None,
    min_cgpa: float = None,
    allowed_branches: str = None,
    location: str = None,
    status: str = None,
    deadline: str = None,
    description: str = None,
    total_rounds: int = None,
    rounds: list = None
):
    """Alter / update an existing company drive, its description, number of rounds, and round details."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM drives WHERE id = ?", (drive_id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        return None

    cur_cname = company_name if company_name is not None else existing["company_name"]
    cur_role = job_role if job_role is not None else existing["job_role"]
    cur_ctc = ctc_lpa if ctc_lpa is not None else existing["ctc_lpa"]
    cur_cgpa = min_cgpa if min_cgpa is not None else existing["min_cgpa"]
    cur_branches = allowed_branches if allowed_branches is not None else existing["allowed_branches"]
    cur_loc = location if location is not None else existing["location"]
    cur_status = status if status is not None else existing["status"]
    cur_deadline = deadline if deadline is not None else existing["deadline"]
    cur_desc = description if description is not None else (existing.get("description") if "description" in existing.keys() else "")

    t_rounds = total_rounds
    if t_rounds is None and rounds:
        t_rounds = len(rounds)
    if t_rounds is None:
        t_rounds = existing.get("total_rounds") if "total_rounds" in existing.keys() else 4
    t_rounds = int(t_rounds or 4)
    if t_rounds < 1:
        t_rounds = 1

    cursor.execute("""
        UPDATE drives SET
            company_name = ?, job_role = ?, ctc_lpa = ?, min_cgpa = ?, allowed_branches = ?,
            location = ?, status = ?, deadline = ?, description = ?, total_rounds = ?
        WHERE id = ?
    """, (cur_cname, cur_role, cur_ctc, cur_cgpa, cur_branches, cur_loc, cur_status, cur_deadline, cur_desc, t_rounds, drive_id))

    # If new round details supplied, update rounds
    if rounds is not None:
        # Remove any rounds beyond the new total_rounds
        cursor.execute("DELETE FROM rounds WHERE drive_id = ? AND round_number > ?", (drive_id, t_rounds))
        for idx, r in enumerate(rounds):
            r_num = int(r.get("round_number") or (idx + 1))
            if r_num > t_rounds:
                continue
            r_name = str(r.get("round_name") or f"Round {r_num}").strip()
            r_type = str(r.get("round_type") or "TECHNICAL").strip().upper()
            r_desc = str(r.get("description") or "").strip()
            r_id = str(r.get("round_id") or f"round-{drive_id}-{r_num}")
            cursor.execute("""
                INSERT INTO rounds (round_id, drive_id, round_number, round_name, round_type, description)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(drive_id, round_number) DO UPDATE SET
                    round_name = excluded.round_name,
                    round_type = excluded.round_type,
                    description = excluded.description
            """, (r_id, drive_id, r_num, r_name, r_type, r_desc))
    elif total_rounds is not None:
        # If total_rounds was updated without explicit round list, adjust existing rounds
        cursor.execute("DELETE FROM rounds WHERE drive_id = ? AND round_number > ?", (drive_id, t_rounds))
        cursor.execute("SELECT round_number FROM rounds WHERE drive_id = ?", (drive_id,))
        existing_r_nums = set(row["round_number"] for row in cursor.fetchall())
        for r_num in range(1, t_rounds + 1):
            if r_num not in existing_r_nums:
                cursor.execute("""
                    INSERT INTO rounds (round_id, drive_id, round_number, round_name, round_type, description)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (f"round-{drive_id}-{r_num}", drive_id, r_num, f"Round {r_num}", "TECHNICAL", f"Round {r_num} assessment."))

    conn.commit()
    cursor.execute("""
        SELECT id, company_name, job_role, ctc_lpa, min_cgpa, allowed_branches, location, status,
               deadline, description, COALESCE(total_rounds, 4) as total_rounds, current_round, created_at
        FROM drives WHERE id = ?
    """, (drive_id,))
    updated_drive = dict(cursor.fetchone())
    conn.close()

    updated_drive["rounds"] = get_drive_rounds(drive_id)
    return updated_drive

def register_student_for_drive(drive_id: str, gmail: str):
    """
    Registers a candidate when they apply for a company drive.
    The candidate enters at Round 1 with status 'Applied'.
    They only appear in Round 1 and are NOT selected in Round 1.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    gmail_clean = gmail.strip().lower()

    # Check if student is already registered for this drive
    cursor.execute("SELECT round, result FROM student_drive_results WHERE drive_id = ? AND LOWER(gmail) = ?", (drive_id, gmail_clean))
    existing = cursor.fetchone()

    if existing:
        conn.close()
        return {
            "gmail": gmail_clean,
            "round": existing["round"] or 1,
            "result": existing["result"] or "Applied"
        }

    res_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO student_drive_results (id, drive_id, gmail, result, round, updated_at)
        VALUES (?, ?, ?, 'Applied', 1, CURRENT_TIMESTAMP)
        ON CONFLICT(drive_id, gmail) DO UPDATE SET
            round = 1,
            result = 'Applied',
            updated_at = CURRENT_TIMESTAMP
    """, (res_id, drive_id, gmail_clean))
    conn.commit()
    conn.close()

    return {
        "gmail": gmail_clean,
        "round": 1,
        "result": "Applied"
    }

def advance_or_update_candidate(drive_id: str, gmail: str, action: str, total_rounds: int = 4, score: float = None, feedback: str = None, round_num: int = None):
    """
    Coordinator updates or advances a candidate in a drive:
    - 'select' / 'selected' / 'advance' / 'shortlist':
      - In intermediate rounds (cur_round < total_rounds): Candidate clears current round and moves to appear in Round cur_round + 1 ('Shortlisted for Round {cur_round+1}').
      - In final round (cur_round >= total_rounds): Candidate receives the Job Offer ('Offered').
    - 'reject' / 'rejected': Candidate marked 'Rejected' for current round.
    - 'offer' / 'offered' / 'placed': Directly marks candidate as 'Offered' at final round.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    gmail_clean = gmail.strip().lower()

    cursor.execute("SELECT round, result FROM student_drive_results WHERE drive_id = ? AND LOWER(gmail) = ?", (drive_id, gmail_clean))
    existing = cursor.fetchone()
    cur_round = round_num or (existing["round"] if existing and existing["round"] else 1)

    act_lower = (action or "advance").strip().lower()
    if act_lower in ["reject", "rejected", "fail"]:
        new_round = cur_round
        new_result = "Rejected"
    elif act_lower in ["offer", "offered", "placed", "hired"]:
        new_round = total_rounds
        new_result = "Offered"
    elif act_lower in ["select", "selected", "advance", "shortlist", "cleared", "pass"]:
        if cur_round < total_rounds:
            new_round = cur_round + 1
            new_result = f"Shortlisted for Round {new_round}"
        else:
            new_round = total_rounds
            new_result = "Selected"
    else:
        new_round = cur_round
        new_result = action.capitalize()

    res_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO student_drive_results (id, drive_id, gmail, result, round, score, feedback, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(drive_id, gmail) DO UPDATE SET
            round = excluded.round,
            result = excluded.result,
            score = COALESCE(excluded.score, student_drive_results.score),
            feedback = COALESCE(excluded.feedback, student_drive_results.feedback),
            updated_at = CURRENT_TIMESTAMP
    """, (res_id, drive_id, gmail_clean, new_result, new_round, score, feedback))
    conn.commit()
    conn.close()

    return {
        "gmail": gmail_clean,
        "round": new_round,
        "result": new_result,
        "status": "Updated"
    }

def increment_student_drive_round(drive_id: str, gmail: str):
    """
    Increment a student's round for a specific drive by 1 in the student database.
    Promotes student to next round with 'Shortlisted for Round N' (appearing in Round N).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    gmail_clean = gmail.strip().lower()

    cursor.execute("SELECT total_rounds, current_round FROM drives WHERE id = ?", (drive_id,))
    drive_row = cursor.fetchone()
    t_rounds = drive_row["total_rounds"] if (drive_row and "total_rounds" in drive_row.keys() and drive_row["total_rounds"]) else 4

    cursor.execute("SELECT round FROM student_drive_results WHERE drive_id = ? AND LOWER(gmail) = ?", (drive_id, gmail_clean))
    existing = cursor.fetchone()

    if existing and existing["round"] is not None:
        new_round = existing["round"] + 1
    else:
        new_round = 2

    if new_round <= t_rounds:
        result_str = f"Shortlisted for Round {new_round}"
    else:
        new_round = t_rounds
        result_str = "Selected"

    res_id = str(uuid.uuid4())

    cursor.execute("""
        INSERT INTO student_drive_results (id, drive_id, gmail, result, round, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(drive_id, gmail) DO UPDATE SET
            round = excluded.round,
            result = excluded.result,
            updated_at = CURRENT_TIMESTAMP
    """, (res_id, drive_id, gmail_clean, result_str, new_round))
    conn.commit()
    conn.close()

    return {
        "gmail": gmail_clean,
        "round": new_round,
        "result": result_str
    }

def increment_drive_current_round(drive_id: str):
    """Increment overall drive round counter by 1."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE drives SET current_round = COALESCE(current_round, 1) + 1 WHERE id = ?", (drive_id,))
    conn.commit()
    conn.close()

def upsert_student_drive_result(
    drive_id: str,
    gmail: str,
    result: str,
    round_number: int = None,
    score: float = None,
    max_score: float = None,
    feedback: str = None,
    weakness_area: str = None,
    rejection_reason: str = None,
    attempt_date: str = None,
):
    """Insert or update a student's result status for a specific company drive."""
    conn = get_db_connection()
    cursor = conn.cursor()
    res_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO student_drive_results
            (id, drive_id, gmail, result, round, score, max_score, feedback,
             weakness_area, rejection_reason, attempt_date, updated_at)
        VALUES (?, ?, LOWER(?), ?, COALESCE(?, 1), ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(drive_id, gmail) DO UPDATE SET
            result = excluded.result,
            round = CASE WHEN ? IS NULL THEN student_drive_results.round ELSE excluded.round END,
            score = excluded.score,
            max_score = excluded.max_score,
            feedback = excluded.feedback,
            weakness_area = excluded.weakness_area,
            rejection_reason = excluded.rejection_reason,
            attempt_date = excluded.attempt_date,
            updated_at = CURRENT_TIMESTAMP
    """, (
        res_id, drive_id, gmail.strip(), result.strip(), round_number, score,
        max_score, feedback, weakness_area, rejection_reason, attempt_date
    , round_number))
    conn.commit()
    conn.close()

def get_drive_results(drive_id: str):
    """Fetch all candidate evaluation results for a specific placement drive enriched with student academic details."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT sdr.id, sdr.drive_id, sdr.gmail, sdr.result, sdr.round, sdr.score, sdr.max_score,
               sdr.feedback, sdr.weakness_area, sdr.rejection_reason, sdr.attempt_date, sdr.updated_at,
               COALESCE(sr.name, '') as student_name,
               COALESCE(sr.register_number, '') as register_number,
               COALESCE(sr.department, 'CSE') as department,
               COALESCE(sr.cgpa, 0.0) as cgpa
        FROM student_drive_results sdr
        LEFT JOIN students_roster sr ON LOWER(sdr.gmail) = LOWER(sr.email)
        WHERE sdr.drive_id = ? 
        ORDER BY sdr.round DESC, sdr.updated_at DESC
    """, (drive_id,))
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    for r in results:
        if not r.get("student_name"):
            r["student_name"] = r["gmail"].split("@")[0].replace(".", " ").replace("_", " ").title()
    return results

def get_drive_rounds(drive_id: str):
    """Retrieve configured selection rounds for a placement drive, generating defaults if absent."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT round_id, drive_id, round_number, round_name, round_type, description, created_at
        FROM rounds
        WHERE drive_id = ?
        ORDER BY round_number ASC
    """, (drive_id,))
    rounds = [dict(r) for r in cursor.fetchall()]
    conn.close()
    if not rounds:
        drive = get_drive(drive_id)
        t_rounds = int(drive.get("total_rounds", 4) if drive else 4)
        std_defaults = [
            (1, "Online Assessment (Aptitude & Coding)", "CODING", "Aptitude, Core CS MCQs, and algorithmic coding challenge."),
            (2, "Technical Interview I (DSA & Problem Solving)", "TECHNICAL", "Live data structures, problem solving, time & space complexity."),
            (3, "Technical Interview II (System Design & Projects)", "TECHNICAL", "System design, databases, architecture, and project walkthrough."),
            (4, "HR & Managerial Discussion", "HR", "Leadership principles, behavioral assessment, and cultural fitment."),
            (5, "Executive Leadership Interview", "MANAGERIAL", "Director / Leadership interview, fitment, and offer discussion."),
            (6, "Founder / Partner Discussion", "HR", "Final alignment, compensation, and onboarding roadmap.")
        ]
        rounds = []
        for r_num in range(1, t_rounds + 1):
            if r_num <= len(std_defaults):
                d_item = std_defaults[r_num - 1]
                r_name, r_type, r_desc = d_item[1], d_item[2], d_item[3]
            else:
                r_name, r_type, r_desc = f"Round {r_num} Evaluation", "TECHNICAL", f"Round {r_num} evaluation stage."
            rounds.append({
                "round_id": f"round-{drive_id}-{r_num}",
                "drive_id": drive_id,
                "round_number": r_num,
                "round_name": r_name,
                "round_type": r_type,
                "description": r_desc
            })
    return rounds

def get_drive_process_details(drive_id: str):
    """
    Returns complete interview process, funnel statistics, per-round cleared candidates,
    and all selected students for a company drive.
    """
    drive = get_drive(drive_id)
    if not drive:
        return None

    rounds = get_drive_rounds(drive_id)
    results = get_drive_results(drive_id)
    total_rounds = len(rounds)

    processed_rounds = []
    for r in rounds:
        r_num = r["round_number"]
        appeared = [s for s in results if (s.get("round") or 1) >= r_num]

        def did_clear_round(s):
            current_r = s.get("round") or 1
            res_str = (s.get("result") or "").lower().strip()

            # Rule 1: Candidate has already advanced to a higher round than r_num -> Cleared r_num!
            if current_r > r_num:
                return True

            # Rule 2: Candidate has not reached this round yet -> Not cleared!
            if current_r < r_num:
                return False

            # Rule 3: Candidate is currently at this round (current_r == r_num)
            # 3a. Rejection check
            if any(w in res_str for w in ["reject", "fail", "not select", "not-select", "unselect", "eliminated", "disqualif"]):
                return False

            # 3b. Applied / In-progress / Pending / Evaluating -> NOT cleared!
            if any(w in res_str for w in ["applied", "registered", "in progress", "evaluating", "appearing", "scheduled", "pending", "on hold"]):
                return False

            # 3c. "Shortlisted for Round X" check:
            # If shortlisted to attend round X and X <= r_num, they are attending r_num and have NOT cleared it yet!
            import re
            m_short = re.search(r'round\s*(\d+)', res_str)
            if m_short and ("shortlist" in res_str or "for round" in res_str):
                target_r = int(m_short.group(1))
                if target_r <= r_num:
                    return False
                else:
                    return True

            # 3d. Standalone "shortlisted" at intermediate round:
            if "shortlist" in res_str and r_num < total_rounds:
                return False

            # 3e. In final round or explicit positive verdict in this round:
            if any(w in res_str for w in ["select", "selet", "placed", "hired", "offer", "cleared", "passed", "pass", "qualif"]):
                return True

            return False

        cleared = [s for s in appeared if did_clear_round(s)]
        rejected = [s for s in appeared if (s.get("round") or 1) == r_num and any(w in (s.get("result") or "").lower() for w in ["reject", "fail", "not select", "not-select", "unselect", "eliminated"])]
        in_progress = [s for s in appeared if s not in cleared and s not in rejected]
        pass_rate = round((len(cleared) / len(appeared) * 100), 1) if appeared else 0.0

        processed_rounds.append({
            **r,
            "appeared_count": len(appeared),
            "cleared_count": len(cleared),
            "rejected_count": len(rejected),
            "in_progress_count": len(in_progress),
            "pass_rate": pass_rate,
            "students": appeared,
            "cleared_students": cleared
        })

    def is_final_selected(s):
        current_r = s.get("round") or 1
        res_str = (s.get("result") or "").lower().strip()

        if any(w in res_str for w in ["reject", "fail", "not select", "not-select", "unselect", "eliminated"]):
            return False

        if any(w in res_str for w in ["applied", "registered", "in progress", "evaluating", "pending"]):
            return False

        # If they are shortlisted for a round, they are still attending and not final selected
        import re
        m_short = re.search(r'round\s*(\d+)', res_str)
        if m_short and ("shortlist" in res_str or "for round" in res_str):
            target_r = int(m_short.group(1))
            if target_r <= total_rounds:
                return False

        if any(w in res_str for w in ["offer", "offered", "placed", "hired"]):
            return True

        if current_r >= total_rounds and any(w in res_str for w in ["select", "selet", "pass", "cleared", "qualif"]):
            return True

        return False

    selected_students = [s for s in results if is_final_selected(s)]
    total_candidates = len(results)
    rejected_count = sum(1 for s in results if any(w in (s.get("result") or "").lower() for w in ["reject", "fail"]))
    in_progress_count = total_candidates - len(selected_students) - rejected_count
    selection_rate = round((len(selected_students) / total_candidates * 100), 1) if total_candidates else 0.0

    return {
        "drive": drive,
        "rounds": processed_rounds,
        "selected_students": selected_students,
        "summary": {
            "total_candidates": total_candidates,
            "total_rounds": total_rounds,
            "selected_count": len(selected_students),
            "rejected_count": max(0, rejected_count),
            "in_progress_count": max(0, in_progress_count),
            "selection_rate": selection_rate
        }
    }

def get_round_cleared_students(drive_id: str, round_num: int):
    """Retrieve list of candidates who cleared or were selected in a specific round."""
    process = get_drive_process_details(drive_id)
    if not process:
        return []
    for r in process["rounds"]:
        if r["round_number"] == round_num:
            return r["cleared_students"]
    return []

def get_candidates_for_round_template(drive_id: str, round_num: int):
    """
    Retrieve list of candidates who must appear in the evaluation template for round_num:
    - If round_num <= 1:
      All candidates who appeared in Round 1 or enrolled in the drive.
    - If round_num > 1:
      CRITICAL: All candidates who CLEARED / WERE SELECTED / SHORTLISTED in round_num - 1,
      plus any candidate who is currently at round >= round_num and has not been rejected.
    """
    process = get_drive_process_details(drive_id)
    if not process:
        return []

    rounds = process.get("rounds", [])
    total_rounds = len(rounds)
    all_results = get_drive_results(drive_id)

    candidates = []
    seen_emails = set()

    if round_num <= 1:
        # Round 1: All candidates in the drive
        r1 = next((r for r in rounds if r["round_number"] == 1), None)
        raw_list = (r1.get("students", []) if r1 else []) or all_results
        for s in raw_list:
            em = (s.get("gmail") or s.get("email") or "").strip().lower()
            if em and em not in seen_emails:
                seen_emails.add(em)
                candidates.append(s)
    else:
        # Round N: Candidates who cleared Round N - 1
        prev_round_num = round_num - 1
        prev_round = next((r for r in rounds if r["round_number"] == prev_round_num), None)
        cleared_from_prev = prev_round.get("cleared_students", []) if prev_round else []

        # Also include any student who has advanced to round >= round_num without rejection
        active_in_target = []
        target_round = next((r for r in rounds if r["round_number"] == round_num), None)
        if target_round:
            active_in_target = [
                s for s in target_round.get("students", [])
                if not any(w in (s.get("result") or "").lower() for w in ["reject", "fail"])
            ]

        # Also check all_results for students whose current round is >= round_num or who were shortlisted for this round
        additional_adv = []
        for s in all_results:
            cur_r = s.get("round") or 1
            res_str = (s.get("result") or "").lower()
            is_rejected = any(w in res_str for w in ["reject", "fail", "not select", "not-select", "unselect", "eliminated"])
            if cur_r >= round_num and not is_rejected:
                additional_adv.append(s)
            elif cur_r == prev_round_num and not is_rejected and any(w in res_str for w in ["shortlist", "select", "selet", "clear", "pass", "qualif", "offer", "placed", "hired"]):
                additional_adv.append(s)

        combined = cleared_from_prev + active_in_target + additional_adv
        for s in combined:
            em = (s.get("gmail") or s.get("email") or "").strip().lower()
            if em and em not in seen_emails:
                seen_emails.add(em)
                candidates.append(s)

    # Candidates appear in the round template with Column E empty (not selected), ready for evaluation
    formatted_list = []
    for c in candidates:
        cur_res = (c.get("result") or "").strip()
        if c.get("round") == round_num and any(w in cur_res.lower() for w in ["reject", "fail"]):
            suggested_verdict = "Rejected"
        else:
            suggested_verdict = ""

        s_name = c.get("student_name") or c.get("name") or ""
        if not s_name and (c.get("gmail") or c.get("email")):
            em = (c.get("gmail") or c.get("email")).strip()
            s_name = em.split("@")[0].replace(".", " ").replace("_", " ").title()

        formatted_list.append({
            "gmail": c.get("gmail") or c.get("email", ""),
            "student_name": s_name,
            "department": c.get("department") or "CSE",
            "current_round": round_num,
            "next_verdict": suggested_verdict,
            "score": c.get("score") if (c.get("round") == round_num and c.get("score") is not None) else "",
            "feedback": c.get("feedback") if (c.get("round") == round_num) else "",
            "weakness_area": c.get("weakness_area") if (c.get("round") == round_num) else ""
        })

    return formatted_list


def get_student_drive_results(gmail: str):
    """Fetch drive results for a specific student across all drives."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT s.id, s.drive_id, s.gmail, s.result, s.round, s.score, s.max_score,
               s.feedback, s.weakness_area, s.rejection_reason, s.attempt_date,
               s.updated_at, d.company_name, d.job_role, d.ctc_lpa, d.location
        FROM student_drive_results s
        JOIN drives d ON s.drive_id = d.id
        WHERE LOWER(s.gmail) = LOWER(?)
        ORDER BY s.updated_at DESC
    """, (gmail.strip(),))
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results

def get_students_for_scope(user_id: str, role: str, department: str = None):
    """Return student accounts visible to a requester under the role hierarchy."""
    conn = get_db_connection()
    cursor = conn.cursor()
    normalized_role = (role or "").strip().lower()

    # 1. Fetch all student roster profiles
    cursor.execute("""
        SELECT student_id, register_number, name, email, department, year, cgpa
        FROM students_roster
    """)
    roster_rows = cursor.fetchall()

    # 2. Fetch all student accounts from authenticate
    cursor.execute("""
        SELECT uuid, gmail, role, department
        FROM authenticate
        WHERE LOWER(role) = 'student'
    """)
    auth_rows = cursor.fetchall()

    # Merge map by lowercased email
    students_map = {}
    for r in roster_rows:
        g = (r["email"] or "").strip().lower()
        if not g:
            continue
        students_map[g] = {
            "uuid": r["student_id"],
            "student_id": r["student_id"],
            "gmail": r["email"],
            "role": "student",
            "department": r["department"] or "CSE",
            "name": r["name"] or "",
            "register_number": r["register_number"] or "",
            "year": r["year"] or "4th Year",
            "cgpa": r["cgpa"] or 0.0,
        }

    for a in auth_rows:
        g = (a["gmail"] or "").strip().lower()
        if not g:
            continue
        if g in students_map:
            students_map[g]["auth_uuid"] = a["uuid"]
        else:
            students_map[g] = {
                "uuid": a["uuid"],
                "student_id": a["uuid"],
                "auth_uuid": a["uuid"],
                "gmail": a["gmail"],
                "role": "student",
                "department": a["department"] or "CSE",
                "name": a["gmail"].split("@")[0].replace(".", " ").title(),
                "register_number": "",
                "year": "4th Year",
                "cgpa": 0.0,
            }

    all_students = list(students_map.values())

    if normalized_role in {"coordinator", "admin"}:
        filtered = all_students
    elif normalized_role in {"department", "dept"}:
        target_dept = (department or "CSE").strip().upper()
        filtered = [s for s in all_students if (s.get("department") or "CSE").strip().upper() == target_dept]
    elif normalized_role == "mentor":
        cursor.execute("SELECT student_id FROM mentor_students WHERE mentor_id = ?", (user_id,))
        assigned_ids = {row["student_id"] for row in cursor.fetchall()}
        filtered = [
            s for s in all_students
            if s["uuid"] in assigned_ids or s.get("auth_uuid") in assigned_ids or s.get("student_id") in assigned_ids
        ]
    elif normalized_role == "student":
        filtered = [
            s for s in all_students
            if s["uuid"] == user_id or s.get("auth_uuid") == user_id or s.get("student_id") == user_id
        ]
    else:
        filtered = []

    conn.close()
    filtered.sort(key=lambda s: s["gmail"].lower())
    return filtered

def get_student_analysis_records(gmail: str):
    """Return normalized result records used by failure analysis and the agent."""
    return get_student_drive_results(gmail)

def get_interventions(student_gmail: str = None, student_gmails: list = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    if student_gmail:
        cursor.execute("""
            SELECT i.*, u.department
            FROM interventions i
            LEFT JOIN authenticate u ON LOWER(u.gmail) = LOWER(i.student_gmail)
            WHERE LOWER(i.student_gmail) = LOWER(?)
            ORDER BY i.updated_at DESC, i.created_at DESC, i.rowid DESC
            LIMIT 3
        """, (student_gmail,))
    elif student_gmails is not None:
        if not student_gmails:
            conn.close()
            return []
        placeholders = ",".join("?" for _ in student_gmails)
        cursor.execute(f"""
            SELECT i.*, u.department
            FROM interventions i
            LEFT JOIN authenticate u ON LOWER(u.gmail) = LOWER(i.student_gmail)
            WHERE LOWER(i.student_gmail) IN ({placeholders})
            ORDER BY i.updated_at DESC
        """, [gmail.lower() for gmail in student_gmails])
    else:
        cursor.execute("""
            SELECT i.*, u.department
            FROM interventions i
            LEFT JOIN authenticate u ON LOWER(u.gmail) = LOWER(i.student_gmail)
            ORDER BY i.updated_at DESC
        """)

    interventions = []
    for row in cursor.fetchall():
        intervention = dict(row)
        cursor.execute("""
            SELECT id, intervention_id, title, weakness_area, resources,
                   assigned_to, completed, notes, due_date, created_at, updated_at
            FROM intervention_actions
            WHERE intervention_id = ?
            ORDER BY created_at
        """, (intervention["id"],))
        intervention["actions"] = [dict(action) for action in cursor.fetchall()]
        for action in intervention["actions"]:
            action["completed"] = bool(action["completed"])
        interventions.append(intervention)
    conn.close()
    return interventions

def save_intervention(intervention: dict, actions: list):
    conn = get_db_connection()
    cursor = conn.cursor()
    intervention_id = intervention.get("id") or str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO interventions
            (id, student_id, student_gmail, title, failure_summary, ai_analysis,
             priority, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        intervention_id, intervention["student_id"], intervention["student_gmail"].lower(),
        intervention["title"], intervention["failure_summary"], intervention["ai_analysis"],
        intervention.get("priority", "MEDIUM"), intervention.get("status", "OPEN"),
        intervention["created_by"]
    ))
    for action in actions:
        cursor.execute("""
            INSERT INTO intervention_actions
                (id, intervention_id, title, weakness_area, resources, assigned_to,
                 completed, notes, due_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            str(uuid.uuid4()), intervention_id, action["title"], action.get("weakness_area"),
            action.get("resources"), action.get("assigned_to"),
            1 if action.get("completed") else 0, action.get("notes"), action.get("due_date")
        ))
    cursor.execute("""
        SELECT id FROM interventions
        WHERE LOWER(student_gmail) = LOWER(?)
        ORDER BY updated_at DESC, created_at DESC, rowid DESC
        LIMIT -1 OFFSET 3
    """, (intervention["student_gmail"],))
    old_ids = [row["id"] for row in cursor.fetchall()]
    for old_id in old_ids:
        cursor.execute("DELETE FROM intervention_actions WHERE intervention_id = ?", (old_id,))
        cursor.execute("DELETE FROM interventions WHERE id = ?", (old_id,))
    conn.commit()
    conn.close()
    return get_interventions(student_gmail=intervention["student_gmail"])[0]

def update_intervention_status(intervention_id: str, new_status: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE interventions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    """, (new_status, intervention_id))
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated

def update_intervention_action(action_id: str, completed: bool = None, notes: str = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    updates = []
    params = []
    if completed is not None:
        updates.append("completed = ?")
        params.append(1 if completed else 0)
    if notes is not None:
        updates.append("notes = ?")
        params.append(notes)
    if not updates:
        conn.close()
        return False
    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(action_id)
    cursor.execute(f"UPDATE intervention_actions SET {', '.join(updates)} WHERE id = ?", params)
    changed = cursor.rowcount > 0
    if changed:
        cursor.execute("""
            UPDATE interventions SET updated_at = CURRENT_TIMESTAMP
            WHERE id = (SELECT intervention_id FROM intervention_actions WHERE id = ?)
        """, (action_id,))
    conn.commit()
    conn.close()
    return changed

def add_intervention_action(
    intervention_id: str,
    title: str,
    weakness_area: str = None,
    resources: str = None,
    assigned_to: str = None,
    due_date: str = None
):
    conn = get_db_connection()
    cursor = conn.cursor()
    action_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO intervention_actions
            (id, intervention_id, title, weakness_area, resources, assigned_to, completed, notes, due_date)
        VALUES (?, ?, ?, ?, ?, ?, 0, '', ?)
    """, (action_id, intervention_id, title.strip(), weakness_area, resources, assigned_to, due_date))
    cursor.execute("UPDATE interventions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (intervention_id,))
    conn.commit()
    cursor.execute("SELECT * FROM intervention_actions WHERE id = ?", (action_id,))
    row = dict(cursor.fetchone())
    row["completed"] = bool(row["completed"])
    conn.close()
    return row

def create_custom_intervention(
    student_id: str,
    student_gmail: str,
    title: str,
    failure_summary: str = "",
    ai_analysis: str = "",
    priority: str = "MEDIUM",
    created_by: str = "coordinator@gmail.com",
    actions: list = None
):
    conn = get_db_connection()
    cursor = conn.cursor()
    intervention_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO interventions
            (id, student_id, student_gmail, title, failure_summary, ai_analysis, priority, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)
    """, (
        intervention_id, student_id, student_gmail.strip().lower(),
        title.strip(), failure_summary.strip(), ai_analysis.strip(),
        (priority or "MEDIUM").strip().upper(), created_by
    ))
    if actions:
        for act in actions:
            cursor.execute("""
                INSERT INTO intervention_actions
                    (id, intervention_id, title, weakness_area, resources, assigned_to, completed, notes, due_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                str(uuid.uuid4()), intervention_id, act.get("title", "").strip(),
                act.get("weakness_area"), act.get("resources"), act.get("assigned_to"),
                1 if act.get("completed") else 0, act.get("notes", ""), act.get("due_date")
            ))
    conn.commit()
    conn.close()
    return get_interventions(student_gmail=student_gmail.strip().lower())[0]

def delete_intervention(intervention_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM intervention_actions WHERE intervention_id = ?", (intervention_id,))
    cursor.execute("DELETE FROM interventions WHERE id = ?", (intervention_id,))
    conn.commit()
    conn.close()
    return True

def get_student_profile_by_email(email: str):
    """Fetch complete student academic & coding profile by email from students_roster table."""
    conn = get_db_connection()
    cursor = conn.cursor()
    email_clean = email.strip().lower()

    cursor.execute("SELECT * FROM students_roster WHERE LOWER(email) = ?", (email_clean,))
    row = cursor.fetchone()
    conn.close()

    if row:
        res = dict(row)
        if isinstance(res.get("skills"), str) and res.get("skills"):
            res["skills_list"] = [s.strip() for s in res["skills"].split(",") if s.strip()]
        else:
            res["skills_list"] = []

        # Calculate monthly_total_solved across all 5 platforms
        lc_m = int(res.get("leetcode_solved_month") or 0)
        cf_m = int(res.get("codeforces_solved_month") or 0)
        cc_m = int(res.get("codechef_solved_month") or 0)
        hr_m = int(res.get("hackerrank_solved_month") or 0)
        at_m = int(res.get("atcoder_solved_month") or 0)
        m_sum = lc_m + cf_m + cc_m + hr_m + at_m
        res["monthly_total_solved"] = m_sum

        # Add structured coding_profiles object
        res["coding_profiles"] = {
            "monthly_total_solved": m_sum,
            "leetcode": {
                "handle": res.get("leetcode_handle") or "",
                "solved_month": lc_m,
                "total_solved": int(res.get("leetcode_total_solved") or 0)
            },
            "codeforces": {
                "handle": res.get("codeforces_handle") or "",
                "solved_month": cf_m,
                "rating": int(res.get("codeforces_rating") or 0)
            },
            "codechef": {
                "handle": res.get("codechef_handle") or "",
                "solved_month": cc_m,
                "stars": res.get("codechef_stars") or ""
            },
            "hackerrank": {
                "handle": res.get("hackerrank_handle") or "",
                "solved_month": hr_m,
                "score": int(res.get("hackerrank_score") or 0)
            },
            "atcoder": {
                "handle": res.get("atcoder_handle") or "",
                "solved_month": at_m,
                "rating": int(res.get("atcoder_rating") or 0)
            }
        }
        return res
    return None

def update_student_profile(email: str, data: dict, is_student: bool = True):
    """
    Update or insert a student's personal details, resume metadata, and coding platform profiles.
    Calculates monthly_total_solved across LeetCode, Codeforces, CodeChef, HackerRank, and AtCoder.
    When is_student=True, academic/institutional fields (cgpa, tenth_percentage, twelfth_percentage,
    department, register_number, email) cannot be altered or forged by students and are preserved.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    email_clean = email.strip().lower()

    cursor.execute("SELECT * FROM students_roster WHERE LOWER(email) = ?", (email_clean,))
    existing = cursor.fetchone()

    if existing:
        current = dict(existing)
        merged = dict(current)
        for k, v in data.items():
            if v is not None:
                # If update is made by student, lock official academic metrics & institutional IDs
                if is_student and k in {
                    "cgpa", "tenth_percentage", "twelfth_percentage",
                    "department", "register_number", "email", "gmail"
                }:
                    continue
                merged[k] = v

        # Calculate monthly total sum
        lc_m = int(merged.get("leetcode_solved_month") or 0)
        cf_m = int(merged.get("codeforces_solved_month") or 0)
        cc_m = int(merged.get("codechef_solved_month") or 0)
        hr_m = int(merged.get("hackerrank_solved_month") or 0)
        at_m = int(merged.get("atcoder_solved_month") or 0)
        monthly_sum = lc_m + cf_m + cc_m + hr_m + at_m
        merged["monthly_total_solved"] = monthly_sum

        cursor.execute("""
            UPDATE students_roster SET
                name = ?, phone = ?, department = ?, year = ?, cgpa = ?,
                tenth_percentage = ?, twelfth_percentage = ?, skills = ?,
                linkedin_url = ?, github_url = ?, portfolio_url = ?,
                resume_filename = ?, resume_url = ?,
                leetcode_handle = ?, leetcode_solved_month = ?, leetcode_total_solved = ?,
                codeforces_handle = ?, codeforces_solved_month = ?, codeforces_rating = ?,
                codechef_handle = ?, codechef_solved_month = ?, codechef_stars = ?,
                hackerrank_handle = ?, hackerrank_solved_month = ?, hackerrank_score = ?,
                atcoder_handle = ?, atcoder_solved_month = ?, atcoder_rating = ?,
                monthly_total_solved = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE LOWER(email) = ?
        """, (
            merged.get("name"), merged.get("phone"), merged.get("department"), merged.get("year"), merged.get("cgpa"),
            merged.get("tenth_percentage"), merged.get("twelfth_percentage"), merged.get("skills"),
            merged.get("linkedin_url"), merged.get("github_url"), merged.get("portfolio_url"),
            merged.get("resume_filename"), merged.get("resume_url"),
            merged.get("leetcode_handle"), lc_m, int(merged.get("leetcode_total_solved") or 0),
            merged.get("codeforces_handle"), cf_m, int(merged.get("codeforces_rating") or 0),
            merged.get("codechef_handle"), cc_m, merged.get("codechef_stars") or "",
            merged.get("hackerrank_handle"), hr_m, int(merged.get("hackerrank_score") or 0),
            merged.get("atcoder_handle"), at_m, int(merged.get("atcoder_rating") or 0),
            monthly_sum,
            email_clean
        ))
    else:
        # Insert new
        lc_m = int(data.get("leetcode_solved_month") or 0)
        cf_m = int(data.get("codeforces_solved_month") or 0)
        cc_m = int(data.get("codechef_solved_month") or 0)
        hr_m = int(data.get("hackerrank_solved_month") or 0)
        at_m = int(data.get("atcoder_solved_month") or 0)
        monthly_sum = lc_m + cf_m + cc_m + hr_m + at_m

        student_id = str(uuid.uuid4())
        reg_no = data.get("register_number") or f"REG{uuid.uuid4().hex[:6].upper()}"
        name = data.get("name") or email_clean.split("@")[0].replace(".", " ").title()
        dept = data.get("department") or "CSE"
        cgpa = data.get("cgpa") if (not is_student and data.get("cgpa") is not None) else None
        tenth = data.get("tenth_percentage") if not is_student else None
        twelfth = data.get("twelfth_percentage") if not is_student else None

        cursor.execute("""
            INSERT INTO students_roster (
                student_id, register_number, name, email, department, year, cgpa,
                tenth_percentage, twelfth_percentage, skills, phone,
                linkedin_url, github_url, portfolio_url, resume_filename, resume_url,
                leetcode_handle, leetcode_solved_month, leetcode_total_solved,
                codeforces_handle, codeforces_solved_month, codeforces_rating,
                codechef_handle, codechef_solved_month, codechef_stars,
                hackerrank_handle, hackerrank_solved_month, hackerrank_score,
                atcoder_handle, atcoder_solved_month, atcoder_rating,
                monthly_total_solved, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            student_id, reg_no, name, email_clean, dept, data.get("year", "4th Year"), cgpa,
            tenth, twelfth, data.get("skills", ""),
            data.get("phone"), data.get("linkedin_url"), data.get("github_url"), data.get("portfolio_url"),
            data.get("resume_filename"), data.get("resume_url"),
            data.get("leetcode_handle"), lc_m, int(data.get("leetcode_total_solved") or 0),
            data.get("codeforces_handle"), cf_m, int(data.get("codeforces_rating") or 0),
            data.get("codechef_handle"), cc_m, data.get("codechef_stars") or "",
            data.get("hackerrank_handle"), hr_m, int(data.get("hackerrank_score") or 0),
            data.get("atcoder_handle"), at_m, int(data.get("atcoder_rating") or 0),
            monthly_sum
        ))

    conn.commit()
    conn.close()
    return get_student_profile_by_email(email_clean)

def get_drive_results_count(drive_id: str) -> int:
    """Count candidate results for a specific drive."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as count FROM student_drive_results WHERE drive_id = ?", (drive_id,))
    row = cursor.fetchone()
    conn.close()
    return row["count"] if row else 0

def bulk_grant_user_access(users_list: list):
    """
    Bulk create or update user access in 'authenticate' table.
    users_list is a list of dicts: [{"gmail": "...", "role": "..."}, ...]
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    created_count = 0
    updated_count = 0
    processed_users = []

    for item in users_list:
        gmail = item.get("gmail", "").strip().lower()
        role = item.get("role", "Student").strip()
        custom_password = item.get("password", "").strip() if item.get("password") else None

        # Normalize role casing
        if role.lower() == "student":
            role = "Student"
        elif role.lower() == "mentor":
            role = "Mentor"
        elif role.lower() in ["department", "dept"]:
            role = "Department"
        elif role.lower() == "recruiter":
            role = "Recruiter"
        elif role.lower() in ["coordinator", "admin"]:
            role = "Coordinator"

        if not gmail or "@" not in gmail:
            continue

        # Check existing user
        cursor.execute("SELECT uuid, role, password FROM authenticate WHERE LOWER(gmail) = ?", (gmail,))
        existing = cursor.fetchone()

        if existing:
            if custom_password:
                cursor.execute("UPDATE authenticate SET role = ?, password = ? WHERE LOWER(gmail) = ?", (role, custom_password, gmail))
                action_str = "Updated Role & Password"
            else:
                cursor.execute("UPDATE authenticate SET role = ? WHERE LOWER(gmail) = ?", (role, gmail))
                action_str = "Updated Role"

            updated_count += 1
            processed_users.append({
                "uuid": existing["uuid"],
                "gmail": gmail,
                "role": role,
                "password": custom_password if custom_password else existing["password"],
                "action": action_str
            })
        else:
            if custom_password:
                final_pwd = custom_password
            elif role == "Student":
                final_pwd = "student123"
            elif role == "Mentor":
                final_pwd = "mentor123"
            elif role == "Department":
                final_pwd = "dept123"
            elif role == "Recruiter":
                final_pwd = "recruiter123"
            elif role == "Coordinator":
                final_pwd = "coord123"
            else:
                final_pwd = "user123"

            new_uuid = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO authenticate (uuid, gmail, password, role)
                VALUES (?, ?, ?, ?)
            """, (new_uuid, gmail, final_pwd, role))
            created_count += 1
            processed_users.append({
                "uuid": new_uuid,
                "gmail": gmail,
                "role": role,
                "password": final_pwd,
                "action": "Created Account"
            })


    conn.commit()
    conn.close()

    return {
        "created_count": created_count,
        "updated_count": updated_count,
        "total_processed": len(processed_users),
        "processed_users": processed_users
    }

def grant_single_user_access(gmail: str, role: str = "Student", password: str = None):
    """Grant or update access for a single user in 'authenticate' table."""
    conn = get_db_connection()
    cursor = conn.cursor()

    gmail_clean = gmail.strip().lower()
    
    # Normalize role casing
    if role.lower() == "student":
        role = "Student"
    elif role.lower() == "mentor":
        role = "Mentor"
    elif role.lower() in ["department", "dept"]:
        role = "Department"
    elif role.lower() == "recruiter":
        role = "Recruiter"
    elif role.lower() in ["coordinator", "admin"]:
        role = "Coordinator"

    cursor.execute("SELECT uuid, role, password FROM authenticate WHERE LOWER(gmail) = ?", (gmail_clean,))
    existing = cursor.fetchone()

    if existing:
        final_pwd = password.strip() if (password and password.strip()) else existing["password"]
        if password and password.strip():
            cursor.execute("UPDATE authenticate SET role = ?, password = ? WHERE LOWER(gmail) = ?", (role, final_pwd, gmail_clean))
        else:
            cursor.execute("UPDATE authenticate SET role = ? WHERE LOWER(gmail) = ?", (role, gmail_clean))
        conn.commit()
        conn.close()

        return {
            "uuid": existing["uuid"],
            "gmail": gmail_clean,
            "role": role,
            "password": final_pwd,
            "action": "Updated Role & Password" if (password and password.strip()) else "Updated Role"
        }
    else:
        final_pwd = password.strip() if (password and password.strip()) else ("student123" if role == "Student" else "mentor123" if role == "Mentor" else "dept123" if role == "Department" else "user123")
        new_uuid = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO authenticate (uuid, gmail, password, role)
            VALUES (?, ?, ?, ?)
        """, (new_uuid, gmail_clean, final_pwd, role))
        conn.commit()
        conn.close()

        return {
            "uuid": new_uuid,
            "gmail": gmail_clean,
            "role": role,
            "password": final_pwd,
            "action": "Created Account"
        }




def get_mentor_notes(mentor_id: str, student_id: str):
    """Retrieve all notes written by a mentor for a specific student."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT note_id, mentor_id, student_id, content, created_at, updated_at
        FROM mentor_notes
        WHERE student_id = ?
        ORDER BY created_at DESC
    """, (student_id,))
    notes = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return notes

def create_mentor_note(mentor_id: str, student_id: str, content: str):
    """Create a new note for a student."""
    conn = get_db_connection()
    cursor = conn.cursor()
    note_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO mentor_notes (note_id, mentor_id, student_id, content)
        VALUES (?, ?, ?, ?)
    """, (note_id, mentor_id, student_id, content.strip()))
    conn.commit()
    cursor.execute("SELECT note_id, mentor_id, student_id, content, created_at, updated_at FROM mentor_notes WHERE note_id = ?", (note_id,))
    note = dict(cursor.fetchone())
    conn.close()
    return note

def update_mentor_note(note_id: str, content: str):
    """Update an existing note."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE mentor_notes
        SET content = ?, updated_at = CURRENT_TIMESTAMP
        WHERE note_id = ?
    """, (content.strip(), note_id))
    conn.commit()
    cursor.execute("SELECT note_id, mentor_id, student_id, content, created_at, updated_at FROM mentor_notes WHERE note_id = ?", (note_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def delete_mentor_note(note_id: str):
    """Delete a mentor note."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM mentor_notes WHERE note_id = ?", (note_id,))
    conn.commit()
    conn.close()
    return True

def get_mentor_dashboard_data(mentor_gmail: str = "mentor@gmail.com"):
    """
    Dynamically fetch mentor dashboard details directly from SQLite tables:
    'students_roster', 'authenticate', 'drives', 'student_drive_results', 'interventions', and 'mentor_notes'.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # Query students from students_roster first, union with authenticate students if any not in roster
    cursor.execute("""
        SELECT sr.student_id, sr.register_number, sr.name, sr.email, sr.department,
               sr.cgpa, sr.tenth_percentage, sr.twelfth_percentage, sr.skills, sr.year,
               sr.phone, sr.linkedin_url, sr.github_url, sr.portfolio_url,
               sr.resume_filename, sr.resume_url,
               sr.leetcode_handle, sr.leetcode_solved_month, sr.leetcode_total_solved,
               sr.codeforces_handle, sr.codeforces_solved_month, sr.codeforces_rating,
               sr.codechef_handle, sr.codechef_solved_month, sr.codechef_stars,
               sr.hackerrank_handle, sr.hackerrank_solved_month, sr.hackerrank_score,
               sr.atcoder_handle, sr.atcoder_solved_month, sr.atcoder_rating,
               sr.monthly_total_solved
        FROM students_roster sr
        ORDER BY sr.name ASC
    """)
    roster_rows = [dict(r) for r in cursor.fetchall()]

    cursor.execute("""
        SELECT uuid as student_id, gmail as email, department
        FROM authenticate
        WHERE LOWER(role) = 'student'
    """)
    auth_students = [dict(r) for r in cursor.fetchall()]
    known_emails = set((r["email"] or "").lower() for r in roster_rows)

    student_records = list(roster_rows)
    for a in auth_students:
        a_mail = (a["email"] or "").lower()
        if a_mail not in known_emails:
            name_parts = a_mail.split("@")[0].replace(".", " ").replace("_", " ").title()
            student_records.append({
                "student_id": a["student_id"],
                "register_number": "",
                "name": name_parts,
                "email": a["email"],
                "department": a.get("department") or "",
                "cgpa": None,
                "tenth_percentage": None,
                "twelfth_percentage": None,
                "skills": "",
                "year": ""
            })
            known_emails.add(a_mail)

    mentees = []
    placed_mentees = []
    at_risk_count = 0

    for s in student_records:
        gmail = s["email"]
        student_id = s["student_id"]
        name = s["name"]
        dept = s.get("department") or ""

        # Fetch drive results for this student from SQLite
        cursor.execute("""
            SELECT s.id, s.drive_id, s.gmail, s.result, s.round, d.company_name, d.job_role, d.ctc_lpa
            FROM student_drive_results s
            LEFT JOIN drives d ON s.drive_id = d.id
            WHERE LOWER(s.gmail) = LOWER(?)
            ORDER BY s.updated_at DESC
        """, (gmail,))
        results = [dict(r) for r in cursor.fetchall()]

        # Determine placement status from DB results
        status = "Active"
        placed_info = None

        for r in results:
            res_str = (r.get("result") or "").lower()
            if "selected" in res_str or "placed" in res_str or "hired" in res_str:
                status = "Placed"
                placed_info = r
                break
            elif "rejected" in res_str or "failed" in res_str:
                status = "At Risk"

        if status == "At Risk":
            at_risk_count += 1

        lc_m = int(s.get("leetcode_solved_month") or 0)
        cf_m = int(s.get("codeforces_solved_month") or 0)
        cc_m = int(s.get("codechef_solved_month") or 0)
        hr_m = int(s.get("hackerrank_solved_month") or 0)
        at_m = int(s.get("atcoder_solved_month") or 0)
        m_solved = int(s.get("monthly_total_solved") or (lc_m + cf_m + cc_m + hr_m + at_m))

        mentee_obj = {
            "student_id": student_id,
            "name": name,
            "register_number": s.get("register_number") or "",
            "department": dept,
            "cgpa": s.get("cgpa"),
            "tenth": s.get("tenth_percentage"),
            "twelfth": s.get("twelfth_percentage"),
            "placement_marks": None,
            "status": status,
            "email": gmail,
            "skills": s.get("skills") or "",
            "phone": s.get("phone") or "",
            "linkedin_url": s.get("linkedin_url") or "",
            "github_url": s.get("github_url") or "",
            "portfolio_url": s.get("portfolio_url") or "",
            "resume_filename": s.get("resume_filename") or "",
            "resume_url": s.get("resume_url") or "",
            "monthly_total_solved": m_solved,
            "leetcode_handle": s.get("leetcode_handle") or "",
            "leetcode_solved_month": lc_m,
            "leetcode_total_solved": int(s.get("leetcode_total_solved") or 0),
            "codeforces_handle": s.get("codeforces_handle") or "",
            "codeforces_solved_month": cf_m,
            "codeforces_rating": int(s.get("codeforces_rating") or 0),
            "codechef_handle": s.get("codechef_handle") or "",
            "codechef_solved_month": cc_m,
            "codechef_stars": s.get("codechef_stars") or "",
            "hackerrank_handle": s.get("hackerrank_handle") or "",
            "hackerrank_solved_month": hr_m,
            "hackerrank_score": int(s.get("hackerrank_score") or 0),
            "atcoder_handle": s.get("atcoder_handle") or "",
            "atcoder_solved_month": at_m,
            "atcoder_rating": int(s.get("atcoder_rating") or 0),
            "coding_profiles": {
                "monthly_total_solved": m_solved,
                "leetcode": {"handle": s.get("leetcode_handle") or "", "solved_month": lc_m, "total_solved": int(s.get("leetcode_total_solved") or 0)},
                "codeforces": {"handle": s.get("codeforces_handle") or "", "solved_month": cf_m, "rating": int(s.get("codeforces_rating") or 0)},
                "codechef": {"handle": s.get("codechef_handle") or "", "solved_month": cc_m, "stars": s.get("codechef_stars") or ""},
                "hackerrank": {"handle": s.get("hackerrank_handle") or "", "solved_month": hr_m, "score": int(s.get("hackerrank_score") or 0)},
                "atcoder": {"handle": s.get("atcoder_handle") or "", "solved_month": at_m, "rating": int(s.get("atcoder_rating") or 0)}
            }
        }

        if status == "Placed" and placed_info:
            mentee_obj["company"] = placed_info.get("company_name") or ""
            mentee_obj["job_role"] = placed_info.get("job_role") or ""
            mentee_obj["ctc"] = placed_info.get("ctc_lpa") or 0.0
            placed_mentees.append(mentee_obj)

        mentees.append(mentee_obj)

    # 2. Query actual active interventions from database
    cursor.execute("""
        SELECT i.id, i.student_id, i.student_gmail, i.title, i.failure_summary, i.ai_analysis, i.priority, i.status, i.created_at,
               COALESCE(sr.name, i.student_gmail) as student_name,
               COALESCE(sr.register_number, '') as register_number
        FROM interventions i
        LEFT JOIN students_roster sr ON LOWER(i.student_gmail) = LOWER(sr.email)
        ORDER BY i.created_at DESC
    """)
    interventions_rows = [dict(r) for r in cursor.fetchall()]

    total_mentees = len(mentees)
    placed_count = len(placed_mentees)
    placement_rate = round((placed_count / total_mentees * 100), 1) if total_mentees > 0 else 0.0

    metrics = {
        "total_mentees": total_mentees,
        "placed_count": placed_count,
        "placement_rate": placement_rate,
        "active_interventions": len(interventions_rows),
        "at_risk_count": at_risk_count
    }

    conn.close()

    return {
        "mentees": mentees,
        "placed_mentees": placed_mentees,
        "interventions": interventions_rows,
        "metrics": metrics
    }


def get_department_dashboard_data(dept_code="CSE"):
    """Retrieve full department overview: students, mentors, placed stats, interventions, and metrics directly from database."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Real mentors from authenticate table
    cursor.execute("""
        SELECT uuid as id, gmail as email, department 
        FROM authenticate 
        WHERE LOWER(role) = 'mentor'
    """)
    mentor_rows = cursor.fetchall()
    mentors = []
    for m in mentor_rows:
        m_email = m["email"]
        m_name = m_email.split("@")[0].replace(".", " ").title()
        cursor.execute("SELECT COUNT(*) as count FROM mentor_students WHERE mentor_id = ?", (m["id"],))
        mentee_count = cursor.fetchone()["count"]
        mentors.append({
            "id": m["id"],
            "name": m_name,
            "email": m_email,
            "department": m["department"] or dept_code,
            "specialization": "Faculty Mentor",
            "assigned_mentees": mentee_count,
            "placed_mentees": 0,
            "active_interventions": 0
        })

    # 2. Query students for this department from students_roster
    cursor.execute("""
        SELECT student_id, register_number, name, email, department, cgpa, tenth_percentage, twelfth_percentage, skills, year,
               phone, linkedin_url, github_url, portfolio_url, resume_filename, resume_url,
               leetcode_handle, leetcode_solved_month, leetcode_total_solved,
               codeforces_handle, codeforces_solved_month, codeforces_rating,
               codechef_handle, codechef_solved_month, codechef_stars,
               hackerrank_handle, hackerrank_solved_month, hackerrank_score,
               atcoder_handle, atcoder_solved_month, atcoder_rating,
               monthly_total_solved
        FROM students_roster
        WHERE UPPER(department) = UPPER(?) OR ? = 'ALL'
        ORDER BY name ASC
    """, (dept_code, dept_code))
    student_rows = [dict(r) for r in cursor.fetchall()]

    if not student_rows:
        cursor.execute("""
            SELECT uuid as student_id, '' as register_number, gmail as email, department,
                   NULL as cgpa, NULL as tenth_percentage, NULL as twelfth_percentage, '' as skills, '' as year,
                   '' as phone, '' as linkedin_url, '' as github_url, '' as portfolio_url,
                   '' as resume_filename, '' as resume_url,
                   '' as leetcode_handle, 0 as leetcode_solved_month, 0 as leetcode_total_solved,
                   '' as codeforces_handle, 0 as codeforces_solved_month, 0 as codeforces_rating,
                   '' as codechef_handle, 0 as codechef_solved_month, '' as codechef_stars,
                   '' as hackerrank_handle, 0 as hackerrank_solved_month, 0 as hackerrank_score,
                   '' as atcoder_handle, 0 as atcoder_solved_month, 0 as atcoder_rating,
                   0 as monthly_total_solved
            FROM authenticate
            WHERE LOWER(role) = 'student' AND (UPPER(department) = UPPER(?) OR ? = 'ALL')
        """, (dept_code, dept_code))
        for r in cursor.fetchall():
            row_d = dict(r)
            row_d["name"] = (row_d["email"] or "").split("@")[0].replace(".", " ").title()
            student_rows.append(row_d)

    students = []
    placed_students = []
    at_risk_count = 0
    total_ctc_sum = 0
    highest_ctc = 0.0

    for s in student_rows:
        gmail = s["email"]
        student_id = s["student_id"]
        name = s["name"]

        # Query drive results for this student
        cursor.execute("""
            SELECT s.id, s.drive_id, s.gmail, s.result, s.round, d.company_name, d.job_role, d.ctc_lpa
            FROM student_drive_results s
            LEFT JOIN drives d ON s.drive_id = d.id
            WHERE LOWER(s.gmail) = LOWER(?)
            ORDER BY s.updated_at DESC
        """, (gmail,))
        results = [dict(r) for r in cursor.fetchall()]

        status = "Active"
        placed_info = None

        for r in results:
            res_str = (r.get("result") or "").lower()
            if "selected" in res_str or "placed" in res_str or "hired" in res_str:
                status = "Placed"
                placed_info = r
                break
            elif "rejected" in res_str or "failed" in res_str:
                status = "At Risk"

        if status == "At Risk":
            at_risk_count += 1

        lc_m = int(s.get("leetcode_solved_month") or 0)
        cf_m = int(s.get("codeforces_solved_month") or 0)
        cc_m = int(s.get("codechef_solved_month") or 0)
        hr_m = int(s.get("hackerrank_solved_month") or 0)
        at_m = int(s.get("atcoder_solved_month") or 0)
        m_solved = int(s.get("monthly_total_solved") or (lc_m + cf_m + cc_m + hr_m + at_m))

        student_obj = {
            "student_id": student_id,
            "name": name,
            "register_number": s.get("register_number") or "",
            "department": s.get("department") or dept_code,
            "cgpa": s.get("cgpa"),
            "tenth": s.get("tenth_percentage"),
            "twelfth": s.get("twelfth_percentage"),
            "status": status,
            "email": gmail,
            "assigned_mentor": mentors[0]["name"] if mentors else "Department Faculty",
            "skills": s.get("skills") or "",
            "phone": s.get("phone") or "",
            "linkedin_url": s.get("linkedin_url") or "",
            "github_url": s.get("github_url") or "",
            "portfolio_url": s.get("portfolio_url") or "",
            "resume_filename": s.get("resume_filename") or "",
            "resume_url": s.get("resume_url") or "",
            "monthly_total_solved": m_solved,
            "leetcode_handle": s.get("leetcode_handle") or "",
            "leetcode_solved_month": lc_m,
            "leetcode_total_solved": int(s.get("leetcode_total_solved") or 0),
            "codeforces_handle": s.get("codeforces_handle") or "",
            "codeforces_solved_month": cf_m,
            "codeforces_rating": int(s.get("codeforces_rating") or 0),
            "codechef_handle": s.get("codechef_handle") or "",
            "codechef_solved_month": cc_m,
            "codechef_stars": s.get("codechef_stars") or "",
            "hackerrank_handle": s.get("hackerrank_handle") or "",
            "hackerrank_solved_month": hr_m,
            "hackerrank_score": int(s.get("hackerrank_score") or 0),
            "atcoder_handle": s.get("atcoder_handle") or "",
            "atcoder_solved_month": at_m,
            "atcoder_rating": int(s.get("atcoder_rating") or 0),
            "coding_profiles": {
                "monthly_total_solved": m_solved,
                "leetcode": {"handle": s.get("leetcode_handle") or "", "solved_month": lc_m, "total_solved": int(s.get("leetcode_total_solved") or 0)},
                "codeforces": {"handle": s.get("codeforces_handle") or "", "solved_month": cf_m, "rating": int(s.get("codeforces_rating") or 0)},
                "codechef": {"handle": s.get("codechef_handle") or "", "solved_month": cc_m, "stars": s.get("codechef_stars") or ""},
                "hackerrank": {"handle": s.get("hackerrank_handle") or "", "solved_month": hr_m, "score": int(s.get("hackerrank_score") or 0)},
                "atcoder": {"handle": s.get("atcoder_handle") or "", "solved_month": at_m, "rating": int(s.get("atcoder_rating") or 0)}
            }
        }

        if status == "Placed" and placed_info:
            company = placed_info.get("company_name") or ""
            job_role = placed_info.get("job_role") or ""
            ctc = placed_info.get("ctc_lpa") or 0.0
            student_obj["company"] = company
            student_obj["job_role"] = job_role
            student_obj["ctc"] = ctc

            total_ctc_sum += ctc
            if ctc > highest_ctc:
                highest_ctc = ctc

            placed_students.append(student_obj)

        students.append(student_obj)

    # 3. Department Interventions from actual database
    cursor.execute("""
        SELECT i.id, i.student_id, i.student_gmail, i.title, i.priority, i.status, i.created_at,
               COALESCE(sr.name, i.student_gmail) as student_name,
               COALESCE(sr.register_number, '') as register_number,
               COALESCE(sr.department, ?) as department
        FROM interventions i
        LEFT JOIN students_roster sr ON LOWER(i.student_gmail) = LOWER(sr.email)
        WHERE UPPER(COALESCE(sr.department, ?)) = UPPER(?) OR ? = 'ALL'
        ORDER BY i.created_at DESC
    """, (dept_code, dept_code, dept_code, dept_code))
    interventions = [dict(r) for r in cursor.fetchall()]

    total_students = len(students)
    placed_count = len(placed_students)
    placement_rate = round((placed_count / total_students * 100), 1) if total_students > 0 else 0.0
    avg_ctc = round((total_ctc_sum / placed_count), 2) if placed_count > 0 else 0.0

    metrics = {
        "total_students": total_students,
        "placed_count": placed_count,
        "placement_rate": placement_rate,
        "at_risk_count": at_risk_count,
        "total_mentors": len(mentors),
        "avg_ctc": avg_ctc,
        "highest_ctc": highest_ctc
    }

    conn.close()

    return {
        "department": {
            "code": dept_code,
            "name": f"Department of {dept_code}" if dept_code != "CSE" else "Computer Science & Engineering"
        },
        "mentors": mentors,
        "students": students,
        "placed_students": placed_students,
        "interventions": interventions,
        "metrics": metrics
    }


# ==============================================================
# BULK UPLOAD MODULE DATABASE INTEGRATION
# ==============================================================

def get_drive(drive_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, company_name, company_type, job_role, ctc_lpa, min_cgpa, required_cgpa, 
               allowed_branches, location, deadline, description, COALESCE(total_rounds, 4) as total_rounds,
               drive_date, status, current_round, created_at 
        FROM drives WHERE id = ?
    """, (drive_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

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
    conn = get_db_connection()
    cursor = conn.cursor()

    comp_clean = company_name.strip()
    role_clean = job_role.strip()

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
    conn = get_db_connection()
    cursor = conn.cursor()
    email_clean = email.strip().lower()

    cursor.execute("SELECT total_rounds FROM drives WHERE id = ?", (drive_id,))
    d_row = cursor.fetchone()
    total_rounds = d_row["total_rounds"] if (d_row and "total_rounds" in d_row.keys() and d_row["total_rounds"]) else 4

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

def normalize_verdict(raw_verdict: str) -> str:
    """
    Normalizes human-entered verdict / status strings into standard system values.
    Handles 'selecte', 'select', 'selected', 'seleted', 'placed', 'cleared', etc.
    """
    if not raw_verdict:
        return "Selected"
    v = str(raw_verdict).strip()
    v_lower = v.lower()

    if any(k in v_lower for k in [
        "not select", "not-select", "unselect", "reject", "fail", "eliminated", "disqualif", "dropped", "absent"
    ]):
        return "Rejected"

    import re
    m_r = re.search(r'round\s*(\d+)', v_lower)
    if m_r and ("shortlist" in v_lower or "for round" in v_lower):
        return f"Shortlisted for Round {m_r.group(1)}"

    if any(k in v_lower for k in [
        "selecte", "select", "selet", "selct", "placed", "hired", "offer", "cleared", "passed", "pass", "clear", "qualif"
    ]):
        return "Selected"

    if "shortlist" in v_lower:
        return "Shortlisted"

    if any(k in v_lower for k in ["hold", "waiting", "pending"]):
        return "On Hold"

    return v.capitalize()

def process_verdict_record(
    drive_id: str,
    email: str,
    verdict: str,
    round_num: int = None,
    score: float = None,
    max_score: float = None,
    feedback: str = None,
    weakness_area: str = None,
    rejection_reason: str = None,
    attempt_date: str = None
):
    import re
    drive = get_drive(drive_id)
    total_rounds = (drive.get("total_rounds") if drive else 4) or 4

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT round, result FROM student_drive_results WHERE drive_id = ? AND LOWER(gmail) = ?", (drive_id, email.strip().lower()))
    existing = cursor.fetchone()
    conn.close()

    eval_round = round_num
    if eval_round is None:
        eval_round = (existing["round"] if existing and existing["round"] else None) or (drive.get("current_round") if drive else 1) or 1

    v_str = str(verdict or "").strip()
    v_lower = v_str.lower()

    if any(k in v_lower for k in [
        "not select", "not-select", "unselect", "reject", "fail", "eliminated", "disqualif", "dropped", "absent"
    ]):
        norm_verdict = "Rejected"
        target_round = eval_round
    elif re.search(r'round\s*(\d+)', v_lower) and any(w in v_lower for w in ["shortlist", "for round", "to round"]):
        m_r = re.search(r'round\s*(\d+)', v_lower)
        target_r = int(m_r.group(1))
        if target_r <= total_rounds:
            target_round = target_r
            norm_verdict = f"Shortlisted for Round {target_r}"
        else:
            target_round = total_rounds
            norm_verdict = "Offered"
    elif any(k in v_lower for k in [
        "selecte", "select", "selet", "selct", "pass", "cleared", "passed", "clear", "qualif"
    ]):
        if eval_round < total_rounds:
            # Intermediate round: student cleared eval_round and moves to appear in next round
            target_round = eval_round + 1
            norm_verdict = f"Shortlisted for Round {eval_round + 1}"
        else:
            # Final round: student cleared final round and receives Selected/Offer
            target_round = eval_round
            norm_verdict = "Selected"
    elif any(k in v_lower for k in ["offer", "offered", "placed", "hired"]):
        target_round = total_rounds
        norm_verdict = "Offered"
    elif any(k in v_lower for k in ["hold", "waiting", "pending"]):
        target_round = eval_round
        norm_verdict = "On Hold"
    else:
        target_round = eval_round
        norm_verdict = v_str.capitalize() if v_str else "Selected"

    upsert_student_drive_result(
        drive_id=drive_id,
        gmail=email,
        result=norm_verdict,
        round_number=target_round,
        score=score,
        max_score=max_score,
        feedback=feedback,
        weakness_area=weakness_area,
        rejection_reason=rejection_reason,
        attempt_date=attempt_date
    )
    return {"gmail": email.strip().lower(), "result": norm_verdict, "round": target_round, "score": score, "status": "Updated"}

def upsert_user_account(email: str, role: str = "Student", password: str = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    email_clean = email.strip().lower()

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
        default_pwds = {
            "Student": "student123",
            "Mentor": "mentor123",
            "Coordinator": "coord123",
            "Department": "dept123",
            "Recruiter": "recruiter123"
        }
        final_password = password if password else default_pwds.get(normalized_role, f"{normalized_role.lower()}123")
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

def upsert_student_roster_record(register_number: str, name: str, email: str, department: str,
                                 cgpa: float, tenth: float = None, twelfth: float = None, skills: str = "", year: str = "4th Year"):
    conn = get_db_connection()
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
                student_id, register_number, name, email, department, cgpa, tenth_percentage, twelfth_percentage, skills, year, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            student_id, reg_clean, name.strip(), email_clean, department.strip().upper(),
            cgpa, tenth, twelfth, skills.strip(), year
        ))
        action = "Created"

    # Synchronize student auth account in authenticate table
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
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT *, COALESCE(year, '4th Year') AS year
        FROM students_roster
        ORDER BY created_at DESC
    """)
    students = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return students

def record_upload_log(upload_type: str, filename: str, total_rows: int, processed_count: int, skipped_count: int, status: str = "SUCCESS"):
    conn = get_db_connection()
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
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT log_id, upload_type, filename, total_rows, processed_count, skipped_count, status, created_at FROM upload_logs ORDER BY created_at DESC")
    logs = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return logs


# ==============================================================
# COORDINATOR: COMPREHENSIVE 360-DEGREE STUDENT TRACKING
# ==============================================================

def get_coordinator_students_tracking(year: str = None, department: str = None, search: str = None, status: str = None):
    """
    Retrieve comprehensive 360-degree student tracking records for Placement Coordinator:
    - Year-wise & Department-wise breakdown
    - Full interview & recruitment process pipelines for each student
    - Full academic and mentor interventions with action tasks & risk status
    - Summary metrics across the filtered cohort
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Fetch all roster students
    cursor.execute("""
        SELECT student_id, register_number, name, email, department, cgpa,
               tenth_percentage, twelfth_percentage, skills, COALESCE(year, '4th Year') AS year,
               phone, linkedin_url, github_url, portfolio_url, resume_filename, resume_url,
               leetcode_handle, leetcode_solved_month, leetcode_total_solved,
               codeforces_handle, codeforces_solved_month, codeforces_rating,
               codechef_handle, codechef_solved_month, codechef_stars,
               hackerrank_handle, hackerrank_solved_month, hackerrank_score,
               atcoder_handle, atcoder_solved_month, atcoder_rating,
               monthly_total_solved, created_at
        FROM students_roster
        ORDER BY department ASC, register_number ASC
    """)
    students_raw = [dict(r) for r in cursor.fetchall()]

    # 2. Fetch all drives for lookup
    cursor.execute("SELECT id, company_name, job_role, ctc_lpa, total_rounds, status FROM drives")
    drives_map = {d["id"]: dict(d) for d in cursor.fetchall()}

    # 3. Fetch all drive results grouped by lowercase email
    cursor.execute("""
        SELECT id, drive_id, gmail, result, round, score, max_score, feedback, weakness_area, rejection_reason, attempt_date, updated_at
        FROM student_drive_results
        ORDER BY updated_at DESC
    """)
    all_results = [dict(r) for r in cursor.fetchall()]
    results_by_email = {}
    for res in all_results:
        results_by_email.setdefault(res["gmail"].strip().lower(), []).append(res)

    # 4. Fetch all interventions and intervention actions
    cursor.execute("""
        SELECT id, student_id, student_gmail, title, failure_summary, ai_analysis, priority, status, created_at, updated_at
        FROM interventions
        ORDER BY updated_at DESC
    """)
    all_interventions = [dict(i) for i in cursor.fetchall()]

    cursor.execute("SELECT * FROM intervention_actions ORDER BY created_at ASC")
    all_actions = [dict(a) for a in cursor.fetchall()]
    actions_by_iv_id = {}
    for act in all_actions:
        act["completed"] = bool(act["completed"])
        actions_by_iv_id.setdefault(act["intervention_id"], []).append(act)

    interventions_by_email = {}
    for iv in all_interventions:
        iv["actions"] = actions_by_iv_id.get(iv["id"], [])
        interventions_by_email.setdefault(iv["student_gmail"].strip().lower(), []).append(iv)

    # 5. Fetch mentor notes
    cursor.execute("SELECT note_id, mentor_id, student_id, content, created_at FROM mentor_notes ORDER BY created_at DESC")
    all_notes = [dict(n) for n in cursor.fetchall()]
    notes_by_student_id = {}
    for n in all_notes:
        notes_by_student_id.setdefault(n["student_id"], []).append(n)

    conn.close()

    # Process all students
    processed_students = []
    for s in students_raw:
        email_clean = (s.get("email") or "").strip().lower()
        s_id = s.get("student_id")
        user_results = results_by_email.get(email_clean, [])

        process_history = []
        is_placed = False
        placed_company = None
        placed_role = None
        placed_package = None
        has_in_progress = False
        has_rejected = False

        for r in user_results:
            d_info = drives_map.get(r["drive_id"], {})
            comp_name = d_info.get("company_name", "Placement Drive")
            role_name = d_info.get("job_role", "Graduate Engineer")
            ctc_val = d_info.get("ctc_lpa")
            res_str = (r.get("result") or "").strip()
            res_lower = res_str.lower()

            p_item = {
                "drive_id": r["drive_id"],
                "company_name": comp_name,
                "job_role": role_name,
                "ctc_lpa": ctc_val,
                "round": r.get("round", 1),
                "result": res_str,
                "score": r.get("score"),
                "max_score": r.get("max_score"),
                "feedback": r.get("feedback"),
                "weakness_area": r.get("weakness_area"),
                "rejection_reason": r.get("rejection_reason"),
                "attempt_date": r.get("attempt_date") or r.get("updated_at")
            }
            process_history.append(p_item)

            if any(kw in res_lower for kw in ["reject", "fail", "not select", "not-select", "unselect", "eliminated"]):
                has_rejected = True
            elif any(kw in res_lower for kw in ["select", "selet", "placed", "hired", "offer"]):
                is_placed = True
                if not placed_company:
                    placed_company = comp_name
                    placed_role = role_name
                    placed_package = ctc_val
            elif any(kw in res_lower for kw in ["shortlist", "round", "in progress", "on hold", "cleared", "pass"]):
                has_in_progress = True

        if is_placed:
            placement_status = "Placed"
        elif has_in_progress:
            placement_status = "In Process"
        elif has_rejected:
            placement_status = "At Risk"
        elif len(process_history) == 0:
            placement_status = "Not Started"
        else:
            placement_status = "Unplaced"

        student_ivs = interventions_by_email.get(email_clean, [])
        open_ivs = [iv for iv in student_ivs if (iv.get("status") or "").upper() != "RESOLVED"]

        highest_risk = "NONE"
        if any(iv.get("priority", "").upper() == "HIGH" for iv in open_ivs):
            highest_risk = "HIGH"
        elif any(iv.get("priority", "").upper() == "MEDIUM" for iv in open_ivs) or has_rejected:
            highest_risk = "MEDIUM"
        elif any(iv.get("priority", "").upper() == "LOW" for iv in open_ivs):
            highest_risk = "LOW"

        skills_text = s.get("skills") or ""
        skills_list = [sk.strip() for sk in skills_text.split(",") if sk.strip()]

        lc_m = int(s.get("leetcode_solved_month") or 0)
        cf_m = int(s.get("codeforces_solved_month") or 0)
        cc_m = int(s.get("codechef_solved_month") or 0)
        hr_m = int(s.get("hackerrank_solved_month") or 0)
        at_m = int(s.get("atcoder_solved_month") or 0)
        m_solved = int(s.get("monthly_total_solved") or (lc_m + cf_m + cc_m + hr_m + at_m))

        student_data = {
            "student_id": s_id,
            "register_number": s["register_number"],
            "name": s["name"],
            "email": s["email"],
            "department": s["department"],
            "year": s["year"],
            "cgpa": s["cgpa"],
            "tenth_percentage": s["tenth_percentage"],
            "twelfth_percentage": s["twelfth_percentage"],
            "skills": skills_text,
            "skills_list": skills_list,
            "phone": s.get("phone") or "",
            "linkedin_url": s.get("linkedin_url") or "",
            "github_url": s.get("github_url") or "",
            "portfolio_url": s.get("portfolio_url") or "",
            "resume_filename": s.get("resume_filename") or "",
            "resume_url": s.get("resume_url") or "",
            "monthly_total_solved": m_solved,
            "leetcode_handle": s.get("leetcode_handle") or "",
            "leetcode_solved_month": lc_m,
            "leetcode_total_solved": int(s.get("leetcode_total_solved") or 0),
            "codeforces_handle": s.get("codeforces_handle") or "",
            "codeforces_solved_month": cf_m,
            "codeforces_rating": int(s.get("codeforces_rating") or 0),
            "codechef_handle": s.get("codechef_handle") or "",
            "codechef_solved_month": cc_m,
            "codechef_stars": s.get("codechef_stars") or "",
            "hackerrank_handle": s.get("hackerrank_handle") or "",
            "hackerrank_solved_month": hr_m,
            "hackerrank_score": int(s.get("hackerrank_score") or 0),
            "atcoder_handle": s.get("atcoder_handle") or "",
            "atcoder_solved_month": at_m,
            "atcoder_rating": int(s.get("atcoder_rating") or 0),
            "coding_profiles": {
                "monthly_total_solved": m_solved,
                "leetcode": {"handle": s.get("leetcode_handle") or "", "solved_month": lc_m, "total_solved": int(s.get("leetcode_total_solved") or 0)},
                "codeforces": {"handle": s.get("codeforces_handle") or "", "solved_month": cf_m, "rating": int(s.get("codeforces_rating") or 0)},
                "codechef": {"handle": s.get("codechef_handle") or "", "solved_month": cc_m, "stars": s.get("codechef_stars") or ""},
                "hackerrank": {"handle": s.get("hackerrank_handle") or "", "solved_month": hr_m, "score": int(s.get("hackerrank_score") or 0)},
                "atcoder": {"handle": s.get("atcoder_handle") or "", "solved_month": at_m, "rating": int(s.get("atcoder_rating") or 0)}
            },
            "placement_status": placement_status,
            "placed_company": placed_company,
            "placed_role": placed_role,
            "placed_package": placed_package,
            "process_history": process_history,
            "drives_count": len(process_history),
            "interventions": student_ivs,
            "intervention_count": len(student_ivs),
            "open_interventions_count": len(open_ivs),
            "highest_risk": highest_risk,
            "mentor_notes": notes_by_student_id.get(s_id, [])
        }
        processed_students.append(student_data)

    # Filter by Year, Department, Status, Search
    filtered = processed_students
    if year and year.strip().lower() not in ["all", "all years"]:
        y_target = year.strip().lower()
        filtered = [s for s in filtered if s["year"].lower() == y_target or y_target in s["year"].lower()]

    if department and department.strip().lower() not in ["all", "all depts", "all departments"]:
        d_target = department.strip().upper()
        filtered = [s for s in filtered if s["department"].upper() == d_target]

    if status and status.strip().lower() not in ["all", "all statuses"]:
        st_target = status.strip().lower()
        filtered = [s for s in filtered if s["placement_status"].lower() == st_target]

    if search and search.strip():
        q = search.strip().lower()
        filtered = [
            s for s in filtered if (
                q in s["name"].lower() or
                q in s["register_number"].lower() or
                q in s["email"].lower() or
                q in (s.get("skills") or "").lower() or
                q in (s.get("placed_company") or "").lower()
            )
        ]

    total_count = len(filtered)
    placed_count = sum(1 for s in filtered if s["placement_status"] == "Placed")
    in_process_count = sum(1 for s in filtered if s["placement_status"] == "In Process")
    at_risk_count = sum(1 for s in filtered if s["placement_status"] == "At Risk" or s["highest_risk"] in ["HIGH", "MEDIUM"])
    interventions_count = sum(len(s["interventions"]) for s in filtered)
    rate_pct = round((placed_count / total_count * 100), 1) if total_count > 0 else 0.0
    avg_cgpa = round(sum(s["cgpa"] for s in filtered) / total_count, 2) if total_count > 0 else 0.0

    stats = {
        "total_students": total_count,
        "placed_count": placed_count,
        "placement_rate_pct": rate_pct,
        "in_process_count": in_process_count,
        "at_risk_count": at_risk_count,
        "interventions_count": interventions_count,
        "avg_cgpa": avg_cgpa
    }

    available_years = ["All Years", "4th Year", "3rd Year", "2nd Year", "1st Year"]
    available_departments = ["All Departments"] + sorted(list(set(s["department"] for s in processed_students)))
    available_statuses = ["All Statuses", "Placed", "In Process", "At Risk", "Not Started"]

    return {
        "stats": stats,
        "available_years": available_years,
        "available_departments": available_departments,
        "available_statuses": available_statuses,
        "students": filtered
    }


def get_coordinator_student_dossier(identifier: str):
    """
    Retrieve comprehensive 360-degree student tracking dossier for a specific student,
    matched by register_number, email, or student_id.
    """
    if not identifier:
        return None
    tracking = get_coordinator_students_tracking()
    target = identifier.strip().lower()
    for s in tracking["students"]:
        if (s.get("register_number") or "").strip().lower() == target or \
           (s.get("email") or "").strip().lower() == target or \
           (s.get("student_id") or "").strip().lower() == target:
            return s
    return None


if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")




