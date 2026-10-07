from fastapi import APIRouter

from backend.controllers import drive_controller

router = APIRouter()
router.add_api_route("/api/drives", drive_controller.list_drives, methods=["GET"])
router.add_api_route("/api/drives", drive_controller.create_drive, methods=["POST"])
router.add_api_route("/api/drives/{drive_id}", drive_controller.update_drive, methods=["PUT"])
router.add_api_route("/api/drives/{drive_id}/results", drive_controller.get_results, methods=["GET"])
router.add_api_route("/api/drives/{drive_id}/process", drive_controller.get_drive_process, methods=["GET"])
router.add_api_route("/api/drives/{drive_id}/advance-candidate", drive_controller.advance_candidate, methods=["POST"])
router.add_api_route("/api/drives/{drive_id}/export/selected", drive_controller.export_selected_students, methods=["GET"])
router.add_api_route("/api/export/drive-selected/{drive_id}", drive_controller.export_selected_students, methods=["GET"])
router.add_api_route("/api/drives/{drive_id}/export/round/{round_num}/template", drive_controller.export_round_template, methods=["GET"])
router.add_api_route("/api/export/round-template/{drive_id}/{round_num}", drive_controller.export_round_template, methods=["GET"])
