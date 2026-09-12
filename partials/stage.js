/* ---------------------------------------------------------------------------
   The stage: one pannable, zoomable surface and everything that makes it
   behave. This is the part every app used to retype — about 120 lines that
   were 90% identical between them, and where the same traps kept recurring.

   Requires motion.js (flyView, cancelFly, clearTextSelection, wheelNavigation).

   createStage({svg, content, objects, onPick, ...}) -> controller
   --------------------------------------------------------------------------- */
function createStage(opts){
  const svg = opts.svg, content = opts.content;
  let PICK = opts.objects || null;                // selector for pickable objects
  const onPick = opts.onPick || (() => {});
  const GAP = opts.panelGap == null ? 16 : opts.panelGap;
  const EDGE = opts.edgePad == null ? 18 : opts.edgePad;

  let view = {x:0, y:0, w:1200, h:700};
  const getView = () => view;
  const setView = v => { view = v; apply(); };

  function apply(){
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    const m = svg.getScreenCTM();
    if (!m) return;
    const pct = Math.round(m.a * 100);
    const out = document.getElementById('st-zoom');
    if (out) out.textContent = 'zoom ' + pct + '%';
    if (opts.lodBelow) svg.classList.toggle(opts.lodClass || 'far', m.a < opts.lodBelow);
    if (opts.onZoom) opts.onZoom(m.a);
  }

  /* Floating panels cover part of the stage, so "fit" must target the part they
     are not covering — otherwise the scene is centred underneath them. Panels
     are classified by the edge they are docked to and by how much of the stage
     they span: a tall narrow one holds a side, a wide short one holds top or
     bottom, a small corner palette holds nothing, and a sheet that covers most
     of the stage is a modal and is ignored. */
  function insets(){
    if (opts.insets) return opts.insets();
    const r = svg.getBoundingClientRect();
    let L = EDGE, R = EDGE, T = EDGE, B = EDGE;
    for (const el of document.querySelectorAll(opts.panels || '.hud')) {
      if (getComputedStyle(el).display === 'none') continue;
      const p = el.getBoundingClientRect();
      if (!p.width || !p.height) continue;
      // Classify by the edges a panel is anchored to, never by its height: a
      // side panel is short when its content is short, and would then reserve
      // nothing until it grew and covered the scene.
      const wide = p.width > r.width * 0.45;
      const tall = p.height > r.height * 0.5;
      const gL = p.left - r.left, gR = r.right - p.right;
      const gT = p.top - r.top,  gB = r.bottom - p.bottom;
      const nearL = gL < 48, nearR = gR < 48, nearT = gT < 48;
      const lowish = gB < r.height * 0.25;
      let side = null;
      if (wide && tall) side = null;                        // a modal sheet
      // Anything docked to the bottom reserves its height, however narrow. A
      // corner palette that reserves nothing lets content slide underneath it,
      // which only shows up once the palette grows — at a larger text size, or
      // in an app with one more button in it.
      else if (lowish && !nearT) side = 'B';
      else if (nearT && nearL && !nearR) side = 'L';
      else if (nearT && nearR && !nearL) side = 'R';
      else if (nearT && wide) side = 'T';
      if (side === 'L') L = Math.max(L, p.right - r.left + GAP);
      else if (side === 'R') R = Math.max(R, r.right - p.left + GAP);
      else if (side === 'T') T = Math.max(T, p.bottom - r.top + GAP);
      else if (side === 'B') B = Math.max(B, r.bottom - p.top + GAP);
    }
    return {L, R, T, B, w:r.width, h:r.height};
  }

  function framedView(b, pad, maxScale){
    if (!b || !b.width) return;
    const i = insets();
    const availW = Math.max(120, i.w - i.L - i.R);
    const availH = Math.max(120, i.h - i.T - i.B);
    const s = Math.min(availW / (b.width + (pad || 0)), availH / (b.height + (pad || 0)),
                       maxScale || Infinity);
    const target = {w: i.w / s, h: i.h / s};
    target.x = b.x + b.width / 2 - (i.L + availW / 2) / s;
    target.y = b.y + b.height / 2 - (i.T + availH / 2) / s;
    return target;
  }
  function frameBox(b, pad, maxScale){
    finishDepth();
    const target = framedView(b, pad, maxScale);
    if (target) flyView(svg, getView, setView, target);
  }
  const fit = () => { finishDepth(); fitTo(live); };
  const frame = (el, o) => {
    if (!el) return;
    const c = o || {};
    frameBox(el.getBBox(), c.pad == null ? (opts.framePad == null ? 200 : opts.framePad) : c.pad,
             c.maxScale == null ? (opts.frameMaxScale == null ? 1 : opts.frameMaxScale) : c.maxScale);
  };

  const toWorld = (cx, cy) => {
    const m = svg.getScreenCTM();
    if (!m) return {x:0, y:0};
    const p = svg.createSVGPoint(); p.x = cx; p.y = cy;
    return p.matrixTransform(m.inverse());
  };
  function zoomAt(cx, cy, k){
    finishDepth();
    const p = toWorld(cx, cy);
    view.w *= k; view.h *= k;
    view.x = p.x - (p.x - view.x) * k;
    view.y = p.y - (p.y - view.y) * k;
    apply();
  }
  function zoomStep(k){
    finishDepth();
    const r = svg.getBoundingClientRect();
    const p = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    flyView(svg, getView, setView,
      {w:view.w * k, h:view.h * k,
       x:p.x - (p.x - view.x) * k, y:p.y - (p.y - view.y) * k});
  }

  svg.addEventListener('wheel', () => finishDepth(), {capture:true, passive:true});
  wheelNavigation(svg, getView, setView, zoomAt);

  /* --- pointer: pan, pinch, pick, and standing aside for text ------------- */
  let drag = null, pinch = null;
  const pts = new Map();
  const pinchState = () => {
    const [a, b] = [...pts.values()];
    return {d:Math.hypot(a.x - b.x, a.y - b.y), cx:(a.x + b.x) / 2, cy:(a.y + b.y) / 2};
  };
  const pickFrom = t => (PICK && t && t.closest) ? t.closest(PICK) : null;

  svg.addEventListener('pointerdown', e => {
    finishDepth();
    cancelFly();
    clearTextSelection();
    pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (pts.size === 2) { pinch = pinchState(); drag = null; svg.classList.remove('dragging'); return; }
    if (e.button !== 0) return;
    if (e.target && e.target.tagName === 'text') {
      // Over a label: the browser owns this drag. Capturing would steal it.
      drag = {textMode:true, moved:false, x:e.clientX, y:e.clientY, hit:pickFrom(e.target)};
      return;
    }
    drag = {x:e.clientX, y:e.clientY, vx:view.x, vy:view.y, moved:false, hit:pickFrom(e.target)};
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('dragging');
  });
  svg.addEventListener('pointermove', e => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (drag && drag.textMode) {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true;
      return;
    }
    if (pts.size === 2 && pinch) {
      const now = pinchState();
      if (now.d > 0) zoomAt(now.cx, now.cy, pinch.d / now.d);
      pinch = now;
      return;
    }
    if (!drag) return;
    const m = svg.getScreenCTM();
    if (!m) return;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true;
    view.x = drag.vx - (e.clientX - drag.x) / m.a;
    view.y = drag.vy - (e.clientY - drag.y) / m.d;
    apply();
  });
  const end = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (drag) {
      svg.classList.remove('dragging');
      try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
      if (!drag.moved) { markPick(drag.hit || null); onPick(drag.hit || null, {dbl:false}); }
    }
    drag = null;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  /* --- depth: a stage can hold another stage ----------------------------
     Every subject worth drawing is hierarchical — a machine holds services, a
     document holds sections, a call holds a turn. One flat stage forces you to
     pick a level and flatten the rest. Entering pushes a level with its own
     content, its own camera, its own pickable objects and its own index;
     leaving restores all four. A level that kept the level above it in any of
     those reads as a different app the moment you go inside something. */
  const levels = [];              // back.map embeds the interior in its parent object
  const rootContent = content;
  let live = content;                                  // the group drawn into now
  let depthFinish = null;
  function finishDepth(){ if (depthFinish) depthFinish(); }

  const mapView = (v, m) => ({x:m.x + v.x * m.s, y:m.y + v.y * m.s,
                             w:v.w * m.s, h:v.h * m.s});
  const inverse = m => ({x:-m.x / m.s, y:-m.y / m.s, s:1 / m.s});
  const compose = (a, b) => ({x:a.x + a.s * b.x, y:a.y + a.s * b.y, s:a.s * b.s});
  // Shared scenery (for example the grid beside #content) must not jump when
  // the camera is expressed in the next level's local units at the endpoint.
  const scenery = [...content.parentNode.children].filter(n => n !== content
    && n instanceof SVGGraphicsElement && !['defs', 'clipPath', 'mask'].includes(n.localName));
  let sceneryMap = {x:0, y:0, s:1};
  const sceneryLayers = new Map();
  function rebaseScenery(m){
    sceneryMap = compose(m, sceneryMap);
    for (const node of scenery) {
      let wrap = sceneryLayers.get(node);
      if (!wrap) {
        wrap = layer(node);
        wrap.style.removeProperty('pointer-events');
        sceneryLayers.set(node, wrap);
      }
      wrap.setAttribute('transform', `translate(${sceneryMap.x} ${sceneryMap.y}) scale(${sceneryMap.s})`);
    }
    if (!levels.length) {
      for (const wrap of sceneryLayers.values()) unwrap(wrap);
      sceneryLayers.clear();
      sceneryMap = {x:0, y:0, s:1};
    }
  }

  // Use a temporary wrapper so application transforms and opacity survive.
  function layer(g, m){
    const wrap = document.createElementNS(svg.namespaceURI, 'g');
    g.before(wrap);
    wrap.appendChild(g);
    if (m) wrap.setAttribute('transform', `translate(${m.x} ${m.y}) scale(${m.s})`);
    wrap.style.pointerEvents = 'none';
    return wrap;
  }
  function unwrap(wrap){ wrap.replaceWith(...wrap.childNodes); }

  // Both levels share one coordinate system for the whole journey. A monotone
  // zoom keeps "inside" moving inward, without a framing flight's pull-back.
  function travel(target, outgoing, incoming, done){
    cancelFly();
    const start = {...view};
    let raf;
    depthFinish = () => {
      cancelAnimationFrame(raf);
      depthFinish = null;
      done();
    };
    if (REDUCED || motionMuted) { finishDepth(); return; }
    incoming.style.opacity = '0';
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / 520), u = easeInOutCubic(t);
      const w = start.w * Math.pow(target.w / start.w, u);
      const h = start.h * Math.pow(target.h / start.h, u);
      const cx = (start.x + start.w / 2) * (1-u) + (target.x + target.w / 2) * u;
      const cy = (start.y + start.h / 2) * (1-u) + (target.y + target.h / 2) * u;
      setView({x:cx-w/2, y:cy-h/2, w, h});
      outgoing.style.opacity = String(1-u);
      incoming.style.opacity = String(u);
      if (t < 1) raf = requestAnimationFrame(step);
      else finishDepth();
    };
    raf = requestAnimationFrame(step);
  }

  const labelAt = i => (i === 0 ? (opts.rootLabel || 'top') : levels[i - 1].label);
  const indexAt = i => (i === 0 ? opts.index : levels[i - 1].index) || opts.index || null;
  const objectsAt = i => (i === 0 ? opts.objects : levels[i - 1].objects) || opts.objects || null;

  /* The navigator is the panel that indexes the level you are in. Entering
     swaps its contents for the new level's, and Back sits at its head, because
     going up a level is navigation and that is where navigation lives. Where
     you are is not a property of this panel, though, so the path is not in it —
     see crumbInto. */
  const navPanel = document.querySelector(opts.nav || '[data-nav]');
  const navBody = () => navPanel && (navPanel.querySelector('[data-nav-body]')
    || navPanel.querySelector('.tree, .scroll, .list') || navPanel);

  function paintNav(previewOf){
    const host = navBody();
    if (!host) return;
    const at = previewOf == null ? levels.length : previewOf;
    const fn = indexAt(at);
    if (!fn) return;
    const keep = host.scrollTop;
    host.textContent = '';
    host.classList.toggle('preview', previewOf != null);
    fn(host, {level: at, live: previewOf == null, label: labelAt(at)});
    if (previewOf == null) host.scrollTop = keep;
  }

  /* Marking what was picked is the stage's job, not each app's: an app that
     forgets it at one level looks broken only at that level. */
  function markPick(el){
    for (const n of svg.querySelectorAll('.sel')) n.classList.remove('sel');
    if (el && live.contains(el)) el.classList.add('sel');
  }

  function enter(node, desc){
    finishDepth();
    if (!desc || !desc.draw || !node || !live.contains(node)) return;
    // getBBox is local to the object; account for translated/scaled ancestors.
    const b = node.getBBox();
    const matrix = live.parentNode.getScreenCTM().inverse().multiply(node.getScreenCTM());
    const corners = [[b.x,b.y], [b.x+b.width,b.y], [b.x,b.y+b.height], [b.x+b.width,b.y+b.height]]
      .map(([x,y]) => new DOMPoint(x,y).matrixTransform(matrix));
    const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
    const width = Math.max(...corners.map(p => p.x)) - x;
    const height = Math.max(...corners.map(p => p.y)) - y;
    const g = document.createElementNS(svg.namespaceURI, 'g');
    g.setAttribute('class', 'level');
    live.parentNode.appendChild(g);
    try { desc.draw(g); } catch (error) { g.remove(); throw error; }
    const inner = g.getBBox();
    const target = framedView(inner, opts.fitPad == null ? 56 : opts.fitPad)
      || {x:0, y:0, w:view.w, h:view.h};
    const s = Math.max(1e-6, Math.min((width || 1) / (inner.width || 1),
                                    (height || 1) / (inner.height || 1)) * 0.9);
    const map = {s, x:x+width/2-s*(inner.x+inner.width/2),
                   y:y+height/2-s*(inner.y+inner.height/2)};
    const from = {g:live, view:{...view}, map};
    const outgoing = layer(live), incoming = layer(g, map);
    levels.push({label:desc.label, index:desc.index, objects:desc.objects, back:from});
    live = g;
    markPick(null);
    travel(mapView(target, map), outgoing, incoming, () => {
      from.g.classList.add('off');
      unwrap(outgoing); unwrap(incoming);
      rebaseScenery(inverse(map));
      setView(target);
    });
    onPick(null, {depth:true});
    paintDepth();
    paintNav();
  }
  /* Leaving several levels at once is one move, not one per level: the
     breadcrumb promises that clicking a step takes you there. */
  function backTo(n){
    finishDepth();
    if (levels.length <= n || n < 0) return;
    const departing = live;
    let lv = null, map = {x:0, y:0, s:1};
    while (levels.length > n) {
      lv = levels.pop();
      map = compose(lv.back.map, map);
      if (live !== departing) live.remove();
      live = lv.back.g;
    }
    live.classList.remove('off');
    const outgoing = layer(departing), incoming = layer(live, inverse(map));
    const restored = {...lv.back.view};
    const r = svg.getBoundingClientRect();
    if (r.width && r.height) restored.h = restored.w * r.height / r.width;
    markPick(null);
    travel(mapView(restored, inverse(map)), outgoing, incoming, () => {
      outgoing.remove(); unwrap(incoming);
      rebaseScenery(map);
      setView(restored);
    });
    onPick(null, {depth:true});
    paintDepth();
    paintNav();
  }
  const back = () => backTo(levels.length - 1);

  function fitTo(g){
    const b = g.getBBox();
    frameBox(b, opts.fitPad == null ? 56 : opts.fitPad);
  }

  /* The path goes in the status bar, not in a panel.

     Where you are is a fact about the whole app — the index, the reading pane
     and the selection all changed with the level — so it cannot be a property
     of one floating panel that can be collapsed, scrolled, or (at phone width)
     hidden behind a toggle. The status bar is the only chrome that is always
     on screen, never scrolls and never collapses, and it already states the
     other facts of the moment: the zoom, and what is selected. Where you are
     belongs beside them. It is also outside the stage, so unlike a floating
     path bar it can never cover the scene.

     It is the one readout that is also a control, because an address is the
     only kind of status that names a place you can go back to. */
  function crumbInto(host){
    host.textContent = '';
    for (let i = 0; i <= levels.length; i++) {
      if (i) {
        const sep = document.createElement('span');
        sep.className = 'sep'; sep.textContent = '/';
        host.appendChild(sep);
      }
      const last = i === levels.length;
      let step;
      if (!last) {
        step = document.createElement('button');
        step.type = 'button'; step.className = 'step';
        step.title = 'Back to ' + labelAt(i);
        step.onclick = () => backTo(i);
        step.onpointerenter = () => paintNav(i);
        step.onpointerleave = () => paintNav();
        step.onfocus = () => paintNav(i);
        step.onblur = () => paintNav();
      } else {
        step = document.createElement(levels.length ? 'b' : 'span');
      }
      step.textContent = labelAt(i);
      host.appendChild(step);
    }
  }

  function paintDepth(){
    PICK = objectsAt(levels.length);
    if (PICK) svg.dataset.objects = PICK;
    const st = document.getElementById('st-path');
    if (st) crumbInto(st);
    const bar = navPanel && navPanel.querySelector('.navpath');
    if (bar) bar.hidden = levels.length === 0;
    const bk = document.getElementById('stage-back');
    if (bk) {
      bk.hidden = levels.length === 0;
      bk.title = levels.length ? 'Back to ' + labelAt(levels.length - 1) : 'Back';
      placeBack(bk);
    }
    svg.dataset.depth = String(levels.length);
    if (opts.onDepth) opts.onDepth(levels.length, levels.map(l => l.label));
  }

  /* On a narrow window the navigator is a panel you open, so Back cannot live
     only inside it: the way out of a level must never be behind a toggle. When
     the navigator is not on screen, Back goes to the view palette, which
     always is. */
  function placeBack(bk){
    const tools = document.querySelector('.tools');
    const hidden = !navPanel || getComputedStyle(navPanel).display === 'none';
    const want = hidden ? tools : navPanel.querySelector('.navpath');
    if (want && bk.parentElement !== want) {
      if (want === tools) want.insertBefore(bk, want.firstChild);
      else want.insertBefore(bk, want.firstChild);
    }
  }
  addEventListener('resize', () => {
    const bk = document.getElementById('stage-back');
    if (bk) placeBack(bk);
  });

  svg.addEventListener('dblclick', e => {
    finishDepth();
    cancelFly();
    // Pointer capture retargets click and dblclick to the svg, so e.target is
    // never the object under the cursor: hit-test by coordinate instead.
    const at = document.elementFromPoint(e.clientX, e.clientY);
    if (at && at.tagName === 'text') return;          // selecting a word
    const hit = pickFrom(at);
    // Framing on double-click suits objects with area; an app whose objects are
    // points (a data series, say) opts out with frameOnDouble:false.
    if (hit) {
      markPick(hit);
      onPick(hit, {dbl:true});
      // An object with an interior is entered; one without is framed.
      const desc = opts.onEnter ? opts.onEnter(hit) : null;
      if (desc) enter(hit, desc);
      else if (opts.frameOnDouble !== false) frame(hit);
    } else if (levels.length) back();
    else fit();
  });

  addEventListener('resize', () => {
    finishDepth();
    const r = svg.getBoundingClientRect();
    if (r.width && r.height) { view.h = view.w * (r.height / r.width); apply(); }
  });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.body.classList.contains('modal')) { closeModal(); return; }
    if (levels.length) { back(); return; }
    onPick(null, {escape:true});
  });

  const wire = (sel, fn) => { const el = document.querySelector(sel); if (el) el.onclick = fn; };
  wire(opts.zoomInBtn || '#zoom-in', () => zoomStep(1 / 1.3));
  wire(opts.zoomOutBtn || '#zoom-out', () => zoomStep(1.3));
  wire(opts.fitBtn || '#fit', () => (levels.length ? fitTo(live) : fit()));

  /* Back belongs beside the index it returns you to, not in the view palette:
     going up a level is navigation, and the palette is about the camera. Apps
     with no navigator keep it in the palette, which is where it can go. */
  if (!document.getElementById('stage-back')) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'stage-back'; b.className = 'btn';
    b.innerHTML = `{{icon:arrow_back:18}}<span>Back</span>`;
    b.hidden = true;
    b.onclick = back;
    if (navPanel) {
      const bar = document.createElement('div');
      bar.className = 'navpath';
      bar.hidden = true;                    // there is no way up from the top
      bar.appendChild(b);
      const head = navPanel.querySelector('header');
      if (head) head.after(bar); else navPanel.prepend(bar);
    } else {
      const tools = document.querySelector('.tools');
      if (tools) tools.insertBefore(b, tools.firstChild);
    }
  }
  initModal();
  paintDepth();
  /* The first paint of the navigator is deferred by a microtask: the app calls
     createStage in the middle of its own script, so its index function and the
     things it closes over may not be initialised yet. Same trap as onDepth. */
  queueMicrotask(() => paintNav());

  initTextScale(
    () => {                                  // the chrome resized; keep the aspect honest
      finishDepth();
      const r = svg.getBoundingClientRect();
      if (r.width && r.height) { view.h = view.w * (r.height / r.width); apply(); }
    },
    () => { const i = insets();
            return {w: i.w - i.L - i.R, h: i.h - i.T - i.B}; });

  return {fit, frame, frameBox, zoomStep, zoomAt, insets, getView,
          setView: v => { finishDepth(); cancelFly(); setView(v); }, apply, toWorld,
          enter, back, backTo, paintNav, markPick,
          depth: () => levels.length, level: () => live, root: () => rootContent};
}

/* ---------------------------------------------------------------------------
   A reading panel that can take the whole surface. Beside a scene a panel is an
   annotation; a document deserves the room and the measure. Any panel marked
   data-expandable gets the control and a scrim, and Escape closes it.
   --------------------------------------------------------------------------- */
function initModal(){
  if (document.querySelector('.scrim')) return;
  const app = document.querySelector('.app');
  if (!app) return;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.addEventListener('click', closeModal);
  app.appendChild(scrim);

  for (const panel of document.querySelectorAll('.hud[data-expandable]')) {
    const head = panel.querySelector('header');
    if (!head || head.querySelector('.expand')) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn expand';
    b.setAttribute('aria-label', 'Open as a full page');
    b.innerHTML = `<span class="i-open">{{icon:open_in_full:15}}</span>`
                + `<span class="i-shut">{{icon:close_fullscreen:15}}</span>`;
    b.onclick = () => (panel.classList.contains('modal') ? closeModal() : openModal(panel));
    head.appendChild(b);
  }
}
function openModal(panel){
  panel.classList.add('modal');
  document.body.classList.add('modal');
  const b = panel.querySelector('.expand');
  if (b) b.setAttribute('aria-label', 'Return it to the side');
  const s = panel.querySelector('.scroll');
  if (s) s.focus?.();
}
function closeModal(){
  const panel = document.querySelector('.hud.modal');
  if (!panel) return;
  panel.classList.remove('modal');
  document.body.classList.remove('modal');
  const b = panel.querySelector('.expand');
  if (b) b.setAttribute('aria-label', 'Open as a full page');
}

/* ---------------------------------------------------------------------------
   Text scale. The stage has a camera; the text layer needs its own control, or
   the only way to enlarge the reading is browser zoom — which rescales the
   scene too, and collides with ctrl+wheel already meaning pinch-zoom here.
   Controls are injected into the view palette so every app gets them.
   --------------------------------------------------------------------------- */
const UI_STEPS = [0.85, 1, 1.15, 1.3, 1.5];
const UI_KEY = 'orrery.uiScale';
let uiIndex = 1;

function initTextScale(onChange, room){
  const tools = document.querySelector('.tools');
  if (!tools || tools.querySelector('.size')) return;

  try {
    const saved = UI_STEPS.indexOf(parseFloat(localStorage.getItem(UI_KEY)));
    if (saved >= 0) uiIndex = saved;
  } catch (_) {}

  const mk = (id, label, html, cls) => {
    const b = document.createElement('button');
    b.type = 'button'; b.id = id; b.className = 'btn' + (cls ? ' ' + cls : '');
    if (label) b.setAttribute('aria-label', label);
    b.innerHTML = html;
    tools.appendChild(b);
    return b;
  };
  const sep = document.createElement('span');
  sep.className = 'sep';
  tools.appendChild(sep);

  const down = mk('text-down', 'Smaller text', `{{icon:text_decrease:18}}`);
  const read = mk('text-size', 'Reset text size', '100%', 'size');
  const up = mk('text-up', 'Larger text', `{{icon:text_increase:18}}`);
  read.title = 'Reset text size';

  function apply(notify){
    const v = UI_STEPS[uiIndex];
    document.documentElement.style.setProperty('--ui-scale', String(v));
    read.textContent = Math.round(v * 100) + '%';
    down.disabled = uiIndex === 0;
    up.disabled = uiIndex === UI_STEPS.length - 1 || capped;
    read.title = capped
      ? 'No room for larger text in this window. Click to reset.'
      : 'Reset text size';
    try { localStorage.setItem(UI_KEY, String(v)); } catch (_) {}
    if (notify !== false && onChange) onChange();
  }
  /* Bigger text means bigger panels, and panels float over the stage. Growing
     until the scene has no room left is not a legible interface, so a step that
     would leave less than a usable stage is refused and the control stops. */
  let capped = false;
  const step = d => {
    const prev = uiIndex;
    uiIndex = Math.max(0, Math.min(UI_STEPS.length - 1, uiIndex + d));
    if (d < 0) capped = false;
    apply();
    if (d > 0 && room) {
      const r = room();
      if (r.w < 260 || r.h < 200) { uiIndex = prev; capped = true; apply(); }
    }
  };
  // A different window size may have room again — but do not notify from here,
  // or a notify that resizes the chrome would call this straight back.
  addEventListener('resize', () => { capped = false; apply(false); });
  down.onclick = () => step(-1);
  up.onclick = () => step(1);
  read.onclick = () => { uiIndex = UI_STEPS.indexOf(1); apply(); };

  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;          // leave browser zoom alone
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); step(1); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); step(-1); }
    else if (e.key === '0') { e.preventDefault(); uiIndex = UI_STEPS.indexOf(1); apply(); }
  });

  apply();
}
