// Build one app: inline the token layer, the icon set and the fonts so the
// published page is self-contained (no CDN, no runtime fetches).
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokensCss } from './tokens.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CONFIG_PATH = process.env.ORRERY_CONFIG || join(ROOT, 'orrery.config.json');
const CFG = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {};
const ICONS = join(ROOT, 'node_modules', CFG.icons || '@material-symbols/svg-400/rounded');
const FONTS = (CFG.fonts || []).map(f => [f.package, f.file, f.family, f.weight]);

const [,, srcArg, outArg] = process.argv;
if (!srcArg || !outArg) { console.error('usage: build.mjs <template> <out.html>'); process.exit(2); }
const src = resolve(srcArg), out = resolve(outArg), outDir = dirname(out);

// --- fonts: copied next to the page, referenced relatively
const fontDir = join(outDir, 'fonts');
mkdirSync(fontDir, { recursive: true });
let fontCss = '';
for (const [pkg, file, family, weight] of FONTS) {
  const from = join(ROOT, 'node_modules', pkg, 'files', file);
  if (!existsSync(from)) { console.error('missing font', from); process.exit(1); }
  copyFileSync(from, join(fontDir, file));
  fontCss += `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};`
           + `font-display:swap;src:url("fonts/${file}") format("woff2");}\n`;
}

// --- icons: meaningful ones only; each carries a role where it is used
const iconCache = new Map();
function icon(name, size = 18){
  if (!iconCache.has(name)) {
    const file = join(ICONS, name + '.svg');
    if (!existsSync(file)) throw new Error('no icon: ' + name);
    const svg = readFileSync(file, 'utf8');
    const paths = [...svg.matchAll(/<path[^>]*d="([^"]+)"[^>]*\/>/g)].map(m => m[1]);
    if (!paths.length) throw new Error('no path in icon: ' + name);
    iconCache.set(name, paths);
  }
  const d = iconCache.get(name).map(p => `<path d="${p}"/>`).join('');
  return `<svg class="icon" viewBox="0 -960 960 960" width="${size}" height="${size}" `
       + `fill="currentColor" aria-hidden="true" focusable="false">${d}</svg>`;
}

let html = readFileSync(src, 'utf8');
html = html.replace(/\{\{include:([a-z0-9.\-]+)\}\}/g, (_, name) => {
  const f = join(ROOT, 'partials', name);
  if (!existsSync(f)) { console.error('missing partial', f); process.exit(1); }
  return readFileSync(f, 'utf8');
});
html = html.replace(/\{\{tokens\}\}/g, () => tokensCss());
html = html.replace(/\{\{fonts\}\}/g, () => fontCss);
html = html.replace(/\{\{icon:([a-z0-9_]+)(?::(\d+))?\}\}/g,
                    (_, n, s) => icon(n, s ? +s : 18));
// Bare path data, for <symbol> definitions that scripts reference with <use>.
html = html.replace(/\{\{iconpath:([a-z0-9_]+)\}\}/g, (_, n) => {
  icon(n);
  return iconCache.get(n).map(d => `<path d="${d}"/>`).join('');
});
const left = html.match(/\{\{[^}]+\}\}/g);
if (left) { console.error('unresolved placeholders:', [...new Set(left)].join(', ')); process.exit(1); }
writeFileSync(out, html);
console.log(`built ${out}  (${(html.length/1024).toFixed(1)} KB, ${iconCache.size} icons, ${FONTS.length} fonts)`);
