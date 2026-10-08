from fastapi import APIRouter

from backend.controllers import application_controller as controller

router = APIRouter()

# Templates
router.add_api_route("/api/templates", controller.list_sample_templates, methods=["GET"])
router.add_api_route("/api/templates/download/{filename}", controller.download_template, methods=["GET"])

# General lists & exports
router.add_api_route("/api/students", controller.list_students, methods=["GET"])
router.add_api_route("/api/logs", controller.list_upload_logs, methods=["GET"])
router.add_api_route("/api/export/company-drives", controller.export_company_drives, methods=["GET"])
router.add_api_route("/api/export/drive-results/{drive_id}", controller.export_drive_results, methods=["GET"])
router.add_api_route("/api/export/student-roster", controller.export_student_roster, methods=["GET"])
router.add_api_route("/api/export/user-access", controller.export_user_access, methods=["GET"])

# Student profile & results
router.add_api_route("/api/student/profile", controller.get_student_profile, methods=["GET"])
router.add_api_route("/api/student/profile", controller.update_student_profile, methods=["PUT"])
router.add_api_route("/api/student/results", controller.get_student_results, methods=["GET"])
router.add_api_route("/api/student/applications", controller.get_student_applications, methods=["GET"])
router.add_api_route("/api/student/apply", controller.apply_student_drive, methods=["POST"])
router.add_api_route("/api/student/analysis", controller.get_student_analysis, methods=["GET"])
router.add_api_route("/api/student/resume-upload", controller.upload_student_resume, methods=["POST"])

# Interventions
router.add_api_route("/api/interventions", controller.list_interventions, methods=["GET"])
router.add_api_route("/api/interventions/students", controller.list_intervention_students, methods=["GET"])
router.add_api_route("/api/interventions/generate", controller.generate_intervention, methods=["POST"])
router.add_api_route("/api/interventions/generate-all", controller.generate_all_interventions, methods=["POST"])
router.add_api_route("/api/interventions/custom", controller.create_custom_intervention, methods=["POST"])
router.add_api_route("/api/interventions/{intervention_id}/actions", controller.add_intervention_action, methods=["POST"])
router.add_api_route("/api/interventions/{intervention_id}", controller.delete_intervention, methods=["DELETE"])
router.add_api_route("/api/interventions/{intervention_id}/status", controller.change_intervention_status, methods=["PATCH", "PUT"])
router.add_api_route("/api/intervention/{intervention_id}/status", controller.change_intervention_status, methods=["PATCH", "PUT"])
router.add_api_route("/api/interventions/{student_id}", controller.get_student_interventions, methods=["GET"])
router.add_api_route("/api/intervention/actions/{action_id}", controller.change_intervention_action, methods=["PATCH", "PUT"])
router.add_api_route("/api/interventions/actions/{action_id}", controller.change_intervention_action, methods=["PATCH", "PUT"])


# Coordinator tracking
router.add_api_route("/api/coordinator/students-tracking", controller.get_coordinator_tracking, methods=["GET"])
router.add_api_route("/api/coordinator/export/students-tracking", controller.export_coordinator_tracking, methods=["GET"])
router.add_api_route("/api/coordinator/student/{identifier}", controller.get_coordinator_student_detail, methods=["GET"])
router.add_api_route("/api/coordinator/export/student/{identifier}", controller.export_coordinator_student_dossier, methods=["GET"])

# Mentor
router.add_api_route("/api/mentor/demo/mentees", controller.get_mentor_demo_data, methods=["GET"])
router.add_api_route("/api/mentor/notes", controller.get_notes, methods=["GET"])
router.add_api_route("/api/mentor/notes", controller.create_note, methods=["POST"])
router.add_api_route("/api/mentor/notes/{note_id}", controller.update_note, methods=["PUT"])
router.add_api_route("/api/mentor/notes/{note_id}", controller.delete_note, methods=["DELETE"])

# Department
router.add_api_route("/api/department/dashboard", controller.get_department_dashboard, methods=["GET"])
