import assert from 'node:assert/strict';
import { launchBrowser } from './browser.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser = await launchBrowser();
let runs = 0;
try {
  for (const width of [1440,1180,400]) for (const colorScheme of ['light','dark']) {
    const page = await browser.newPage({viewport:{width,height:900},colorScheme,reducedMotion:'reduce'});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(resolve('example/dist/model.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    const rows = page.locator('[data-nav-body] [data-stage-object]');
    const labels = () => page.locator('[data-nav-body] .name').allTextContents();
    assert.deepEqual(await labels(),['Server','Workstation','Notes']);
    await page.locator('.stage-entrances button[aria-label="Enter Server"]').click();
    assert.deepEqual(await labels(),['SSH','Loopback','Worker'],'owner is context in the path, not a ghost row');
    assert.deepEqual(await rows.evaluateAll(rs=>rs.map(r=>Number(r.dataset.indexDepth))),[0,0,1]);
    assert.equal(await page.locator('[data-stage-live] [data-object-id="loopback"] [data-object-id="worker"]').count(),1,
      'the drawn containment and indentation come from the same children array');
    assert.equal(await rows.evaluateAll(rs=>rs.every(r=>r.orreryObject.closest('[data-stage-live]'))),true);
    if (width>820) {
      await page.locator('[data-nav-body] .name').filter({hasText:'Worker'}).click();
      assert.equal(await page.locator('[data-nav-body] .sel .name').textContent(),'Worker');
      await page.locator('#fit').click();
    }
    if (process.env.MODEL_SCREENSHOTS)
      await page.screenshot({path:`${process.env.MODEL_SCREENSHOTS}/${width}-${colorScheme}.png`});
    await page.locator('#stage-back').click();
    await page.locator('.stage-entrances button[aria-label="Enter Workstation"]').click();
    assert.deepEqual(await labels(),['Editor','Terminal'],'different owners open their own contents');
    await page.keyboard.press('Escape');
    // A third level declares its own interior; it does not borrow root routing.
    await page.evaluate(()=>{
      demo.server.items[0].interior={id:'ssh-detail',label:'SSH details',items:[
        {id:'listener',label:'Listener',draw:demo.workstation.items[0].draw},
      ]};
      demo.stage.refresh();
    });
    await page.locator('.stage-entrances button[aria-label="Enter Server"]').click();
    await page.locator('.stage-entrances button[aria-label="Enter SSH"]').click();
    assert.deepEqual(await labels(),['Listener']);
    assert.equal(await page.evaluate(()=>demo.stage.depth()),2);
    await page.locator('.titlebar .path button').first().click();
    assert.deepEqual(await labels(),['Server','Workstation','Notes']);
    // Redraw preserves ownership, even though SVG nodes have been replaced.
    await page.evaluate(()=>demo.stage.redraw());
    assert.equal(await page.locator('.stage-entrances .enter-control').count(),2);
    const transactional = await page.evaluate(()=>{
      const node=demo.stage.level().querySelector('[data-object-id="server"]');
      let invalidEntry, invalidDrawing;
      demo.server.items.push({...demo.server.items[0]});
      try {demo.stage.enter(node)} catch(e){invalidEntry=e.message}
      demo.server.items.pop();
      const item=demo.model.items[0], draw=item.draw;
      item.draw=()=>{};
      try {demo.stage.redraw()} catch(e){invalidDrawing=e.message}
      item.draw=draw;
      return {invalidEntry,invalidDrawing,depth:demo.stage.depth(),
        kept:demo.stage.level().contains(node)};
    });
    assert.match(transactional.invalidEntry,/duplicate object id/);
    assert.match(transactional.invalidDrawing,/no drawn geometry/);
    assert.equal(transactional.depth,0);
    assert.equal(transactional.kept,true,'failed redraw preserves the last valid stage');
    const failures = await page.evaluate(()=>{
      const shape=()=>{};
      const leaf=(id)=>({id,label:id,draw:shape});
      const interior=()=>({id:'inside',label:'Inside',items:[leaf('child')]});
      const root=(items)=>({id:'root',label:'Root',items});
      const results={};
      const check=(key,fn)=>{try{fn();results[key]='accepted'}catch(e){results[key]=e.message}};
      const common=interior();
      check('reused',()=>validateStageModel(root([{...leaf('a'),interior:common},{...leaf('b'),interior:common}])));
      common.shared=true;
      check('shared',()=>validateStageModel(root([{...leaf('a'),interior:common},{...leaf('b'),interior:common}])));
      check('duplicateStage',()=>validateStageModel(root([{...leaf('a'),interior:interior()},{...leaf('b'),interior:interior()}])));
      check('duplicateObject',()=>validateStageModel(root([leaf('a'),leaf('a')])));
      check('separateParent',()=>validateStageModel(root([{...leaf('a'),parent:'missing'}])));
      const cycle=root([]);cycle.items.push({...leaf('a'),interior:cycle});
      check('cycle',()=>validateStageModel(cycle));
      const child=leaf('same');
      check('reusedObject',()=>validateStageModel(root([child,{...leaf('b'),interior:{id:'second',label:'Second',items:[child]}}])));
      return results;
    });
    assert.match(failures.reused,/multiple owners/);
    assert.equal(failures.shared,'accepted');
    assert.match(failures.duplicateStage,/Duplicate stage id/);
    assert.match(failures.duplicateObject,/duplicate object id/);
    assert.match(failures.separateParent,/Use children/);
    assert.match(failures.cycle,/cycle/);
    assert.match(failures.reusedObject,/reused in different places/);
    assert.deepEqual(errors,[]);
    await page.close();runs++;
  }
  console.log(`stage model: all ${runs} configurations hold`);
} finally {await browser.close()}
