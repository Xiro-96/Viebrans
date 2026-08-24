/** Erzeugt Bildschirmfotos typischer Spielsituationen im Handyformat. */
import { chromium } from 'playwright';

const OUT = process.argv[2] ?? '.';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();

/** Simuliert Spielzeit im Zeitraffer und greift dabei automatisch an. */
const battle = (seconds) => page.evaluate((seconds) => {
  const g = window.viebrans.game();
  const step = 1 / 30;
  for (let t = 0; t < seconds; t += step) {
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
}, seconds);

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT}/s1-start.png` });

await page.getByText('Neuer Charakter').click();
await page.waitForTimeout(200);
await page.fill('input[placeholder="Heldenname"]', 'Viebrand');
await page.getByText('Magier', { exact: false }).first().click();
await page.screenshot({ path: `${OUT}/s2-create.png` });
await page.getByText('Abenteuer beginnen').click();
await page.waitForTimeout(600);

await page.evaluate(() => {
  const g = window.viebrans.game();
  window.viebrans.setLevel(34);
  window.viebrans.gearUp(24);
  g.save.specId = 'elementor';
  g.save.skillRanks = { m_bolt: 4, m_frost: 3, m_shield: 2, el_meteor: 2 };
  g.save.quickbar = ['m_bolt', 'm_frost', 'm_shield', 'el_meteor', null, null];
  g.save.skillPoints = 3;
  g.recomputePlayer();
  g.player.hp = g.player.maxHp;
  g.player.mp = g.player.maxMp;
  g.player.x = 950;
  g.player.y = 1400;
});
await battle(12);
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/s3-kampf.png` });

for (const [label, file] of [['🛡 Held', 's4-held'], ['🎒 Beutel', 's5-beutel'], ['✨ Können', 's6-koennen'], ['🗝 Dungeon', 's7-dungeon'], ['💬 Sozial', 's8-chat']]) {
  await page.getByText(label).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${file}.png` });
  await page.getByText('✕').click();
  await page.waitForTimeout(150);
}

await page.getByText('💬 Sozial').click();
await page.waitForTimeout(300);
await page.getByText('Rangliste').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/s9-rangliste.png` });
await page.getByText('✕').click();

await page.evaluate(() => {
  const g = window.viebrans.game();
  window.viebrans.setLevel(60);
  window.viebrans.gearUp(48);
  g.save.skillRanks = { m_bolt: 5, m_frost: 4, m_shield: 3, el_meteor: 4, el_chain: 3, el_nova: 3 };
  g.save.quickbar = ['m_bolt', 'm_frost', 'm_shield', 'el_meteor', 'el_chain', 'el_nova'];
  g.recomputePlayer();
  g.player.hp = g.player.maxHp;
  g.player.mp = g.player.maxMp;
});
await page.getByText('🗝 Dungeon').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/s10-dungeonliste.png` });
const btns = page.locator('button.mini.primary');
await btns.nth(Math.min(1, (await btns.count()) - 1)).click();
await page.waitForTimeout(300);
await battle(9);
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/s11-gruppe.png` });

await browser.close();
