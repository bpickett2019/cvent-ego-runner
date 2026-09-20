"""Structural coverage audit only. No model, network, authoring or semantic approval."""
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

from openpyxl.utils.cell import range_boundaries

DISPOSITIONS = {"VERIFIED_EXISTING", "VERIFIED_CREATED", "PRESERVED_DIFFERENCE", "BLOCKED", "NOT_APPLICABLE", "UNTESTED", "UNCERTAIN"}
NOTICE = "Structural evidence check only; not proof of semantic coverage, saved state, authorization or RR satisfaction. Human review required."


def audit(root, job, workbook, local_file):
    issues, counts = [], Counter()

    def issue(code, index=None):
        issues.append({"code": code, **({"requirementIndex": index} if index is not None else {})})

    def text(value):
        return isinstance(value, str) and 0 < len(value.strip()) <= 4000

    def evidence(paths):
        if not isinstance(paths, list) or not 1 <= len(paths) <= 20:
            return False
        for path in paths:
            # Verification must cite receipts, not an identity-only helper comparison.
            if not isinstance(path, str) or len(path) > 500 or not path.startswith("receipts/") or ".." in Path(path).parts:
                return False
            try:
                if local_file(root, path).stat().st_size == 0:
                    return False
            except (ValueError, OSError):
                return False
        return True

    ledger_sha = None
    try:
        path = local_file(root, "requirements.json")
        if path.stat().st_size > 5_000_000:
            raise ValueError("Ledger too large")
        raw = path.read_bytes()
        ledger_sha = hashlib.sha256(raw).hexdigest()
        ledger = json.loads(raw)
        if not isinstance(ledger, dict) or ledger.get("schemaVersion") != 1:
            raise ValueError("Ledger schema required")
        rows, sheets = ledger.get("requirements"), ledger.get("sheets")
        if not isinstance(rows, list) or len(rows) > 10000 or not isinstance(sheets, list) or len(sheets) > 1000:
            raise ValueError("Bounded ledger arrays required")
    except (ValueError, OSError, TypeError):
        issue("LEDGER_MISSING_OR_INVALID")
        ledger, rows, sheets = {}, [], []
    if ledger.get("sourceSha256") != job.get("sha256") or not job.get("sha256"):
        issue("WORKBOOK_BINDING_MISMATCH")
    event_id = job.get("target", {}).get("apiEventId")
    if not event_id or ledger.get("eventId") != event_id:
        issue("EVENT_BINDING_MISMATCH")
    actual = {s["name"]: s for s in workbook["sheets"]}
    declared, referenced, ids = {}, set(), set()
    for sheet in sheets:
        if not isinstance(sheet, dict) or not isinstance(sheet.get("sheet"), str) or sheet["sheet"] not in actual or sheet["sheet"] in declared:
            issue("INVALID_OR_DUPLICATE_SHEET")
            continue
        name = sheet["sheet"]
        declared[name] = sheet.get("disposition")
        if not isinstance(declared[name], str) or declared[name] not in {"REVIEWED", "NOT_APPLICABLE"} or not text(sheet.get("reason")):
            issue("SHEET_DISPOSITION_OR_REASON_MISSING")
    for name in (name for name in actual if name not in declared):
        # Index, not arbitrary workbook text, keeps CLI output bounded and payload-light.
        issues.append({"code": "SHEET_UNACCOUNTED", "sheetIndex": list(actual).index(name)})
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            issue("INVALID_REQUIREMENT", i)
            continue
        identity, status = row.get("id"), row.get("disposition")
        if not isinstance(identity, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", identity) or identity in ids:
            issue("INVALID_OR_DUPLICATE_ID", i)
        else:
            ids.add(identity)
        if not isinstance(status, str) or status not in DISPOSITIONS:
            issue("DISPOSITION_MISSING_OR_INVALID", i)
            status = None
        else:
            counts[status] += 1
        if not text(row.get("requirement")):
            issue("REQUIREMENT_DESCRIPTION_MISSING", i)
        sources = row.get("sources")
        if not isinstance(sources, list) or not 1 <= len(sources) <= 100:
            issue("SOURCES_MISSING", i)
            sources = []
        for source in sources:
            try:
                name, area = source["sheet"], source["range"]
                if name not in actual or not isinstance(area, str) or not re.fullmatch(r"[A-Z]{1,3}[1-9][0-9]{0,6}(?::[A-Z]{1,3}[1-9][0-9]{0,6})?", area):
                    raise ValueError()
                left, top, right, bottom = range_boundaries(area)
                if not (left <= right <= actual[name]["columns"] and top <= bottom <= actual[name]["rows"]):
                    raise ValueError()
                referenced.add(name)
                if declared.get(name) == "NOT_APPLICABLE" and status != "NOT_APPLICABLE":
                    issue("SOURCE_SHEET_CONTRADICTION", i)
            except (KeyError, TypeError, ValueError):
                issue("SOURCE_INVALID_OR_OUT_OF_BOUNDS", i)
        if status in {"VERIFIED_EXISTING", "VERIFIED_CREATED", "PRESERVED_DIFFERENCE"}:
            if not text(row.get("objectIdentity")) or not text(row.get("verification")) or not evidence(row.get("evidence")):
                issue("SAVED_STATE_EVIDENCE_MISSING", i)
        if status == "VERIFIED_CREATED":
            if not evidence(row.get("absenceEvidence")) or not evidence(row.get("intentEvidence")):
                issue("CREATION_ABSENCE_OR_INTENT_MISSING", i)
        if status in {"PRESERVED_DIFFERENCE", "NOT_APPLICABLE"} and not text(row.get("reason")):
            issue("DISPOSITION_REASON_MISSING", i)
        if status in {"BLOCKED", "UNTESTED", "UNCERTAIN"}:
            if not text(row.get("reason")) or not text(row.get("needed")):
                issue("SPECIFIC_BLOCKER_OR_NEEDED_INPUT_MISSING", i)
    for name, disposition in declared.items():
        if disposition == "REVIEWED" and name not in referenced:
            issues.append({"code": "REVIEWED_SHEET_WITHOUT_REQUIREMENTS", "sheetIndex": list(actual).index(name)})
    if (root / "api-write-uncertain.json").exists() or (root / "api-write-uncertain.json").is_symlink():
        issue("UNRESOLVED_API_WRITE")
    incomplete = bool(issues or counts["UNTESTED"] or counts["UNCERTAIN"])
    status = "INCOMPLETE" if incomplete else "STRUCTURALLY_ACCOUNTED_WITH_EXCEPTIONS" if counts["BLOCKED"] or counts["PRESERVED_DIFFERENCE"] else "STRUCTURALLY_ACCOUNTED"
    return {"schemaVersion": 1, "status": status, "notice": NOTICE, "sourceSha256": job.get("sha256"),
            "eventId": event_id, "ledgerSha256": ledger_sha, "requirementCount": len(rows),
            "counts": dict(counts), "issueCount": len(issues), "issues": issues}
