import asyncio
from playwright.async_api import async_playwright

async def test_ui_logins():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        # 1. Test Admin Login
        page = await browser.new_page()
        await page.goto("http://localhost:3000/login")
        await page.fill("input[type='email']", "admin@demo.com")
        await page.fill("input[type='password']", "demo1234")
        await page.click("button[type='submit']")
        await page.wait_for_url("**/admin**", timeout=8000)
        print("UI Admin Login: SUCCESS ->", page.url)
        await page.close()
        
        # 2. Test Agent Login
        page2 = await browser.new_page()
        await page2.goto("http://localhost:3000/login")
        await page2.fill("input[type='email']", "agent@demo.com")
        await page2.fill("input[type='password']", "demo1234")
        await page2.click("button[type='submit']")
        await page2.wait_for_url("**/agent**", timeout=8000)
        print("UI Agent Login: SUCCESS ->", page2.url)
        await page2.close()
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(test_ui_logins())

