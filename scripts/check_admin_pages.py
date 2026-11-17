import asyncio
from playwright.async_api import async_playwright

routes = [
    '/admin',
    '/admin/conversations',
    '/admin/agents',
    '/admin/teams',
    '/admin/categories',
    '/admin/articles',
    '/admin/faqs',
    '/admin/reports',
    '/admin/sla',
    '/admin/settings',
    '/admin/settings/ai',
    '/admin/settings/widget',
    '/admin/settings/rules',
    '/admin/settings/notifications',
    '/admin/canned-responses',
    '/admin/custom-fields',
    '/admin/business-hours',
    '/admin/webhooks'
]

async def check_routes():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        errors = []
        page.on('pageerror', lambda err: errors.append(f'PAGEERROR on {page.url}: {err}'))
        
        # Login
        await page.goto('http://localhost:3000/login')
        await page.fill('input[type="email"]', 'admin@demo.com')
        await page.fill('input[type="password"]', 'demo1234')
        await page.click('button[type="submit"]')
        await page.wait_for_url('**/admin**', timeout=5000)
        
        results = {}
        for r in routes:
            url = f'http://localhost:3000{r}'
            await page.goto(url)
            await page.wait_for_load_state('networkidle')
            title = await page.title()
            body_text = await page.inner_text('body')
            # Check if has content
            has_content = len(body_text.strip()) > 50
            results[r] = 'OK' if has_content else 'EMPTY'
            print(f'{r}: {results[r]} (text len: {len(body_text.strip())})')
            
        print('Total JS page errors:', len(errors))
        for e in errors:
            print('  ', e)
            
        await browser.close()

asyncio.run(check_routes())

