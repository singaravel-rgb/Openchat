from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ArticleStatus, ArticleVisibility
from app.db.base import Base
from app.models.user import User


class Category(Base):
    __tablename__ = "categories"

    __table_args__ = (
        Index("ix_categories_parent_id", "parent_id"),
        Index("ix_categories_order", "display_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true", nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    parent = relationship(
        "Category",
        remote_side=[id],
        back_populates="children",
    )

    children = relationship(
        "Category",
        back_populates="parent",
        cascade="all, delete-orphan",
    )

    articles = relationship(
        "Article",
        back_populates="category",
        cascade="all, delete-orphan",
    )

    faqs = relationship(
        "FAQ",
        back_populates="category",
        cascade="all, delete-orphan",
    )


class Article(Base):
    __tablename__ = "articles"

    __table_args__ = (
        Index("ix_articles_category_id", "category_id"),
        Index("ix_articles_status", "status"),
        Index("ix_articles_slug", "slug"),
        Index("ix_articles_published_at", "published_at"),
        Index("ix_articles_display_order", "display_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)

    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default=ArticleStatus.DRAFT,
        server_default=ArticleStatus.DRAFT,
        nullable=False,
    )

    visibility: Mapped[str] = mapped_column(
        String(20),
        default=ArticleVisibility.PUBLIC,
        server_default=ArticleVisibility.PUBLIC,
        nullable=False,
    )

    view_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    helpful_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    not_helpful_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    category = relationship("Category", back_populates="articles")
    author = relationship("User", foreign_keys=[author_id])


class FAQ(Base):
    __tablename__ = "faqs"

    __table_args__ = (
        Index("ix_faqs_category_id", "category_id"),
        Index("ix_faqs_is_published", "is_published"),
        Index("ix_faqs_display_order", "display_order"),
        Index("ix_faqs_show_chat_action", "show_chat_action"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    question: Mapped[str] = mapped_column(String(500), nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)

    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    is_published: Mapped[bool] = mapped_column(default=False, server_default="false", nullable=False)
    show_chat_action: Mapped[bool] = mapped_column(default=True, server_default="true", nullable=False)
    chat_action_text: Mapped[str | None] = mapped_column(String(100), nullable=True)

    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    view_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    helpful_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    not_helpful_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    category = relationship("Category", back_populates="faqs")