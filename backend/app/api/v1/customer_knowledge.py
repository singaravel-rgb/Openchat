from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.enums import ArticleVisibility
from app.db.session import get_db
from app.models.conversation import Conversation
from app.models.knowledge import Article, Category, FAQ
from app.models.user import User
from app.schemas.knowledge import (
    ArticleResponse,
    FAQResponse,
    FAQListItem,
    KnowledgeSearchResult,
    FAQFeedback,
    KnowledgeFeedback,
)

router = APIRouter(prefix="/customer", tags=["Customer Knowledge Base"])


def get_optional_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.get("/categories", response_model=list[dict])
def list_categories(db: Session = Depends(get_db)):
    categories = db.query(Category).filter(Category.is_active == True).order_by(Category.display_order, Category.name).all()  # noqa: E712
    return [
        {"id": c.id, "name": c.name, "slug": c.slug, "description": c.description, "parent_id": c.parent_id}
        for c in categories
    ]


@router.get("/faqs", response_model=list[FAQListItem])
def list_faqs(
    category_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(FAQ).filter(FAQ.is_published == True)  # noqa: E712
    if category_id:
        query = query.filter(FAQ.category_id == category_id)
    if q:
        query = query.filter(or_(FAQ.question.ilike(f"%{q}%"), FAQ.answer.ilike(f"%{q}%")))
    query = query.order_by(FAQ.display_order, FAQ.id).offset(offset).limit(limit)
    faqs = query.all()
    for faq in faqs:
        faq.view_count = (faq.view_count or 0) + 1
    db.commit()
    return faqs


@router.get("/faqs/{faq_id}", response_model=FAQResponse)
def get_faq(faq_id: int, db: Session = Depends(get_db)):
    faq = db.query(FAQ).filter(FAQ.id == faq_id, FAQ.is_published == True).first()  # noqa: E712
    if not faq:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")
    faq.view_count = (faq.view_count or 0) + 1
    db.commit()
    return faq


@router.post("/faqs/{faq_id}/feedback", status_code=status.HTTP_200_OK)
def faq_feedback(faq_id: int, data: FAQFeedback, db: Session = Depends(get_db)):
    faq = db.query(FAQ).filter(FAQ.id == faq_id).first()
    if not faq:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")
    if data.is_helpful:
        faq.helpful_count = (faq.helpful_count or 0) + 1
    else:
        faq.not_helpful_count = (faq.not_helpful_count or 0) + 1
    db.commit()
    return {"message": "Feedback recorded"}


@router.get("/articles", response_model=list[dict])
def list_articles(
    category_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Article).filter(
        Article.status == "published",
        Article.visibility.in_([ArticleVisibility.PUBLIC, ArticleVisibility.AGENTS_ONLY]),
    )
    if category_id:
        query = query.filter(Article.category_id == category_id)
    if q:
        query = query.filter(or_(Article.title.ilike(f"%{q}%"), Article.content.ilike(f"%{q}%")))
    query = query.order_by(Article.published_at.desc().nullslast()).offset(offset).limit(limit)
    articles = query.all()
    return [
        {
            "id": a.id,
            "title": a.title,
            "slug": a.slug,
            "excerpt": a.excerpt,
            "category_id": a.category_id,
            "view_count": a.view_count,
            "published_at": a.published_at,
        }
        for a in articles
    ]


@router.get("/articles/{article_id}", response_model=ArticleResponse)
def get_article(article_id: int, db: Session = Depends(get_db)):
    article = db.query(Article).filter(
        Article.id == article_id,
        Article.status == "published",
        Article.visibility.in_([ArticleVisibility.PUBLIC, ArticleVisibility.AGENTS_ONLY]),
    ).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    article.view_count = (article.view_count or 0) + 1
    db.commit()
    return article


@router.post("/articles/{article_id}/feedback", status_code=status.HTTP_200_OK)
def article_feedback(article_id: int, data: KnowledgeFeedback, db: Session = Depends(get_db)):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    if data.is_helpful:
        article.helpful_count = (article.helpful_count or 0) + 1
    else:
        article.not_helpful_count = (article.not_helpful_count or 0) + 1
    db.commit()
    return {"message": "Feedback recorded"}


@router.get("/search", response_model=list[KnowledgeSearchResult])
def search_knowledge(q: str = Query(..., min_length=1), limit: int = Query(20, le=50), db: Session = Depends(get_db)):
    results = []
    faqs = db.query(FAQ).filter(
        FAQ.is_published == True,  # noqa: E712
        or_(FAQ.question.ilike(f"%{q}%"), FAQ.answer.ilike(f"%{q}%")),
    ).limit(limit).all()
    for faq in faqs:
        results.append(KnowledgeSearchResult(
            type="faq", id=faq.id, title=faq.question, content=faq.answer,
            excerpt=None, category=faq.category.name if faq.category else None,
        ))
    articles = db.query(Article).filter(
        Article.status == "published",
        Article.visibility.in_([ArticleVisibility.PUBLIC, ArticleVisibility.AGENTS_ONLY]),
        or_(Article.title.ilike(f"%{q}%"), Article.content.ilike(f"%{q}%")),
    ).limit(limit).all()
    for article in articles:
        results.append(KnowledgeSearchResult(
            type="article", id=article.id, title=article.title, content=article.content,
            excerpt=article.excerpt, category=article.category.name if article.category else None,
        ))
    return results[:limit]


@router.get("/help-page", response_model=dict)
def get_help_page(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    active_conversations = db.query(Conversation).filter(
        Conversation.customer_id == current_user.id,
        Conversation.status.in_(["ai_handling", "pending", "assigned"]),
    ).order_by(Conversation.updated_at.desc()).limit(5).all()

    published_faqs = db.query(FAQ).filter(FAQ.is_published == True).order_by(FAQ.display_order, FAQ.id).limit(50).all()  # noqa: E712
    for faq in published_faqs:
        faq.view_count = (faq.view_count or 0) + 1
    db.commit()

    return {
        "active_conversations": [
            {
                "id": c.id,
                "subject": c.subject,
                "status": c.status,
                "updated_at": c.updated_at,
                "last_message": None,
            }
            for c in active_conversations
        ],
        "faqs": [
            {
                "id": f.id,
                "question": f.question,
                "answer": f.answer,
                "category": f.category.name if f.category else None,
                "show_chat_action": f.show_chat_action,
                "chat_action_text": f.chat_action_text,
            }
            for f in published_faqs
        ],
    }
