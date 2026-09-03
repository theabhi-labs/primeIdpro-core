import re
from typing import Dict, List, Any, Optional

# Standard known aliases for automatic header matching
FIELD_ALIASES: Dict[str, List[str]] = {
    "name": [
        "name", "student_name", "student name", "candidate_name", "candidate name",
        "full_name", "fullname", "employee_name", "emp_name", "member_name",
        "student", "applicant_name", "person_name", "naam"
    ],
    "rollNumber": [
        "roll_no", "roll no", "roll number", "rollno", "roll_num", "roll",
        "r_no", "student_id", "id_number", "id_no", "id"
    ],
    "employeeId": [
        "employee_id", "emp_id", "empid", "staff_id", "staff_no", "emp_code",
        "employee_code", "badge_no", "service_no"
    ],
    "registrationNumber": [
        "registration_no", "reg_no", "regno", "reg_number", "enrollment_no",
        "enrol_no", "admission_no", "adm_no", "admno", "scholar_no"
    ],
    "memberId": [
        "member_id", "member_no", "membership_id", "membership_no", "card_no", "card_number"
    ],
    "class": [
        "class", "standard", "std", "grade", "class_name", "standard_name", "course_year"
    ],
    "section": [
        "section", "sec", "division", "div", "batch", "group"
    ],
    "course": [
        "course", "degree", "program", "programme", "stream", "curriculum"
    ],
    "department": [
        "department", "dept", "branch", "faculty", "division_name"
    ],
    "designation": [
        "designation", "role", "position", "title", "post", "job_title"
    ],
    "fatherName": [
        "father_name", "father name", "father's name", "fathers_name", "father",
        "guardian_name", "guardian", "parent_name"
    ],
    "motherName": [
        "mother_name", "mother name", "mother's name", "mothers_name", "mother"
    ],
    "dob": [
        "dob", "date_of_birth", "date of birth", "birth_date", "birthdate"
    ],
    "bloodGroup": [
        "blood_group", "blood group", "blood", "bg", "blood_grp", "b_group"
    ],
    "mobile": [
        "mobile", "mobile_no", "mobile number", "phone", "phone_no", "phone_number",
        "contact", "contact_no", "contact_number", "emergency_mobile", "cell", "telephone"
    ],
    "email": [
        "email", "email_id", "email_address", "mail", "work_email"
    ],
    "address": [
        "address", "residential_address", "residence", "home_address", "addr", "location"
    ],
    "photo": [
        "photo", "photo_name", "photo_path", "image", "image_name", "image_path",
        "picture", "pic", "photograph", "img", "avatar"
    ],
    "validTill": [
        "valid_till", "valid_upto", "valid_through", "expiry_date", "validity", "valid_up_to"
    ],
    "tier": [
        "tier", "membership_tier", "membership_type", "category_name", "tier_level"
    ]
}


def normalize_header(header: str) -> str:
    """Normalize a column header for matching."""
    cleaned = header.lower().strip()
    cleaned = re.sub(r'[^a-z0-9]', '_', cleaned)
    cleaned = re.sub(r'_+', '_', cleaned).strip('_')
    return cleaned


def auto_detect_mappings(headers: List[str], template_field_ids: Optional[List[str]] = None) -> Dict[str, str]:
    """
    Given a list of column headers from Excel/CSV, auto-suggest mappings to internal card field IDs.
    Returns: dict of Excel_Column -> internal_field_id
    """
    mappings = {}
    used_internal_fields = set()

    normalized_cols = {col: normalize_header(col) for col in headers}

    # 1. Exact match with internal field IDs
    for original_col, norm_col in normalized_cols.items():
        if template_field_ids and norm_col in template_field_ids:
            mappings[original_col] = norm_col
            used_internal_fields.add(norm_col)

    # 2. Match against known aliases dictionary
    for original_col, norm_col in normalized_cols.items():
        if original_col in mappings:
            continue

        best_field = None
        for internal_field, aliases in FIELD_ALIASES.items():
            if template_field_ids and internal_field not in template_field_ids:
                continue

            if internal_field in used_internal_fields:
                continue

            norm_aliases = [normalize_header(a) for a in aliases]
            if norm_col in norm_aliases:
                best_field = internal_field
                break
            # Partial substring check
            elif any(a in norm_col or norm_col in a for a in norm_aliases if len(a) > 3):
                best_field = internal_field
                break

        if best_field:
            mappings[original_col] = best_field
            used_internal_fields.add(best_field)

    return mappings
