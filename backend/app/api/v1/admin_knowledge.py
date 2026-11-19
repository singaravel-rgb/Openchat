from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.knowledge import Article, Category, FAQ
from app.models.user import User
from app.schemas.knowledge import (
    ArticleCreate,
    ArticleListItem,
    ArticleResponse,
    ArticleUpdate,
    CategoryCreate,
    CategoryResponse,
    CategoryTree,
    CategoryUpdate,
    FAQCreate,
    FAQListItem,
    FAQResponse,
    FAQUpdate,
)

router = APIRouter(prefix="/admin/knowledge", tags=["Admin Knowledge Base"])


def require_admin(current_user: User = Depends(require_roles("admin", "super_admin"))) -> User:
    return current_user


@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    data: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    existing = db.query(Category).filter(Category.slug == data.slug).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category slug already exists")

    category = Category(**data.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/categories", response_model=list[CategoryTree])
def list_categories(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    query = db.query(Category)
    if not include_inactive:
        query = query.filter(Category.is_active == True)
    categories = query.order_by(Category.display_order, Category.name).all()

    cat_map = {c.id: CategoryTree.model_validate(c, from_attributes=True) for c in categories}
    roots = []
    for cat in categories:
        tree_cat = cat_map[cat.id]
        if cat.parent_id and cat.parent_id in cat_map:
            parent = cat_map[cat.parent_id]
            parent.children.append(tree_cat)
        else:
            roots.append(tree_cat)
    return roots


@router.get("/categories/{category_id}", response_model=CategoryResponse)
def get_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


@router.patch("/categories/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    data: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "slug" and value:
            existing = db.query(Category).filter(Category.slug == value, Category.id != category_id).first()
            if existing:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category slug already exists")
        setattr(category, field, value)

    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    db.delete(category)
    db.commit()


@router.post("/articles", response_model=ArticleResponse, status_code=status.HTTP_201_CREATED)
def create_article(
    data: ArticleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    existing = db.query(Article).filter(Article.slug == data.slug).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Article slug already exists")

    article_data = data.model_dump()
    if article_data.get("status") == "published" and not article_data.get("published_at"):
        article_data["published_at"] = datetime.utcnow()

    article = Article(**article_data, author_id=current_user.id)
    db.add(article)
    db.commit()
    db.refresh(article)
    return article


@router.get("/articles", response_model=list[ArticleListItem])
def list_articles(
    status_filter: Optional[str] = Query(None, alias="status"),
    category_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    query = db.query(Article)
    if status_filter:
        query = query.filter(Article.status == status_filter)
    if category_id:
        query = query.filter(Article.category_id == category_id)
    if q:
        query = query.filter(or_(Article.title.ilike(f"%{q}%"), Article.content.ilike(f"%{q}%")))
    query = query.order_by(Article.updated_at.desc()).limit(limit).offset(offset)
    return query.all()


@router.get("/articles/{article_id}", response_model=ArticleResponse)
def get_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    return article


@router.patch("/articles/{article_id}", response_model=ArticleResponse)
def update_article(
    article_id: int,
    data: ArticleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")

    update_data = data.model_dump(exclude_unset=True)
    if "slug" in update_data and update_data["slug"]:
        existing = db.query(Article).filter(Article.slug == update_data["slug"], Article.id != article_id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Article slug already exists")

    if "status" in update_data and update_data["status"] == "published" and not article.published_at:
        update_data["published_at"] = datetime.utcnow()

    for field, value in update_data.items():
        setattr(article, field, value)

    db.commit()
    db.refresh(article)
    return article


@router.delete("/articles/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    db.delete(article)
    db.commit()


@router.post("/faqs", response_model=FAQResponse, status_code=status.HTTP_201_CREATED)
def create_faq(
    data: FAQCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    faq = FAQ(**data.model_dump())
    db.add(faq)
    db.commit()
    db.refresh(faq)
    return faq


@router.get("/faqs", response_model=list[FAQListItem])
def list_faqs(
    category_id: Optional[int] = Query(None),
    published_only: bool = Query(False),
    q: Optional[str] = Query(None),
    limit: int = Query(100, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    query = db.query(FAQ)
    if category_id:
        query = query.filter(FAQ.category_id == category_id)
    if published_only:
        query = query.filter(FAQ.is_published == True)
    if q:
        query = query.filter(or_(FAQ.question.ilike(f"%{q}%"), FAQ.answer.ilike(f"%{q}%")))
    query = query.order_by(FAQ.display_order, FAQ.id).limit(limit).offset(offset)
    return query.all()


@router.get("/faqs/{faq_id}", response_model=FAQResponse)
def get_faq(
    faq_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    faq = db.query(FAQ).filter(FAQ.id == faq_id).first()
    if not faq:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")
    return faq


@router.patch("/faqs/{faq_id}", response_model=FAQResponse)
def update_faq(
    faq_id: int,
    data: FAQUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    faq = db.query(FAQ).filter(FAQ.id == faq_id).first()
    if not faq:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(faq, field, value)

    db.commit()
    db.refresh(faq)
    return faq


@router.delete("/faqs/{faq_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_faq(
    faq_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    faq = db.query(FAQ).filter(FAQ.id == faq_id).first()
    if not faq:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")
    db.delete(faq)
    db.commit()


@router.post("/faqs/reorder", status_code=status.HTTP_200_OK)
def reorder_faqs(
    faq_ids: list[int],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    for idx, faq_id in enumerate(faq_ids):
        faq = db.query(FAQ).filter(FAQ.id == faq_id).first()
        if faq:
            faq.display_order = idx
    db.commit()
    return {"message": "FAQs reordered successfully"}


@router.post("/categories/reorder", status_code=status.HTTP_200_OK)
def reorder_categories(
    category_ids: list[int],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    for idx, cat_id in enumerate(category_ids):
        cat = db.query(Category).filter(Category.id == cat_id).first()
        if cat:
            cat.display_order = idx
    db.commit()
    return {"message": "Categories reordered successfully"}


@router.post("/articles/reorder", status_code=status.HTTP_200_OK)
def reorder_articles(
    article_ids: list[int],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    for idx, art_id in enumerate(article_ids):
        art = db.query(Article).filter(Article.id == art_id).first()
        if art:
            art.display_order = idx
    db.commit()
    return {"message": "Articles reordered successfully"}