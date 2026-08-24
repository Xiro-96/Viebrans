import { chromium } from 'playwright';

const OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({
  viewport: { width: 412, height: 892 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT}/01-start.png` });

// Neuer Charakter
await page.getByText('Neuer Charakter').click();
await page.waitForTimeout(300);
await page.fill('input[placeholder="Heldenname"]', 'Testheld');
await page.getByText('Späher', { exact: false }).first().click();
await page.screenshot({ path: `${OUT}/02-create.png` });
await page.getByText('Abenteuer beginnen').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/03-world.png` });

// Auf einen Gegner tippen: wir simulieren einen Klick etwas oberhalb des Spielers
const box = await page.locator('canvas#view').boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.32);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/04-combat.png` });

// Zustand auslesen
const state = await page.evaluate(() => {
  const g = window.viebrans.game();
  return {
    level: g.save.level, xp: Math.round(g.save.xp), gold: g.save.gold,
    kills: g.save.kills, inv: g.save.inventory.length,
    actors: g.actors.length,
    bots: g.actors.filter((a) => a.kind === 'bot').length,
    monsters: g.actors.filter((a) => a.kind === 'monster').length,
    chat: g.chat.length,
    online: g.save.bots.filter((b) => b.online).length,
    hp: Math.round(g.player.hp), maxHp: Math.round(g.player.maxHp),
    target: g.player.targetId,
  };
});
console.log('STATE', JSON.stringify(state, null, 2));

// Panels durchklicken
for (const [label, file] of [['🛡 Held', '05-hero'], ['🎒 Beutel', '06-bag'], ['✨ Können', '07-skills'], ['🗝 Dungeon', '08-dungeon'], ['💬 Sozial', '09-social']]) {
  await page.getByText(label).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${file}.png` });
  await page.getByText('✕').click();
  await page.waitForTimeout(200);
}

console.log('ERRORS', errors.length ? errors : 'keine');
await browser.close();
