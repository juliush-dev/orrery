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
| `check/verify.mjs` | the laws as executable assertions, run against every app at three widths in both themes. |
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
```

Loads each app at 1440×900, 1180×760 and 400×780, in light and dark, then
**exercises it** — picks an object, presses Escape, drags, fits, zooms — and
asserts: the page never scrolls, no object or label ends up under a floating
panel, no visible icon renders blank, no panel overflows, fonts loaded, no
console error or failed request, every scroll container has a stable gutter.

Loading a page proves almost nothing. The harness found a `NaN` viewBox that
only appears when you interrupt one camera flight with another.

## Status

Five apps are built on this. It has one author so far, which is the honest limit
of the claim: the parts that are foundation and the parts that were convenient
for those five will only separate when someone builds a sixth.

MIT.
