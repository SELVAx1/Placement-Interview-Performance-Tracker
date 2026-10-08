from fastapi import Header, status
from fastapi.responses import JSONResponse

from backend.schemas import GrantSingleAccessRequest, LoginRequest, SignupRequest
from backend.services import auth_service


def login(credentials: LoginRequest):
    gmail = credentials.gmail.strip()
    if not gmail or not credentials.password:
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"success": False, "message": "Gmail and password are required"})
    result = auth_service.authenticate(gmail, credentials.password)
    if not result:
        return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"success": False, "message": "Invalid Gmail or password"})
    if result.get("pending"):
        return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content={
            "success": False,
            "message": "Your account is pending approval by the Coordinator. Please wait for approval before signing in.",
            "pending": True,
            "gmail": result["gmail"],
            "role": result["role"],
        })
    return {
        "success": True,
        "message": "Logged in successfully",
        "user": result["user"],
        "token": result["token"],
    }


def signup(request: SignupRequest):
    gmail = request.gmail.strip().lower()
    if not gmail or "@" not in gmail:
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"success": False, "message": "Please enter a valid email address."})
    if not request.password or len(request.password) < 6:
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"success": False, "message": "Password must be at least 6 characters."})
    if request.password != request.confirm_password:
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"success": False, "message": "Passwords do not match."})
    if request.role.strip().lower() == "coordinator":
        return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content={"success": False, "message": "Coordinator accounts cannot be created via signup."})
    result = auth_service.signup(gmail, request.password, request.role, request.name, request.department)
    if not result:
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"success": False, "message": "An account with this email already exists. Please sign in instead."})
    return {
        "success": True,
        "message": "Signup request submitted successfully. A Coordinator will review and approve your account.",
        "signup": result,
    }


def get_pending_signups(x_user_id: str = Header(None), x_user_role: str = Header(None)):
    if not x_user_id:
        return JSONResponse(status_code=401, content={"success": False, "message": "Authentication required"})
    if (x_user_role or "").strip().lower() not in {"coordinator", "admin"}:
        return JSONResponse(status_code=403, content={"success": False, "message": "Only coordinators can view pending signups"})
    pending = auth_service.get_pending_signups()
    return {"success": True, "pending": pending, "count": len(pending)}


def approve_signup_request(user_uuid: str, x_user_id: str = Header(None), x_user_role: str = Header(None)):
    if not x_user_id:
        return JSONResponse(status_code=401, content={"success": False, "message": "Authentication required"})
    if (x_user_role or "").strip().lower() not in {"coordinator", "admin"}:
        return JSONResponse(status_code=403, content={"success": False, "message": "Only coordinators can approve signups"})
    result = auth_service.approve_signup(user_uuid)
    if not result:
        return JSONResponse(status_code=404, content={"success": False, "message": "Signup request not found"})
    return {"success": True, "message": f"Approved {result['gmail']} as {result['role']}.", "user": result}


def reject_signup_request(user_uuid: str, x_user_id: str = Header(None), x_user_role: str = Header(None)):
    if not x_user_id:
        return JSONResponse(status_code=401, content={"success": False, "message": "Authentication required"})
    if (x_user_role or "").strip().lower() not in {"coordinator", "admin"}:
        return JSONResponse(status_code=403, content={"success": False, "message": "Only coordinators can reject signups"})
    result = auth_service.reject_signup(user_uuid)
    if not result:
        return JSONResponse(status_code=404, content={"success": False, "message": "Signup request not found"})
    return {"success": True, "message": f"Rejected and removed signup for {result['gmail']}.", "user": result}


def list_users():
    users = auth_service.list_users()
    return {"success": True, "users": users, "count": len(users)}


def grant_single_access(request: GrantSingleAccessRequest):
    gmail = request.gmail.strip().lower()
    if not gmail or "@" not in gmail:
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"success": False, "message": "Please enter a valid Gmail address."})
    result = auth_service.grant_access(gmail, request.role, request.password)
    return {"success": True, "message": f"Successfully granted {result['role']} access to {gmail}.", "user": result}


def get_departments():
    departments = auth_service.get_departments()
    return {"success": True, "departments": departments}

