import { checkPresentation } from './browser-presentation.mjs';
import { checkDrawings } from './browser-drawings.mjs';
import { checkComparison } from './browser-comparison.mjs';
import { checkSunStudy } from './browser-sun-study.mjs';
import { checkEstimate } from './browser-estimate.mjs';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as h from './browser-helpers.mjs';
import { checkRenovation } from './browser-renovation.mjs';
import { checkElectrical } from './browser-electrical.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, '.local/qa');
await mkdir(out, { recursive: true });
const url = process.env.FLATPLAN_QA_URL || 'http://127.0.0.1:4189/';
let browser,
  server,
  log = '';
try {
  if (!process.env.FLATPLAN_QA_URL) {
    server = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        '4189',
        '--strictPort',
      ],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    for (const stream of [server.stdout, server.stderr])
      stream.on('data', (chunk) => {
        log = (log + chunk).slice(-3000);
      });
  }
  const start = Date.now();
  for (;;) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    if (Date.now() - start > 30000)
      throw new Error(`Preview not ready: ${log}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  });
  const scope = process.env.FLATPLAN_QA_SCOPE;
  if (!scope || scope === 'mechanisms')
    await checkRenovation(browser, url, out, h);
  if (!scope || scope === 'electrical')
    await checkElectrical(browser, url, out, h);
  if (!scope || scope === 'sun-study')
    await checkSunStudy(browser, url, out, h);
  if (!scope || scope === 'presentation')
    await checkPresentation(browser, url, out, h);
  if (!scope || scope === 'drawings') await checkDrawings(browser, url, out, h);
  if (!scope || scope === 'comparison')
    await checkComparison(browser, url, out, h);
  if (!scope || scope === 'estimate') await checkEstimate(browser, url, out, h);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
