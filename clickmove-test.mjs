/**
 * Prüft die Steuerung nach dem Umbau auf Klick-und-Laufen: ein Tipp auf den
 * Boden schickt die Figur dorthin, ein Tipp auf einen Gegner lässt sie
 * hinlaufen und von selbst zuschlagen — ohne weiteres Zutun.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await (await browser.newContext({
  viewport: { width: 412, height: 892 }, isMobile: true, hasTouch: true,
})).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('Neuer Charakter').click();
await page.waitForTimeout(250);
await page.fill('input[placeholder="Heldenname"]', 'Klicker');
await page.getByText('Abenteuer beginnen').click();
await page.waitForTimeout(1500);

await page.evaluate(() => {
  const g = window.viebrans.game();
  g.player.x = 1000; g.player.y = 820;
  const r = window.viebrans.renderer();
  for (let i = 0; i < 90; i++) { g.update(1 / 60); r.draw(g, 1 / 60); }
});
await page.waitForTimeout(300);

// 1) Tipp auf den Boden
const walk = await page.evaluate(async () => {
  const g = window.viebrans.game();
  const r = window.viebrans.renderer();
  const p = g.player;
  // Ohne Nachbarn messen, sonst wird der Held unterwegs angerempelt.
  const alle = g.actors;
  g.actors = [p];

  // Weiter entfernte Bodenpunkte liegen oberhalb der Bildmitte — unterhalb
  // davon liegt der Boden zwischen Kamera und Figur und ist immer nah.
  let hit = null;
  for (const sy of [430, 400, 370, 340, 310, 280]) {
    const h = r.pick(g, 206, sy);
    if (h.ground && Math.hypot(h.ground.x - p.x, h.ground.y - p.y) > 120) { hit = h.ground; break; }
  }
  if (!hit) { g.actors = alle; return { fehler: 'kein passender Bodenpunkt' }; }

  const before = { x: p.x, y: p.y };
  g.tapWorld(hit.x, hit.y);
  const marke = !!g.clickMark;
  for (let i = 0; i < 400; i++) g.update(1 / 60);
  const res = {
    entfernungZiel: Math.round(Math.hypot(hit.x - before.x, hit.y - before.y)),
    gelaufen: Math.round(Math.hypot(p.x - before.x, p.y - before.y)),
    restAbstand: Math.round(Math.hypot(p.x - hit.x, p.y - hit.y)),
    marke,
  };
  g.actors = alle;
  return res;
});
console.log('Tipp auf Boden:', JSON.stringify(walk));

// 2) Tipp auf einen Gegner — Figur muss hinlaufen und von selbst kämpfen
const fight = await page.evaluate(async () => {
  const g = window.viebrans.game();
  const p = g.player;
  const mob = g.actors
    .filter((a) => a.team === 1 && !a.dead)
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  if (!mob) return { fehler: 'kein Gegner' };
  const abstandVorher = Math.round(Math.hypot(mob.x - p.x, mob.y - p.y));
  const hpVorher = mob.hp;
  p.targetId = mob.id;
  // Nur zusehen — keine weitere Eingabe.
  for (let i = 0; i < 420; i++) g.update(1 / 60);
  return {
    abstandVorher,
    abstandNachher: Math.round(Math.hypot(mob.x - p.x, mob.y - p.y)),
    schadenGemacht: Math.round(hpVorher - mob.hp),
    gegnerTot: mob.dead,
    eigenesLeben: Math.round(p.hp),
  };
});
console.log('Tipp auf Gegner:', JSON.stringify(fight));

const ok = walk.restAbstand < 30 && walk.gelaufen > 100
  && walk.marke === true
  && (fight.schadenGemacht > 0 || fight.gegnerTot);
console.log('FEHLER:', errors.length ? errors : 'keine');
console.log(ok ? '\nBESTANDEN: Klicken läuft und kämpft von selbst.' : '\nFEHLGESCHLAGEN');
await browser.close();
process.exit(ok ? 0 : 1);
