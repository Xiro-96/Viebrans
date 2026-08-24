/** Bildschirmfotos der 3D-Fassung im Handyformat. */
import { chromium } from 'playwright';

const OUT = process.argv[2] ?? '.';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl',
  ],
});
const page = await (await browser.newContext({
  viewport: { width: 412, height: 892 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
})).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

/** Spielzeit im Zeitraffer, mit automatischem Angreifen. */
const battle = (seconds, opts = {}) => page.evaluate(({ seconds, opts }) => {
  const g = window.viebrans.game();
  const step = 1 / 30;
  for (let t = 0; t < seconds; t += step) {
    const p = g.player;
    if (!opts.noFight) {
      const cur = g.actors.find((a) => a.id === p.targetId);
      if (!cur || cur.dead) {
        const c = g.actors.filter((a) => a.team === 1 && !a.dead)
          .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        if (c) p.targetId = c.id;
      }
      for (const id of g.save.quickbar) if (id) g.castPlayerSkill(id);
    }
    g.update(step);
  }
}, { seconds, opts });

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/n1-start.png` });

await page.getByText('Neuer Charakter').click();
await page.waitForTimeout(250);
await page.fill('input[placeholder="Heldenname"]', 'Viebrand');
await page.getByText('Späher', { exact: false }).first().click();
await page.screenshot({ path: `${OUT}/n2-create.png` });
await page.getByText('Abenteuer beginnen').click();
await page.waitForTimeout(2000);

// Prüfen, dass WebGL wirklich zeichnet
const gl = await page.evaluate(() => {
  const c = document.querySelector('canvas#view');
  const ctx = c.getContext('webgl2') || c.getContext('webgl');
  return { ok: !!ctx, w: c.width, h: c.height };
});
console.log('WEBGL', JSON.stringify(gl));
await page.screenshot({ path: `${OUT}/n3-stadt.png` });

// Auf Stufe bringen und in die Wolfssteppe stellen
await page.evaluate(() => {
  const g = window.viebrans.game();
  window.viebrans.setLevel(34);
  window.viebrans.gearUp(24);
  window.viebrans.giveMounts();
  g.save.specId = 'ranger';
  g.save.skillRanks = { s_pierce: 4, s_dash: 3, s_volley: 3, rg_snipe: 2, rg_mark: 2 };
  g.save.quickbar = ['s_pierce', 's_dash', 's_volley', 'rg_snipe', 'rg_mark', null];
  g.recomputePlayer();
  g.player.hp = g.player.maxHp; g.player.mp = g.player.maxMp;
  g.player.x = 950; g.player.y = 1400;
});
await battle(10);
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/n4-kampf.png` });

// Aufsitzen und fliegen
const flight = await page.evaluate(async () => {
  const g = window.viebrans.game();
  g.save.activeMount = 'broom';
  g.toggleMount();
  const mounted = g.mounted;
  g.setClimb(1);
  const step = 1 / 30;
  for (let t = 0; t < 6; t += step) g.update(step);
  const alt1 = Math.round(g.player.alt);
  g.setClimb(0);
  // Ein Stück in Blickrichtung fliegen
  g.steer(0.2, -1);
  for (let t = 0; t < 4; t += step) g.update(step);
  g.steer(0, 0);
  return { mounted, alt1, alt2: Math.round(g.player.alt), fliegt: g.isFlying(g.player) };
});
console.log('FLUG', JSON.stringify(flight));
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/n5-flug.png` });

// Höher steigen für die Aussicht
await page.evaluate(() => {
  const g = window.viebrans.game();
  g.save.activeMount = 'griffin';
  g.player.mountId = 'griffin';
  g.setClimb(1);
  const step = 1 / 30;
  for (let t = 0; t < 6; t += step) g.update(step);
  g.setClimb(0);
});
await page.evaluate(() => { window.viebrans.renderer().pitch = 0.36; });
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/n6-hoch.png` });

// Landen, Menüs
await page.evaluate(() => {
  const g = window.viebrans.game();
  g.setClimb(-1);
  const step = 1 / 30;
  for (let t = 0; t < 12; t += step) g.update(step);
  g.toggleMount();
});
await page.waitForTimeout(400);
for (const [label, file] of [['🛡 Held', 'n7-held'], ['🗝 Dungeon', 'n8-dungeon'], ['💬 Sozial', 'n9-chat']]) {
  await page.getByText(label).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${file}.png` });
  await page.getByText('✕').click();
  await page.waitForTimeout(150);
}
// Stall
await page.getByText('🛡 Held').click();
await page.waitForTimeout(300);
await page.getByText('Stall', { exact: true }).click();
await page.waitForTimeout(350);
await page.screenshot({ path: `${OUT}/n10-stall.png` });
await page.getByText('✕').click();

// Gruppendungeon
await page.evaluate(() => {
  const g = window.viebrans.game();
  window.viebrans.setLevel(60);
  window.viebrans.gearUp(48);
  g.save.skillRanks = { s_pierce: 5, s_dash: 4, s_volley: 4, rg_snipe: 4, rg_mark: 3, rg_rain: 3 };
  g.save.quickbar = ['s_pierce', 's_dash', 's_volley', 'rg_snipe', 'rg_mark', 'rg_rain'];
  g.recomputePlayer(); g.player.hp = g.player.maxHp; g.player.mp = g.player.maxMp;
});
await page.getByText('🗝 Dungeon').click();
await page.waitForTimeout(400);
const btns = page.locator('button.mini.primary');
await btns.nth(Math.min(1, (await btns.count()) - 1)).click();
await page.waitForTimeout(400);
await battle(11);
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/n11-gruppe.png` });

const perf = await page.evaluate(async () => {
  let frames = 0;
  const t0 = performance.now();
  await new Promise((res) => {
    const tick = () => { frames++; performance.now() - t0 < 2000 ? requestAnimationFrame(tick) : res(); };
    requestAnimationFrame(tick);
  });
  return Math.round((frames / (performance.now() - t0)) * 1000);
});
console.log('BILDER/S (SwiftShader, ohne echte Grafikkarte):', perf);
console.log('FEHLER:', errors.length ? errors.slice(0, 6) : 'keine');
await browser.close();
