# The laws

Six rules of interaction. None was reasoned out in advance — every one was
bought by a specific failure, and each is stated with the failure that produced
it, because the failure is what makes the rule memorable.

`check/verify.mjs` enforces what can be enforced mechanically. The rest is
authoring discipline.

---

## 1. Direct manipulation is instant; the system eases

What the person drags, pinches or scrubs follows the input exactly. What the
system moves on their behalf — fit, frame, the zoom buttons, opening a section —
eases along a path.

Easing a drag reads as lag: the finger and the thing disagree. Cutting a
system-initiated move reads as a glitch: something teleported.

Camera flights use Van Wijk and Nuij's smooth zooming and panning (2003), which
pulls back over distance and supplies its own duration, so a short hop is quick
and a long journey is not. Flights are interruptible and are skipped entirely
under `prefers-reduced-motion`.

> **Bought by:** camera moves that teleported. The obvious correction — easing
> everything — would have traded one fault for its opposite.

## 2. One control, one meaning

A control does the same thing on every row it appears in. In a scene tree the
eye changes visibility and the label frames its subject: never both, never
swapped depending on the row.

> **Bought by:** a tree where a label selected an object but *hid* a collection.
> Nothing was broken; the same control was simply doing two different jobs.

## 3. Text is the exception on a manipulation surface

The stage is not selectable — a double-click there would grab a label and a drag
would smear a highlight across the scene. But labels carry real values, so a
drag that begins on a `<text>` is handed to the browser rather than the camera,
with a text cursor to say so. Reading panels are selectable; chrome is not.

> **Bought by:** first the stage selected text while panning. Then making it
> unselectable locked away the only thing on it worth copying.

## 4. Motion belongs to the commit, not to the frame

A dragged control emits a value continuously. While the value is provisional the
drawing tracks it exactly, with motion muted and the camera still. On release,
the transition plays and the view re-fits.

> **Bought by:** a slider that ran the full committed-change path on every input
> event — panel fades restarting every 16ms and a camera flight cancelling the
> one before it. It looked broken until you let go.

## 5. Layout must not change size as a value changes

Live readouts use tabular figures, never wrap, and reserve the width of their
longest possible value. Labels beside them never wrap. Scroll containers use
`scrollbar-gutter: stable`.

> **Bought by:** at "1 min 30 s" a readout grew, squeezed its label onto a second
> line, and the row jumped from 26 to 44 pixels — then back again as the value
> fell. Separately, an arriving scrollbar reflowed the prose beside it.
>
> A panel holding a reserved readout must be wide enough for it *plus* the
> gutter: reserving the gutter costs about 11px of inner width.

## 5a. The text layer scales without touching the stage

The stage has a camera. The text layer needs its own scale control, or the only
way to enlarge the reading is browser zoom — which rescales the scene too, and
collides with ctrl+wheel already meaning pinch-zoom here.

Scale the *content* of panels, not their boxes: zooming a floating panel scales
its box but not its offsets, so it grows past its own edges and starts covering
the stage. With geometry fixed, larger text simply means more scrolling.

> **Bought by:** the first implementation zoomed whole panels. At 150% the view
> palette grew to 431×73, hung 57px below the stage, and content slid under it.

## 6. The viewport must never lose the user

On a stage that pans, the selected object may be off-screen, so a highlight
alone is not an answer. Selection is reported in the object, in the list, and in
the status bar, and Fit and Frame are always one click or one double-click away.

> **Bought by:** selection shown only as a stroke in the scene, invisible the
> moment you panned away from it.
>
> And: a corner palette that reserved no space let content slide underneath it.
> The law held only by coincidence of layout until a larger text size grew the
> palette. Anything docked to an edge reserves its extent, however narrow.

## 7. Depth belongs to the model, not to the layout

Every subject worth drawing is hierarchical: a machine holds services, a
document holds sections, a call holds a turn that holds tool calls. A single
flat stage forces you to pick one level and flatten the rest, and the strain
shows up as a layout problem that has no layout answer — forty sections on one
canvas, or an "opaque block" a model admits it cannot open.

An object with an interior is *entered*, not framed. Entering pushes a level
with its own content and its own camera; leaving restores both. Because the
viewport must never lose the user, depth is always named in a breadcrumb, Back
appears only at depth, and Escape comes up a level — after closing anything
modal first.

The transition must preserve that containment visually. On entry the interior
starts within its object's bounds, expanding as the outer stage enlarges and
fades. On exit the interior contracts into that object while the outer stage
returns to its saved camera. Both layers remain present during the transition;
unrelated drawing coordinates must never become a visible camera jump. A
breadcrumb jump composes the intervening containment transforms in one move.

## 7a. A level is not a different app

**The drawing and index have one hierarchy.** `createModelStage` derives both
from the same `items` and `children`, with explicit `interior` ownership. The
object you entered becomes context in the path; it is not an extra row in its
own contents. Grouping objects have drawn geometry and their children nest in
both views. A shared interior is explicit, not an accidental reused descriptor.

For custom stages, `ctx.bind` rejects rows from other levels and derives their
indentation from the indexed SVG. The harness checks that every stage object
has one bound row, with matching scope and depth. Root index, object and entry
callbacks never silently fill in for missing interior declarations.

**Enterability is visible before activation.** The same Enter control identifies
an object's interior on the stage and beside its index row. Leaves have no
Enter control. Picking and visibility controls keep their own meanings; entering
does not depend on discovering an unadvertised double-click gesture. Bind custom
index rows with `ctx.bind(row, node)` so both surfaces use the same capability.

**A mark on an object wears its glyph and reveals its word.** The Enter control
is permanent — an interior you can only find by hovering everything is not
advertised — but a scene of eight cards each carrying the word *Enter* reads as
eight buttons glued to a drawing. So the resting state is the door alone, and
the word arrives on hover or focus, where it names what you are about to open.
This is the kit's control, in the scene and in the index alike; an app that
draws its own entry marker gets neither the behaviour nor the consistency, and
the reveal must look the same in both places.

Two properties make the difference between a mark and a sticker, and both were
bugs first:

- **It stays on its object.** The mark is pinned inside the object's top-right
  corner, never beyond it, and an object too small to hold the mark does not
  wear one — the index still enters it. A fixed-size control anchored to a
  corner that keeps shrinking ends up floating beside a distant speck, which
  reads as belonging to nothing.
- **It does not move while it opens.** The control is anchored by the edge it
  is pinned to, so the word grows inward, towards the middle of its own object.
  Anchor it by the other edge and every reveal shoves it out over the object's
  border and then snaps it back when the position is recomputed — the same
  animation that is calm in the index looks broken in the scene. Where the
  object is too narrow for the whole word, the mark stays a glyph rather than
  opening on to a clipped one.
- **The glyph keeps its size.** It is chrome, not scenery: camera zoom moves
  the object under it and never scales the door itself, and the same reveal —
  same markup, same easing, same duration — runs in the scene and in the index.
  Under reduced motion the word simply appears.

Depth costs nothing to add and everything to get wrong. The moment you are
inside something, all the mechanics must still be there: picking marks what you
picked, the index lists *this* level rather than the one you came from, and the
way back is named where navigation lives.

Three things follow, and each of them was a bug before it was a rule.

- **The pickable set belongs to the level.** A stage that keeps the top level's
  object selector inside an interior silently picks nothing there — every click
  reads as "clicked the background", so selection appears to have been turned
  off one level down.
- **The navigator follows the level.** An index still listing what you left is
  worse than no index: it invites you to act on objects that are not on the
  screen. Entering swaps its contents; leaving restores them.
- **Back belongs beside the index, not in the view palette.** Going up a level
  is navigation; the palette is about the camera. Back appears only at depth,
  at the head of the list it returns you to — and moves to the palette on a
  window narrow enough that the navigator is behind a toggle, because the way
  out of a level must never be hidden.
- **The path continues the title.** Where you are is a fact about the whole
  app — the index, the reading pane and the selection all changed with the
  level — so it cannot be a property of one floating panel that collapses and
  hides. Nor is it status: the status bar reads out what is true of the moment,
  in small print at the bottom edge, and the address of what you are looking at
  is neither small print nor a reading. It is the name of the thing on the
  screen, which is what the title bar is for. So it goes in the slot the static
  subtitle held — `homepi-runbook` showing `runbook / What this machine is` has
  said more about itself than "document map" ever did — and it stays off the
  stage, where a floating path bar would cover the scene. Each step is a
  control: it returns to that level, and hovering it previews that level's
  index in place, dimmed and inert, so you can look before you go.

## 7b. Guidance is not state

Every app had a sentence of instruction parked in the status bar — the widest
cell in it, holding the least durable thing in it. Guidance does not change as
you work; it is what you read once and then stop needing. Keeping it on screen
forever cost the readouts that *do* change the width they needed, and at phone
width it truncated into nonsense.

It goes behind a control, beside the other controls for the surface it
explains, and opens as a sheet you dismiss. A sheet you dismiss reserves no
room: fitting the scene around something you are about to close would move the
scene out from under you.

Two things belong in it, and neither belonged in a status cell: the app's own
running hint, which is the only part specific to here and now, and the gesture
vocabulary — which is identical in every app built on the kit and had never
been written down anywhere a user could find it.

A result is not guidance. A search that reports "3 of 8 sections match" is
state, and it belongs beside the box you typed in, with its width reserved.

## 8. The text layer can take the whole surface

Beside a scene, a panel is an annotation. A document deserves the room and the
measure. A reading panel marked expandable can become the surface — full height,
a proper line length, the stage receding behind a scrim — and returns to the
side when dismissed, with the scene exactly as it was left.

It applies to every reading panel, not the ones that happened to be open in the
editor: a panel that behaves differently between two apps of the same system is
law 2 broken across apps rather than within one.

This is the reason the two belong together: with reading moved out of the
sidebar, the stage is free to be fully occupied by nested content instead of
competing with prose for width.

---

## 9. No chrome may be larger than the window

The view palette grew a control at a time — Back, then the text size, then the
help — until at phone width it was wider than the screen. Nothing looked
broken: the container has `overflow: hidden`, so there was no scrollbar to
notice. But focusing the last button scrolled the whole app sideways, and every
panel and every reading of `getBoundingClientRect` was then off by 211px
against a scene that had not moved.

Chrome wraps, is bounded by the window, and drops its words before its icons.
The checker asserts that the app container can neither scroll nor be scrolled.

And nothing stacked above it may hold a constant offset. peer-sim's playback bar
carried `bottom: 78px` — true of the palette on the day it was written, and
false the moment the palette gained a control, because the palette also wraps at
phone width and grows with the text size. Anything above it is placed from where
it actually is, measured, on load, on resize and on every text-size change.

## Two more that are not interaction laws, but hold anyway

**Honesty is a component.** Label which constants are read from real code and
which were chosen for legibility. Compute prose from the model so it cannot
drift. Carry a permanent account of what the model leaves out. Prefer showing
over asserting: plot every value and let the reader find the cliff.

**Drive it, don't look at it.** A screenshot proves a frame; it does not prove
behaviour. And distrust the check itself — see `TRAPS.md`.
