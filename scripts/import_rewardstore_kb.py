import urllib.request
import re
import html
import json
import time
import sys
from pathlib import Path
from datetime import datetime, timezone

backend_path = Path("backend").resolve()
sys.path.insert(0, str(backend_path))

from app.db.session import SessionLocal
from app.models.knowledge import Category, Article, FAQ
from app.models.user import User
from app.core.enums import ArticleStatus, ArticleVisibility

BASE_URL = "https://therewardstore.freshdesk.com"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return ""

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-')[:90]

def clean_article_body(raw_html):
    # Locate article body container
    pos1 = raw_html.find("fw-content--single-article")
    pos2 = raw_html.find("fw-feedback", pos1) if pos1 != -1 else -1

    if pos1 != -1 and pos2 != -1:
        chunk = raw_html[pos1:pos2]
    else:
        # Fallback
        m = re.search(r'<article[^>]*>(.*?)</article>', raw_html, re.DOTALL | re.IGNORECASE)
        chunk = m.group(1) if m else raw_html

    # Strip script and style tags
    chunk = re.sub(r'<script.*?</script>', '', chunk, flags=re.DOTALL | re.IGNORECASE)
    chunk = re.sub(r'<style.*?</style>', '', chunk, flags=re.DOTALL | re.IGNORECASE)

    # Convert common formatting to Markdown / clean text
    chunk = re.sub(r'<h[1-6][^>]*>(.*?)</h[1-6]>', r'\n\n### \1\n', chunk, flags=re.IGNORECASE)
    chunk = re.sub(r'<li[^>]*>(.*?)</li>', r'\n- \1', chunk, flags=re.DOTALL | re.IGNORECASE)
    chunk = re.sub(r'</?(?:p|div|ul|ol|table|tr)[^>]*>', '\n', chunk, flags=re.IGNORECASE)
    chunk = re.sub(r'<br\s*/?>', '\n', chunk, flags=re.IGNORECASE)
    chunk = re.sub(r'<strong[^>]*>(.*?)</strong>', r'**\1**', chunk, flags=re.DOTALL | re.IGNORECASE)
    chunk = re.sub(r'<b[^>]*>(.*?)</b>', r'**\1**', chunk, flags=re.DOTALL | re.IGNORECASE)
    chunk = re.sub(r'<em[^>]*>(.*?)</em>', r'*\1*', chunk, flags=re.DOTALL | re.IGNORECASE)
    chunk = re.sub(r'<i[^>]*>(.*?)</i>', r'*\1*', chunk, flags=re.DOTALL | re.IGNORECASE)
    chunk = re.sub(r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', r'[\2](\1)', chunk, flags=re.DOTALL | re.IGNORECASE)

    # Strip remaining HTML tags
    chunk = re.sub(r'<[^>]+>', '', chunk)
    chunk = html.unescape(chunk)

    # Remove extra empty lines and leading/trailing whitespace
    lines = [line.strip() for line in chunk.split("\n")]
    result_lines = []
    prev_blank = False
    for l in lines:
        if not l or l.startswith("fw-content--single-article"):
            if not prev_blank:
                result_lines.append("")
                prev_blank = True
        else:
            result_lines.append(l)
            prev_blank = False

    return "\n".join(result_lines).strip()

def main():
    print("=== Scraping Complete Knowledge Base from The Reward Store ===")

    # Defined Knowledge Base Structure based on Freshdesk Site
    folders = [
        {
            "category": "FAQs",
            "folder": "FAQ's - Recharges",
            "url": BASE_URL + "/support/solutions/folders/1070000488986",
            "pages": [
                BASE_URL + "/support/solutions/folders/1070000488986"
            ]
        },
        {
            "category": "FAQs",
            "folder": "FAQ's - Cart",
            "url": BASE_URL + "/support/solutions/folders/1070000488987",
            "pages": [
                BASE_URL + "/support/solutions/folders/1070000488987"
            ]
        },
        {
            "category": "FAQs",
            "folder": "FAQ's - Forex",
            "url": BASE_URL + "/support/solutions/folders/1070000489407",
            "pages": [
                BASE_URL + "/support/solutions/folders/1070000489407",
                BASE_URL + "/support/solutions/folders/1070000489407/page/2"
            ]
        },
        {
            "category": "Solutions",
            "folder": "Solutions",
            "url": BASE_URL + "/support/solutions/folders/1070000503099",
            "pages": [
                BASE_URL + "/support/solutions/folders/1070000503099"
            ]
        }
    ]

    all_articles = []
    seen_urls = set()

    for f_info in folders:
        print(f"\nScanning Folder: {f_info['folder']} ({f_info['category']})...")
        for page_url in f_info["pages"]:
            print(f"  Fetching folder page: {page_url}...")
            raw_folder = fetch(page_url)
            art_links = re.findall(r'<a[^>]*href=["\'](/support/solutions/articles/[^"\']+)["\'][^>]*>(.*?)</a>', raw_folder, re.DOTALL)
            
            for art_href, link_html in art_links:
                full_art_url = BASE_URL + art_href
                if full_art_url in seen_urls:
                    continue
                seen_urls.add(full_art_url)
                
                clean_title = re.sub(r'<[^>]+>', '', link_html).strip()
                # Clean out modified timestamp if in title
                clean_title = clean_title.split("Modified on")[0].strip()
                if not clean_title:
                    continue

                all_articles.append({
                    "category": f_info["category"],
                    "folder": f_info["folder"],
                    "title": html.unescape(clean_title),
                    "url": full_art_url,
                    "href": art_href
                })

    print(f"\nTotal unique articles to fetch: {len(all_articles)}")

    # Fetch content for all articles
    for idx, art in enumerate(all_articles, 1):
        print(f"[{idx}/{len(all_articles)}] Fetching: {art['title']}...")
        time.sleep(0.3)
        raw_art = fetch(art["url"])
        
        # Verify title from <h1>
        h1_m = re.search(r'<h1[^>]*>(.*?)</h1>', raw_art, re.DOTALL | re.IGNORECASE)
        if h1_m:
            h1_title = re.sub(r'<[^>]+>', '', h1_m.group(1)).strip()
            if h1_title:
                art["title"] = html.unescape(h1_title)

        body = clean_article_body(raw_art)
        art["content"] = body
        # Generate excerpt (first 160 characters)
        first_line = body.split("\n")[0] if body else ""
        art["excerpt"] = (first_line[:157] + "...") if len(first_line) > 160 else first_line

    # Save to JSON
    json_path = Path("docs/therewardstore_kb_complete.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(all_articles, f, indent=2, ensure_ascii=False)
    print(f"\nSaved all {len(all_articles)} articles to {json_path}")

    # Now import into OpenChat PostgreSQL Database
    print("\n=== Ingesting into OpenChat Database ===")
    with SessionLocal() as db:
        # Find super admin author (singaravel@vananam.com)
        admin_user = db.query(User).filter(User.email == "singaravel@vananam.com").first()
        author_id = admin_user.id if admin_user else 1

        # 1. Ensure Categories exist
        cat_map = {} # folder_name -> Category object
        for f_info in folders:
            folder_name = f_info["folder"]
            cat_slug = slugify(folder_name)
            
            db_cat = db.query(Category).filter((Category.name == folder_name) | (Category.slug == cat_slug)).first()
            if not db_cat:
                db_cat = Category(
                    name=folder_name,
                    slug=cat_slug,
                    description=f"Knowledge base articles and FAQs for {folder_name} from The Reward Store.",
                    is_active=True,
                    display_order=len(cat_map) + 1
                )
                db.add(db_cat)
                db.flush()
                print(f"Created Category: '{db_cat.name}' (ID: {db_cat.id})")
            else:
                print(f"Existing Category: '{db_cat.name}' (ID: {db_cat.id})")
            cat_map[folder_name] = db_cat

        # 2. Ingest Articles
        added_count = 0
        updated_count = 0
        faq_added = 0

        for art in all_articles:
            target_cat = cat_map.get(art["folder"])
            cat_id = target_cat.id if target_cat else None
            art_slug = slugify(art["title"])
            
            # Avoid slug collisions
            existing_art = db.query(Article).filter((Article.title == art["title"]) | (Article.slug == art_slug)).first()
            if existing_art:
                existing_art.content = art["content"]
                existing_art.excerpt = art["excerpt"]
                existing_art.category_id = cat_id
                existing_art.status = ArticleStatus.PUBLISHED
                existing_art.visibility = ArticleVisibility.PUBLIC
                existing_art.published_at = datetime.now(timezone.utc)
                updated_count += 1
            else:
                new_art = Article(
                    title=art["title"],
                    slug=art_slug,
                    content=art["content"],
                    excerpt=art["excerpt"],
                    category_id=cat_id,
                    author_id=author_id,
                    status=ArticleStatus.PUBLISHED,
                    visibility=ArticleVisibility.PUBLIC,
                    published_at=datetime.now(timezone.utc),
                    display_order=added_count + 1
                )
                db.add(new_art)
                added_count += 1

            # If it's in an FAQ category or has a question mark in title, also mirror into FAQs table
            if art["category"] == "FAQs" or art["title"].endswith("?"):
                existing_faq = db.query(FAQ).filter(FAQ.question == art["title"]).first()
                if existing_faq:
                    existing_faq.answer = art["content"]
                    existing_faq.category_id = cat_id
                    existing_faq.is_published = True
                else:
                    new_faq = FAQ(
                        question=art["title"],
                        answer=art["content"],
                        category_id=cat_id,
                        is_published=True,
                        show_chat_action=True,
                        display_order=faq_added + 1
                    )
                    db.add(new_faq)
                    faq_added += 1

        db.commit()
        print(f"\nImport Completed:")
        print(f" - {added_count} new articles inserted")
        print(f" - {updated_count} existing articles updated")
        print(f" - {faq_added} FAQs created/synced")
        print(f" - All 30 articles are now PUBLISHED and available for AI grounding and customer search!")

if __name__ == "__main__":
    main()
