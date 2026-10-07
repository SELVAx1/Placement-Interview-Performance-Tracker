import io
import csv
import openpyxl
from typing import List, Dict, Tuple, Any

def extract_rows_from_bytes(content: bytes, filename: str) -> List[List[str]]:
    """
    Extracts raw string rows from in-memory Excel or CSV bytes.
    Does NOT write temporary files to disk.
    """
    filename_lower = filename.lower()
    rows = []

    if filename_lower.endswith(".xlsx") or filename_lower.endswith(".xls"):
        try:
            wb = openpyxl.load_workbook(filename=io.BytesIO(content), data_only=True)
            sheet = wb.active
            for row in sheet.iter_rows(values_only=True):
                if any(cell is not None and str(cell).strip() != "" for cell in row):
                    rows.append([str(cell).strip() if cell is not None else "" for cell in row])
        except Exception as e:
            raise ValueError(f"Failed to parse Excel workbook: {str(e)}")
    elif filename_lower.endswith(".csv"):
        try:
            decoded = content.decode("utf-8-sig", errors="ignore")
            reader = csv.reader(io.StringIO(decoded))
            for row in reader:
                if any(cell.strip() != "" for cell in row):
                    rows.append([cell.strip() for cell in row])
        except Exception as e:
            raise ValueError(f"Failed to parse CSV file: {str(e)}")
    else:
        raise ValueError("Unsupported file format. Please upload an .xlsx, .xls, or .csv file.")

    if not rows:
        raise ValueError("The uploaded spreadsheet contains no data or is empty.")

    return rows


def find_column_index(header: List[str], aliases: List[str]) -> int:
    """Finds index of the first header column matching any alias."""
    header_clean = [h.strip().lower().replace("_", " ").replace("-", " ") for h in header]
    for idx, col in enumerate(header_clean):
        for alias in aliases:
            if col == alias.lower():
                return idx
    # Partial match fallback
    for idx, col in enumerate(header_clean):
        for alias in aliases:
            if alias.lower() in col:
                return idx
    return -1


def normalize_verdict(raw_verdict: str) -> str:
    """
    Normalizes human-entered verdict / status strings into standard system values:
    'Selected', 'Rejected', 'Shortlisted', 'In Progress', etc.
    Correctly recognizes typos like 'selecte', 'seleted', 'select', etc.
    """
    if not raw_verdict:
        return "Selected"
    v = str(raw_verdict).strip()
    v_lower = v.lower()

    # Rejection checks first to catch negative qualifiers:
    # "not selected", "not select", "unselected", "rejected", "failed", "eliminated"
    if any(k in v_lower for k in [
        "not select", "not-select", "unselect", "reject", "fail", "eliminated", "disqualif", "dropped", "absent"
    ]):
        return "Rejected"

    # Specific round shortlists: e.g. "Shortlisted for Round 2", "Selected for Round 3"
    import re
    m_r = re.search(r'round\s*(\d+)', v_lower)
    if m_r and ("shortlist" in v_lower or "for round" in v_lower):
        return f"Shortlisted for Round {m_r.group(1)}"

    # Selection / cleared / placed keywords:
    # "selecte", "select", "selected", "seleted", "selcted", "selecting", "selection",
    # "placed", "hired", "offer", "offered", "passed", "pass", "cleared", "clear", "qualif"
    if any(k in v_lower for k in [
        "selecte", "select", "selet", "selct", "placed", "hired", "offer", "cleared", "passed", "pass", "clear", "qualif"
    ]):
        return "Selected"

    if "shortlist" in v_lower:
        return "Shortlisted"

    if any(k in v_lower for k in ["hold", "waiting", "pending"]):
        return "On Hold"

    return v.capitalize()


# ==============================================================
# 1. PARSER FOR DRIVE SHORTLIST / RESULTS
# ==============================================================

def parse_drive_records(content: bytes, filename: str) -> Tuple[List[Dict[str, Any]], int, bool]:
    """
    Parses candidate records for a placement drive.
    Detects whether this is Shortlist Mode (email only) or Verdict Mode (email + status/result).
    Returns (records, skipped_count, is_verdict_mode).
    """
    import re
    rows = extract_rows_from_bytes(content, filename)
    header = rows[0]

    email_idx = find_column_index(header, [
        "gmail", "email", "student email", "student gmail", "mail", "gmail id", "email id", "student email id"
    ])
    result_idx = find_column_index(header, [
        "result", "status", "round result", "verdict", "drive status", "selection", "outcome", "shortlist status",
        "result status / verdict", "result / status", "selection verdict / status", "selection verdict",
        "decision", "final verdict", "cleared", "selected", "placement status", "result status"
    ])
    round_idx = find_column_index(header, [
        "round", "round number", "round no", "current round", "stage", "round cleared", "interview round"
    ])
    score_idx = find_column_index(header, [
        "score", "marks", "test score", "round score"
    ])
    feedback_idx = find_column_index(header, [
        "feedback", "comments", "remarks", "interviewer feedback", "review"
    ])
    weakness_idx = find_column_index(header, [
        "weakness area", "weakness", "weakness_area", "improvement area", "gap area", "gap", "areas of improvement"
    ])
    rejection_idx = find_column_index(header, [
        "rejection reason", "reason", "rejection", "failure reason", "elimination reason"
    ])

    if email_idx == -1:
        found_cols = ", ".join([f"'{c}'" for c in header if c])
        raise ValueError(f"Could not find an 'email' or 'gmail' column in spreadsheet. Found columns: {found_cols}")

    is_verdict_mode = (result_idx != -1)
    records = []
    skipped_count = 0

    for row in rows[1:]:
        if len(row) <= email_idx:
            skipped_count += 1
            continue

        email = row[email_idx].strip()
        if not email or "@" not in email:
            skipped_count += 1
            continue

        item = {"email": email}

        if is_verdict_mode and len(row) > result_idx and row[result_idx].strip():
            raw_v = row[result_idx].strip()
            item["verdict"] = normalize_verdict(raw_v)
            item["raw_verdict"] = raw_v
        else:
            item["verdict"] = None
            item["raw_verdict"] = None

        # Optional round - handles integers, floats, or strings like "Round 2", "R2", "2nd Round"
        if round_idx != -1 and len(row) > round_idx and row[round_idx].strip():
            val = row[round_idx].strip()
            try:
                item["round"] = int(float(val))
            except ValueError:
                m = re.search(r'(\d+)', val)
                if m:
                    item["round"] = int(m.group(1))
                else:
                    item["round"] = None
        else:
            item["round"] = None

        # If round wasn't in round column, check if verdict mentions round number (e.g. "Round 2")
        if item["round"] is None and (item.get("raw_verdict") or item.get("verdict")):
            m_v = re.search(r'round\s*(\d+)', item.get("raw_verdict") or item["verdict"], re.I)
            if m_v:
                item["round"] = int(m_v.group(1))

        # Optional score
        if score_idx != -1 and len(row) > score_idx and row[score_idx].strip():
            try:
                item["score"] = float(row[score_idx].strip())
            except ValueError:
                item["score"] = None
        else:
            item["score"] = None

        # Optional feedback
        if feedback_idx != -1 and len(row) > feedback_idx and row[feedback_idx].strip():
            item["feedback"] = row[feedback_idx].strip()
        else:
            item["feedback"] = None

        # Optional weakness area
        if weakness_idx != -1 and len(row) > weakness_idx and row[weakness_idx].strip():
            item["weakness_area"] = row[weakness_idx].strip()
        else:
            item["weakness_area"] = None

        # Optional rejection reason
        if rejection_idx != -1 and len(row) > rejection_idx and row[rejection_idx].strip():
            item["rejection_reason"] = row[rejection_idx].strip()
        else:
            item["rejection_reason"] = None

        records.append(item)

    return records, skipped_count, is_verdict_mode



# ==============================================================
# 2. PARSER FOR USER ACCESS / ACCOUNTS
# ==============================================================

def parse_user_access_records(content: bytes, filename: str, default_role: str = "Student") -> Tuple[List[Dict[str, str]], int]:
    """
    Parses user accounts roster.
    Extracts email, role (or fallback default), and optional password.
    Returns (records, skipped_count).
    """
    rows = extract_rows_from_bytes(content, filename)
    header = rows[0]

    email_idx = find_column_index(header, [
        "gmail", "email", "user email", "student email", "mail", "gmail id", "email id"
    ])
    role_idx = find_column_index(header, [
        "role", "user role", "account role", "access role", "type", "user type"
    ])
    password_idx = find_column_index(header, [
        "password", "pwd", "pass", "user password", "account password", "initial password"
    ])

    if email_idx == -1:
        found_cols = ", ".join([f"'{c}'" for c in header if c])
        raise ValueError(f"Could not find an 'email' or 'gmail' column in spreadsheet. Found columns: {found_cols}")

    records = []
    skipped_count = 0

    for row in rows[1:]:
        if len(row) <= email_idx:
            skipped_count += 1
            continue

        email = row[email_idx].strip()
        if not email or "@" not in email:
            skipped_count += 1
            continue

        role = row[role_idx].strip() if (role_idx != -1 and len(row) > role_idx and row[role_idx].strip()) else default_role
        password = row[password_idx].strip() if (password_idx != -1 and len(row) > password_idx and row[password_idx].strip()) else None

        records.append({
            "email": email,
            "role": role,
            "password": password
        })

    return records, skipped_count


# ==============================================================
# 3. PARSER FOR STUDENT ROSTER (ACADEMIC PROFILES)
# ==============================================================

def parse_student_roster_records(content: bytes, filename: str) -> Tuple[List[Dict[str, Any]], int]:
    """
    Parses academic profiles.
    Extracts register_number, name, email, department, cgpa, 10th%, 12th%, skills.
    Returns (records, skipped_count).
    """
    rows = extract_rows_from_bytes(content, filename)
    header = rows[0]

    reg_idx = find_column_index(header, ["register number", "reg no", "register no", "roll no", "student id", "reg_no"])
    name_idx = find_column_index(header, ["name", "student name", "full name", "candidate name"])
    email_idx = find_column_index(header, ["email", "gmail", "student email", "mail"])
    dept_idx = find_column_index(header, ["department", "dept", "branch", "stream"])
    cgpa_idx = find_column_index(header, ["cgpa", "gpa", "overall cgpa"])
    tenth_idx = find_column_index(header, ["tenth percentage", "10th", "10th percentage", "tenth", "10th %", "tenth %", "sslc"])
    twelfth_idx = find_column_index(header, ["twelfth percentage", "12th", "12th percentage", "twelfth", "12th %", "twelfth %", "hsc", "diploma"])
    skills_idx = find_column_index(header, ["skills", "technical skills", "skillset", "key skills"])
    year_idx = find_column_index(header, ["academic year", "year", "current year", "batch", "batch year"])

    missing = []
    if reg_idx == -1: missing.append("Register Number")
    if name_idx == -1: missing.append("Name")
    if email_idx == -1: missing.append("Email")
    if dept_idx == -1: missing.append("Department")
    if cgpa_idx == -1: missing.append("CGPA")

    if missing:
        found_cols = ", ".join([f"'{c}'" for c in header if c])
        raise ValueError(f"Missing required columns: {', '.join(missing)}. Found columns: {found_cols}")

    records = []
    skipped_count = 0

    for row in rows[1:]:
        if len(row) <= max(reg_idx, name_idx, email_idx, dept_idx, cgpa_idx):
            skipped_count += 1
            continue

        reg = row[reg_idx].strip()
        name = row[name_idx].strip()
        email = row[email_idx].strip()
        dept = row[dept_idx].strip()
        cgpa_str = row[cgpa_idx].strip()

        if not reg or not name or not email or "@" not in email or not cgpa_str:
            skipped_count += 1
            continue

        try:
            cgpa = float(cgpa_str)
        except ValueError:
            skipped_count += 1
            continue

        tenth = None
        if tenth_idx != -1 and len(row) > tenth_idx and row[tenth_idx].strip():
            try: tenth = float(row[tenth_idx].strip())
            except ValueError: tenth = None

        twelfth = None
        if twelfth_idx != -1 and len(row) > twelfth_idx and row[twelfth_idx].strip():
            try: twelfth = float(row[twelfth_idx].strip())
            except ValueError: twelfth = None

        skills = row[skills_idx].strip() if (skills_idx != -1 and len(row) > skills_idx) else ""

        year_val = ""
        if year_idx != -1 and len(row) > year_idx and row[year_idx].strip():
            year_val = row[year_idx].strip()
        if not year_val:
            if "2021" in reg or reg.startswith("21"):
                year_val = "4th Year"
            elif "2022" in reg or reg.startswith("22"):
                year_val = "3rd Year"
            elif "2023" in reg or reg.startswith("23"):
                year_val = "2nd Year"
            elif "2024" in reg or reg.startswith("24"):
                year_val = "1st Year"
            else:
                year_val = "4th Year"

        records.append({
            "register_number": reg,
            "name": name,
            "email": email,
            "department": dept,
            "cgpa": cgpa,
            "tenth_percentage": tenth,
            "twelfth_percentage": twelfth,
            "skills": skills,
            "year": year_val
        })

    return records, skipped_count


# ==============================================================
# 4. PARSER FOR COMPANY DRIVES
# ==============================================================

def parse_company_drives_records(content: bytes, filename: str) -> Tuple[List[Dict[str, Any]], int]:
    """
    Parses company placement drive schedules and job postings.
    Extracts company_name, job_role, ctc_lpa, company_type, required_cgpa,
    allowed_branches, total_rounds, location, drive_date, status.
    Returns (records, skipped_count).
    """
    rows = extract_rows_from_bytes(content, filename)
    header = rows[0]

    comp_idx = find_column_index(header, ["company name", "company", "organization", "employer", "firm"])
    role_idx = find_column_index(header, ["job role", "role", "designation", "job title", "profile", "position"])
    ctc_idx = find_column_index(header, ["ctc lpa", "ctc", "package lpa", "package", "salary", "lpa"])
    type_idx = find_column_index(header, ["company type", "type", "category", "sector"])
    cgpa_idx = find_column_index(header, ["required cgpa", "min cgpa", "cgpa cutoff", "cutoff cgpa", "minimum cgpa", "cgpa"])
    branches_idx = find_column_index(header, ["allowed branches", "eligible branches", "branches", "departments", "eligible departments"])
    rounds_idx = find_column_index(header, ["total rounds", "rounds", "no of rounds", "round count"])
    loc_idx = find_column_index(header, ["location", "job location", "work location", "venue"])
    date_idx = find_column_index(header, ["drive date", "date", "event date", "schedule date", "placement date", "deadline"])
    status_idx = find_column_index(header, ["status", "drive status", "state"])

    missing = []
    if comp_idx == -1: missing.append("Company Name")
    if role_idx == -1: missing.append("Job Role")
    if ctc_idx == -1: missing.append("CTC LPA")

    if missing:
        found_cols = ", ".join([f"'{c}'" for c in header if c])
        raise ValueError(f"Missing required columns for Drive upload: {', '.join(missing)}. Found columns: {found_cols}")

    records = []
    skipped_count = 0

    for row in rows[1:]:
        if len(row) <= max(comp_idx, role_idx, ctc_idx):
            skipped_count += 1
            continue

        comp_name = row[comp_idx].strip()
        job_role = row[role_idx].strip()
        ctc_str = row[ctc_idx].strip()

        if not comp_name or not job_role or not ctc_str:
            skipped_count += 1
            continue

        try:
            ctc_lpa = float(ctc_str)
        except ValueError:
            skipped_count += 1
            continue

        # Company type
        comp_type = "PRODUCT"
        if type_idx != -1 and len(row) > type_idx and row[type_idx].strip():
            raw_type = row[type_idx].strip().upper()
            if "SERVICE" in raw_type: comp_type = "SERVICE"
            elif "STARTUP" in raw_type: comp_type = "STARTUP"
            elif "CONSULT" in raw_type: comp_type = "CONSULTING"
            else: comp_type = "PRODUCT"

        # Required CGPA
        req_cgpa = 0.0
        if cgpa_idx != -1 and len(row) > cgpa_idx and row[cgpa_idx].strip():
            try: req_cgpa = float(row[cgpa_idx].strip())
            except ValueError: req_cgpa = 0.0

        # Allowed branches
        allowed_branches = "All"
        if branches_idx != -1 and len(row) > branches_idx and row[branches_idx].strip():
            allowed_branches = row[branches_idx].strip()

        # Total rounds
        total_rounds = 4
        if rounds_idx != -1 and len(row) > rounds_idx and row[rounds_idx].strip():
            try: total_rounds = int(float(row[rounds_idx].strip()))
            except ValueError: total_rounds = 4

        # Location
        location = "On Campus"
        if loc_idx != -1 and len(row) > loc_idx and row[loc_idx].strip():
            location = row[loc_idx].strip()

        # Drive date
        drive_date = None
        if date_idx != -1 and len(row) > date_idx and row[date_idx].strip():
            drive_date = row[date_idx].strip()

        # Status
        status = "Active"
        if status_idx != -1 and len(row) > status_idx and row[status_idx].strip():
            status = row[status_idx].strip().title()

        records.append({
            "company_name": comp_name,
            "job_role": job_role,
            "ctc_lpa": ctc_lpa,
            "company_type": comp_type,
            "required_cgpa": req_cgpa,
            "allowed_branches": allowed_branches,
            "total_rounds": total_rounds,
            "location": location,
            "drive_date": drive_date,
            "status": status
        })

    return records, skipped_count

