import asyncio
from playwright.async_api import async_playwright

async def test_admin_navigation():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        
        # Login as admin
        await page.goto('http://localhost:3000/login')
        await page.fill('input[type="email"]', 'admin@demo.com')
        await page.fill('input[type="password"]', 'demo1234')
        await page.click('button[type="submit"]')
        await page.wait_for_url('**/admin**', timeout=5000)
        print('1. Logged in, at:', page.url)
        
        # Test clicking Knowledge Base
        print('2. Clicking Knowledge Base...')
        kb = page.locator('aside nav >> text=Knowledge Base').first
        await kb.click()
        await page.wait_for_timeout(1000)
        print('   Current URL:', page.url)
        assert '/admin/categories' in page.url or await page.locator('aside nav >> text=Articles').is_visible()
        print('   Categories/Articles visible! PASS')
        
        # Test clicking Articles
        print('3. Clicking Articles...')
        articles_link = page.locator('aside nav >> text=Articles').first
        await articles_link.click()
        await page.wait_for_timeout(1000)
        print('   Current URL:', page.url)
        assert '/admin/articles' in page.url
        print('   Articles page loaded! PASS')
        
        # Test clicking FAQs
        print('4. Clicking FAQs...')
        faqs_link = page.locator('aside nav >> text=FAQs').first
        await faqs_link.click()
        await page.wait_for_timeout(1000)
        print('   Current URL:', page.url)
        assert '/admin/faqs' in page.url
        print('   FAQs page loaded! PASS')
        
        # Test clicking Workspace
        print('5. Clicking Workspace...')
        ws = page.locator('aside nav >> text=Workspace').first
        await ws.click()
        await page.wait_for_timeout(1000)
        print('   Current URL:', page.url)
        assert await page.locator('aside nav >> text=Agents').is_visible()
        print('   Workspace expanded! PASS')
        
        # Test clicking Agents
        print('6. Clicking Agents...')
        agents_link = page.locator('aside nav >> text=Agents').first
        await agents_link.click()
        await page.wait_for_timeout(1000)
        print('   Current URL:', page.url)
        assert '/admin/agents' in page.url
        print('   Agents page loaded! PASS')
        
        # Test clicking Teams
        print('7. Clicking Teams...')
        teams_link = page.locator('aside nav >> text=Teams').first
        await teams_link.click()
        await page.wait_for_timeout(1000)
        print('   Current URL:', page.url)
        assert '/admin/teams' in page.url
        print('   Teams page loaded! PASS')
        
        # Test clicking Analytics
        print('8. Clicking Analytics...')
        analytics = page.locator('aside nav >> text=Analytics').first
        await analytics.click()
        await page.wait_for_timeout(1000)
        print('   Current URL:', page.url)
        assert '/admin/reports' in page.url or await page.locator('aside nav >> text=Reports').is_visible()
        print('   Analytics opened! PASS')
        
        # Test clicking SLA
        print('9. Clicking SLA...')
        sla_link = page.locator('aside nav >> text=SLA').first
        await sla_link.click()
        await page.wait_for_timeout(1000)
        print('   Current URL:', page.url)
        assert '/admin/sla' in page.url
        print('   SLA page loaded! PASS')
        
        # Test clicking Settings
        print('10. Clicking Settings...')
        settings = page.locator('aside nav >> text=Settings').first
        await settings.click()
        await page.wait_for_timeout(1000)
        print('   Current URL:', page.url)
        assert '/admin/settings' in page.url or await page.locator('aside nav >> text=AI Configuration').is_visible()
        print('   Settings opened! PASS')
        
        # Test clicking AI Configuration
        print('11. Clicking AI Configuration...')
        ai_link = page.locator('aside nav >> text=AI Configuration').first
        await ai_link.click()
        await page.wait_for_timeout(1000)
        print('   Current URL:', page.url)
        assert '/admin/settings/ai' in page.url
        print('   AI Configuration page loaded! PASS')
        
        # Test clicking All Conversations
        print('12. Clicking Workspace -> All Conversations...')
        ws = page.locator('aside nav >> text=Workspace').first
        # If not expanded, click it
        if not await page.locator('aside nav >> text=All Conversations').is_visible():
            await ws.click()
            await page.wait_for_timeout(500)
        convs_link = page.locator('aside nav >> text=All Conversations').first
        await convs_link.click()
        await page.wait_for_timeout(1000)
        print('   Current URL:', page.url)
        assert '/admin/conversations' in page.url
        print('   All Conversations loaded! PASS')
        
        # Save screenshot
        await page.screenshot(path='docs/evidence/admin_navigation_verified.png')
        print('Screenshot saved to docs/evidence/admin_navigation_verified.png')
        
        await browser.close()
        print('\nALL ADMIN SIDEBAR NAVIGATION CHECKS PASSED 100%!')

asyncio.run(test_admin_navigation())

