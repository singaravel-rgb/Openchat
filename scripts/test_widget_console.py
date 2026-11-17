import asyncio
from playwright.async_api import async_playwright

async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: console_errors.append(str(err)))

        # Login
        await page.goto("http://localhost:3000/login")
        await page.fill("input[type='email']", "admin@demo.com")
        await page.fill("input[type='password']", "demo1234")
        await page.click("button[type='submit']")
        await page.wait_for_url("**/admin**", timeout=5000)

        # Visit widget settings
        await page.goto("http://localhost:3000/admin/settings/widget")
        await page.wait_for_timeout(2000)

        print("Console errors on widget page:")
        for err in console_errors:
            print("  ", err)

        if not any("value prop on input should not be null" in err for err in console_errors):
            print("SUCCESS: Zero null value input warnings!")
        else:
            print("FAILED: Warning still present!")

        await browser.close()

asyncio.run(test())
