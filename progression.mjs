/**
 * Funktionstest: spielt die gesamte Fortschrittsschleife im echten Browser durch —
 * Kämpfen, Leveln, Jobwahl, Solo-Dungeon und Gruppendungeon mit KI-Mitspielern.
 */
import { chromium } from 'playwright';

const OUT = process.argv[2] ?? '.';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('Neuer Charakter').click();
await page.waitForTimeout(200);
await page.fill('input[placeholder="Heldenname"]', 'Prüfer');
await page.getByText('Krieger', { exact: false }).first().click();
await page.getByText('Abenteuer beginnen').click();
await page.waitForTimeout(800);

/** Simuliert `seconds` Spielzeit im Zeitraffer und greift dabei automatisch an. */
async function fight(seconds, opts = {}) {
  return page.evaluate(({ seconds, opts }) => {
    const g = window.viebrans.game();
    const step = 1 / 30;
    for (let t = 0; t < seconds; t += step) {
      const p = g.player;
      // Nächsten passenden Gegner anvisieren
      const cur = g.actors.find((a) => a.id === p.targetId);
      if (!cur || cur.dead) {
        const cand = g.actors
          .filter((a) => a.team === 1 && !a.dead && (!opts.maxLevel || a.level <= opts.maxLevel))
          .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        if (cand) p.targetId = cand.id;
      }
      // Fertigkeiten benutzen, sobald bereit
      for (const id of g.save.quickbar) if (id) g.castPlayerSkill(id);
      g.update(step);
    }
    return {
      level: g.save.level, gold: g.save.gold, kills: g.save.kills,
      inventory: g.save.inventory.length, skillPoints: g.save.skillPoints,
      hp: Math.round(g.player.hp), scene: g.scene,
      dungeon: g.dungeon ? { name: g.dungeon.def.name, state: g.dungeon.state, wave: g.dungeon.waveIndex, party: g.dungeon.members.length } : null,
      clears: { ...g.save.clears },
    };
  }, { seconds, opts });
}

console.log('— Phase 1: Leveln durch Kämpfen (120s Spielzeit) —');
console.log(JSON.stringify(await fight(120), null, 0));

console.log('\n— Phase 2: Jobwahl auf Level 30 —');
const job = await page.evaluate(() => {
  const g = window.viebrans.game();
  window.viebrans.setLevel(30);
  window.viebrans.gearUp(14);
  const before = { level: g.save.level, spec: g.save.specId, gs: g.player.gearScore };
  g.save.specId = 'guardian';
  g.recomputePlayer();
  return { before, after: { spec: g.save.specId, hp: Math.round(g.player.maxHp), atk: Math.round(g.player.cs.atk), gs: g.player.gearScore } };
});
console.log(JSON.stringify(job));

console.log('\n— Phase 3: Solo-Dungeon —');
await page.evaluate(() => {
  const g = window.viebrans.game();
  // Fertigkeiten lernen, damit der Held im Dungeon etwas kann
  g.save.skillPoints = 20;
});
await page.getByText('✨ Können').click();
await page.waitForTimeout(300);
for (let i = 0; i < 6; i++) {
  const btn = page.locator('button.mini.primary').first();
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(120); } else break;
}
await page.getByText('✕').click();
await page.waitForTimeout(200);
await page.getByText('🗝 Dungeon').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/10-dungeonlist.png` });
await page.locator('button.mini.primary').first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/11-dungeon-enter.png` });
console.log(JSON.stringify(await fight(150)));
await page.screenshot({ path: `${OUT}/12-dungeon-run.png` });

console.log('\n— Phase 4: Gruppendungeon mit KI-Mitspielern —');
await page.evaluate(() => {
  const g = window.viebrans.game();
  if (g.dungeon) g.leaveDungeon(false);
  window.viebrans.setLevel(60);
  window.viebrans.gearUp(52);
  g.save.skillPoints = 40;
});
const party = await page.evaluate(() => {
  const g = window.viebrans.game();
  return { gs: g.player.gearScore, level: g.save.level };
});
console.log('Vor dem Betreten:', JSON.stringify(party));
await page.getByText('🗝 Dungeon').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/13-dungeonlist-60.png` });
const buttons = page.locator('button.mini.primary');
const n = await buttons.count();
await buttons.nth(Math.min(1, n - 1)).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/14-party-enter.png` });
console.log(JSON.stringify(await fight(240)));
await page.screenshot({ path: `${OUT}/15-party-run.png` });

console.log('\n— Phase 5: Sozialsystem —');
const social = await page.evaluate(() => {
  const g = window.viebrans.game();
  const bots = g.save.bots;
  return {
    bots: bots.length,
    online: bots.filter((b) => b.online).length,
    maxLevel: Math.max(...bots.map((b) => b.level)),
    withSpec: bots.filter((b) => b.specId).length,
    chatMessages: g.chat.length,
    beispiele: g.chat.slice(-4).map((m) => `[${m.channel}] ${m.from}: ${m.text}`),
  };
});
console.log(JSON.stringify(social, null, 2));

console.log('\nFEHLER:', errors.length ? errors : 'keine');
await browser.close();
