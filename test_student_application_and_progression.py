import pytest
from fastapi.testclient import TestClient
from app import app
import db

client = TestClient(app)

def test_student_apply_only_appears_in_round_1_not_selected():
    """
    Test user request:
    When candidate student applies for the interview process:
    - He should ONLY appear in the first round.
    - He must NOT be selected in the first round (cleared_count == 0).
    - He must NOT appear in the second round.
    """
    db.init_db()

    # 1. Create a 3-round test drive
    drive_payload = {
        "company_name": "ProgressionCorp Test",
        "job_role": "Software Developer",
        "ctc_lpa": 14.0,
        "min_cgpa": 7.0,
        "allowed_branches": "CSE, IT",
        "location": "Hyderabad",
        "total_rounds": 3,
        "description": "3-stage recruitment drive."
    }
    create_res = client.post("/api/drives", json=drive_payload)
    assert create_res.status_code == 201
    drive = create_res.json()["drive"]
    drive_id = drive["id"]

    test_student = "alice_applicant@gmail.com"

    # 2. Student applies for the drive
    apply_res = client.post("/api/student/apply", json={
        "drive_id": drive_id,
        "gmail": test_student
    })
    assert apply_res.status_code == 200
    app_data = apply_res.json()
    assert app_data["success"] is True
    assert app_data["registration"]["round"] == 1
    assert app_data["registration"]["result"] == "Applied"

    # 3. Check /api/drives/{drive_id}/process
    # Candidate should ONLY appear in Round 1, NOT be cleared/selected in Round 1, and NOT appear in Round 2
    proc_res = client.get(f"/api/drives/{drive_id}/process")
    assert proc_res.status_code == 200
    p_data = proc_res.json()

    r1 = p_data["rounds"][0]
    r2 = p_data["rounds"][1]
    r3 = p_data["rounds"][2]

    # Round 1: Appeared = 1, Cleared = 0, In Progress = 1
    assert r1["appeared_count"] == 1, "Candidate must appear in Round 1"
    assert r1["cleared_count"] == 0, "Candidate must NOT be selected in Round 1 on apply"
    assert r1["in_progress_count"] == 1, "Candidate must be in progress for Round 1"
    assert len(r1["cleared_students"]) == 0

    # Round 2: Appeared = 0
    assert r2["appeared_count"] == 0, "Candidate must NOT appear in Round 2 yet"
    assert r2["cleared_count"] == 0

    # Round 3: Appeared = 0
    assert r3["appeared_count"] == 0

    # Overall Summary: Selected count = 0
    assert p_data["summary"]["selected_count"] == 0, "Must NOT be final selected"

    # 4. Placement coordinator updates the record to advance student (clears Round 1 -> appears in Round 2)
    # The student MUST move to appear in Round 2, but MUST NOT be selected in Round 2!
    adv_res = client.post(f"/api/drives/{drive_id}/advance-candidate", json={
        "gmail": test_student,
        "action": "advance"
    })
    assert adv_res.status_code == 200
    adv_data = adv_res.json()
    assert adv_data["success"] is True
    assert adv_data["result"]["round"] == 2
    assert "Round 2" in adv_data["result"]["result"]

    # 5. Check process funnel after Round 1 clearance
    proc_res2 = client.get(f"/api/drives/{drive_id}/process")
    assert proc_res2.status_code == 200
    p_data2 = proc_res2.json()

    r1_after = p_data2["rounds"][0]
    r2_after = p_data2["rounds"][1]
    r3_after = p_data2["rounds"][2]

    # Round 1: Cleared = 1
    assert r1_after["cleared_count"] == 1, "Candidate cleared Round 1"
    assert len(r1_after["cleared_students"]) == 1

    # Round 2: Appeared = 1, BUT Cleared = 0!
    assert r2_after["appeared_count"] == 1, "Candidate now appears in Round 2"
    assert r2_after["cleared_count"] == 0, "Candidate must NOT be selected in Round 2 yet!"
    assert r2_after["in_progress_count"] == 1, "Candidate must be in progress for Round 2"
    assert len(r2_after["cleared_students"]) == 0

    # Round 3: Appeared = 0
    assert r3_after["appeared_count"] == 0

    # Still not final selected
    assert p_data2["summary"]["selected_count"] == 0

    # 6. Placement coordinator advances student from Round 2 to Round 3
    adv_res2 = client.post(f"/api/drives/{drive_id}/advance-candidate", json={
        "gmail": test_student,
        "action": "advance"
    })
    assert adv_res2.status_code == 200
    assert adv_res2.json()["result"]["round"] == 3

    proc_res3 = client.get(f"/api/drives/{drive_id}/process")
    p_data3 = proc_res3.json()
    r2_after2 = p_data3["rounds"][1]
    r3_after2 = p_data3["rounds"][2]

    assert r2_after2["cleared_count"] == 1, "Now cleared Round 2"
    assert r3_after2["appeared_count"] == 1, "Now appears in Round 3"
    assert r3_after2["cleared_count"] == 0, "Must NOT be selected in Round 3 yet!"
    assert p_data3["summary"]["selected_count"] == 0

    # 7. Finally, coordinator marks student as Selected in the final round (Round 3)
    select_res = client.post(f"/api/drives/{drive_id}/advance-candidate", json={
        "gmail": test_student,
        "action": "select"
    })
    assert select_res.status_code == 200
    assert select_res.json()["result"]["result"] == "Selected"

    proc_res4 = client.get(f"/api/drives/{drive_id}/process")
    p_data4 = proc_res4.json()
    r3_after3 = p_data4["rounds"][2]

    assert r3_after3["cleared_count"] == 1, "Now cleared final Round 3"
    assert p_data4["summary"]["selected_count"] == 1, "Now final selected!"
    assert len(p_data4["selected_students"]) == 1
    assert p_data4["selected_students"][0]["gmail"] == test_student
