from enum import StrEnum


class ConversationStatus(StrEnum):
    OPEN = "open"
    PENDING = "pending"
    RESOLVED = "resolved"
    WAITING_ON_CUSTOMER = "waiting_on_customer"
    ON_HOLD = "on_hold"
    # Legacy / alias values for backward compatibility
    ASSIGNED = "assigned"
    AI_HANDLING = "ai_handling"
    CLOSED = "closed"


class MessageSenderType(StrEnum):
    CUSTOMER = "customer"
    AGENT = "agent"
    AI = "ai"
    SYSTEM = "system"


class MessageType(StrEnum):
    TEXT = "text"
    INTERNAL_NOTE = "internal_note"
    SYSTEM_EVENT = "system_event"


class ArticleStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ArticleVisibility(StrEnum):
    PUBLIC = "public"
    AGENTS_ONLY = "agents_only"
    INTERNAL = "internal"