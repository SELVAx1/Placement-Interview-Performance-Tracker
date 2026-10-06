from fastapi import FastAPI, HTTPException, status, Form, UploadFile, File, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import os
import uvicorn
import io
import csv
import openpyxl
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

import db
import intervention_service
import bulk_upload_module.parser as bulk_parser
import bulk_upload_module.exporter as bulk_exporter
from bulk_upload_module.config import TEMPLATES_DIR, MAX_FILE_SIZE_BYTES


# Initialize database on startup
db.init_db()

app = FastAPI(
    title="Placement Portal & Dedicated Bulk Upload Engine",
    description="Integrated API for Authentication, Placement Drives, Student Profiles, and Bulk Ingestion/Export."
)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins during dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LoginRequest(BaseModel):
    gmail: str = Field(..., json_schema_extra={"example": "student@gmail.com"})
    password: str = Field(..., json_schema_extra={"example": "student123"})

@app.post("/api/login")
async def login(credentials: LoginRequest):
    gmail = credentials.gmail.strip()
    password = credentials.password
    
    if not gmail or not password:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "message": "Gmail and password are required"}
        )
    
    # Query database table 'authenticate' for user record
    user = db.get_user_by_gmail(gmail)
    
    # Check if user exists and compare stored password
    if not user or user["password"] != password:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={
                "success": False,
                "message": "Invalid Gmail or password"
            }
        )
    
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "success": True,
            "message": "Logged in successfully",
            "user": {
                "uuid": user["uuid"],
                "gmail": user["gmail"],
                "role": user["role"],
                "department": user.get("department") or "CSE"
            }
        }
    )

class RoundItemRequest(BaseModel):
    round_number: Optional[int] = None
    round_name: str
    round_type: Optional[str] = "TECHNICAL"
    description: Optional[str] = ""

class CreateDriveRequest(BaseModel):
    company_name: str
    job_role: str
    ctc_lpa: float
    min_cgpa: float = 0.0
    allowed_branches: str = "All"
    location: str = "On Campus"
    status: str = "Active"
    deadline: Optional[str] = None
    description: Optional[str] = None
    total_rounds: Optional[int] = 4
    rounds: Optional[List[RoundItemRequest]] = None

class UpdateDriveRequest(BaseModel):
    company_name: Optional[str] = None
    job_role: Optional[str] = None
    ctc_lpa: Optional[float] = None
    min_cgpa: Optional[float] = None
    allowed_branches: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    deadline: Optional[str] = None
    description: Optional[str] = None
    total_rounds: Optional[int] = None
    rounds: Optional[List[RoundItemRequest]] = None

@app.get("/api/users")
async def list_demo_users():
    """Helper endpoint to list available demo accounts for convenience."""
    users = db.get_all_users()
    return {"success": True, "users": users, "count": len(users)}

@app.get("/api/drives")
async def list_drives():
    """Endpoint to retrieve all placement drives from SQLite."""
    drives = db.get_all_drives()
    for d in drives:
        d["results_count"] = db.get_drive_results_count(d["id"])
    return {"success": True, "drives": drives}

@app.post("/api/drives")
async def create_new_drive(drive_data: CreateDriveRequest):
    """Endpoint for Coordinator to create a new placement drive with custom rounds and description."""
    if not drive_data.company_name.strip() or not drive_data.job_role.strip():
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "message": "Company name and job role are required."}
        )
    
    rounds_dicts = [r.dict() for r in drive_data.rounds] if drive_data.rounds else None
    
    new_drive = db.create_drive(
        company_name=drive_data.company_name.strip(),
        job_role=drive_data.job_role.strip(),
        ctc_lpa=drive_data.ctc_lpa,
        min_cgpa=drive_data.min_cgpa,
        allowed_branches=drive_data.allowed_branches.strip(),
        location=drive_data.location.strip(),
        status=drive_data.status.strip() if drive_data.status else "Active",
        deadline=drive_data.deadline,
        description=drive_data.description.strip() if drive_data.description else None,
        total_rounds=drive_data.total_rounds or (len(rounds_dicts) if rounds_dicts else 4),
        rounds=rounds_dicts
    )
    new_drive["results_count"] = 0
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={"success": True, "message": "Drive initialized successfully!", "drive": new_drive}
    )

@app.put("/api/drives/{drive_id}")
async def update_existing_drive(drive_id: str, drive_data: UpdateDriveRequest):
    """Endpoint for Coordinator to alter/update an existing placement drive, description, and round pipeline."""
    rounds_dicts = [r.dict() for r in drive_data.rounds] if drive_data.rounds is not None else None

    updated = db.update_drive(
        drive_id=drive_id,
        company_name=drive_data.company_name.strip() if drive_data.company_name else None,
        job_role=drive_data.job_role.strip() if drive_data.job_role else None,
        ctc_lpa=drive_data.ctc_lpa,
        min_cgpa=drive_data.min_cgpa,
        allowed_branches=drive_data.allowed_branches.strip() if drive_data.allowed_branches else None,
        location=drive_data.location.strip() if drive_data.location else None,
        status=drive_data.status.strip() if drive_data.status else None,
        deadline=drive_data.deadline,
        description=drive_data.description.strip() if drive_data.description is not None else None,
        total_rounds=drive_data.total_rounds,
        rounds=rounds_dicts
    )

    if not updated:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "message": f"Drive with id '{drive_id}' not found."}
        )

    updated["results_count"] = db.get_drive_results_count(drive_id)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "message": "Drive updated successfully!", "drive": updated}
    )

@app.get("/api/drives/{drive_id}/results")
async def get_drive_results(drive_id: str):
    """Retrieve all student evaluation results for a specific drive."""
    results = db.get_drive_results(drive_id)
    return {"success": True, "results": results, "count": len(results)}

@app.get("/api/drives/{drive_id}/process")
async def get_drive_interview_process(drive_id: str):
    """Retrieve complete interview stages pipeline, per-round funnels, and selected students for a drive."""
    process_data = db.get_drive_process_details(drive_id)
    if not process_data:
        raise HTTPException(status_code=404, detail=f"Placement drive with ID '{drive_id}' was not found.")
    return {"success": True, **process_data}

class AdvanceCandidateRequest(BaseModel):
    gmail: str
    action: Optional[str] = "advance"  # "advance", "select", "reject", "offer"
    round_num: Optional[int] = None
    score: Optional[float] = None
    feedback: Optional[str] = None

@app.post("/api/drives/{drive_id}/advance-candidate")
async def advance_drive_candidate_endpoint(drive_id: str, req: AdvanceCandidateRequest):
    """Coordinator directly advances, shortlists, selects, or rejects a candidate in a drive."""
    drive = db.get_drive(drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail=f"Placement drive with ID '{drive_id}' was not found.")
    total_rounds = drive.get("total_rounds", 4)
    res = db.advance_or_update_candidate(
        drive_id=drive_id,
        gmail=req.gmail,
        action=req.action,
        total_rounds=total_rounds,
        score=req.score,
        feedback=req.feedback,
        round_num=req.round_num
    )
    return {"success": True, "message": f"Candidate status updated to {res['result']}.", "result": res}


@app.get("/api/drives/{drive_id}/export/selected")
@app.get("/api/export/drive-selected/{drive_id}")
def export_drive_selected_students_endpoint(drive_id: str, format: str = "xlsx"):
    """Export styled Excel / CSV containing all students who were selected by the hiring company."""
    drive = db.get_drive(drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail=f"Drive with ID '{drive_id}' was not found.")
    process_data = db.get_drive_process_details(drive_id)
    selected_students = process_data.get("selected_students", []) if process_data else []
    return bulk_exporter.export_selected_students_data(selected_students, drive_info=drive, format_type=format)

@app.get("/api/drives/{drive_id}/export/round/{round_num}/template")
@app.get("/api/export/round-template/{drive_id}/{round_num}")
def export_round_update_template_endpoint(drive_id: str, round_num: int, format: str = "xlsx"):
    """
    Export update Excel / CSV template for a specific interview round, pre-populated with
    all student names and emails who cleared the previous round or are scheduled for this round.
    """
    drive = db.get_drive(drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail=f"Drive with ID '{drive_id}' was not found.")
    
    # Pre-populate students who cleared the previous/current round into this round's template
    round_students = db.get_candidates_for_round_template(drive_id, round_num)
    
    process_data = db.get_drive_process_details(drive_id)
    rounds = process_data.get("rounds", []) if process_data else []
    target_round = next((r for r in rounds if r["round_number"] == round_num), None)
    if not target_round:
        target_round = {"round_number": round_num, "round_name": f"Round {round_num}"}
    
    return bulk_exporter.export_round_update_template_data(
        round_students, drive_info=drive, round_info=target_round, format_type=format
    )


# ==============================================================
# SAMPLE TEMPLATES ENDPOINTS
# ==============================================================

@app.get("/api/templates")
def list_sample_templates():
    """Lists all available sample templates with download links and column schemas."""
    templates = [
        {
            "name": "sample_drive_shortlist",
            "title": "Drive Shortlist Template (Emails Only)",
            "description": "Upload candidate emails to automatically advance them to the next interview round.",
            "formats": ["sample_drive_shortlist.xlsx", "sample_drive_shortlist.csv"],
            "required_columns": ["Student Gmail / Email"],
            "optional_columns": ["Student Name", "Branch"],
            "mode": "Shortlist Mode (Auto-increments round by +1)"
        },
        {
            "name": "sample_drive_results",
            "title": "Drive Results / Verdicts Template",
            "description": "Upload candidate evaluations with explicit statuses (Selected, Rejected, On Hold) and scores.",
            "formats": ["sample_drive_results.xlsx", "sample_drive_results.csv"],
            "required_columns": ["Student Gmail / Email", "Result Status / Verdict"],
            "optional_columns": ["Round", "Score", "Student Name"],
            "mode": "Verdict Mode (Sets exact status)"
        },
        {
            "name": "sample_user_access",
            "title": "User Accounts & Role Provisioning Template",
            "description": "Bulk create or update accounts for Students, Mentors, Coordinators, and Recruiters.",
            "formats": ["sample_user_access.xlsx", "sample_user_access.csv"],
            "required_columns": ["User Email"],
            "optional_columns": ["Role (Student, Mentor, etc.)", "Password"],
            "mode": "Role Access Mode"
        },
        {
            "name": "sample_student_roster",
            "title": "Student Academic Profiles Template",
            "description": "Bulk import academic records, CGPA, 10th/12th percentages, and technical skills.",
            "formats": ["sample_student_roster.xlsx", "sample_student_roster.csv"],
            "required_columns": ["Register Number", "Full Name", "Student Email", "Department", "CGPA"],
            "optional_columns": ["10th Percentage", "12th Percentage", "Technical Skills"],
            "mode": "Academic Roster Mode"
        },
        {
            "name": "sample_company_drives",
            "title": "Company Placement Drives Template",
            "description": "Bulk schedule on-campus placement drives with company type, CTC LPA, eligibility criteria, and rounds.",
            "formats": ["sample_company_drives.xlsx", "sample_company_drives.csv"],
            "required_columns": ["Company Name", "Job Role", "CTC LPA"],
            "optional_columns": ["Company Type", "Required CGPA", "Allowed Branches", "Total Rounds", "Location", "Drive Date", "Status"],
            "mode": "Company Drive Scheduling Mode"
        }
    ]
    return {"success": True, "templates": templates}


@app.get("/api/templates/download/{filename}")
def download_template(filename: str):
    """Downloads a specific Excel (.xlsx) or CSV sample template file."""
    filepath = os.path.join(TEMPLATES_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template file '{filename}' was not found. Call /api/templates to see available files."
        )

    mime_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if filename.endswith(".xlsx") else "text/csv"
    return FileResponse(filepath, media_type=mime_type, filename=filename)


# ==============================================================
# BULK UPLOAD INGESTION ENDPOINTS
# ==============================================================

@app.post("/api/upload/drive-shortlist/{drive_id}")
async def upload_drive_shortlist(drive_id: str, file: UploadFile = File(...)):
    drive = db.get_drive(drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail=f"Drive with ID '{drive_id}' was not found.")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File size exceeds maximum allowed 10MB limit.")

    try:
        records, skipped_count, is_verdict_mode = bulk_parser.parse_drive_records(content, file.filename)
    except ValueError as e:
        db.record_upload_log("Drive Shortlist", file.filename, 0, 0, 0, status=f"FAILED: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

    processed_records = []
    for item in records:
        res = db.process_shortlist_record(drive_id, item["email"], base_round=drive.get("current_round", 1))
        processed_records.append(res)

    db.record_upload_log(
        upload_type=f"Drive Shortlist ({drive['company_name']})",
        filename=file.filename,
        total_rows=len(records) + skipped_count,
        processed_count=len(processed_records),
        skipped_count=skipped_count,
        status="SUCCESS"
    )

    return JSONResponse(status_code=status.HTTP_200_OK, content={
        "success": True,
        "mode": "Shortlist Mode (Auto-promoted candidates to next round)",
        "drive_id": drive_id,
        "company_name": drive["company_name"],
        "total_rows": len(records) + skipped_count,
        "promoted_count": len(processed_records),
        "skipped_count": skipped_count,
        "records": processed_records
    })


@app.post("/api/upload/drive-results/{drive_id}")
async def upload_drive_results_endpoint(drive_id: str, file: UploadFile = File(...)):
    drive = db.get_drive(drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail=f"Drive with ID '{drive_id}' was not found.")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File size exceeds maximum allowed 10MB limit.")

    try:
        records, skipped_count, is_verdict_mode = bulk_parser.parse_drive_records(content, file.filename)
    except ValueError as e:
        db.record_upload_log("Drive Results", file.filename, 0, 0, 0, status=f"FAILED: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

    base_round = drive.get("current_round", 1) if drive else 1
    processed_records = []
    for item in records:
        verdict = item.get("verdict") or "Shortlisted"
        res = db.process_verdict_record(
            drive_id=drive_id,
            email=item["email"],
            verdict=verdict,
            round_num=item.get("round") or base_round,
            score=item.get("score"),
            max_score=item.get("max_score"),
            feedback=item.get("feedback"),
            weakness_area=item.get("weakness_area"),
            rejection_reason=item.get("rejection_reason"),
            attempt_date=item.get("attempt_date")
        )
        processed_records.append(res)

    db.record_upload_log(
        upload_type=f"Drive Results ({drive['company_name']})",
        filename=file.filename,
        total_rows=len(records) + skipped_count,
        processed_count=len(processed_records),
        skipped_count=skipped_count,
        status="SUCCESS"
    )

    return JSONResponse(status_code=status.HTTP_200_OK, content={
        "success": True,
        "mode": "Verdict Mode (Updated explicit status and scores)",
        "drive_id": drive_id,
        "company_name": drive["company_name"],
        "total_rows": len(records) + skipped_count,
        "updated_count": len(processed_records),
        "skipped_count": skipped_count,
        "records": processed_records
    })


@app.post("/api/drives/{drive_id}/upload-results")
async def upload_drive_results(drive_id: str, file: UploadFile = File(...)):
    """
    Upload Excel (.xlsx) or CSV file containing candidate results.
    Auto-detects Shortlist Mode vs Verdict Mode and updates student statuses for this company drive.
    """
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        return JSONResponse(status_code=400, content={"success": False, "message": "File size exceeds maximum allowed 10MB limit.", "detail": "File size exceeds limit."})

    try:
        records, skipped_count, is_verdict_mode = bulk_parser.parse_drive_records(content, file.filename)
    except ValueError as e:
        db.record_upload_log("Drive Upload", file.filename, 0, 0, 0, status=f"FAILED: {str(e)}")
        return JSONResponse(status_code=400, content={"success": False, "message": str(e), "detail": str(e)})

    drive = db.get_drive(drive_id)
    base_round = drive.get("current_round", 1) if drive else 1

    processed_records = []
    for item in records:
        if is_verdict_mode and item.get("verdict"):
            res = db.process_verdict_record(
                drive_id=drive_id,
                email=item["email"],
                verdict=item["verdict"],
                round_num=item.get("round") or base_round,
                score=item.get("score"),
                max_score=item.get("max_score"),
                feedback=item.get("feedback"),
                weakness_area=item.get("weakness_area"),
                rejection_reason=item.get("rejection_reason"),
                attempt_date=item.get("attempt_date")
            )
        else:
            res = db.process_shortlist_record(drive_id, item["email"], base_round=base_round)
        processed_records.append(res)

    db.record_upload_log(
        upload_type=f"Drive Candidate Upload ({drive_id})",
        filename=file.filename,
        total_rows=len(records) + skipped_count,
        processed_count=len(processed_records),
        skipped_count=skipped_count,
        status="SUCCESS"
    )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "success": True,
            "message": f"Successfully processed {len(processed_records)} student result records.",
            "total_rows": len(records) + skipped_count,
            "updated_count": len(processed_records),
            "skipped_count": skipped_count,
            "processed_records": processed_records
        }
    )


@app.post("/api/upload/user-access")
@app.post("/api/users/upload-access")
async def upload_user_access(
    file: UploadFile = File(...),
    default_role: str = Form("Student")
):
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        return JSONResponse(status_code=400, content={"success": False, "message": "File size exceeds maximum allowed 10MB limit.", "detail": "File size exceeds limit."})

    try:
        records, skipped_count = bulk_parser.parse_user_access_records(content, file.filename, default_role=default_role)
    except ValueError as e:
        db.record_upload_log("User Access", file.filename, 0, 0, 0, status=f"FAILED: {str(e)}")
        return JSONResponse(status_code=400, content={"success": False, "message": str(e), "detail": str(e)})

    created_count = 0
    updated_count = 0
    processed_users = []

    for item in records:
        res = db.upsert_user_account(
            email=item["email"],
            role=item["role"],
            password=item.get("password")
        )
        if res["action"] == "Created":
            created_count += 1
        else:
            updated_count += 1
        processed_users.append(res)

    db.record_upload_log(
        upload_type="User Access Onboarding",
        filename=file.filename,
        total_rows=len(records) + skipped_count,
        processed_count=len(processed_users),
        skipped_count=skipped_count,
        status="SUCCESS"
    )

    return JSONResponse(status_code=status.HTTP_200_OK, content={
        "success": True,
        "message": f"Successfully granted access to {len(processed_users)} user accounts ({created_count} created, {updated_count} updated).",
        "total_rows": len(records) + skipped_count,
        "total_processed": len(processed_users),
        "created_count": created_count,
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "processed_users": processed_users,
        "users": processed_users
    })


@app.post("/api/upload/student-roster")
async def upload_student_roster(file: UploadFile = File(...)):
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File size exceeds maximum allowed 10MB limit.")

    try:
        records, skipped_count = bulk_parser.parse_student_roster_records(content, file.filename)
    except ValueError as e:
        db.record_upload_log("Student Roster", file.filename, 0, 0, 0, status=f"FAILED: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

    processed_students = []
    created_count = 0
    updated_count = 0
    for item in records:
        res = db.upsert_student_roster_record(
            register_number=item["register_number"],
            name=item["name"],
            email=item["email"],
            department=item["department"],
            cgpa=item["cgpa"],
            tenth=item.get("tenth_percentage"),
            twelfth=item.get("twelfth_percentage"),
            skills=item.get("skills", ""),
            year=item.get("year", "4th Year")
        )
        if res.get("action") == "Updated":
            updated_count += 1
        else:
            created_count += 1
        processed_students.append(res)

    db.record_upload_log(
        upload_type="Student Academic Roster",
        filename=file.filename,
        total_rows=len(records) + skipped_count,
        processed_count=len(processed_students),
        skipped_count=skipped_count,
        status="SUCCESS"
    )

    return JSONResponse(status_code=status.HTTP_200_OK, content={
        "success": True,
        "message": f"Successfully processed {len(processed_students)} student academic profiles ({created_count} registered, {updated_count} auto-updated).",
        "total_rows": len(records) + skipped_count,
        "imported_count": len(processed_students),
        "created_count": created_count,
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "students": processed_students
    })


@app.post("/api/upload/company-drives")
async def upload_company_drives(file: UploadFile = File(...)):
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File size exceeds maximum allowed 10MB limit.")

    try:
        records, skipped_count = bulk_parser.parse_company_drives_records(content, file.filename)
    except ValueError as e:
        db.record_upload_log("Company Drives", file.filename, 0, 0, 0, status=f"FAILED: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

    created_count = 0
    updated_count = 0
    processed_drives = []

    for item in records:
        res = db.upsert_company_drive_record(
            company_name=item["company_name"],
            job_role=item["job_role"],
            ctc_lpa=item["ctc_lpa"],
            company_type=item["company_type"],
            required_cgpa=item["required_cgpa"],
            allowed_branches=item["allowed_branches"],
            location=item["location"],
            total_rounds=item["total_rounds"],
            drive_date=item["drive_date"],
            status=item["status"]
        )
        if res["action"] == "Created":
            created_count += 1
        else:
            updated_count += 1
        processed_drives.append(res)

    db.record_upload_log(
        upload_type="Company Drives Scheduling",
        filename=file.filename,
        total_rows=len(records) + skipped_count,
        processed_count=len(processed_drives),
        skipped_count=skipped_count,
        status="SUCCESS"
    )

    return JSONResponse(status_code=status.HTTP_200_OK, content={
        "success": True,
        "message": f"Successfully processed {len(processed_drives)} company placement drives ({created_count} created, {updated_count} updated).",
        "total_rows": len(records) + skipped_count,
        "created_count": created_count,
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "drives": processed_drives
    })


class GrantSingleAccessRequest(BaseModel):
    gmail: str
    role: str = "Student"
    password: str = None

@app.post("/api/users/grant-single-access")
async def grant_single_access(req: GrantSingleAccessRequest):
    gmail = req.gmail.strip().lower()
    if not gmail or "@" not in gmail:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "message": "Please enter a valid Gmail address."}
        )
    
    result = db.grant_single_user_access(gmail=gmail, role=req.role, password=req.password)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "success": True,
            "message": f"Successfully granted {result['role']} access to {gmail}.",
            "user": result
        }
    )


# ==============================================================
# AUDIT LOGS & DATA VIEWING ENDPOINTS
# ==============================================================

@app.get("/api/students")
def list_students():
    students = db.get_all_student_roster()
    return {"success": True, "count": len(students), "students": students}

@app.get("/api/logs")
def list_upload_logs():
    logs = db.get_upload_logs()
    return {"success": True, "count": len(logs), "logs": logs}


# ==============================================================
# EXPORT ENDPOINTS (EXCEL & CSV DOWNLOAD)
# ==============================================================

@app.get("/api/export/company-drives")
def export_company_drives(format: str = "xlsx"):
    drives = db.get_all_drives()
    return bulk_exporter.export_company_drives_data(drives, format_type=format)

@app.get("/api/export/drive-results/{drive_id}")
def export_drive_results(drive_id: str, format: str = "xlsx"):
    drive = db.get_drive(drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail=f"Drive with ID '{drive_id}' was not found.")
    results = db.get_drive_results(drive_id)
    return bulk_exporter.export_drive_results_data(results, drive_info=drive, format_type=format)

@app.get("/api/export/student-roster")
def export_student_roster(format: str = "xlsx"):
    students = db.get_all_student_roster()
    return bulk_exporter.export_student_roster_data(students, format_type=format)

@app.get("/api/export/user-access")
def export_user_access(format: str = "xlsx"):
    users = db.get_all_users()
    return bulk_exporter.export_user_access_data(users, format_type=format)


# ==============================================================
# COORDINATOR: STUDENT TRACKING (YEAR-WISE & DEPT-WISE)
# ==============================================================

@app.get("/api/coordinator/students-tracking")
def get_coordinator_students_tracking(
    year: str = None,
    department: str = None,
    search: str = None,
    status: str = None
):
    result = db.get_coordinator_students_tracking(
        year=year,
        department=department,
        search=search,
        status=status
    )
    return {"success": True, **result}


@app.get("/api/coordinator/export/students-tracking")
def export_coordinator_students_tracking(
    year: str = None,
    department: str = None,
    search: str = None,
    status: str = None,
    format: str = "xlsx"
):
    data = db.get_coordinator_students_tracking(
        year=year,
        department=department,
        search=search,
        status=status
    )
    filter_meta = {"year": year, "department": department}
    return bulk_exporter.export_students_tracking_data(
        data.get("students", []),
        filter_meta=filter_meta,
        format_type=format
    )


@app.get("/api/coordinator/student/{identifier}")
def get_coordinator_student_detail(identifier: str):
    """
    Retrieve individual student comprehensive dossier (academic profile, interview history, interventions, and action roadmap).
    """
    student = db.get_coordinator_student_dossier(identifier)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student with identifier '{identifier}' not found")
    return {"success": True, "student": student}


@app.get("/api/coordinator/export/student/{identifier}")
def export_coordinator_individual_student_dossier(identifier: str, format: str = "xlsx"):
    """
    Download complete multi-sheet Excel dossier & intervention template for a specific individual student.
    """
    student = db.get_coordinator_student_dossier(identifier)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student with identifier '{identifier}' not found")
    return bulk_exporter.export_individual_student_dossier(student, format_type=format)




# ==========================================
# STUDENT API ENDPOINTS
# ==========================================

class StudentApplyRequest(BaseModel):
    gmail: str
    drive_id: str

@app.get("/api/student/profile")
async def get_student_profile(gmail: str):
    """viewStudentProfile() — Retrieve a student's personal & academic profile information updated by coordinator."""
    profile = db.get_student_profile_by_email(gmail)
    if not profile:
        email_clean = gmail.strip().lower()
        default_name = email_clean.split("@")[0].replace(".", " ").title()
        profile = {
            "student_id": "",
            "register_number": "",
            "name": default_name,
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
                "atcoder": {"handle": "", "solved_month": 0, "rating": 0}
            }
        }
    return {"success": True, "profile": profile}

class StudentProfileUpdateRequest(BaseModel):
    gmail: str
    name: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    year: Optional[str] = None
    cgpa: Optional[float] = None
    tenth_percentage: Optional[float] = None
    twelfth_percentage: Optional[float] = None
    skills: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    resume_filename: Optional[str] = None
    resume_url: Optional[str] = None
    # Coding platform profiles
    leetcode_handle: Optional[str] = None
    leetcode_solved_month: Optional[int] = None
    leetcode_total_solved: Optional[int] = None
    codeforces_handle: Optional[str] = None
    codeforces_solved_month: Optional[int] = None
    codeforces_rating: Optional[int] = None
    codechef_handle: Optional[str] = None
    codechef_solved_month: Optional[int] = None
    codechef_stars: Optional[str] = None
    hackerrank_handle: Optional[str] = None
    hackerrank_solved_month: Optional[int] = None
    hackerrank_score: Optional[int] = None
    atcoder_handle: Optional[str] = None
    atcoder_solved_month: Optional[int] = None
    atcoder_rating: Optional[int] = None

@app.put("/api/student/profile")
async def update_student_profile_endpoint(profile_data: StudentProfileUpdateRequest):
    """updateStudentProfile() — Update student personal details, resume, and coding platforms with auto-calculated monthly sum."""
    if not profile_data.gmail or not profile_data.gmail.strip():
        raise HTTPException(status_code=400, detail="Student email is required.")
    
    update_dict = {k: v for k, v in profile_data.dict().items() if v is not None}

    # Official academic & institutional fields are locked against modification by students:
    # Students cannot alter their CGPA, 10th %, 12th %, department, register number, or email.
    # These fields are strictly auto-updated when the Placement Coordinator imports the official Excel roster.
    LOCKED_STUDENT_FIELDS = {
        "cgpa", "tenth_percentage", "twelfth_percentage",
        "department", "register_number", "email", "gmail"
    }
    for field in LOCKED_STUDENT_FIELDS:
        update_dict.pop(field, None)

    updated_profile = db.update_student_profile(profile_data.gmail, update_dict, is_student=True)
    if not updated_profile:
        raise HTTPException(status_code=500, detail="Failed to update student profile.")
    
    return {
        "success": True,
        "message": "Student profile updated successfully.",
        "profile": updated_profile
    }

@app.get("/api/student/results")
async def get_student_results(gmail: str):
    """viewRoundStatus() — Retrieve all evaluation results for a student across drives."""
    results = db.get_student_drive_results(gmail)
    return {"success": True, "results": results}

@app.get("/api/student/applications")
async def get_student_applications(gmail: str):
    """viewJobApplication() — Retrieve all drives registered by student."""
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
            "registered_at": r.get("updated_at", "")
        })
    return {"success": True, "applications": apps}

@app.post("/api/student/apply")
async def apply_student_drive(req: StudentApplyRequest):
    """applyJobApplication() — Apply student to a placement drive."""
    res = db.register_student_for_drive(req.drive_id, req.gmail)
    return {"success": True, "message": "Successfully applied for drive. You are enrolled to appear in Round 1.", "registration": res}

@app.get("/api/student/analysis")
async def get_student_analysis(gmail: str):
    """viewAnalysis() — Performance & failure pattern analysis."""
    results = db.get_student_drive_results(gmail)
    patterns = intervention_service.analyse_student_patterns(results)
    failed_rounds = patterns["failed_by_round"]
    most_failed_round = max(failed_rounds, key=failed_rounds.get) if failed_rounds else None

    return {
        "success": True,
        "pass_rate": patterns["pass_rate"],
        "total_drives_applied": len(set(r["drive_id"] for r in results)),
        "total_rounds_attempted": patterns["total_rounds"],
        "rounds_passed": patterns["passed_rounds"],
        "rounds_failed": patterns["failed_rounds"],
        "most_failed_round": most_failed_round,
        "top_weaknesses": patterns["top_weaknesses"],
        "risk_level": patterns["risk_level"]
    }


# ==========================================
# INTERVENTION AND FAILURE ANALYSIS API
# ==========================================


class InterventionGenerateRequest(BaseModel):
    student_id: str = None
    gmail: str = None


class InterventionStatusRequest(BaseModel):
    status: str


class InterventionActionRequest(BaseModel):
    completed: bool = None
    notes: str = None


class CustomInterventionRequest(BaseModel):
    student_id: str = None
    gmail: str = None
    title: str
    failure_summary: str = ""
    ai_analysis: str = ""
    priority: str = "MEDIUM"
    actions: list[dict] = []


class AddActionRequest(BaseModel):
    title: str
    weakness_area: str = None
    resources: str = None
    assigned_to: str = None
    due_date: str = None


def _requester(user_id: str, role: str, department: str):
    if not user_id:
        raise HTTPException(status_code=401, detail="X-User-Id is required")
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Unknown user")
    if role and role.strip().lower() != user["role"].strip().lower():
        raise HTTPException(status_code=403, detail="User role does not match the authenticated account")
    user["department"] = department or user.get("department") or "CSE"
    return user


def _scoped_student(user: dict, student_id: str = None, gmail: str = None):
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

        matches_id = bool(clean_id and (clean_id in {s_uuid, s_auth_uuid, s_student_id}))
        matches_gmail = bool(clean_gmail and s_gmail == clean_gmail)

        if matches_id or matches_gmail:
            target = student
            break

    # If not found in scoped list but user is Coordinator/Admin, search directly across all students in system
    if not target and is_coord:
        if clean_gmail:
            p = db.get_student_profile_by_email(clean_gmail)
            if p:
                return {
                    "uuid": p.get("student_id"),
                    "student_id": p.get("student_id"),
                    "gmail": p["email"],
                    "department": p.get("department", "CSE"),
                    "role": "student",
                    "name": p.get("name", "")
                }
        if clean_id:
            p = db.get_student_profile(clean_id)
            if p:
                return {
                    "uuid": p.get("student_id"),
                    "student_id": p.get("student_id"),
                    "gmail": p["email"],
                    "department": p.get("department", "CSE"),
                    "role": "student",
                    "name": p.get("name", "")
                }

    if not target:
        raise HTTPException(status_code=403, detail="You are not allowed to access this student")
    return target


def _visible_interventions(user: dict):
    role = (user.get("role") or "").strip().lower()
    if role in {"coordinator", "admin"}:
        return db.get_interventions()
    students = db.get_students_for_scope(user["uuid"], user["role"], user.get("department"))
    return db.get_interventions(student_gmails=[student["gmail"] for student in students])


@app.get("/api/interventions")
async def list_interventions(
    x_user_id: str = Header(None),
    x_user_role: str = Header(None),
    x_department: str = Header(None),
):
    user = _requester(x_user_id, x_user_role, x_department)
    return {"success": True, "interventions": _visible_interventions(user)}


@app.get("/api/interventions/students")
async def list_intervention_students(
    x_user_id: str = Header(None),
    x_user_role: str = Header(None),
    x_department: str = Header(None),
):
    user = _requester(x_user_id, x_user_role, x_department)
    students = db.get_students_for_scope(user["uuid"], user["role"], user.get("department"))
    visible_interventions = _visible_interventions(user)
    by_gmail = {}
    for intervention in visible_interventions:
        by_gmail.setdefault(intervention["student_gmail"].lower(), []).append(intervention)
    for student in students:
        student["interventions"] = by_gmail.get(student["gmail"].lower(), [])[:3]
        student["intervention_count"] = len(student["interventions"])
    return {"success": True, "students": students}


@app.get("/api/interventions/{student_id}")
async def get_student_interventions(
    student_id: str,
    x_user_id: str = Header(None),
    x_user_role: str = Header(None),
    x_department: str = Header(None),
):
    user = _requester(x_user_id, x_user_role, x_department)
    student = _scoped_student(user, student_id=student_id)
    return {
        "success": True,
        "student": student,
        "interventions": db.get_interventions(student_gmail=student["gmail"]),
        "analysis": intervention_service.analyse_student_patterns(db.get_student_analysis_records(student["gmail"])),
    }


@app.post("/api/interventions/generate")
async def generate_intervention(
    request: InterventionGenerateRequest,
    x_user_id: str = Header(None),
    x_user_role: str = Header(None),
    x_department: str = Header(None),
):
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

    intervention, actions = intervention_service.build_intervention(
        student, patterns, previous_actions, user["uuid"]
    )
    saved = db.save_intervention(intervention, actions)

    return {"success": True, "intervention": saved, "analysis": patterns}


@app.post("/api/interventions/generate-all")
async def generate_all_interventions(
    x_user_id: str = Header(None),
    x_user_role: str = Header(None),
    x_department: str = Header(None),
):
    user = _requester(x_user_id, x_user_role, x_department)
    if user["role"].strip().lower() == "student":
        raise HTTPException(status_code=403, detail="Students cannot generate interventions")

    students = db.get_students_for_scope(user["uuid"], user["role"], user.get("department"))
    generated = []
    failures = []
    for student in students:
        records = db.get_student_analysis_records(student["gmail"])
        patterns = intervention_service.analyse_student_patterns(records)
        previous = db.get_interventions(student_gmail=student["gmail"])
        previous_actions = [action for item in previous for action in item.get("actions", [])]
        try:
            intervention, actions = intervention_service.build_intervention(
                student, patterns, previous_actions, user["uuid"]
            )
            generated.append(db.save_intervention(intervention, actions))
        except Exception as exc:
            failures.append({"student_id": student.get("uuid"), "gmail": student.get("gmail"), "error": str(exc)})

    return {"success": len(failures) == 0, "generated": generated, "failures": failures}


@app.post("/api/interventions/custom")
async def create_custom_intervention_endpoint(
    request: CustomInterventionRequest,
    x_user_id: str = Header(None),
    x_user_role: str = Header(None),
    x_department: str = Header(None),
):
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
        actions=request.actions
    )
    return {"success": True, "intervention": created}


@app.post("/api/interventions/{intervention_id}/actions")
async def add_action_endpoint(
    intervention_id: str,
    request: AddActionRequest,
    x_user_id: str = Header(None),
    x_user_role: str = Header(None),
    x_department: str = Header(None),
):
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
        due_date=request.due_date
    )
    return {"success": True, "action": action}


@app.delete("/api/interventions/{intervention_id}")
async def delete_intervention_endpoint(
    intervention_id: str,
    x_user_id: str = Header(None),
    x_user_role: str = Header(None),
    x_department: str = Header(None),
):
    user = _requester(x_user_id, x_user_role, x_department)
    if user["role"].strip().lower() not in {"coordinator", "admin"}:
        raise HTTPException(status_code=403, detail="Only coordinators can delete interventions")
    db.delete_intervention(intervention_id)
    return {"success": True, "message": "Intervention removed successfully"}


@app.patch("/api/interventions/{intervention_id}/status")
async def change_intervention_status(
    intervention_id: str,
    request: InterventionStatusRequest,
    x_user_id: str = Header(None),
    x_user_role: str = Header(None),
    x_department: str = Header(None),
):
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


@app.patch("/api/intervention/actions/{action_id}")
async def change_intervention_action(
    action_id: str,
    request: InterventionActionRequest,
    x_user_id: str = Header(None),
    x_user_role: str = Header(None),
    x_department: str = Header(None),
):
    user = _requester(x_user_id, x_user_role, x_department)
    if user["role"].strip().lower() == "student":
        raise HTTPException(status_code=403, detail="Students cannot update intervention actions")
    visible_action_ids = {
        action["id"]
        for item in _visible_interventions(user)
        for action in item.get("actions", [])
    }
    if action_id not in visible_action_ids:
        raise HTTPException(status_code=403, detail="You are not allowed to update this action")
    if not db.update_intervention_action(action_id, request.completed, request.notes):
        raise HTTPException(status_code=404, detail="Action not found")
    return {"success": True, "action_id": action_id}

@app.post("/api/student/resume-upload")
async def upload_student_resume(file: UploadFile = File(...), gmail: str = Form("student@gmail.com")):
    """resumeUpload() — Upload and store student resume file, linking it to profile across all dashboards."""
    filename = file.filename.lower()
    if not (filename.endswith(".pdf") or filename.endswith(".doc") or filename.endswith(".docx")):
        return JSONResponse(status_code=400, content={"success": False, "message": "Only PDF and Word documents are allowed."})
    
    # Save file physically into public/uploads/resumes/
    resumes_dir = os.path.join(os.path.dirname(__file__), "public", "uploads", "resumes")
    os.makedirs(resumes_dir, exist_ok=True)

    clean_base = os.path.basename(file.filename).replace(" ", "_")
    dest_path = os.path.join(resumes_dir, clean_base)
    contents = await file.read()
    with open(dest_path, "wb") as f:
        f.write(contents)

    resume_url = f"/static/uploads/resumes/{clean_base}"
    db.update_student_profile(gmail, {
        "resume_filename": file.filename,
        "resume_url": resume_url
    })

    return {
        "success": True,
        "message": "Resume uploaded successfully.",
        "resume_path": file.filename,
        "resume_filename": file.filename,
        "resume_url": resume_url
    }


# ==========================================
# MENTOR API ENDPOINTS
# ==========================================

class MentorNoteRequest(BaseModel):
    student_id: str
    content: str

class MentorNoteUpdateRequest(BaseModel):
    content: str

@app.get("/api/mentor/demo/mentees")
async def get_mentor_demo_data():
    """Retrieve mentor's assigned mentees, placed list, interventions, and metrics dynamically from SQLite DB."""
    data = db.get_mentor_dashboard_data("mentor@gmail.com")
    return {
        "success": True,
        **data
    }

@app.get("/api/mentor/notes")
async def get_notes(student_id: str):
    notes = db.get_mentor_notes("demo-mentor", student_id)
    return {"success": True, "notes": notes}

@app.post("/api/mentor/notes")
async def create_note(note_req: MentorNoteRequest):
    note = db.create_mentor_note("demo-mentor", note_req.student_id, note_req.content)
    return {"success": True, "note": note}

@app.put("/api/mentor/notes/{note_id}")
async def update_note(note_id: str, note_req: MentorNoteUpdateRequest):
    note = db.update_mentor_note(note_id, note_req.content)
    if not note:
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"success": False, "message": "Note not found"})
    return {"success": True, "note": note}

@app.delete("/api/mentor/notes/{note_id}")
async def delete_note(note_id: str):
    db.delete_mentor_note(note_id)
    return {"success": True, "message": "Note deleted successfully"}


# ==========================================
# DEPARTMENT API ENDPOINTS
# ==========================================

@app.get("/api/department/dashboard")
async def get_department_dashboard(dept: str = "CSE"):
    """Retrieve full department overview: students, mentors, placed stats, interventions, and metrics."""
    data = db.get_department_dashboard_data(dept)
    return {
        "success": True,
        **data
    }


# Serve static frontend files
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "public")
if os.path.exists(PUBLIC_DIR):
    app.mount("/static", StaticFiles(directory=PUBLIC_DIR), name="static")

@app.get("/favicon.ico")
async def serve_favicon():
    fav_path = os.path.join(PUBLIC_DIR, "favicon.ico")
    if os.path.exists(fav_path):
        return FileResponse(fav_path)
    return JSONResponse(status_code=404, content={"message": "Favicon not found"})

@app.get("/")
async def serve_index():
    index_path = os.path.join(PUBLIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Placement Tracking API is running."}

if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
