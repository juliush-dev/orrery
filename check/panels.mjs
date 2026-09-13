import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
let runs = 0;
try {
  for (const width of [1440,1180,400]) for (const colorScheme of ['light','dark'])
    for (const scale of [1,1.5]) {
      const page = await browser.newPage({viewport:{width,height:780},colorScheme,
        reducedMotion:'reduce'});
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(scale=>localStorage.setItem('orrery.uiScale',String(scale)),scale);
      await page.goto(pathToFileURL(resolve('example/dist/index.html')).href);
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const panel = page.locator('.hud[data-expandable]');
      await panel.locator('.center-panel').click();
      const geometry = () => panel.evaluate(p => {
        const r=p.getBoundingClientRect(), a=document.querySelector('.app').getBoundingClientRect();
        const t=document.querySelector('.tools').getBoundingClientRect();
        return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,
          center:a.x+a.width/2,top:a.y,available:a.height,toolsTop:t.top};
      });
      const initial = await geometry();
      assert.ok(Math.abs(initial.x+initial.width/2-initial.center)<1);
      assert.ok(initial.height>initial.width || width===400);
      assert.ok(initial.height<=initial.available*.6+1);
      assert.ok(initial.y>=initial.top && initial.bottom<=initial.toolsTop-9);
      await page.locator('#fit').click();
      await page.mouse.move(1,1);
      const clearance = await page.evaluate(()=>{
        const reader=document.querySelector('.centered').getBoundingClientRect();
        const drawing=document.querySelector('#content').getBoundingClientRect();
        return {bottom:drawing.bottom,top:reader.top};
      });
      assert.ok(clearance.bottom<=clearance.top, `Fit leaves the drawing above the tablet: ${width}/${scale} ${JSON.stringify(clearance)}`);
      assert.equal(await panel.evaluate(p=>getComputedStyle(p).opacity),'0.18');
      await panel.hover();
      assert.equal(await panel.evaluate(p=>getComputedStyle(p).opacity),'1');
      assert.deepEqual(await geometry(),initial);
      if (process.env.PANEL_SCREENSHOTS && scale===1.5)
        await page.screenshot({path:`${process.env.PANEL_SCREENSHOTS}/${width}-${colorScheme}.png`});
      await panel.locator('.opaque-panel').click();
      await page.locator('#fit').click(); await page.mouse.move(1,1);
      assert.equal(await panel.evaluate(p=>getComputedStyle(p).opacity),'1');
      await panel.locator('.opaque-panel').click();
      await page.mouse.move(1,1);
      await panel.locator('.center-panel').focus();
      assert.equal(await panel.evaluate(p=>getComputedStyle(p).opacity),'1');
      await panel.locator('.widen').click();
      const wide = await geometry();
      assert.ok(wide.width>initial.width);
      await panel.locator('.expand').click();
      assert.ok(await panel.evaluate(p=>p.classList.contains('modal')));
      await page.setViewportSize({width:width+1,height:780});
      await page.setViewportSize({width,height:780});
      await page.keyboard.press('Escape');
      assert.ok(await panel.evaluate(p=>p.classList.contains('centered') && p.classList.contains('wide') && !p.classList.contains('modal')));
      assert.deepEqual(await geometry(),wide);
      await panel.locator('.widen').click();
      await panel.locator('.center-panel').click();
      assert.equal(await panel.locator('.opaque-panel').isVisible(),false);
      assert.equal(await page.evaluate(()=>document.querySelector('.app').scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);
      await page.close(); runs++;
    }
  const touch=await browser.newPage({viewport:{width:400,height:650},hasTouch:true,isMobile:true});
  await touch.goto(pathToFileURL(resolve('example/dist/index.html')).href);
  await touch.locator('.center-panel').click();
  await touch.locator('#fit').click();
  assert.equal(await touch.locator('.centered').evaluate(p=>getComputedStyle(p).opacity),'1');
  await touch.close();
  const compact=await browser.newPage({viewport:{width:320,height:480},reducedMotion:'no-preference'});
  await compact.goto(pathToFileURL(resolve('example/dist/index.html')).href);
  await compact.locator('.center-panel').click();
  await compact.locator('#fit').click(); await compact.mouse.move(1,1);
  await compact.waitForFunction(()=>getComputedStyle(document.querySelector('.centered')).opacity==='0.18');
  assert.ok(await compact.locator('.centered').evaluate(p=>{
    const r=p.getBoundingClientRect(), a=document.querySelector('.app').getBoundingClientRect();
    return r.left>=a.left && r.right<=a.right && r.top>=a.top && r.bottom<=a.bottom;
  }));
  await compact.locator('.opaque-panel').focus();
  await compact.keyboard.press('Enter');
  await compact.locator('#fit').click(); await compact.mouse.move(1,1);
  await compact.waitForFunction(()=>getComputedStyle(document.querySelector('.centered')).opacity==='1');
  await compact.close();
  console.log(`Panel checks passed: ${runs} viewport/theme/text configurations, touch, and compact animated layout.`);
} finally { await browser.close(); }
