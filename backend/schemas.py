from typing import Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    gmail: str = Field(..., json_schema_extra={"example": "student@gmail.com"})
    password: str = Field(..., json_schema_extra={"example": "student123"})


class SignupRequest(BaseModel):
    gmail: str = Field(..., json_schema_extra={"example": "newuser@gmail.com"})
    password: str = Field(..., json_schema_extra={"example": "mypassword123"})
    confirm_password: str = Field(..., json_schema_extra={"example": "mypassword123"})
    role: str = Field(default="Student", json_schema_extra={"example": "Student"})
    name: str = Field(default="", json_schema_extra={"example": "John Doe"})
    department: str = Field(default="CSE", json_schema_extra={"example": "CSE"})


class GrantSingleAccessRequest(BaseModel):
    gmail: str
    role: str = "Student"
    password: str = None


class RoundItemRequest(BaseModel):
    round_number: Optional[int] = None
    round_name: str
    round_type: Optional[str] = "TECHNICAL"
    description: Optional[str] = ""


class CreateDriveRequest(BaseModel):
    company_name: str
    job_role: str
    ctc_lpa: float
    min_cgpa: float = 0.0
    allowed_branches: str = "All"
    location: str = "On Campus"
    status: str = "Active"
    deadline: Optional[str] = None
    description: Optional[str] = None
    total_rounds: Optional[int] = 4
    rounds: Optional[list[RoundItemRequest]] = None


class UpdateDriveRequest(BaseModel):
    company_name: Optional[str] = None
    job_role: Optional[str] = None
    ctc_lpa: Optional[float] = None
    min_cgpa: Optional[float] = None
    allowed_branches: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    deadline: Optional[str] = None
    description: Optional[str] = None
    total_rounds: Optional[int] = None
    rounds: Optional[list[RoundItemRequest]] = None


class AdvanceCandidateRequest(BaseModel):
    gmail: str
    action: Optional[str] = "advance"
    round_num: Optional[int] = None
    score: Optional[float] = None
    feedback: Optional[str] = None


class StudentApplyRequest(BaseModel):
    gmail: str
    drive_id: str


class StudentProfileUpdateRequest(BaseModel):
    gmail: str
    name: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    year: Optional[str] = None
    cgpa: Optional[float] = None
    tenth_percentage: Optional[float] = None
    twelfth_percentage: Optional[float] = None
    skills: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    resume_filename: Optional[str] = None
    resume_url: Optional[str] = None
    leetcode_handle: Optional[str] = None
    leetcode_solved_month: Optional[int] = None
    leetcode_total_solved: Optional[int] = None
    codeforces_handle: Optional[str] = None
    codeforces_solved_month: Optional[int] = None
    codeforces_rating: Optional[int] = None
    codechef_handle: Optional[str] = None
    codechef_solved_month: Optional[int] = None
    codechef_stars: Optional[str] = None
    hackerrank_handle: Optional[str] = None
    hackerrank_solved_month: Optional[int] = None
    hackerrank_score: Optional[int] = None
    atcoder_handle: Optional[str] = None
    atcoder_solved_month: Optional[int] = None
    atcoder_rating: Optional[int] = None


class InterventionGenerateRequest(BaseModel):
    student_id: str = None
    gmail: str = None


class InterventionStatusRequest(BaseModel):
    status: str


class InterventionActionRequest(BaseModel):
    completed: bool = None
    notes: str = None


class CustomInterventionRequest(BaseModel):
    student_id: str = None
    gmail: str = None
    title: str
    failure_summary: str = ""
    ai_analysis: str = ""
    priority: str = "MEDIUM"
    actions: list[dict] = []


class AddActionRequest(BaseModel):
    title: str
    weakness_area: str = None
    resources: str = None
    assigned_to: str = None
    due_date: str = None


class MentorNoteRequest(BaseModel):
    student_id: str
    content: str


class MentorNoteUpdateRequest(BaseModel):
    content: str
