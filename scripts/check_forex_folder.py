import urllib.request
import re

url = "https://therewardstore.freshdesk.com/support/solutions/folders/1070000489407"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
raw = urllib.request.urlopen(req).read().decode("utf-8")

# Let's search for all article links in raw
links = re.findall(r'<a[^>]*href=["\'](/support/solutions/articles/[^"\']+)["\'][^>]*>(.*?)</a>', raw, re.DOTALL)
print("All article links found in folder HTML:")
for h, t in links:
    clean_t = re.sub(r'<[^>]+>', '', t).strip()
    if clean_t and not clean_t.startswith("Modified"):
        print(f" - {clean_t} -> {h}")

url2 = "https://therewardstore.freshdesk.com/support/solutions/folders/1070000489407/page/2"
req2 = urllib.request.Request(url2, headers={"User-Agent": "Mozilla/5.0"})
raw2 = urllib.request.urlopen(req2).read().decode("utf-8")
links2 = re.findall(r'<a[^>]*href=["\'](/support/solutions/articles/[^"\']+)["\'][^>]*>(.*?)</a>', raw2, re.DOTALL)
print("\nArticles on page 2:")
for h, t in links2:
    clean_t = re.sub(r'<[^>]+>', '', t).strip()
    if clean_t and not clean_t.startswith("Modified"):
        print(f" - {clean_t} -> {h}")

