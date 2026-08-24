/**
 * Prüft den Fall, der in der Praxis schiefging: Ein Service Worker ist bereits
 * installiert, danach wird eine neue Fassung veröffentlicht. Sieht der Spieler
 * sie beim nächsten Aufruf?
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 412, height: 892 } });
const page = await ctx.newPage();

// 1) Erster Besuch — der Service Worker installiert sich.
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
const first = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return { controlled: !!navigator.serviceWorker.controller, scope: reg?.scope, marker: document.title };
});
console.log('Nach erstem Besuch:', JSON.stringify(first));

// 2) Eine neue Veröffentlichung nachstellen: die ausgelieferte Seite ändern.
const idx = 'dist/index.html';
const before = readFileSync(idx, 'utf8');
writeFileSync(idx, before.replace('<title>Viebrans</title>', '<title>Viebrans NEUE FASSUNG</title>'), 'utf8');

// 3) Erneuter Aufruf — kommt die neue Seite an?
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const second = await page.evaluate(() => ({
  title: document.title,
  controlled: !!navigator.serviceWorker.controller,
}));
console.log('Nach neuer Veröffentlichung:', JSON.stringify(second));

// 4) Offlinefall: geht das Spiel ohne Netz noch auf?
writeFileSync(idx, before, 'utf8');
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await ctx.setOffline(true);
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(800);
const offline = await page.evaluate(() => ({
  title: document.title,
  startseite: !!document.querySelector('.logo'),
}));
console.log('Ohne Netz:', JSON.stringify(offline));

const ok = second.title.includes('NEUE FASSUNG') && offline.startseite;
console.log(ok ? '\nBESTANDEN: Neue Fassung kommt an, offline läuft es trotzdem.'
               : '\nFEHLGESCHLAGEN');
await browser.close();
process.exit(ok ? 0 : 1);
