/* ---------------------------------------------------------------------------
   Motion, shared by every app.

   One rule decides whether a change is animated: if the person is dragging,
   pinching or scrolling, the view must follow the input exactly — easing there
   reads as lag. Everything the system moves on their behalf (fit, frame, zoom
   buttons, switching scene, opening a section) eases instead.
   --------------------------------------------------------------------------- */
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* While a control is being dragged it emits a value on every frame. Playing the
   committed-change motion for each one stacks fades that never finish and starts
   a camera flight that cancels the one before it — which reads as a glitch until
   the drag ends. Mute motion for the live part, restore it on commit. */
let motionMuted = false;
const muteMotion = on => { motionMuted = !!on; };
const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const DECEL = 'cubic-bezier(.05,.7,.1,1)';   /* M3 emphasized-decelerate */

/* Van Wijk & Nuij, "Smooth and efficient zooming and panning" (2003).
   Travelling a long way, the camera pulls back, crosses, and settles — the path
   a hand would take. A straight lerp of the viewBox instead slides at a speed
   that looks wrong at both ends. Returns an interpolator plus its own natural
   duration, since the algorithm knows how far the journey really is. */
function interpolateZoom(p0, p1){
  const rho = Math.SQRT2, rho2 = 2, rho4 = 4;
  const [ux0, uy0, w0] = p0, [ux1, uy1, w1] = p1;
  const dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy;
  // "Same place" must be judged relative to the viewport, not by an absolute
  // epsilon: in world units of thousands, a gap of 1e-5 is a pure zoom, but the
  // general branch divides by it and yields NaN. Reached by pressing zoom-out
  // while a zoom-in flight is still running — both aim at the same centre.
  const eps = Math.max(1e-12, w0 * w0 * 1e-6);
  let i, S;
  if (d2 < eps) {                       // same place: a pure zoom
    S = Math.log(w1 / w0) / rho;
    i = t => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)];
  } else {
    const d1 = Math.sqrt(d2);
    const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
    const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
    const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
    S = (r1 - r0) / rho;
    i = t => {
      const s = t * S, coshr0 = Math.cosh(r0);
      const u = w0 / (rho2 * d1) * (coshr0 * Math.tanh(rho * s + r0) - Math.sinh(r0));
      return [ux0 + u * dx, uy0 + u * dy, w0 * coshr0 / Math.cosh(rho * s + r0)];
    };
  }
  i.duration = Math.abs(S) * 1000;
  return i;
}

let flyToken = 0;
const cancelFly = () => { flyToken++; };

/* Fly the camera to a target view. Interruptible: a new flight, or any direct
   manipulation, abandons the old one from wherever it had got to. */
function flyView(svg, getView, setView, target){
  cancelFly();
  const mine = flyToken, cur = getView();
  const near = (a, b, tol) => Math.abs(a - b) < tol;
  if (REDUCED || motionMuted || (near(cur.x, target.x, 0.6) && near(cur.y, target.y, 0.6) &&
                  near(cur.w, target.w, 0.6))) { setView(target); return; }
  const r = svg.getBoundingClientRect();
  const aspect = (r.height && r.width) ? r.height / r.width : cur.h / cur.w;
  const iz = interpolateZoom(
    [cur.x + cur.w / 2, cur.y + cur.h / 2, cur.w],
    [target.x + target.w / 2, target.y + target.h / 2, target.w]);
  if (!Number.isFinite(iz.duration)) { setView(target); return; }   // never fly to NaN
  const ms = Math.max(280, Math.min(900, iz.duration));
  const t0 = performance.now();
  const step = now => {
    if (mine !== flyToken) return;                    // superseded
    const t = Math.min(1, (now - t0) / ms);
    const [cx, cy, w] = iz(easeInOutCubic(t));
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(w) || w <= 0) {
      setView(target); return;                    // bail straight to the destination
    }
    const h = w * aspect;
    setView({x: cx - w / 2, y: cy - h / 2, w, h});
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* Replace panel content without it snapping into place. */
function swapIn(el, html){
  el.innerHTML = html;
  if (REDUCED || motionMuted) return;
  el.animate([{opacity:0, transform:'translateY(7px)'}, {opacity:1, transform:'none'}],
             {duration:260, easing:DECEL});
}

/* One orchestrated entrance, not a permanent hover-and-float habit. */
function revealAll(nodes, step){
  if (REDUCED || motionMuted) return;
  const s = step || 26;
  nodes.forEach((n, i) => n.animate(
    [{opacity:0, transform:'translateY(10px)'}, {opacity:1, transform:'none'}],
    {duration:460, delay:Math.min(i * s, 420), easing:DECEL, fill:'backwards'}));
}

/* A redraw that replaces everything on the stage should cross-fade, not blink. */
function fadeIn(node, ms){
  if (REDUCED || motionMuted) return;
  node.animate([{opacity:0}, {opacity:1}], {duration:ms || 220, easing:DECEL});
}

/* Hiding a layer is a state change, not a cut: fade it out, then take it out of
   layout so it stops affecting Fit. */
function setHidden(node, hidden){
  if (REDUCED) { node.classList.toggle('off', hidden); return; }
  if (hidden) {
    const a = node.animate([{opacity:1}, {opacity:0}], {duration:180, easing:DECEL});
    a.onfinish = () => node.classList.add('off');
  } else {
    node.classList.remove('off');
    node.animate([{opacity:0}, {opacity:1}], {duration:220, easing:DECEL});
  }
}

/* A selection made in a panel can still be extended by a drag that starts on the
   stage, so it is dropped when a manipulation begins. */
function clearTextSelection(){
  const sel = window.getSelection && window.getSelection();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
}

/* Wheel navigation, from three different input devices reported through one
   event. A trackpad two-finger swipe is a wheel with deltaX/deltaY and no
   modifier — that should pan. A trackpad pinch is a wheel with ctrlKey set —
   that should zoom. A mouse wheel is also modifier-free, but reports line/page
   deltas or large quantised pixel steps with no horizontal component, and a
   mouse has no other way to zoom without reaching for a key. */
const isMouseWheel = e =>
  e.deltaMode !== 0 ||
  (e.deltaX === 0 && Math.abs(e.deltaY) >= 100 && Number.isInteger(e.deltaY));

function wheelNavigation(svg, getView, setView, zoomAt){
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    cancelFly();
    if (e.ctrlKey || e.metaKey) {          // pinch, or an explicit zoom gesture
      zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.01));
      return;
    }
    if (isMouseWheel(e)) {
      zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0012));
      return;
    }
    const m = svg.getScreenCTM();
    if (!m) return;
    const v = getView();                   // swipe: move the scene under the hand
    setView({...v, x: v.x + e.deltaX / m.a, y: v.y + e.deltaY / m.d});
  }, {passive:false});
}
