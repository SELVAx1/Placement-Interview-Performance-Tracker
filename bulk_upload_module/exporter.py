import io
import csv
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from typing import List, Dict, Any, Tuple
from fastapi.responses import Response

def style_worksheet(ws):
    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")  # Navy Blue
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Calibri", size=10)
    border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = border

    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.font = data_font
            cell.border = border
            cell.alignment = Alignment(vertical="center")

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 14)


def build_excel_response(headers: List[str], data_rows: List[List[Any]], sheet_title: str, filename: str) -> Response:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_title
    ws.append(headers)

    for row in data_rows:
        ws.append(row)

    style_worksheet(ws)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


def build_csv_response(headers: List[str], data_rows: List[List[Any]], filename: str, raw_content: bytes = None) -> Response:
    if raw_content is not None:
        return Response(
            content=raw_content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    if headers:
        writer.writerow(headers)
    if data_rows:
        writer.writerows(data_rows)

    return Response(
        content=buffer.getvalue().encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ==============================================================
# 1. EXPORT COMPANY DRIVES
# ==============================================================

def export_company_drives_data(drives: List[Dict[str, Any]], format_type: str = "xlsx") -> Response:
    headers = [
        "Company Name", "Job Role", "CTC LPA", "Company Type", 
        "Required CGPA", "Allowed Branches", "Total Rounds", 
        "Location", "Drive Date", "Status", "Created At"
    ]
    data_rows = []
    for d in drives:
        data_rows.append([
            d.get("company_name", ""),
            d.get("job_role", ""),
            d.get("ctc_lpa", 0.0),
            d.get("company_type", "PRODUCT"),
            d.get("required_cgpa", 0.0),
            d.get("allowed_branches", "All"),
            d.get("total_rounds", 4),
            d.get("location", "On Campus"),
            d.get("drive_date", ""),
            d.get("status", "Active"),
            d.get("created_at", "")
        ])

    if format_type.lower() == "csv":
        return build_csv_response(headers, data_rows, "company_drives_export.csv")
    return build_excel_response(headers, data_rows, "Company Drives", "company_drives_export.xlsx")


# ==============================================================
# 2. EXPORT DRIVE RESULTS / STUDENT DRIVE CANDIDATES
# ==============================================================

def export_drive_results_data(results: List[Dict[str, Any]], drive_info: Dict[str, Any] = None, format_type: str = "xlsx") -> Response:
    company_name = drive_info.get("company_name", "Drive") if drive_info else "Drive"
    role = drive_info.get("job_role", "") if drive_info else ""
    safe_name = f"{company_name.lower().replace(' ', '_')}_results"

    headers = [
        "Student Gmail", "Current Round", "Score / Marks", "Selection Verdict / Status", "Last Updated"
    ]
    data_rows = []
    for r in results:
        data_rows.append([
            r.get("gmail", ""),
            r.get("round", 1),
            r.get("score") if r.get("score") is not None else "N/A",
            r.get("result", ""),
            r.get("updated_at", "")
        ])

    if format_type.lower() == "csv":
        return build_csv_response(headers, data_rows, f"{safe_name}.csv")
    return build_excel_response(headers, data_rows, f"{company_name[:20]} Results", f"{safe_name}.xlsx")


# ==============================================================
# 3. EXPORT STUDENT ACADEMIC ROSTER
# ==============================================================

def export_student_roster_data(students: List[Dict[str, Any]], format_type: str = "xlsx") -> Response:
    headers = [
        "Register Number", "Full Name", "Student Email", "Department", 
        "CGPA", "10th Percentage", "12th Percentage", "Technical Skills", "Registered Date"
    ]
    data_rows = []
    for s in students:
        data_rows.append([
            s.get("register_number", ""),
            s.get("name", ""),
            s.get("email", ""),
            s.get("department", ""),
            s.get("cgpa", 0.0),
            s.get("tenth_percentage", "N/A"),
            s.get("twelfth_percentage", "N/A"),
            s.get("skills", ""),
            s.get("created_at", "")
        ])

    if format_type.lower() == "csv":
        return build_csv_response(headers, data_rows, "student_roster_export.csv")
    return build_excel_response(headers, data_rows, "Student Roster", "student_roster_export.xlsx")


# ==============================================================
# 4. EXPORT USER ACCESS ACCOUNTS
# ==============================================================

def export_user_access_data(users: List[Dict[str, Any]], format_type: str = "xlsx") -> Response:
    headers = ["User Email", "Role", "Is Active", "Account Created At"]
    data_rows = []
    for u in users:
        data_rows.append([
            u.get("gmail", ""),
            u.get("role", "Student"),
            "Active" if u.get("is_active") else "Inactive",
            u.get("created_at", "")
        ])

    if format_type.lower() == "csv":
        return build_csv_response(headers, data_rows, "user_accounts_export.csv")
    return build_excel_response(headers, data_rows, "User Accounts", "user_accounts_export.xlsx")


# ==============================================================
# 5. EXPORT SELECTED STUDENTS FOR A COMPANY DRIVE
# ==============================================================

def export_selected_students_data(selected_students: List[Dict[str, Any]], drive_info: Dict[str, Any] = None, format_type: str = "xlsx") -> Response:
    company_name = drive_info.get("company_name", "Company") if drive_info else "Company"
    job_role = drive_info.get("job_role", "") if drive_info else ""
    ctc_lpa = drive_info.get("ctc_lpa", 0.0) if drive_info else 0.0
    safe_name = f"{company_name.lower().replace(' ', '_')}_selected_students"

    headers = [
        "Company Name", "Job Role", "Register Number", "Student Name", "Student Gmail",
        "Department", "CGPA", "Round Cleared", "Selection Verdict", "Offered Package (LPA)", "Last Updated"
    ]
    data_rows = []
    for s in selected_students:
        data_rows.append([
            company_name,
            job_role,
            s.get("register_number") or "N/A",
            s.get("student_name") or s.get("name") or "Student",
            s.get("gmail") or s.get("email", ""),
            s.get("department") or "CSE",
            s.get("cgpa") if s.get("cgpa") is not None else "N/A",
            f"Round {s.get('round', 1)}",
            s.get("result") or "Selected",
            f"{ctc_lpa} LPA" if ctc_lpa else "N/A",
            s.get("updated_at") or ""
        ])

    if format_type.lower() == "csv":
        return build_csv_response(headers, data_rows, f"{safe_name}.csv")
    sheet_title = f"{company_name[:20]} Selected"
    return build_excel_response(headers, data_rows, sheet_title, f"{safe_name}.xlsx")


# ==============================================================
# 6. EXPORT ROUND UPDATE TEMPLATE PRE-FILLED WITH CLEARED STUDENTS
# ==============================================================

def export_round_update_template_data(round_students: List[Dict[str, Any]], drive_info: Dict[str, Any] = None, round_info: Dict[str, Any] = None, format_type: str = "xlsx") -> Response:
    company_name = drive_info.get("company_name", "Company") if drive_info else "Company"
    round_num = round_info.get("round_number", 1) if round_info else 1
    total_rounds = drive_info.get("total_rounds", 4) if drive_info else 4
    is_final_round = (round_num >= total_rounds)
    safe_name = f"{company_name.lower().replace(' ', '_')}_round_{round_num}_update_template"

    headers = [
        "Student Gmail", "Student Name", "Department", "Current Round", "Result Status / Verdict", "Score", "Feedback", "Weakness Area"
    ]
    data_rows = []
    for s in round_students:
        data_rows.append([
            s.get("gmail") or s.get("email", ""),
            s.get("student_name") or s.get("name", ""),
            s.get("department") or "CSE",
            f"Round {round_num}",
            s.get("next_verdict") or "",
            s.get("score") if s.get("score") is not None else "",
            s.get("feedback") or "",
            s.get("weakness_area") or ""
        ])

    if format_type.lower() == "csv":
        return build_csv_response(headers, data_rows, f"{safe_name}.csv")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"Round {round_num} Update"
    ws.append(headers)
    for row in data_rows:
        ws.append(row)
    style_worksheet(ws)

    # Add Dropdown Data Validation for Result Status / Verdict (Column E)
    from openpyxl.worksheet.datavalidation import DataValidation
    from openpyxl.formatting.rule import CellIsRule
    from openpyxl.styles import PatternFill, Font

    q = '"'
    if is_final_round:
        options_list = f'{q}Selected,Rejected{q}'
    else:
        options_list = f'{q}Selected,Rejected,Shortlisted for Round {round_num + 1}{q}'

    dv = DataValidation(type="list", formula1=options_list, allow_blank=True)
    dv.error = 'Please select a valid status from the dropdown: Selected or Rejected.'
    dv.errorTitle = 'Invalid Result Status'
    dv.prompt = f'Select candidate outcome for Round {round_num}: Selected (Green) or Rejected (Red)'
    dv.promptTitle = 'Result Status / Verdict'
    ws.add_data_validation(dv)

    max_validation_row = max(len(data_rows) + 100, 100)
    dv.add(f"E2:E{max_validation_row}")

    # Conditional Formatting:
    # 'Selected' highlights in Green (soft emerald background with bold dark green text)
    # 'Rejected' highlights in Red (soft crimson background with bold dark red text)
    green_fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
    green_font = Font(color="047857", bold=True)
    red_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    red_font = Font(color="B91C1C", bold=True)

    ws.conditional_formatting.add(
        f"E2:E{max_validation_row}",
        CellIsRule(operator="equal", formula=['"Selected"'], stopIfTrue=True, fill=green_fill, font=green_font)
    )
    ws.conditional_formatting.add(
        f"E2:E{max_validation_row}",
        CellIsRule(operator="equal", formula=['"Rejected"'], stopIfTrue=True, fill=red_fill, font=red_font)
    )
    if not is_final_round:
        ws.conditional_formatting.add(
            f"E2:E{max_validation_row}",
            CellIsRule(operator="equal", formula=[f'"Shortlisted for Round {round_num + 1}"'], stopIfTrue=True, fill=green_fill, font=green_font)
        )

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.xlsx"'}
    )


# ==============================================================
# 7. EXPORT STUDENTS YEAR-WISE & DEPT-WISE TRACKING REPORT
# ==============================================================

def export_students_tracking_data(students: List[Dict[str, Any]], filter_meta: Dict[str, Any] = None, format_type: str = "xlsx") -> Response:
    year_str = (filter_meta.get("year") or "all_years").lower().replace(" ", "_") if filter_meta else "all_years"
    dept_str = (filter_meta.get("department") or "all_depts").lower().replace(" ", "_") if filter_meta else "all_depts"
    safe_name = f"students_tracking_{year_str}_{dept_str}_report"

    headers = [
        "Register Number", "Student Name", "Email", "Department", "Academic Year",
        "CGPA", "Placement Status", "Placed Company", "Offered Role", "Package (CTC LPA)",
        "Interview Process / Drives Attended", "Active Interventions", "Risk Level", "Skills"
    ]
    data_rows = []
    for s in students:
        process_items = []
        for p in s.get("process_history", []):
            comp = p.get("company_name", "Drive")
            rnd = f"R{p.get('round', 1)}"
            res = p.get("result", "")
            process_items.append(f"{comp} ({rnd}: {res})")
        process_summary = "; ".join(process_items) if process_items else "No drives attended yet"

        intervention_items = []
        for iv in s.get("interventions", []):
            title = iv.get("title", "")
            pri = iv.get("priority", "MED")
            stat = iv.get("status", "OPEN")
            intervention_items.append(f"[{pri}|{stat}] {title}")
        interventions_summary = "; ".join(intervention_items) if intervention_items else "None (Clear record)"

        data_rows.append([
            s.get("register_number", "N/A"),
            s.get("name", "Student"),
            s.get("email", ""),
            s.get("department", "CSE"),
            s.get("year", "4th Year"),
            s.get("cgpa") if s.get("cgpa") is not None else "N/A",
            s.get("placement_status", "Not Started"),
            s.get("placed_company") or "N/A",
            s.get("placed_role") or "N/A",
            f"{s.get('placed_package')} LPA" if s.get("placed_package") else "N/A",
            process_summary,
            interventions_summary,
            s.get("highest_risk", "NONE"),
            s.get("skills", "")
        ])

    if format_type.lower() == "csv":
        return build_csv_response(headers, data_rows, f"{safe_name}.csv")
    sheet_title = "Students Tracking"
    return build_excel_response(headers, data_rows, sheet_title, f"{safe_name}.xlsx")


# ==============================================================
# 8. EXPORT INDIVIDUAL STUDENT DOSSIER & INTERVENTION TEMPLATE
# ==============================================================

def export_individual_student_dossier(student: Dict[str, Any], format_type: str = "xlsx") -> Response:
    """
    Generate an individual student placement & intervention dossier template:
    - Sheet 1: Student Profile & Performance Summary
    - Sheet 2: Interview Process & Drives Pipeline
    - Sheet 3: Diagnostic Interventions & AI Remediation
    - Sheet 4: Remediation Action Tasks Checklist
    - Sheet 5: Mentor Notes & Coordinator Log
    """
    reg_no = (student.get("register_number") or "STUDENT").strip().replace("/", "_").replace("\\", "_")
    student_name = (student.get("name") or "Student").strip().replace(" ", "_").lower()
    safe_name = f"{reg_no}_{student_name}_placement_dossier"

    if format_type.lower() == "csv":
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["=== STUDENT PLACEMENT & INTERVENTION DOSSIER ==="])
        writer.writerow(["Field", "Value"])
        writer.writerow(["Register Number", student.get("register_number", "")])
        writer.writerow(["Full Name", student.get("name", "")])
        writer.writerow(["Email", student.get("email", "")])
        writer.writerow(["Department", student.get("department", "")])
        writer.writerow(["Academic Year", student.get("year", "4th Year")])
        writer.writerow(["CGPA", student.get("cgpa", "")])
        writer.writerow(["10th Percentage", student.get("tenth_percentage", "")])
        writer.writerow(["12th Percentage", student.get("twelfth_percentage", "")])
        writer.writerow(["Placement Status", student.get("placement_status", "")])
        writer.writerow(["Placed Company", student.get("placed_company") or "N/A"])
        writer.writerow(["Offered Role", student.get("placed_role") or "N/A"])
        writer.writerow(["Package (CTC LPA)", student.get("placed_package") or "N/A"])
        writer.writerow(["Highest Risk Level", student.get("highest_risk", "NONE")])
        writer.writerow(["Technical Skills", student.get("skills", "")])
        writer.writerow([])

        writer.writerow(["=== INTERVIEW PROCESS & DRIVES PIPELINE ==="])
        writer.writerow(["Company Name", "Job Role", "CTC LPA", "Round", "Verdict / Result", "Score", "Feedback", "Weakness Area", "Attempt Date"])
        for p in student.get("process_history", []):
            writer.writerow([
                p.get("company_name", ""),
                p.get("job_role", ""),
                p.get("ctc_lpa", ""),
                p.get("round", 1),
                p.get("result", ""),
                p.get("score") if p.get("score") is not None else "",
                p.get("feedback") or "",
                p.get("weakness_area") or "",
                p.get("attempt_date") or ""
            ])
        writer.writerow([])

        writer.writerow(["=== INTERVENTIONS & REMEDIATION HISTORY ==="])
        writer.writerow(["Intervention Title", "Priority", "Status", "Failure Summary", "AI Analysis & Recommendations", "Logged Date"])
        for iv in student.get("interventions", []):
            writer.writerow([
                iv.get("title", ""),
                iv.get("priority", "MED"),
                iv.get("status", "OPEN"),
                iv.get("failure_summary", ""),
                iv.get("ai_analysis", ""),
                iv.get("created_at", "")
            ])
        writer.writerow([])

        writer.writerow(["=== REMEDIATION ACTION CHECKLIST ==="])
        writer.writerow(["Intervention", "Task Description", "Due Date", "Resource Link", "Completed"])
        for iv in student.get("interventions", []):
            for act in iv.get("actions", []):
                writer.writerow([
                    iv.get("title", ""),
                    act.get("description", ""),
                    act.get("due_date", ""),
                    act.get("resource_url", ""),
                    "YES" if act.get("completed") else "NO"
                ])

        return build_csv_response([], [], f"{safe_name}.csv", raw_content=buffer.getvalue().encode("utf-8-sig"))

    # Multi-worksheet styled Excel Workbook
    wb = openpyxl.Workbook()

    # Common styles
    border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )
    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")  # Navy
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    section_fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")  # Royal Blue
    section_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    label_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    label_font = Font(name="Calibri", size=10, bold=True, color="334155")
    value_font = Font(name="Calibri", size=10, color="0F172A")

    # -------------------------------------------------------------
    # SHEET 1: Profile & Overview
    # -------------------------------------------------------------
    ws_profile = wb.active
    ws_profile.title = "Profile & Overview"
    ws_profile.views.sheetView[0].showGridLines = True

    # Title Banner
    ws_profile.merge_cells("A1:F1")
    title_cell = ws_profile["A1"]
    title_cell.value = "STUDENT PLACEMENT & INTERVENTION DOSSIER"
    title_cell.font = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
    title_cell.fill = header_fill
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws_profile.row_dimensions[1].height = 28

    ws_profile.merge_cells("A2:F2")
    sub_cell = ws_profile["A2"]
    sub_cell.value = f"Generated for {student.get('name', 'Student')} ({student.get('register_number', 'N/A')}) | Placement Coordination System"
    sub_cell.font = Font(name="Calibri", size=9, italic=True, color="64748B")
    sub_cell.fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    sub_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws_profile.row_dimensions[2].height = 18

    # Section 1 Header
    ws_profile.merge_cells("A4:F4")
    sec1 = ws_profile["A4"]
    sec1.value = "1. ACADEMIC & DEMOGRAPHIC INFORMATION"
    sec1.fill = section_fill
    sec1.font = section_font
    sec1.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws_profile.row_dimensions[4].height = 22

    profile_data = [
        ("Register Number", student.get("register_number", "N/A"), "Full Name", student.get("name", "N/A")),
        ("Academic Year", student.get("year", "4th Year"), "Department", student.get("department", "CSE")),
        ("Email Address", student.get("email", "N/A"), "Current CGPA", str(student.get("cgpa", "N/A"))),
        ("10th Percentage", str(student.get("tenth_percentage", "N/A")), "12th Percentage", str(student.get("twelfth_percentage", "N/A"))),
        ("Highest Risk Level", student.get("highest_risk", "NONE"), "Placement Status", student.get("placement_status", "Not Started")),
        ("Placed Company", student.get("placed_company") or "N/A", "Offered Package", f"{student.get('placed_package')} LPA" if student.get("placed_package") else "N/A"),
        ("Offered Role", student.get("placed_role") or "N/A", "Technical Skills", student.get("skills") or "N/A"),
    ]

    curr_row = 5
    for row in profile_data:
        ws_profile.cell(row=curr_row, column=1, value=row[0])
        ws_profile.cell(row=curr_row, column=2, value=row[1])
        ws_profile.cell(row=curr_row, column=4, value=row[2])
        ws_profile.cell(row=curr_row, column=5, value=row[3])
        for c_idx in [1, 4]:
            c = ws_profile.cell(row=curr_row, column=c_idx)
            c.fill = label_fill
            c.font = label_font
            c.border = border
        for c_idx in [2, 5]:
            c = ws_profile.cell(row=curr_row, column=c_idx)
            c.font = value_font
            c.border = border
        ws_profile.row_dimensions[curr_row].height = 20
        curr_row += 1

    # Section 2 Header: Summary KPIs
    curr_row += 1
    ws_profile.merge_cells(f"A{curr_row}:F{curr_row}")
    sec2 = ws_profile[f"A{curr_row}"]
    sec2.value = "2. PLACEMENT & INTERVENTION PERFORMANCE SNAPSHOT"
    sec2.fill = PatternFill(start_color="0F766E", end_color="0F766E", fill_type="solid")  # Teal
    sec2.font = section_font
    sec2.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws_profile.row_dimensions[curr_row].height = 22
    curr_row += 1

    proc_history = student.get("process_history", [])
    interventions = student.get("interventions", [])
    all_actions = []
    for iv in interventions:
        all_actions.extend(iv.get("actions", []))
    completed_actions = sum(1 for a in all_actions if a.get("completed"))

    kpi_rows = [
        ("Total Drives Attended", len(proc_history), "Active Interventions", len(interventions)),
        ("Selection Offers Received", 1 if student.get("placement_status") == "Placed" else 0, "Remediation Action Tasks", len(all_actions)),
        ("Tasks Completed", completed_actions, "Pending Remediation Tasks", len(all_actions) - completed_actions)
    ]
    for row in kpi_rows:
        ws_profile.cell(row=curr_row, column=1, value=row[0])
        ws_profile.cell(row=curr_row, column=2, value=row[1])
        ws_profile.cell(row=curr_row, column=4, value=row[2])
        ws_profile.cell(row=curr_row, column=5, value=row[3])
        for c_idx in [1, 4]:
            c = ws_profile.cell(row=curr_row, column=c_idx)
            c.fill = label_fill
            c.font = label_font
            c.border = border
        for c_idx in [2, 5]:
            c = ws_profile.cell(row=curr_row, column=c_idx)
            c.font = Font(name="Calibri", size=10, bold=True, color="0F172A")
            c.border = border
        ws_profile.row_dimensions[curr_row].height = 20
        curr_row += 1

    for col in ws_profile.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws_profile.column_dimensions[col_letter].width = max(max_len + 3, 16)

    # -------------------------------------------------------------
    # SHEET 2: Interview Process Pipeline
    # -------------------------------------------------------------
    ws_proc = wb.create_sheet(title="Interview Pipeline")
    proc_headers = [
        "Company Name", "Job Role", "CTC LPA", "Round", "Selection Status / Verdict",
        "Score", "Max Score", "Evaluator Feedback", "Weakness Area", "Rejection Reason", "Attempt Date"
    ]
    ws_proc.append(proc_headers)
    if proc_history:
        for p in proc_history:
            ws_proc.append([
                p.get("company_name", ""),
                p.get("job_role", ""),
                p.get("ctc_lpa", 0.0),
                f"Round {p.get('round', 1)}",
                p.get("result", ""),
                p.get("score") if p.get("score") is not None else "N/A",
                p.get("max_score") if p.get("max_score") is not None else "N/A",
                p.get("feedback") or "N/A",
                p.get("weakness_area") or "None identified",
                p.get("rejection_reason") or "None",
                p.get("attempt_date") or ""
            ])
    else:
        ws_proc.append(["No recruitment drives attended yet", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"])
    style_worksheet(ws_proc)

    # -------------------------------------------------------------
    # SHEET 3: Interventions & Diagnostics
    # -------------------------------------------------------------
    ws_iv = wb.create_sheet(title="Interventions & Diagnostics")
    iv_headers = [
        "Intervention ID", "Focus Area / Title", "Priority / Severity", "Status",
        "Diagnostic Failure Summary", "AI Remediation Analysis & Recommendation", "Actions Count", "Logged Date"
    ]
    ws_iv.append(iv_headers)
    if interventions:
        for iv in interventions:
            ws_iv.append([
                iv.get("id", ""),
                iv.get("title", ""),
                iv.get("priority", "MED"),
                iv.get("status", "OPEN"),
                iv.get("failure_summary", ""),
                iv.get("ai_analysis", ""),
                len(iv.get("actions", [])),
                iv.get("created_at", "")
            ])
    else:
        ws_iv.append(["-", "No academic interventions required (Clear track record)", "NONE", "CLEAR", "All criteria fulfilled", "Keep up excellent preparation", 0, "-"])
    style_worksheet(ws_iv)

    # -------------------------------------------------------------
    # SHEET 4: Remediation Action Tasks Checklist
    # -------------------------------------------------------------
    ws_act = wb.create_sheet(title="Remediation Action Roadmap")
    act_headers = [
        "Task #", "Parent Intervention", "Priority", "Action Task Description",
        "Target Due Date", "Practice Resource Link", "Completion Status", "Coordinator Signoff / Notes"
    ]
    ws_act.append(act_headers)
    task_idx = 1
    has_tasks = False
    for iv in interventions:
        for act in iv.get("actions", []):
            has_tasks = True
            ws_act.append([
                task_idx,
                iv.get("title", ""),
                iv.get("priority", "MED"),
                act.get("description", ""),
                act.get("due_date", ""),
                act.get("resource_url", ""),
                "Completed" if act.get("completed") else "Pending",
                ""  # Template editable space for Coordinator Signoff
            ])
            task_idx += 1
    if not has_tasks:
        ws_act.append(["-", "-", "-", "No pending remediation tasks assigned", "-", "-", "All Clear", ""])
    style_worksheet(ws_act)

    # -------------------------------------------------------------
    # SHEET 5: Mentor Notes & Coordinator Log
    # -------------------------------------------------------------
    ws_notes = wb.create_sheet(title="Mentor Notes & Coordinator Log")
    note_headers = [
        "Note #", "Author / Role", "Observation & Mentorship Guidance", "Logged Date", "Follow-up Action"
    ]
    ws_notes.append(note_headers)
    mentor_notes = student.get("mentor_notes", [])
    if mentor_notes:
        for idx, n in enumerate(mentor_notes, start=1):
            ws_notes.append([
                idx,
                f"Mentor ID: {n.get('mentor_id', 'Coordinator')}",
                n.get("content", ""),
                n.get("created_at", ""),
                ""
            ])
    else:
        ws_notes.append([1, "Placement Coordinator", "Initial profile review completed.", "", ""])
    # Add a few blank pre-styled template rows for the coordinator to fill in
    for blank_idx in range(len(mentor_notes) + 2, len(mentor_notes) + 6):
        ws_notes.append([blank_idx, "", "", "", ""])
    style_worksheet(ws_notes)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.xlsx"'}
    )



