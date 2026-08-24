/**
 * Packt den Produktionsbuild in eine einzige HTML-Datei — praktisch zum
 * Verschicken oder Hochladen, wenn kein Webserver zur Hand ist.
 *
 *   npm run build && node build-single.mjs [zieldatei]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ASSETS = 'dist/assets';
const out = process.argv[2] ?? 'dist/viebrans-einzeldatei.html';

const find = (ext) => {
  const hit = readdirSync(ASSETS).find((f) => f.endsWith(ext));
  if (!hit) throw new Error(`Keine ${ext}-Datei in ${ASSETS} — lief "npm run build"?`);
  return readFileSync(join(ASSETS, hit), 'utf8');
};

const css = find('.css');
const js = find('.js');

// Ein schließendes Tag im Inhalt würde den umgebenden Block vorzeitig beenden.
if (/<\/script/i.test(js)) throw new Error('Skript enthält ein schließendes script-Tag');
if (/<\/style/i.test(css)) throw new Error('Stylesheet enthält ein schließendes style-Tag');

writeFileSync(out, `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="#0b1020" />
<title>Viebrans</title>
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<script type="module">
${js}
</script>
</body>
</html>
`, 'utf8');

console.log(`${out} geschrieben`);
