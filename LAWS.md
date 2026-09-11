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

## Two more that are not interaction laws, but hold anyway

**Honesty is a component.** Label which constants are read from real code and
which were chosen for legibility. Compute prose from the model so it cannot
drift. Carry a permanent account of what the model leaves out. Prefer showing
over asserting: plot every value and let the reader find the cliff.

**Drive it, don't look at it.** A screenshot proves a frame; it does not prove
behaviour. And distrust the check itself — see `TRAPS.md`.
