import urllib.request
import re
import html

url = "https://therewardstore.freshdesk.com/support/solutions/articles/1070000121395-can-i-use-the-recharge-store-as-a-guest-user-without-registering-"
headers = {"User-Agent": "Mozilla/5.0"}
req = urllib.request.Request(url, headers=headers)
raw = urllib.request.urlopen(req).read().decode("utf-8")

# Breadcrumbs
crumbs = re.findall(r'<li[^>]*class=["\']breadcrumb-item["\'][^>]*>(.*?)</li>', raw, re.DOTALL)
print("Breadcrumbs:")
for c in crumbs:
    print(" -", re.sub(r'<[^>]+>', '', c).strip())

# Article Body
pos1 = raw.find("fw-content--single-article")
pos2 = raw.find("fw-feedback", pos1)
if pos1 != -1 and pos2 != -1:
    body_html = raw[pos1:pos2]
    # Remove script tags
    body_clean = re.sub(r'<script.*?</script>', '', body_html, flags=re.DOTALL)
    # Strip HTML tags but preserve paragraph breaks
    body_clean = re.sub(r'</?(?:p|div|li|h[1-6]|br)[^>]*>', '\n', body_clean)
    body_clean = re.sub(r'<[^>]+>', '', body_clean)
    body_clean = html.unescape(body_clean)
    lines = [l.strip() for l in body_clean.split('\n') if l.strip()]
    print("\nClean Article Content:")
    print('\n'.join(lines))
