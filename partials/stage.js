/* ---------------------------------------------------------------------------
   The stage: one pannable, zoomable surface and everything that makes it
   behave. This is the part every app used to retype — about 120 lines that
   were 90% identical between them, and where the same traps kept recurring.

   Requires motion.js (flyView, cancelFly, clearTextSelection, wheelNavigation).

   createStage({svg, content, objects, onPick, ...}) -> controller
   --------------------------------------------------------------------------- */
function createStage(opts){
  const svg = opts.svg, content = opts.content;
  const PICK = opts.objects || null;            // selector for pickable objects
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

  function frameBox(b, pad, maxScale){
    if (!b || !b.width) return;
    const i = insets();
    const availW = Math.max(120, i.w - i.L - i.R);
    const availH = Math.max(120, i.h - i.T - i.B);
    const s = Math.min(availW / (b.width + (pad || 0)), availH / (b.height + (pad || 0)),
                       maxScale || Infinity);
    const target = {w: i.w / s, h: i.h / s};
    target.x = b.x + b.width / 2 - (i.L + availW / 2) / s;
    target.y = b.y + b.height / 2 - (i.T + availH / 2) / s;
    flyView(svg, getView, setView, target);
  }
  const fit = () => frameBox(content.getBBox(), opts.fitPad == null ? 56 : opts.fitPad);
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
    const p = toWorld(cx, cy);
    view.w *= k; view.h *= k;
    view.x = p.x - (p.x - view.x) * k;
    view.y = p.y - (p.y - view.y) * k;
    apply();
  }
  function zoomStep(k){
    const r = svg.getBoundingClientRect();
    const p = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    flyView(svg, getView, setView,
      {w:view.w * k, h:view.h * k,
       x:p.x - (p.x - view.x) * k, y:p.y - (p.y - view.y) * k});
  }

  // Tell the checker what counts as an object here, so the standing assertions
  // do not have to know anything app-specific.
  if (PICK) svg.dataset.objects = PICK;

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
      if (!drag.moved) onPick(drag.hit || null, {dbl:false});
    }
    drag = null;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  svg.addEventListener('dblclick', e => {
    cancelFly();
    // Pointer capture retargets click and dblclick to the svg, so e.target is
    // never the object under the cursor: hit-test by coordinate instead.
    const at = document.elementFromPoint(e.clientX, e.clientY);
    if (at && at.tagName === 'text') return;          // selecting a word
    const hit = pickFrom(at);
    // Framing on double-click suits objects with area; an app whose objects are
    // points (a data series, say) opts out with frameOnDouble:false.
    if (hit) { onPick(hit, {dbl:true}); if (opts.frameOnDouble !== false) frame(hit); }
    else fit();
  });

  addEventListener('resize', () => {
    const r = svg.getBoundingClientRect();
    if (r.width && r.height) { view.h = view.w * (r.height / r.width); apply(); }
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') onPick(null, {escape:true}); });

  const wire = (sel, fn) => { const el = document.querySelector(sel); if (el) el.onclick = fn; };
  wire(opts.zoomInBtn || '#zoom-in', () => zoomStep(1 / 1.3));
  wire(opts.zoomOutBtn || '#zoom-out', () => zoomStep(1.3));
  wire(opts.fitBtn || '#fit', fit);

  initTextScale(
    () => {                                  // the chrome resized; keep the aspect honest
      const r = svg.getBoundingClientRect();
      if (r.width && r.height) { view.h = view.w * (r.height / r.width); apply(); }
    },
    () => { const i = insets();
            return {w: i.w - i.L - i.R, h: i.h - i.T - i.B}; });

  return {fit, frame, frameBox, zoomStep, zoomAt, insets, getView, setView, apply, toWorld};
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
