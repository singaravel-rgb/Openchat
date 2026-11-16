from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    parent_id: Optional[int] = None
    display_order: int = 0
    is_active: bool = True


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    parent_id: Optional[int] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class CategoryResponse(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class CategoryTree(CategoryResponse):
    children: list["CategoryTree"] = []


class ArticleBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1)
    excerpt: Optional[str] = None
    category_id: Optional[int] = None
    visibility: str = "public"
    display_order: int = 0


class ArticleCreate(ArticleBase):
    pass


class ArticleUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=255)
    content: Optional[str] = Field(default=None, min_length=1)
    excerpt: Optional[str] = None
    category_id: Optional[int] = None
    status: Optional[str] = None
    visibility: Optional[str] = None
    display_order: Optional[int] = None


class ArticleResponse(ArticleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author_id: int
    status: str
    visibility: str
    view_count: int
    helpful_count: int
    not_helpful_count: int
    published_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    display_order: int


class ArticleListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    slug: str
    excerpt: Optional[str]
    category_id: Optional[int]
    status: str
    visibility: str
    view_count: int
    created_at: datetime
    updated_at: datetime
    display_order: int


class FAQBase(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1)
    category_id: Optional[int] = None
    is_published: bool = False
    show_chat_action: bool = True
    chat_action_text: Optional[str] = None
    display_order: int = 0


class FAQCreate(FAQBase):
    pass


class FAQUpdate(BaseModel):
    question: Optional[str] = Field(default=None, min_length=1, max_length=500)
    answer: Optional[str] = Field(default=None, min_length=1)
    category_id: Optional[int] = None
    is_published: Optional[bool] = None
    show_chat_action: Optional[bool] = None
    chat_action_text: Optional[str] = None
    display_order: Optional[int] = None


class FAQResponse(FAQBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    view_count: int
    helpful_count: int
    not_helpful_count: int
    created_at: datetime
    updated_at: datetime


class FAQListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question: str
    answer: str
    category_id: Optional[int]
    is_published: bool
    show_chat_action: bool
    chat_action_text: Optional[str]
    display_order: int
    view_count: int
    created_at: datetime
    updated_at: datetime


class KnowledgeSearchResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    type: str
    id: int
    title: str
    content: str
    excerpt: Optional[str]
    category: Optional[str]
    score: Optional[float] = None


class KnowledgeFeedback(BaseModel):
    is_helpful: bool


class FAQFeedback(BaseModel):
    is_helpful: bool