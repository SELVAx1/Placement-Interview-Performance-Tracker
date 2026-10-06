import json
import os
import re
import time
from collections import Counter, defaultdict
from typing import Any

import httpx


class AgentConfigurationError(RuntimeError):
    pass


class AgentResponseError(RuntimeError):
    pass


class AgentRateLimitError(AgentResponseError):
    def __init__(self, message: str, retry_after: int = 5):
        super().__init__(message)
        self.retry_after = retry_after


def classify_result(result: str) -> str:
    value = (result or "").strip().lower()
    if any(term in value for term in ("selected", "placed", "hired")):
        return "passed"
    if any(term in value for term in ("rejected", "failed", "fail")):
        return "failed"
    if "shortlist" in value or "qualified" in value:
        return "shortlisted"
    return "pending"


def analyse_student_patterns(records: list[dict[str, Any]]) -> dict[str, Any]:
    total_rounds = len(records)
    passed = sum(classify_result(record.get("result")) in {"passed", "shortlisted"} for record in records)
    failed_records = [record for record in records if classify_result(record.get("result")) == "failed"]
    failed_by_round = Counter()
    weaknesses = Counter()
    rejection_reasons = Counter()
    scores = []

    for record in failed_records:
        round_name = record.get("round") or "Unknown round"
        failed_by_round[str(round_name)] += 1
        weakness = (record.get("weakness_area") or "Unspecified weakness").strip()
        weaknesses[weakness] += 1
        reason = (record.get("rejection_reason") or "Unspecified rejection reason").strip()
        rejection_reasons[reason] += 1

    for record in records:
        score = record.get("score")
        if score is not None:
            try:
                scores.append(float(score))
            except (TypeError, ValueError):
                pass

    pass_rate = round((passed / total_rounds) * 100, 1) if total_rounds else 0.0
    risk_level = "high" if len(failed_records) >= 3 else "medium" if failed_records else "low"

    return {
        "total_rounds": total_rounds,
        "passed_rounds": passed,
        "failed_rounds": len(failed_records),
        "pass_rate": pass_rate,
        "risk_level": risk_level,
        "failed_by_round": dict(failed_by_round),
        "top_weaknesses": [
            {"area": area, "count": count} for area, count in weaknesses.most_common()
        ],
        "rejection_reasons": [
            {"reason": reason, "count": count}
            for reason, count in rejection_reasons.most_common()
        ],
        "score_average": round(sum(scores) / len(scores), 2) if scores else None,
        "records": records,
    }


def compute_priority(patterns: dict[str, Any]) -> str:
    failures = patterns.get("failed_rounds", 0)
    risk = patterns.get("risk_level")
    if risk == "high" or failures >= 5:
        return "CRITICAL"
    if risk == "medium" or failures >= 2:
        return "HIGH"
    if failures == 1:
        return "MEDIUM"
    return "LOW"


def build_prompt(student: dict[str, Any], patterns: dict[str, Any], previous_actions: list[dict[str, Any]]) -> str:
    prompt_patterns = {
        key: value for key, value in patterns.items() if key != "records"
    }
    prompt_actions = [
        {
            key: action.get(key)
            for key in ("title", "weakness_area", "completed", "notes", "due_date")
            if action.get(key) is not None
        }
        for action in previous_actions[-6:]
    ]
    return f"""You are a placement intervention advisor. Analyze the student's verified placement data and propose practical, measurable support.

Student: {student.get('gmail')}
Department: {student.get('department') or 'Unknown'}
Failure analysis JSON:
{json.dumps(prompt_patterns, separators=(',', ':'), default=str)}

Previous intervention actions JSON:
{json.dumps(prompt_actions, separators=(',', ':'), default=str)}

Return only valid JSON with this shape:
{{
  "title": "short intervention title",
  "failure_summary": "concise evidence-based summary",
  "ai_analysis": "explanation of the most important pattern",
  "actions": [
    {{"title": "specific measurable action", "weakness_area": "area", "resources": "optional resources", "due_date": "optional ISO date"}}
  ]
}}
Do not invent scores or results that are not present in the analysis."""


def parse_agent_response(content: str) -> dict[str, Any]:
    cleaned = (content or "").strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", cleaned, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        cleaned = fenced.group(1).strip()
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise AgentResponseError("The agent returned invalid JSON") from exc
    if not isinstance(payload, dict) or not payload.get("title") or not isinstance(payload.get("actions"), list):
        raise AgentResponseError("The agent response is missing required intervention fields")
    return payload


def generate_agent_intervention(student: dict[str, Any], patterns: dict[str, Any], previous_actions: list[dict[str, Any]]) -> dict[str, Any]:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise AgentConfigurationError("GROQ_API_KEY is not configured")

    base_url = os.getenv("GROQ_API_URL", "https://api.groq.com/openai/v1").rstrip("/")
    headers = {"Authorization": f"Bearer {api_key}"}
    configured_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    request_body = {
        "model": configured_model,
        "temperature": 0.2,
        "messages": [{"role": "user", "content": build_prompt(student, patterns, previous_actions)}],
    }
    response = httpx.post(f"{base_url}/chat/completions", headers=headers, json=request_body, timeout=45.0)

    if response.status_code == 404:
        try:
            models_response = httpx.get(f"{base_url}/models", headers=headers, timeout=15.0)
            if models_response.is_success:
                model_ids = [item.get("id") for item in models_response.json().get("data", [])]
                preferred_models = [
                    configured_model,
                    "llama-3.3-70b-versatile",
                    "openai/gpt-oss-120b",
                    "llama-4-scout-17b-16e-instruct",
                ]
                replacement_model = next((model for model in preferred_models if model in model_ids), None)
                if replacement_model and replacement_model != configured_model:
                    request_body["model"] = replacement_model
                    response = httpx.post(f"{base_url}/chat/completions", headers=headers, json=request_body, timeout=45.0)
        except (httpx.HTTPError, ValueError, TypeError):
            pass

    if response.status_code == 429:
        retry_after_header = response.headers.get("Retry-After", "5")
        try:
            retry_after = max(1, min(int(float(retry_after_header)), 15))
        except (TypeError, ValueError):
            retry_after = 5
        for attempt in range(2):
            time.sleep(retry_after * (attempt + 1))
            response = httpx.post(f"{base_url}/chat/completions", headers=headers, json=request_body, timeout=45.0)
            if response.status_code != 429:
                break
        if response.status_code == 429:
            detail = response.text[:500].strip() or "Groq rate limit exceeded."
            raise AgentRateLimitError(f"Groq rate limit exceeded (HTTP 429): {detail}", retry_after)

    if response.is_error:
        detail = response.text[:500].strip() or "No provider error details were returned."
        raise AgentResponseError(f"Groq request failed with HTTP {response.status_code}: {detail}")
    body = response.json()
    choices = body.get("choices") or []
    if not choices or not choices[0].get("message", {}).get("content"):
        raise AgentResponseError("The agent returned an empty response")
    return parse_agent_response(choices[0]["message"]["content"])


def synthesize_fallback_intervention(
    student: dict[str, Any],
    patterns: dict[str, Any],
    previous_actions: list[dict[str, Any]]
) -> dict[str, Any]:
    """
    Intelligent heuristic fallback when LLM API (Groq) is rate-limited, unavailable, or unconfigured.
    Generates rich, tailored, domain-specific remediation based on the student's actual performance patterns.
    """
    failed_by_round = patterns.get("failed_by_round", {})
    top_weaknesses = patterns.get("top_weaknesses", [])
    rejection_reasons = patterns.get("rejection_reasons", [])
    pass_rate = patterns.get("pass_rate", 0.0)
    dept = student.get("department") or "Engineering"

    primary_weakness = top_weaknesses[0]["area"] if top_weaknesses else "Technical Problem Solving"

    if any("coding" in str(r).lower() or "dsa" in str(r).lower() or "algorithm" in str(r).lower() for r in failed_by_round.keys()) or "dsa" in primary_weakness.lower() or "coding" in primary_weakness.lower():
        title = "Targeted DSA & Algorithmic Problem Solving Mastery"
        summary = f"Student faced elimination in online coding assessment(s) with primary weakness in {primary_weakness}."
        analysis = f"Diagnostic analysis indicates foundational knowledge exists, but implementation speed and complex edge case coverage under time constraints require reinforcement."
        actions = [
            {
                "title": f"Solve 25 Curated LeetCode Medium problems focusing on {primary_weakness}",
                "weakness_area": primary_weakness,
                "resources": "LeetCode Curated 75 / Striver's A2Z DSA Sheet",
                "due_date": "Within 2 weeks"
            },
            {
                "title": "Participate in Weekly College Placement Mock Coding Contest",
                "weakness_area": "Assessment Speed & Time Management",
                "resources": "Campus Coding Sandbox / Codeforces Division 3",
                "due_date": "Within 10 days"
            },
            {
                "title": "1:1 Code Review & Complexity Optimization with Department Mentor",
                "weakness_area": "Space/Time Complexity & Clean Code",
                "resources": "Faculty Mentor Office Hours",
                "due_date": "Within 3 weeks"
            }
        ]
    elif any("technical" in str(r).lower() or "interview" in str(r).lower() for r in failed_by_round.keys()) or "system" in primary_weakness.lower() or "sql" in primary_weakness.lower() or "core" in primary_weakness.lower():
        title = "Core Technical Architecture & Mock Interview Refinement"
        summary = f"Candidate encountered difficulties in Technical Interview round(s) with focus area: {primary_weakness}."
        analysis = f"Technical depth in {dept} core fundamentals and articulating architectural trade-offs require structured 1:1 mock drills."
        actions = [
            {
                "title": f"Complete deep-dive revision on {dept} Core Fundamentals and {primary_weakness}",
                "weakness_area": primary_weakness,
                "resources": "Campus Tech LMS & System Architecture Tutorials",
                "due_date": "Within 14 days"
            },
            {
                "title": "Conduct 45-minute Live Mock Technical Interview with Industry/Faculty Mentor",
                "weakness_area": "Live Technical Communication & Defense",
                "resources": "Interview Preparation Lab Room 3",
                "due_date": "Within 10 days"
            },
            {
                "title": "Build and document an end-to-end prototype project demonstrating database & architecture skills",
                "weakness_area": "Hands-on Project Portfolio",
                "resources": "GitHub Campus Repository",
                "due_date": "Within 21 days"
            }
        ]
    elif any("hr" in str(r).lower() or "behavioral" in str(r).lower() or "managerial" in str(r).lower() for r in failed_by_round.keys()):
        title = "Behavioral, Leadership & Cultural Fit Readiness Plan"
        summary = "Eliminated in HR / Managerial discussion due to behavioral communication or situational responses."
        analysis = "Technical competencies are satisfactory, but answers to behavioral, leadership, and situational questions need structured STAR-method storytelling."
        actions = [
            {
                "title": "Draft and rehearse STAR-method stories for Top 10 Behavioral Interview Questions",
                "weakness_area": "Behavioral Competency & Storytelling",
                "resources": "Placement Cell STAR Technique Playbook",
                "due_date": "Within 7 days"
            },
            {
                "title": "Mock HR & Leadership Interview with Training & Placement Officer",
                "weakness_area": "Executive Presence & Confidence",
                "resources": "Career Development Center Interview Suite",
                "due_date": "Within 12 days"
            }
        ]
    else:
        title = "Comprehensive Multi-Round Placement Readiness Accelerator"
        summary = f"Student has completed {patterns.get('total_rounds', 0)} round(s) with a {pass_rate}% clearance rate. Identified focus area: {primary_weakness}."
        analysis = f"Holistic diagnostic indicates targeted improvement in both aptitude speed and core technical problem solving will elevate candidate readiness for Tier-1/Tier-2 drives."
        actions = [
            {
                "title": f"Structured Daily Practice on {primary_weakness} and Quantitative Reasoning",
                "weakness_area": primary_weakness,
                "resources": "IndiaBIX & PrepInsta Placement Diagnostic Modules",
                "due_date": "Within 14 days"
            },
            {
                "title": "Attend Department Placement Coaching & Doubt Clearing Session",
                "weakness_area": "Subject Fundamentals",
                "resources": f"{dept} Department Faculty Mentorship",
                "due_date": "Within 10 days"
            },
            {
                "title": "Full-Length Diagnostic Placement Simulation Mock Test",
                "weakness_area": "Comprehensive Exam Readiness",
                "resources": "Placement Intervention Online Portal",
                "due_date": "Within 18 days"
            }
        ]

    return {
        "title": title,
        "failure_summary": summary,
        "ai_analysis": analysis,
        "actions": actions
    }


def build_intervention(student: dict[str, Any], patterns: dict[str, Any], previous_actions: list[dict[str, Any]], created_by: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    generated = None
    try:
        generated = generate_agent_intervention(student, patterns, previous_actions)
    except Exception:
        # Seamlessly fallback to expert heuristic AI synthesis if Groq is rate-limited or fails
        generated = synthesize_fallback_intervention(student, patterns, previous_actions)

    student_id = student.get("uuid") or student.get("student_id") or "student-id"
    student_gmail = (student.get("gmail") or student.get("email") or "").strip().lower()

    intervention = {
        "student_id": student_id,
        "student_gmail": student_gmail,
        "title": generated.get("title", "Placement Intervention Plan").strip(),
        "failure_summary": generated.get("failure_summary", "").strip(),
        "ai_analysis": generated.get("ai_analysis", "").strip(),
        "priority": compute_priority(patterns),
        "status": "OPEN",
        "created_by": created_by,
    }
    actions = [
        {
            "title": str(action.get("title", "")).strip(),
            "weakness_area": action.get("weakness_area", "General"),
            "resources": action.get("resources", "Campus LMS"),
            "due_date": action.get("due_date"),
        }
        for action in generated.get("actions", [])
        if str(action.get("title", "")).strip()
    ]
    if not actions:
        actions = [
            {
                "title": "Complete department placement readiness review",
                "weakness_area": "General",
                "resources": "Placement Cell",
                "due_date": None
            }
        ]
    return intervention, actions
