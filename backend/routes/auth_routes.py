from fastapi import APIRouter

from backend.controllers import auth_controller
from backend.schemas import GrantSingleAccessRequest, LoginRequest, SignupRequest

router = APIRouter()
router.add_api_route("/api/login", auth_controller.login, methods=["POST"])
router.add_api_route("/api/signup", auth_controller.signup, methods=["POST"])
router.add_api_route("/api/users", auth_controller.list_users, methods=["GET"])
router.add_api_route("/api/users/grant-single-access", auth_controller.grant_single_access, methods=["POST"], response_model=None)
router.add_api_route("/api/signups/pending", auth_controller.get_pending_signups, methods=["GET"])
router.add_api_route("/api/signups/{user_uuid}/approve", auth_controller.approve_signup_request, methods=["POST"])
router.add_api_route("/api/signups/{user_uuid}/reject", auth_controller.reject_signup_request, methods=["POST"])
