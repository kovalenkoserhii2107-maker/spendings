"""Monitoring of a procurement by the State Audit Service of Ukraine (Держаудитслужба).

The service publishes its monitorings in Prozorro's audit API, by the procurement's
internal id: the decision to start, the requests and the buyer's explanations, the
conclusion (violations found or not, what the buyer must do and by when) and the
buyer's report on removing them, each with its files.
"""
import urllib.parse

import prozorro

AUDIT = "https://audit-api.prozorro.gov.ua/api/2.5"
OPEN = {"draft", "active"}
TEXT = 4000


def _docs(items, of, author=None):
    """Files of one part of a monitoring; electronic signatures (.p7s) left out."""
    out = []
    for d in items or []:
        if d.get("format") == "application/pkcs7-signature" or (d.get("title") or "").lower().endswith(".p7s"):
            continue
        out.append({k: v for k, v in {
            "id": d.get("id"), "title": d.get("title") or "", "url": d.get("url"), "format": d.get("format"),
            "date": prozorro._day(d.get("datePublished")), "of": of,
            "author": "sasu" if (d.get("author") or author) == "monitoring_owner" else "buyer",
        }.items() if v not in (None, "")})
    return out


def _compact(m, tid):
    decision, concl = m.get("decision") or {}, m.get("conclusion") or {}
    report, period = m.get("eliminationReport") or {}, m.get("eliminationPeriod") or {}
    api = "%s/monitorings/%s" % (AUDIT, m.get("id"))
    posts = []
    for p in m.get("posts") or []:
        posts.append({k: v for k, v in {
            "date": prozorro._day(p.get("datePublished")), "of": p.get("postOf"),
            "author": "sasu" if p.get("author") == "monitoring_owner" else "buyer",
            "title": (p.get("title") or "")[:500], "text": (p.get("description") or "")[:TEXT],
            "due": prozorro._day(p.get("dateOverdue")),
            "docs": _docs(p.get("documents"), "post", p.get("author")),
        }.items() if v not in (None, "", [])})
    docs = _docs(decision.get("documents"), "decision", "monitoring_owner") + _docs(concl.get("documents"), "conclusion", "monitoring_owner") \
        + [d for p in posts for d in p.get("docs") or []] + _docs(report.get("documents"), "elimination", "tender_owner")
    return {k: v for k, v in {
        "id": m.get("monitoring_id") or m.get("id"),
        "status": m.get("status"),
        "date": prozorro._day(m.get("dateCreated")),
        "period_end": prozorro._day((m.get("monitoringPeriod") or {}).get("endDate")),
        "reasons": m.get("reasons") or [],
        "stages": m.get("procuringStages") or [],
        "decision_date": prozorro._day(decision.get("date")),
        "decision": (decision.get("description") or "")[:TEXT],
        "violation": concl.get("violationOccurred"),
        "violation_types": concl.get("violationType") or [],
        "violation_other": concl.get("otherViolationType") or "",
        "conclusion": (concl.get("description") or "")[:TEXT],
        "findings": (concl.get("auditFinding") or "")[:TEXT],
        "obligations": (concl.get("stringsAttached") or "")[:TEXT],
        "conclusion_date": prozorro._day(concl.get("date")),
        "conclusion_published": prozorro._day(concl.get("datePublished")),
        # The buyer has until this day to remove the violations or appeal the conclusion.
        "elimination_due": prozorro._day(period.get("endDate")),
        "elimination": (report.get("description") or "")[:TEXT],
        "elimination_date": prozorro._day(report.get("datePublished")),
        "posts": posts,
        "docs": docs,
        # Prozorro renders the conclusion as a PDF from the API record.
        "conclusion_pdf": "https://prozorro.gov.ua/uk/pdf/conclusion?url=" + urllib.parse.quote(urllib.parse.quote(api, safe=""), safe="") if concl else "",
        "api": api,
        "url": "https://prozorro.gov.ua/uk/tender/%s/monitorings" % tid if tid else "",
    }.items() if v not in (None, "", [])}


def monitorings(tender_id, tid=""):
    """Compact monitorings of one procurement, newest first."""
    listing = prozorro._get("%s/tenders/%s/monitorings" % (AUDIT, tender_id)).get("data") or []
    out = [_compact(prozorro._get("%s/monitorings/%s" % (AUDIT, ref["id"])).get("data") or {}, tid) for ref in listing]
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
