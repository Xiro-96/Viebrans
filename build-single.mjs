/**
 * Packt den Produktionsbuild in eine einzelne HTML-Datei — praktisch, um das
 * Spiel ohne Server weiterzugeben. Voraussetzung: `npm run build` lief vorher.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const cssPath = globSync('dist/assets/*.css')[0];
const jsPath = globSync('dist/assets/*.js')[0];
let css = readFileSync(cssPath, 'utf8');
const js = readFileSync(jsPath, 'utf8');

if (/<\/script/i.test(js) || /<\/style/i.test(css)) {
  throw new Error('Quelltext enthält ein schließendes Tag und würde das Dokument zerreißen.');
}

// Schriftimport als <link> herausziehen: zuverlässiger als @import im <style>.
let fontLink = '';
const m = css.match(/@import\s*(?:url\()?["']([^"']+)["']\)?\s*;/);
if (m) {
  css = css.replace(m[0], '');
  fontLink = `<link rel="stylesheet" href="${m[1]}">\n`;
}

const out = `<title>Viebrans</title>
${fontLink}<style>
${css}
/* In eingebetteten Rahmen gibt es keine Geräteränder zu umgehen. */
:root { --safe-t: 0px; --safe-b: 0px; }
</style>

<div id="app"></div>

<script type="module">
${js}
</script>
`;

const target = process.argv[2] ?? 'dist/viebrans-einzeldatei.html';
writeFileSync(target, out, 'utf8');
console.log(`${target} — ${Math.round(Buffer.byteLength(out) / 1024)} kB, Schriftlink: ${fontLink ? 'ja' : 'nein'}`);
