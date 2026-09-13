import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {clickControl} from './controls.mjs';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
let runs=0;
try {
  for(const width of [1440,1280,1180,740,400]) for(const colorScheme of ['light','dark']) for(const scale of [1,1.5]) {
    const page=await browser.newPage({viewport:{width,height:900},colorScheme,reducedMotion:'reduce'});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(scale=>localStorage.setItem('orrery.uiScale',String(scale)),scale);
    await page.goto(pathToFileURL(resolve('example/dist/model.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    const reader=page.locator('[data-expandable]'), nav=page.locator('[data-nav]');
    const join=reader.locator('.pair-panel');
    assert.equal(await nav.locator('.pair-panel').count(),0);
    assert.equal(await join.isVisible(),false);
    const original=await nav.boundingBox();
    await reader.locator('.center-panel').click();
    assert.equal(await join.isVisible(),true);
    // The reader keeps the centre when the navigator joins it, so the navigator
    // needs the whole margin beside it: half the window, less half the reader,
    // less its own 320px measure and the gaps. Where that does not fit, the
    // dock is not offered rather than pushed off the edge of the window.
    const canDock = width >= Math.min(560,width-24) + 688;
    if(!canDock) {
      assert.equal(await join.isDisabled(),true,'a window without room for the navigator offers the dock');
    } else {
      await join.click();
      assert.equal(await reader.evaluate(p=>p.classList.contains('wide')),true,
        'docking opens the reader at its full measure');
      const geometry=async()=>({r:await reader.boundingBox(),n:await nav.boundingBox()});
      const check=async()=>{
        const {r,n}=await geometry();
        assert.ok(Math.abs(r.x-n.x-n.width-12)<1,'12px gap');
        // The reader is the thing being read: it holds the centre and the
        // navigator arrives beside it. Centring the two as a unit slid the
        // reader off-centre every time the navigator was docked.
        assert.ok(Math.abs(r.x+r.width/2-width/2)<1,'the reader keeps the centre');
        assert.ok(Math.abs(n.y+n.height-r.y-r.height)<1,'bottoms align');
        // Docked, the reader is a pane and reads as one: landscape whether or not
        // it has been widened. A tall narrow reader beside a tall narrow list is
        // two columns of the same shape doing different jobs.
        assert.ok(r.width>r.height,
          `the docked reader is ${Math.round(r.width)}x${Math.round(r.height)}: portrait`);
        assert.ok(n.x>=0 && r.x+r.width<=width && r.width>=320 && n.width>=320);
      };
      await check();
      await clickControl(page,page.locator('#fit')); await page.mouse.move(1,1);
      assert.equal(await nav.evaluate(p=>getComputedStyle(p).opacity),'0.18');
      await nav.hover();
      assert.equal(await reader.evaluate(p=>getComputedStyle(p).opacity),'1');
      await reader.locator('.opaque-panel').click();
      await clickControl(page,page.locator('#fit')); await page.mouse.move(1,1);
      assert.equal(await nav.evaluate(p=>getComputedStyle(p).opacity),'1');
      await reader.locator('.opaque-panel').click();

      /* Translucency follows the pointer and the keyboard, never a past click.
         :focus-within kept a panel solid after the pointer had left, because a
         click leaves focus on whatever was clicked — so the panel only faded
         once something unfocusable was clicked, which read as "I have to click
         the stage first". */
      const opacityOf = l => l.evaluate(p => parseFloat(getComputedStyle(p).opacity));
      await nav.locator('.name').filter({hasText:'Notes'}).click();
      await page.mouse.move(width - 40, 90); await page.waitForTimeout(420);
      assert.ok(await opacityOf(nav) < 0.3,
        'the navigator stayed solid after a click, with the pointer away');
      assert.ok(await opacityOf(reader) < 0.3,
        'the reader stayed solid after a click in the navigator');

      /* Keyboard focus is the case that must keep them visible: navigating a
         panel at 18% opacity is not navigable. */
      await nav.locator('.name').first().focus();
      await page.keyboard.press('Tab'); await page.waitForTimeout(420);
      assert.ok(await opacityOf(nav) > 0.9, 'keyboard focus in the navigator leaves it translucent');
      assert.ok(await opacityOf(reader) > 0.9, 'its reader stays translucent too');
      await reader.locator('.widen').focus();
      await page.keyboard.press('Tab'); await page.waitForTimeout(420);
      assert.ok(await opacityOf(reader) > 0.9, 'keyboard focus in the reader leaves it translucent');
      await page.mouse.click(Math.round(width / 2), 120); await page.waitForTimeout(420);

      await nav.locator('.name').filter({hasText:'Notes'}).click();
      assert.equal(await nav.locator('.sel .name').textContent(),'Notes');
      await reader.locator('.widen').click(); await check();
      if(process.env.PANEL_SCREENSHOTS && scale===1.5)
        await page.screenshot({path:`${process.env.PANEL_SCREENSHOTS}/pair-${width}-${colorScheme}.png`});
      await page.evaluate(()=>demo.stage.enter(demo.stage.level().querySelector('[data-object-id="server"]')));
      assert.equal(await nav.locator('.name').count(),3);
      assert.equal(await nav.locator('#stage-back').isVisible(),true);
      await nav.locator('#stage-back').click();
      assert.equal(await page.evaluate(()=>demo.stage.depth()),0);
      await reader.locator('.expand').click();
      await page.keyboard.press('Escape'); await check();
      await page.setViewportSize({width:400,height:900});
      assert.equal(await nav.isVisible(),false);
      assert.equal(await join.isDisabled(),false,'can release a suspended pair');
      await page.setViewportSize({width,height:900}); await check();
      await reader.locator('.center-panel').click();
      assert.equal(await nav.evaluate(p=>p.classList.contains('paired-nav')),false);
      assert.deepEqual(await nav.boundingBox(),original,'original navigator dock restored');
      await reader.locator('.center-panel').click();
      assert.equal(await join.getAttribute('aria-pressed'),'false','undocking clears pairing');
    }
    assert.deepEqual(errors,[]);
    await page.close(); runs++;
  }
  console.log(`Paired panels: all ${runs} width/theme/text configurations hold`);
} finally {await browser.close();}
