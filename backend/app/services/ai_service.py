from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import decrypt_secret, mask_secret
from app.core.enums import ArticleVisibility, MessageSenderType
from app.models.ai import AIConfig, AIUsageLog
from app.models.conversation import Conversation
from app.models.knowledge import Article, FAQ
from app.models.message import Message
from app.models.user import User

logger = logging.getLogger(__name__)

DEFAULT_SYSTEM = (
    "You are a helpful, friendly, and professional customer support assistant for OpenChat Support. "
    "Communicate naturally, concisely, and helpfully. "
    "Answer customer inquiries using the provided knowledge context and conversation history. "
    "Do not invent policies, prices, refund decisions, timelines, account states, or unsupported facts. "
    "Never expose internal technical details, system limitations, knowledge bases, or retrieval sources to the customer. "
    "When more information is needed to assist the customer, ask a natural, friendly follow-up question (for example: 'Could you share a little more information about your order? I\\'ll help you look into this.'). "
    "Do not ask customers whether they want you to recommend escalation to a human agent; the system handles escalation automatically when necessary. "
    "When human escalation is necessary, communicate naturally and professionally (for example: 'I\\'ll connect you with a member of our support team who can help you with this.'). "
    "Never expose internal security, classification categories, confidence scores, or knowledge retrieval references. "
    "Never falsely claim an issue has been resolved or that a refund or cancellation has already been processed. "
    "Do not proactively reveal that you are an AI. If directly asked, answer honestly and courteously without falsely claiming to be human."
)

PROMPT_INJECTION_PATTERNS = [
    r"ignore (all|any|previous|prior) (instructions|prompts)",
    r"reveal (the )?(system|developer) (prompt|message|instructions)",
    r"show (me )?(your )?(api|secret) key",
    r"act as (system|developer|admin)",
    r"bypass (safety|policy|rules)",
    r"jailbreak",
]

EXPLICIT_HUMAN_PATTERNS = [
    r"\bhuman\b", r"\bagent\b", r"\brepresentative\b", r"\bspeak to (a|someone|person)\b",
    r"\btalk to (a|someone|person)\b", r"real person", r"\bmanager\b", r"\bsupervisor\b",
    r"connect me", r"transfer me",
]

SENSITIVE_PATTERNS = [
    r"\brefund\b", r"\bcharge\b", r"\bbilling\b", r"\bpayment\b", r"\binvoice\b", r"\bcredit card\b",
    r"\baccount (closure|deletion|delete|locked|hacked|compromised)\b", r"\bpassword reset\b",
    r"\blegal\b", r"\blawyer\b", r"\bsue\b", r"\bcourt\b", r"\bgdpr\b", r"\bdata deletion\b",
    r"\bsecurity\b", r"\bbreach\b", r"\bhack\b", r"\bssn\b", r"\bidentity\b",
]

COMPLEX_PATTERNS = [
    r"\bnot working\b", r"\berror\b", r"\bbug\b", r"\bcrash\b", r"\boutage\b", r"\bdown\b",
    r"\bbroken\b", r"\bcan't (access|login|sign in)\b", r"\bintegration\b", r"\bapi\b",
]

GREETING_PATTERNS = [
    r"^\s*(hi|hello|hey|good (morning|afternoon|evening)|howdy|greetings)[\s!.,?]*$",
    r"^\s*(how are you|who are you|what can you do)[\s!.,?]*$",
    r"^\s*hi there[\s!.,?]*$",
]

PRICING_RATES = {
    # Reference estimates per 1M tokens (input, output)
    "gemini:gemini-flash-lite-latest": (0.0375, 0.15),
    "gemini:gemini-flash-latest": (0.075, 0.30),
    "gemini:gemini-pro-latest": (0.50, 1.50),
    "openai:gpt-4o-mini": (0.15, 0.60),
    "openai:gpt-4o": (2.50, 10.00),
    "anthropic:claude-3-5-sonnet": (3.00, 15.00),
    "anthropic:claude-3-haiku": (0.25, 1.25),
    "demo:demo": (0.0, 0.0),
}


@dataclass
class KnowledgeHit:
    source_type: str  # faq/article
    id: int
    title: str
    content: str
    excerpt: str | None = None
    score: float = 0.0

    def to_ref(self) -> dict[str, Any]:
        return {
            "type": self.source_type,
            "id": self.id,
            "title": self.title,
            "excerpt": (self.excerpt or self.content[:180]).strip(),
            "score": round(self.score, 3),
        }


@dataclass
class AIProcessingResult:
    answer: str
    should_escalate: bool
    escalation_reason: str | None
    decision: str  # answered|clarify|abstain|escalate|handoff_requested|disabled
    confidence: float
    sources: list[dict[str, Any]] = field(default_factory=list)
    usage: dict[str, Any] = field(default_factory=dict)
    provider: str = "demo"
    model: str | None = None
    latency_ms: int | None = None
    context_summary: str | None = None
    error: str | None = None


@dataclass
class RuntimeAIConfig:
    ai_enabled: bool = True
    provider: str = "gemini"
    model: str = "gemini-flash-lite-latest"
    temperature: float = 0.3
    max_tokens: int = 500
    system_instructions: str = DEFAULT_SYSTEM
    greeting: str = "Hi! How can I help you today?"
    tone: str = "professional"
    supported_languages: list[str] = field(default_factory=lambda: ["en"])
    confidence_threshold: float = 0.55
    escalation_rules: dict[str, Any] = field(default_factory=dict)
    max_response_length: int = 1200
    knowledge_sources: dict[str, Any] = field(default_factory=lambda: {"faqs": True, "articles": True})
    gemini_api_key: str | None = None
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_or_create_ai_config(db: Session) -> AIConfig:
    cfg = db.query(AIConfig).order_by(AIConfig.id.asc()).first()
    if cfg:
        return cfg
    cfg = AIConfig(
        ai_enabled=True,
        provider=getattr(settings, "ai_provider", "gemini") or "gemini",
        model=getattr(settings, "ai_model", "gemini-flash-latest") or "gemini-flash-latest",
        temperature=float(getattr(settings, "ai_temperature", 0.3) or 0.3),
        max_tokens=500,
        system_instructions=DEFAULT_SYSTEM,
        greeting="Hi! How can I help you today?",
        tone="professional",
        supported_languages=["en"],
        confidence_threshold=0.55,
        escalation_rules={"escalate_on_sensitive": True, "escalate_on_uncertain": True, "max_ai_turns": 6},
        max_response_length=1200,
        knowledge_sources={"faqs": True, "articles": True},
    )
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg


def to_runtime_config(cfg: AIConfig) -> RuntimeAIConfig:
    rules = dict(cfg.escalation_rules or {})
    rules.setdefault("escalate_on_sensitive", True)
    rules.setdefault("escalate_on_uncertain", True)
    rules.setdefault("max_ai_turns", 6)
    ks = dict(cfg.knowledge_sources or {})
    ks.setdefault("faqs", True)
    ks.setdefault("articles", True)
    langs = [str(x) for x in (cfg.supported_languages or ["en"]) if str(x).strip()] or ["en"]
    return RuntimeAIConfig(
        ai_enabled=bool(cfg.ai_enabled),
        provider=(cfg.provider or "gemini").strip().lower(),
        model=(cfg.model or "gemini-flash-latest").strip(),
        temperature=float(cfg.temperature if cfg.temperature is not None else 0.3),
        max_tokens=int(cfg.max_tokens or 500),
        system_instructions=(cfg.system_instructions or DEFAULT_SYSTEM).strip() or DEFAULT_SYSTEM,
        greeting=(cfg.greeting or "").strip() or "Hi! How can I help you today?",
        tone=(cfg.tone or "professional").strip() or "professional",
        supported_languages=langs,
        confidence_threshold=float(cfg.confidence_threshold if cfg.confidence_threshold is not None else 0.55),
        escalation_rules=rules,
        max_response_length=int(cfg.max_response_length or 1200),
        knowledge_sources=ks,
        gemini_api_key=decrypt_secret(getattr(cfg, "gemini_api_key_encrypted", None)) or getattr(settings, "gemini_api_key", None),
        openai_api_key=decrypt_secret(getattr(cfg, "openai_api_key_encrypted", None)) or getattr(settings, "openai_api_key", None),
        anthropic_api_key=decrypt_secret(getattr(cfg, "anthropic_api_key_encrypted", None)) or getattr(settings, "anthropic_api_key", None),
    )


def _tokenize(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]{3,}", (text or "").lower()) if t not in {"the", "and", "for", "with", "that", "this", "have", "from", "your", "you", "can", "how", "what"}]


def retrieve_knowledge_hits(db: Session, query: str, *, limit: int = 5, sources: dict[str, Any] | None = None) -> list[KnowledgeHit]:
    sources = sources or {"faqs": True, "articles": True}
    tokens = _tokenize(query)
    hits: list[KnowledgeHit] = []
    qlower = (query or "").lower()

    if sources.get("faqs", True):
        faq_q = db.query(FAQ).filter(FAQ.is_published == True)  # noqa: E712
        if tokens:
            conds = [FAQ.question.ilike(f"%{t}%") | FAQ.answer.ilike(f"%{t}%") for t in tokens[:8]]
            faq_q = faq_q.filter(or_(*conds))
        faqs = faq_q.limit(limit * 3).all()
        for faq in faqs:
            text = f"{faq.question} {faq.answer}".lower()
            score = sum(2.0 for t in tokens if t in text) + (3.0 if any(t in faq.question.lower() for t in tokens) else 0.0)
            if qlower and qlower in faq.question.lower():
                score += 4.0
            if score <= 0 and not tokens:
                score = 0.5
            if score > 0:
                hits.append(KnowledgeHit("faq", faq.id, faq.question, faq.answer, faq.answer[:220], score))

    if sources.get("articles", True):
        art_q = db.query(Article).filter(
            Article.status == "published",
            Article.visibility.in_([ArticleVisibility.PUBLIC, ArticleVisibility.AGENTS_ONLY]),
        )
        if tokens:
            conds = [Article.title.ilike(f"%{t}%") | Article.content.ilike(f"%{t}%") | Article.excerpt.ilike(f"%{t}%") for t in tokens[:8]]
            art_q = art_q.filter(or_(*conds))
        arts = art_q.limit(limit * 3).all()
        for art in arts:
            text = f"{art.title} {art.excerpt or ''} {art.content}".lower()
            score = sum(1.5 for t in tokens if t in text) + (3.0 if any(t in art.title.lower() for t in tokens) else 0.0)
            if score <= 0 and not tokens:
                score = 0.5
            if score > 0:
                excerpt = art.excerpt or art.content[:220]
                hits.append(KnowledgeHit("article", art.id, art.title, art.content, excerpt, score))

    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:limit]


def retrieve_knowledge(db: Session, query: str, limit: int = 5) -> str:
    # Backward-compatible helper used by older code/tests if any
    hits = retrieve_knowledge_hits(db, query, limit=limit)
    return format_knowledge_context(hits)


def format_knowledge_context(hits: list[KnowledgeHit], max_chars: int = 4000) -> str:
    if not hits:
        return ""
    parts = []
    total = 0
    for h in hits:
        body = h.content.strip()
        if h.source_type == "article" and len(body) > 900:
            body = body[:900] + "..."
        block = f"[Source {h.source_type}:{h.id}] {h.title}\n{body}"
        if total + len(block) > max_chars:
            break
        parts.append(block)
        total += len(block)
    return "\n\n---\n\n".join(parts)


def _sanitize_user_text(text: str) -> str:
    # Remove control chars and cap size for prompt/context safety
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text or "")
    return cleaned.strip()[:4000]


def detect_prompt_injection(text: str) -> bool:
    t = (text or "").lower()
    return any(re.search(p, t) for p in PROMPT_INJECTION_PATTERNS)


def is_any_agent_available(db: Session) -> bool:
    try:
        from app.models.agent_profile import AgentProfile
        return (
            db.query(User)
            .join(AgentProfile, User.id == AgentProfile.user_id)
            .filter(User.role == "agent", User.is_active == True, AgentProfile.is_available == True)  # noqa: E712
            .count() > 0
        )
    except Exception:
        return True


def get_natural_escalation_message(db: Session) -> str:
    if is_any_agent_available(db):
        return "I'll connect you with a member of our support team who can help you with this."
    return "Our support team will follow up to help you with this shortly. Please leave any additional details here."


def detect_explicit_human_request(text: str) -> bool:
    t = (text or "").lower()
    return any(re.search(p, t) for p in EXPLICIT_HUMAN_PATTERNS)


def detect_sensitive_or_restricted(text: str, rules: dict[str, Any]) -> tuple[bool, str | None]:
    t = (text or "").lower()
    if rules.get("escalate_on_sensitive", True):
        for p in SENSITIVE_PATTERNS:
            if re.search(p, t):
                return True, "Sensitive or account/billing/security-related request requires human assistance"
        custom_topics = rules.get("sensitive_topics") or []
        for topic in custom_topics:
            if topic and str(topic).strip().lower() in t:
                return True, f"Request matches restricted sensitive topic: '{topic}'"
    return False, None


def detect_complexity(text: str) -> bool:
    t = (text or "").lower()
    return any(re.search(p, t) for p in COMPLEX_PATTERNS)


def detect_greeting(text: str) -> bool:
    t = (text or "").strip().lower()
    words = t.split()
    if len(words) <= 15:
        greeting_regexes = [
            r"\b(hi|hello|hey|howdy|greetings)\b",
            r"\bgood\s+(morning|afternoon|evening|day)\b",
            r"\bhi\s+there\b",
            r"\bhey\s+there\b",
            r"\bhow\s+are\s+you\b",
            r"\bwho\s+are\s+you\b",
            r"\bwhat\s+can\s+you\s+do\b",
        ]
        if any(re.search(p, t) for p in greeting_regexes):
            return True
    return False


def build_handoff_summary(conversation: Conversation, messages: list[Message], escalation_reason: str | None, sources: list[dict[str, Any]], max_messages: int = 8) -> str:
    public = [m for m in messages if not getattr(m, "is_internal", False)]
    tail = public[-max_messages:]
    lines = [
        f"Conversation #{conversation.id} handoff summary",
        f"Subject: {conversation.subject or 'N/A'}",
        f"Status before handoff: {getattr(conversation, 'status', 'unknown')}",
        f"Reason: {escalation_reason or 'Escalation requested'}",
    ]
    if sources:
        src_lines = [f"- {s.get('type')}:{s.get('id')} {s.get('title','')}" for s in sources[:5]]
        lines.append("Knowledge consulted:")
        lines.extend(src_lines)
    else:
        lines.append("Knowledge consulted: none relevant")
    lines.append("Recent messages:")
    for m in tail:
        role = m.sender_type
        content = (m.content or "").strip().replace("\n", " ")
        if len(content) > 240:
            content = content[:240] + "..."
        lines.append(f"- [{role}] {content}")
    summary = "\n".join(lines)
    return summary[:3500]


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    # rough estimate
    return max(1, int(len(text) / 4))


def estimate_cost(provider: str, model: str | None, prompt_tokens: int, completion_tokens: int) -> float:
    key = f"{provider}:{model or ''}"
    rates = PRICING_RATES.get(key)
    if not rates:
        # try provider-only fallback
        for k, v in PRICING_RATES.items():
            if k.startswith(provider + ":"):
                rates = v
                break
    if not rates:
        rates = (0.0, 0.0)
    in_rate, out_rate = rates
    return round((prompt_tokens / 1_000_000) * in_rate + (completion_tokens / 1_000_000) * out_rate, 8)


def record_ai_usage(db: Session, *, conversation_id: int | None, message_id: int | None, provider: str, model: str | None,
                    prompt_tokens: int, completion_tokens: int, total_tokens: int, estimated_cost_usd: float,
                    latency_ms: int | None, success: bool, error_message: str | None, decision: str | None) -> None:
    try:
        log = AIUsageLog(
            conversation_id=conversation_id,
            message_id=message_id,
            provider=provider,
            model=model,
            prompt_tokens=int(prompt_tokens or 0),
            completion_tokens=int(completion_tokens or 0),
            total_tokens=int(total_tokens or 0),
            estimated_cost_usd=float(estimated_cost_usd or 0.0),
            latency_ms=latency_ms,
            success=bool(success),
            error_message=(error_message or None),
            decision=decision,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
    except Exception:
        db.rollback()
        logger.exception("Failed to record AI usage log")


def _format_conversation_context(messages: list[Message], limit: int = 12) -> str:
    lines = []
    for m in [msg for msg in messages if not getattr(msg, "is_internal", False)][-limit:]:
        role = m.sender_type
        content = _sanitize_user_text(m.content)
        if len(content) > 700:
            content = content[:700] + "..."
        lines.append(f"[{role}] {content}")
    return "\n".join(lines)


def _build_provider_messages(runtime: RuntimeAIConfig, conversation: Conversation, messages: list[Message], customer: User, knowledge_hits: list[KnowledgeHit]) -> tuple[str, list[dict[str, str]]]:
    knowledge_context = format_knowledge_context(knowledge_hits)
    system = runtime.system_instructions or DEFAULT_SYSTEM
    system += (
        f"\nTone: {runtime.tone}."
        f"\nSupported languages (respond in user's language when possible): {', '.join(runtime.supported_languages or ['en'])}."
        "\nCustomer-facing communication guidelines: "
        "- Identity: OpenChat Support. "
        "- Tone: Natural, friendly, professional, concise, and helpful. "
        "- Never cite internal source tags (like [Source ...] or article IDs), never mention knowledge bases or 'verified knowledge', and never expose technical AI limitations. "
        "- When information is needed or uncertain, ask a friendly, natural clarifying question (e.g. 'Could you share a little more information about your order? I\\'ll help you look into this.'). "
        "- Do not ask customers whether they want you to recommend escalation; our system manages routing automatically. "
        "- Never claim refunds or account changes have already been processed without confirmation."
    )
    if knowledge_context:
        system += f"\n\nReference context:\n{knowledge_context}"
    else:
        system += "\n\nReference context: None available. Ask a polite clarifying question or provide general assistance."

    history = []
    for m in [msg for msg in messages if not getattr(msg, "is_internal", False)][-12:]:
        role = "assistant" if m.sender_type in (MessageSenderType.AI, MessageSenderType.AGENT) else "user"
        prefix = ""
        if m.sender_type == MessageSenderType.AGENT:
            prefix = "[Human Agent] "
        elif m.sender_type == MessageSenderType.SYSTEM:
            prefix = "[System] "
        elif m.sender_type == MessageSenderType.CUSTOMER:
            prefix = ""
        history.append({"role": role, "content": f"{prefix}{_sanitize_user_text(m.content)}"[:1200]})
    if not history:
        history.append({"role": "user", "content": "Hello"})
    return system, history


async def _call_openai(runtime: RuntimeAIConfig, system: str, history: list[dict[str, str]]) -> tuple[str, dict[str, Any]]:
    key = (runtime.openai_api_key or "").strip()
    if not key:
        raise RuntimeError("OpenAI API key is not configured")

    import httpx
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": runtime.model or "gpt-4o-mini",
        "temperature": float(runtime.temperature if runtime.temperature is not None else 0.3),
        "max_tokens": int(runtime.max_tokens if runtime.max_tokens is not None else 1000),
        "messages": [{"role": "system", "content": system}, *history],
    }

    last_err = None
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                data = resp.json()
                if resp.status_code == 200:
                    text = (data["choices"][0]["message"]["content"] or "").strip()
                    usage = data.get("usage", {})
                    usage_d = {
                        "prompt_tokens": int(usage.get("prompt_tokens", 0) or 0),
                        "completion_tokens": int(usage.get("completion_tokens", 0) or 0),
                        "total_tokens": int(usage.get("total_tokens", 0) or 0),
                    }
                    return text, usage_d
                elif resp.status_code == 401:
                    err_msg = data.get("error", {}).get("message", "Incorrect or invalid OpenAI API key")
                    raise RuntimeError(f"OpenAI Authentication Error (401): {err_msg}")
                elif resp.status_code == 429:
                    err_msg = data.get("error", {}).get("message", "OpenAI rate limit or quota exceeded")
                    raise RuntimeError(f"OpenAI Rate Limit Error (429): {err_msg}")
                else:
                    err_msg = data.get("error", {}).get("message", f"HTTP {resp.status_code}")
                    raise RuntimeError(f"OpenAI API Error ({resp.status_code}): {err_msg}")
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            last_err = e
            if attempt == 0:
                await asyncio.sleep(1.0)
                continue
            raise RuntimeError(f"OpenAI API network timeout: {e}") from e
    if last_err:
        raise RuntimeError(f"OpenAI API failed: {last_err}") from last_err
    raise RuntimeError("OpenAI API call failed without response")


async def _call_anthropic(runtime: RuntimeAIConfig, system: str, history: list[dict[str, str]]) -> tuple[str, dict[str, Any]]:
    key = (runtime.anthropic_api_key or "").strip()
    if not key:
        raise RuntimeError("Anthropic API key is not configured")

    import httpx
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = {
        "model": runtime.model or "claude-3-haiku-20240307",
        "system": system,
        "temperature": float(runtime.temperature if runtime.temperature is not None else 0.3),
        "max_tokens": int(runtime.max_tokens if runtime.max_tokens is not None else 1000),
        "messages": history,
    }

    last_err = None
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                data = resp.json()
                if resp.status_code == 200:
                    text = ""
                    for block in data.get("content", []):
                        if block.get("type") == "text":
                            text += block.get("text", "")
                    usage = data.get("usage", {})
                    prompt = int(usage.get("input_tokens", 0) or 0)
                    completion = int(usage.get("output_tokens", 0) or 0)
                    return text.strip(), {
                        "prompt_tokens": prompt,
                        "completion_tokens": completion,
                        "total_tokens": prompt + completion,
                    }
                elif resp.status_code == 401:
                    err_msg = data.get("error", {}).get("message", "Incorrect or invalid Anthropic API key")
                    raise RuntimeError(f"Anthropic Authentication Error (401): {err_msg}")
                elif resp.status_code == 429:
                    err_msg = data.get("error", {}).get("message", "Anthropic rate limit or quota exceeded")
                    raise RuntimeError(f"Anthropic Rate Limit Error (429): {err_msg}")
                else:
                    err_msg = data.get("error", {}).get("message", f"HTTP {resp.status_code}")
                    raise RuntimeError(f"Anthropic API Error ({resp.status_code}): {err_msg}")
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            last_err = e
            if attempt == 0:
                await asyncio.sleep(1.0)
                continue
            raise RuntimeError(f"Anthropic API network timeout: {e}") from e
    if last_err:
        raise RuntimeError(f"Anthropic API failed: {last_err}") from last_err
    raise RuntimeError("Anthropic API call failed without response")


async def _call_demo(runtime: RuntimeAIConfig, system: str, history: list[dict[str, str]], knowledge_hits: list[KnowledgeHit], last_user: str) -> tuple[str, dict[str, Any]]:
    # Deterministic, knowledge-grounded demo provider for dev/test and safe fallback
    prompt = f"{system}\n\n{json.dumps(history[-6:], ensure_ascii=False)}\n\n{last_user}"
    p = estimate_tokens(prompt)
    if knowledge_hits:
        top = knowledge_hits[0]
        snippet = (top.excerpt or top.content or "").strip().replace("\n", " ")
        if len(snippet) > 320:
            snippet = snippet[:320] + "..."
        answer = f"{snippet}"
    else:
        answer = "Could you share a little more information about what you need? I'll help you look into this."
    c = estimate_tokens(answer)
    return answer, {"prompt_tokens": p, "completion_tokens": c, "total_tokens": p + c}


async def _call_gemini(runtime: RuntimeAIConfig, system: str, history: list[dict[str, str]]) -> tuple[str, dict[str, Any]]:
    key = (runtime.gemini_api_key or "").strip()
    if not key:
        raise RuntimeError("Google Gemini API key is not configured")

    import httpx
    model = (runtime.model or "gemini-flash-latest").strip()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {
        "x-goog-api-key": key,
        "Content-Type": "application/json",
    }

    # Format history for Gemini contents (roles: 'user' or 'model')
    contents: list[dict[str, Any]] = []
    for m in history:
        role = "model" if m.get("role") in ("assistant", "model") else "user"
        content_text = (m.get("content") or "").strip() or "Hello"
        if contents and contents[-1]["role"] == role:
            contents[-1]["parts"][0]["text"] += f"\n{content_text}"
        else:
            contents.append({"role": role, "parts": [{"text": content_text}]})

    if not contents:
        contents = [{"role": "user", "parts": [{"text": "Hello"}]}]
    elif contents[0]["role"] == "model":
        contents.insert(0, {"role": "user", "parts": [{"text": "Hello"}]})

    payload: dict[str, Any] = {
        "contents": contents,
        "generationConfig": {
            "temperature": float(runtime.temperature if runtime.temperature is not None else 0.3),
            "maxOutputTokens": int(runtime.max_tokens if runtime.max_tokens is not None else 1000),
        },
    }
    if system and system.strip():
        payload["system_instruction"] = {"parts": [{"text": system.strip()}]}

    last_err = None
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                data = resp.json()
                if resp.status_code == 200:
                    candidates = data.get("candidates", [])
                    if not candidates:
                        raise RuntimeError("Gemini returned an empty candidate list")
                    first_cand = candidates[0]
                    parts = first_cand.get("content", {}).get("parts", [])
                    text = "".join(p.get("text", "") for p in parts if isinstance(p, dict) and "text" in p).strip()
                    usage_meta = data.get("usageMetadata", {})
                    prompt_tokens = int(usage_meta.get("promptTokenCount", 0) or 0)
                    completion_tokens = int(usage_meta.get("candidatesTokenCount", 0) or 0)
                    total_tokens = int(usage_meta.get("totalTokenCount", 0) or (prompt_tokens + completion_tokens))
                    return text, {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "total_tokens": total_tokens,
                    }
                else:
                    err_info = data.get("error", {})
                    err_code = err_info.get("code", resp.status_code)
                    err_msg = err_info.get("message", f"HTTP {resp.status_code}")
                    details = err_info.get("details", [])
                    reasons = [d.get("reason") for d in details if isinstance(d, dict) and "reason" in d]
                    if resp.status_code in (401, 403) or "API_KEY_INVALID" in reasons or "API key not valid" in err_msg:
                        raise RuntimeError(f"Gemini Authentication Error: {err_msg}")
                    elif resp.status_code == 429 or "RESOURCE_EXHAUSTED" in reasons or "quota" in err_msg.lower():
                        raise RuntimeError(f"Gemini Rate Limit Error (429): {err_msg}")
                    else:
                        raise RuntimeError(f"Gemini API Error ({err_code}): {err_msg}")
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            last_err = e
            if attempt == 0:
                await asyncio.sleep(1.0)
                continue
            raise RuntimeError(f"Gemini API network timeout: {e}") from e
    if last_err:
        raise RuntimeError(f"Gemini API failed: {last_err}") from last_err
    raise RuntimeError("Gemini API call failed without response")


async def generate_with_provider(runtime: RuntimeAIConfig, system: str, history: list[dict[str, str]], knowledge_hits: list[KnowledgeHit], last_user: str) -> tuple[str, dict[str, Any], str]:
    provider = (runtime.provider or "gemini").lower()
    if provider == "gemini":
        text, usage = await _call_gemini(runtime, system, history)
        return text, usage, "gemini"
    if provider == "openai":
        text, usage = await _call_openai(runtime, system, history)
        return text, usage, "openai"
    if provider == "anthropic":
        text, usage = await _call_anthropic(runtime, system, history)
        return text, usage, "anthropic"
    text, usage = await _call_demo(runtime, system, history, knowledge_hits, last_user)
    return text, usage, "demo"


UNCONFIRMED_ACTION_PATTERNS = [
    (r"\b(i have|i've|we have|we've)\s+(successfully\s+)?(processed|issued|reversed|approved|sent|completed)\s+(a\s+|your\s+|the\s+)?(full\s+|partial\s+)?(refund|chargeback|reversal|credit|payment)\b[^\.\n]*", 
     "I have recorded your request. A support agent will review your account and assist with submitting this for processing."),
    (r"\b(your\s+)?(refund|chargeback|reversal|payment)\s+(has been|is|was)\s+(successfully\s+)?(processed|issued|approved|completed|sent)\b[^\.\n]*",
     "Your request has been received. A support agent will review your account and assist with processing."),
    (r"\b(i have|i've|we have|we've)\s+(successfully\s+)?(cancelled|canceled|terminated|closed|deleted)\s+(your\s+|the\s+)?(subscription|account|plan|membership)\b[^\.\n]*",
     "I have recorded your request. A support agent will review your account and assist with this change."),
    (r"\b(your\s+)?(subscription|account|plan|membership)\s+(has been|is|was)\s+(successfully\s+)?(cancelled|canceled|terminated|closed|deleted)\b[^\.\n]*",
     "Your request has been received. A support agent will review your account and assist with this change."),
    (r"\b(i have|i've|we have|we've)\s+(successfully\s+)?(booked|reserved|scheduled)\s+[^\.\n]*",
     "I have recorded your request. A support agent will review and assist with confirmation."),
]


def enforce_action_claim_safety(text: str) -> str:
    cleaned = text
    for pattern, replacement in UNCONFIRMED_ACTION_PATTERNS:
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)
    return cleaned


def clean_customer_facing_text(text: str) -> str:
    cleaned = text or ""
    # Strip bracketed source tags like [Source article:2], [Source faq:1], [Source: verified knowledge context], etc.
    cleaned = re.sub(r"\[\s*Source[^\]]*\]", "", cleaned, flags=re.IGNORECASE)
    # Strip "Sources: ..." lines
    cleaned = re.sub(r"(?im)^\s*Sources?\s*:[^\n]*$", "", cleaned)
    cleaned = re.sub(r"\bSources?\s*:\s*\[?[A-Za-z0-9_:\s,\.\-]+\]?", "", cleaned)
    # Strip internal knowledge base claims
    cleaned = re.sub(
        r"(?i)\bI don't have enough verified information in my (current )?knowledge base[^\.\n]*[\.\n]?",
        "Could you share a little more information about this? I'll help you look into it.",
        cleaned
    )
    cleaned = re.sub(
        r"(?i)\bI don't have enough verified information in the knowledge base[^\.\n]*[\.\n]?",
        "Could you share a little more information about this? I'll help you look into it.",
        cleaned
    )
    cleaned = re.sub(
        r"(?i)\bBased on our verified knowledge[^:]*:\s*",
        "",
        cleaned
    )
    # Strip asking the customer if they want escalation or recommendation to human agent
    cleaned = re.sub(
        r"(?i)\s*,?\s*(or\s+)?would you like me to (recommend\s+)?(escalation\s+to\s+a\s+human\s+agent|connect\s+you\s+with\s+a\s+human\s+agent)\??",
        ".",
        cleaned
    )
    cleaned = re.sub(
        r"(?i)\bThis request involves a sensitive or account-specific action that requires human assistance\b[^\.\n]*[\.\n]?",
        "I'll connect you with a member of our support team who can help you with this.",
        cleaned
    )
    cleaned = re.sub(
        r"(?i)\b(sensitive or account-specific action|requires human assistance|internal classification|confidence score)[^\.\n]*[\.\n]?",
        "I'll connect you with a member of our support team who can help you with this.",
        cleaned
    )
    cleaned = re.sub(
        r"(?i)\bIf you'd prefer, I can (connect|transfer) you with a human agent\.?",
        "",
        cleaned
    )
    cleaned = re.sub(
        r"(?i)\bI can clarify or connect you with a human agent\.?",
        "",
        cleaned
    )
    # Clean redundant whitespace and trailing punctuation
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    return cleaned.strip()


def _validate_output(text: str, runtime: RuntimeAIConfig, knowledge_hits: list[KnowledgeHit], is_greeting: bool = False) -> tuple[str, bool, str | None]:
    cleaned = _sanitize_user_text(text)
    if not cleaned:
        return "Could you share a little more information? I'll help you look into this.", True, "abstain"

    # Enforce action-claim safety: never claim unconfirmed actions (refunds, cancellations, deletions) were completed
    cleaned = enforce_action_claim_safety(cleaned)

    # Clean customer-facing text of any source citations, AI jargon, or escalation prompts
    cleaned = clean_customer_facing_text(cleaned)

    # Prevent empty or unhelpful fallback when not a greeting
    if not is_greeting and not knowledge_hits and not re.search(r"(clarify|more detail|share|assist|help|look into)", cleaned.lower()):
        cleaned = "Could you share a little more information about your request? I'll help you look into this."
        return cleaned, True, "abstain"

    # Do not claim resolution
    cleaned = re.sub(r"\b(issue|problem|request) (is|has been) (resolved|fixed|completed)\b", "I can help with this", cleaned, flags=re.I)
    cleaned = re.sub(r"\bI (have|already) (resolved|fixed|completed)\b", "I can assist with", cleaned, flags=re.I)

    # Note: Source references are preserved internally in result.sources (ai_metadata)
    # and are not appended to customer-facing messages.

    max_len = max(200, int(runtime.max_response_length or 1200))
    if len(cleaned) > max_len:
        cleaned = cleaned[: max_len - 20].rstrip() + "…"
    return cleaned, False, None


async def process_ai_turn(
    db: Session,
    conversation: Conversation,
    messages: list[Message],
    customer: User,
    *,
    runtime: RuntimeAIConfig | None = None,
    explicit_handoff: bool = False,
) -> AIProcessingResult:
    started = time.perf_counter()
    runtime = runtime or to_runtime_config(get_or_create_ai_config(db))
    public_messages = [m for m in messages if not getattr(m, "is_internal", False)]
    last_customer = ""
    for m in reversed(public_messages):
        if m.sender_type == MessageSenderType.CUSTOMER:
            last_customer = _sanitize_user_text(m.content)
            break
    if not last_customer:
        last_customer = _sanitize_user_text(public_messages[-1].content) if public_messages else ""

    # disabled -> escalate to human queue safely
    if not runtime.ai_enabled:
        reason = "AI is disabled by administrator"
        summary = build_handoff_summary(conversation, public_messages, reason, [])
        answer = get_natural_escalation_message(db)
        latency = int((time.perf_counter() - started) * 1000)
        return AIProcessingResult(answer, True, reason, "disabled", 0.0, [], {}, runtime.provider, runtime.model, latency, summary)

    # explicit handoff
    if explicit_handoff or detect_explicit_human_request(last_customer):
        reason = "Customer requested human assistance"
        summary = build_handoff_summary(conversation, public_messages, reason, [])
        answer = get_natural_escalation_message(db)
        latency = int((time.perf_counter() - started) * 1000)
        record_ai_usage(
            db,
            conversation_id=conversation.id if conversation else None,
            message_id=None,
            provider=runtime.provider,
            model=runtime.model,
            prompt_tokens=estimate_tokens(last_customer),
            completion_tokens=estimate_tokens(answer),
            total_tokens=estimate_tokens(last_customer) + estimate_tokens(answer),
            estimated_cost_usd=0.0,
            latency_ms=latency,
            success=True,
            error_message=None,
            decision="handoff_requested",
        )
        return AIProcessingResult(answer, True, reason, "handoff_requested", 1.0, [], {}, runtime.provider, runtime.model, latency, summary)

    # prompt injection / abuse -> do not comply, continue safely or escalate
    if detect_prompt_injection(last_customer):
        reason = "Potential prompt-injection or unsafe instruction detected"
        summary = build_handoff_summary(conversation, public_messages, reason, [])
        answer = get_natural_escalation_message(db)
        # escalate if combined with sensitive/complex intent
        sensitive, sreason = detect_sensitive_or_restricted(last_customer, runtime.escalation_rules)
        if sensitive:
            reason = sreason or reason
        latency = int((time.perf_counter() - started) * 1000)
        dec = "escalate" if sensitive else "clarify"
        record_ai_usage(
            db,
            conversation_id=conversation.id if conversation else None,
            message_id=None,
            provider=runtime.provider,
            model=runtime.model,
            prompt_tokens=estimate_tokens(last_customer),
            completion_tokens=estimate_tokens(answer),
            total_tokens=estimate_tokens(last_customer) + estimate_tokens(answer),
            estimated_cost_usd=0.0,
            latency_ms=latency,
            success=True,
            error_message=None,
            decision=dec,
        )
        return AIProcessingResult(answer, sensitive, reason if sensitive else None, dec, 0.2, [], {}, runtime.provider, runtime.model, latency, summary if sensitive else None)

    sensitive, sreason = detect_sensitive_or_restricted(last_customer, runtime.escalation_rules)
    if sensitive:
        reason = sreason or "Sensitive request requires human assistance"
        summary = build_handoff_summary(conversation, public_messages, reason, [])
        answer = get_natural_escalation_message(db)
        latency = int((time.perf_counter() - started) * 1000)
        record_ai_usage(
            db,
            conversation_id=conversation.id if conversation else None,
            message_id=None,
            provider=runtime.provider,
            model=runtime.model,
            prompt_tokens=estimate_tokens(last_customer),
            completion_tokens=estimate_tokens(answer),
            total_tokens=estimate_tokens(last_customer) + estimate_tokens(answer),
            estimated_cost_usd=0.0,
            latency_ms=latency,
            success=True,
            error_message=None,
            decision="escalate",
        )
        return AIProcessingResult(answer, True, reason, "escalate", 1.0, [], {}, runtime.provider, runtime.model, latency, summary)

    knowledge_hits = retrieve_knowledge_hits(db, last_customer, limit=5, sources=runtime.knowledge_sources)
    sources = [h.to_ref() for h in knowledge_hits]
    max_turns = int((runtime.escalation_rules or {}).get("max_ai_turns", 6) or 6)
    customer_turns = sum(1 for m in public_messages if m.sender_type == MessageSenderType.CUSTOMER)

    system, history = _build_provider_messages(runtime, conversation, public_messages, customer, knowledge_hits)
    provider_used = runtime.provider
    model_used = runtime.model
    usage: dict[str, Any] = {}
    error: str | None = None
    text = ""

    try:
        text, usage, provider_used = await asyncio.wait_for(
            generate_with_provider(runtime, system, history, knowledge_hits, last_customer),
            timeout=35.0,
        )
        model_used = runtime.model if provider_used != "demo" else "demo"
    except Exception as e:
        logger.exception("AI provider call failed")
        error = str(e)
        if (runtime.provider or "demo").lower() == "demo":
            # safe fallback: try demo if configured provider was demo
            try:
                runtime_demo = RuntimeAIConfig(**{**runtime.__dict__, "provider": "demo", "model": "demo"})
                text, usage, provider_used = await _call_demo(runtime_demo, system, history, knowledge_hits, last_customer)
                model_used = "demo-fallback"
            except Exception:
                text = get_natural_escalation_message(db)
                usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
                provider_used = "demo"
                model_used = "demo"
        else:
            # REAL PROVIDER FAILED OR NOT CONFIGURED:
            # Log technical error details for administrator telemetry & audit
            logger.error("AI provider '%s' failed: %s", runtime.provider, error)
            text = get_natural_escalation_message(db)
            usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
            provider_used = runtime.provider
            model_used = runtime.model

    # compute confidence heuristic
    top_score = knowledge_hits[0].score if knowledge_hits else 0.0
    confidence = 0.2
    if knowledge_hits:
        confidence = min(0.95, 0.45 + min(top_score, 8.0) / 12.0)
    if detect_complexity(last_customer) and top_score < 4.0:
        confidence -= 0.15
    confidence = max(0.0, min(1.0, confidence))

    is_greeting = detect_greeting(last_customer)
    validated, forced_abstain, abstain_decision = _validate_output(text, runtime, knowledge_hits, is_greeting=is_greeting)
    decision = "answered"
    should_escalate = False
    reason = None

    if error and provider_used != "demo":
        should_escalate = True
        decision = "escalate"
        reason = f"AI provider '{runtime.provider}' error: {error}"
        validated = text
    elif error and "having trouble responding" in validated.lower():
        should_escalate = True
        decision = "escalate"
        reason = f"AI provider error: {error}"
    elif is_greeting:
        decision = "answered"
        should_escalate = False
    elif forced_abstain:
        decision = abstain_decision or "abstain"
        if customer_turns >= 2 and runtime.escalation_rules.get("escalate_on_uncertain", True) and confidence < runtime.confidence_threshold:
            should_escalate = True
            reason = "Insufficient verified knowledge or confidence to answer"
            decision = "escalate"
        else:
            should_escalate = False
            decision = "clarify"
    elif knowledge_hits and confidence >= runtime.confidence_threshold:
        decision = "answered"
        should_escalate = False
    elif not knowledge_hits:
        if customer_turns < 2:
            decision = "clarify"
            should_escalate = False
        elif runtime.escalation_rules.get("escalate_on_uncertain", True):
            should_escalate = True
            reason = "No relevant verified knowledge found"
            decision = "escalate"
        else:
            decision = "clarify"
            should_escalate = False
    else:
        decision = "clarify"
        if customer_turns >= max_turns:
            should_escalate = True
            reason = "Conversation exceeded maximum AI turns without confident resolution"
            decision = "escalate"
        else:
            should_escalate = False

    # turn limit safeguard
    if not should_escalate and customer_turns >= max_turns and decision in ("clarify", "abstain"):
        should_escalate = True
        reason = "Conversation exceeded maximum AI turns without confident resolution"
        decision = "escalate"

    context_summary = build_handoff_summary(conversation, public_messages, reason, sources) if should_escalate else None
    latency = int((time.perf_counter() - started) * 1000)

    prompt_tokens = int(usage.get("prompt_tokens") or 0)
    completion_tokens = int(usage.get("completion_tokens") or 0)
    total_tokens = int(usage.get("total_tokens") or (prompt_tokens + completion_tokens))
    cost = estimate_cost(provider_used, model_used, prompt_tokens, completion_tokens)

    if should_escalate and decision == "escalate" and not knowledge_hits:
        custom_fallback = (runtime.escalation_rules or {}).get("fallback_response")
        if custom_fallback and custom_fallback.strip():
            validated = custom_fallback.strip()

    # Record AI usage log
    record_ai_usage(
        db,
        conversation_id=conversation.id if conversation else None,
        message_id=None,
        provider=provider_used,
        model=model_used,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        estimated_cost_usd=cost,
        latency_ms=latency,
        success=(error is None),
        error_message=error,
        decision=decision,
    )

    return AIProcessingResult(
        answer=validated,
        should_escalate=should_escalate,
        escalation_reason=reason,
        decision=decision,
        confidence=confidence,
        sources=sources,
        usage={
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "estimated_cost_usd": cost,
            "provider": provider_used,
            "model": model_used,
        },
        provider=provider_used,
        model=model_used,
        latency_ms=latency,
        context_summary=context_summary,
        error=error,
    )


# compatibility wrapper
class AIProvider:
    async def generate_response(self, conversation: Conversation, messages: list[Message], customer: User, knowledge_context: str = "") -> tuple[str, bool, Optional[str]]:
        db = SessionLocal()
        try:
            runtime = to_runtime_config(get_or_create_ai_config(db))
            result = await process_ai_turn(db, conversation, messages, customer, runtime=runtime)
            db.commit()
            return result.answer, result.should_escalate, result.escalation_reason
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()


# expose names used by existing code
DemoAIProvider = AIProvider
GeminiAIProvider = AIProvider
OpenAIProvider = AIProvider
AnthropicProvider = AIProvider


def get_ai_provider() -> AIProvider:
    return AIProvider()


def get_runtime_ai_config(db: Session) -> RuntimeAIConfig:
    return to_runtime_config(get_or_create_ai_config(db))