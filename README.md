# Orrery

**Build operable models.** A stage that pans and zooms, a text layer floating
over it, and a set of laws that keep both honest.

An orrery is a mechanical model of a system that you turn by hand to understand
it. This is a kit for building those: a network you can interrogate, a protocol
call you can scrub through, a machine's state on instruments, a document you can
see the shape of.

It is not a component library. It is a **shell plus a controller plus a set of
rules**, and the rules are the valuable part — each one was bought by a specific
failure, and they are enforced by a harness you run.

**Building something with this kit? Read [AGENTS.md](AGENTS.md) first** — the
order to do things in, and the two files to read before writing a line.

---

## What you get

| | |
|---|---|
| `src/tokens.mjs` | one seed colour → 45 Material 3 roles per scheme, plus shape, elevation, state, motion and type tokens. Nothing downstream writes a literal colour. |
| `src/build.mjs` | inlines the tokens, the icons a page asks for, the web fonts and any partial. Output is self-contained: no CDN, no runtime fetches. |
| `partials/shell.css` | the chrome: titlebar, floating panels, buttons with one state layer, a branded focus ring, palette-tinted scrollbars, layout that does not move when a value changes. |
| `partials/motion.js` | camera flights (Van Wijk & Nuij), wheel navigation across three input devices, panel transitions, reduced-motion handling. |
| `partials/stage.js` | pan, zoom, pinch, picking, framing, and the interaction laws. ~120 lines every app would otherwise retype. |
| `check/verify.mjs` | the laws as executable assertions, run against every app at three widths in both themes, at default and enlarged text. |
| `LAWS.md`, `TRAPS.md` | why it behaves this way, and what fails silently if you write it yourself. |

## A whole app

```html
<style>
{{tokens}} {{fonts}} {{include:shell.css}}
</style>
<div class="titlebar"><h1>example</h1></div>
<div class="app">
  <svg id="stage" class="stage"><g id="world"><g id="content"></g></g></svg>
  <section class="hud notes">…</section>
</div>
<script>
{{include:motion.js}}
{{include:stage.js}}

const stage = createStage({
  svg: document.getElementById('stage'),
  content: document.getElementById('content'),
  objects: 'g.box',
  onPick: el => { /* your selection and your panel */ },
});
stage.fit();
</script>
```

`example/` is the complete version — about 110 lines for a working app with
camera, picking, panels, focus handling, reduced motion and the laws.

```
npm install
npm run build:example
npm run check
```

## Scenarios, views, and containment

These are independent choices:

| Choice | Use it when | Example |
|---|---|---|
| Scenario | Conditions or parameters change | Key missing; machine asleep |
| View | Representation or explanatory emphasis changes | Request flow; inventory |
| Interior | The reader looks inside a specific object | Server → worker |

Use links for other documents. A highlighted route may be a view if conditions
stay the same; if choosing it changes conditions, it is a scenario. Do not put
scenarios or views in the containment breadcrumb or manufacture interiors to
implement them.

Include `context.js` after `model.js` and use `createContextStage`. Put an empty
controls element after the titlebar, before `.app`; the kit supplies labelled,
wrapping Scenario and View groups of native buttons, not links or page tabs.

```js
const stage = createContextStage({
  svg, content, controls: document.querySelector('#contexts'),
  defaults: {awake: true, key: true},
  scenarios: [
    {id: 'ready', label: 'Ready', mode: 'replace', values: {}},
    {id: 'no-key', label: 'Key missing', mode: 'replace', values: {key: false}},
    {id: 'sleep', label: 'Put to sleep', mode: 'patch', values: {awake: false}},
  ],
  views: [{id: 'flow', label: 'Flow'}, {id: 'inventory', label: 'Inventory'}],
  initialScenario: 'ready', initialView: 'flow',
  build: ({settings, view}) => makeWholeModel(settings, view),
  onChange: (context, change) => updateReadingPanel(context, change),
});
```

`build(context)` synchronously returns a complete `createModelStage` model.
Keep it and its draw functions free of application-state mutations. Derive every
interior from the supplied settings and view. Keep stage and object IDs stable
wherever they represent the same location, even if labels or geometry change.

`stage.setScenario(id)` changes settings, retaining the view. `setViewMode(id)`
changes representation, retaining settings. `setSettings({key: false})` patches
settings for sliders and other manual controls. `context()` returns a read-only
snapshot `{settings, view, scenario}`. Camera `setView()` retains its existing
meaning; it does not choose a presentation view.

Settings are a flat object of strings, booleans, finite numbers or null; defaults
declare all allowed keys. Unknown choices or settings throw. A `replace` preset
starts from defaults, then applies its values. A `patch` preset explicitly
retains unspecified settings. Every preset must declare its mode. Its selected
indicator is recomputed from actual values: replace compares the complete
resulting settings, patch compares its declared keys. When several match, the
current choice wins, then declaration order. When none match, no scenario is
pressed and the controls say **Custom settings**.

On a change, Orrery validates the complete model and prepares drawings for the
root and each retained interior before replacing any of them. Failed validation
or drawing keeps the previous context, drawing and controls. Stable owner and
interior IDs preserve the containment path. If an interior disappears, the kit
returns to the nearest valid ancestor and announces why in a visible live
status. A different root ID starts at the root. Back and breadcrumb jumps always
restore parents drawn for the current context, never an earlier scenario.

Scenario and manual-setting changes retain cameras at retained locations. View
changes refit them because the representation may use different coordinates.
Context changes settle an in-progress depth transition and replace drawings
without a portal animation: selecting a scenario is not entering an object.
Selection is cleared because the picked SVG node has been replaced. Reduced
motion has the same result.

Use `onChange(context, {depth, previousDepth, returned, label})` for reading
panels and manual-control readouts. It also runs at initialization (`label` is
omitted there). Cancel app-owned playback in this callback and restart only
when appropriate; the kit cannot stop animation code that the app owns. Do not
mutate settings separately or update only root SVG IDs. Rebuild existing
documents with these partials to adopt this behavior; previously published HTML
is self-contained and does not update automatically.

See `example/context.src.html`, `npm run build:context` and
`npm run check:context` (set `CHROMIUM_PATH`). The check switches scenarios at
depth two, returns through parents, changes representation, removes interiors,
checks rollback on failed drawing, and activates the shared controls at three
widths with and without reduced motion.

## Depth and the reading surface

For a hierarchical model, prefer `createModelStage` (include `model.js` after
`stage.js`). One declaration supplies the stage objects, their index rows,
indentation and interiors:

```js
const stage = createModelStage({
  svg, content, // content starts empty
  model: {
    id: 'system', label: 'System', items: [
      {id: 'server', label: 'Server', draw: drawServer, interior: {
        id: 'server-services', label: 'Server', items: [
          {id: 'ssh', label: 'SSH', draw: drawSSH},
          {id: 'loopback', label: 'Loopback', draw: drawLoopbackBoundary,
            children: [{id: 'worker', label: 'Worker', draw: drawWorker}]},
        ],
      }},
      {id: 'workstation', label: 'Workstation', draw: drawWorkstation},
    ],
  },
});
stage.fit();
```

Each `draw(g, item)` draws that object's own geometry in stage coordinates.
Orrery owns its SVG object group, accessible name, child groups and index row.
Every object, including a grouping boundary, must draw geometry. `children`
expresses containment within the current stage; `interior` is a separate stage
entered through an object. The containing object's name stays in the path and
is not automatically inserted as a selectable row among its own contents.

Stage IDs are unique throughout a model; object IDs are unique within each
stage. Cycles, duplicate IDs and reused object instances are rejected. Sharing
the same interior instance between different objects requires `shared: true`
on that interior. A common drawing function is fine: give distinct stages their
own IDs and data. `validateStageModel(model)` checks this contract before drawing.
It cannot determine whether an author's two separately declared interiors are
factually correct or genuinely different.

Use `stage.refresh()` after changing interior capabilities, and `stage.redraw()`
after changing the live model's objects or drawing data. Both validate the model;
redraw rebuilds the live drawing and its index together. `stage.enter(node)`
uses the interior declared on that object. Failed redraws keep the previous
valid drawing. The model API owns
`objects`, `index` and `onEnter`; do not also supply those callbacks. See
`example/model.src.html` and `npm run build:model` for a working example.

The lower-level `createStage` API remains available for custom SVG and indexes:

An object with an interior is entered rather than framed:

```js
createStage({
  objects: 'g.card',
  rootLabel: 'the eight',
  nav: '[data-nav]',                       // the panel that indexes the level
  index: (host, ctx) => renderContents(host, ctx),
  onEnter: el => hasInterior(el) ? {
    label:   nameOf(el),
    draw:    g => drawInside(g, el),
    objects: 'g.facet',                    // what is pickable in there
    index:   (host, ctx) => renderFacets(host, ctx, el),
  } : null,
  onDepth: (depth, path) => { /* optional */ },
});
```

Double-clicking such an object expands its interior from the object as the outer
stage enlarges and fades away. Leaving reverses that relationship: the interior
contracts into its object while the parent returns to its saved camera. Both
levels share the same spatial transition, even when their drawing coordinates
are very different. Each level has its own camera, pickable objects and index.
A level is not a different app: whatever works at the top works there.

Depth changes skip animation under reduced motion or muted motion. A new
navigation or camera gesture finishes the current depth change before taking
over, so no delayed entrance can reopen a level after Back. `stage.fit()` fits
the current level, including when called directly by the app.

Mark the indexing panel with `data-nav` and the kit puts a **Back** control at
its head, visible only at depth — and moves it to the view palette on a window
narrow enough that the panel is behind a toggle.

Enterable objects carry an **Enter** button on the stage. Use `ctx.bind(row,
node)` in an index renderer to give that object's row the same button. Leaves
have neither button. The action works with a click, touch, or keyboard; it is
separate from selecting, framing, or hiding the object. The stage controls
stay readable as the camera zooms and do not affect Fit bounds.

Mark the object's **face** — the shape the reader recognises as the object — with
`data-face`, and the Enter mark anchors to that box rather than to everything the
object's draw callback put in its group. The object's bounds are its drawn
geometry, so a heading, a caption or a badge drawn above the card would otherwise
raise the mark with it, and the mark would sit in the air over the object.

A face belongs to the object that declares it. An object's children are drawn
inside its group, so the kit takes the first `data-face` whose own object is this
one and falls back to the group when there is none — an object without a face
does not borrow its child's. Declaring it is optional and stays that way: where
the group is the shape, which is most objects, the fallback is already right.

The Enter control has one resting appearance everywhere: the door glyph alone,
with the word arriving on hover or keyboard focus. Stage and index controls use
the same markup, easing and timing; reduced motion reveals the word at once. Do
not draw your own entry marker — use the kit's, in the scene and in the index,
and it stays consistent at every zoom and every depth.

Stage controls retain their screen size under camera zoom. Their right edge
stays six screen pixels inside the object's right edge, and the label expands
inward. The control follows the object's corner even when that corner leaves
the viewport; it is clipped, never pinned somewhere else on the screen. This
also works in a container scaled with CSS zoom or a scale transform. An object
too small to carry the mark wears none, and one too narrow for the whole word
keeps the glyph alone; the index row still enters it either way.

After `npm run build:depth`, `npm run check:enter-motion` samples the real hover
transition in Chrome (set `CHROMIUM_PATH`). It checks the fixed corner during
expansion, collapse, camera zoom and scaled embedding, as well as shared timing
and reduced motion. The document harness also flags missing shared controls or
labels that are permanently expanded.

`onPick(node, why)` is told why it was called. `why.dbl`, `why.keyboard` and
`why.index` name the gesture; `why.escape` is a cleared selection; `why.depth`
marks a level change, and `why.depth && why.back` is the one to handle — the
reader came back out of an interior, the kit has re-selected the object they
came from, and the camera is already being restored to where they left it. An
app that frames what it picks must not frame that one.

`onEnter(node)` is a pure descriptor lookup: return an interior descriptor or
`null`, without drawing or changing application state. Orrery consults it when
refreshing capabilities, not only on double-click; `draw` runs only on entry.
Call `stage.refresh()` after redrawing objects or changing their interiors to
refresh both markers and index. Initialization is deferred until the app's
script has finished. See `example/depth.src.html` for a complete nested example.

```js
index(host, ctx) {
  for (const node of ctx.content.querySelectorAll('g.card')) {
    const row = document.createElement('div');
    row.textContent = node.getAttribute('aria-label');
    ctx.bind(row, node);  // adds Enter only when this object has an interior
    host.appendChild(row);
  }
}
```

`ctx.content` is the actual group belonging to the indexed level, including
ancestor previews. Previews are inert and their Enter controls are disabled.

Each interior declares its own `objects` selector and optional `onEnter`
resolver. Root selectors, entry handlers and index renderers are **not inherited**.
Without an interior index renderer, Orrery builds rows from that stage's actual
SVG object ancestry. A missing `onEnter` means its objects are leaves. This
prevents a root callback from reopening the same interior for every descendant.

Custom renderers must bind one row per indexed object with `ctx.bind`; binding
an object from another stage (including the entered parent) throws. Binding also
sets indentation from SVG ancestry. Keep non-object controls outside the object
index. The verification harness checks row coverage, scope and depth. Reusing a
callback descriptor or its `id` for different owners also requires `shared: true`.
For older apps, move root callback logic into the appropriate interior
descriptors and replace manually maintained indentation with `ctx.bind`.

The **path** goes in the title bar, in the slot a static `.sub` subtitle would
hold — the kit creates it, so no markup is needed. It is a fact about the app,
not about one panel that can be collapsed or hidden, and not small print at the
bottom edge either. Its steps are buttons: clicking one returns to that level
in one move, hovering one previews that level's index in place, dimmed and
inert. Escape comes up a level.

## How this works

Every app gets a help control in its view palette. It opens a sheet above the
palette carrying the app's own running hint — move your guidance into an
element with id `st-hint` and the kit relocates it there, wherever you put it —
followed by the gesture vocabulary, which the kit writes and which is the same
in every app. The sheet is marked `data-transient`, so it reserves no room in
Fit and never counts as occluding the scene; Escape, the close control, or a
click anywhere else dismisses it.

Anything else that sits above the view palette — a playback bar, a legend —
gets `data-above-tools` and no `bottom` of its own. The kit measures the
palette and stacks them, on load, on resize and whenever the text size changes
the palette's height. A constant offset there is only true until the palette
gains one more control.

Your `index(host, ctx)` fills `host` with the rows for `ctx.level`. When
`ctx.live` is false it is a preview: build the rows, register nothing, wire
nothing. Re-apply your own selection mark on every live render — the kit calls
it again whenever the level or the preview changes. An app with no `data-nav`
panel keeps Back in the view palette.

Any panel marked `data-expandable` gets a control that opens it as a full
reading surface over a scrim, with a measure of 68ch. Escape closes the reader
first, then comes up a level — so one key always means "less", never "lost".

Reading panels (`data-expandable`) and left navigators (`data-nav`) have a
shared 320px minimum width, including when docked. On smaller windows the
minimum contracts to the available width with 14px clearance on each side.
Authors can choose a larger width; a smaller `width` will not squeeze the panel.

The same panel also gets a **Center reading panel** tablet control. It places a
portrait reader 14px above the status bar, up to 360px wide and 500px tall (at most
60% of the stage height). Widen increases its measure to 560px; full-page and
Escape preserve its position and width. The idle tablet fades to 18% opacity;
hover or keyboard focus restores opacity. **Always opaque** keeps it readable
permanently, and touch devices stay opaque. Fit leaves the upper stage clear.
Run `npm run check:panels` for the panel interaction and viewport checks.

When a navigator exists, the centered reader also offers **Dock navigator beside
reader**. It brings the left panel alongside with a 12px gap; only the reader
offers this action. Undocking the reader restores both panels. Widening and
full-page preserve the pair. Below 720px, the pair temporarily uses the normal
responsive layout to preserve panel minimum widths. See the model example and
`npm run check:pairing`.

Floating focus changes use the camera's final view to choose one landing place,
so the panels do not reverse direction while the camera zooms out and settles.
Direct pan/zoom interrupts the glide immediately. `npm run check:pair-motion`
checks the path frame by frame, including enlarged text and reduced motion.

Zoom, Fit, help and text-size controls occupy separate cells at the right end of
the status bar. On small windows an ellipsis cell reveals them in a drop-up;
Escape or an outside click closes it. Back remains visible at depth. Existing
`.tools` markup is moved there automatically. Opening the drop-up never moves
the tablet or refits the stage.

## Text scale

Every app gets a text-size control in its view palette, injected by the kit:
smaller, a percentage that resets on click, larger. `+` / `-` / `0` work from
the keyboard (never while typing in a field), and the choice is remembered per
viewer.

It scales the text layer only — the stage keeps its own camera. That separation
matters because browser zoom would rescale both at once, and ctrl+wheel is
already pinch-zoom for the scene.

## Configuring identity

`orrery.config.json` holds the parts that are *identity*, not foundation:

```json
{ "seed": "#00707F", "successSeed": "#1F6F4A", "warnSeed": "#8A5A00",
  "fonts": [ … ], "sansStack": "…", "monoStack": "…" }
```

Change the seed and every surface, container, outline and state colour re-tones
together, in both schemes. Point `ORRERY_CONFIG` at another file to build a
differently-branded app from the same sources.

## Building a page

```
node src/build.mjs path/to/app.src.html out/index.html
```

Placeholders the builder resolves:

| | |
|---|---|
| `{{tokens}}` | the generated token layer |
| `{{fonts}}` | `@font-face` rules; the woff2 files are copied next to the output |
| `{{include:name}}` | a file from `partials/` |
| `{{icon:name}}` / `{{icon:name:20}}` | an inline Material Symbol |
| `{{iconpath:name}}` | the bare path data, for `<symbol>` definitions scripts reference with `<use>` |

An unresolved placeholder is a build error, so a typo cannot ship.

The builder owns the fonts because it writes the `@font-face` rules: it copies
each woff2 into `fonts/` beside the output and references it relatively. Every
other asset — images, audio, data files — belongs to the document. Reference
them by relative path from the output page and put them in the output directory
yourself; the builder neither copies nor rewrites them. The rule they must keep
is the one the fonts keep: a published page fetches nothing from the network.

## Verifying

`playwright-core` bundles no browser. Install one with `npx playwright install
chromium`, or point `CHROMIUM_PATH` at a Chrome or Chromium you already have.

```
node check/verify.mjs dist/myapp [more…]
CHROMIUM_PATH=/path/to/chrome npm run check:depth
```

For the supplied hierarchy examples, run `npm run build:depth` and
`npm run build:model`, then `npm run check:affordances` and `npm run check:model`
with `CHROMIUM_PATH` set to your Chrome/Chromium executable. The latter checks
ownership, duplicate IDs, cycles, index ancestry and preservation after an
invalid redraw, as well as normal navigation.

Loads each app at 1440×900, 1180×760 and 400×780, in light and dark, then
**exercises it** — picks an object, presses Escape, drags, fits, zooms — and
asserts: the page never scrolls, no object or label ends up under a floating
panel, no visible icon renders blank, no panel overflows, fonts loaded, no
console error or failed request, every scroll container has a stable gutter.

Loading a page proves almost nothing. The harness found a `NaN` viewBox that
only appears when you interrupt one camera flight with another.

The depth check samples intermediate frames at all three widths, with and
without reduced motion. It checks portal alignment, zoom direction, both
layers' fades, camera restoration, nested breadcrumb jumps and interrupted
navigation. Set `DEPTH_SCREENSHOTS` to an output directory to capture the wide
view's entry and exit frames.

## Demo

**[The Eight Elements](https://spicy-beacon-c58m.here.now/)** — a public app built with the kit.
Eight elements of expertise laid out side by side because they fire together; three worked examples
that light each element with the contribution the source text names for it; and the document's own
self-diagnostic made operable, so you can mark what you have and read the composite.

Its text is parsed from the source markdown rather than retyped, so the demo cannot drift from the
document — and where the source names seven of eight contributors while asserting that all eight
fire, the demo lights seven and says so.

## Status

Five apps are built on this. It has one author so far, which is the honest limit
of the claim: the parts that are foundation and the parts that were convenient
for those five will only separate when someone builds a sixth.

MIT.
