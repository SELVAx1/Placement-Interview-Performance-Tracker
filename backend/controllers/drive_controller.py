import db
import bulk_upload_module.exporter as bulk_exporter
from fastapi import HTTPException, status
from fastapi.responses import JSONResponse

from backend.schemas import AdvanceCandidateRequest, CreateDriveRequest, UpdateDriveRequest
from backend.services import drive_service


def list_drives():
    return {"success": True, "drives": drive_service.list_drives()}


def create_drive(data: CreateDriveRequest):
    if not data.company_name.strip() or not data.job_role.strip():
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "message": "Company name and job role are required."},
        )
    drive = drive_service.create_drive(data)
    drive["results_count"] = 0
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={"success": True, "message": "Drive initialized successfully!", "drive": drive},
    )


def update_drive(drive_id: str, data: UpdateDriveRequest):
    updated = drive_service.update_drive(drive_id, data)
    if not updated:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "message": f"Drive with id '{drive_id}' not found."},
        )
    updated["results_count"] = db.get_drive_results_count(drive_id)
    return {"success": True, "message": "Drive updated successfully!", "drive": updated}


def get_results(drive_id: str):
    results = drive_service.get_results(drive_id)
    return {"success": True, "results": results, "count": len(results)}


def get_drive_process(drive_id: str):
    process_data = db.get_drive_process_details(drive_id)
    if not process_data:
        raise HTTPException(status_code=404, detail=f"Placement drive with ID '{drive_id}' was not found.")
    return {"success": True, **process_data}


def advance_candidate(drive_id: str, req: AdvanceCandidateRequest):
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
        round_num=req.round_num,
    )
    return {"success": True, "message": f"Candidate status updated to {res['result']}.", "result": res}


def export_selected_students(drive_id: str, format: str = "xlsx"):
    drive = db.get_drive(drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail=f"Drive with ID '{drive_id}' was not found.")
    process_data = db.get_drive_process_details(drive_id)
    selected_students = process_data.get("selected_students", []) if process_data else []
    return bulk_exporter.export_selected_students_data(selected_students, drive_info=drive, format_type=format)


def export_round_template(drive_id: str, round_num: int, format: str = "xlsx"):
    drive = db.get_drive(drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail=f"Drive with ID '{drive_id}' was not found.")
    round_students = db.get_candidates_for_round_template(drive_id, round_num)
    process_data = db.get_drive_process_details(drive_id)
    rounds = process_data.get("rounds", []) if process_data else []
    target_round = next((r for r in rounds if r["round_number"] == round_num), None)
    if not target_round:
        target_round = {"round_number": round_num, "round_name": f"Round {round_num}"}
    return bulk_exporter.export_round_update_template_data(
        round_students, drive_info=drive, round_info=target_round, format_type=format
    )
