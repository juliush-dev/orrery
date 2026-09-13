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
    positionEntrances();
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
      // A surface you opened and will dismiss reserves nothing, the way a menu
      // does not: fitting around it would move the scene out from under you.
      if (el.dataset.transient) continue;
      // A modal says so. Guessing at it by size was fine while no side panel
      // was ever large — then a reading panel could be widened, and a wide
      // tall panel beside the scene was read as a sheet over it and reserved
      // nothing, so Fit centred the whole scene underneath it.
      if (el.classList.contains('modal')) continue;
      const p = el.getBoundingClientRect();
      if (!p.width || !p.height) continue;
      // Classify by the edges a panel is anchored to, never by its height: a
      // side panel is short when its content is short, and would then reserve
      // nothing until it grew and covered the scene.
      const wide = p.width > r.width * 0.45;
      const gL = p.left - r.left, gR = r.right - p.right;
      const gT = p.top - r.top,  gB = r.bottom - p.bottom;
      const nearL = gL < 48, nearR = gR < 48, nearT = gT < 48;
      const lowish = gB < r.height * 0.25;
      let side = null;
      // Anything docked to the bottom reserves its height, however narrow. A
      // corner palette that reserves nothing lets content slide underneath it,
      // which only shows up once the palette grows — at a larger text size, or
      // in an app with one more button in it.
      if (lowish && !nearT) side = 'B';
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
  const indexAt = i => (i === 0 ? opts.index : levels[i - 1].index) || null;
  const objectsAt = i => (i === 0 ? opts.objects : levels[i - 1].objects) || null;
  const entryAt = i => (i === 0 ? opts.onEnter : levels[i - 1]?.onEnter) || null;

  /* The navigator is the panel that indexes the level you are in. Entering
     swaps its contents for the new level's, and Back sits at its head, because
     going up a level is navigation and that is where navigation lives. Where
     you are is not a property of this panel, though, so the path is not in it —
     see crumbInto. */
  const navPanel = document.querySelector(opts.nav || '[data-nav]');
  const navBody = () => navPanel && (navPanel.querySelector('[data-nav-body]')
    || navPanel.querySelector('.tree, .scroll, .list') || navPanel);

  // Resolve capabilities once per refresh. onEnter describes an interior; only
  // desc.draw performs work. The marker and the action use this same answer.
  let entrances = new Map();
  let entranceLayer = null;
  let entrancesReady = false;
  const descriptions = new WeakMap();
  let interiorOwners = new WeakMap(), interiorIds = new Map();
  const objectLabel = node => node.getAttribute('aria-label')
    || node.querySelector('text')?.textContent || node.id || 'object';
  function description(node){
    if (!descriptions.has(node)) {
      const at = live.contains(node) ? levels.length : levels.findIndex(l => l.back.g.contains(node));
      const desc = entryAt(at)?.(node) || null;
      if (desc) claimInterior(node, desc);
      descriptions.set(node, desc);
    }
    return descriptions.get(node);
  }
  function claimInterior(node, desc){
    if (typeof desc.draw !== 'function') throw new Error('An interior must supply draw(g)');
    const at = live.contains(node) ? levels.length : levels.findIndex(l => l.back.g.contains(node));
    const owner = node.orreryOwner || (node.id ? `${levels.slice(0,at).map(l => l.ownerId).join('/')}/${node.id}` : node);
    const previous = interiorOwners.get(desc);
    const byId = desc.id && interiorIds.get(desc.id);
    if (!desc.shared && ((previous && previous !== owner) || (byId && byId !== owner)))
      throw new Error('Interior reused by different objects; give each object its own interior or declare shared: true');
    interiorOwners.set(desc, owner);
    if (desc.id) interiorIds.set(desc.id, owner);
  }
  function entranceButton(node, active = true){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn enter-control';
    b.orreryObject = node;
    b.innerHTML = `{{icon:login:16}}<span>Enter</span>`;
    b.title = b.ariaLabel = 'Enter ' + objectLabel(node);
    b.disabled = !active;
    b.addEventListener('click', e => {
      e.stopPropagation();
      if (active && live.contains(node)) enter(node, description(node));
    });
    b.addEventListener('dblclick', e => e.stopPropagation());
    return b;
  }
  // The opened width of a mark: the word is always the same word, so one
  // measurement serves every object until the text scale changes it.
  let markOpen = 0, markHeight = 0;
  function openWidth(button, h){
    if (markHeight !== h) { markOpen = 0; markHeight = h; }
    if (!markOpen) {
      button.classList.add('measuring');
      markOpen = button.offsetWidth;
      button.classList.remove('measuring');
    }
    return markOpen;
  }
  function positionEntrances(){
    if (!entranceLayer) return;
    const r = svg.getBoundingClientRect(), p = entranceLayer.getBoundingClientRect();
    // DOM bounds are screen pixels; positioned offsets are overlay CSS units.
    // These differ under CSS zoom or a scaled embedding container.
    const sx = p.width / entranceLayer.clientWidth || 1;
    const sy = p.height / entranceLayer.clientHeight || 1;
    for (const [node, button] of entrances) {
      // The mark belongs on the object's face. An object's drawn group is its
      // geometry, and that geometry can carry a heading, a caption or a badge
      // outside the shape the reader recognises as the object — anchoring to the
      // group then floats the mark in the air above the card. Where the author
      // declares the face with data-face, that box is the anchor.
      const face = node.querySelector('[data-face]');
      const b = (face || node).getBoundingClientRect();
      // The height is the one measurement the hover reveal cannot change, so the
      // collapsed mark is sized from it rather than from its own live width.
      const h = button.offsetHeight || 26;
      const wide = b.width / sx, tall = b.height / sy;
      // A mark, not a face. A fixed-size control pinned to a corner that keeps
      // shrinking ends up beside a speck, reading as something else entirely,
      // so once the door would be a third of the card the object stops wearing
      // one — its index row still enters it.
      const fits = wide >= h * 3.4 && tall >= h * 2;
      button.hidden = !!depthFinish || !fits ||
        b.right < r.left || b.left > r.right || b.bottom < r.top || b.top > r.bottom;
      if (button.hidden) continue;
      // Anchored by its right edge: revealing the word grows the control inward,
      // towards the object's own middle, so it never moves under its own
      // transition. The anchor is the object's corner and nothing else — a mark
      // pinned to the viewport instead would slide off the thing it marks.
      button.style.right = (p.right - b.right + 6) / sx + 'px';
      button.style.top = (b.top - p.top + 6) / sy + 'px';
      // The object is the reveal's budget. Where the word would not fit whole,
      // the mark stays a glyph rather than opening on to a clipped word.
      const room = Math.max(0, wide - 12);
      button.style.maxWidth = room + 'px';
      button.classList.toggle('tight', room < openWidth(button, h));
    }
  }
  function refreshEntrances(){
    if (!entrancesReady) return;
    if (!entranceLayer) {
      entranceLayer = document.createElement('div');
      entranceLayer.className = 'stage-entrances';
      svg.after(entranceLayer);
      new MutationObserver(positionEntrances).observe(svg, {subtree:true,
        attributes:true, attributeFilter:['class','style','transform','display']});
      new ResizeObserver(positionEntrances).observe(entranceLayer);
    }
    entranceLayer.replaceChildren(); entrances.clear();
    if (PICK) for (const node of live.querySelectorAll(PICK)) {
      const desc = description(node);
      node.dataset.enterable = String(!!desc?.draw);
      if (!desc?.draw) continue;
      const button = entranceButton(node);
      // The mark names the object it sits on. A model-derived object carries its
      // identity in dataset.objectId and usually has no element id at all.
      button.dataset.marks = node.dataset.objectId || node.id || '';
      entranceLayer.appendChild(button); entrances.set(node, button);
    }
    positionEntrances();
  }
  function bindIndex(row, node, active, group, selector){
    if (!(node instanceof SVGGraphicsElement)) throw new Error('index.bind requires a stage object');
    if (node === group || !group.contains(node) || !selector || !node.matches(selector))
      throw new Error('Index rows must refer to objects in the indexed stage, not its owner or another level');
    row.dataset.stageObject = node.id || '';
    row.orreryObject = node;
    let depth = 0;
    for (let p=node.parentElement; p && p!==group; p=p.parentElement)
      if (p.matches(selector)) depth++;
    row.dataset.indexDepth = String(depth);
    row.style.paddingInlineStart = (8 + depth * 16) + 'px';
    row.classList.toggle('sel',node.classList.contains('sel'));
    row.dataset.enterable = String(!!description(node)?.draw);
    if (description(node)?.draw) row.appendChild(entranceButton(node, active));
    return row;
  }
  function refresh(){
    if (PICK) for (const node of live.querySelectorAll(PICK)) descriptions.delete(node);
    refreshEntrances();
    paintNav();
  }

  function paintNav(previewOf){
    const host = navBody();
    if (!host) return;
    const at = previewOf == null ? levels.length : previewOf;
    const fn = indexAt(at);
    const keep = host.scrollTop;
    host.textContent = '';
    host.classList.toggle('preview', previewOf != null);
    const active = previewOf == null;
    const group = at === levels.length ? live : levels[at].back.g;
    const selector = objectsAt(at);
    const ctx = {level: at, live: active, label: labelAt(at), content:group,
      bind: (row, node) => bindIndex(row, node, active, group, selector)};
    if (fn) fn(host, ctx);
    else defaultIndex(host, ctx, selector);
    host.inert = !active;
    if (previewOf == null) host.scrollTop = keep;
  }

  // A missing interior index must never silently repeat the root's index.
  // Derive a default from actual SVG ancestry; the containing stage is context
  // in the breadcrumb, not an extra selectable object in its own contents.
  function defaultIndex(host, ctx, selector){
    const nodes = selector ? [...ctx.content.querySelectorAll(selector)] : [];
    for (const node of nodes) {
      const row = document.createElement('div'); row.className = 'stage-index-row';
      const name = document.createElement('button'); name.type = 'button';
      name.className = 'btn name'; name.textContent = objectLabel(node);
      name.title = objectLabel(node);
      if (ctx.live) name.onclick = () => { markPick(node); onPick(node, {index:true}); frame(node); };
      row.appendChild(name); ctx.bind(row, node); host.appendChild(row);
    }
    if (!nodes.length) host.textContent = 'No objects in this stage.';
  }

  /* Marking what was picked is the stage's job, not each app's: an app that
     forgets it at one level looks broken only at that level. */
  function markPick(el){
    for (const n of svg.querySelectorAll('.sel')) n.classList.remove('sel');
    if (el && live.contains(el)) el.classList.add('sel');
    for (const row of navPanel?.querySelectorAll('[data-stage-object]') || [])
      row.classList.toggle('sel',row.orreryObject === el);
    // Law 6: a selection is readable in the object, in the index and in the
    // status bar. Give the bar a cell with id st-sel and the kit keeps it, at
    // every depth and through a context change; an app that wants to say more
    // says it in onPick, which runs after this.
    const readout = document.getElementById('st-sel');
    if (readout) readout.textContent = el ? objectLabel(el) : 'nothing selected';
  }

  svg.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const hit = pickFrom(e.target);
    if (!hit || !live.contains(hit)) return;
    e.preventDefault();
    markPick(hit); onPick(hit,{keyboard:true});
    const desc = e.key === 'Enter' && description(hit);
    if (desc) enter(hit,desc);
  });

  function enter(node, desc){
    finishDepth();
    if (!desc || !desc.draw || !node || !live.contains(node)) return;
    claimInterior(node, desc);
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
    levels.push({label:desc.label, index:desc.index, objects:desc.objects,
      onEnter:desc.onEnter, ownerId:node.dataset.objectId || node.id, owner:node, back:from});
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
    // You came out of something, and that something is what you are looking at:
    // it keeps the selection ring, and its row in the index stays the active one.
    // Coming back to a level with nothing selected loses the thread of the visit.
    const owner = lv.owner && live.contains(lv.owner) ? lv.owner : null;
    markPick(owner);
    travel(mapView(restored, inverse(map)), outgoing, incoming, () => {
      outgoing.remove(); unwrap(incoming);
      rebaseScenery(map);
      setView(restored);
    });
    // `back` says why: the camera is already being restored, so an app that
    // frames what it picks must not frame this one.
    onPick(owner, {depth:true, back:true});
    paintDepth();
    paintNav();
  }
  const back = () => backTo(levels.length - 1);

  // Model reconciliation prepares every drawing before replacing any level.
  // Cameras belong to containment locations, not to a scenario or view button.
  function snapshotLevels(){
    finishDepth(); cancelFly();
    return [...levels.map((l,i) => ({g:l.back.g, view:{...l.back.view},
      ownerId:i ? levels[i-1].ownerId : null})),
      {g:live, view:{...view}, ownerId:levels.at(-1)?.ownerId || null}];
  }
  function replaceLevels(frames){
    finishDepth(); cancelFly();
    for (const f of frames) f.view ||= framedView(f.g.getBBox(),opts.fitPad ?? 56)
      || {...view};
    // Frames are already drawn and measured by createModelStage. No drawing
    // callback runs after the old stack has been discarded.
    for (const l of levels) if (l.back.g !== rootContent) l.back.g.remove();
    if (live !== rootContent) live.remove();
    levels.length = 0;
    rebaseScenery({x:0,y:0,s:1});
    interiorOwners = new WeakMap(); interiorIds = new Map();
    rootContent.replaceChildren(...frames[0].g.childNodes);
    frames[0].g.remove(); frames[0].g = rootContent;
    Object.assign(opts,{rootLabel:frames[0].label,objects:frames[0].objects,
      index:frames[0].index,onEnter:frames[0].onEnter});
    for (let i=0;i<frames.length;i++) {
      const f=frames[i];
      f.g.style.removeProperty('visibility');
      f.g.classList.toggle('off',i<frames.length-1);
      if (i) {
        const parent=frames[i-1];
        levels.push({label:f.label,objects:f.objects,index:f.index,onEnter:f.onEnter,
          ownerId:f.ownerId,owner:f.owner,back:{g:parent.g,view:parent.view,map:f.map}});
        rebaseScenery(inverse(f.map));
      }
    }
    live=frames.at(-1).g;
    markPick(null);
    setView(frames.at(-1).view);
    onPick(null,{context:true}); paintDepth(); paintNav();
  }

  const refit = () => (levels.length ? fitTo(live) : fit());
  function fitTo(g){
    const b = g.getBBox();
    frameBox(b, opts.fitPad == null ? 56 : opts.fitPad);
  }

  /* The path goes in the title bar.

     It is not a property of the panel that indexes the level, so it cannot
     live in one that collapses and hides. Nor is it status: the status bar
     reads out what is true of the moment — the zoom, what is selected — in
     small type at the bottom edge, and the address of what you are looking at
     is neither small print nor a reading. It is the name of the thing on the
     screen, which is what the title bar is for. So the path continues the
     title, in the slot the static subtitle used to hold: an app called
     `homepi-runbook` showing `runbook / What this machine is` has said more
     about itself than "document map" ever did.

     It also stays off the stage, so unlike a floating path bar it can never
     cover the scene. */
  let pathEl = null;
  function pathHost(){
    if (!opts.onEnter) return null;                 // a flat app has no path
    if (pathEl && pathEl.isConnected) return pathEl;
    const tb = document.querySelector('.titlebar');
    if (!tb) return null;
    pathEl = tb.querySelector('.path');
    if (!pathEl) {
      pathEl = document.createElement('nav');
      pathEl.className = 'crumb path';
      pathEl.setAttribute('aria-label', 'Where you are');
      const sub = tb.querySelector('.sub'), h1 = tb.querySelector('h1');
      if (sub) sub.replaceWith(pathEl);
      else if (h1) h1.after(pathEl);
      else tb.prepend(pathEl);
    }
    return pathEl;
  }
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
    for (const g of svg.querySelectorAll('[data-stage-live]')) delete g.dataset.stageLive;
    live.dataset.stageLive = 'true';
    PICK = objectsAt(levels.length);
    if (PICK) svg.dataset.objects = PICK;
    else delete svg.dataset.objects;
    const st = pathHost();
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
    refreshEntrances();
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
      const desc = description(hit);
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
    if (closeHelp()) return;
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
  paintDepth();
  /* The first paint of the navigator is deferred by a microtask: the app calls
     createStage in the middle of its own script, so its index function and the
     things it closes over may not be initialised yet. Same trap as onDepth. */
  queueMicrotask(() => { entrancesReady = true; refresh(); });

  initPanels(refit);
  initHelp();
  initTextScale(
    () => {                                  // the chrome resized; keep the aspect honest
      finishDepth();                         // do not animate across a resize
      stackAboveTools();                     // the palette just changed height
      const r = svg.getBoundingClientRect();
      if (r.width && r.height) { view.h = view.w * (r.height / r.width); apply(); }
    },
    () => { const i = insets();
            return {w: i.w - i.L - i.R, h: i.h - i.T - i.B}; });

  return {fit, frame, frameBox, zoomStep, zoomAt, insets, getView,
          setView: v => { finishDepth(); cancelFly(); setView(v); }, apply, toWorld,
          enter, back, backTo, paintNav, markPick, refresh, snapshotLevels, replaceLevels,
          depth: () => levels.length, level: () => live, root: () => rootContent};
}

/* ---------------------------------------------------------------------------
   How this works.

   Every app had a sentence of guidance parked in the status bar — the widest
   cell, holding the least durable thing in it. Guidance is not state: it does
   not change as you work, it is what you read once and then stop needing, and
   it was squeezing the readouts that do change. So it goes behind a control,
   next to the other controls for the surface it explains.

   The sheet opens from the view palette, above it, because the palette is
   where you already reach to work the stage. It carries the app's own running
   hint first — the only part that is different here and now — and then the
   gestures, which are the same in every app built on the kit and had never
   been written down anywhere a user could find them.
   --------------------------------------------------------------------------- */
const GESTURES = `
  <dt>Drag</dt><dd>pan the scene</dd>
  <dt>Wheel, or pinch</dt><dd>zoom about the pointer</dd>
  <dt>Two-finger swipe</dt><dd>pan, on a trackpad</dd>
  <dt>Click an object</dt><dd>select it, and read it in the side panel</dd>
  <dt>Double-click an object</dt><dd>go inside it, or frame it if it has no inside</dd>
  <dt>Double-click the background</dt><dd>fit this level, or come up out of it</dd>
  <dt>Escape</dt><dd>closes the reader, then comes up a level, then clears the selection</dd>
  <dt><kbd>+</kbd> <kbd>-</kbd> <kbd>0</kbd></dt><dd>text size, and back to 100%</dd>
  <dt>Drag over a label</dt><dd>selects the words instead of panning</dd>`;

function initHelp(){
  const app = document.querySelector('.app');
  const tools = document.querySelector('.tools');
  if (!app || !tools || document.getElementById('help')) return;

  const sheet = document.createElement('section');
  sheet.className = 'hud help';
  sheet.id = 'help';
  sheet.dataset.transient = '1';          // a sheet you dismiss reserves nothing
  sheet.hidden = true;
  sheet.setAttribute('aria-label', 'How this works');
  sheet.innerHTML = `<header>{{icon:help:16}}<h2>HOW THIS WORKS</h2>
      <button type="button" class="btn shut" aria-label="Close">{{icon:close:15}}</button></header>
    <div class="scroll"><p class="now"></p><dl class="gestures">${GESTURES}</dl></div>`;
  app.appendChild(sheet);

  /* The app's running hint moves in here, element and all, so every app keeps
     writing to the same id and none of them had to change. */
  const hint = document.getElementById('st-hint');
  if (hint) {
    sheet.querySelector('.now').replaceWith(hint);
    hint.className = 'now';
    hint.removeAttribute('style');
  }

  const sep = document.createElement('span');
  sep.className = 'sep';
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'help-toggle'; b.className = 'btn';
  b.setAttribute('aria-label', 'How this works');
  b.setAttribute('aria-controls', 'help');
  b.setAttribute('aria-expanded', 'false');
  b.title = 'How this works';
  b.innerHTML = `{{icon:help:18}}`;
  b.onclick = () => (sheet.hidden ? openHelp() : closeHelp());
  tools.append(sep, b);

  sheet.querySelector('.shut').onclick = closeHelp;
  addEventListener('resize', stackAboveTools);
  /* Watch the palette rather than the events that might have changed it. It
     grows when the text size changes, when it wraps, and when a font arrives
     late — and anything that waits to be told will eventually not be told. */
  if (self.ResizeObserver) new ResizeObserver(stackAboveTools).observe(tools);
  requestAnimationFrame(stackAboveTools);
  // Anywhere else is a dismissal: a sheet that needs its own button to go away
  // gets in the way of the work it is explaining.
  document.addEventListener('pointerdown', e => {
    if (sheet.hidden) return;
    if (sheet.contains(e.target) || b.contains(e.target)) return;
    closeHelp();
  }, true);
}
function openHelp(){
  const sheet = document.getElementById('help');
  if (!sheet) return false;
  if (document.body.classList.contains('modal')) closeModal();
  sheet.hidden = false;
  stackAboveTools();
  fadeIn(sheet, 200);
  const b = document.getElementById('help-toggle');
  if (b) b.setAttribute('aria-expanded', 'true');
  return true;
}
/* Measured, not assumed.

   The palette wraps at phone width and grows with the text size, so anything
   that sits above it cannot hold a constant offset — peer-sim's playback bar
   carried `bottom: 78px`, which was true of the palette on the day it was
   written and stopped being true the moment the palette gained a control.
   Everything stacked above the palette is placed from where the palette
   actually is: the help sheet, and anything an app marks data-above-tools. */
function stackAboveTools(){
  const app = document.querySelector('.app');
  const tools = document.querySelector('.tools');
  if (!app || !tools) return;
  const a = app.getBoundingClientRect(), t = tools.getBoundingClientRect();
  const foot = Math.max(14, Math.round(a.bottom - t.top + 10));
  let stack = foot;
  for (const el of document.querySelectorAll('[data-above-tools]')) {
    if (el.hidden || getComputedStyle(el).display === 'none') continue;
    el.style.bottom = stack + 'px';
    stack += Math.round(el.getBoundingClientRect().height) + 10;
  }
  const sheet = document.getElementById('help');
  if (sheet && !sheet.hidden) {
    sheet.style.bottom = foot + 'px';
    sheet.style.maxHeight = Math.max(120, Math.round(a.height - foot - 14)) + 'px';
  }
}
const placeHelp = () => stackAboveTools();
function closeHelp(){
  const sheet = document.getElementById('help');
  if (!sheet || sheet.hidden) return false;
  sheet.hidden = true;
  const b = document.getElementById('help-toggle');
  if (b) b.setAttribute('aria-expanded', 'false');
  return true;
}

/* ---------------------------------------------------------------------------
   A reading panel has two sizes beyond its own, and both belong on the panel.

   Widening keeps it beside the scene and gives the prose a longer measure; the
   scene keeps working, and re-fits into what is left. Opening it as a surface
   gives it the whole window. They are different requests — "I am reading and
   still working" and "I am only reading" — so they are two controls, not one
   that cycles. The runbook had the first of them as a "Wide read" button up in
   its title bar, which put a control for one panel nowhere near that panel and
   gave it to exactly one app.
   --------------------------------------------------------------------------- */
function initPanels(refit){
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

    const w = document.createElement('button');
    w.type = 'button'; w.className = 'btn widen';
    w.setAttribute('aria-pressed', 'false');
    w.setAttribute('aria-label', 'Widen for reading');
    w.title = 'Widen for reading';
    w.innerHTML = `<span class="i-open">{{icon:width_wide:15}}</span>`
                + `<span class="i-shut">{{icon:width_normal:15}}</span>`;
    w.onclick = () => {
      const on = !panel.classList.contains('wide');
      panel.classList.toggle('wide', on);
      w.setAttribute('aria-pressed', String(on));
      w.setAttribute('aria-label', on ? 'Return it to its width' : 'Widen for reading');
      w.title = w.getAttribute('aria-label');
      // The panel floats over the stage, so a wider panel is a smaller stage.
      setTimeout(refit, 260);
    };

    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn expand';
    b.setAttribute('aria-label', 'Open as a full page');
    b.title = 'Open as a full page';
    b.innerHTML = `<span class="i-open">{{icon:open_in_full:15}}</span>`
                + `<span class="i-shut">{{icon:close_fullscreen:15}}</span>`;
    b.onclick = () => (panel.classList.contains('modal') ? closeModal() : openModal(panel));

    head.append(w, b);
    syncWiden(panel);
    addEventListener('resize', () => syncWiden(panel));
  }
}
/* Where the window is narrow the panel already spans it, so there is no width
   left to give it: offer nothing rather than a control that does nothing.

   Measured, not inferred from computed style — `left` on an element positioned
   only by `right` reports a used pixel value, not `auto`, so asking the style
   system which edges it is docked to answers "both" for every panel. */
function syncWiden(panel){
  const w = panel.querySelector('.widen');
  if (!w) return;
  const app = document.querySelector('.app');
  if (!app) return;
  const a = app.getBoundingClientRect(), p = panel.getBoundingClientRect();
  if (!p.width) return;                          // hidden; ask again on resize
  const spans = p.left <= a.left + 24 && p.right >= a.right - 24;
  w.hidden = spans;
  if (spans) { panel.classList.remove('wide'); w.setAttribute('aria-pressed', 'false'); }
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
