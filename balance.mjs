/** Misst, wie schnell ein frischer Held levelt, wenn er passende Gegner sucht. */
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 412, height: 892 } })).newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('Neuer Charakter').click();
await page.waitForTimeout(200);
await page.fill('input[placeholder="Heldenname"]', 'Balance');
await page.getByText('Krieger', { exact: false }).first().click();
await page.getByText('Abenteuer beginnen').click();
await page.waitForTimeout(500);

const result = await page.evaluate(() => {
  const g = window.viebrans.game();
  const step = 1 / 30;
  const marks = [];
  let last = 1;
  for (let t = 0; t < 3600; t += step) {
    const p = g.player;
    const cur = g.actors.find((a) => a.id === p.targetId);
    if (!cur || cur.dead) {
      // Sucht Gegner in passender Levelspanne, bevorzugt nahe.
      const cand = g.actors
        .filter((a) => a.team === 1 && !a.dead && a.level <= g.save.level + 2)
        .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (cand) p.targetId = cand.id;
    }
    for (const id of g.save.quickbar) if (id) g.castPlayerSkill(id);
    g.update(step);
    if (g.save.level > last) {
      last = g.save.level;
      marks.push({ level: last, minutes: +(t / 60).toFixed(1), gs: g.player.gearScore, inv: g.save.inventory.length });
    }
  }
  return { marks, level: g.save.level, kills: g.save.kills, gold: g.save.gold, gs: g.player.gearScore, inv: g.save.inventory.length };
});
console.log(JSON.stringify(result, null, 1));
await browser.close();
