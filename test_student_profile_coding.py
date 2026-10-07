import pytest
import io
from fastapi.testclient import TestClient
from app import app
import db

client = TestClient(app)

def setup_module():
    db.init_db()

def test_get_student_profile():
    res = client.get("/api/student/profile?gmail=student@gmail.com")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    profile = data["profile"]
    assert profile["email"].lower() == "student@gmail.com"
    assert "coding_profiles" in profile
    assert "monthly_total_solved" in profile

def test_update_student_profile_and_sum_calculation():
    # Update all 5 coding platform problem counts: 15 + 10 + 8 + 12 + 5 = 50
    update_payload = {
        "gmail": "student@gmail.com",
        "name": "Alex Rivera",
        "phone": "+91 9988776655",
        "department": "CSE",
        "year": "4th Year",
        "cgpa": 8.85,
        "tenth_percentage": 92.5,
        "twelfth_percentage": 90.0,
        "skills": "Python, React, TypeScript, DSA, SQL",
        "linkedin_url": "https://linkedin.com/in/alexrivera",
        "github_url": "https://github.com/alexrivera",
        "portfolio_url": "https://alexrivera.dev",
        "leetcode_handle": "alex_expert",
        "leetcode_solved_month": 15,
        "leetcode_total_solved": 350,
        "codeforces_handle": "alex_cf_master",
        "codeforces_solved_month": 10,
        "codeforces_rating": 1450,
        "codechef_handle": "alex_cc_star",
        "codechef_solved_month": 8,
        "codechef_stars": "4-Star",
        "hackerrank_handle": "alex_hr_gold",
        "hackerrank_solved_month": 12,
        "hackerrank_score": 600,
        "atcoder_handle": "alex_atc_green",
        "atcoder_solved_month": 5,
        "atcoder_rating": 920
    }
    
    put_res = client.put("/api/student/profile", json=update_payload)
    assert put_res.status_code == 200
    put_data = put_res.json()
    assert put_data["success"] is True
    updated = put_data["profile"]
    
    # Verify monthly total solved is exactly 15 + 10 + 8 + 12 + 5 = 50
    assert updated["monthly_total_solved"] == 50
    assert updated["leetcode_handle"] == "alex_expert"
    assert updated["codeforces_handle"] == "alex_cf_master"
    assert updated["codechef_handle"] == "alex_cc_star"
    assert updated["hackerrank_handle"] == "alex_hr_gold"
    assert updated["atcoder_handle"] == "alex_atc_green"
    assert updated["phone"] == "+91 9988776655"
    assert updated["coding_profiles"]["monthly_total_solved"] == 50

def test_resume_upload():
    dummy_pdf = io.BytesIO(b"%PDF-1.4 test resume content")
    upload_res = client.post(
        "/api/student/resume-upload",
        data={"gmail": "student@gmail.com"},
        files={"file": ("My_Latest_Resume.pdf", dummy_pdf, "application/pdf")}
    )
    assert upload_res.status_code == 200
    up_data = upload_res.json()
    assert up_data["success"] is True
    assert "resume_url" in up_data
    assert "/static/uploads/resumes/" in up_data["resume_url"]

    # Verify profile now reflects uploaded resume
    prof_res = client.get("/api/student/profile?gmail=student@gmail.com")
    assert prof_res.status_code == 200
    p = prof_res.json()["profile"]
    assert p["resume_filename"] == "My_Latest_Resume.pdf"
    assert p["resume_url"] == up_data["resume_url"]

def test_coordinator_tracking_visibility():
    res = client.get("/api/coordinator/students-tracking")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    student = next((s for s in data["students"] if s["email"].lower() == "student@gmail.com"), None)
    assert student is not None
    # Coordinator sees coding profiles and monthly total sum
    assert student["monthly_total_solved"] == 50
    assert student["leetcode_handle"] == "alex_expert"
    assert student["codeforces_handle"] == "alex_cf_master"
    assert student["codechef_handle"] == "alex_cc_star"
    assert student["hackerrank_handle"] == "alex_hr_gold"
    assert student["atcoder_handle"] == "alex_atc_green"
    assert "resume_url" in student
    assert student["resume_filename"] == "My_Latest_Resume.pdf"

def test_mentor_dashboard_visibility():
    res = client.get("/api/mentor/demo/mentees")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    mentee = next((m for m in data["mentees"] if m["email"].lower() == "student@gmail.com"), None)
    assert mentee is not None
    assert mentee["monthly_total_solved"] == 50
    assert mentee["leetcode_handle"] == "alex_expert"
    assert mentee["resume_filename"] == "My_Latest_Resume.pdf"

def test_department_dashboard_visibility():
    res = client.get("/api/department/dashboard?dept=CSE")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    student = next((s for s in data["students"] if s["email"].lower() == "student@gmail.com"), None)
    assert student is not None
    assert student["monthly_total_solved"] == 50
    assert student["leetcode_handle"] == "alex_expert"
    assert student["resume_filename"] == "My_Latest_Resume.pdf"
