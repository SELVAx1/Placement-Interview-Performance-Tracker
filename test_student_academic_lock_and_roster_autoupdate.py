import io
import openpyxl
import pytest
from fastapi.testclient import TestClient
from app import app
import db

client = TestClient(app)

def setup_module():
    db.init_db()

def test_student_cannot_modify_cgpa_email_or_department():
    """
    Ensure student PUT /api/student/profile cannot alter official academic
    or institutional fields (CGPA, 10th %, 12th %, department, email).
    """
    # 1. Seed or initialize a student in roster
    initial_res = db.upsert_student_roster_record(
        register_number="2026TEST01",
        name="Rohit Sharma",
        email="rohit.sharma@college.edu",
        department="ECE",
        cgpa=7.40,
        tenth=85.0,
        twelfth=82.0,
        skills="C++, Embedded",
        year="4th Year"
    )
    assert initial_res["cgpa"] == 7.40
    assert initial_res["department"] == "ECE"

    # 2. Student attempts to update profile, trying to forge CGPA=9.99 and Department='CSE'
    tamper_payload = {
        "gmail": "rohit.sharma@college.edu",
        "name": "Rohit Sharma",
        "phone": "+91 9123456780",
        "department": "CSE",  # Tampered
        "cgpa": 9.99,         # Tampered
        "tenth_percentage": 99.0, # Tampered
        "twelfth_percentage": 98.0, # Tampered
        "year": "4th Year",
        "linkedin_url": "https://linkedin.com/in/rohitsharma",
        "github_url": "https://github.com/rohitsharma",
        "leetcode_handle": "rohit_hitman",
        "leetcode_solved_month": 22,
        "leetcode_total_solved": 150
    }

    put_res = client.put("/api/student/profile", json=tamper_payload)
    assert put_res.status_code == 200, f"Profile update failed: {put_res.text}"
    put_data = put_res.json()
    assert put_data["success"] is True
    updated = put_data["profile"]

    # Verify official fields were NOT changed by the student!
    assert updated["cgpa"] == 7.40, f"Security Breach: Student altered CGPA to {updated['cgpa']}"
    assert updated["department"] == "ECE", f"Security Breach: Student altered Department to {updated['department']}"
    assert updated["tenth_percentage"] == 85.0
    assert updated["twelfth_percentage"] == 82.0
    assert updated["email"] == "rohit.sharma@college.edu"

    # Verify student's valid personal & coding fields WERE updated
    assert updated["phone"] == "+91 9123456780"
    assert updated["leetcode_handle"] == "rohit_hitman"
    assert updated["monthly_total_solved"] == 22


def test_coordinator_excel_import_autoupdates_student_details():
    """
    Ensure that when Placement Coordinator uploads an updated Excel roster,
    the student's official academic details (CGPA, marks, department) are auto-updated,
    while personal contact and coding activity remain intact.
    """
    # Create an updated Excel roster sheet for Rohit Sharma with revised CGPA 9.15 and Dept 'ECE'
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Student Roster"
    ws.append([
        "Register Number", "Full Name", "Student Email", "Department",
        "CGPA", "10th Percentage", "12th Percentage", "Technical Skills"
    ])
    ws.append([
        "2026TEST01", "Rohit Sharma", "rohit.sharma@college.edu", "AI & DS",
        9.15, 88.5, 89.0, "Python, Machine Learning, Deep Learning"
    ])

    excel_file = io.BytesIO()
    wb.save(excel_file)
    excel_file.seek(0)

    # Coordinator uploads the revised roster
    upload_res = client.post(
        "/api/upload/student-roster",
        files={"file": ("updated_roster.xlsx", excel_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    assert upload_res.status_code == 200, f"Upload failed: {upload_res.text}"
    u_data = upload_res.json()
    assert u_data["success"] is True
    assert u_data["imported_count"] == 1
    assert u_data["updated_count"] == 1
    assert u_data["created_count"] == 0

    # Verify student's profile now immediately reflects the coordinator's updated CGPA and department
    get_res = client.get("/api/student/profile?gmail=rohit.sharma@college.edu")
    assert get_res.status_code == 200
    p = get_res.json()["profile"]

    assert p["cgpa"] == 9.15, f"Expected auto-updated CGPA 9.15, got {p['cgpa']}"
    assert p["department"] == "AI & DS", f"Expected auto-updated Department 'AI & DS', got {p['department']}"
    assert p["tenth_percentage"] == 88.5
    assert p["twelfth_percentage"] == 89.0
    assert "Machine Learning" in p["skills"]

    # Student's previously saved personal contact and competitive coding data must remain intact!
    assert p["phone"] == "+91 9123456780"
    assert p["leetcode_handle"] == "rohit_hitman"
    assert p["monthly_total_solved"] == 22


def test_coordinator_students_tracking_reflects_updated_cgpa():
    """
    Ensure the Placement Coordinator's student tracking dashboard
    immediately displays the auto-updated CGPA and department.
    """
    tracking_res = client.get("/api/coordinator/students-tracking?search=rohit")
    assert tracking_res.status_code == 200
    t_data = tracking_res.json()
    assert t_data["success"] is True
    matching = [s for s in t_data.get("students", []) if s.get("email") == "rohit.sharma@college.edu"]
    assert len(matching) == 1
    student = matching[0]
    assert student["cgpa"] == 9.15
    assert student["department"] == "AI & DS"
