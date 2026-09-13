#!/usr/bin/env node
/* The laws, as executable assertions.
 *
 *   node check/verify.mjs <dir-or-html> [...]
 *
 * Every app built on the kit must pass these at every window size and in both
 * themes. They are deliberately app-agnostic: the stage reports what counts as
 * an object via data-objects, and nothing else here knows the subject. */
import { launchBrowser } from './browser.mjs';
import { existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

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

/* Runs inside the page. Returns a list of violations, each naming the law. */
function audit(){
  const out = [];
  const doc = document.documentElement;
  const shown = e => { let n = e; while (n) { if (getComputedStyle(n).display === 'none') return false;
                                              n = n.parentElement; } return true; };

  if (doc.scrollHeight > innerHeight + 1 || doc.scrollWidth > innerWidth + 1)
    out.push('shell: the page scrolls; the stage must fill the window and only panels may scroll');

  /* Law 3: a panel is the reading surface. Whatever the app called it, its text
     can be selected and copied — the view palette is the one exception. */
  for (const panel of document.querySelectorAll('.hud:not(.tools)')) {
    if (!shown(panel)) continue;
    const target = panel.querySelector('[data-nav-body], .scroll, .tree, .list') || panel;
    if (getComputedStyle(target).userSelect === 'none')
      out.push(`shell: text in .${[...panel.classList].join('.')} cannot be selected; panels are for reading`);
  }

  /* The stage's own container must not scroll either. A palette wider than the
     window makes it scrollable without a scrollbar, and then focusing a control
     slides the whole app sideways under the scene. */
  const appEl = document.querySelector('.app');
  if (appEl) {
    if (appEl.scrollWidth > appEl.clientWidth + 1 || appEl.scrollHeight > appEl.clientHeight + 1)
      out.push('shell: some chrome is larger than the window; the app container can scroll');
    if (appEl.scrollLeft || appEl.scrollTop)
      out.push('shell: the app container has been scrolled away from the origin');
  }

  const svg = document.querySelector('svg.stage');
  if (!svg) out.push('shell: no element with class "stage"');

  const panels = [...document.querySelectorAll('.hud:not(.modal):not([data-transient])')]
    .filter(e => getComputedStyle(e).display !== 'none')
    .map(e => e.getBoundingClientRect());
  const objSel = svg && svg.dataset.objects;
  if (svg && objSel) {
    const indexed = [...document.querySelectorAll('[data-nav] [data-stage-object]')];
    const controls = [...svg.parentElement.querySelectorAll('.stage-entrances .enter-control')];
    for (const node of svg.querySelectorAll(objSel)) {
      if (!shown(node) || node.dataset.enterable !== 'true') continue;
      if (controls.filter(b => b.orreryObject === node).length !== 1)
        out.push('depth: an enterable object needs exactly one shared stage Enter control');
      if (document.querySelector('[data-nav]') && !indexed.some(row =>
          row.orreryObject === node && row.querySelector('.enter-control')))
        out.push('depth: an enterable object has no matching Enter action in the index; use ctx.bind(row, node)');
    }
  }
  for (const button of document.querySelectorAll('.enter-control')) {
    const label = button.querySelector('span');
    if (!button.querySelector('svg.icon') || !label)
      out.push('depth: use the shared door-and-label Enter control');
    else if (!button.matches(':hover, :focus-visible') && getComputedStyle(label).maxWidth !== '0px')
      out.push('depth: Enter labels must be hidden until hover or keyboard focus');
  }
  const current = svg?.querySelector('[data-stage-live]');
  const navHost = document.querySelector('[data-nav-body], [data-nav] .tree, [data-nav] .scroll, [data-nav] .list');
  if (current && navHost && !navHost.inert) {
    const nodes = objSel ? [...current.querySelectorAll(objSel)] : [];
    const rows = [...navHost.querySelectorAll('[data-stage-object]')];
    if (nodes.some(node => rows.filter(row => row.orreryObject === node).length !== 1))
      out.push('depth: each stage object needs exactly one bound index row');
    for (const row of rows) {
      if (!nodes.includes(row.orreryObject)) {
        out.push('depth: the index contains an object outside the current stage'); continue;
      }
      let depth = 0;
      for (let p=row.orreryObject.parentElement; p && p!==current; p=p.parentElement)
        if (p.matches(objSel)) depth++;
      if (Number(row.dataset.indexDepth) !== depth)
        out.push('depth: index indentation disagrees with stage ancestry');
    }
    /* An entry action must come from a bound row, or it is acting on an object
       the stage has not agreed it is acting on. Other controls in the index are
       not an error: a navigator may carry layer visibility, sub-headings or a
       chapter list beside its object rows, and forbidding those would forbid
       the outliner this kit was modelled on. */
    if ([...navHost.querySelectorAll('.enter-control')].some(n => !n.closest('[data-stage-object]')))
      out.push('depth: an Enter action in the index is not bound to a stage object; use ctx.bind(row, node)');
  }
  const objects = objSel ? [...document.querySelectorAll(objSel)] : [];
  const labels = [...document.querySelectorAll('#content text')];
  for (const n of [...objects, ...labels]) {
    const b = n.getBoundingClientRect();
    if (!b.width) continue;
    if (panels.some(p => b.left < p.right && b.right > p.left && b.top < p.bottom && b.bottom > p.top))
      out.push(`viewport: ${n.id || n.textContent.slice(0, 18)} sits under a floating panel after fit`);
  }

  /* One hierarchy, one order. The index lists a level's objects in an order, and
     the stage has to offer that order. A space offers one of two readings — by
     row (top to bottom, left to right) or by column — and which one a reader
     takes is decided by the gaps: proximity groups whatever is nearest, so the
     gap within a group must be smaller than the gap between groups.

     So this fails when the index matches neither reading, and when it matches the
     one the gaps do not favour. It deliberately does not fail where the gaps are
     close enough to make both readings available and the index matches one of
     them: that is a subtlety for the author, not a contradiction to report.
     Compared by identity, not by text — the row labels are the app's. */
  if (current && objSel && navHost) {
    const id = n => n.dataset.objectId || n.id || '';
    const listed = [...navHost.querySelectorAll('[data-stage-object]')]
      .filter(row => row.orreryObject && current.contains(row.orreryObject)).map(row => id(row.orreryObject));
    const drawn = [...current.querySelectorAll(objSel)].filter(shown)
      .map(node => ({id: id(node), box: node.getBoundingClientRect()}))
      .filter(o => listed.includes(o.id));
    if (drawn.length > 1) {
      const idx = listed.filter(v => drawn.some(o => o.id === v));
      const byRow = [...drawn].sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left).map(o => o.id);
      const byCol = [...drawn].sort((a, b) => a.box.left - b.box.left || a.box.top - b.box.top).map(o => o.id);
      const same = (a, b) => a.join('|') === b.join('|');
      const tops = [...new Set(drawn.map(o => Math.round(o.box.top)))].sort((a, b) => a - b);
      const lefts = [...new Set(drawn.map(o => Math.round(o.box.left)))].sort((a, b) => a - b);
      // Rows and columns only mean anything on a layout that has them. A free-form
      // drawing — a network diagram, a floor plan — is one object per row and per
      // column, and the gap between "the first two lefts" is then a gap between two
      // objects that merely happen to be leftmost of each.
      const gridLike = tops.length * lefts.length <= drawn.length + 2;
      if (!same(idx, byRow) && !same(idx, byCol))
        out.push('order: the index lists the level in an order the stage does not offer');
      else if (gridLike && !same(byRow, byCol)) {
        // Only where the two readings differ can the gaps pick the wrong one: where
        // they agree the space offers a single order and the index either matches
        // it or is reported above. And only where the gaps decide it: 20 pixels
        // between columns against 19 between rows is one layout, not two, and a
        // rule that reports a rounding difference is a rule authors learn to
        // ignore. 1.5 is chosen for legibility, not measured.
        const firstAt = v => drawn.find(o => Math.round(v === 'top' ? o.box.top : o.box.left) === (v === 'top' ? tops[0] : lefts[0]));
        const hGap = lefts.length > 1 ? lefts[1] - firstAt('left').box.right : null;
        const vGap = tops.length > 1 ? tops[1] - firstAt('top').box.bottom : null;
        const decisive = hGap > 0 && vGap > 0 &&
          Math.max(hGap, vGap) >= Math.min(hGap, vGap) * 1.5;
        if (decisive && same(idx, byRow) && hGap > vGap)
          out.push('order: the stage groups by column while the index reads by row');
        else if (decisive && same(idx, byCol) && vGap > hGap)
          out.push('order: the stage groups by row while the index reads by column');
      }
    }
  }

  /* Anything an app draws on the stage that is not part of an object is painted
     where the app put it in the document — usually under the objects. A label
     wider than the gap it sits in is then simply covered: nothing errors, and
     the reader sees half a word. Text belonging to a level is not chrome: a
     level's own labels travel with its objects, so anything under an ancestor
     that holds objects outside the live level is that level's business. */
  if (current && objSel) {
    const shapes = [...current.querySelectorAll(objSel)].filter(shown)
      .map(node => ({node, box: node.getBoundingClientRect()}));
    const inLevel = el => {
      for (let p = el.parentElement; p && p !== svg; p = p.parentElement)
        if ([...p.querySelectorAll(objSel)].some(n => !current.contains(n))) return true;
      return false;
    };
    for (const t of svg.querySelectorAll('text')) {
      if (t.closest(objSel) || t.closest('[data-stage-live]') || inLevel(t)) continue;
      const b = t.getBoundingClientRect();
      if (!b.width) continue;
      const covered = shapes.some(s =>
        (s.node.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_PRECEDING) !== 0 &&
        b.left < s.box.right && b.right > s.box.left && b.top < s.box.bottom && b.bottom > s.box.top);
      if (covered)
        out.push(`order: "${t.textContent.trim().slice(0, 18)}" is drawn outside the objects but painted under one`);
    }
  }

  /* One bar, assembled one way. Padding exceptions on the first and last cell
     are what made it look like three bars stuck together. */
  const bar = document.querySelector('.status');
  if (bar) {
    const pads = new Set([...bar.querySelectorAll('.cell')].map(c => {
      const cs = getComputedStyle(c);
      return cs.paddingLeft + '/' + cs.paddingRight + '/' + cs.marginLeft;
    }));
    if (pads.size > 1)
      out.push('status: the cells are not built alike (' + [...pads].join('  ') + ')');
    if (/double-click|swipe to pan|pinch to zoom|drag to pan/i.test(bar.textContent))
      out.push('status: interaction guidance sits in the status bar; it belongs behind the help control');
  }

  /* An icon in the chrome is drawn at a fixed size and must be legible. One in
     the scene is the camera's business: zoomed far out it is legitimately
     sub-pixel, and only an icon with no box at all is broken. */
  for (const i of document.querySelectorAll('svg.icon')) {
    if (!shown(i)) continue;
    const inScene = !!i.closest('#content, svg.stage');
    const w = i.getBoundingClientRect().width;
    if (inScene ? w === 0 : w < 2)
      out.push('icons: an icon renders blank while visible (nested viewBox?)');
  }

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
        if (btn) { await btn.click(); await page.waitForTimeout(350); }
        if (sel === '#zoom-in') samples.push(await readouts());
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
        if (f0) { await f0.click(); await page.waitForTimeout(1300); }
        await helpBtn.click();
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
          const t = tools && tools.getBoundingClientRect();
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
        if (f) { await f.click(); await page.waitForTimeout(1300); }
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
