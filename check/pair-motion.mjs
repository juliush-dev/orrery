import assert from 'node:assert/strict';
import {launchBrowser} from './browser.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const browser=await launchBrowser();
try {
  for(const width of [1440,1280]) for(const colorScheme of ['light','dark'])
    for(const scale of [1,1.5]) for(const reducedMotion of ['reduce','no-preference']) {
    const page=await browser.newPage({viewport:{width,height:900},colorScheme,reducedMotion});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(scale=>localStorage.setItem('orrery.uiScale',String(scale)),scale);
    await page.goto(pathToFileURL(resolve('example/dist/model.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('.center-panel').click();
    await page.waitForTimeout(1200);
    await page.locator('[data-nav] .name').filter({hasText:'Notes'}).click();
    await page.waitForTimeout(1400);
    for(const displaced of [false,true]) {
    if(displaced) await page.evaluate(()=>{
      const v=demo.stage.getView();demo.stage.setView({...v,x:v.x+250,y:v.y+500});
    });
    const frames=await page.evaluate(()=>new Promise(resolve=>{
      const reader=document.querySelector('[data-expandable]'), nav=document.querySelector('[data-nav]');
      const frames=[],start=performance.now();
      const sample=()=>{
        const r=reader.getBoundingClientRect(),n=nav.getBoundingClientRect();
        frames.push({x:r.x,y:r.y,nx:n.x,ny:n.y,nw:n.width});
      };
      sample();
      [...nav.querySelectorAll('.name')].find(e=>e.textContent==='Server').click();
      const tick=()=>{sample();if(performance.now()-start<1600) requestAnimationFrame(tick);else resolve(frames)};
      requestAnimationFrame(tick);
    }));
    for(const axis of ['x','y']) {
      const start=frames[0][axis],end=frames.at(-1)[axis];
      const values=frames.map(f=>f[axis]);
      assert.ok(Math.min(...values)>=Math.min(start,end)-1 && Math.max(...values)<=Math.max(start,end)+1,
        `${width}/${colorScheme}: ${axis} takes a detour: endpoints ${start}/${end}, range ${Math.min(...values)}/${Math.max(...values)}`);
      const direction=Math.sign(end-start);
      assert.ok(frames.every((f,i)=>!i || (f[axis]-frames[i-1][axis])*direction>=-1),`${axis} reverses direction`);
    }
    assert.ok(frames.every(f=>Math.abs(f.y-f.ny)<1 && Math.abs(f.x-f.nx-f.nw-12)<1),'pair separates in flight');
    if(displaced && reducedMotion==='no-preference') {
      assert.ok(Math.abs(frames[0].y-frames.at(-1).y)>20,'exercise a real vertical move');
      assert.ok(frames.some(f=>Math.abs(f.y-frames[0].y)>2 && Math.abs(f.y-frames.at(-1).y)>2),'movement must ease, not snap');
    }
    }
    // Interrupt a flight through the same direct-view path used by panning.
    const interrupted=await page.evaluate(async()=>{
      const reader=document.querySelector('[data-expandable]');
      demo.stage.frame(demo.stage.level().querySelector('[data-object-id="notes"]'));
      await new Promise(r=>setTimeout(r,90));
      const v=demo.stage.getView();demo.stage.setView({...v,y:v.y+80});
      const first=reader.getBoundingClientRect().y;
      await new Promise(r=>setTimeout(r,1000));
      const r=reader.getBoundingClientRect(),a=document.querySelector('.app').getBoundingClientRect();
      return {first,last:r.y,inside:r.top>=a.top-1 && r.bottom<=a.bottom+1};
    });
    assert.ok(Math.abs(interrupted.first-interrupted.last)<1,'cancelled flight must not pull the pair back');
    assert.ok(interrupted.inside,'pair must use app-relative bounds');
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('Pair motion: 16 width/theme/text/motion configurations pass without detours, snaps, or stale flights.');
} finally {await browser.close();}
