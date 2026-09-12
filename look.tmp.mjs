import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
await page.goto('http://localhost:5199/preview', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.locator('.preview__picks button').nth(0).click()   // "Opening the round" — no bid over the centre
await page.waitForTimeout(1500)
await page.addStyleTag({ content: '.preview__head,.preview__picks,.preview__note{display:none!important}' })
await page.waitForTimeout(300)
const box = await page.locator('.board__stage').boundingBox()
await page.screenshot({ path: '/tmp/claude-0/look/brand-bid.png', clip: box })
console.log(errs.length ? errs.join('\n').slice(0,300) : 'no errors')
await browser.close()
