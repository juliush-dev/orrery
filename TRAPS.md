# Traps

Things that look like working code and fail silently. Each cost real time at
least once; the first cost it three times.

---

## Updating root IDs leaves interiors in a different scenario

An SVG-wide reset followed by updates to root-only IDs clears the active
interior without applying the new explanation there. Redrawing only the live
level is also insufficient: Back then restores a parent with old conditions.
Use `createContextStage` and return a whole model from its context builder.
Do not use a scenario ID as a stage ID: that needlessly destroys the reader's
location. Keep IDs for the same components stable across scenarios and views.

Handwritten preset handlers also commonly use `Object.assign` without deciding
whether values should carry over, then leave a button pressed after manual
edits. Declare replace/patch semantics and let the context controller derive
pressed state from the settings. For playback, cancel the old run on context
change; a callback holding detached SVG nodes is still stale application code.

## A catch-all interior loses the model's hierarchy

For depth, a separate authoring trap is a catch-all `onEnter` or a reused
interior descriptor that opens the same drawing for every object. An interior
needs its own object selector and entry resolver; root callbacks are not
inherited. Prefer `createModelStage`, whose `items`, `children` and `interior`
define both the drawing hierarchy and index. Reuse of a stage by different
objects must be intentional (`shared: true`). A parent that has become the
current stage's context belongs in the path, not in a ghost index row.

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

## Decoration inside an object group lifts the Enter mark off the card

An object's bounds are everything its `draw` callback put in the group, and the
Enter mark is pinned to the top-right of those bounds. A row heading, a caption
or a badge drawn at `y - 16` inside the group therefore raises the bounds by 16
and the mark rides up with them — out over the card and into the air above it.

Declare the shape with `data-face` (`<rect data-face ...>`), and the mark anchors
to that box instead, at every zoom. Without it, keep the object's group to the
object's shape: nothing that is not the object belongs in it.

An object's children are drawn inside its group, so the face has to be the
object's own. A `querySelector('[data-face]')` on the group finds a *child's*
face wherever the parent declares none, and pins the parent's mark to the child —
the same sticker bug, reached through the fallback that exists for compatibility,
in exactly the half-migrated document that fallback is for. Scope the search to
the object: the first face whose nearest object ancestor is this node.

> Bought by: two cards of six wearing their door above the top-right corner.
> Nothing failed — the harness compared the mark with the object's bounds, and
> the bounds it compared against included the heading.

## `onPick(null, {depth:true})` is a level change, not a deselect

Opening a level reports the change with a null node — `onPick(null, {depth:true})`
on entry, `onPick(owner, {depth:true, back:true})` on the way out, and
`{escape:true}` only when Escape is pressed at the root. An app that clears its
reading panel on every null call blanks the panel at the moment the reader goes
inside.

Guard the guard. Whatever else the handler does on a level change — hiding the
chrome that belongs to the level above, restoring a hint, updating a count — must
run *before* any early return, or the return silently drops it for exactly the
calls it intercepts.

> Bought by: a panel that blanked on entry, and, in the same handler, root-level
> flow arrows still drawn over the interior, because the line that hides them sat
> below the return.

## A layer under the objects hides whatever does not fit between them

Objects paint in document order, so a labels or flow layer created before the
content is painted underneath it. A label wider than the gap it sits in is not
clipped and does not warn: it is covered, and the reader sees half a word. Size
the gap to the widest label, centre the label in the gap, and derive its position
from that geometry rather than tuning an `x` by eye — the whole scene scales, so
a label that clips at one zoom clips at every zoom.

> Bought by: "consult" and "read again" set at a 40-unit gap, showing a first
> letter on one side of a card and a last letter on the other.

---

# Traps in the checking, not the code

Three times a check was wrong rather than the code. Distrust it when it
disagrees with the picture.

- **`offsetParent` is `undefined` on SVG elements**, so a "is it visible" guard
  written for HTML silently passes everything, and deliberately hidden icons get
  reported as broken.
- **A test point can land on a floating palette** rather than the stage.
  `elementFromPoint` will tell you what you actually clicked.
- **A rounded corner is not part of the shape.** Clicking at `x + 8, y + 8` of a
  card with `rx: 14` lands *outside* it: `elementFromPoint` returns the
  background and the gesture silently does nothing. This has produced three
  false negatives — a double-click that "did not frame", one that "did not
  enter", and a pan that "did not work". Aim at the middle of an edge, or at the
  element's own `getBoundingClientRect` centre offset inward past the radius.
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

- **A nested level keeps the parent's object selector.** The stage hit-tests
  with one `closest(selector)`; draw a level whose objects are `g.block` while
  the selector still says `g.sec`, and every pick inside returns null. Nothing
  errors, nothing logs — selection just stops existing one level down, which
  reads to the user as "the app broke when I went inside". The selector, the
  index and the camera all belong to the level, not to the stage.
- **The navigator paints before the app exists.** `createStage` is called in the
  middle of the app's own script, so an index function that closes over a
  `const` declared below it hits the temporal dead zone. Same shape as the
  `onDepth` trap: the kit defers its first paint by a microtask, which runs
  after the whole script has finished.
- **Repainting an index drops the selection.** A list rebuilt from the model has
  no memory of which row was highlighted, so previewing another level and coming
  back silently clears the mark. Selection lives in the model; every render
  re-applies it.
- **A control that grows must be anchored where it grows from.** The Enter mark
  sits at an object's top-right. Positioned by `left = right − offsetWidth`, the
  hover reveal widens it to the right, over the object's border, and the next
  reposition pulls it back — a shove-and-snap on every hover, while the same
  control in the index, laid out by flexbox, is perfectly calm. Anchor it by
  `right` and the width change moves nothing. The rule generalises: an animated
  size change must not feed back into the position that produced it.
- **A fixed-size mark on a shrinking object drifts off it.** Screen-space chrome
  keeps its size while the scene zooms out, so a badge pinned to a corner of a
  50px object is mostly outside it and reads as a loose sticker beside a speck.
  Clamp the mark inside the object's box and hide it when the object is smaller
  than the mark; the index still offers the same action.
- **A kit rule keyed to an app's class names is not a kit rule.** `user-select`
  was switched off for every panel and back on for `.annot`, `.reader` and
  `.detail` — the names the first three documents used. Nothing failed loudly:
  every later panel simply could not be selected, and the index never could.
  When the kit must exempt something, key the exemption on what the kit itself
  defines (`.hud`, `.tools`, `data-nav`), never on vocabulary an app chose.
- **A model-derived object has no element id, so anything keyed to `node.id`
  checks nothing.** The Enter mark recorded which object it names in
  `dataset.marks`, read from `node.id`. `createModelStage` builds its objects
  with `dataset.objectId` and no `id` at all, so on every model-derived stage
  that attribute was the empty string — and the harness rule that asserts a mark
  stays inside the object it marks looked up `getElementById('')`, found
  nothing, and silently had nothing to compare. A whole class of stages was
  exempt from a check that reported itself as passing. Identity that the kit
  itself assigns must be read from where the kit put it (`dataset.objectId`
  first, `node.id` only as a fallback), and a check should ask the mark for its
  object through `orreryObject` rather than looking an id back up.
- **A check that measures an object measures its group, not its shape.** The
  group is the drawn geometry and can carry a heading, a caption or a badge that
  is not the object; anything that sorts, groups or aligns objects by that box
  reads a position the reader never sees, and reports a contradiction that is not
  there. Measure `data-face` where the object declares one, scoped to that object,
  and only fall back to the group — the same box the Enter mark pins to. A rule
  about arrangement that is silent across every document on the machine may be
  silent because it is measuring the wrong box.
- **Overlapping an object's bounds is not being hidden by it.** An object that
  paints nothing where a label sits — an outline, a hit area, a group whose shape
  is drawn elsewhere — leaves the label perfectly readable. A covering test built
  from bounding boxes alone reports it anyway, and a rule that reports correct
  work is one authors learn to route around.
- **`#content` is not the live level one level down.** `createModelStage` draws
  the level you are inside into its own layer beside `#content`, which keeps the
  root drawing. A query for `#content g.orrery-object` at depth returns the level
  above — every one of its objects with a zero-size rect, which reads as "the
  level is empty" rather than "you are looking at the wrong layer". Address the
  live level as `[data-stage-live]`, and filter measured elements by a non-zero
  box when the layer is not known.
