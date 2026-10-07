import os
import re
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

import bcrypt
from sqlalchemy import create_engine, delete, func, select, text, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import sessionmaker

from orm_models import (
    Base, Drive, Intervention, InterventionAction, MentorNote, MentorStudent,
    Round, StudentDriveResult, StudentRoster, UploadLog, User, timestamp_value,
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
    if entity is None:
        return None
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
    """Legacy raw connection kept for tests that inspect the database directly."""
    import sqlite3
    db_path = DATABASE_URL.replace("sqlite:///", "")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


_STANDARD_ROUND_TEMPLATES = [
    (1, "Online Assessment (Aptitude & Coding)", "CODING", "Aptitude, Core CS MCQs, and algorithmic coding challenge."),
    (2, "Technical Interview I (DSA & Problem Solving)", "TECHNICAL", "Live data structures, problem solving, time & space complexity."),
    (3, "Technical Interview II (System Design & Projects)", "TECHNICAL", "System design, databases, architecture, and project walkthrough."),
    (4, "HR & Managerial Discussion", "HR", "Leadership principles, behavioral assessment, and cultural fitment."),
    (5, "Executive Leadership Interview", "MANAGERIAL", "Director / Leadership interview, fitment, and offer discussion."),
    (6, "Founder / Partner Discussion", "HR", "Final alignment, compensation, and onboarding roadmap."),
]

_DEMO_SEED_USERS = [
    ("coordinator@gmail.com", "coord123", "Coordinator"),
    ("student@gmail.com", "student123", "Student"),
    ("mentor@gmail.com", "mentor123", "Mentor"),
    ("department@gmail.com", "dept123", "Department"),
    ("dept.cse@gmail.com", "dept123", "Department"),
    ("recruiter@gmail.com", "recruiter123", "Recruiter"),
]

_DEMO_ROSTER = [
    ("2021CS101", "Rahul Sharma", "rahul.sharma@college.edu", "CSE", 7.8, 89.5, 85.2, "Python, SQL, Java", "4th Year"),
    ("2021CS102", "Ananya Reddy", "ananya.reddy@college.edu", "CSE", 8.5, 92.0, 88.0, "Java, Spring Boot, React", "4th Year"),
    ("2021IT103", "Vikram Patel", "vikram.patel@college.edu", "IT", 6.9, 78.0, 72.0, "Python, HTML, CSS", "4th Year"),
    ("2021EC104", "Deepa Krishnan", "deepa.krishnan@college.edu", "ECE", 7.2, 85.0, 80.0, "C++, Embedded Systems", "4th Year"),
    ("2021CS105", "Sneha Gupta", "sneha.gupta@college.edu", "CSE", 9.1, 95.0, 93.5, "DSA, System Design, C++, AWS", "4th Year"),
    ("2021EC106", "Arjun Menon", "arjun.menon@college.edu", "ECE", 7.5, 88.0, 82.0, "C, Python, IoT", "4th Year"),
    ("2021CS107", "Priya Nair", "priya.nair@college.edu", "CSE", 8.2, 90.5, 87.0, "Python, ML, Data Science", "4th Year"),
    ("2021CS108", "Demo Student", "student@gmail.com", "CSE", 8.4, 91.0, 88.5, "Python, React, FastAPI", "4th Year"),
    ("2022CS201", "Karthik Sundaram", "karthik.sundaram@college.edu", "CSE", 8.6, 92.5, 90.0, "Java, DSA, Spring Boot", "3rd Year"),
    ("2022IT202", "Meera Nambiar", "meera.nambiar@college.edu", "IT", 7.9, 86.0, 84.0, "React, Node.js, TypeScript", "3rd Year"),
    ("2022EC203", "Rohan Joshi", "rohan.joshi@college.edu", "ECE", 8.1, 89.0, 85.5, "VLSI, Embedded C, Python", "3rd Year"),
    ("2022EE204", "Divya Ramesh", "divya.ramesh@college.edu", "EEE", 7.4, 82.0, 79.0, "Power Electronics, MATLAB, C", "3rd Year"),
    ("2023CS301", "Aditya Varma", "aditya.varma@college.edu", "CSE", 8.8, 94.0, 92.0, "C++, Data Structures, Python", "2nd Year"),
    ("2023IT302", "Pooja Hegde", "pooja.hegde@college.edu", "IT", 8.2, 90.0, 88.0, "Python, Web Development, UI/UX", "2nd Year"),
    ("2023ME303", "Siddharth Rao", "siddharth.rao@college.edu", "MECH", 7.1, 80.0, 76.0, "CAD, SolidWorks, Python", "2nd Year"),
    ("2024CS401", "Varun Kapoor", "varun.kapoor@college.edu", "CSE", 8.5, 93.0, 91.0, "C, Python, Problem Solving", "1st Year"),
    ("2024EC402", "Kavya Swaminathan", "kavya.swaminathan@college.edu", "ECE", 8.9, 95.0, 93.0, "C, Mathematics, Digital Logic", "1st Year"),
]

_DEMO_CODING_PROFILES = {
    "student@gmail.com": {
        "phone": "+91 98765 43210",
        "linkedin_url": "https://linkedin.com/in/alex-rivera-cs",
        "github_url": "https://github.com/alexrivera-dev",
        "portfolio_url": "https://alexrivera.dev",
        "resume_filename": "Demo_Student_Resume.pdf",
        "resume_url": "/static/uploads/resumes/Demo_Student_Resume.pdf",
        "leetcode_handle": "alex_coder", "leetcode_solved_month": 22, "leetcode_total_solved": 340,
        "codeforces_handle": "alex_cf", "codeforces_solved_month": 14, "codeforces_rating": 1380,
        "codechef_handle": "alex_cc", "codechef_solved_month": 11, "codechef_stars": "3-Star",
        "hackerrank_handle": "alex_hr", "hackerrank_solved_month": 15, "hackerrank_score": 520,
        "atcoder_handle": "alex_atc", "atcoder_solved_month": 8, "atcoder_rating": 890,
        "monthly_total_solved": 70,
    },
    "rahul.sharma@college.edu": {
        "phone": "+91 98111 22334",
        "linkedin_url": "https://linkedin.com/in/rahul-sharma",
        "github_url": "https://github.com/rahulsharma",
        "resume_filename": "Demo_Student_Resume.pdf",
        "resume_url": "/static/uploads/resumes/Demo_Student_Resume.pdf",
        "leetcode_handle": "rahul_codes", "leetcode_solved_month": 15, "leetcode_total_solved": 210,
        "codeforces_handle": "rahul_s", "codeforces_solved_month": 10, "codeforces_rating": 1250,
        "codechef_handle": "rahul_cc", "codechef_solved_month": 8, "codechef_stars": "2-Star",
        "hackerrank_handle": "rahul_hr", "hackerrank_solved_month": 12, "hackerrank_score": 410,
        "atcoder_handle": "rahul_at", "atcoder_solved_month": 5, "atcoder_rating": 750,
        "monthly_total_solved": 50,
    },
    "vikram.patel@college.edu": {
        "phone": "+91 98222 33445",
        "linkedin_url": "https://linkedin.com/in/vikram-patel",
        "github_url": "https://github.com/vikrampatel",
        "resume_filename": "Demo_Student_Resume.pdf",
        "resume_url": "/static/uploads/resumes/Demo_Student_Resume.pdf",
        "leetcode_handle": "vikram_p", "leetcode_solved_month": 8, "leetcode_total_solved": 95,
        "codeforces_handle": "vikram_cf", "codeforces_solved_month": 5, "codeforces_rating": 1050,
        "codechef_handle": "vikram_cc", "codechef_solved_month": 4, "codechef_stars": "2-Star",
        "hackerrank_handle": "vikram_hr", "hackerrank_solved_month": 6, "hackerrank_score": 310,
        "atcoder_handle": "vikram_atc", "atcoder_solved_month": 2, "atcoder_rating": 610,
        "monthly_total_solved": 25,
    },
}


def _migrate_columns(conn):
    """Add columns that may be missing from pre-existing SQLite databases."""
    migrations = [
        ("drives", "company_type TEXT DEFAULT 'PRODUCT'"),
        ("drives", "required_cgpa REAL DEFAULT 0.0"),
        ("drives", "total_rounds INTEGER DEFAULT 4"),
        ("drives", "drive_date TEXT"),
        ("drives", "description TEXT"),
        ("authenticate", "department TEXT DEFAULT 'CSE'"),
        ("authenticate", "year TEXT DEFAULT '4th Year'"),
        ("authenticate", "is_active BOOLEAN DEFAULT 1"),
        ("authenticate", "is_approved BOOLEAN DEFAULT 1"),
    ]
    sr_extra_cols = [
        "phone TEXT", "linkedin_url TEXT", "github_url TEXT", "portfolio_url TEXT",
        "resume_filename TEXT", "resume_url TEXT", "year TEXT",
        "leetcode_handle TEXT", "leetcode_solved_month INTEGER DEFAULT 0",
        "leetcode_total_solved INTEGER DEFAULT 0",
        "codeforces_handle TEXT", "codeforces_solved_month INTEGER DEFAULT 0",
        "codeforces_rating INTEGER DEFAULT 0",
        "codechef_handle TEXT", "codechef_solved_month INTEGER DEFAULT 0", "codechef_stars TEXT",
        "hackerrank_handle TEXT", "hackerrank_solved_month INTEGER DEFAULT 0",
        "hackerrank_score INTEGER DEFAULT 0",
        "atcoder_handle TEXT", "atcoder_solved_month INTEGER DEFAULT 0",
        "atcoder_rating INTEGER DEFAULT 0",
        "monthly_total_solved INTEGER DEFAULT 0", "updated_at TEXT",
    ]
    for col_def in sr_extra_cols:
        migrations.append(("students_roster", col_def))

    for table, col_def in migrations:
        try:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_def}"))
        except Exception:
            pass


def _hash_pw(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _seed_demo_users(session):
    existing_count = session.scalar(select(func.count(User.uuid)))
    if existing_count == 0:
        for gmail, password, role in _DEMO_SEED_USERS:
            session.add(User(uuid=str(uuid.uuid4()), gmail=gmail, password=_hash_pw(password), role=role, is_approved=True))
        session.flush()
        print("Database seeded with sample demo accounts.")
    else:
        for gmail, password, role in _DEMO_SEED_USERS:
            exists = session.scalar(select(User.uuid).where(func.lower(User.gmail) == gmail.lower()))
            if not exists:
                session.add(User(uuid=str(uuid.uuid4()), gmail=gmail, password=_hash_pw(password), role=role, is_approved=True))
        session.execute(update(User).where(func.lower(User.role) == "admin").values(role="Coordinator"))
        session.execute(delete(User).where(func.lower(User.gmail) == "admin@gmail.com"))
        session.flush()


def _seed_mentor_assignments(session):
    mentor = session.scalar(select(User).where(func.lower(User.gmail) == "mentor@gmail.com"))
    if not mentor:
        return
    students = session.scalars(select(User).where(func.lower(User.role) == "student")).all()
    for student in students:
        existing = session.scalar(
            select(MentorStudent.id).where(
                MentorStudent.mentor_id == mentor.uuid,
                MentorStudent.student_id == student.uuid,
            )
        )
        if not existing:
            session.add(MentorStudent(id=str(uuid.uuid4()), mentor_id=mentor.uuid, student_id=student.uuid))
    session.flush()


def _seed_demo_drives(session):
    drive_count = session.scalar(select(func.count(Drive.id)))
    if drive_count != 0:
        return
    sample_drives = [
        ("Microsoft", "Software Engineer - SDE I", 18.5, 8.0, "CSE, IT, ECE, AIDS", "Bangalore / Remote", "Active", "2026-10-15"),
        ("Goldman Sachs", "Analyst - Technology Division", 22.0, 8.5, "CSE, ECE, EEE", "Hyderabad", "Active", "2026-10-20"),
        ("Amazon", "Applied Scientist / SDE", 28.0, 8.2, "CSE, IT, AIDS", "Chennai", "Upcoming", "2026-11-01"),
    ]
    for company, role, ctc, cgpa, branches, loc, status, deadline in sample_drives:
        session.add(Drive(
            id=str(uuid.uuid4()), company_name=company, job_role=role, ctc_lpa=ctc,
            min_cgpa=cgpa, allowed_branches=branches, location=loc, status=status, deadline=deadline,
        ))
    session.flush()
    print("Database seeded with sample recruitment drives.")


def _seed_drive_rounds(session):
    drives = session.scalars(select(Drive)).all()
    for d in drives:
        t_rounds = d.total_rounds or 4
        existing_count = session.scalar(select(func.count(Round.round_id)).where(Round.drive_id == d.id))
        if existing_count > 0:
            continue
        for r_num in range(1, t_rounds + 1):
            if r_num <= len(_STANDARD_ROUND_TEMPLATES):
                _, r_name, r_type, r_desc = _STANDARD_ROUND_TEMPLATES[r_num - 1]
            else:
                r_name, r_type, r_desc = f"Round {r_num} Evaluation", "TECHNICAL", f"Round {r_num} evaluation stage."
            session.add(Round(
                round_id=str(uuid.uuid4()), drive_id=d.id, round_number=r_num,
                round_name=r_name, round_type=r_type, description=r_desc,
            ))
    session.flush()


def _seed_demo_roster(session):
    for reg, name, email, dept, cgpa, tenth, twelfth, skills, year in _DEMO_ROSTER:
        existing = session.scalar(select(StudentRoster.student_id).where(func.lower(StudentRoster.email) == email.lower()))
        if not existing:
            session.add(StudentRoster(
                student_id=str(uuid.uuid4()), register_number=reg, name=name, email=email,
                department=dept, cgpa=cgpa, tenth_percentage=tenth, twelfth_percentage=twelfth,
                skills=skills, year=year,
            ))
    session.flush()


def _seed_coding_profiles(session):
    for email, profile in _DEMO_CODING_PROFILES.items():
        sr = session.scalar(select(StudentRoster).where(func.lower(StudentRoster.email) == email.lower()))
        if sr and not sr.leetcode_handle:
            for key, val in profile.items():
                setattr(sr, key, val)
    session.execute(text("""
        UPDATE students_roster
        SET monthly_total_solved = (
            COALESCE(leetcode_solved_month, 0) +
            COALESCE(codeforces_solved_month, 0) +
            COALESCE(codechef_solved_month, 0) +
            COALESCE(hackerrank_solved_month, 0) +
            COALESCE(atcoder_solved_month, 0)
        )
        WHERE monthly_total_solved IS NULL OR monthly_total_solved = 0
    """))
    session.flush()


def _seed_roster_years(session):
    year_patterns = [
        ("4th Year", ["2021%", "21%"]),
        ("3rd Year", ["2022%", "22%"]),
        ("2nd Year", ["2023%", "23%"]),
        ("1st Year", ["2024%", "24%"]),
    ]
    for year_val, patterns in year_patterns:
        for pat in patterns:
            session.execute(text(
                "UPDATE students_roster SET year = :yr "
                "WHERE (year IS NULL OR year = '') AND register_number LIKE :pat"
            ).bindparams(yr=year_val, pat=pat))
    session.execute(text("UPDATE students_roster SET year = '4th Year' WHERE year IS NULL OR year = ''"))
    session.flush()


def _seed_demo_interventions(session):
    iv_count = session.scalar(select(func.count(Intervention.id)))
    if iv_count != 0:
        return
    iv_seed = [
        ("iv-vikram-patel-01", "c20f81de-9536-4b19-bf49-4205d7180dd5", "vikram.patel@college.edu",
         "Critical DSA & Algorithmic Problem Solving Remediation",
         "Failed Round 1 Online Coding Assessment with 35% score. Weakness in recursion, arrays, and time complexity.",
         "Targeted 3-week coding practice plan required on LeetCode Easy/Medium and weekly mock assessments.",
         "HIGH", "OPEN", "coordinator@gmail.com"),
        ("iv-deepa-krishnan-02", "4753c63e-a1b8-41f3-b2ad-e6814221e0b0", "deepa.krishnan@college.edu",
         "Core Technical & System Architecture Refinement",
         "Struggled in Technical Interview Round 2 on Object-Oriented Design and SQL database queries.",
         "Needs focused mentoring on SQL joins, OOP fundamentals, and mock technical interview practice.",
         "MEDIUM", "IN PROGRESS", "coordinator@gmail.com"),
        ("iv-divya-ramesh-03", "divya-ramesh-uuid-03", "divya.ramesh@college.edu",
         "Quantitative Aptitude & Logical Reasoning Foundation",
         "Scored 42% in Aptitude diagnostic. Needs speed enhancement in time & work and probability.",
         "Daily timed quiz practice and shortcut techniques training with department mentor.",
         "MEDIUM", "OPEN", "coordinator@gmail.com"),
    ]
    for iv_id, sid, gmail, title, fsummary, analysis, priority, status, created_by in iv_seed:
        session.add(Intervention(
            id=iv_id, student_id=sid, student_gmail=gmail, title=title,
            failure_summary=fsummary, ai_analysis=analysis, priority=priority,
            status=status, created_by=created_by,
        ))
    actions_seed = [
        ("act-v1", "iv-vikram-patel-01", "Solve 15 LeetCode Easy & 10 Medium Array problems", "DSA & Algorithms", "LeetCode Curated 75", "Vikram Patel", False, "Focus on two-pointer technique", "2026-10-18"),
        ("act-v2", "iv-vikram-patel-01", "1:1 Aptitude session with Prof. Anitha", "Core Aptitude", "Campus Placement Prep LMS", "Prof. Anitha S", True, "Completed session on Oct 4", "2026-10-10"),
        ("act-v3", "iv-vikram-patel-01", "Re-take DSA Mock Test on portal", "Assessment Speed", "Portal Assessment Hub", "Vikram Patel", False, "Scheduled for Friday 4 PM", "2026-10-22"),
        ("act-d1", "iv-deepa-krishnan-02", "Complete SQL Queries & Indexing Assignment", "Relational Databases", "Mode Analytics SQL Tutorial", "Deepa Krishnan", True, "Submitted assignment", "2026-10-12"),
        ("act-d2", "iv-deepa-krishnan-02", "Mock Technical Interview with Mentor Dr. Ramesh", "OOP & System Design", "Internal Mock Room 2", "Dr. Ramesh Kumar", False, "Booked for next Tuesday", "2026-10-19"),
        ("act-dr1", "iv-divya-ramesh-03", "Complete 50 Quantitative Practice Questions", "Time & Work, Probability", "R.S. Aggarwal Aptitude LMS", "Divya Ramesh", False, "Complete module 3", "2026-10-25"),
    ]
    for act_id, iv_id, title, wa, resources, assigned, completed, notes, due in actions_seed:
        session.add(InterventionAction(
            id=act_id, intervention_id=iv_id, title=title, weakness_area=wa,
            resources=resources, assigned_to=assigned, completed=completed,
            notes=notes, due_date=due,
        ))
    session.flush()


def _seed_demo_drive_results(session):
    count = session.scalar(select(func.count(StudentDriveResult.id)))
    if count != 0:
        return
    drives = session.scalars(select(Drive)).all()
    if not drives:
        return
    d0 = drives[0].id
    results = [
        (d0, "sneha.gupta@college.edu", "Selected", 3, 92.0),
        (d0, "ananya.reddy@college.edu", "Selected", 3, 85.0),
        (d0, "rahul.sharma@college.edu", "Rejected", 2, 45.0),
        (d0, "vikram.patel@college.edu", "Rejected", 1, 35.0),
        (d0, "priya.nair@college.edu", "Shortlisted for Round 2", 2, 70.0),
        (d0, "student@gmail.com", "Shortlisted for Round 3", 3, 78.0),
    ]
    for drive_id, gmail, result, rnd, score in results:
        session.add(StudentDriveResult(
            id=str(uuid.uuid4()), drive_id=drive_id, gmail=gmail,
            result=result, round=rnd, score=score, updated_at=_now(),
        ))
    session.flush()


def init_db():
    """Initialize database and create tables if they do not exist."""
    try:
        Base.metadata.create_all(engine)
    except Exception:
        pass  # Tables may already exist from a concurrent worker
    with engine.begin() as conn:
        _migrate_columns(conn)
    try:
        with session_scope() as session:
            _seed_demo_users(session)
            _seed_mentor_assignments(session)
            _seed_demo_drives(session)
            _seed_drive_rounds(session)
            _seed_roster_years(session)
            _seed_demo_roster(session)
            _seed_coding_profiles(session)
            _seed_demo_drive_results(session)
            _seed_demo_interventions(session)
    except Exception:
        pass  # Seeds may already exist from a concurrent worker


# ---------------------------------------------------------------------------
# User functions
# ---------------------------------------------------------------------------

def get_user_by_gmail(gmail: str):
    with session_scope() as session:
        user = session.scalar(select(User).where(func.lower(User.gmail) == gmail.strip().lower()))
        if user is None:
            return None
        return {"uuid": user.uuid, "gmail": user.gmail, "password": user.password, "role": user.role, "department": user.department, "is_approved": user.is_approved}


def get_user_by_id(user_id: str):
    with session_scope() as session:
        user = session.scalar(select(User).where(User.uuid == user_id))
        if user is None:
            return None
        return {"uuid": user.uuid, "gmail": user.gmail, "password": user.password, "role": user.role, "department": user.department, "is_approved": user.is_approved}


def get_all_users():
    with session_scope() as session:
        users = session.scalars(select(User)).all()
        return [{"uuid": u.uuid, "gmail": u.gmail, "role": u.role} for u in users]


# ---------------------------------------------------------------------------
# Drive functions
# ---------------------------------------------------------------------------

def get_all_drives():
    with session_scope() as session:
        rows = session.execute(text("""
            SELECT d.id, d.company_name, d.job_role, d.ctc_lpa, d.min_cgpa, d.allowed_branches,
                   d.location, d.status, d.deadline, d.description,
                   COALESCE(d.total_rounds, 4) as total_rounds, d.current_round, d.created_at,
                   COUNT(sdr.id) as results_count
            FROM drives d
            LEFT JOIN student_drive_results sdr ON d.id = sdr.drive_id
            GROUP BY d.id
            ORDER BY d.created_at DESC
        """)).mappings().all()
        return [dict(r) for r in rows]


def _upsert_round(session, r_id, drive_id, r_num, r_name, r_type, r_desc):
    stmt = sqlite_insert(Round).values(
        round_id=r_id, drive_id=drive_id, round_number=r_num,
        round_name=r_name, round_type=r_type, description=r_desc,
    ).on_conflict_do_update(
        index_elements=[Round.drive_id, Round.round_number],
        set_=dict(round_name=r_name, round_type=r_type, description=r_desc),
    )
    session.execute(stmt)


def _populate_rounds(session, drive_id, t_rounds, rounds_list=None):
    if rounds_list:
        for idx, r in enumerate(rounds_list):
            r_num = int(r.get("round_number") or (idx + 1))
            r_name = str(r.get("round_name") or f"Round {r_num}").strip()
            r_type = str(r.get("round_type") or "TECHNICAL").strip().upper()
            r_desc = str(r.get("description") or "").strip()
            r_id = str(r.get("round_id") or f"round-{drive_id}-{r_num}")
            _upsert_round(session, r_id, drive_id, r_num, r_name, r_type, r_desc)
    else:
        for r_num in range(1, t_rounds + 1):
            if r_num <= len(_STANDARD_ROUND_TEMPLATES):
                _, r_name, r_type, r_desc = _STANDARD_ROUND_TEMPLATES[r_num - 1]
            else:
                r_name = f"Round {r_num} Evaluation"
                r_type = "TECHNICAL"
                r_desc = f"Round {r_num} evaluation stage for candidates."
            _upsert_round(session, f"round-{drive_id}-{r_num}", drive_id, r_num, r_name, r_type, r_desc)


def create_drive(company_name: str, job_role: str, ctc_lpa: float, min_cgpa: float,
                 allowed_branches: str, location: str, status: str = "Active",
                 deadline: str = None, description: str = None, total_rounds: int = 4,
                 rounds: list = None):
    drive_id = str(uuid.uuid4())
    t_rounds = max(1, int(total_rounds or 4))

    with session_scope() as session:
        session.add(Drive(
            id=drive_id, company_name=company_name, job_role=job_role, ctc_lpa=ctc_lpa,
            min_cgpa=min_cgpa, allowed_branches=allowed_branches, location=location,
            status=status, deadline=deadline, description=description,
            total_rounds=t_rounds, current_round=1,
        ))
        session.flush()
        _populate_rounds(session, drive_id, t_rounds, rounds)
        session.flush()

        drive = session.scalar(select(Drive).where(Drive.id == drive_id))
        result = _as_dict(drive)
        result["total_rounds"] = result.get("total_rounds") or 4

    result["rounds"] = get_drive_rounds(drive_id)
    return result


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
    rounds: list = None,
):
    with session_scope() as session:
        existing = session.scalar(select(Drive).where(Drive.id == drive_id))
        if not existing:
            return None

        if company_name is not None:
            existing.company_name = company_name
        if job_role is not None:
            existing.job_role = job_role
        if ctc_lpa is not None:
            existing.ctc_lpa = ctc_lpa
        if min_cgpa is not None:
            existing.min_cgpa = min_cgpa
        if allowed_branches is not None:
            existing.allowed_branches = allowed_branches
        if location is not None:
            existing.location = location
        if status is not None:
            existing.status = status
        if deadline is not None:
            existing.deadline = deadline
        if description is not None:
            existing.description = description

        t_rounds = total_rounds
        if t_rounds is None and rounds:
            t_rounds = len(rounds)
        if t_rounds is None:
            t_rounds = existing.total_rounds or 4
        t_rounds = max(1, int(t_rounds or 4))
        existing.total_rounds = t_rounds
        session.flush()

        if rounds is not None:
            session.execute(delete(Round).where(Round.drive_id == drive_id, Round.round_number > t_rounds))
            for idx, r in enumerate(rounds):
                r_num = int(r.get("round_number") or (idx + 1))
                if r_num > t_rounds:
                    continue
                r_name = str(r.get("round_name") or f"Round {r_num}").strip()
                r_type = str(r.get("round_type") or "TECHNICAL").strip().upper()
                r_desc = str(r.get("description") or "").strip()
                r_id = str(r.get("round_id") or f"round-{drive_id}-{r_num}")
                _upsert_round(session, r_id, drive_id, r_num, r_name, r_type, r_desc)
        elif total_rounds is not None:
            session.execute(delete(Round).where(Round.drive_id == drive_id, Round.round_number > t_rounds))
            existing_r_nums = set(
                r[0] for r in session.execute(
                    select(Round.round_number).where(Round.drive_id == drive_id)
                ).all()
            )
            for r_num in range(1, t_rounds + 1):
                if r_num not in existing_r_nums:
                    session.add(Round(
                        round_id=f"round-{drive_id}-{r_num}", drive_id=drive_id,
                        round_number=r_num, round_name=f"Round {r_num}",
                        round_type="TECHNICAL", description=f"Round {r_num} assessment.",
                    ))
        session.flush()

        result = _as_dict(existing)
        result["total_rounds"] = result.get("total_rounds") or 4

    result["rounds"] = get_drive_rounds(drive_id)
    return result


# ---------------------------------------------------------------------------
# Student-drive result functions
# ---------------------------------------------------------------------------

def register_student_for_drive(drive_id: str, gmail: str):
    gmail_clean = gmail.strip().lower()
    with session_scope() as session:
        existing = session.scalar(
            select(StudentDriveResult).where(
                StudentDriveResult.drive_id == drive_id,
                func.lower(StudentDriveResult.gmail) == gmail_clean,
            )
        )
        if existing:
            return {"gmail": gmail_clean, "round": existing.round or 1, "result": existing.result or "Applied"}

        session.add(StudentDriveResult(
            id=str(uuid.uuid4()), drive_id=drive_id, gmail=gmail_clean,
            result="Applied", round=1, updated_at=_now(),
        ))
    return {"gmail": gmail_clean, "round": 1, "result": "Applied"}


def advance_or_update_candidate(drive_id: str, gmail: str, action: str,
                                total_rounds: int = 4, score: float = None,
                                feedback: str = None, round_num: int = None):
    gmail_clean = gmail.strip().lower()
    with session_scope() as session:
        existing = session.scalar(
            select(StudentDriveResult).where(
                StudentDriveResult.drive_id == drive_id,
                func.lower(StudentDriveResult.gmail) == gmail_clean,
            )
        )
        cur_round = round_num or (existing.round if existing and existing.round else 1)

        act_lower = (action or "advance").strip().lower()
        if act_lower in ("reject", "rejected", "fail"):
            new_round = cur_round
            new_result = "Rejected"
        elif act_lower in ("offer", "offered", "placed", "hired"):
            new_round = total_rounds
            new_result = "Offered"
        elif act_lower in ("select", "selected", "advance", "shortlist", "cleared", "pass"):
            if cur_round < total_rounds:
                new_round = cur_round + 1
                new_result = f"Shortlisted for Round {new_round}"
            else:
                new_round = total_rounds
                new_result = "Selected"
        else:
            new_round = cur_round
            new_result = action.capitalize()

        now = _now()
        if existing:
            existing.round = new_round
            existing.result = new_result
            if score is not None:
                existing.score = score
            if feedback is not None:
                existing.feedback = feedback
            existing.updated_at = now
        else:
            session.add(StudentDriveResult(
                id=str(uuid.uuid4()), drive_id=drive_id, gmail=gmail_clean,
                result=new_result, round=new_round, score=score, feedback=feedback,
                updated_at=now,
            ))

    return {"gmail": gmail_clean, "round": new_round, "result": new_result, "status": "Updated"}


def increment_student_drive_round(drive_id: str, gmail: str):
    gmail_clean = gmail.strip().lower()
    with session_scope() as session:
        drive = session.scalar(select(Drive).where(Drive.id == drive_id))
        t_rounds = (drive.total_rounds if drive and drive.total_rounds else 4)

        existing = session.scalar(
            select(StudentDriveResult).where(
                StudentDriveResult.drive_id == drive_id,
                func.lower(StudentDriveResult.gmail) == gmail_clean,
            )
        )

        new_round = (existing.round + 1) if (existing and existing.round is not None) else 2
        if new_round <= t_rounds:
            result_str = f"Shortlisted for Round {new_round}"
        else:
            new_round = t_rounds
            result_str = "Selected"

        now = _now()
        if existing:
            existing.round = new_round
            existing.result = result_str
            existing.updated_at = now
        else:
            session.add(StudentDriveResult(
                id=str(uuid.uuid4()), drive_id=drive_id, gmail=gmail_clean,
                result=result_str, round=new_round, updated_at=now,
            ))

    return {"gmail": gmail_clean, "round": new_round, "result": result_str}


def increment_drive_current_round(drive_id: str):
    with session_scope() as session:
        session.execute(text(
            "UPDATE drives SET current_round = COALESCE(current_round, 1) + 1 WHERE id = :did"
        ).bindparams(did=drive_id))


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
    gmail_clean = gmail.strip().lower()
    now = _now()
    with session_scope() as session:
        existing = session.scalar(
            select(StudentDriveResult).where(
                StudentDriveResult.drive_id == drive_id,
                func.lower(StudentDriveResult.gmail) == gmail_clean,
            )
        )
        if existing:
            existing.result = result.strip()
            if round_number is not None:
                existing.round = round_number
            existing.score = score
            existing.max_score = max_score
            existing.feedback = feedback
            existing.weakness_area = weakness_area
            existing.rejection_reason = rejection_reason
            existing.attempt_date = attempt_date
            existing.updated_at = now
        else:
            session.add(StudentDriveResult(
                id=str(uuid.uuid4()), drive_id=drive_id, gmail=gmail_clean,
                result=result.strip(), round=round_number or 1, score=score,
                max_score=max_score, feedback=feedback, weakness_area=weakness_area,
                rejection_reason=rejection_reason, attempt_date=attempt_date,
                updated_at=now,
            ))

import re


def get_drive_results(drive_id: str):
    """Fetch all candidate evaluation results for a specific placement drive enriched with student academic details."""
    with session_scope() as session:
        rows = session.execute(text("""
            SELECT sdr.id, sdr.drive_id, sdr.gmail, sdr.result, sdr.round, sdr.score, sdr.max_score,
                   sdr.feedback, sdr.weakness_area, sdr.rejection_reason, sdr.attempt_date, sdr.updated_at,
                   COALESCE(sr.name, '') as student_name,
                   COALESCE(sr.register_number, '') as register_number,
                   COALESCE(sr.department, 'CSE') as department,
                   COALESCE(sr.cgpa, 0.0) as cgpa
            FROM student_drive_results sdr
            LEFT JOIN students_roster sr ON LOWER(sdr.gmail) = LOWER(sr.email)
            WHERE sdr.drive_id = :drive_id
            ORDER BY sdr.round DESC, sdr.updated_at DESC
        """), {"drive_id": drive_id}).mappings().all()
        results = [dict(r) for r in rows]
    for r in results:
        if not r.get("student_name"):
            r["student_name"] = r["gmail"].split("@")[0].replace(".", " ").replace("_", " ").title()
    return results


def get_drive_rounds(drive_id: str):
    """Retrieve configured selection rounds for a placement drive, generating defaults if absent."""
    with session_scope() as session:
        entities = session.scalars(
            select(Round).where(Round.drive_id == drive_id).order_by(Round.round_number)
        ).all()
        rounds = [_as_dict(e) for e in entities]
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

            if current_r > r_num:
                return True

            if current_r < r_num:
                return False

            if any(w in res_str for w in ["reject", "fail", "not select", "not-select", "unselect", "eliminated", "disqualif"]):
                return False

            if any(w in res_str for w in ["applied", "registered", "in progress", "evaluating", "appearing", "scheduled", "pending", "on hold"]):
                return False

            m_short = re.search(r'round\s*(\d+)', res_str)
            if m_short and ("shortlist" in res_str or "for round" in res_str):
                target_r = int(m_short.group(1))
                if target_r <= r_num:
                    return False
                else:
                    return True

            if "shortlist" in res_str and r_num < total_rounds:
                return False

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
    Retrieve list of candidates who must appear in the evaluation template for round_num.
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
        r1 = next((r for r in rounds if r["round_number"] == 1), None)
        raw_list = (r1.get("students", []) if r1 else []) or all_results
        for s in raw_list:
            em = (s.get("gmail") or s.get("email") or "").strip().lower()
            if em and em not in seen_emails:
                seen_emails.add(em)
                candidates.append(s)
    else:
        prev_round_num = round_num - 1
        prev_round = next((r for r in rounds if r["round_number"] == prev_round_num), None)
        cleared_from_prev = prev_round.get("cleared_students", []) if prev_round else []

        active_in_target = []
        target_round = next((r for r in rounds if r["round_number"] == round_num), None)
        if target_round:
            active_in_target = [
                s for s in target_round.get("students", [])
                if not any(w in (s.get("result") or "").lower() for w in ["reject", "fail"])
            ]

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
    with session_scope() as session:
        rows = session.execute(text("""
            SELECT s.id, s.drive_id, s.gmail, s.result, s.round, s.score, s.max_score,
                   s.feedback, s.weakness_area, s.rejection_reason, s.attempt_date,
                   s.updated_at, d.company_name, d.job_role, d.ctc_lpa, d.location
            FROM student_drive_results s
            JOIN drives d ON s.drive_id = d.id
            WHERE LOWER(s.gmail) = LOWER(:gmail)
            ORDER BY s.updated_at DESC
        """), {"gmail": gmail.strip()}).mappings().all()
        return [dict(r) for r in rows]


def get_students_for_scope(user_id: str, role: str, department: str = None):
    """Return student accounts visible to a requester under the role hierarchy."""
    normalized_role = (role or "").strip().lower()

    with session_scope() as session:
        roster_rows = session.execute(text("""
            SELECT student_id, register_number, name, email, department, year, cgpa
            FROM students_roster
        """)).mappings().all()

        auth_rows = session.execute(text("""
            SELECT uuid, gmail, role, department
            FROM authenticate
            WHERE LOWER(role) = 'student'
        """)).mappings().all()

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
            assigned = session.execute(
                text("SELECT student_id FROM mentor_students WHERE mentor_id = :mid"),
                {"mid": user_id}
            ).mappings().all()
            assigned_ids = {row["student_id"] for row in assigned}
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

    filtered.sort(key=lambda s: s["gmail"].lower())
    return filtered


def get_student_analysis_records(gmail: str):
    """Return normalized result records used by failure analysis and the agent."""
    return get_student_drive_results(gmail)


def get_interventions(student_gmail: str = None, student_gmails: list = None):
    with session_scope() as session:
        if student_gmail:
            rows = session.execute(text("""
                SELECT i.*, u.department
                FROM interventions i
                LEFT JOIN authenticate u ON LOWER(u.gmail) = LOWER(i.student_gmail)
                WHERE LOWER(i.student_gmail) = LOWER(:gmail)
                ORDER BY i.updated_at DESC, i.created_at DESC
                LIMIT 3
            """), {"gmail": student_gmail}).mappings().all()
        elif student_gmails is not None:
            if not student_gmails:
                return []
            placeholders = ",".join(f":g{i}" for i in range(len(student_gmails)))
            params = {f"g{i}": g.lower() for i, g in enumerate(student_gmails)}
            rows = session.execute(text(f"""
                SELECT i.*, u.department
                FROM interventions i
                LEFT JOIN authenticate u ON LOWER(u.gmail) = LOWER(i.student_gmail)
                WHERE LOWER(i.student_gmail) IN ({placeholders})
                ORDER BY i.updated_at DESC
            """), params).mappings().all()
        else:
            rows = session.execute(text("""
                SELECT i.*, u.department
                FROM interventions i
                LEFT JOIN authenticate u ON LOWER(u.gmail) = LOWER(i.student_gmail)
                ORDER BY i.updated_at DESC
            """)).mappings().all()

        interventions = []
        for row in rows:
            intervention = dict(row)
            action_rows = session.execute(text("""
                SELECT id, intervention_id, title, weakness_area, resources,
                       assigned_to, completed, notes, due_date, created_at, updated_at
                FROM intervention_actions
                WHERE intervention_id = :iid
                ORDER BY created_at
            """), {"iid": intervention["id"]}).mappings().all()
            intervention["actions"] = [dict(a) for a in action_rows]
            for action in intervention["actions"]:
                action["completed"] = bool(action["completed"])
            interventions.append(intervention)
    return interventions


def save_intervention(intervention: dict, actions: list):
    intervention_id = intervention.get("id") or str(uuid.uuid4())
    with session_scope() as session:
        session.add(Intervention(
            id=intervention_id,
            student_id=intervention["student_id"],
            student_gmail=intervention["student_gmail"].lower(),
            title=intervention["title"],
            failure_summary=intervention["failure_summary"],
            ai_analysis=intervention["ai_analysis"],
            priority=intervention.get("priority", "MEDIUM"),
            status=intervention.get("status", "OPEN"),
            created_by=intervention["created_by"],
        ))
        for action in actions:
            session.add(InterventionAction(
                id=str(uuid.uuid4()),
                intervention_id=intervention_id,
                title=action["title"],
                weakness_area=action.get("weakness_area"),
                resources=action.get("resources"),
                assigned_to=action.get("assigned_to"),
                completed=bool(action.get("completed")),
                notes=action.get("notes"),
                due_date=action.get("due_date"),
            ))
        session.flush()

        old_ids_rows = session.execute(text("""
            SELECT id FROM interventions
            WHERE LOWER(student_gmail) = LOWER(:gmail)
            ORDER BY updated_at DESC, created_at DESC
            LIMIT -1 OFFSET 3
        """), {"gmail": intervention["student_gmail"]}).mappings().all()
        for row in old_ids_rows:
            session.execute(delete(InterventionAction).where(InterventionAction.intervention_id == row["id"]))
            session.execute(delete(Intervention).where(Intervention.id == row["id"]))
    return get_interventions(student_gmail=intervention["student_gmail"])[0]


def update_intervention_status(intervention_id: str, new_status: str):
    with session_scope() as session:
        entity = session.get(Intervention, intervention_id)
        if not entity:
            return False
        entity.status = new_status
        entity.updated_at = _now()
    return True


def update_intervention_action(action_id: str, completed: bool = None, notes: str = None):
    if completed is None and notes is None:
        return False
    with session_scope() as session:
        entity = session.get(InterventionAction, action_id)
        if not entity:
            return False
        if completed is not None:
            entity.completed = completed
        if notes is not None:
            entity.notes = notes
        entity.updated_at = _now()
        parent = session.get(Intervention, entity.intervention_id)
        if parent:
            parent.updated_at = _now()
    return True


def add_intervention_action(
    intervention_id: str,
    title: str,
    weakness_area: str = None,
    resources: str = None,
    assigned_to: str = None,
    due_date: str = None
):
    action_id = str(uuid.uuid4())
    with session_scope() as session:
        action = InterventionAction(
            id=action_id,
            intervention_id=intervention_id,
            title=title.strip(),
            weakness_area=weakness_area,
            resources=resources,
            assigned_to=assigned_to,
            completed=False,
            notes="",
            due_date=due_date,
        )
        session.add(action)
        parent = session.get(Intervention, intervention_id)
        if parent:
            parent.updated_at = _now()
        session.flush()
        result = _as_dict(action)
    result["completed"] = bool(result["completed"])
    return result


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
    intervention_id = str(uuid.uuid4())
    gmail_clean = student_gmail.strip().lower()
    with session_scope() as session:
        session.add(Intervention(
            id=intervention_id,
            student_id=student_id,
            student_gmail=gmail_clean,
            title=title.strip(),
            failure_summary=(failure_summary or "").strip(),
            ai_analysis=(ai_analysis or "").strip(),
            priority=(priority or "MEDIUM").strip().upper(),
            status="OPEN",
            created_by=created_by,
        ))
        if actions:
            for act in actions:
                session.add(InterventionAction(
                    id=str(uuid.uuid4()),
                    intervention_id=intervention_id,
                    title=act.get("title", "").strip(),
                    weakness_area=act.get("weakness_area"),
                    resources=act.get("resources"),
                    assigned_to=act.get("assigned_to"),
                    completed=bool(act.get("completed")),
                    notes=act.get("notes", ""),
                    due_date=act.get("due_date"),
                ))
    return get_interventions(student_gmail=gmail_clean)[0]


def delete_intervention(intervention_id: str):
    with session_scope() as session:
        session.execute(delete(InterventionAction).where(InterventionAction.intervention_id == intervention_id))
        session.execute(delete(Intervention).where(Intervention.id == intervention_id))
    return True

def get_student_profile_by_email(email: str):
    """Fetch complete student academic & coding profile by email from students_roster table."""
    email_clean = email.strip().lower()
    with session_scope() as session:
        entity = session.scalars(
            select(StudentRoster).where(func.lower(StudentRoster.email) == email_clean)
        ).first()
        if not entity:
            return None
        res = _as_dict(entity)

    if isinstance(res.get("skills"), str) and res.get("skills"):
        res["skills_list"] = [s.strip() for s in res["skills"].split(",") if s.strip()]
    else:
        res["skills_list"] = []

    lc_m = int(res.get("leetcode_solved_month") or 0)
    cf_m = int(res.get("codeforces_solved_month") or 0)
    cc_m = int(res.get("codechef_solved_month") or 0)
    hr_m = int(res.get("hackerrank_solved_month") or 0)
    at_m = int(res.get("atcoder_solved_month") or 0)
    m_sum = lc_m + cf_m + cc_m + hr_m + at_m
    res["monthly_total_solved"] = m_sum

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


def get_drive_failure_rates(drive_ids):
    """Return population failure rates used to weight student result evidence."""
    normalized_ids = {drive_id for drive_id in drive_ids if drive_id}
    if not normalized_ids:
        return {}

    rates = {}
    with session_scope() as session:
        records = session.scalars(select(StudentDriveResult).where(StudentDriveResult.drive_id.in_(normalized_ids))).all()
        grouped = {}
        for record in records:
            result = (record.result or "").lower()
            grouped.setdefault(record.drive_id, []).append(
                any(term in result for term in ("rejected", "failed", "fail"))
            )
        for drive_id in normalized_ids:
            outcomes = grouped.get(drive_id, [])
            rates[drive_id] = sum(outcomes) / len(outcomes) if outcomes else 0.5
    return rates


def update_student_profile(email: str, data: dict, is_student: bool = True):
    """
    Update or insert a student's personal details, resume metadata, and coding platform profiles.
    Calculates monthly_total_solved across LeetCode, Codeforces, CodeChef, HackerRank, and AtCoder.
    When is_student=True, academic/institutional fields (cgpa, tenth_percentage, twelfth_percentage,
    department, register_number, email) cannot be altered or forged by students and are preserved.
    """
    email_clean = email.strip().lower()
    with session_scope() as session:
        existing = session.scalars(
            select(StudentRoster).where(func.lower(StudentRoster.email) == email_clean)
        ).first()

        if existing:
            merged = _as_dict(existing)
            for k, v in data.items():
                if v is not None:
                    if is_student and k in {
                        "cgpa", "tenth_percentage", "twelfth_percentage",
                        "department", "register_number", "email", "gmail"
                    }:
                        continue
                    merged[k] = v

            lc_m = int(merged.get("leetcode_solved_month") or 0)
            cf_m = int(merged.get("codeforces_solved_month") or 0)
            cc_m = int(merged.get("codechef_solved_month") or 0)
            hr_m = int(merged.get("hackerrank_solved_month") or 0)
            at_m = int(merged.get("atcoder_solved_month") or 0)
            monthly_sum = lc_m + cf_m + cc_m + hr_m + at_m

            existing.name = merged.get("name")
            existing.phone = merged.get("phone")
            existing.department = merged.get("department")
            existing.year = merged.get("year")
            existing.cgpa = merged.get("cgpa")
            existing.tenth_percentage = merged.get("tenth_percentage")
            existing.twelfth_percentage = merged.get("twelfth_percentage")
            existing.skills = merged.get("skills")
            existing.linkedin_url = merged.get("linkedin_url")
            existing.github_url = merged.get("github_url")
            existing.portfolio_url = merged.get("portfolio_url")
            existing.resume_filename = merged.get("resume_filename")
            existing.resume_url = merged.get("resume_url")
            existing.leetcode_handle = merged.get("leetcode_handle")
            existing.leetcode_solved_month = lc_m
            existing.leetcode_total_solved = int(merged.get("leetcode_total_solved") or 0)
            existing.codeforces_handle = merged.get("codeforces_handle")
            existing.codeforces_solved_month = cf_m
            existing.codeforces_rating = int(merged.get("codeforces_rating") or 0)
            existing.codechef_handle = merged.get("codechef_handle")
            existing.codechef_solved_month = cc_m
            existing.codechef_stars = merged.get("codechef_stars") or ""
            existing.hackerrank_handle = merged.get("hackerrank_handle")
            existing.hackerrank_solved_month = hr_m
            existing.hackerrank_score = int(merged.get("hackerrank_score") or 0)
            existing.atcoder_handle = merged.get("atcoder_handle")
            existing.atcoder_solved_month = at_m
            existing.atcoder_rating = int(merged.get("atcoder_rating") or 0)
            existing.monthly_total_solved = monthly_sum
            existing.updated_at = _now()
        else:
            lc_m = int(data.get("leetcode_solved_month") or 0)
            cf_m = int(data.get("codeforces_solved_month") or 0)
            cc_m = int(data.get("codechef_solved_month") or 0)
            hr_m = int(data.get("hackerrank_solved_month") or 0)
            at_m = int(data.get("atcoder_solved_month") or 0)
            monthly_sum = lc_m + cf_m + cc_m + hr_m + at_m

            reg_no = data.get("register_number") or f"REG{uuid.uuid4().hex[:6].upper()}"
            name = data.get("name") or email_clean.split("@")[0].replace(".", " ").title()
            dept = data.get("department") or "CSE"
            cgpa = data.get("cgpa") if (not is_student and data.get("cgpa") is not None) else None
            tenth = data.get("tenth_percentage") if not is_student else None
            twelfth = data.get("twelfth_percentage") if not is_student else None

            new_student = StudentRoster(
                student_id=str(uuid.uuid4()),
                register_number=reg_no,
                name=name,
                email=email_clean,
                department=dept,
                year=data.get("year", "4th Year"),
                cgpa=cgpa or 0.0,
                tenth_percentage=tenth,
                twelfth_percentage=twelfth,
                skills=data.get("skills", ""),
                phone=data.get("phone"),
                linkedin_url=data.get("linkedin_url"),
                github_url=data.get("github_url"),
                portfolio_url=data.get("portfolio_url"),
                resume_filename=data.get("resume_filename"),
                resume_url=data.get("resume_url"),
                leetcode_handle=data.get("leetcode_handle"),
                leetcode_solved_month=lc_m,
                leetcode_total_solved=int(data.get("leetcode_total_solved") or 0),
                codeforces_handle=data.get("codeforces_handle"),
                codeforces_solved_month=cf_m,
                codeforces_rating=int(data.get("codeforces_rating") or 0),
                codechef_handle=data.get("codechef_handle"),
                codechef_solved_month=cc_m,
                codechef_stars=data.get("codechef_stars") or "",
                hackerrank_handle=data.get("hackerrank_handle"),
                hackerrank_solved_month=hr_m,
                hackerrank_score=int(data.get("hackerrank_score") or 0),
                atcoder_handle=data.get("atcoder_handle"),
                atcoder_solved_month=at_m,
                atcoder_rating=int(data.get("atcoder_rating") or 0),
                monthly_total_solved=monthly_sum,
                updated_at=_now(),
            )
            session.add(new_student)

    return get_student_profile_by_email(email_clean)


def get_drive_results_count(drive_id: str) -> int:
    """Count candidate results for a specific drive."""
    with session_scope() as session:
        count = session.scalar(
            select(func.count(StudentDriveResult.id)).where(StudentDriveResult.drive_id == drive_id)
        )
    return count or 0


def _normalize_role_value(role: str) -> str:
    role_map = {
        "student": "Student", "mentor": "Mentor",
        "department": "Department", "dept": "Department",
        "recruiter": "Recruiter",
        "coordinator": "Coordinator", "admin": "Coordinator",
    }
    return role_map.get(role.strip().lower(), "Student")


def _default_password(role: str) -> str:
    plain = {
        "Student": "student123", "Mentor": "mentor123",
        "Department": "dept123", "Recruiter": "recruiter123",
        "Coordinator": "coord123",
    }.get(role, "user123")
    return _hash_pw(plain)


def bulk_grant_user_access(users_list: list):
    """
    Bulk create or update user access in 'authenticate' table.
    users_list is a list of dicts: [{"gmail": "...", "role": "..."}, ...]
    """
    created_count = 0
    updated_count = 0
    processed_users = []

    with session_scope() as session:
        for item in users_list:
            gmail = item.get("gmail", "").strip().lower()
            role = _normalize_role_value(item.get("role", "Student"))
            custom_password = item.get("password", "").strip() if item.get("password") else None

            if not gmail or "@" not in gmail:
                continue

            existing = session.scalars(
                select(User).where(func.lower(User.gmail) == gmail)
            ).first()

            if existing:
                existing.role = role
                if custom_password:
                    existing.password = custom_password
                    action_str = "Updated Role & Password"
                else:
                    action_str = "Updated Role"
                updated_count += 1
                processed_users.append({
                    "uuid": existing.uuid,
                    "gmail": gmail,
                    "role": role,
                    "password": custom_password if custom_password else existing.password,
                    "action": action_str
                })
            else:
                final_pwd = custom_password or _default_password(role)
                new_uuid = str(uuid.uuid4())
                new_user = User(
                    uuid=new_uuid, gmail=gmail, password=final_pwd, role=role, is_approved=True
                )
                session.add(new_user)
                created_count += 1
                processed_users.append({
                    "uuid": new_uuid,
                    "gmail": gmail,
                    "role": role,
                    "password": final_pwd,
                    "action": "Created Account"
                })

    return {
        "created_count": created_count,
        "updated_count": updated_count,
        "total_processed": len(processed_users),
        "processed_users": processed_users
    }


def grant_single_user_access(gmail: str, role: str = "Student", password: str = None):
    """Grant or update access for a single user in 'authenticate' table."""
    gmail_clean = gmail.strip().lower()
    role = _normalize_role_value(role)

    with session_scope() as session:
        existing = session.scalars(
            select(User).where(func.lower(User.gmail) == gmail_clean)
        ).first()

        if existing:
            final_pwd = password.strip() if (password and password.strip()) else existing.password
            existing.role = role
            if password and password.strip():
                existing.password = final_pwd
            session.flush()
            return {
                "uuid": existing.uuid,
                "gmail": gmail_clean,
                "role": role,
                "password": final_pwd,
                "action": "Updated Role & Password" if (password and password.strip()) else "Updated Role"
            }
        else:
            final_pwd = password.strip() if (password and password.strip()) else _default_password(role)
            new_uuid = str(uuid.uuid4())
            session.add(User(
                uuid=new_uuid, gmail=gmail_clean, password=final_pwd, role=role, is_approved=True
            ))
            session.flush()
            return {
                "uuid": new_uuid,
                "gmail": gmail_clean,
                "role": role,
                "password": final_pwd,
                "action": "Created Account"
            }


def get_mentor_notes(mentor_id: str, student_id: str):
    """Retrieve all notes written by a mentor for a specific student."""
    with session_scope() as session:
        entities = session.scalars(
            select(MentorNote)
            .where(MentorNote.student_id == student_id)
            .order_by(MentorNote.created_at.desc())
        ).all()
        return [_as_dict(e) for e in entities]


def create_mentor_note(mentor_id: str, student_id: str, content: str):
    """Create a new note for a student."""
    note_id = str(uuid.uuid4())
    with session_scope() as session:
        note = MentorNote(
            note_id=note_id, mentor_id=mentor_id,
            student_id=student_id, content=content.strip()
        )
        session.add(note)
        session.flush()
        return _as_dict(note)


def update_mentor_note(note_id: str, content: str):
    """Update an existing note."""
    with session_scope() as session:
        note = session.scalars(
            select(MentorNote).where(MentorNote.note_id == note_id)
        ).first()
        if not note:
            return None
        note.content = content.strip()
        note.updated_at = _now()
        session.flush()
        return _as_dict(note)


def delete_mentor_note(note_id: str):
    """Delete a mentor note."""
    with session_scope() as session:
        session.execute(delete(MentorNote).where(MentorNote.note_id == note_id))
    return True


def _build_coding_profiles_dict(s: dict) -> dict:
    lc_m = int(s.get("leetcode_solved_month") or 0)
    cf_m = int(s.get("codeforces_solved_month") or 0)
    cc_m = int(s.get("codechef_solved_month") or 0)
    hr_m = int(s.get("hackerrank_solved_month") or 0)
    at_m = int(s.get("atcoder_solved_month") or 0)
    m_solved = int(s.get("monthly_total_solved") or (lc_m + cf_m + cc_m + hr_m + at_m))
    return {
        "monthly_total_solved": m_solved,
        "leetcode": {"handle": s.get("leetcode_handle") or "", "solved_month": lc_m, "total_solved": int(s.get("leetcode_total_solved") or 0)},
        "codeforces": {"handle": s.get("codeforces_handle") or "", "solved_month": cf_m, "rating": int(s.get("codeforces_rating") or 0)},
        "codechef": {"handle": s.get("codechef_handle") or "", "solved_month": cc_m, "stars": s.get("codechef_stars") or ""},
        "hackerrank": {"handle": s.get("hackerrank_handle") or "", "solved_month": hr_m, "score": int(s.get("hackerrank_score") or 0)},
        "atcoder": {"handle": s.get("atcoder_handle") or "", "solved_month": at_m, "rating": int(s.get("atcoder_rating") or 0)},
    }, m_solved, lc_m, cf_m, cc_m, hr_m, at_m


def _build_mentee_obj(s: dict, student_id, name, gmail, dept, status, coding_data):
    cp, m_solved, lc_m, cf_m, cc_m, hr_m, at_m = coding_data
    return {
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
        "coding_profiles": cp,
    }


def _determine_placement_status(results):
    status = "Active"
    placed_info = None
    for r in results:
        res_str = (r.get("result") or "").lower()
        if "selected" in res_str or "placed" in res_str or "hired" in res_str:
            return "Placed", r
        elif "rejected" in res_str or "failed" in res_str:
            status = "At Risk"
    return status, placed_info


def get_mentor_dashboard_data(mentor_gmail: str = "mentor@gmail.com"):
    """
    Dynamically fetch mentor dashboard details from database tables.
    """
    with session_scope() as session:
        # Query students from roster
        roster_entities = session.scalars(
            select(StudentRoster).order_by(StudentRoster.name.asc())
        ).all()
        roster_rows = [_as_dict(e) for e in roster_entities]

        # Auth-only students not in roster
        auth_students = [
            _as_dict(u) for u in session.scalars(
                select(User).where(func.lower(User.role) == "student")
            ).all()
        ]
        known_emails = set((r["email"] or "").lower() for r in roster_rows)

        student_records = list(roster_rows)
        for a in auth_students:
            a_mail = (a["gmail"] or "").lower()
            if a_mail not in known_emails:
                name_parts = a_mail.split("@")[0].replace(".", " ").replace("_", " ").title()
                student_records.append({
                    "student_id": a["uuid"],
                    "register_number": "",
                    "name": name_parts,
                    "email": a["gmail"],
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
            gmail = s.get("email") or ""
            student_id = s.get("student_id") or ""
            name = s.get("name") or ""
            dept = s.get("department") or ""

            result_rows = [
                dict(row) for row in session.execute(
                    text("""
                        SELECT s.id, s.drive_id, s.gmail, s.result, s.round,
                               d.company_name, d.job_role, d.ctc_lpa
                        FROM student_drive_results s
                        LEFT JOIN drives d ON s.drive_id = d.id
                        WHERE LOWER(s.gmail) = LOWER(:gmail)
                        ORDER BY s.updated_at DESC
                    """), {"gmail": gmail}
                ).mappings().all()
            ]

            status, placed_info = _determine_placement_status(result_rows)
            if status == "At Risk":
                at_risk_count += 1

            coding_data = _build_coding_profiles_dict(s)
            mentee_obj = _build_mentee_obj(s, student_id, name, gmail, dept, status, coding_data)

            if status == "Placed" and placed_info:
                mentee_obj["company"] = placed_info.get("company_name") or ""
                mentee_obj["job_role"] = placed_info.get("job_role") or ""
                mentee_obj["ctc"] = placed_info.get("ctc_lpa") or 0.0
                placed_mentees.append(mentee_obj)

            mentees.append(mentee_obj)

        # Interventions
        interventions_rows = [
            dict(row) for row in session.execute(
                text("""
                    SELECT i.id, i.student_id, i.student_gmail, i.title, i.failure_summary,
                           i.ai_analysis, i.priority, i.status, i.created_at,
                           COALESCE(sr.name, i.student_gmail) as student_name,
                           COALESCE(sr.register_number, '') as register_number
                    FROM interventions i
                    LEFT JOIN students_roster sr ON LOWER(i.student_gmail) = LOWER(sr.email)
                    ORDER BY i.created_at DESC
                """)
            ).mappings().all()
        ]

    total_mentees = len(mentees)
    placed_count = len(placed_mentees)
    placement_rate = round((placed_count / total_mentees * 100), 1) if total_mentees > 0 else 0.0

    return {
        "mentees": mentees,
        "placed_mentees": placed_mentees,
        "interventions": interventions_rows,
        "metrics": {
            "total_mentees": total_mentees,
            "placed_count": placed_count,
            "placement_rate": placement_rate,
            "active_interventions": len(interventions_rows),
            "at_risk_count": at_risk_count
        }
    }


def get_department_dashboard_data(dept_code="CSE"):
    """Retrieve full department overview: students, mentors, placed stats, interventions, and metrics."""
    with session_scope() as session:
        # 1. Mentors
        mentor_entities = session.scalars(
            select(User).where(func.lower(User.role) == "mentor")
        ).all()
        mentors = []
        for m in mentor_entities:
            m_name = m.gmail.split("@")[0].replace(".", " ").title()
            mentee_count = session.scalar(
                select(func.count(MentorStudent.id)).where(MentorStudent.mentor_id == m.uuid)
            ) or 0
            mentors.append({
                "id": m.uuid,
                "name": m_name,
                "email": m.gmail,
                "department": m.department or dept_code,
                "specialization": "Faculty Mentor",
                "assigned_mentees": mentee_count,
                "placed_mentees": 0,
                "active_interventions": 0
            })

        # 2. Students for department
        if dept_code.upper() == "ALL":
            roster_entities = session.scalars(
                select(StudentRoster).order_by(StudentRoster.name.asc())
            ).all()
        else:
            roster_entities = session.scalars(
                select(StudentRoster)
                .where(func.upper(StudentRoster.department) == dept_code.upper())
                .order_by(StudentRoster.name.asc())
            ).all()
        student_rows = [_as_dict(e) for e in roster_entities]

        if not student_rows:
            if dept_code.upper() == "ALL":
                auth_students = session.scalars(
                    select(User).where(func.lower(User.role) == "student")
                ).all()
            else:
                auth_students = session.scalars(
                    select(User).where(
                        func.lower(User.role) == "student",
                        func.upper(User.department) == dept_code.upper()
                    )
                ).all()
            for u in auth_students:
                student_rows.append({
                    "student_id": u.uuid,
                    "register_number": "",
                    "name": (u.gmail or "").split("@")[0].replace(".", " ").title(),
                    "email": u.gmail,
                    "department": u.department or dept_code,
                    "cgpa": None, "tenth_percentage": None, "twelfth_percentage": None,
                    "skills": "", "year": "",
                    "phone": "", "linkedin_url": "", "github_url": "", "portfolio_url": "",
                    "resume_filename": "", "resume_url": "",
                    "leetcode_handle": "", "leetcode_solved_month": 0, "leetcode_total_solved": 0,
                    "codeforces_handle": "", "codeforces_solved_month": 0, "codeforces_rating": 0,
                    "codechef_handle": "", "codechef_solved_month": 0, "codechef_stars": "",
                    "hackerrank_handle": "", "hackerrank_solved_month": 0, "hackerrank_score": 0,
                    "atcoder_handle": "", "atcoder_solved_month": 0, "atcoder_rating": 0,
                    "monthly_total_solved": 0,
                })

        students = []
        placed_students = []
        at_risk_count = 0
        total_ctc_sum = 0
        highest_ctc = 0.0

        for s in student_rows:
            gmail = s["email"]
            student_id = s.get("student_id") or ""
            name = s.get("name") or ""

            result_rows = [
                dict(row) for row in session.execute(
                    text("""
                        SELECT s.id, s.drive_id, s.gmail, s.result, s.round,
                               d.company_name, d.job_role, d.ctc_lpa
                        FROM student_drive_results s
                        LEFT JOIN drives d ON s.drive_id = d.id
                        WHERE LOWER(s.gmail) = LOWER(:gmail)
                        ORDER BY s.updated_at DESC
                    """), {"gmail": gmail}
                ).mappings().all()
            ]

            status, placed_info = _determine_placement_status(result_rows)
            if status == "At Risk":
                at_risk_count += 1

            coding_data = _build_coding_profiles_dict(s)
            student_obj = _build_mentee_obj(s, student_id, name, gmail, s.get("department") or dept_code, status, coding_data)
            student_obj.pop("placement_marks", None)
            student_obj["assigned_mentor"] = mentors[0]["name"] if mentors else "Department Faculty"

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

        # 3. Department interventions
        interventions = [
            dict(row) for row in session.execute(
                text("""
                    SELECT i.id, i.student_id, i.student_gmail, i.title, i.priority, i.status, i.created_at,
                           COALESCE(sr.name, i.student_gmail) as student_name,
                           COALESCE(sr.register_number, '') as register_number,
                           COALESCE(sr.department, :dept) as department
                    FROM interventions i
                    LEFT JOIN students_roster sr ON LOWER(i.student_gmail) = LOWER(sr.email)
                    WHERE UPPER(COALESCE(sr.department, :dept2)) = UPPER(:dept3) OR :dept4 = 'ALL'
                    ORDER BY i.created_at DESC
                """), {"dept": dept_code, "dept2": dept_code, "dept3": dept_code, "dept4": dept_code}
            ).mappings().all()
        ]

    total_students = len(students)
    placed_count = len(placed_students)
    placement_rate = round((placed_count / total_students * 100), 1) if total_students > 0 else 0.0
    avg_ctc = round((total_ctc_sum / placed_count), 2) if placed_count > 0 else 0.0

    return {
        "department": {
            "code": dept_code,
            "name": f"Department of {dept_code}" if dept_code != "CSE" else "Computer Science & Engineering"
        },
        "mentors": mentors,
        "students": students,
        "placed_students": placed_students,
        "interventions": interventions,
        "metrics": {
            "total_students": total_students,
            "placed_count": placed_count,
            "placement_rate": placement_rate,
            "at_risk_count": at_risk_count,
            "total_mentors": len(mentors),
            "avg_ctc": avg_ctc,
            "highest_ctc": highest_ctc
        }
    }

def get_drive(drive_id: str):
    with session_scope() as session:
        drive = session.get(Drive, drive_id)
        if not drive:
            return None
        d = _as_dict(drive)
        d["total_rounds"] = d.get("total_rounds") or 4
        return d


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
    comp_clean = company_name.strip()
    role_clean = job_role.strip()

    with session_scope() as session:
        existing = None
        if drive_id:
            existing = session.get(Drive, drive_id)
        else:
            existing = session.scalars(
                select(Drive).where(
                    func.lower(Drive.company_name) == comp_clean.lower(),
                    func.lower(Drive.job_role) == role_clean.lower(),
                )
            ).first()

        if existing:
            target_id = existing.id
            existing.company_name = comp_clean
            existing.job_role = role_clean
            existing.ctc_lpa = ctc_lpa
            existing.company_type = company_type
            existing.required_cgpa = required_cgpa
            existing.allowed_branches = allowed_branches
            existing.location = location
            existing.total_rounds = total_rounds
            existing.drive_date = drive_date
            existing.status = status
            action = "Updated"
        else:
            slug = f"{comp_clean.lower().replace(' ', '-')}-{role_clean.lower().replace(' ', '-')}-2026"
            slug = "".join(c for c in slug if c.isalnum() or c == '-')
            target_id = slug if len(slug) <= 40 else str(uuid.uuid4())

            session.add(Drive(
                id=target_id,
                company_name=comp_clean,
                job_role=role_clean,
                ctc_lpa=ctc_lpa,
                company_type=company_type,
                required_cgpa=required_cgpa,
                allowed_branches=allowed_branches,
                location=location,
                total_rounds=total_rounds,
                drive_date=drive_date,
                status=status,
            ))
            action = "Created"

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
    email_clean = email.strip().lower()

    with session_scope() as session:
        drive = session.get(Drive, drive_id)
        total_rounds = (drive.total_rounds if drive and drive.total_rounds else 4)

        existing = session.scalars(
            select(StudentDriveResult).where(
                StudentDriveResult.drive_id == drive_id,
                func.lower(StudentDriveResult.gmail) == email_clean,
            )
        ).first()

        if existing and existing.round is not None:
            new_round = existing.round + 1
        else:
            new_round = (base_round or 1) + 1

        if new_round <= total_rounds:
            result_str = f"Shortlisted for Round {new_round}"
        else:
            new_round = total_rounds
            result_str = "Selected"

        if existing:
            existing.round = new_round
            existing.result = result_str
            existing.updated_at = _now()
        else:
            session.add(StudentDriveResult(
                id=str(uuid.uuid4()),
                drive_id=drive_id,
                gmail=email_clean,
                result=result_str,
                round=new_round,
                updated_at=_now(),
            ))

    return {"gmail": email_clean, "round": new_round, "result": result_str, "status": "Promoted"}


def normalize_verdict(raw_verdict: str) -> str:
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

    with session_scope() as session:
        existing = session.scalars(
            select(StudentDriveResult).where(
                StudentDriveResult.drive_id == drive_id,
                func.lower(StudentDriveResult.gmail) == email.strip().lower(),
            )
        ).first()

    eval_round = round_num
    if eval_round is None:
        eval_round = (existing.round if existing and existing.round else None) or (drive.get("current_round") if drive else 1) or 1

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
            target_round = eval_round + 1
            norm_verdict = f"Shortlisted for Round {eval_round + 1}"
        else:
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

    with session_scope() as session:
        existing = session.scalars(
            select(User).where(func.lower(User.gmail) == email_clean)
        ).first()

        if existing:
            final_password = password if password else existing.password
            existing.role = normalized_role
            existing.password = final_password
            action = "Updated"
            user_uuid = existing.uuid
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
            session.add(User(
                uuid=user_uuid,
                gmail=email_clean,
                password=final_password,
                role=normalized_role,
            ))
            action = "Created"

    return {
        "uuid": user_uuid,
        "gmail": email_clean,
        "role": normalized_role,
        "action": action
    }


def upsert_student_roster_record(register_number: str, name: str, email: str, department: str,
                                 cgpa: float, tenth: float = None, twelfth: float = None, skills: str = "", year: str = "4th Year"):
    email_clean = email.strip().lower()
    reg_clean = register_number.strip().upper()

    with session_scope() as session:
        existing = session.scalars(
            select(StudentRoster).where(
                (func.lower(StudentRoster.email) == email_clean) |
                (func.upper(StudentRoster.register_number) == reg_clean)
            )
        ).first()

        if existing:
            existing.name = name.strip()
            existing.register_number = reg_clean
            existing.email = email_clean
            existing.department = department.strip().upper()
            existing.cgpa = cgpa
            existing.tenth_percentage = tenth
            existing.twelfth_percentage = twelfth
            existing.skills = skills.strip()
            if year:
                existing.year = year
            existing.updated_at = _now()
            action = "Updated"
        else:
            session.add(StudentRoster(
                student_id=str(uuid.uuid4()),
                register_number=reg_clean,
                name=name.strip(),
                email=email_clean,
                department=department.strip().upper(),
                cgpa=cgpa,
                tenth_percentage=tenth,
                twelfth_percentage=twelfth,
                skills=skills.strip(),
                year=year or "4th Year",
                updated_at=_now(),
            ))
            action = "Created"

        # Synchronize student auth account
        user_existing = session.scalars(
            select(User).where(func.lower(User.gmail) == email_clean)
        ).first()
        if user_existing:
            user_existing.department = department.strip().upper()
        else:
            session.add(User(
                uuid=str(uuid.uuid4()),
                gmail=email_clean,
                password="student123",
                role="Student",
                department=department.strip().upper(),
            ))

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
    with session_scope() as session:
        rows = session.scalars(
            select(StudentRoster).order_by(StudentRoster.created_at.desc())
        ).all()
        students = []
        for r in rows:
            d = _as_dict(r)
            d["year"] = d.get("year") or "4th Year"
            students.append(d)
        return students


def record_upload_log(upload_type: str, filename: str, total_rows: int, processed_count: int, skipped_count: int, status: str = "SUCCESS"):
    log_id = str(uuid.uuid4())
    with session_scope() as session:
        session.add(UploadLog(
            log_id=log_id,
            upload_type=upload_type,
            filename=filename,
            total_rows=total_rows,
            processed_count=processed_count,
            skipped_count=skipped_count,
            status=status,
        ))
    return log_id


def get_upload_logs():
    with session_scope() as session:
        rows = session.scalars(
            select(UploadLog).order_by(UploadLog.created_at.desc())
        ).all()
        return [_as_dict(r) for r in rows]


def get_coordinator_students_tracking(year: str = None, department: str = None, search: str = None, status: str = None):
    with session_scope() as session:
        # 1. Fetch all roster students
        students_raw = [_as_dict(s) for s in session.scalars(
            select(StudentRoster).order_by(StudentRoster.department.asc(), StudentRoster.register_number.asc())
        ).all()]

        # 2. Fetch all drives for lookup
        drives_list = session.scalars(select(Drive)).all()
        drives_map = {d.id: _as_dict(d) for d in drives_list}

        # 3. Fetch all drive results grouped by lowercase email
        all_results_raw = session.scalars(
            select(StudentDriveResult).order_by(StudentDriveResult.updated_at.desc())
        ).all()
        all_results = [_as_dict(r) for r in all_results_raw]
        results_by_email = {}
        for res in all_results:
            results_by_email.setdefault(res["gmail"].strip().lower(), []).append(res)

        # 4. Fetch all interventions and intervention actions
        all_interventions_raw = session.scalars(
            select(Intervention).order_by(Intervention.updated_at.desc())
        ).all()
        all_interventions = [_as_dict(i) for i in all_interventions_raw]

        all_actions_raw = session.scalars(
            select(InterventionAction).order_by(InterventionAction.created_at.asc())
        ).all()
        all_actions = [_as_dict(a) for a in all_actions_raw]
        actions_by_iv_id = {}
        for act in all_actions:
            act["completed"] = bool(act["completed"])
            actions_by_iv_id.setdefault(act["intervention_id"], []).append(act)

        interventions_by_email = {}
        for iv in all_interventions:
            iv["actions"] = actions_by_iv_id.get(iv["id"], [])
            interventions_by_email.setdefault(iv["student_gmail"].strip().lower(), []).append(iv)

        # 5. Fetch mentor notes
        all_notes_raw = session.scalars(
            select(MentorNote).order_by(MentorNote.created_at.desc())
        ).all()
        all_notes = [_as_dict(n) for n in all_notes_raw]
        notes_by_student_id = {}
        for n in all_notes:
            notes_by_student_id.setdefault(n["student_id"], []).append(n)

    # Process all students (pure Python from here, session closed)
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
            "year": s.get("year") or "4th Year",
            "cgpa": s["cgpa"],
            "tenth_percentage": s.get("tenth_percentage"),
            "twelfth_percentage": s.get("twelfth_percentage"),
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
