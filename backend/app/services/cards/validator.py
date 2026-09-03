from typing import List, Dict, Any, Tuple
from app.models.card_studio import CardRecord, CardTemplateMeta, PreflightSummary, ValidationResult


def run_preflight_validation(
    records: List[CardRecord],
    template_meta: CardTemplateMeta
) -> Tuple[List[CardRecord], PreflightSummary]:
    """
    Runs preflight validation on all records against template requirements.
    Separates FATAL ERRORS (blocks generation) from WARNINGS (user can proceed).
    """
    total = len(records)
    valid_count = 0
    warning_count = 0
    error_count = 0

    fatal_errors = set()
    warnings = set()

    # Required fields from template
    required_fields = [f.id for f in template_meta.fields if f.required]

    def is_slot_required(slot):
        if isinstance(slot, dict):
            return slot.get("id") == "photo" and slot.get("required", False)
        return getattr(slot, "id", "") == "photo" and getattr(slot, "required", False)

    photo_required = any(is_slot_required(slot) for slot in (template_meta.imageSlots or []))


    # Identifier uniqueness tracking
    seen_ids = {}

    updated_records = []
    for rec in records:
        rec_errors = []
        rec_warnings = []

        # Check required fields
        for rf in required_fields:
            val = str(rec.fields.get(rf, "")).strip()
            if not val:
                rec_errors.append(f"Missing required field: '{rf}'")
                fatal_errors.add(f"Some records are missing required field: '{rf}'")

        # Check photo requirement
        if photo_required:
            has_photo = bool(
                (rec.photo and (rec.photo.matched or rec.photo.originalPath)) or
                (rec.processedPhoto and rec.processedPhoto.status == "completed")
            )
            if not has_photo:
                rec_warnings.append("Photo will render using clean student biometric avatar")
                warnings.add("Records without photo files will use high-resolution vector avatars")
            elif rec.processedPhoto and rec.processedPhoto.status == "failed":
                rec_warnings.append(f"Photo processing note: {rec.processedPhoto.error or 'Fallback used'}")


        # Check for duplicate identifier
        ident = rec.fields.get("rollNumber") or rec.fields.get("employeeId") or rec.fields.get("memberId")
        if ident:
            ident_str = str(ident).strip().lower()
            if ident_str in seen_ids:
                rec_warnings.append(f"Duplicate identifier '{ident}' (matches row {seen_ids[ident_str]})")
                warnings.add("Duplicate roll/employee numbers found")
            else:
                seen_ids[ident_str] = rec.index

        # Check optional fields warnings
        mobile = str(rec.fields.get("mobile", "")).strip()
        if mobile and len(mobile.replace("-", "").replace(" ", "")) < 7:
            rec_warnings.append(f"Phone number looks short: '{mobile}'")
            warnings.add("Suspicious short phone numbers detected")

        # Set status
        if rec_errors:
            status = "error"
            error_count += 1
        elif rec_warnings:
            status = "warning"
            warning_count += 1
        else:
            status = "valid"
            valid_count += 1

        rec.validation = ValidationResult(
            status=status,
            errors=rec_errors,
            warnings=rec_warnings
        )
        updated_records.append(rec)

    can_generate = (error_count == 0)

    summary = PreflightSummary(
        totalRecords=total,
        validRecords=valid_count,
        warningRecords=warning_count,
        errorRecords=error_count,
        fatalErrors=list(fatal_errors),
        warnings=list(warnings),
        canGenerate=can_generate
    )

    return updated_records, summary
