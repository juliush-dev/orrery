import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {clickControl} from './controls.mjs';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
let runs=0;
try {
  for(const width of [1440,1180,740,400]) for(const colorScheme of ['light','dark']) for(const scale of [1,1.5]) {
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
    if(width<720) {
      assert.equal(await join.isDisabled(),true);
    } else {
      await join.click();
      const geometry=async()=>({r:await reader.boundingBox(),n:await nav.boundingBox()});
      const check=async()=>{
        const {r,n}=await geometry();
        assert.ok(Math.abs(r.x-n.x-n.width-12)<1,'12px gap');
        assert.ok(Math.abs((n.x+r.x+r.width)/2-width/2)<1,'pair centered together');
        assert.ok(Math.abs(n.y+n.height-r.y-r.height)<1,'bottoms align');
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
