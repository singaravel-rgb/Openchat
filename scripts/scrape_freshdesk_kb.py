import urllib.request
import re
import html
import json
import time
from html.parser import HTMLParser

BASE_URL = "https://therewardstore.freshdesk.com"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def fetch_url(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return ""

class CleanTextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text_parts = []
        self.skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ["script", "style", "nav", "footer", "header"]:
            self.skip = True
        elif tag in ["p", "br", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr"]:
            self.text_parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ["script", "style", "nav", "footer", "header"]:
            self.skip = False
        elif tag in ["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr"]:
            self.text_parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.text_parts.append(data)

    def get_text(self):
        full = "".join(self.text_parts)
        # Normalize whitespace
        lines = [line.strip() for line in full.split("\n")]
        return "\n".join(l for l in lines if l)

def extract_article_content(article_html):
    # Freshdesk articles are typically inside <div class="article-body"> or <section class="article-content">
    # Let's inspect article containers
    match = re.search(r'<article[^>]*>(.*?)</article>', article_html, re.DOTALL | re.IGNORECASE)
    if not match:
        match = re.search(r'<div[^>]*class=\"[^\"]*(?:article-body|article-content|solution-article|article__body)[^\"]*\"[^>]*>(.*?)</div>\s*<(?:div|footer|aside|section)', article_html, re.DOTALL | re.IGNORECASE)
    
    if match:
        raw_snippet = match.group(1)
    else:
        # Fallback: look for <div class="article-body" or similar
        m2 = re.search(r'(<div[^>]*class=\"[^\"]*article[^\"]*\"[^>]*>.*?)(?:<footer|<aside|<div class=\"article-vote|\Z)', article_html, re.DOTALL | re.IGNORECASE)
        raw_snippet = m2.group(1) if m2 else article_html

    parser = CleanTextParser()
    parser.feed(raw_snippet)
    return parser.get_text()

def main():
    print(f"Scraping Freshdesk Solutions from {BASE_URL}...")
    home_html = fetch_url(BASE_URL + "/support/solutions")
    
    # 1. Discover all Categories and Folders
    # Links like /support/solutions/107000... or /support/solutions/folders/107000...
    folder_matches = re.findall(r'href=[\"\'](/support/solutions/folders/\d+)[\"\'][^>]*>(.*?)</a>', home_html, re.DOTALL)
    cat_matches = re.findall(r'href=[\"\'](/support/solutions/\d+)[\"\'][^>]*>(.*?)</a>', home_html, re.DOTALL)

    folders_to_visit = {}
    for href, title in folder_matches:
        clean_title = re.sub(r'<[^>]+>', '', title).strip()
        folders_to_visit[href] = clean_title

    categories_to_visit = {}
    for href, title in cat_matches:
        clean_title = re.sub(r'<[^>]+>', '', title).strip()
        categories_to_visit[href] = clean_title

    print(f"Found {len(categories_to_visit)} category links: {categories_to_visit}")
    print(f"Found {len(folders_to_visit)} initial folder links: {folders_to_visit}")

    # Explore categories to find any additional folders
    for cat_href, cat_name in categories_to_visit.items():
        time.sleep(0.5)
        cat_html = fetch_url(BASE_URL + cat_href)
        cat_folders = re.findall(r'href=[\"\'](/support/solutions/folders/\d+)[\"\'][^>]*>(.*?)</a>', cat_html, re.DOTALL)
        for href, title in cat_folders:
            clean_title = re.sub(r'<[^>]+>', '', title).strip()
            folders_to_visit[href] = clean_title

    print(f"Total folders to scrape: {len(folders_to_visit)}")

    # 2. In each folder, extract all article links
    articles_to_scrape = {} # href -> {"folder": folder_name, "title": article_title}
    for folder_href, folder_name in folders_to_visit.items():
        print(f"Checking folder: {folder_name} ({folder_href})...")
        time.sleep(0.5)
        f_html = fetch_url(BASE_URL + folder_href)
        # Check pagination or article links
        art_matches = re.findall(r'href=[\"\'](/support/solutions/articles/[^\"\'?]+)[\"\'][^>]*>(.*?)</a>', f_html, re.DOTALL)
        for href, title in art_matches:
            clean_title = re.sub(r'<[^>]+>', '', title).strip()
            if href not in articles_to_scrape:
                articles_to_scrape[href] = {
                    "folder": folder_name,
                    "title": clean_title,
                    "url": BASE_URL + href
                }

    print(f"Found {len(articles_to_scrape)} unique articles across all folders!")

    # 3. For each article, scrape full content
    scraped_articles = []
    for i, (art_href, meta) in enumerate(articles_to_scrape.items(), 1):
        print(f"[{i}/{len(articles_to_scrape)}] Scraping article: {meta['title']}...")
        time.sleep(0.5)
        art_html = fetch_url(BASE_URL + art_href)
        
        # Extract title from <h1> if available
        h1_m = re.search(r'<h1[^>]*>(.*?)</h1>', art_html, re.DOTALL | re.IGNORECASE)
        if h1_m:
            meta_title = re.sub(r'<[^>]+>', '', h1_m.group(1)).strip()
            if meta_title:
                meta['title'] = html.unescape(meta_title)

        content = extract_article_content(art_html)
        meta['content'] = content
        scraped_articles.append(meta)

    # Save to JSON
    with open("docs/therewardstore_kb_scraped.json", "w", encoding="utf-8") as f:
        json.dump(scraped_articles, f, indent=2, ensure_ascii=False)

    print(f"\nSuccessfully scraped {len(scraped_articles)} articles! Saved to docs/therewardstore_kb_scraped.json")

if __name__ == "__main__":
    main()
