# Start here

You are about to build an operable model with this kit. Orrery is not a
component library — the rules are the product, and each one was bought by a
specific failure. Follow this order. Steps 1 and 2 are the ones that get
skipped, and skipping them is how a document ends up looking right and being
broken one level down.

## 1. Read `LAWS.md`, then `TRAPS.md`

Before you write a line.

`LAWS.md` is the specification: direct manipulation is instant while the system
eases, layout never changes size as a value changes, a level is not a different
app, guidance is not state, no chrome may be larger than the window, conditions
and representation and location are three separate things.

`TRAPS.md` is the list of things that fail **silently** if you write them
yourself — a nested level keeping the parent's object selector, so picking
quietly stops existing inside it; a repainted index dropping the selection; a
`hidden` attribute losing to a class that sets `display`; a helper name that
collides with the kit's and kills the page before any of its code runs. None of
these announce themselves. You will not rediscover them by testing by hand.

## 2. Choose the entry point by the shape of the subject

| The subject is | Use | Example |
|---|---|---|
| objects containing objects, a real hierarchy | `createModelStage` | `example/model.src.html` |
| that, plus conditions or alternate representations | `createContextStage` | `example/context.src.html` |
| a bespoke drawing with its own callbacks | `createStage` | `example/example.src.html`, `example/depth.src.html` |

Declare the model where you can. The model API derives the index, the entry
affordances and the Fit bounds from one description, so they cannot drift apart.
Reach for `createStage` when the drawing is genuinely bespoke, not to avoid
learning the model.

A scenario changes conditions. A view changes how the system is explained. An
interior changes which component the reader is inside. Never implement one of
them with another — do not manufacture an interior to switch a representation,
and do not put a scenario in the containment path.

## 3. Copy the nearest example as your skeleton

Do not start from an empty HTML file. The examples are the shortest correct
starting points; everything you would otherwise rediscover is already in them.

## 4. Author one `.src.html`, then build it

```
node src/build.mjs my-app.src.html out/index.html
```

Use the placeholders: `{{tokens}}`, `{{fonts}}`, `{{include:shell.css}}`,
`{{include:stage.js}}`, `{{icon:name:size}}`, `{{iconpath:name}}`. An
unresolved placeholder is a build error on purpose.

- **Never write a literal colour.** Identity lives in `orrery.config.json`: one
  seed becomes 45 Material 3 roles per scheme. A hard-coded hex breaks theming
  and contrast at once.
- **Never fetch at runtime.** The output is one self-contained file — no CDN,
  no network, no fonts pulled at load.
- **Use the kit's controls.** The Enter mark, the path in the title bar, Back,
  the help sheet, the text-size control, the widen and expand controls on a
  panel are all supplied. An app that draws its own gets neither the behaviour
  nor the consistency.

The markup contracts worth knowing before you invent your own: `data-nav` on
the panel that indexes the level, `ctx.bind(row, node)` on every index row,
`data-expandable` on a reading panel, `data-above-tools` on anything stacked
over the view palette, `id="st-hint"` on your running guidance, `data-transient`
on a surface the reader dismisses.

## 5. Run the harness, and believe it over your screenshot

```
node check/verify.mjs out            # the laws, 3 widths x 2 themes, normal and enlarged text
npm run check:depth                  # camera and level transitions
npm run check:model                  # model-derived stages
npm run check:affordances            # entry affordances
npm run check:enter-motion           # the Enter mark, frame by frame
npm run check:context                # scenario / view / depth
```

A page that loads proves almost nothing: a handler that throws on the first
click looks perfectly healthy at rest. The harness drives each page — picks,
enters, escapes, drags, fits, zooms, widens, opens help — which is what finds
the real failures.

When the harness disagrees with the picture, one of them is wrong and it is
worth ten minutes to learn which. Roughly a third of the failures reported
during this kit's development were the checker's own fault, and every one of
those ended as a fix to the checker, not a suppression.

## 6. If you change the kit itself

A behaviour change without a law is an opinion, and the next agent will undo it.
So: add the rule to `LAWS.md` with the failure that bought it, add the silent
failure mode to `TRAPS.md`, and add the executable assertion to `check/`. Then
rebuild every example and every dependent document — published pages are
self-contained, so they do not inherit a fix until they are rebuilt.

## Done means

Every suite green at every width and both themes, every dependent document
rebuilt, and any new rule written down where the next agent will read it.
