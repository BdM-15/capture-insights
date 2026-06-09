"""Match co-pilot / chat messages to runnable skills via triggers + catalog descriptions."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple

from .skill_constants import RUNNABLE_SKILL_IDS
from .skill_registry import SkillRecord, discover_skills

# (skill_id, trigger phrases) — first match wins; order matters.
_CHAT_TRIGGERS: List[Tuple[str, Tuple[str, ...]]] = [
    ("competitive-intel", (
        "burn rate", "burn-rate", "obligation intel", "obligation trend",
        "idiq", "idv", "vehicle intel", "competitive intel", "black-hat",
        "contract number", "piid", "award history", "child order",
        "who's the incumbent", "who is the incumbent", "last award value",
        "top competitors", "find competitors", "competitors for", "competitors to",
        "who competes", "competitive landscape", "top primes", "market leaders",
    )),
    ("teaming-finder", (
        "teaming", "team partner", "subcontractor", "gap-fill", "gap fill",
        "teaming partner", "who should we team", "teaming candidates",
    )),
    ("ptw-analysis", (
        "price to win", "ptw", "pricing posture", "price realism",
        "competitive pricing", "how should we price", "pricing benchmark",
    )),
    ("vault-lint", (
        "lint vault", "vault lint", "health check vault", "health check the vault",
        "health check the knowledge vault", "wiki lint", "wiki health",
        "check vault", "vault health",
    )),
    ("vault-index-rebuild", (
        "rebuild index", "rebuild vault index", "index rebuild", "refresh vault index",
    )),
    ("vault-synthesize", (
        "synthesize vault", "vault synthesize", "compound vault", "wiki synthesize",
        "synthesize knowledge", "update vault from pursuit",
    )),
    ("compliance-auditor", (
        "compliance audit", "audit far", "audit clauses", "far compliance",
        "dfars audit", "clause coverage", "are we compliant",
    )),
    ("sam-monitor-builder", (
        "create monitor", "sam monitor", "build monitor", "monitor builder",
    )),
    ("competitive-battlecard", (
        "battlecard", "battle card", "ghost team displace",
    )),
    ("competitive-snapshot", (
        "competitive snapshot", "comp snapshot", "competitor snapshot",
    )),
    ("sam-scan", ("sam scan", "scan sam", "live sam notices")),
    ("capture-brief", ("capture brief", "pursuit brief", "one-page brief")),
    ("pursuit-kickoff", ("pursuit kickoff", "kick off pursuit", "kickoff chain")),
    ("proposal-generator", (
        "draft proposal", "proposal outline", "executive summary", "win themes",
        "compliance matrix", "respond to rfp", "proposal volume",
    )),
    ("subcontractor-sow-builder", (
        "sub sow", "subcontractor sow", "teaming partner sow", "draft sow for",
        "statement of work for sub", "pws for partner",
    )),
    ("huashu-design", (
        "one pager", "one-pager", "pitch deck", "visual deck", "export deck",
        "html deck", "capture deck",
    )),
    ("value-propositions", ("value proposition", "value props", "messaging hooks")),
    ("positioning", ("positioning statement", "differentiation", "how do we position")),
    ("competitor-profiling", ("competitor profile", "profile competitor", "marketing competitor")),
    ("renderers", (
        "export to word", "export to docx", "render docx", "convert to excel",
        "export xlsx", "render markdown", "export executive summary to word",
    )),
    ("rfp-reverse-engineer", (
        "reverse engineer", "reverse-engineer", "rfp reverse", "co decision tree",
        "ghost language", "discriminator hooks", "what did the co decide",
        "hot buttons", "decode this rfp", "read this sow backwards",
    )),
    ("oci-sweeper", (
        "oci sweep", "oci risk", "organizational conflict", "conflict of interest",
        "biased ground rules", "unequal access", "impaired objectivity", "pre-bid oci",
    )),
    ("ot-prototype-strategist", (
        "ot bid", "prototype ot", "other transaction", "10 usc 4022", "trl milestone",
        "ot cost stack", "4022(d)", "cost share path", "milestone pricing",
        "ota bid", "cso", "commercial solutions opening", "non-far", "baa prototype",
        "ot project description", "ot cost analysis", "other transaction agreement",
    )),
    ("igce-builder-ffp", (
        "igce ffp", "ffp igce", "firm fixed price igce", "wrap rate", "ffp cost buildup",
        "fixed price estimate",
    )),
    ("igce-builder-lh-tm", (
        "igce t&m", "igce tm", "labor hour igce", "time and materials igce",
        "burdened hourly", "fully burdened rate",
    )),
    ("igce-builder-cr", (
        "igce cost reimbursement", "igce cpff", "cpaf igce", "cpif igce",
        "cost plus igce", "cr igce",
    )),
    ("data-analyzer", (
        "analyze data", "data analysis", "find insights", "statistical analysis",
        "find patterns", "trend analysis", "anomaly detection", "eda on",
        "analyze dataset", "compare groups",
    )),
]

_AUTO_INVOKE_SCORE = 9.0
_SUGGEST_SCORE = 5.0
_SCORE_GAP_FOR_AUTO = 2.0

_ACTION_INTENT_PHRASES = (
    "find ", "show ", "get ", "list ", "give me", "who are", "who's", "top ",
    "analyze", "compare", "pull ", "run ", "search ", "tell me",
)

_STOPWORDS = frozenset({
    "a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "at", "with",
    "this", "that", "from", "my", "our", "your", "me", "us", "is", "are", "be",
    "can", "you", "please", "help", "run", "skill", "use", "when", "user", "asks",
})


@dataclass
class SkillRouteCandidate:
    skill_id: str
    score: float
    runnable: bool
    reasons: List[str] = field(default_factory=list)
    title: str = ""
    description_excerpt: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "skill_id": self.skill_id,
            "score": round(self.score, 2),
            "runnable": self.runnable,
            "reasons": self.reasons,
            "title": self.title,
            "description_excerpt": self.description_excerpt,
        }


@dataclass
class SkillRouteResult:
    skill_id: Optional[str]
    auto_invoke: bool
    confidence: str
    method: str
    candidates: List[SkillRouteCandidate] = field(default_factory=list)
    inquiry: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "skill_id": self.skill_id,
            "auto_invoke": self.auto_invoke,
            "confidence": self.confidence,
            "method": self.method,
            "candidates": [c.to_dict() for c in self.candidates],
            "inquiry": self.inquiry,
        }


@dataclass(frozen=True)
class _DescriptionSignals:
    use_when: Tuple[str, ...]
    do_not_use: Tuple[str, ...]
    keywords: Tuple[str, ...]


def _normalize_msg(message: str) -> str:
    return re.sub(r"\s+", " ", (message or "").strip().lower())


def has_action_intent(message: str) -> bool:
    msg = _normalize_msg(message)
    return any(p in msg for p in _ACTION_INTENT_PHRASES)


def _tokenize(message: str) -> List[str]:
    return [
        t for t in re.findall(r"[a-z0-9][a-z0-9-]{1,}", _normalize_msg(message))
        if t not in _STOPWORDS and len(t) > 2
    ]


def _extract_use_when_phrases(description: str) -> List[str]:
    desc = description or ""
    segment = desc
    for pat in (
        r"USE WHEN\s+(.*?)(?:\.\s*DO NOT USE|\.\s*Supports|\.\s*Walks|\.\s*Pulls|\.\s*Reconstructs|\.$)",
        r"Use when\s+(.*?)(?:\.|$)",
    ):
        m = re.search(pat, desc, re.I | re.S)
        if m:
            segment = m.group(1)
            break

    phrases: List[str] = []
    phrases.extend(re.findall(r'"([^"]{4,140})"', segment))
    phrases.extend(re.findall(r"'([^']{4,140})'", segment))

    for chunk in re.split(r"\s+or\s+", segment):
        chunk = re.sub(r"^(the user asks(?:\s+to)?|any variant of)\s*", "", chunk.strip(), flags=re.I)
        chunk = chunk.strip(" .\"'")
        if 4 <= len(chunk) <= 140:
            phrases.append(chunk)

    cleaned: List[str] = []
    seen: set[str] = set()
    for p in phrases:
        norm = re.sub(r"\s+", " ", p.lower().strip())
        if norm and norm not in seen:
            seen.add(norm)
            cleaned.append(norm)
    return cleaned


def _extract_do_not_use_phrases(description: str) -> List[str]:
    m = re.search(r"DO NOT USE FOR\s+(.*?)(?:\.|$)", description or "", re.I | re.S)
    if not m:
        return []
    segment = m.group(1)
    phrases: List[str] = []
    phrases.extend(re.findall(r"`([^`]+)`", segment))
    for chunk in re.split(r",|\bor\b", segment):
        chunk = re.sub(r"\([^)]*\)", "", chunk).strip().lower()
        chunk = re.sub(r"\s+", " ", chunk).strip(" .")
        if 4 <= len(chunk) <= 80:
            phrases.append(chunk)
    return list(dict.fromkeys(phrases))


def _description_keywords(description: str) -> List[str]:
    words = re.findall(r"[a-z][a-z0-9-]{3,}", (description or "").lower())
    return [w for w in words if w not in _STOPWORDS][:40]


@lru_cache(maxsize=64)
def _signals_for_skill(skill_id: str, description: str) -> _DescriptionSignals:
    return _DescriptionSignals(
        use_when=tuple(_extract_use_when_phrases(description)),
        do_not_use=tuple(_extract_do_not_use_phrases(description)),
        keywords=tuple(_description_keywords(description)),
    )


def _match_explicit_triggers(msg: str) -> Optional[Tuple[str, str]]:
    for skill_id, phrases in _CHAT_TRIGGERS:
        if skill_id not in RUNNABLE_SKILL_IDS:
            continue
        for phrase in phrases:
            if phrase in msg:
                return skill_id, f"trigger:{phrase}"

    explicit = re.search(r"\brun\s+(?:skill\s+)?([a-z][a-z0-9-]+)", msg)
    if explicit:
        sid = explicit.group(1)
        if sid in RUNNABLE_SKILL_IDS:
            return sid, "explicit:run"

    for skill in discover_skills():
        if skill.name not in RUNNABLE_SKILL_IDS:
            continue
        title = str(skill.metadata.get("title") or skill.name).lower()
        if title in msg or skill.name.replace("-", " ") in msg:
            return skill.name, "name-match"

    return None


def _phrase_overlap_score(msg: str, phrase: str) -> float:
    if phrase in msg:
        return 8.0
    msg_tokens = set(_tokenize(msg))
    phrase_tokens = set(_tokenize(phrase))
    if not phrase_tokens:
        return 0.0
    overlap = len(msg_tokens & phrase_tokens)
    if overlap >= 2:
        return 4.0 + overlap
    if overlap == 1 and len(phrase_tokens) <= 3:
        return 3.0
    return 0.0


def _score_skill(skill: SkillRecord, msg: str, tokens: List[str]) -> SkillRouteCandidate:
    reasons: List[str] = []
    score = 0.0
    runnable = skill.name in RUNNABLE_SKILL_IDS
    title = str(skill.metadata.get("title") or skill.name.replace("-", " ").title())
    signals = _signals_for_skill(skill.name, skill.description)

    for phrase in signals.use_when:
        pts = _phrase_overlap_score(msg, phrase)
        if pts > 0:
            score += pts
            reasons.append(f"use-when:{phrase[:48]}")

    for phrase in signals.do_not_use:
        if _phrase_overlap_score(msg, phrase) >= 4.0:
            score -= 12.0
            reasons.append(f"excluded:{phrase[:40]}")

    token_set = set(tokens)
    kw_hits = sum(1 for k in signals.keywords if k in token_set)
    if kw_hits:
        score += min(kw_hits * 0.75, 4.0)
        if kw_hits >= 2:
            reasons.append(f"keywords:{kw_hits}")

    name_spaced = skill.name.replace("-", " ")
    if name_spaced in msg or skill.name in msg:
        score += 9.0
        reasons.append("skill-id")

    if title.lower() in msg:
        score += 7.0
        reasons.append("title")

    if not runnable:
        score *= 0.35

    excerpt = skill.description[:160] + ("…" if len(skill.description) > 160 else "")
    return SkillRouteCandidate(
        skill_id=skill.name,
        score=score,
        runnable=runnable,
        reasons=reasons,
        title=title,
        description_excerpt=excerpt,
    )


def score_skills_from_message(message: str, *, runnable_only: bool = False) -> List[SkillRouteCandidate]:
    """Rank skills by description + trigger relevance (for co-pilot routing UI)."""
    msg = _normalize_msg(message)
    if not msg:
        return []

    explicit = _match_explicit_triggers(msg)
    if explicit:
        sid, reason = explicit
        skill = next((s for s in discover_skills() if s.name == sid), None)
        title = str(skill.metadata.get("title") or sid) if skill else sid
        excerpt = (skill.description[:160] + "…") if skill and len(skill.description) > 160 else (skill.description if skill else "")
        return [
            SkillRouteCandidate(
                skill_id=sid,
                score=100.0,
                runnable=sid in RUNNABLE_SKILL_IDS,
                reasons=[reason],
                title=title,
                description_excerpt=excerpt,
            )
        ]

    tokens = _tokenize(msg)
    candidates: List[SkillRouteCandidate] = []
    for skill in discover_skills():
        if runnable_only and skill.name not in RUNNABLE_SKILL_IDS:
            continue
        cand = _score_skill(skill, msg, tokens)
        if cand.score > 0:
            candidates.append(cand)

    candidates.sort(key=lambda c: (-c.score, c.skill_id))
    return candidates


def route_skill_from_message(
    message: str,
    *,
    use_llm: bool = False,
) -> SkillRouteResult:
    """Pick a skill to auto-invoke or suggest based on catalog descriptions."""
    inquiry = (message or "").strip()
    msg = _normalize_msg(inquiry)
    if not msg:
        return SkillRouteResult(None, False, "none", "empty", [], inquiry)

    explicit = _match_explicit_triggers(msg)
    if explicit:
        sid, reason = explicit
        cand = score_skills_from_message(inquiry)[0]
        return SkillRouteResult(
            skill_id=sid,
            auto_invoke=True,
            confidence="high",
            method=reason.split(":")[0],
            candidates=[cand],
            inquiry=inquiry,
        )

    candidates = score_skills_from_message(inquiry, runnable_only=True)
    if not candidates:
        return SkillRouteResult(None, False, "none", "no-match", [], inquiry)

    top = candidates[0]
    second_score = candidates[1].score if len(candidates) > 1 else 0.0
    gap = top.score - second_score

    if top.score >= _AUTO_INVOKE_SCORE and (gap >= _SCORE_GAP_FOR_AUTO or top.score >= _AUTO_INVOKE_SCORE + 4):
        return SkillRouteResult(
            skill_id=top.skill_id,
            auto_invoke=True,
            confidence="high" if top.score >= 12 else "medium",
            method="description",
            candidates=candidates[:5],
            inquiry=inquiry,
        )

    if use_llm and top.score >= _SUGGEST_SCORE and gap < _SCORE_GAP_FOR_AUTO:
        picked = _llm_pick_skill(inquiry, candidates[:6])
        if picked and picked in RUNNABLE_SKILL_IDS:
            llm_cand = next((c for c in candidates if c.skill_id == picked), candidates[0])
            return SkillRouteResult(
                skill_id=picked,
                auto_invoke=True,
                confidence="medium",
                method="llm-description",
                candidates=[llm_cand, *([c for c in candidates if c.skill_id != picked][:4])],
                inquiry=inquiry,
            )

    if top.score >= _SUGGEST_SCORE:
        # Action verbs ("find top competitors…") should execute, not show routing cards.
        if has_action_intent(inquiry) and top.score >= 7.0 and gap >= 1.5:
            return SkillRouteResult(
                skill_id=top.skill_id,
                auto_invoke=True,
                confidence="medium",
                method="action-intent",
                candidates=candidates[:5],
                inquiry=inquiry,
            )
        return SkillRouteResult(
            skill_id=top.skill_id,
            auto_invoke=False,
            confidence="medium" if top.score >= 7 else "low",
            method="description-suggest",
            candidates=candidates[:5],
            inquiry=inquiry,
        )

    return SkillRouteResult(None, False, "low", "below-threshold", candidates[:3], inquiry)


def _llm_pick_skill(message: str, candidates: List[SkillRouteCandidate]) -> Optional[str]:
    """Optional tie-breaker when description scores are ambiguous."""
    if not candidates:
        return None
    try:
        from .llm import call_llm
    except ImportError:
        return None

    lines = []
    for c in candidates:
        if not c.runnable:
            continue
        lines.append(f"- {c.skill_id}: {c.description_excerpt}")
    if not lines:
        return None

    prompt = (
        "Pick the single best Agent Skill for the user message, or reply NONE.\n"
        "Reply with ONLY the skill_id or NONE.\n\n"
        f"User: {message}\n\nSkills:\n" + "\n".join(lines)
    )
    try:
        raw = call_llm(prompt, temperature=0.0, max_tokens=40, system="You route capture tasks to skills. Output only skill_id or NONE.")
        pick = (raw or "").strip().split()[0].lower().rstrip(".,;")
        if pick == "none":
            return None
        if pick in RUNNABLE_SKILL_IDS:
            return pick
    except Exception:
        return None
    return None


def match_skill_from_message(message: str) -> Optional[str]:
    """Return skill_id if message clearly requests a runnable skill."""
    route = route_skill_from_message(message)
    if route.auto_invoke and route.skill_id in RUNNABLE_SKILL_IDS:
        return route.skill_id
    return None


def format_skill_route_suggestion(route: SkillRouteResult) -> Dict[str, Any]:
    """Co-pilot response when a skill likely fits but auto-invoke was not triggered."""
    runnable = [c for c in route.candidates if c.runnable]
    if not runnable:
        return {
            "response": "I couldn't match that to a runnable Agent Skill yet. Try Agent Skills or name the skill (e.g. run vault-lint).",
            "suggested_actions": [],
            "source": "skill-route-empty",
            "skill_route": route.to_dict(),
        }

    top = runnable[0]
    alts = runnable[1:3]
    lines = [
        f"That sounds like **{top.title or top.skill_id}** (`{top.skill_id}`).",
        top.description_excerpt,
    ]
    if alts:
        lines.append("\nOther matches: " + ", ".join(f"`{a.skill_id}`" for a in alts))

    actions: List[Dict[str, Any]] = []
    for c in runnable[:3]:
        actions.append({
            "label": f"Run {c.title or c.skill_id}",
            "action": "invoke_skill",
            "payload": {
                "skill_id": c.skill_id,
                "inquiry": route.inquiry,
            },
        })

    return {
        "response": "\n".join(lines),
        "suggested_actions": actions,
        "source": "skill-route-suggest",
        "skill_route": route.to_dict(),
    }


def extract_contract_number(message: str) -> Optional[str]:
    """Pull PIID/contract-like token from user message."""
    msg = message or ""
    for pat in (
        r"\b([A-Z0-9]{2,6}-[A-Z0-9]{2,8}-\d{2,6}[A-Z0-9-]*)\b",
        r"\bcontract\s+(?:number\s+)?([A-Z0-9][A-Z0-9-]{4,24})\b",
        r"\bpiid\s+([A-Z0-9][A-Z0-9-]{4,24})\b",
    ):
        m = re.search(pat, msg, re.I)
        if m:
            return m.group(1).strip().upper()
    return None


def extract_partner_name(message: str) -> Optional[str]:
    m = re.search(r"(?:sow|pws|for)\s+(?:partner\s+)?([A-Za-z0-9][A-Za-z0-9 &.\-]{2,60})", message, re.I)
    if m:
        return m.group(1).strip().rstrip(".")
    return None


def extract_capability_gap(message: str) -> Optional[str]:
    m = re.search(r"(?:gap|capability|need)\s*[:\-]?\s*(.{8,120})", message, re.I)
    if m:
        return m.group(1).strip().rstrip(".")
    return None