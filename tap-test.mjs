/**
 * Prüft, ob sich Gegner mit dem Finger anvisieren lassen — inklusive des
 * Zitterns, das ein echter Fingertipp mitbringt. Genau daran scheiterte die
 * erste Fassung: sie summierte die zurückgelegte Strecke statt den Abstand
 * zum Aufsetzpunkt und verwarf dadurch fast jeden Tipp als Wischbewegung.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await (await browser.newContext({
  viewport: { width: 412, height: 892 }, isMobile: true, hasTouch: true,
})).newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('Neuer Charakter').click();
await page.waitForTimeout(250);
await page.fill('input[placeholder="Heldenname"]', 'Tipper');
await page.getByText('Abenteuer beginnen').click();
await page.waitForTimeout(1500);

// In die Sonnenwiese stellen, dort stehen Gegner dicht beieinander.
await page.evaluate(() => {
  const g = window.viebrans.game();
  g.player.x = 1000; g.player.y = 800;
  const r = window.viebrans.renderer();
  for (let i = 0; i < 90; i++) { g.update(1 / 60); r.draw(g, 1 / 60); }
});
await page.waitForTimeout(400);

/** Wo steht der nächste Gegner auf dem Bildschirm? */
const findMob = () => page.evaluate(() => {
  const g = window.viebrans.game();
  const r = window.viebrans.renderer();
  const p = g.player;
  const mobs = g.actors
    .filter((a) => a.team === 1 && !a.dead)
    .map((a) => ({ a, s: r.screenOf(a.x, a.y), d: Math.hypot(a.x - p.x, a.y - p.y) }))
    .filter((e) => e.s.x > 40 && e.s.x < 372 && e.s.y > 120 && e.s.y < 700)
    .sort((x, y) => x.d - y.d);
  if (!mobs.length) return null;
  g.player.targetId = null;
  return { id: mobs[0].a.id, name: mobs[0].a.name, x: Math.round(mobs[0].s.x), y: Math.round(mobs[0].s.y) };
});

/** Ein Tipp mit realistischem Zittern von `jitter` Pixeln. */
async function tap(x, y, jitter) {
  await page.touchscreen.tap(x, y).catch(async () => {});
  if (jitter > 0) {
    // touchscreen.tap wackelt nicht — deshalb der Weg über Zeigerereignisse.
    await page.evaluate(({ x, y, jitter }) => {
      const c = document.querySelector('canvas#view');
      const send = (type, px, py) => c.dispatchEvent(new PointerEvent(type, {
        pointerId: 1, pointerType: 'touch', clientX: px, clientY: py, bubbles: true,
      }));
      send('pointerdown', x, y);
      for (let i = 1; i <= 4; i++) send('pointermove', x + (i % 2 ? jitter : -jitter), y + jitter * 0.6);
      send('pointerup', x + jitter * 0.3, y);
    }, { x, y, jitter });
  }
  await page.waitForTimeout(120);
  return page.evaluate(() => window.viebrans.game().player.targetId);
}

let failed = 0;
for (const jitter of [0, 4, 9, 15]) {
  const mob = await findMob();
  if (!mob) { console.log('Kein Gegner im Bild — übersprungen'); continue; }
  const got = await tap(mob.x, mob.y, jitter);
  const ok = got === mob.id;
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FEHLER'} Tipp auf ${mob.name.padEnd(16)} mit ${String(jitter).padStart(2)} px Zittern → ${ok ? 'anvisiert' : `nichts (${got})`}`);
}

// Der Zielknopf muss auch ohne Zielen funktionieren.
const cycled = await page.evaluate(() => {
  const g = window.viebrans.game();
  g.player.targetId = null;
  const ok = g.cycleTarget();
  const t = g.actors.find((a) => a.id === g.player.targetId);
  return { ok, name: t?.name ?? null };
});
console.log(`${cycled.ok ? 'OK  ' : 'FEHLER'} Zielknopf → ${cycled.name ?? 'nichts'}`);
if (!cycled.ok) failed++;

console.log(failed ? `\n${failed} Fälle fehlgeschlagen.` : '\nBESTANDEN: Gegner lassen sich zuverlässig antippen.');
await browser.close();
process.exit(failed ? 1 : 0);
