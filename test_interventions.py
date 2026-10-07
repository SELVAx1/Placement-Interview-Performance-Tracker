import pytest
from fastapi.testclient import TestClient
from app import app
import db
import intervention_service

client = TestClient(app)

def test_list_interventions_and_students():
    coord = db.get_user_by_gmail("coordinator@gmail.com")
    assert coord is not None
    coord_uuid = coord["uuid"]

    res = client.get(
        "/api/interventions/students",
        headers={
            "x-user-id": coord_uuid,
            "x-user-role": "Coordinator",
            "x-department": "CSE"
        }
    )
    assert res.status_code == 200
    json_data = res.json()
    assert json_data["success"] is True
    assert "students" in json_data
    # Coordinator has full visibility of multiple students across departments
    assert len(json_data["students"]) >= 3

def test_student_interventions_endpoint():
    coord = db.get_user_by_gmail("coordinator@gmail.com")
    assert coord is not None
    coord_uuid = coord["uuid"]

    students = db.get_students_for_scope(coord_uuid, "Coordinator", "CSE")
    assert len(students) > 0
    student_uuid = students[0]["uuid"]

    res = client.get(
        f"/api/interventions/{student_uuid}",
        headers={
            "x-user-id": coord_uuid,
            "x-user-role": "Coordinator",
            "x-department": "CSE"
        }
    )
    assert res.status_code == 200
    json_data = res.json()
    assert json_data["success"] is True
    assert "interventions" in json_data


def test_failure_risk_weights_drive_difficulty(monkeypatch):
    monkeypatch.setattr(
        intervention_service.db,
        "get_drive_failure_rates",
        lambda drive_ids: {"easy-drive": 0.15, "hard-drive": 0.85},
    )
    monkeypatch.setattr(
        intervention_service,
        "sample_result_classification",
        lambda res, *args: intervention_service.classify_result(res),
    )

    easy_drive_failure = intervention_service.analyse_student_patterns([
        {"drive_id": "easy-drive", "result": "Rejected", "round": 1}
    ])
    hard_drive_failure = intervention_service.analyse_student_patterns([
        {"drive_id": "hard-drive", "result": "Rejected", "round": 1}
    ])

    assert easy_drive_failure["risk_probability_mean"] > hard_drive_failure["risk_probability_mean"]
    assert 0 <= easy_drive_failure["risk_probability"] <= 1
    assert 0 <= hard_drive_failure["risk_probability"] <= 1
    assert len(easy_drive_failure["risk_interval"]) == 2


def test_risk_probability_is_sampled_from_posterior(monkeypatch):
    monkeypatch.setattr(
        intervention_service.db,
        "get_drive_failure_rates",
        lambda drive_ids: {"easy-drive": 0.15},
    )
    samples = {
        intervention_service.analyse_student_patterns([
            {"drive_id": "easy-drive", "result": "Rejected", "round": 1}
        ])["risk_probability"]
        for _ in range(8)
    }
    assert len(samples) > 1


def test_derived_failure_analysis_is_non_deterministic(monkeypatch):
    monkeypatch.setattr(
        intervention_service.db,
        "get_drive_failure_rates",
        lambda drive_ids: {"easy-drive": 0.15},
    )
    records = [
        {"drive_id": "easy-drive", "result": "Rejected", "round": 1, "weakness_area": "DSA"},
        {"drive_id": "easy-drive", "result": "Selected", "round": 2, "score": 80},
    ]
    analyses = [intervention_service.analyse_student_patterns(records) for _ in range(12)]
    derived_results = {
        (analysis["passed_rounds"], analysis["failed_rounds"], tuple(analysis["sampled_classifications"]))
        for analysis in analyses
    }
    assert len(derived_results) > 1


def test_coordinator_generate_ai_intervention_for_roster_student():
    """Verify coordinator has full access to trigger AI plan for any student in roster."""
    coord = db.get_user_by_gmail("coordinator@gmail.com")
    assert coord is not None
    coord_uuid = coord["uuid"]

    res = client.post(
        "/api/interventions/generate",
        headers={
            "x-user-id": coord_uuid,
            "x-user-role": "Coordinator",
            "x-department": "CSE"
        },
        json={
            "gmail": "vikram.patel@college.edu"
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "intervention" in data
    assert data["intervention"]["student_gmail"] == "vikram.patel@college.edu"
    assert len(data["intervention"]["actions"]) > 0

def test_coordinator_custom_intervention_lifecycle():
    """Verify coordinator can create custom intervention, append actions, update status, and complete tasks."""
    coord = db.get_user_by_gmail("coordinator@gmail.com")
    assert coord is not None
    coord_uuid = coord["uuid"]

    # 1. Create custom intervention
    res = client.post(
        "/api/interventions/custom",
        headers={
            "x-user-id": coord_uuid,
            "x-user-role": "Coordinator",
            "x-department": "CSE"
        },
        json={
            "gmail": "deepa.krishnan@college.edu",
            "title": "Specialized Hardware & Embedded Systems Practice",
            "failure_summary": "Core embedded system questions difficulty.",
            "ai_analysis": "Focus on microcontroller architecture and mock interview practice.",
            "priority": "HIGH",
            "actions": [
                {
                    "title": "Complete 8051 & ARM Architecture Revision",
                    "weakness_area": "Embedded Systems",
                    "resources": "Department Embedded Systems Lab Manual",
                    "due_date": "2026-10-30"
                }
            ]
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    iv_id = data["intervention"]["id"]
    action_id = data["intervention"]["actions"][0]["id"]

    # 2. Add an action task
    res_act = client.post(
        f"/api/interventions/{iv_id}/actions",
        headers={
            "x-user-id": coord_uuid,
            "x-user-role": "Coordinator",
            "x-department": "CSE"
        },
        json={
            "title": "Mock Technical Interview with Prof. Ramesh",
            "weakness_area": "Microcontrollers",
            "resources": "Interview Room 1",
            "due_date": "2026-11-05"
        }
    )
    assert res_act.status_code == 200
    assert res_act.json()["success"] is True

    # 3. Change status to IN_PROGRESS
    res_status = client.patch(
        f"/api/interventions/{iv_id}/status",
        headers={
            "x-user-id": coord_uuid,
            "x-user-role": "Coordinator",
            "x-department": "CSE"
        },
        json={"status": "IN_PROGRESS"}
    )
    assert res_status.status_code == 200
    assert res_status.json()["status"] == "IN_PROGRESS"

    # 4. Check off action task
    res_check = client.patch(
        f"/api/intervention/actions/{action_id}",
        headers={
            "x-user-id": coord_uuid,
            "x-user-role": "Coordinator",
            "x-department": "CSE"
        },
        json={"completed": True, "notes": "Completed and signed off by mentor."}
    )
    assert res_check.status_code == 200
    assert res_check.json()["success"] is True
