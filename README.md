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

## Depth and the reading surface

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

## Verifying

```
node check/verify.mjs dist/myapp [more…]
CHROMIUM_PATH=/path/to/chrome npm run check:depth
```

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
