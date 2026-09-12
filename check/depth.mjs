// Spatial regression: inspect intermediate frames, not just the final depth.
// CHROMIUM_PATH=/path/to/chrome node check/depth.mjs
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const motion = readFileSync(new URL('../partials/motion.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../partials/stage.js', import.meta.url), 'utf8')
  .replace(/\{\{icon:[^}]+\}\}/g, '');
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
const screenshots = process.env.DEPTH_SCREENSHOTS;
if (screenshots) mkdirSync(screenshots, {recursive:true});
let runs = 0;
const sameView = (actual, expected) => {
  for (const key of ['x','y','w','h']) assert.ok(Math.abs(actual[key]-expected[key]) < 1e-7,
    `camera ${key}: ${actual[key]} != ${expected[key]}`);
};
try {
  for (const size of [{width:1440,height:900}, {width:1180,height:760}, {width:400,height:780}]) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const page = await browser.newPage({viewport:size, reducedMotion});
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.clock.install();
      await page.setContent(`<!doctype html><style>
        html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#18232e;color:white}
        .app,svg.stage{position:absolute;inset:0;width:100%;height:100%}
        .off{display:none} .tools{position:absolute;bottom:12px;left:12px}
        .titlebar{position:absolute;top:0;left:0;right:0;height:44px;display:flex;
          align-items:center;gap:12px;padding:0 12px;font:14px sans-serif;z-index:9}
        .titlebar .path{display:flex;align-items:center;gap:4px}
        .portal rect{fill:#317c9a;stroke:#a6e0e9;stroke-width:2}
        .facet rect{fill:#ac7441;stroke:#ffd2a3;stroke-width:2}
        text{fill:white;font:18px sans-serif} button{padding:8px}
      </style><div class="app"><svg class="stage"><g id="scene">
      <rect id="scenery" x="-2000" y="-1000" width="5000" height="3000" fill="none" stroke="#546373"/>
      <g id="content">
        <g transform="translate(340 130) scale(1.2)"><g class="portal" id="door">
          <rect width="240" height="150" rx="12"/><text x="18" y="35">Enter this object</text>
        </g></g>
        <rect x="10" y="130" width="180" height="180" rx="12" fill="#546373"/>
        <rect x="800" y="130" width="180" height="180" rx="12" fill="#546373"/>
      </g></g></svg><div class="tools"><button id="fit">Fit</button></div>
      <div class="titlebar"><h1>fixture</h1><span class="sub">depth</span></div></div><script>${motion}\n${stage}\n
        const svg = document.querySelector('svg.stage');
        const content = document.querySelector('#content');
        const desc = {label:'Interior', objects:'.facet', draw(g){
          g.innerHTML = '<g class="facet" id="child"><rect x="5000" y="-3000" width="400" height="240" rx="16"/><text x="5020" y="-2960">Inner stage</text></g><g class="facet"><rect x="5480" y="-3000" width="400" height="240" rx="16"/></g>';
        }};
        window.controller = createStage({svg,content,objects:'.portal',onEnter:()=>desc});
        window.go = () => controller.enter(document.querySelector('#door'), desc);
        window.deeper = () => controller.enter(document.querySelector('#child'), {
          ...desc, label:'Deepest', draw(g){g.innerHTML='<g class="facet"><rect x="-8000" y="7000" width="300" height="200"/></g>'}
        });
        controller.fit();
      </script>`);
      await page.clock.runFor(1100);
      const state = () => page.evaluate(() => {
        const rect = sel => {
          const n = document.querySelector(sel); if (!n) return null;
          const b = n.getBoundingClientRect();
          let opacity = 1;
          for (let p=n; p && p instanceof Element; p=p.parentElement) opacity *= +getComputedStyle(p).opacity;
          return {x:b.x,y:b.y,w:b.width,h:b.height,opacity};
        };
        return {view:{...controller.getView()}, depth:controller.depth(),
          outer:rect('#door'), inner:rect('#child'), scenery:rect('#scenery'),
          groups:document.querySelector('#scene').children.length,
          live:controller.level().getBoundingClientRect().width};
      });
      const shot = async name => {
        if (screenshots && size.width===1440 && reducedMotion==='no-preference')
          await page.screenshot({path:`${screenshots}/${name}.png`});
      };
      const root = await state();
      await shot('01-root');
      await page.mouse.dblclick(root.outer.x+root.outer.w-12, root.outer.y+root.outer.h-12);
      const first = await state();
      assert.equal(first.depth, 1);
      if (reducedMotion === 'no-preference') {
        assert.ok(first.inner.w < root.outer.w, 'interior starts inside the entered object');
        assert.ok(first.inner.x >= root.outer.x && first.inner.x + first.inner.w <= root.outer.x + root.outer.w);
        await page.clock.runFor(256);
        const middle = await state();
        assert.ok(middle.outer.w > root.outer.w, 'outer objects expand as the camera enters');
        assert.ok(middle.inner.w > first.inner.w, 'interior expands from the portal');
        assert.ok(middle.outer.opacity > 0 && middle.outer.opacity < 1, 'outer fades without a cut');
        assert.ok(middle.inner.opacity > 0 && middle.inner.opacity < 1, 'inner shares the transition');
        await shot('02-enter-midpoint');
      }
      const beforeEnd = await state();
      await page.clock.runFor(600);
      const inside = await state();
      assert.equal(await page.locator('#child').getAttribute('data-enterable'),'false',
        'the root entry callback is not reused inside an unrelated stage');
      assert.equal(inside.outer.w, 0);
      assert.ok(inside.inner.w > 0);
      assert.equal(inside.groups, root.groups+1, 'temporary wrappers cleaned up');
      if (reducedMotion === 'no-preference') {
        const relativeScale = inside.inner.w / beforeEnd.inner.w;
        assert.ok(Math.abs(inside.scenery.w / beforeEnd.scenery.w - relativeScale) < 1e-5,
          'shared scenery keeps the same scale relationship when local coordinates change');
      }
      await shot('03-inside');
      // Fit must use the live interior even through the public controller API.
      await page.evaluate(() => { controller.zoomStep(0.8); controller.fit(); });
      await page.clock.runFor(1100);
      sameView((await state()).view, inside.view);
      await page.evaluate(() => controller.back());
      const exitStart = await state();
      if (reducedMotion === 'no-preference') {
        assert.ok(Math.abs(exitStart.inner.w-inside.inner.w)<0.01, 'exit starts without a geometry jump');
        await page.clock.runFor(256);
        const middle = await state();
        assert.ok(middle.inner.w < exitStart.inner.w, 'inner contracts on exit');
        assert.ok(middle.outer.w < exitStart.outer.w, 'outer recedes into its saved view');
        assert.ok(middle.inner.opacity > 0 && middle.inner.opacity < 1, 'inner remains during exit');
        await shot('04-exit-midpoint');
      }
      await page.clock.runFor(600);
      const returned = await state();
      sameView(returned.view, root.view);
      assert.equal(returned.groups, root.groups);
      sameView(returned.scenery, root.scenery);
      await shot('05-returned');

      // Rapid reversal and repeated activation cannot leave delayed entries.
      await page.evaluate(() => { go(); go(); controller.back(); });
      await page.clock.runFor(1200);
      assert.equal((await state()).depth, 0);
      assert.equal((await state()).groups, root.groups);
      await page.evaluate(() => go());
      await page.clock.runFor(100);
      await page.keyboard.press('Escape');
      await page.clock.runFor(1200);
      assert.equal((await state()).depth, 0);

      // A breadcrumb jump composes both portal mappings in one transition.
      await page.evaluate(() => go());
      await page.clock.runFor(600);
      await page.evaluate(() => deeper());
      await page.clock.runFor(600);
      assert.equal((await state()).depth, 2);
      await page.locator('.titlebar .path button').first().click();
      await page.clock.runFor(600);
      sameView((await state()).view, root.view);
      assert.equal((await state()).groups, root.groups);

      // Direct manipulation settles the transaction before taking camera control.
      await page.evaluate(() => go());
      await page.clock.runFor(128);
      await page.mouse.move(size.width/2,size.height/2);
      await page.mouse.wheel(0,120);
      await page.clock.runFor(100);
      const interrupted = await state();
      await page.clock.runFor(1000);
      assert.deepEqual((await state()).view, interrupted.view, 'no stale depth animation after wheel input');
      assert.equal((await state()).groups, root.groups+1);
      assert.ok(Object.values(interrupted.view).every(Number.isFinite));
      await page.evaluate(() => { controller.back(); muteMotion(true); go(); });
      assert.equal((await state()).depth, 1);
      assert.equal((await state()).outer.w, 0, 'muted motion commits synchronously');
      await page.evaluate(() => { controller.back(); muteMotion(false); });
      assert.equal((await state()).groups, root.groups);

      // Return from a panned interior, then resize during a second entrance.
      await page.evaluate(() => go());
      await page.clock.runFor(600);
      await page.evaluate(() => {
        const v = controller.getView();
        controller.setView({...v, x:v.x+120, y:v.y-80, w:v.w*0.8, h:v.h*0.8});
        controller.back();
      });
      await page.clock.runFor(600);
      sameView((await state()).view, root.view);
      await page.evaluate(() => go());
      await page.clock.runFor(100);
      await page.setViewportSize({width:size.width, height:size.height-100});
      // Browser resize delivery is not driven by the installed animation clock.
      await page.evaluate(() => dispatchEvent(new Event('resize')));
      await page.clock.runFor(100);
      const resized = await state();
      await page.clock.runFor(1000);
      assert.deepEqual((await state()).view, resized.view, 'resize leaves no stale transition');
      assert.ok(Math.abs(resized.view.h/resized.view.w-(size.height-100)/size.width)<1e-7);
      assert.deepEqual(errors, []);
      await page.close();
      runs++;
    }
  }
  console.log(`depth transitions: all ${runs} configurations hold`);
} finally { await browser.close(); }
