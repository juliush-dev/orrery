/* The laws, as one function, run inside the page.
 *
 * It lives apart from the runner so a focused check can load a document, break
 * one law in the DOM and ask the same code what it sees — the rules a document
 * must pass and the rules about those rules are then the same text.
 *
 * Nothing here may close over module scope: it is serialised into the page by
 * page.evaluate. It knows what counts as an object only from data-objects. */
export function audit(){
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
    // Measured on the object's face where it declares one. An object's group is
    // its drawn geometry, and a heading or a caption inside it moves the group's
    // top — which would sort that object into a row it is not in and report a
    // contradiction the reader cannot see. Same box the mark pins to.
    const faceBox = node => {
      const face = [...node.querySelectorAll('[data-face]')].find(f => f.closest(objSel) === node);
      return (face || node).getBoundingClientRect();
    };
    const drawn = [...current.querySelectorAll(objSel)].filter(shown)
      .map(node => ({id: id(node), box: faceBox(node)}))
      .filter(o => listed.includes(o.id));
    if (drawn.length > 1) {
      const idx = listed.filter(v => drawn.some(o => o.id === v));
      // Rounded in the sort as well as in the row and column sets: two objects
      // placed in one row can differ by a subpixel, and an unrounded sort then
      // orders them by top instead of by left.
      const r = v => Math.round(v);
      const byRow = [...drawn].sort((a, b) => r(a.box.top) - r(b.box.top) || r(a.box.left) - r(b.box.left)).map(o => o.id);
      const byCol = [...drawn].sort((a, b) => r(a.box.left) - r(b.box.left) || r(a.box.top) - r(b.box.top)).map(o => o.id);
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
      // Overlapping an object's bounds is not being hidden by it. An object that
      // paints nothing where the label sits — an outline, a hit area, a group
      // whose shape is elsewhere — leaves the label perfectly readable, and a
      // rule that reports it teaches authors to ignore the rule.
      const paints = (node, box) => [node, ...node.querySelectorAll('*')].some(sh => {
        if (!/^(rect|circle|ellipse|path|polygon|polyline|image|use)$/.test(sh.tagName)) return false;
        const cs = getComputedStyle(sh);
        if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) return false;
        if (sh.tagName !== 'image' && sh.tagName !== 'use') {
          if (cs.fill === 'none') return false;
          const rgba = cs.fill.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);
          if (rgba && parseFloat(rgba[1]) < 0.5) return false;
        }
        const r = sh.getBoundingClientRect();
        return box.left < r.right && box.right > r.left && box.top < r.bottom && box.bottom > r.top;
      });
      const covered = shapes.some(s =>
        (s.node.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_PRECEDING) !== 0 &&
        b.left < s.box.right && b.right > s.box.left && b.top < s.box.bottom && b.bottom > s.box.top &&
        paints(s.node, b));
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
