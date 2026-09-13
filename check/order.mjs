/* The two rules about arrangement, tested against a document.
 *
 * Both were written by running them over the documents on the author's machine,
 * which is how three wrong versions were caught — and how a fourth was not: a
 * rule can be silent everywhere and still be silent for the wrong reason. These
 * break one law at a time in a real page and ask check/laws.mjs what it sees.
 *
 * The layouts are applied as transforms on the model example's three cards, so
 * the index order is fixed by the model and only the space moves under it. */
import assert from 'node:assert/strict';
import { launchBrowser } from './browser.mjs';
import { audit } from './laws.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const browser = await launchBrowser();
let runs = 0;
// The model example's root: three 240x150 cards at y 80, x 40 / 340 / 640,
// indexed server, workstation, notes. A layout names where each one goes.
const HOME = {server: [40, 80], workstation: [340, 80], notes: [640, 80]};

async function layout(page, places){
  await page.evaluate(([home, want]) => {
    for (const [id, [x, y]] of Object.entries(want)) {
      const [hx, hy] = home[id];
      document.querySelector(`[data-object-id="${id}"]`).setAttribute('transform', `translate(${x - hx},${y - hy})`);
    }
    window.demo.stage.fit();
  }, [HOME, places]);
  await page.waitForTimeout(80);
}
const orders = v => v.filter(s => s.startsWith('order:'));

try {
  for (const colorScheme of ['light', 'dark']) {
    const page = await browser.newPage({viewport:{width:1440,height:900},colorScheme,reducedMotion:'reduce'});
    await page.goto(pathToFileURL(resolve('example/dist/model.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(120);

    // 1. The failure the law was bought by: a grid whose column gap (160) dwarfs
    //    its row gap (20), so proximity groups the columns, while the index
    //    beside it reads across. The space and the panel say different things.
    await layout(page, {server:[40,80], workstation:[440,80], notes:[40,250]});
    assert.deepEqual(orders(await page.evaluate(audit)),
      ['order: the stage groups by column while the index reads by row'],
      'a column-grouped grid under a row-major index is reported');

    // 2. The same two readings, the other way round: a 200 row gap against a 20
    //    column gap groups by row, which is what the index reads. Nothing to say.
    const rowMajor = {server:[40,80], workstation:[300,80], notes:[40,430]};
    await layout(page, rowMajor);
    assert.deepEqual(orders(await page.evaluate(audit)), [],
      'a layout whose gaps agree with its index is silent');

    // 3. Regression. An object's group is its drawn geometry, so a heading drawn
    //    inside one card's group moves that card's measured top and sorts it into
    //    a row it is not in. The reading is unchanged and the reader sees nothing
    //    wrong; measuring the group rather than the declared face invented a
    //    contradiction, and declaring data-face did not silence it.
    await page.evaluate(() => {
      const g = document.querySelector('[data-object-id="workstation"]');
      const t = document.createElementNS(g.namespaceURI, 'text');
      t.setAttribute('x', 340); t.setAttribute('y', 62); t.setAttribute('id', 'grew');
      t.textContent = 'a heading above the card';
      g.appendChild(t);
      window.demo.stage.refresh();
    });
    await page.waitForTimeout(80);
    assert.deepEqual(orders(await page.evaluate(audit)), [],
      'decoration inside an object group does not change the level\'s reading');
    await page.evaluate(()=>{document.querySelector('#grew').remove(); window.demo.stage.refresh()});

    // 4. An arrangement offering neither reading the index lists.
    await layout(page, {server:[340,80], workstation:[40,80], notes:[40,300]});
    assert.deepEqual(orders(await page.evaluate(audit)),
      ['order: the index lists the level in an order the stage does not offer'],
      'an index matching neither reading is reported');
    await layout(page, rowMajor);

    // 5. A layer created before the content is painted under it, so a label
    //    wider than the gap it sits in is covered rather than clipped: nothing
    //    errors and the reader sees half a word.
    const label = async (fill) => page.evaluate((f) => {
      document.querySelector('#probe')?.remove();
      const content = document.querySelector('#content');
      const g = document.createElementNS(content.namespaceURI, 'g');
      g.id = 'probe';
      const t = document.createElementNS(content.namespaceURI, 'text');
      // Straight across the first card, in the layer beneath it.
      const home = document.querySelector('[data-object-id="server"]').getBBox();
      t.setAttribute('x', home.x + 20); t.setAttribute('y', home.y + home.height / 2);
      t.setAttribute('font-size', '18'); t.textContent = 'a label wider than its gap';
      g.appendChild(t);
      content.parentNode.insertBefore(g, content);
      for (const r of document.querySelectorAll('[data-object-id="server"] rect')) r.style.fill = f;
    }, fill);

    await label('');
    await page.waitForTimeout(60);
    assert.deepEqual(orders(await page.evaluate(audit)),
      ['order: "a label wider than" is drawn outside the objects but painted under one'],
      'a label painted under an object is reported');

    // 6. The negative case. Overlapping an object's bounds is not being hidden by
    //    it: an object that paints nothing where the label sits leaves the label
    //    perfectly readable, and a rule that reports that is one authors learn to
    //    ignore.
    await label('none');
    await page.waitForTimeout(60);
    assert.deepEqual(orders(await page.evaluate(audit)), [],
      'a label under an object that paints nothing there is not covered');

    await page.close(); runs++;
  }
  console.log(`arrangement: all ${runs} configurations hold`);
} finally { await browser.close() }
