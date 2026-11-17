"""Monitoring of a procurement by the State Audit Service of Ukraine (Держаудитслужба).

The service publishes its monitorings in Prozorro's audit API, by the procurement's
internal id. A conclusion with violationOccurred is what an analyst must see first;
an obligation to terminate the contract or to remove violations comes with it.
"""
import prozorro

AUDIT = "https://audit-api.prozorro.gov.ua/api/2.5"
OPEN = {"draft", "active"}


def monitorings(tender_id, tid=""):
    """Compact monitorings of one procurement, newest first."""
    listing = prozorro._get("%s/tenders/%s/monitorings" % (AUDIT, tender_id)).get("data") or []
    out = []
    for ref in listing:
        m = prozorro._get("%s/monitorings/%s" % (AUDIT, ref["id"])).get("data") or {}
        concl = m.get("conclusion") or {}
        out.append({k: v for k, v in {
            "id": m.get("monitoring_id") or m.get("id"),
            "status": m.get("status"),
            "date": prozorro._day(m.get("dateCreated")),
            "decision_date": prozorro._day((m.get("decision") or {}).get("date")),
            "violation": concl.get("violationOccurred"),
            "violation_types": concl.get("violationType") or [],
            "conclusion": (concl.get("description") or "")[:1000],
            "obligations": (concl.get("stringsAttached") or "")[:1000],
            "conclusion_date": prozorro._day(concl.get("date") or concl.get("datePublished")),
            "reasons": m.get("reasons") or [],
            "url": "https://prozorro.gov.ua/tender/%s" % tid if tid else "",
        }.items() if v not in (None, "", [])})
    out.sort(key=lambda x: x.get("date") or "", reverse=True)
    return out


def summary(items):
    """One line for the index: violation found, monitoring going on, or done without one."""
    if not items:
        return None
    if any(m.get("violation") for m in items):
        return "violation"
    if any(m.get("status") in OPEN for m in items):
        return "active"
    return "clean"
