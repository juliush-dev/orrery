import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {clickControl} from './controls.mjs';
import {launchBrowser} from './browser.mjs';
const browser = await launchBrowser();
let runs=0;
try {
  for(const width of [1440,1280,1180,740,400]) for(const colorScheme of ['light','dark']) for(const scale of [1,1.5]) {
    const page=await browser.newPage({viewport:{width,height:900},colorScheme,reducedMotion:'reduce'});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(scale=>localStorage.setItem('orrery.uiScale',String(scale)),scale);
    await page.goto(pathToFileURL(resolve('example/dist/model.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    const reader=page.locator('[data-expandable]'), nav=page.locator('[data-nav]');
    /* One control, one posture. There is no separate control for the navigator:
       docking the reader brings it, and opens the reader at full measure. Three
       switches for one intention is three chances to be left half-docked. */
    assert.equal(await reader.locator('.pair-panel').count(),0,'a second docking control survives');
    assert.equal(await nav.locator('.center-panel').count(),0,'the navigator carries a docking control');
    const original=await nav.boundingBox();
    await reader.locator('.center-panel').click();
    await page.waitForTimeout(450);
    assert.equal(await reader.evaluate(p=>p.classList.contains('centered')),true,'one click did not dock the reader');
    assert.equal(await reader.evaluate(p=>p.classList.contains('wide')),true,
      'docking did not open the reader at full measure; it should not have to be widened by hand');
    // The reader keeps the centre when the navigator joins it, so the navigator
    // needs the whole margin beside it: half the window, less half the reader,
    // less its own 320px measure and the gaps. Where that does not fit, the
    // reader still docks and the navigator stays where it was.
    const canDock = width >= Math.min(560,width-24) + 688;
    assert.equal(await nav.evaluate(p=>p.classList.contains('paired-nav')),canDock,
      'the navigator did not follow the reader into the dock');
    if(!canDock) {
      assert.equal(await reader.evaluate(p=>p.classList.contains('paired')),false);
    } else {
      const undockedHeight = original.height;
      const geometry=async()=>({r:await reader.boundingBox(),n:await nav.boundingBox()});
      const where=` [${width}/${colorScheme}/${scale}x]`;
      const check=async(stage='')=>{
        const {r,n}=await geometry();
        const at=stage?`${stage}${where}`:where;
        assert.ok(Math.abs(r.x-n.x-n.width-12)<1,'12px gap'+at);
        // Docked, the reader is the thing being read: it holds the centre and
        // the navigator arrives beside it. Centring the two as a unit slid the
        // reader off-centre every time the navigator was docked.
        //
        assert.ok(Math.abs(r.x+r.width/2-width/2)<1,'the reader keeps the centre'+at);
        assert.ok(Math.abs(n.y+n.height-r.y-r.height)<1,'bottoms align'+at);
        // Docked, the reader is a pane and reads as one: landscape whether or not
        // it has been widened. A tall narrow reader beside a tall narrow list is
        // two columns of the same shape doing different jobs.
        assert.ok(r.width>r.height,
          `the docked reader is ${Math.round(r.width)}x${Math.round(r.height)}: portrait`+at);
        // Landscape by being wider, never by being shorter. Docking must not take
        // height away from the panel you docked in order to read it.
        assert.ok(Math.round(r.height)>=Math.round(undockedHeight),
          `docking cost the reader height: ${Math.round(undockedHeight)} -> ${Math.round(r.height)}`+at);
        assert.ok(n.x>=0 && r.x+r.width<=width && r.width>=320 && n.width>=320);
      };
      await check('just docked');
      await clickControl(page,page.locator('#fit')); await page.mouse.move(1,1);
      // Both panels are simply opaque: a reader you have to hover to read is a
      // reader you cannot read while looking at the thing it describes.
      assert.equal(await nav.evaluate(p=>getComputedStyle(p).opacity),'1');
      assert.equal(await reader.evaluate(p=>getComputedStyle(p).opacity),'1');
      await clickControl(page,page.locator('#fit')); await page.mouse.move(1,1);

      /* Opaque in every state, whatever was last clicked or focused. */
      const opacityOf = l => l.evaluate(p => parseFloat(getComputedStyle(p).opacity));
      await nav.locator('.name').filter({hasText:'Notes'}).click();
      await page.mouse.move(width - 40, 90); await page.waitForTimeout(420);
      assert.equal(await opacityOf(nav),1,'the navigator is not fully opaque');
      assert.equal(await opacityOf(reader),1,'the reader is not fully opaque');

      /* Opaque under the keyboard too. There is no translucent state left to
         restore, so the only thing worth asserting is that nothing reintroduces
         one by way of a focus or hover rule. */
      await nav.locator('.name').first().focus();
      await page.keyboard.press('Tab'); await page.waitForTimeout(420);
      assert.equal(await opacityOf(nav),1,'keyboard focus dimmed the navigator');
      assert.equal(await opacityOf(reader),1,'keyboard focus dimmed the reader');
      await page.mouse.click(Math.round(width / 2), 120); await page.waitForTimeout(420);

      await nav.locator('.name').filter({hasText:'Notes'}).click();
      assert.equal(await nav.locator('.sel .name').textContent(),'Notes');
      await reader.locator('.widen').click(); await check('after un-widening');
      if(process.env.PANEL_SCREENSHOTS && scale===1.5)
        await page.screenshot({path:`${process.env.PANEL_SCREENSHOTS}/pair-${width}-${colorScheme}.png`});
      await page.evaluate(()=>demo.stage.enter(demo.stage.level().querySelector('[data-object-id="server"]')));
      assert.equal(await nav.locator('.name').count(),3);
      assert.equal(await nav.locator('#stage-back').isVisible(),true);
      await nav.locator('#stage-back').click();
      assert.equal(await page.evaluate(()=>demo.stage.depth()),0);
      await reader.locator('.expand').click();
      await page.keyboard.press('Escape'); await check('after leaving full page');
      await nav.locator('.name').filter({hasText:'Server'}).click();
      await page.waitForTimeout(1100);
      await check('after focus');
      assert.ok(await page.evaluate(()=>{
        const o=document.querySelector('svg.stage .sel').getBoundingClientRect();
        const r=document.querySelector('[data-expandable]').getBoundingClientRect();
        return o.bottom<=r.top-23;
      }),'focused object stays above the reader');
      const settle=async()=>{await clickControl(page,page.locator('#fit'));await page.waitForTimeout(1100);
        return page.evaluate(()=>demo.stage.getView());};
      assert.deepEqual(await settle(),await settle(),'Fit must settle in one press');
      await page.keyboard.press('Escape');
      await check('after releasing focus');
      await page.setViewportSize({width:400,height:900});
      assert.equal(await nav.isVisible(),false);
      assert.equal(await reader.locator('.center-panel').isDisabled(),false,'the dock control locked up');
      /* Coming back to a window with room re-docks the navigator on the resize,
         and the pair is placed from the next camera pass. Give it that pass
         before measuring, or this reads a position that is one frame old. */
      await page.setViewportSize({width,height:900});
      await page.waitForTimeout(700);
      await check('after a narrow round trip');
      /* Leaving the dock puts everything back: the navigator returns to its own
         side, the reader to the width it had before, and the control stops
         claiming to be pressed. One click in, one click out. */
      await reader.locator('.center-panel').click();
      await page.waitForTimeout(450);
      assert.equal(await nav.evaluate(p=>p.classList.contains('paired-nav')),false);
      assert.deepEqual(await nav.boundingBox(),original,'original navigator dock restored');
      assert.equal(await reader.evaluate(p=>p.classList.contains('wide')),false,
        'undocking kept a width the reader never had before it docked');
      assert.equal(await reader.locator('.center-panel').getAttribute('aria-pressed'),'false',
        'undocking leaves the control claiming it is still docked');
    }
    assert.deepEqual(errors,[]);
    await page.close(); runs++;
  }
  console.log(`Paired panels: all ${runs} width/theme/text configurations hold`);
} finally {await browser.close();}
