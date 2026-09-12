import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
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
    for (const badge of await badges.all()) {
      const b = await badge.boundingBox();
      assert.ok(b && b.width>20 && b.x>=0 && b.x+b.width<=width+1,'Enter remains visible within the viewport');
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
    if (width>820) {
      await page.locator('[data-nav-body] button[aria-label="Enter Workstation"]').click();
      assert.equal(await page.evaluate(()=>demo.stage.depth()),1);
      assert.deepEqual(await page.locator('[data-nav-body] .name').allTextContents(),['Editor','Terminal']);
      await page.keyboard.press('Escape');
    }
    await page.evaluate(()=>{delete demo.interiors.server;demo.stage.refresh()});
    assert.equal(await badges.count(),1,'a changed capability updates stage and index together');
    assert.equal(await page.locator('[data-nav-body] .enter-control').count(),1);
    assert.deepEqual(errors,[]);
    await page.close(); runs++;
  }
  console.log(`entry affordances: all ${runs} configurations hold`);
} finally {await browser.close()}
