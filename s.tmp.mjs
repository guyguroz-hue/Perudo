import { chromium } from 'playwright'
import { createServer } from 'vite'
const server = await createServer({ server: { port: 5188, strictPort: true }, logLevel: 'error' })
await server.listen()
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] })
const page = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 })
page.on('pageerror', e => console.log('PAGEERROR', String(e)))
await page.goto('http://localhost:5188/preview', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
for (const [tab, sel, name] of [['Lobby','.lobby-table__stage','lobby'], ['Game over','.board','finish']]) {
  await page.getByRole('tab', { name: tab }).click()
  await page.waitForTimeout(4500)
  const el = await page.$(sel)
  if (el) { await el.screenshot({ path: `/tmp/final-${name}.png` }); console.log('shot', name) }
}
await b.close(); await server.close()
