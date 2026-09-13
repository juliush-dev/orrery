import assert from 'node:assert/strict';
import {launchBrowser} from './browser.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const browser=await launchBrowser();
let runs=0;
try {
  for(const width of [1440,1280,740,400]) for(const colorScheme of ['light','dark'])
    for(const scale of [1,1.5]) for(const reducedMotion of ['reduce','no-preference']) {
    const page=await browser.newPage({viewport:{width,height:900},colorScheme,reducedMotion});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(scale=>localStorage.setItem('orrery.uiScale',String(scale)),scale);
    await page.goto(pathToFileURL(resolve('example/dist/model.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('.center-panel').click();await page.waitForTimeout(1000);
    const frames=await page.evaluate(()=>new Promise(resolve=>{
      const reader=document.querySelector('[data-expandable]'),nav=document.querySelector('[data-nav]');
      const frames=[],start=performance.now();
      const sample=()=>{
        const r=reader.getBoundingClientRect(),n=nav.getBoundingClientRect();
        frames.push({rx:r.x,ry:r.y,rw:r.width,rh:r.height,nx:n.x,ny:n.y,view:demo.stage.getView().x});
      };
      sample();
      const object=demo.stage.level().querySelector('[data-object-id="server"]');
      object.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));
      const tick=()=>{sample();if(performance.now()-start<1100)requestAnimationFrame(tick);else resolve(frames)};
      requestAnimationFrame(tick);
    }));
    for(const f of frames) for(const key of ['rx','ry','rw','rh','nx','ny'])
      assert.ok(Math.abs(f[key]-frames[0][key])<1,`dock moved: ${key} at ${width}/${scale}`);
    if(reducedMotion==='no-preference') assert.ok(frames.some(f=>
      Math.abs(f.view-frames[0].view)>1 && Math.abs(f.view-frames.at(-1).view)>1),'stage should ease');
    const inspect=()=>page.evaluate(()=>{
      const o=document.querySelector('svg.stage .sel').getBoundingClientRect();
      const r=document.querySelector('[data-expandable]').getBoundingClientRect();
      const a=document.querySelector('svg.stage').getBoundingClientRect();
      return {gap:r.top-o.bottom,inside:o.top>=a.top-1 && o.left>=a.left-1 && o.right<=a.right+1,
        center:Math.abs(o.x+o.width/2-r.x-r.width/2),zoom:demo.stage.getView().w};
    });
    let result=await inspect();assert.ok(result.inside && result.gap>=23 && result.gap<=25);
    if(width>=1280)assert.ok(result.center<1,'object centered above reader');
    // Repeating focus does not progressively shrink the drawing.
    await page.evaluate(()=>demo.stage.frame(document.querySelector('svg.stage .sel')));
    await page.waitForTimeout(1000);
    assert.ok(Math.abs((await inspect()).zoom-result.zoom)<.01);
    // Large, transformed objects must fit whole in the available space.
    await page.evaluate(()=>{
      const object=document.querySelector('svg.stage .sel');object.setAttribute('transform','translate(120 80) scale(5)');
      demo.stage.frame(object);
    });
    await page.waitForTimeout(1000);result=await inspect();
    assert.ok(result.inside && result.gap>=23 && result.gap<=25,'large object fits above dock');
    // A real stage click uses the same placement as keyboard and index picks.
    await page.evaluate(()=>demo.stage.markPick(null));
    const point=await page.evaluate(()=>{
      const v=demo.stage.getView();demo.stage.setView({...v,y:v.y-50});
      const r=document.querySelector('[data-object-id="server"]').getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height*.15};
    });
    await page.mouse.click(point.x,point.y);await page.waitForTimeout(1000);
    result=await inspect();assert.ok(result.inside && result.gap>=23 && result.gap<=25);
    if(width>=1280) {
      await page.locator('.widen').click();await page.waitForTimeout(1300);
      result=await inspect();assert.ok(result.gap>=23 && result.gap<=25,'widen retains focus placement');
    }
    // User manipulation interrupts the camera; the panels still never follow.
    const stable=await page.evaluate(async()=>{
      const object=document.querySelector('svg.stage .sel');
      demo.stage.setView({...demo.stage.getView(),y:demo.stage.getView().y+80});
      demo.stage.frame(object);
      await new Promise(r=>setTimeout(r,50));
      const v={...demo.stage.getView(),x:demo.stage.getView().x+100};demo.stage.setView(v);
      await new Promise(r=>setTimeout(r,1000));return Math.abs(demo.stage.getView().x-v.x)<.01;
    });
    assert.ok(stable);assert.deepEqual(errors,[]);
    await page.close();runs++;
  }
  console.log(`Dock focus: ${runs} width/theme/text/motion configurations passed.`);
}finally{await browser.close();}
