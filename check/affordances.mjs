import assert from 'node:assert/strict';
import { launchBrowser } from './browser.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await launchBrowser();
let runs = 0;
try {
  for (const width of [1440,1180,400]) for (const colorScheme of ['light','dark']) {
    const page = await browser.newPage({viewport:{width,height:900},colorScheme,reducedMotion:'reduce'});
    const errors = [];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(resolve('example/dist/depth.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    const badges = page.locator('.stage-entrances .enter-control');
    assert.equal(await badges.count(),2);
    assert.equal(await page.locator('[data-nav-body] .enter-control').count(),2);
    assert.equal(await page.locator('#notes').getAttribute('data-enterable'),'false');
    const boxBefore = await page.evaluate(()=>document.querySelector('#content').getBBox().width);
    await page.evaluate(()=>demo.stage.refresh());
    assert.equal(await badges.count(),2,'refresh does not duplicate markers');
    assert.equal(await page.evaluate(()=>document.querySelector('#content').getBBox().width),boxBefore,'badges never change Fit bounds');
    await page.evaluate(()=>document.querySelector('#server').classList.add('off'));
    assert.equal(await page.locator('.stage-entrances button[aria-label="Enter Server"]').isVisible(),false,
      'hiding an object also hides its control without a camera move');
    await page.evaluate(()=>document.querySelector('#server').classList.remove('off'));
    // A mark small enough to be hidden is hidden on purpose (its object cannot
    // carry it); a shown one is whole and on screen.
    let shownMarks = 0;
    for (const badge of await badges.all()) {
      const b = await badge.boundingBox();
      if (!b) continue;
      shownMarks++;
      assert.ok(b.width>20 && b.x>=0 && b.x+b.width<=width+1,'Enter remains visible within the viewport');
    }
    assert.ok(shownMarks || width < 820,'entrances are marked on the stage at a usable window');
    // A mark belongs to its object: inside its box at every zoom, never wider
    // than the thing it marks, and still while its own label opens.
    const marks = () => page.evaluate(() =>
      [...document.querySelectorAll('.stage-entrances .enter-control')]
        .filter(b => !b.hidden && b.offsetWidth)
        .map(b => {
          const r = b.getBoundingClientRect();
          // Ask the mark which object it belongs to rather than looking up an
          // element id: a model-derived object has no id to look up.
          const o = b.orreryObject.getBoundingClientRect();
          return {label: b.ariaLabel,
            inside: r.x >= o.x - 0.5 && r.y >= o.y - 0.5 &&
                    r.right <= o.right + 0.5 && r.bottom <= o.bottom + 0.5};
        }));
    for (const zoom of [1, 0.8**4, 0.8**9, 1.25**3]) {
      await page.evaluate(z => { demo.stage.fit(); if (z !== 1) demo.stage.zoomStep(z); }, zoom);
      await page.waitForTimeout(60);
      for (const m of await marks())
        assert.ok(m.inside, `${m.label} sits outside its object at zoom ${zoom.toFixed(2)}`);
    }
    await page.evaluate(() => demo.stage.fit());
    await page.waitForTimeout(60);
    const mark = page.locator('.stage-entrances .enter-control:visible').first();
    if (await mark.count()) {
      const shut = await mark.boundingBox();
      await mark.hover();
      await page.waitForTimeout(300);
      const open = await mark.boundingBox();
      assert.ok(Math.abs((shut.x + shut.width) - (open.x + open.width)) < 0.6,
        'the mark shifts sideways while its label opens');
      assert.ok(open.width > shut.width, 'hovering a mark reveals its word');
      await page.mouse.move(1, 1);
    }
    if (process.env.AFFORDANCE_SCREENSHOTS)
      await page.screenshot({path:`${process.env.AFFORDANCE_SCREENSHOTS}/${width}-${colorScheme}.png`});
    await page.locator('.stage-entrances button[aria-label="Enter Server"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>demo.stage.depth()),1);
    assert.equal(await badges.count(),0,'leaf interiors have no false entry affordances');
    assert.deepEqual(await page.locator('[data-nav-body] .name').allTextContents(),['SSH','Worker']);
    await page.locator('.titlebar .path button').hover();
    assert.equal(await page.locator('[data-nav-body]').getAttribute('inert'),'');
    assert.equal(await page.locator('[data-nav-body] .enter-control:disabled').count(),2,'preview actions disabled');
    await page.locator('#stage-back').click();
    assert.equal(await page.evaluate(()=>demo.stage.depth()),0);
    await page.waitForTimeout(700);
    // Coming out of something leaves you looking at it: the object you entered
    // from keeps the ring, and its row in the index stays the active one.
    assert.ok(await page.evaluate(()=>document.querySelector('#server').classList.contains('sel')),
      'the object you came out of keeps the selection ring');
    assert.ok(await page.evaluate(()=>{
      const row=[...document.querySelectorAll('[data-nav-body] [data-stage-object]')]
        .find(r=>r.orreryObject===document.querySelector('#server'));
      return !!row && row.classList.contains('sel');
    }),'the index row for the object you came out of is the active one');
    if (width>820) {
      await page.locator('[data-nav-body] button[aria-label="Enter Workstation"]').click();
      assert.equal(await page.evaluate(()=>demo.stage.depth()),1);
      assert.deepEqual(await page.locator('[data-nav-body] .name').allTextContents(),['Editor','Terminal']);
      await page.keyboard.press('Escape');
    }
    await page.evaluate(()=>{delete demo.interiors.server;demo.stage.refresh()});
    assert.equal(await badges.count(),1,'a changed capability updates stage and index together');
    assert.equal(await page.locator('[data-nav-body] .enter-control').count(),1);
    const invalid = await page.evaluate(()=>{
      const desc = demo.interiors.workstation;
      desc.index = (host,ctx)=>ctx.bind(document.createElement('div'),document.querySelector('#workstation'));
      let ghost, reused;
      try {demo.stage.enter(document.querySelector('#workstation'),desc)} catch(e){ghost=e.message}
      demo.stage.back();
      try {demo.stage.enter(document.querySelector('#notes'),desc)} catch(e){reused=e.message}
      return {ghost,reused};
    });
    assert.match(invalid.ghost,/not its owner or another level/,'custom indexes cannot bind the absent parent');
    assert.match(invalid.reused,/Interior reused/,'legacy descriptors cannot be accidentally assigned to unrelated owners');
    assert.deepEqual(errors,[]);
    await page.close(); runs++;
  }
  console.log(`entry affordances: all ${runs} configurations hold`);
} finally {await browser.close()}
