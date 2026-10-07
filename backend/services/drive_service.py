import db


def list_drives():
    drives = db.get_all_drives()
    for drive in drives:
        drive["results_count"] = db.get_drive_results_count(drive["id"])
    return drives


def create_drive(data):
    rounds_dicts = [r.dict() for r in data.rounds] if data.rounds else None
    return db.create_drive(
        company_name=data.company_name.strip(),
        job_role=data.job_role.strip(),
        ctc_lpa=data.ctc_lpa,
        min_cgpa=data.min_cgpa,
        allowed_branches=data.allowed_branches.strip(),
        location=data.location.strip(),
        status=data.status.strip() if data.status else "Active",
        deadline=data.deadline,
        description=data.description.strip() if data.description else None,
        total_rounds=data.total_rounds or (len(rounds_dicts) if rounds_dicts else 4),
        rounds=rounds_dicts,
    )


def update_drive(drive_id, data):
    rounds_dicts = [r.dict() for r in data.rounds] if data.rounds is not None else None
    return db.update_drive(
        drive_id=drive_id,
        company_name=data.company_name.strip() if data.company_name else None,
        job_role=data.job_role.strip() if data.job_role else None,
        ctc_lpa=data.ctc_lpa,
        min_cgpa=data.min_cgpa,
        allowed_branches=data.allowed_branches.strip() if data.allowed_branches else None,
        location=data.location.strip() if data.location else None,
        status=data.status.strip() if data.status else None,
        deadline=data.deadline,
        description=data.description.strip() if data.description is not None else None,
        total_rounds=data.total_rounds,
        rounds=rounds_dicts,
    )


def get_results(drive_id):
    return db.get_drive_results(drive_id)


def get_drive(drive_id):
    return db.get_drive(drive_id)
