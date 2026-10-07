import os
import uuid

import db
import intervention_service
import bulk_upload_module.exporter as bulk_exporter
from bulk_upload_module.config import TEMPLATES_DIR
from fastapi import File, Form, Header, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse

from backend.schemas import (
    AddActionRequest,
    CustomInterventionRequest,
    InterventionActionRequest,
    InterventionGenerateRequest,
    InterventionStatusRequest,
    MentorNoteRequest,
    MentorNoteUpdateRequest,
    StudentApplyRequest,
    StudentProfileUpdateRequest,
)


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

def list_sample_templates():
    return {"success": True, "templates": [
        {"name": "sample_drive_shortlist", "title": "Drive Shortlist Template (Emails Only)", "description": "Upload candidate emails to automatically advance them to the next interview round.", "formats": ["sample_drive_shortlist.xlsx", "sample_drive_shortlist.csv"], "required_columns": ["Student Gmail / Email"], "optional_columns": ["Student Name", "Branch"], "mode": "Shortlist Mode (Auto-increments round by +1)"},
        {"name": "sample_drive_results", "title": "Drive Results / Verdicts Template", "description": "Upload candidate evaluations with explicit statuses (Selected, Rejected, On Hold) and scores.", "formats": ["sample_drive_results.xlsx", "sample_drive_results.csv"], "required_columns": ["Student Gmail / Email", "Result Status / Verdict"], "optional_columns": ["Round", "Score", "Student Name"], "mode": "Verdict Mode (Sets exact status)"},
        {"name": "sample_user_access", "title": "User Accounts & Role Provisioning Template", "description": "Bulk create or update accounts for Students, Mentors, Coordinators, and Recruiters.", "formats": ["sample_user_access.xlsx", "sample_user_access.csv"], "required_columns": ["User Email"], "optional_columns": ["Role (Student, Mentor, etc.)", "Password"], "mode": "Role Access Mode"},
        {"name": "sample_student_roster", "title": "Student Academic Profiles Template", "description": "Bulk import academic records, CGPA, 10th/12th percentages, and technical skills.", "formats": ["sample_student_roster.xlsx", "sample_student_roster.csv"], "required_columns": ["Register Number", "Full Name", "Student Email", "Department", "CGPA"], "optional_columns": ["10th Percentage", "12th Percentage", "Technical Skills"], "mode": "Academic Roster Mode"},
        {"name": "sample_company_drives", "title": "Company Placement Drives Template", "description": "Bulk schedule on-campus placement drives with company type, CTC LPA, eligibility criteria, and rounds.", "formats": ["sample_company_drives.xlsx", "sample_company_drives.csv"], "required_columns": ["Company Name", "Job Role", "CTC LPA"], "optional_columns": ["Company Type", "Required CGPA", "Allowed Branches", "Total Rounds", "Location", "Drive Date", "Status"], "mode": "Company Drive Scheduling Mode"},
    ]}


def download_template(filename: str):
    filepath = os.path.join(TEMPLATES_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"Template file '{filename}' was not found. Call /api/templates to see available files.")
    mime_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if filename.endswith(".xlsx") else "text/csv"
    return FileResponse(filepath, media_type=mime_type, filename=filename)


# ---------------------------------------------------------------------------
# General lists & exports
# ---------------------------------------------------------------------------

def list_students():
    students = db.get_all_student_roster()
    return {"success": True, "count": len(students), "students": students}


def list_upload_logs():
    logs = db.get_upload_logs()
    return {"success": True, "count": len(logs), "logs": logs}


def export_company_drives(format: str = "xlsx"):
    return bulk_exporter.export_company_drives_data(db.get_all_drives(), format_type=format)


def export_drive_results(drive_id: str, format: str = "xlsx"):
    drive = db.get_drive(drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail=f"Drive with ID '{drive_id}' was not found.")
    return bulk_exporter.export_drive_results_data(db.get_drive_results(drive_id), drive_info=drive, format_type=format)


def export_student_roster(format: str = "xlsx"):
    return bulk_exporter.export_student_roster_data(db.get_all_student_roster(), format_type=format)


def export_user_access(format: str = "xlsx"):
    return bulk_exporter.export_user_access_data(db.get_all_users(), format_type=format)


# ---------------------------------------------------------------------------
# Student profile & results
# ---------------------------------------------------------------------------

def get_student_profile(gmail: str):
    profile = db.get_student_profile_by_email(gmail)
    if not profile:
        email_clean = gmail.strip().lower()
        profile = {
            "student_id": "",
            "register_number": "",
            "name": email_clean.split("@")[0].replace(".", " ").title(),
            "email": email_clean,
            "department": "",
            "cgpa": None,
            "tenth_percentage": None,
            "twelfth_percentage": None,
            "skills": "",
            "skills_list": [],
            "monthly_total_solved": 0,
            "coding_profiles": {
                "monthly_total_solved": 0,
                "leetcode": {"handle": "", "solved_month": 0, "total_solved": 0},
                "codeforces": {"handle": "", "solved_month": 0, "rating": 0},
                "codechef": {"handle": "", "solved_month": 0, "stars": ""},
                "hackerrank": {"handle": "", "solved_month": 0, "score": 0},
                "atcoder": {"handle": "", "solved_month": 0, "rating": 0},
            },
        }
    return {"success": True, "profile": profile}


def update_student_profile(profile_data: StudentProfileUpdateRequest):
    if not profile_data.gmail or not profile_data.gmail.strip():
        raise HTTPException(status_code=400, detail="Student email is required.")
    update_dict = {k: v for k, v in profile_data.dict().items() if v is not None}
    for field in ("cgpa", "tenth_percentage", "twelfth_percentage", "department", "register_number", "email", "gmail"):
        update_dict.pop(field, None)
    updated_profile = db.update_student_profile(profile_data.gmail, update_dict, is_student=True)
    if not updated_profile:
        raise HTTPException(status_code=500, detail="Failed to update student profile.")
    return {"success": True, "message": "Student profile updated successfully.", "profile": updated_profile}


def get_student_results(gmail: str):
    return {"success": True, "results": db.get_student_drive_results(gmail)}


def get_student_applications(gmail: str):
    results = db.get_student_drive_results(gmail)
    apps = []
    for r in results:
        apps.append({
            "registration_id": r["id"],
            "drive_id": r["drive_id"],
            "company_name": r.get("company_name", "Drive"),
            "job_role": r.get("job_role", "Role"),
            "ctc_lpa": r.get("ctc_lpa", 10.0),
            "final_status": "REGISTERED" if "Shortlisted" in r.get("result", "") else r.get("result", "REGISTERED"),
            "registered_at": r.get("updated_at", ""),
        })
    return {"success": True, "applications": apps}


def apply_student_drive(request: StudentApplyRequest):
    res = db.register_student_for_drive(request.drive_id, request.gmail)
    return {"success": True, "message": "Successfully applied for drive. You are enrolled to appear in Round 1.", "registration": res}


def get_student_analysis(gmail: str):
    results = db.get_student_drive_results(gmail)
    patterns = intervention_service.analyse_student_patterns(results)
    failed_rounds = patterns["failed_by_round"]
    return {
        "success": True,
        "pass_rate": patterns["pass_rate"],
        "total_drives_applied": len({r["drive_id"] for r in results}),
        "total_rounds_attempted": patterns["total_rounds"],
        "rounds_passed": patterns["passed_rounds"],
        "rounds_failed": patterns["failed_rounds"],
        "most_failed_round": max(failed_rounds, key=failed_rounds.get) if failed_rounds else None,
        "top_weaknesses": patterns["top_weaknesses"],
        "risk_level": patterns["risk_level"],
    }


async def upload_student_resume(file: UploadFile = File(...), gmail: str = Form("student@gmail.com")):
    filename = file.filename.lower()
    if not (filename.endswith(".pdf") or filename.endswith(".doc") or filename.endswith(".docx")):
        return JSONResponse(status_code=400, content={"success": False, "message": "Only PDF and Word documents are allowed."})
    resumes_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "uploads", "resumes")
    os.makedirs(resumes_dir, exist_ok=True)
    clean_base = os.path.basename(file.filename).replace(" ", "_")
    dest_path = os.path.join(resumes_dir, clean_base)
    contents = await file.read()
    with open(dest_path, "wb") as f:
        f.write(contents)
    resume_url = f"/static/uploads/resumes/{clean_base}"
    db.update_student_profile(gmail, {"resume_filename": file.filename, "resume_url": resume_url})
    return {"success": True, "message": "Resume uploaded successfully.", "resume_path": file.filename, "resume_filename": file.filename, "resume_url": resume_url}


# ---------------------------------------------------------------------------
# Auth / scope helpers
# ---------------------------------------------------------------------------

def _requester(user_id, role, department):
    if not user_id:
        raise HTTPException(status_code=401, detail="X-User-Id is required")
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Unknown user")
    if role and role.strip().lower() != user["role"].strip().lower():
        raise HTTPException(status_code=403, detail="User role does not match the authenticated account")
    user["department"] = department or user.get("department") or "CSE"
    return user


def _scoped_student(user, student_id=None, gmail=None):
    role = (user.get("role") or "").strip().lower()
    is_coord = role in {"coordinator", "admin"}

    students = db.get_students_for_scope(user["uuid"], user["role"], user.get("department"))
    target = None
    clean_id = (student_id or "").strip()
    clean_gmail = (gmail or "").strip().lower()

    for student in students:
        s_uuid = str(student.get("uuid") or "").strip()
        s_auth_uuid = str(student.get("auth_uuid") or "").strip()
        s_student_id = str(student.get("student_id") or "").strip()
        s_gmail = (student.get("gmail") or student.get("email") or "").strip().lower()
        if (clean_id and clean_id in {s_uuid, s_auth_uuid, s_student_id}) or (clean_gmail and s_gmail == clean_gmail):
            target = student
            break

    if not target and is_coord:
        if clean_gmail:
            p = db.get_student_profile_by_email(clean_gmail)
            if p:
                return {"uuid": p.get("student_id"), "student_id": p.get("student_id"), "gmail": p["email"], "department": p.get("department", "CSE"), "role": "student", "name": p.get("name", "")}
        if clean_id:
            p = db.get_student_profile_by_email(clean_id)
            if p:
                return {"uuid": p.get("student_id"), "student_id": p.get("student_id"), "gmail": p["email"], "department": p.get("department", "CSE"), "role": "student", "name": p.get("name", "")}

    if not target:
        raise HTTPException(status_code=403, detail="You are not allowed to access this student")
    return target


def _visible_interventions(user):
    role = (user.get("role") or "").strip().lower()
    if role in {"coordinator", "admin"}:
        return db.get_interventions()
    students = db.get_students_for_scope(user["uuid"], user["role"], user.get("department"))
    return db.get_interventions(student_gmails=[student["gmail"] for student in students])


# ---------------------------------------------------------------------------
# Interventions
# ---------------------------------------------------------------------------

def list_interventions(x_user_id: str = Header(None), x_user_role: str = Header(None), x_department: str = Header(None)):
    return {"success": True, "interventions": _visible_interventions(_requester(x_user_id, x_user_role, x_department))}


def list_intervention_students(x_user_id: str = Header(None), x_user_role: str = Header(None), x_department: str = Header(None)):
    user = _requester(x_user_id, x_user_role, x_department)
    students = db.get_students_for_scope(user["uuid"], user["role"], user.get("department"))
    by_gmail = {}
    for iv in _visible_interventions(user):
        by_gmail.setdefault(iv["student_gmail"].lower(), []).append(iv)
    for student in students:
        student["interventions"] = by_gmail.get(student["gmail"].lower(), [])[:3]
        student["intervention_count"] = len(student["interventions"])
    return {"success": True, "students": students}


def get_student_interventions(student_id: str, x_user_id: str = Header(None), x_user_role: str = Header(None), x_department: str = Header(None)):
    user = _requester(x_user_id, x_user_role, x_department)
    student = _scoped_student(user, student_id=student_id)
    return {
        "success": True,
        "student": student,
        "interventions": db.get_interventions(student_gmail=student["gmail"]),
        "analysis": intervention_service.analyse_student_patterns(db.get_student_analysis_records(student["gmail"])),
    }


def generate_intervention(request: InterventionGenerateRequest, x_user_id: str = Header(None), x_user_role: str = Header(None), x_department: str = Header(None)):
    user = _requester(x_user_id, x_user_role, x_department)
    if user["role"].strip().lower() == "student":
        raise HTTPException(status_code=403, detail="Students cannot generate interventions")
    if not request.student_id and not request.gmail:
        raise HTTPException(status_code=400, detail="student_id or gmail is required")
    student = _scoped_student(user, request.student_id, request.gmail)
    records = db.get_student_analysis_records(student["gmail"])
    patterns = intervention_service.analyse_student_patterns(records)
    previous = db.get_interventions(student_gmail=student["gmail"])
    previous_actions = [action for item in previous for action in item.get("actions", [])]
    intervention, actions = intervention_service.build_intervention(student, patterns, previous_actions, user["uuid"])
    saved = db.save_intervention(intervention, actions)
    return {"success": True, "intervention": saved, "analysis": patterns}


def generate_all_interventions(x_user_id: str = Header(None), x_user_role: str = Header(None), x_department: str = Header(None)):
    user = _requester(x_user_id, x_user_role, x_department)
    if user["role"].strip().lower() == "student":
        raise HTTPException(status_code=403, detail="Students cannot generate interventions")
    generated, failures = [], []
    for student in db.get_students_for_scope(user["uuid"], user["role"], user.get("department")):
        try:
            records = db.get_student_analysis_records(student["gmail"])
            patterns = intervention_service.analyse_student_patterns(records)
            previous = db.get_interventions(student_gmail=student["gmail"])
            previous_actions = [action for item in previous for action in item.get("actions", [])]
            intervention, actions = intervention_service.build_intervention(student, patterns, previous_actions, user["uuid"])
            generated.append(db.save_intervention(intervention, actions))
        except Exception as exc:
            failures.append({"student_id": student.get("uuid"), "gmail": student.get("gmail"), "error": str(exc)})
    return {"success": len(failures) == 0, "generated": generated, "failures": failures}


def create_custom_intervention(request: CustomInterventionRequest, x_user_id: str = Header(None), x_user_role: str = Header(None), x_department: str = Header(None)):
    user = _requester(x_user_id, x_user_role, x_department)
    if user["role"].strip().lower() == "student":
        raise HTTPException(status_code=403, detail="Students cannot create interventions")
    if not request.student_id and not request.gmail:
        raise HTTPException(status_code=400, detail="student_id or gmail is required")
    student = _scoped_student(user, request.student_id, request.gmail)
    s_id = student.get("uuid") or student.get("student_id") or str(uuid.uuid4())
    s_gmail = (student.get("gmail") or student.get("email") or "").strip().lower()
    created = db.create_custom_intervention(
        student_id=s_id,
        student_gmail=s_gmail,
        title=request.title,
        failure_summary=request.failure_summary,
        ai_analysis=request.ai_analysis,
        priority=request.priority,
        created_by=user.get("gmail", "coordinator@gmail.com"),
        actions=request.actions,
    )
    return {"success": True, "intervention": created}


def add_intervention_action(intervention_id: str, request: AddActionRequest, x_user_id: str = Header(None), x_user_role: str = Header(None), x_department: str = Header(None)):
    user = _requester(x_user_id, x_user_role, x_department)
    if user["role"].strip().lower() == "student":
        raise HTTPException(status_code=403, detail="Students cannot add intervention actions")
    visible = {item["id"] for item in _visible_interventions(user)}
    if intervention_id not in visible:
        raise HTTPException(status_code=403, detail="You are not allowed to update this intervention")
    action = db.add_intervention_action(
        intervention_id=intervention_id,
        title=request.title,
        weakness_area=request.weakness_area,
        resources=request.resources,
        assigned_to=request.assigned_to,
        due_date=request.due_date,
    )
    return {"success": True, "action": action}


def delete_intervention(intervention_id: str, x_user_id: str = Header(None), x_user_role: str = Header(None), x_department: str = Header(None)):
    user = _requester(x_user_id, x_user_role, x_department)
    if user["role"].strip().lower() not in {"coordinator", "admin"}:
        raise HTTPException(status_code=403, detail="Only coordinators can delete interventions")
    db.delete_intervention(intervention_id)
    return {"success": True, "message": "Intervention removed successfully"}


def change_intervention_status(intervention_id: str, request: InterventionStatusRequest, x_user_id: str = Header(None), x_user_role: str = Header(None), x_department: str = Header(None)):
    user = _requester(x_user_id, x_user_role, x_department)
    if user["role"].strip().lower() == "student":
        raise HTTPException(status_code=403, detail="Students cannot update intervention status")
    allowed = {"OPEN", "IN_PROGRESS", "COMPLETED", "RESOLVED", "CANCELLED"}
    new_status = request.status.strip().upper()
    if new_status not in allowed:
        raise HTTPException(status_code=400, detail=f"status must be one of {sorted(allowed)}")
    visible = {item["id"] for item in _visible_interventions(user)}
    if intervention_id not in visible:
        raise HTTPException(status_code=403, detail="You are not allowed to update this intervention")
    db.update_intervention_status(intervention_id, new_status)
    return {"success": True, "status": new_status}


def change_intervention_action(action_id: str, request: InterventionActionRequest, x_user_id: str = Header(None), x_user_role: str = Header(None), x_department: str = Header(None)):
    user = _requester(x_user_id, x_user_role, x_department)
    if user["role"].strip().lower() == "student":
        raise HTTPException(status_code=403, detail="Students cannot update intervention actions")
    visible_action_ids = {action["id"] for item in _visible_interventions(user) for action in item.get("actions", [])}
    if action_id not in visible_action_ids:
        raise HTTPException(status_code=403, detail="You are not allowed to update this action")
    if not db.update_intervention_action(action_id, request.completed, request.notes):
        raise HTTPException(status_code=404, detail="Action not found")
    return {"success": True, "action_id": action_id}


# ---------------------------------------------------------------------------
# Coordinator tracking
# ---------------------------------------------------------------------------

def get_coordinator_tracking(year: str = None, department: str = None, search: str = None, status: str = None):
    result = db.get_coordinator_students_tracking(year=year, department=department, search=search, status=status)
    return {"success": True, **result}


def export_coordinator_tracking(year: str = None, department: str = None, search: str = None, status: str = None, format: str = "xlsx"):
    data = db.get_coordinator_students_tracking(year=year, department=department, search=search, status=status)
    filter_meta = {"year": year, "department": department}
    return bulk_exporter.export_students_tracking_data(data.get("students", []), filter_meta=filter_meta, format_type=format)


def get_coordinator_student_detail(identifier: str):
    student = db.get_coordinator_student_dossier(identifier)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student with identifier '{identifier}' not found")
    return {"success": True, "student": student}


def export_coordinator_student_dossier(identifier: str, format: str = "xlsx"):
    student = db.get_coordinator_student_dossier(identifier)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student with identifier '{identifier}' not found")
    return bulk_exporter.export_individual_student_dossier(student, format_type=format)


# ---------------------------------------------------------------------------
# Mentor
# ---------------------------------------------------------------------------

def get_mentor_demo_data():
    return {"success": True, **db.get_mentor_dashboard_data("mentor@gmail.com")}


def get_notes(student_id: str):
    return {"success": True, "notes": db.get_mentor_notes("demo-mentor", student_id)}


def create_note(request: MentorNoteRequest):
    return {"success": True, "note": db.create_mentor_note("demo-mentor", request.student_id, request.content)}


def update_note(note_id: str, request: MentorNoteUpdateRequest):
    note = db.update_mentor_note(note_id, request.content)
    if not note:
        return JSONResponse(status_code=404, content={"success": False, "message": "Note not found"})
    return {"success": True, "note": note}


def delete_note(note_id: str):
    db.delete_mentor_note(note_id)
    return {"success": True, "message": "Note deleted successfully"}


# ---------------------------------------------------------------------------
# Department
# ---------------------------------------------------------------------------

def get_department_dashboard(dept: str = "CSE"):
    return {"success": True, **db.get_department_dashboard_data(dept)}
