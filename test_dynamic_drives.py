import pytest
from fastapi.testclient import TestClient
from app import app
import db

client = TestClient(app)

def test_create_drive_custom_rounds_and_description():
    """Test coordinator creating a drive with custom rounds and round descriptions."""
    payload = {
        "company_name": "DynamicCorp Test",
        "job_role": "AI Engineer",
        "ctc_lpa": 18.5,
        "min_cgpa": 7.5,
        "allowed_branches": "CSE, IT, AI-DS",
        "location": "Bengaluru",
        "status": "Active",
        "deadline": "2026-11-30",
        "description": "Leading AI research laboratory hiring specialized engineers for LLM systems.",
        "total_rounds": 3,
        "rounds": [
            {
                "round_number": 1,
                "round_name": "Online AI & Machine Learning Assessment",
                "round_type": "CODING",
                "description": "60 mins: Python, PyTorch fundamentals, and algorithm puzzle."
            },
            {
                "round_number": 2,
                "round_name": "Deep Learning & System Architecture",
                "round_type": "TECHNICAL",
                "description": "Hands-on model architecture, distributed training, and latency optimization."
            },
            {
                "round_number": 3,
                "round_name": "Research Director Discussion",
                "round_type": "HR",
                "description": "Culture alignment, research vision, and compensation structuring."
            }
        ]
    }

    res = client.post("/api/drives", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["success"] is True
    drive = data["drive"]
    drive_id = drive["id"]
    assert drive["company_name"] == "DynamicCorp Test"
    assert drive["total_rounds"] == 3
    assert drive["description"] == "Leading AI research laboratory hiring specialized engineers for LLM systems."
    assert len(drive["rounds"]) == 3
    assert drive["rounds"][0]["round_name"] == "Online AI & Machine Learning Assessment"
    assert drive["rounds"][1]["round_type"] == "TECHNICAL"
    assert drive["rounds"][2]["round_name"] == "Research Director Discussion"

    # Test GET /api/drives/{drive_id}/process
    proc_res = client.get(f"/api/drives/{drive_id}/process")
    assert proc_res.status_code == 200
    proc_data = proc_res.json()
    assert proc_data["success"] is True
    assert proc_data["drive"]["total_rounds"] == 3
    assert proc_data["drive"]["description"] == payload["description"]
    assert len(proc_data["rounds"]) == 3
    assert proc_data["rounds"][0]["round_name"] == "Online AI & Machine Learning Assessment"

    # Test altering / updating the drive via PUT /api/drives/{drive_id}
    # Alter total_rounds to 4, update description and add round 4
    alter_payload = {
        "job_role": "Senior AI Engineer",
        "ctc_lpa": 22.0,
        "description": "Updated: Senior level AI research team hiring for frontier models.",
        "total_rounds": 4,
        "rounds": [
            {
                "round_number": 1,
                "round_name": "Online AI & Machine Learning Assessment",
                "round_type": "CODING",
                "description": "Updated assessment guidelines."
            },
            {
                "round_number": 2,
                "round_name": "Deep Learning & System Architecture",
                "round_type": "TECHNICAL",
                "description": "Hands-on model architecture."
            },
            {
                "round_number": 3,
                "round_name": "Take-Home Project Review",
                "round_type": "TECHNICAL",
                "description": "Defense of take-home codebase with senior staff."
            },
            {
                "round_number": 4,
                "round_name": "Executive Leadership & Offer",
                "round_type": "MANAGERIAL",
                "description": "VP of Engineering final round."
            }
        ]
    }

    alter_res = client.put(f"/api/drives/{drive_id}", json=alter_payload)
    assert alter_res.status_code == 200
    alt_data = alter_res.json()
    assert alt_data["success"] is True
    alt_drive = alt_data["drive"]
    assert alt_drive["job_role"] == "Senior AI Engineer"
    assert alt_drive["ctc_lpa"] == 22.0
    assert alt_drive["total_rounds"] == 4
    assert alt_drive["description"] == alter_payload["description"]
    assert len(alt_drive["rounds"]) == 4
    assert alt_drive["rounds"][2]["round_name"] == "Take-Home Project Review"
    assert alt_drive["rounds"][3]["round_name"] == "Executive Leadership & Offer"

    # Verify process endpoint reflects altered rounds
    proc_res2 = client.get(f"/api/drives/{drive_id}/process")
    assert proc_res2.status_code == 200
    p2 = proc_res2.json()
    assert len(p2["rounds"]) == 4
    assert p2["drive"]["total_rounds"] == 4


def test_create_drive_auto_progressive_rounds():
    """Test creating drive specifying total_rounds=2 without custom rounds array (auto-generates 2 rounds)."""
    payload = {
        "company_name": "QuickHire Labs",
        "job_role": "Frontend Intern",
        "ctc_lpa": 6.0,
        "min_cgpa": 6.0,
        "allowed_branches": "All",
        "location": "Remote",
        "status": "Active",
        "total_rounds": 2,
        "description": "Rapid 2-round recruitment for frontend internship."
    }
    res = client.post("/api/drives", json=payload)
    assert res.status_code == 201
    drive = res.json()["drive"]
    assert drive["total_rounds"] == 2
    assert len(drive["rounds"]) == 2
    assert drive["rounds"][0]["round_number"] == 1
    assert drive["rounds"][1]["round_number"] == 2
