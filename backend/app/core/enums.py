from enum import StrEnum


class ConversationStatus(StrEnum):
    AI_HANDLING = "ai_handling"
    PENDING = "pending"
    ASSIGNED = "assigned"
    RESOLVED = "resolved"
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