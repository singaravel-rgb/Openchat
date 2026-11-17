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
        print('Logged in, current URL:', page.url)
        
        # Check sidebar items
        kb = page.locator('aside nav >> text=Knowledge Base').first
        print('Knowledge base visible:', await kb.is_visible())
        
        # Click Knowledge Base
        await kb.click()
        await page.wait_for_timeout(1000)
        
        articles = page.locator('aside nav >> text=Articles')
        print('Articles visible after click:', await articles.is_visible())
        print('Current URL after click:', page.url)
        
        # Click Workspace
        ws = page.locator('aside nav >> text=Workspace').first
        await ws.click()
        await page.wait_for_timeout(1000)
        agents = page.locator('aside nav >> text=Agents')
        print('Agents visible after click:', await agents.is_visible())
        
        await browser.close()

asyncio.run(test())
