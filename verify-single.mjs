/** Prüft die Ein-Datei-Fassung so, wie sie im eingebetteten Rahmen läuft. */
import { chromium } from 'playwright';

const file = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto('file://' + file);
await page.waitForTimeout(600);
await page.getByText('Neuer Charakter').click();
await page.waitForTimeout(250);
await page.fill('input[placeholder="Heldenname"]', 'Einzeldatei');
await page.getByText('Assist', { exact: false }).first().click();
await page.getByText('Abenteuer beginnen').click();
await page.waitForTimeout(1200);

const state = await page.evaluate(() => {
  const g = window.viebrans.game();
  const step = 1 / 30;
  for (let t = 0; t < 20; t += step) {
    const p = g.player;
    const cur = g.actors.find((a) => a.id === p.targetId);
    if (!cur || cur.dead) {
      const c = g.actors.filter((a) => a.team === 1 && !a.dead)
        .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (c) p.targetId = c.id;
    }
    for (const id of g.save.quickbar) if (id) g.castPlayerSkill(id);
    g.update(step);
  }
  return { level: g.save.level, kills: g.save.kills, bots: g.actors.filter(a => a.kind === 'bot').length, chat: g.chat.length, gespeichert: localStorage.getItem('viebrans.save.v1') !== null };
});
console.log('STATE', JSON.stringify(state));
await page.waitForTimeout(500);
await page.screenshot({ path: file.replace(/[^/]+$/, 'single-check.png') });
console.log('FEHLER:', errors.length ? errors : 'keine');
await browser.close();
