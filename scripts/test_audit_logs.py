import asyncio
from playwright.async_api import async_playwright

async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        # Login
        await page.goto('http://localhost:3000/login')
        await page.fill('input[type="email"]', 'admin@demo.com')
        await page.fill('input[type="password"]', 'demo1234')
        await page.click('button[type="submit"]')
        await page.wait_for_url('**/admin**', timeout=5000)
        
        # Visit audit logs
        await page.goto('http://localhost:3000/admin/audit-logs')
        await page.wait_for_timeout(1500)
        
        text = await page.inner_text('body')
        print('Audit Logs page loaded, text length:', len(text))
        print('Has Activity Trail:', 'Activity Trail' in text)
        if 'Activity Trail' in text:
            print('Sample rows:', text.split('Activity Trail')[1][:200].replace('\n', ' '))
        
        await browser.close()

asyncio.run(test())
