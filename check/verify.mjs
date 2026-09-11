#!/usr/bin/env node
/* The laws, as executable assertions.
 *
 *   node check/verify.mjs <dir-or-html> [...]
 *
 * Every app built on the kit must pass these at every window size and in both
 * themes. They are deliberately app-agnostic: the stage reports what counts as
 * an object via data-objects, and nothing else here knows the subject. */
import { chromium } from 'playwright-core';
import { existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const WIDTHS = [[1440, 900, 'wide'], [1180, 760, 'mid'], [400, 780, 'narrow']];
const THEMES = ['light', 'dark'];
const EXE = process.env.CHROMIUM_PATH ||
  '/home/user/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';

const targets = process.argv.slice(2).map(a => {
  const p = resolve(a);
  return existsSync(p) && statSync(p).isDirectory() ? join(p, 'index.html') : p;
});
if (!targets.length) {
  console.error('usage: verify.mjs <dir-or-html> [...]');
  process.exit(2);
}

/* Runs inside the page. Returns a list of violations, each naming the law. */
function audit(){
  const out = [];
  const doc = document.documentElement;
  const shown = e => { let n = e; while (n) { if (getComputedStyle(n).display === 'none') return false;
                                              n = n.parentElement; } return true; };

  if (doc.scrollHeight > innerHeight + 1 || doc.scrollWidth > innerWidth + 1)
    out.push('shell: the page scrolls; the stage must fill the window and only panels may scroll');

  const svg = document.querySelector('svg.stage');
  if (!svg) out.push('shell: no element with class "stage"');

  const panels = [...document.querySelectorAll('.hud:not(.modal)')]
    .filter(e => getComputedStyle(e).display !== 'none')
    .map(e => e.getBoundingClientRect());
  const objSel = svg && svg.dataset.objects;
  const objects = objSel ? [...document.querySelectorAll(objSel)] : [];
  const labels = [...document.querySelectorAll('#content text')];
  for (const n of [...objects, ...labels]) {
    const b = n.getBoundingClientRect();
    if (!b.width) continue;
    if (panels.some(p => b.left < p.right && b.right > p.left && b.top < p.bottom && b.bottom > p.top))
      out.push(`viewport: ${n.id || n.textContent.slice(0, 18)} sits under a floating panel after fit`);
  }

  for (const i of document.querySelectorAll('svg.icon'))
    if (shown(i) && i.getBoundingClientRect().width < 2)
      out.push('icons: an icon renders blank while visible (nested viewBox?)');

  /* Only content that actually spills counts. `overflow: hidden` with an
     ellipsis is the author truncating on purpose, and `auto` scrolls; flagging
     those reports a correct panel as broken. */
  for (const e of document.querySelectorAll('.hud *'))
    if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible')
      out.push(`layout: ${e.tagName.toLowerCase()}`
        + `${(e.className.baseVal ?? e.className ?? '').toString().trim()
             ? '.' + (e.className.baseVal ?? e.className).toString().trim().split(/\s+/)[0] : ''}`
        + ` overflows its panel by ${e.scrollWidth - e.clientWidth}px`);

  const loaded = [...document.fonts].filter(f => f.status === 'loaded').length;
  if (loaded < 1) out.push('tokens: no web font loaded');

  if (getComputedStyle(document.body).getPropertyValue('background-color') === 'rgba(0, 0, 0, 0)')
    out.push('tokens: body has no token-backed background');

  for (const s of document.querySelectorAll('.scroll, .tree'))
    if (getComputedStyle(s).scrollbarGutter !== 'stable')
      out.push('layout: a scroll container has no stable gutter; arriving scrollbars will reflow it');

  return [...new Set(out)];
}

const browser = await chromium.launch({ executablePath: EXE });
let failures = 0, runs = 0;
for (const file of targets) {
  const name = file.replace(/.*\/([^/]+)\/index\.html$/, '$1');
  for (const [w, h, size] of WIDTHS) {
    for (const theme of THEMES) {
      const ctx = await browser.newContext({ viewport: {width: w, height: h}, colorScheme: theme });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push('script: ' + e.message));
      page.on('requestfailed', r => errs.push('assets: failed request ' + r.url().split('/').pop()));
      page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 90)); });
      await page.goto('file://' + file);
      await page.waitForTimeout(1500);
      const atRest = await page.evaluate(audit);

      /* The laws must also hold in motion. Loading a page proves almost
         nothing: a handler that throws on the first click looks perfectly
         healthy at rest. So pick an object, press Escape, pan, and re-check. */
      const objSel = await page.evaluate(() =>
        (document.querySelector('svg.stage') || {}).dataset?.objects || null);
      if (objSel) {
        const first = await page.$(objSel);
        if (first) {
          const box = await first.boundingBox();
          if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + Math.min(10, box.height / 2));
            await page.waitForTimeout(500);
          }
        }
      }
      await page.keyboard.press('Escape');
      await page.mouse.move(700, 500);
      await page.mouse.down();
      await page.mouse.move(640, 460, {steps: 5});
      await page.mouse.up();
      await page.waitForTimeout(400);
      for (const sel of ['#fit', '#zoom-in', '#zoom-out']) {
        const btn = await page.$(sel);
        if (btn) { await btn.click(); await page.waitForTimeout(350); }
      }
      /* Re-fit before auditing. "Nothing sits under a panel" is a claim about
         the fitted view; zooming about the viewport centre legitimately moves
         objects anywhere, and auditing there would fail a correct app. */
      const fitBtn = await page.$('#fit');
      if (fitBtn) { await fitBtn.click(); }
      await page.waitForTimeout(1300);

      const afterUse = await page.evaluate(audit);

      /* Enlarging the text layer grows the panels, which is exactly when they
         start covering the scene. The laws must hold at any text size. */
      await page.evaluate(() => document.documentElement.style.setProperty('--ui-scale', '1.5'));
      const refit = await page.$('#fit');
      if (refit) await refit.click();
      await page.waitForTimeout(1300);
      /* Depth and the modal are surfaces of their own: enter one, open the
         other, and assert the laws there too. */
      const extra = [];
      const objSel2 = await page.evaluate(() =>
        (document.querySelector('svg.stage') || {}).dataset?.objects || null);
      if (objSel2) {
        const first = await page.$(objSel2);
        const box = first && await first.boundingBox();
        if (box) {
          await page.mouse.dblclick(box.x + box.width - 24, box.y + box.height - 14);
          await page.waitForTimeout(1900);
          if (await page.evaluate(() => document.querySelector('svg.stage').dataset.depth !== '0')) {
            extra.push(...(await page.evaluate(audit)).map(v => v + '  [inside a nested stage]'));
            await page.keyboard.press('Escape');
            await page.waitForTimeout(1400);
          }
        }
      }
      const expandBtn = await page.$('.hud[data-expandable] .expand');
      if (expandBtn) {
        await expandBtn.click();
        await page.waitForTimeout(700);
        extra.push(...(await page.evaluate(audit)).map(v => v + '  [with the reader open]'));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }

      /* Those passes move the camera (a double-click frames when there is no
         interior). Re-fit before the final audit: the law is about the fitted
         view, not about wherever the last gesture left it. */
      const finalFit = await page.$('#fit');
      if (finalFit) { await finalFit.click(); await page.waitForTimeout(1300); }

      const uiNow = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim());
      const large = (await page.evaluate(audit)).map(v => `${v}  [at ${Math.round(uiNow * 100)}% text]`);

      const violations = [...new Set([...errs, ...atRest, ...afterUse, ...extra, ...large])];
      runs++;
      if (violations.length) {
        failures++;
        console.log(`\n✗ ${name}  ${size} ${theme}`);
        for (const v of violations) console.log('    ' + v);
      }
      await ctx.close();
    }
  }
}
await browser.close();
console.log(failures
  ? `\n${failures} of ${runs} configurations violate the laws`
  : `\nall ${runs} configurations hold`);
process.exit(failures ? 1 : 0);
