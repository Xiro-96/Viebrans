/**
 * Prüft die Steuerung gegen das, was der Spieler tatsächlich sieht.
 *
 * Ein Vorzeichenfehler beim "Rechts auf dem Bildschirm" spiegelt die gesamte
 * Steuerung, ohne dass irgendetwas abstürzt. Deshalb wird hier nicht die
 * Formel geprüft, sondern die Bildschirmbewegung: Knüppel nach rechts muss
 * die Figur im Bild nach rechts tragen — bei jeder Kameradrehung.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await (await browser.newContext({ viewport: { width: 412, height: 892 } })).newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('Neuer Charakter').click();
await page.waitForTimeout(250);
await page.fill('input[placeholder="Heldenname"]', 'Richtung');
await page.getByText('Abenteuer beginnen').click();
await page.waitForTimeout(1500);

/**
 * Schiebt den Knüppel in eine Richtung und meldet, wohin sich die Figur
 * relativ zur Kamera bewegt hat: rechts/links im Bild und näher/ferner.
 */
const probe = (yaw, sx, sy) => page.evaluate(({ yaw, sx, sy }) => {
  const g = window.viebrans.game();
  const r = window.viebrans.renderer();
  r.yaw = yaw;
  const p = g.player;
  // Freies Feld: sonst schieben Nachbarfiguren den Helden beim Messen beiseite.
  g.actors = [p];
  p.x = 1300; p.y = 1300; p.alt = 0; p.moveTo = null; p.targetId = null;
  // Kamera erst einschwingen lassen, sonst misst man die Nachführung mit.
  for (let i = 0; i < 60; i++) r.draw(g, 1 / 60);

  const before = r.screenOf(p.x, p.y);
  const dir = r.screenToWorldDir(sx, sy);
  g.steer(dir.x, dir.y);
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  g.steer(0, 0);
  const after = r.screenOf(p.x, p.y);
  return { dx: +(after.x - before.x).toFixed(1), dy: +(after.y - before.y).toFixed(1) };
}, { yaw, sx, sy });

const cases = [
  { name: 'Knüppel rechts',  sx: 1,  sy: 0,  erwartet: 'dx > 0' },
  { name: 'Knüppel links',   sx: -1, sy: 0,  erwartet: 'dx < 0' },
  { name: 'Knüppel hoch',    sx: 0,  sy: -1, erwartet: 'weiter weg' },
  { name: 'Knüppel runter',  sx: 0,  sy: 1,  erwartet: 'näher dran' },
];

let failed = 0;
for (const yaw of [Math.PI, 0, Math.PI / 2, -Math.PI / 2, 2.4]) {
  for (const c of cases) {
    const { dx, dy } = await probe(yaw, c.sx, c.sy);
    let ok;
    if (c.sx > 0) ok = dx > 4;
    else if (c.sx < 0) ok = dx < -4;
    // Im Bild nach oben heißt: weiter von der Kamera weg.
    else if (c.sy < 0) ok = dy < -2;
    else ok = dy > 2;
    if (!ok) failed++;
    console.log(
      `${ok ? 'OK  ' : 'FEHLER'} yaw=${yaw.toFixed(2).padStart(5)} ${c.name.padEnd(15)}`
      + ` Bildbewegung dx=${String(dx).padStart(7)} dy=${String(dy).padStart(7)}`,
    );
  }
}

console.log(failed ? `\n${failed} Fälle falsch — die Steuerung ist gespiegelt oder verdreht.`
                   : '\nBESTANDEN: Der Knüppel bewegt die Figur in jede Bildschirmrichtung korrekt.');
await browser.close();
process.exit(failed ? 1 : 0);
