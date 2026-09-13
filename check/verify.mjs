#!/usr/bin/env node
/* The laws, as executable assertions.
 *
 *   node check/verify.mjs <dir-or-html> [...]
 *
 * Every app built on the kit must pass these at every window size and in both
 * themes. They are deliberately app-agnostic: the stage reports what counts as
 * an object via data-objects, and nothing else here knows the subject. */
import { launchBrowser } from './browser.mjs';
import { clickControl } from './controls.mjs';
import { existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
/* The laws themselves. Runs inside the page; returns one string per violation. */
import { audit } from './laws.mjs';

const WIDTHS = [[1440, 900, 'wide'], [1180, 760, 'mid'], [400, 780, 'narrow']];
const THEMES = ['light', 'dark'];

const targets = process.argv.slice(2).map(a => {
  const p = resolve(a);
  return existsSync(p) && statSync(p).isDirectory() ? join(p, 'index.html') : p;
});
if (!targets.length) {
  console.error('usage: verify.mjs <dir-or-html> [...]');
  process.exit(2);
}

/* The navigator's contents, as a signature: what the index listed, and where
   the breadcrumb said we were. */
function navSign(){
  const nav = document.querySelector('[data-nav]');
  if (!nav) return null;
  const body = nav.querySelector('[data-nav-body]') || nav.querySelector('.tree, .scroll, .list') || nav;
  return {rows: body.textContent.trim().slice(0, 400)};
}

/* Runs inside the page, one level down. */
function depthAudit(before){
  const out = [];
  const nav = document.querySelector('[data-nav]');
  if (!nav) return out;                      // an app with no navigator is flat
  const body = nav.querySelector('[data-nav-body]') || nav.querySelector('.tree, .scroll, .list') || nav;
  const now = {rows: body.textContent.trim().slice(0, 400)};
  if (before && now.rows === before.rows)
    out.push('depth: the navigator still lists the level above; an index must follow the level');

  /* Where you are is a fact about the app, so it lives in chrome that is
     always on screen — never inside a panel that can be collapsed or hidden. */
  const crumb = document.querySelector('.titlebar .path');
  if (!crumb) out.push('depth: no path is stated anywhere');
  else {
    if (crumb.closest('.hud') || crumb.closest('.status'))
      out.push('depth: the path is inside a panel or the status bar; it belongs in the title');
    if (!crumb.getBoundingClientRect().width)
      out.push('depth: the path is not on screen');
    if (crumb.querySelectorAll('.sep').length < 1)
      out.push('depth: the path does not name the level above');
    if (!crumb.querySelectorAll('button.step').length)
      out.push('depth: no path step can be returned to');
  }
  const back = document.getElementById('stage-back');
  const navShown = getComputedStyle(nav).display !== 'none';
  if (!back || back.hidden || !back.getBoundingClientRect().width)
    out.push('depth: no Back control while inside a level');
  else if (navShown && !nav.contains(back))
    out.push('depth: Back is not beside the index it returns you to');
  else if (!navShown && nav.contains(back))
    out.push('depth: the only way out of a level is behind a panel toggle');

  /* Picking must mark, at every depth. */
  const svg = document.querySelector('svg.stage');
  const sel = svg && svg.dataset.objects;
  const objs = sel ? [...document.querySelectorAll(sel)] : [];
  if (!objs.length)
    out.push('depth: this level reports no pickable objects');
  return out;
}

/* A point that is really inside the object.

   Taking one from the bounding box assumes the object fills it. It does not: a
   rounded corner is outside the shape, a label pushes the box past the drawing,
   and the top strip may be empty. Every time the harness has assumed, it has
   reported a correct app as broken — or worse, silently done nothing and then
   complained that nothing happened. So hit-test for the point. */
async function hitPoint(page, sel, avoidText = false){
  return page.evaluate(([s, noText]) => {
    // Any object will do — the claim under test is "clicking an object works",
    // not "clicking this particular one". The first is often partly off screen
    // or behind a panel, which is not the app being wrong.
    for (const target of document.querySelectorAll(s)) {
      const b = target.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      for (let fy = 0.1; fy < 0.95; fy += 0.05)
        for (let fx = 0.1; fx < 0.95; fx += 0.05) {
          const x = b.x + b.width * fx, y = b.y + b.height * fy;
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
          const at = document.elementFromPoint(x, y);
          if (!at || !at.closest) continue;
          if (noText && at.tagName === 'text') continue;
          if (at.closest(s) === target) return {x, y};
        }
    }
    return null;
  }, [sel, avoidText]);
}

const browser = await launchBrowser();
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

      /* A readout with a reserved width is an author saying "this varies".
         One that never varies is dead chrome: ssh-arch carried `x 0  y 0` for
         weeks, reserving 13 characters for a pointer position nothing ever
         wrote. It looks exactly like a working readout reporting zero. */
      const readouts = () => page.evaluate(() => {
        const bar = document.querySelector('.status');
        const out = {};
        if (!bar) return out;
        for (const e of bar.querySelectorAll('[id]')) {
          const mw = getComputedStyle(e).minWidth;
          if (mw && mw !== 'auto' && parseFloat(mw) > 0) out[e.id] = e.textContent.trim();
        }
        return out;
      });
      const samples = [await readouts()];
      // Text size is now a status readout too. Exercise its real control before
      // judging whether the reserved value changes; camera gestures cannot.
      const smaller = await page.$('#text-down');
      const resetText = await page.$('#text-size');
      if (smaller && resetText) {
        await clickControl(page, smaller);
        samples.push(await readouts());
        await clickControl(page, resetText);
      }

      /* The laws must also hold in motion. Loading a page proves almost
         nothing: a handler that throws on the first click looks perfectly
         healthy at rest. So pick an object, press Escape, pan, and re-check. */
      const objSel = await page.evaluate(() =>
        (document.querySelector('svg.stage') || {}).dataset?.objects || null);
      /* A stage may legitimately have no objects in its opening scene — the
         simulator's timeline draws its hit targets only in one mode. "None
         exist" is not "none can be clicked". */
      const anyObjects = objSel && await page.evaluate(
        s => document.querySelectorAll(s).length, objSel);
      if (objSel && anyObjects) {
        const at = await hitPoint(page, objSel);
        if (!at) errs.push('picking: objects are drawn but none is reachable by a click');
        else {
          const before = await page.evaluate(() =>
            (document.getElementById('st-sel') || {}).textContent || null);
          await page.mouse.click(at.x, at.y);
          await page.waitForTimeout(500);
          samples.push(await readouts());
          const after = await page.evaluate(() =>
            (document.getElementById('st-sel') || {}).textContent || null);
          if (before !== null && before === after)
            errs.push('picking: clicking an object did not change what the app says is selected');
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
        if (btn) { await clickControl(page, btn); await page.waitForTimeout(350); }
        if (sel === '#zoom-in') samples.push(await readouts());
      }
      /* Re-fit before auditing. "Nothing sits under a panel" is a claim about
         the fitted view; zooming about the viewport centre legitimately moves
         objects anywhere, and auditing there would fail a correct app. */
      const fitBtn = await page.$('#fit');
      if (fitBtn) { await clickControl(page, fitBtn); }
      await page.waitForTimeout(1300);

      const afterUse = await page.evaluate(audit);

      /* Enlarging the text layer grows the panels, which is exactly when they
         start covering the scene. The laws must hold at any text size. */
      await page.evaluate(() => document.documentElement.style.setProperty('--ui-scale', '1.5'));
      const refit = await page.$('#fit');
      if (refit) await clickControl(page, refit);
      await page.waitForTimeout(1300);
      /* Depth and the modal are surfaces of their own: enter one, open the
         other, and assert the laws there too. */
      const extra = [];
      const objSel2 = await page.evaluate(() =>
        (document.querySelector('svg.stage') || {}).dataset?.objects || null);
      if (objSel2) {
        const at2 = await hitPoint(page, objSel2, true);
        if (at2) {
          const navBefore = await page.evaluate(navSign);
          await page.mouse.dblclick(at2.x, at2.y);
          await page.waitForTimeout(1900);
          if (await page.evaluate(() => document.querySelector('svg.stage').dataset.depth !== '0')) {
            extra.push(...(await page.evaluate(audit)).map(v => v + '  [inside a nested stage]'));
            /* A level is not a different app. Whatever works at the top must
               work here: the navigator lists this level, the way out is named,
               and picking an object marks it. */
            extra.push(...(await page.evaluate(depthAudit, navBefore)));
            await page.keyboard.press('Escape');
            await page.waitForTimeout(1400);
          }
        }
      }
      /* A reading panel has two sizes beyond its own, and both belong to it.
         Widening keeps it beside the scene, so the scene must re-fit into what
         is left — the laws hold at the wider width too. */
      const widenBtn = await page.$('.hud[data-expandable] .widen');
      if (await page.$('.hud[data-expandable]')) {
        const controls = await page.evaluate(() => {
          const o = [];
          for (const panel of document.querySelectorAll('.hud[data-expandable]')) {
            if (!panel.querySelector('.widen')) o.push('panels: a reading panel cannot be widened');
            if (!panel.querySelector('.expand')) o.push('panels: a reading panel cannot take the surface');
          }
          return o;
        });
        extra.push(...controls);
      }
      if (widenBtn && await widenBtn.isVisible()) {
        const w0 = await page.evaluate(() =>
          Math.round(document.querySelector('.hud[data-expandable]').getBoundingClientRect().width));
        await widenBtn.click();
        await page.waitForTimeout(1400);
        const w1 = await page.evaluate(() => {
          const r = document.querySelector('.hud[data-expandable]').getBoundingClientRect();
          return {w: Math.round(r.width), on: r.left >= -1 && r.right <= innerWidth + 1};
        });
        if (w1.w <= w0) extra.push('panels: the widen control does not widen the panel');
        if (!w1.on) extra.push('panels: the widened panel leaves the window');
        extra.push(...(await page.evaluate(audit)).map(v => v + '  [with the panel widened]'));
        await widenBtn.click();
        await page.waitForTimeout(1400);
        const w2 = await page.evaluate(() =>
          Math.round(document.querySelector('.hud[data-expandable]').getBoundingClientRect().width));
        if (w2 !== w0) extra.push('panels: the panel does not return to its width');
      }

      /* Guidance is behind a control now, so the control must work: it opens
         a sheet that is on screen, legible, and dismissed by Escape. */
      const helpBtn = await page.$('#help-toggle');
      if (helpBtn) {
        const f0 = await page.$('#fit');
        if (f0) { await clickControl(page, f0); await page.waitForTimeout(1300); }
        await clickControl(page, helpBtn);
        await page.waitForTimeout(400);
        extra.push(...(await page.evaluate(() => {
          const o = [];
          const h = document.getElementById('help');
          if (!h || h.hidden) { o.push('help: the control does not open anything'); return o; }
          const r = h.getBoundingClientRect();
          if (r.width < 120 || r.height < 80) o.push('help: the sheet has no room to be read');
          if (r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)
            o.push('help: the sheet is partly off screen');
          const tools = document.querySelector('.tools');
          const t = tools && (tools.closest('.status') || tools).getBoundingClientRect();
          if (t && r.bottom > t.top + 1) o.push('help: the sheet covers the palette it opens from');
          if (!h.querySelector('.now') || !h.querySelector('.gestures dt'))
            o.push('help: the sheet says nothing');
          return o;
        })));
        extra.push(...(await page.evaluate(audit)).map(v => v + '  [with help open]'));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        if (!(await page.evaluate(() => document.getElementById('help').hidden)))
          extra.push('help: Escape does not dismiss the sheet');
      }

      const expandBtn = await page.$('.hud[data-expandable] .expand');
      if (expandBtn) {
        // the pass above may have framed something; audit the fitted view
        const f = await page.$('#fit');
        if (f) { await clickControl(page, f); await page.waitForTimeout(1300); }
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
      if (finalFit) { await clickControl(page, finalFit); await page.waitForTimeout(1300); }

      const uiNow = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim());
      const large = (await page.evaluate(audit)).map(v => `${v}  [at ${Math.round(uiNow * 100)}% text]`);

      samples.push(await readouts());
      const dead = Object.keys(samples[0]).filter(id =>
        samples.every(s => s[id] === samples[0][id]))
        .map(id => `status: #${id} reserves width for a value that never changes; wire it or drop it`);

      const violations = [...new Set([...errs, ...atRest, ...afterUse, ...extra, ...large, ...dead])];
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
