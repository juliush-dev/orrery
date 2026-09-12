// Exercise the actual CSS transition and sample its moving frames.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
const stageButton = '.stage-entrances button[aria-label="Enter Server"]';
const navButton = '[data-nav-body] button[aria-label="Enter Server"]';
let runs=0;
try {
  for (const width of [1440,1180,400]) for (const colorScheme of ['light','dark']) {
    const page = await browser.newPage({viewport:{width,height:900},colorScheme});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(resolve('example/dist/depth.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(1000);
    const geometry = () => page.evaluate(selector=>{
      const b=document.querySelector(selector), n=document.querySelector('#server');
      const r=b.getBoundingClientRect(), box=n.getBoundingClientRect();
      return {right:r.right,top:r.top,width:r.width,glyph:b.querySelector('svg').getBoundingClientRect().width,
        label:b.querySelector('span').getBoundingClientRect().width,boxRight:box.right,boxTop:box.top,
        hidden:b.hidden,boxWidth:box.width,boxHeight:box.height,
        mark:parseFloat(getComputedStyle(b).height)||26};
    },stageButton);
    const baseline=await geometry();
    assert.equal(baseline.label,0,'the shared default shows just the door');
    const screenshot = async state => {
      if (process.env.ENTER_SCREENSHOTS)
        await page.screenshot({path:`${process.env.ENTER_SCREENSHOTS}/${width}-${colorScheme}-${state}.png`});
    };
    await screenshot('collapsed');
    for (const selector of width>820?[stageButton,navButton]:[stageButton]) {
      await page.mouse.move(2,2);
      await page.waitForTimeout(400);
      const right=await page.locator(selector).evaluate(b=>b.getBoundingClientRect().right);
      // Point at the stationary right edge, so a faulty moving control cannot
      // be concealed by a locator following it across the page.
      const b=await page.locator(selector).boundingBox();
      await page.mouse.move(b.x+b.width-6,b.y+b.height/2);
      const samples=await page.evaluate(async selector=>{
        const button=document.querySelector(selector), start=performance.now(), frames=[];
        // A camera repaint during hover used to snap the control back inward.
        setTimeout(()=>demo.stage.apply(),120);
        await new Promise(done=>{
          function frame(now){
            const r=button.getBoundingClientRect();
            frames.push({right:r.right,width:r.width,label:button.querySelector('span').getBoundingClientRect().width});
            if(now-start<420) requestAnimationFrame(frame); else done();
          }
          requestAnimationFrame(frame);
        });
        return frames;
      },selector);
      assert.ok(samples.every(s=>Math.abs(s.right-right)<0.3),`${selector}: hover must not move the right edge`);
      assert.ok(samples.at(-1).label>15,'hover reveals Enter');
      assert.ok(samples.some(s=>s.label>0 && s.label<samples.at(-1).label-1),'normal motion includes intermediate reveal frames');
      if (selector===stageButton) await screenshot('expanded');
      await page.mouse.move(2,2);
      const collapsed=await page.locator(selector).evaluate(async b=>{
        const right=b.getBoundingClientRect().right, deviations=[];
        await new Promise(done=>{
          const start=performance.now();
          function frame(now){deviations.push(Math.abs(b.getBoundingClientRect().right-right));
            if(now-start<420)requestAnimationFrame(frame);else done()}
          requestAnimationFrame(frame);
        });
        return {deviation:Math.max(...deviations),label:b.querySelector('span').getBoundingClientRect().width};
      });
      assert.ok(collapsed.deviation<0.3,'collapse keeps the same anchor');
      assert.equal(collapsed.label,0);
    }
    // Both instances must inherit exactly the same reveal timing and easing.
    const timing=await page.evaluate(([a,b])=>[a,b].map(s=>{
      const c=getComputedStyle(document.querySelector(s+' > span'));
      return [c.transitionProperty,c.transitionDuration,c.transitionTimingFunction];
    }),[stageButton,navButton]);
    assert.deepEqual(timing[0],timing[1]);
    const saved=await page.evaluate(()=>({...demo.stage.getView()}));
    for(const factor of [0.5,1.5,0.8,1]) {
      await page.evaluate(({v,k})=>demo.stage.setView({...v,w:v.w*k,h:v.h*k}),{v:saved,k:factor});
      const b=await geometry();
      // An object zoomed past the size that can carry a mark wears none; that
      // is the only excuse for a missing control, and the index still enters it.
      if (b.hidden) { assert.ok(b.boxWidth < b.mark*3.4 || b.boxHeight < b.mark*2,
        'a mark may only disappear because its object is too small to carry it'); continue; }
      assert.ok(Math.abs(b.right-(b.boxRight-6))<0.3,'zoom keeps the door inside the right corner');
      assert.ok(Math.abs(b.top-(b.boxTop+6))<0.3,'zoom keeps the top inset');
      assert.ok(Math.abs(b.glyph-baseline.glyph)<0.1,'camera zoom never shrinks the glyph');
    }
    // Screen coordinates are not CSS coordinates in scaled embedding hosts.
    for(const property of ['zoom','transform']) {
      await page.evaluate(property=>{
        const host=document.querySelector('.app');
        host.style[property]=property==='zoom'?'1.25':'scale(.8)';
        demo.stage.apply();
      },property);
      const b=await geometry();
      if (b.hidden) console.log(`  (${width} ${colorScheme} ${property}: object too small for a mark)`);
      else {
        assert.ok(Math.abs(b.right-(b.boxRight-6))<0.3,`${property}: convert screen coordinates to overlay units: ${JSON.stringify(b)}`);
        assert.ok(Math.abs(b.top-(b.boxTop+6))<0.3);
      }
      await page.evaluate(property=>{document.querySelector('.app').style[property]='';demo.stage.apply()},property);
    }
    // Do not pin a marker to the viewport when its object's corner is clipped.
    await page.evaluate(()=>{const v=demo.stage.getView();demo.stage.setView({...v,y:160})});
    const clipped=await geometry();
    assert.ok(Math.abs(clipped.top-(clipped.boxTop+6))<0.3,'partial clipping does not detach the marker');
    await page.evaluate(v=>demo.stage.setView(v),saved);
    await page.locator(stageButton).focus();
    await page.waitForTimeout(400);
    assert.ok((await geometry()).label>15,'keyboard focus also reveals the action');
    assert.ok(Math.abs((await geometry()).right-(baseline.boxRight-6))<0.3);
    await page.locator(stageButton).blur();
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator(stageButton).focus();
    assert.equal(await page.locator(stageButton+' > span').evaluate(n=>getComputedStyle(n).transitionDuration),'0s');
    assert.ok((await geometry()).label>15,'reduced motion reveals the label immediately');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>demo.stage.depth()),1);
    assert.deepEqual(errors,[]);
    await page.close();runs++;
  }
  console.log(`entry motion: all ${runs} configurations hold`);
} finally {await browser.close()}
