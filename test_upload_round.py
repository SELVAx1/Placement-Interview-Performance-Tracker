from fastapi.testclient import TestClient
import db
from app import app
import io
import openpyxl

# Initialize database
db.init_db()

client = TestClient(app)

def test_drive_result_upload_and_round_increment():
    print("Testing Excel upload without 'result' column & round incrementing...")
    
    # 1. Fetch drives
    drives_res = client.get("/api/drives")
    assert drives_res.status_code == 200
    drives = drives_res.json()["drives"]
    assert len(drives) > 0, "No drives found"
    
    drive_id = drives[0]["id"]
    print(f"Target drive ID: {drive_id} ({drives[0]['company_name']})")

    # Clean previous test entries to ensure clean starting state
    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM student_drive_results WHERE gmail IN ('student1@example.com', 'student2@example.com')")
    cursor.execute("UPDATE drives SET current_round = 1 WHERE id = ?", (drive_id,))
    conn.commit()
    conn.close()
    
    # 2. Create sample Excel file in memory with ONLY 'gmail' column header
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Student Gmail", "Student Name", "Branch"]) # NO 'result' column!
    ws.append(["student1@example.com", "Student One", "CSE"])
    ws.append(["student2@example.com", "Student Two", "ECE"])
    
    excel_bytes = io.BytesIO()
    wb.save(excel_bytes)
    excel_bytes.seek(0)
    
    # 3. Upload Excel file for the drive (Round 1 -> Round 2)
    files = {
        "file": ("shortlist_round1.xlsx", excel_bytes.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    }
    
    res1 = client.post(f"/api/drives/{drive_id}/upload-results", files=files)
    print("Upload 1 Status:", res1.status_code)
    print("Upload 1 Response:", res1.json())
    assert res1.status_code == 200, f"Expected 200 OK, got {res1.status_code}: {res1.text}"
    data1 = res1.json()
    assert data1["success"] is True
    assert data1["updated_count"] == 2
    
    # Check results in DB for this drive
    results_res1 = client.get(f"/api/drives/{drive_id}/results")
    assert results_res1.status_code == 200
    r_data1 = results_res1.json()["results"]
    print("Results after Upload 1:", r_data1)
    
    for item in r_data1:
        if item["gmail"] in ["student1@example.com", "student2@example.com"]:
            assert item["round"] == 2, f"Expected round 2, got {item['round']}"
            assert "Round 2" in item["result"]
            
    print("FIRST UPLOAD PASSED: Students promoted to Round 2!")
    
    # 4. Upload Excel file again for the same drive (Round 2 -> Round 3)
    wb2 = openpyxl.Workbook()
    ws2 = wb2.active
    ws2.append(["email"]) # Only student1 selected for Round 3
    ws2.append(["student1@example.com"])
    
    excel_bytes2 = io.BytesIO()
    wb2.save(excel_bytes2)
    excel_bytes2.seek(0)
    
    files2 = {
        "file": ("shortlist_round2.xlsx", excel_bytes2.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    }
    
    res2 = client.post(f"/api/drives/{drive_id}/upload-results", files=files2)
    print("Upload 2 Status:", res2.status_code)
    print("Upload 2 Response:", res2.json())
    assert res2.status_code == 200
    
    results_res2 = client.get(f"/api/drives/{drive_id}/results")
    r_data2 = results_res2.json()["results"]
    print("Results after Upload 2:", r_data2)
    
    student1_rec = next(r for r in r_data2 if r["gmail"] == "student1@example.com")
    assert student1_rec["round"] == 3, f"Expected round 3 for student1, got {student1_rec['round']}"
    assert "Round 3" in student1_rec["result"]
    
    print("SECOND UPLOAD PASSED: student1 promoted to Round 3!")
    
    # 5. Check student dashboard results endpoint
    student_res = client.get("/api/student/results?gmail=student1@example.com")
    assert student_res.status_code == 200
    st_data = student_res.json()["results"]
    assert len(st_data) > 0
    assert st_data[0]["round"] == 3
    print("STUDENT DASHBOARD ENDPOINT PASSED!")

def test_company_interview_process_and_selected_exports():
    """Verify complete interview stages pipeline API, selected students export, and round update template download."""
    drives_res = client.get("/api/drives")
    assert drives_res.status_code == 200
    drives = drives_res.json()["drives"]
    assert len(drives) > 0
    drive_id = drives[0]["id"]

    # 1. Test Process details endpoint
    proc_res = client.get(f"/api/drives/{drive_id}/process")
    assert proc_res.status_code == 200
    p_data = proc_res.json()
    assert p_data["success"] is True
    assert "rounds" in p_data
    assert len(p_data["rounds"]) > 0
    assert "summary" in p_data
    assert "total_candidates" in p_data["summary"]
    assert "selected_count" in p_data["summary"]

    # 2. Test Selected students Excel export
    selected_export_res = client.get(f"/api/drives/{drive_id}/export/selected")
    assert selected_export_res.status_code == 200
    assert "spreadsheetml" in selected_export_res.headers.get("content-type", "")
    assert len(selected_export_res.content) > 0

    # 3. Test Round update template Excel export
    round_tpl_res = client.get(f"/api/drives/{drive_id}/export/round/1/template")
    assert round_tpl_res.status_code == 200
    assert "spreadsheetml" in round_tpl_res.headers.get("content-type", "")
    assert len(round_tpl_res.content) > 0

    # 4. Verify candidates selected in current round are pre-populated in next round templates
    round2_tpl_res = client.get(f"/api/drives/{drive_id}/export/round/2/template")
    assert round2_tpl_res.status_code == 200
    wb_r2 = openpyxl.load_workbook(io.BytesIO(round2_tpl_res.content))
    ws_r2 = wb_r2.active
    r2_emails = [cell.value for cell in [row[0] for row in list(ws_r2.iter_rows())[1:]]]
    assert "student1@example.com" in r2_emails, "student1 should be in Round 2 template"
    assert "student2@example.com" in r2_emails, "student2 should be in Round 2 template"

    round3_tpl_res = client.get(f"/api/drives/{drive_id}/export/round/3/template")
    assert round3_tpl_res.status_code == 200
    wb_r3 = openpyxl.load_workbook(io.BytesIO(round3_tpl_res.content))
    ws_r3 = wb_r3.active
    r3_emails = [cell.value for cell in [row[0] for row in list(ws_r3.iter_rows())[1:]]]
    assert "student1@example.com" in r3_emails, "student1 should be in Round 3 template after clearing Round 2"


def test_coordinator_student_tracking_year_dept_process_interventions():
    # 1. Fetch default student tracking
    res = client.get("/api/coordinator/students-tracking")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "students" in data
    assert "stats" in data
    assert data["stats"]["total_students"] > 0
    assert "available_years" in data
    assert "available_departments" in data

    # 2. Test Year-wise filter (4th Year vs 3rd Year)
    res_4th = client.get("/api/coordinator/students-tracking?year=4th%20Year")
    assert res_4th.status_code == 200
    data_4th = res_4th.json()
    assert data_4th["success"] is True
    for s in data_4th["students"]:
        assert "4th Year" in s["year"]

    res_3rd = client.get("/api/coordinator/students-tracking?year=3rd%20Year")
    assert res_3rd.status_code == 200
    data_3rd = res_3rd.json()
    assert data_3rd["success"] is True
    for s in data_3rd["students"]:
        assert "3rd Year" in s["year"]

    # 3. Test Department filter (CSE)
    res_cse = client.get("/api/coordinator/students-tracking?department=CSE")
    assert res_cse.status_code == 200
    data_cse = res_cse.json()
    assert data_cse["success"] is True
    for s in data_cse["students"]:
        assert s["department"].upper() == "CSE"

    # 4. Verify process history & interventions are attached
    students_with_process = [s for s in data["students"] if len(s["process_history"]) > 0]
    assert len(students_with_process) > 0, "Expected at least one student with recruitment process history"
    first_with_proc = students_with_process[0]
    assert "company_name" in first_with_proc["process_history"][0]
    assert "round" in first_with_proc["process_history"][0]
    assert "result" in first_with_proc["process_history"][0]

    students_with_iv = [s for s in data["students"] if len(s["interventions"]) > 0]
    assert len(students_with_iv) > 0, "Expected at least one student with interventions"
    first_iv = students_with_iv[0]["interventions"][0]
    assert "title" in first_iv
    assert "priority" in first_iv
    assert "actions" in first_iv

    # 5. Test Excel cohort export
    export_res = client.get("/api/coordinator/export/students-tracking?year=4th%20Year&department=CSE")
    assert export_res.status_code == 200
    assert "spreadsheetml" in export_res.headers.get("content-type", "")
    assert len(export_res.content) > 0
    assert "attachment" in export_res.headers.get("content-disposition", "")

    # 6. Test Individual Student Dossier Excel (.xlsx) export
    test_student = data["students"][0]
    reg_no = test_student["register_number"]
    ind_res = client.get(f"/api/coordinator/student/{reg_no}")
    assert ind_res.status_code == 200
    assert ind_res.json()["student"]["name"] == test_student["name"]

    ind_export_res = client.get(f"/api/coordinator/export/student/{reg_no}")
    assert ind_export_res.status_code == 200
    assert "spreadsheetml" in ind_export_res.headers.get("content-type", "")
    assert len(ind_export_res.content) > 0
    assert "attachment" in ind_export_res.headers.get("content-disposition", "")

if __name__ == "__main__":
    test_drive_result_upload_and_round_increment()
    test_company_interview_process_and_selected_exports()
    test_coordinator_student_tracking_year_dept_process_interventions()
    print("\nALL ROUND INCREMENT, PROCESS & STUDENT TRACKING TESTS PASSED SUCCESSFULLY!")


