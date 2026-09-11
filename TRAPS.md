# Traps

Things that look like working code and fail silently. Each cost real time at
least once; the first cost it three times.

---

## Pointer capture retargets click and dblclick

A stage that pans calls `setPointerCapture` on pointerdown so the drag survives
leaving the element. **Every subsequent `click` and `dblclick` is then dispatched
to the capturing element**, so `e.target` in those handlers is the `<svg>` and
never the object under the cursor.

Decide the target from the `pointerdown`, or hit-test with
`document.elementFromPoint`. Never from `e.target` on a captured surface.

> Broke node selection, then made sweep points unclickable, then made
> double-click always fall through to "fit". Three separate bugs, one cause.
> `stage.js` handles it; if you write your own picking, this is the first thing
> to get right.

## `:focus` and `:focus-visible` are different states

Clicking a focusable object focuses it *without* matching `:focus-visible`.
Suppressing the browser's outline only for `:focus-visible` leaves its near-black
`outline: auto 5px` on every mouse click. Use `:focus:not(:focus-visible)
{ outline: none }` and provide your own ring on `:focus-visible`.

## `box-shadow` does not paint on SVG geometry

A focus ring built from `box-shadow` is invisible on scene objects. Use a
`drop-shadow()` filter for them (`--focus-glow`) and keep `box-shadow` for HTML.

## Nesting an icon's viewBox inside another viewBox

`<use href="#icon">` re-applies the symbol's own `viewBox`. If the wrapping
`<svg>` repeats it, the glyph is drawn outside the visible area and the icon is
silently blank. Wrap with a neutral box: `viewBox="0 0 24 24"` and
`<use width="24" height="24">`.

## One wheel event, three devices

A trackpad two-finger swipe, a trackpad pinch and a mouse wheel all arrive as
`wheel`. Treating all of them as zoom makes a swipe lurch in and out.

- `ctrlKey` set → pinch → zoom
- pixel deltas, often with `deltaX` → swipe → pan
- line/page deltas, or large quantised steps with no `deltaX` → mouse wheel →
  zoom, because a mouse has no other zoom gesture

## An absolute epsilon in a relative world

Van Wijk's interpolator has a "same place, pure zoom" branch guarded by an
epsilon. Written for coordinates in [0,1], an absolute `1e-12` is far too small
for world units in the thousands: a gap of `1e-5` takes the general branch,
divides by it, and returns `NaN` for the whole flight.

Reached by pressing zoom-out while a zoom-in flight is still running — both aim
at the same centre. Make the epsilon relative to the viewport, and guard the
output for finiteness anyway.

## Panels classified by height reserve nothing when their content is short

"Fit" must avoid the area floating panels cover. Classifying a panel as a side
panel by its *height* fails: a detail panel is short when nothing is selected,
reserves no space, then grows on selection and covers the scene. Classify by the
edges a panel is anchored to.

## Locale leaks into anything you shell out to

`LC_NUMERIC=C` fixes decimal separators and nothing else. Dates still come back
in the shell's language, so the same generator produces different output from an
interactive session and from cron. Pin `LC_ALL`.

---

# Traps in the checking, not the code

Three times a check was wrong rather than the code. Distrust it when it
disagrees with the picture.

- **`offsetParent` is `undefined` on SVG elements**, so a "is it visible" guard
  written for HTML silently passes everything, and deliberately hidden icons get
  reported as broken.
- **A test point can land on a floating palette** rather than the stage.
  `elementFromPoint` will tell you what you actually clicked.
- **Aiming at the centre of an object often means aiming at its text**, which now
  behaves differently on purpose (law 3). Aim at the face.
- **A clipped element is not an overflowing one.** `overflow: hidden` with
  `text-overflow: ellipsis` always reports `scrollWidth > clientWidth`; that is
  the author truncating on purpose. Only content whose `overflow-x` computes to
  `visible` is actually spilling.
- **Audit the state the law is about.** "Nothing sits under a panel" is a claim
  about the *fitted* view. Any pass that moves the camera — and a double-click
  frames when an object has no interior — must be followed by a re-fit before
  the audit, or a correct app fails on wherever the last gesture left it.
- **Loading a page proves almost nothing.** A handler that throws on the first
  click looks perfectly healthy at rest. The harness exercises each page — pick,
  Escape, drag, fit, zoom — and that is what found the `NaN` above.
