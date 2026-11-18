// node inspect.mjs <dir raw|out> name...  → shots/<name>-<dir>.png  (views: front +Z, side +X, top +Y, 3/4)
import { chromium } from 'playwright-core'; import { readdirSync, mkdirSync } from 'node:fs';
const [dir, ...names] = process.argv.slice(2); mkdirSync('shots', { recursive: true });
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1440, height: 360 } });
for (const n of names) {
  const src = dir === 'raw' ? `/logs/model-work/raw/${n}/${readdirSync(`raw/${n}`).find(f => f.endsWith('.glb'))}` : `/apps/web/public/models/${n}.glb`;
  await page.goto(`http://127.0.0.1:5190/logs/model-work/inspect.html?src=${src}`);
  await page.waitForFunction(() => document.title.startsWith('ready'), null, { timeout: 120000 });
  console.log(n, await page.title()); await page.screenshot({ path: `shots/${n}-${dir}.png` });
}
await b.close();
