import assert from 'node:assert/strict';
import { launchBrowser } from './browser.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const browser = await launchBrowser();
let runs=0;
try {
  for (const width of [1440,1180,400]) for (const reducedMotion of ['reduce','no-preference']) {
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion,
      colorScheme:reducedMotion==='reduce'?'dark':'light'});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(resolve('example/dist/context.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    const result=await page.evaluate(()=>{
      const s=demo.stage, checks={};
      const enter=id=>s.enter(s.level().querySelector(`[data-object-id="${id}"]`));
      const text=()=>s.level().textContent;
      s.setView({x:10,y:20,w:1100,h:700});
      const rootCamera={...s.getView()};
      enter('server'); enter('worker'); // second entry also interrupts first transition
      s.setView({x:20,y:30,w:600,h:450});
      const innerCamera={...s.getView()};
      s.setScenario('no-key');
      checks.nested=[s.depth(),text(),JSON.stringify(s.getView())===JSON.stringify(innerCamera)];
      s.back(); s.snapshotLevels();
      checks.parent=[s.depth(),text()];
      s.back(); s.snapshotLevels();
      checks.root=[s.depth(),text(),Math.abs(s.getView().w-rootCamera.w)<.001];
      s.setScenario('asleep');
      checks.patch={...s.context().settings};
      s.setScenario('ready');
      checks.replace={...s.context().settings};
      s.setSettings({online:false,key:false});
      checks.matched=s.context().scenario;
      s.setSettings({online:true,installed:false});
      checks.custom=s.context().scenario;
      checks.customLabel=document.querySelector('.context-status').textContent;
      s.setScenario('no-key'); enter('server'); enter('worker');
      const switched=s.setViewMode('inventory');
      checks.view=[s.depth(),s.context().scenario,s.context().view,switched.returned,text()];
      checks.notice=document.querySelector('.context-status').textContent;
      checks.rows=[...document.querySelectorAll('[data-nav-body] .name')].map(n=>n.textContent);
      s.setViewMode('flow'); enter('worker');
      const old=s.level(), before=s.context(); demo.fail(true);
      try {s.setScenario('ready')} catch(e) {checks.drawError=e.message;}
      checks.rollback=old===s.level() && before===s.context() && s.depth()===2;
      demo.fail(false);
      try {s.setSettings({unknown:true})} catch(e) {checks.unknown=e.message;}
      try {s.setViewMode('unknown')} catch(e) {checks.unknownView=e.message;}
      const removed=s.setScenario('absent');
      checks.removed=[s.depth(),removed.returned,text()];
      s.setScenario('ready'); enter('server'); enter('worker');
      s.setScenario('no-key'); s.backTo(0); s.snapshotLevels();
      checks.jump=[s.depth(),text()];
      checks.orphans=document.querySelectorAll('svg.stage g[style*="visibility: hidden"]').length;
      return checks;
    });
    assert.deepEqual(result.nested,[2,'Socket: Key missing',true]);
    assert.deepEqual(result.parent,[1,'Worker: Key missingAccess denied']);
    assert.deepEqual(result.root,[0,'Client requestServer: Key missing',true]);
    assert.deepEqual(result.patch,{online:false,key:false,installed:true});
    assert.deepEqual(result.replace,{online:true,key:true,installed:true});
    assert.equal(result.matched,'asleep');
    assert.equal(result.custom,null); assert.match(result.customLabel,/Custom settings/);
    assert.deepEqual(result.view,[1,'no-key','inventory',true,'Worker: Key missingAccess denied']);
    assert.match(result.notice,/Returned to Server/);
    assert.deepEqual(result.rows,['Worker: Key missing','Access denied']);
    assert.match(result.drawError,/no drawn geometry/); assert.equal(result.rollback,true);
    assert.match(result.unknown,/Invalid setting/); assert.match(result.unknownView,/Unknown choice/);
    assert.deepEqual(result.removed,[0,true,'Client request']);
    assert.deepEqual(result.jump,[0,'Client requestServer: Key missing']);
    assert.equal(result.orphans,0);
    // Native buttons retain keyboard and touch-compatible activation semantics.
    const ready=page.locator('[data-context-kind="scenario"][data-context-id="ready"]');
    await ready.focus(); await page.keyboard.press('Enter');
    assert.equal(await ready.getAttribute('aria-pressed'),'true');
    await page.locator('[data-context-id="no-key"]').click();
    assert.equal(await ready.getAttribute('aria-pressed'),'false');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    if (process.env.CONTEXT_SCREENSHOTS) await page.screenshot({path:`${process.env.CONTEXT_SCREENSHOTS}/${width}-${reducedMotion}.png`});
    await page.close(); runs++;
  }
  console.log(`Context checks passed: ${runs} viewport/motion configurations.`);
} finally {await browser.close();}
