/* The status strip: one row, assembled one way, and a menu whose lifecycle is
 * the app's decision rather than a test helper's.
 *
 * Both halves of this were invisible before. The bar's law inspected only the
 * elements spelled .cell, so the controls that moved in beside them were never
 * compared with anything; and the helper that opened the narrow menu closed it
 * again after every click, so no check ever saw the state a reader is left in.
 * These drive the real controls and then look. */
import assert from 'node:assert/strict';
import { launchBrowser } from './browser.mjs';
import { clickControl, menuOpen } from './controls.mjs';
import { audit } from './laws.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const URL = pathToFileURL(resolve('example/dist/model.html')).href;
const browser = await launchBrowser();
const barHeight = p => p.evaluate(() =>
  Math.round(document.querySelector('.status').getBoundingClientRect().height));

let runs = 0;
try {
  /* One row, at every width and text size the documents are read at. 13 inches
     is the design target; 400px is the floor the harness holds everything to. */
  for (const [w, h] of [[1440, 900], [1280, 800], [1180, 760], [400, 780]]) {
    for (const scale of ['1', '1.5']) {
      const page = await browser.newPage({viewport:{width:w,height:h}, reducedMotion:'reduce'});
      await page.goto(URL);
      await page.evaluate(()=>document.fonts.ready);
      // Crowd the bar with author readouts: the wrap only showed up when a
      // document had more to say than the window had room for.
      await page.evaluate(() => {
        const bar = document.querySelector('.status');
        for (const t of ['every claim is marked measured or chosen',
                         'an extra readout that will not fit',
                         'and one more for good measure']) {
          const c = document.createElement('span');
          c.className = 'cell'; c.textContent = t; bar.appendChild(c);
        }
      });
      await page.evaluate(s => document.documentElement.style.setProperty('--ui-scale', s), scale);
      await page.waitForTimeout(250);
      const oneRow = Math.round(30 * parseFloat(scale)) + 2;
      const got = await barHeight(page);
      assert.ok(got <= oneRow,
        `the bar wrapped to ${got}px at ${w}px / ${scale}x text where one row is ${oneRow}px`);
      // And the law says so too, not just this check.
      assert.deepEqual((await page.evaluate(audit)).filter(v => v.startsWith('status:')), [],
        `the bar's own law reports a fault at ${w}px / ${scale}x text`);
      await page.close(); runs++;
    }
  }

  /* The menu's lifecycle, driven the way a reader drives it. */
  const page = await browser.newPage({viewport:{width:400,height:780}, reducedMotion:'reduce'});
  await page.goto(URL);
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(200);
  const toggle = page.locator('#tools-toggle');
  assert.ok(await toggle.isVisible(), 'the narrow window discloses its controls behind an ellipsis');

  // Fit ends a gesture: the menu has served its purpose and gets out of the way.
  await clickControl(page, page.locator('#fit'));
  await page.waitForTimeout(250);
  assert.equal(await menuOpen(page), false, 'Fit leaves the menu open over the stage');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false',
    'the ellipsis still claims to be expanded after Fit closed the menu');

  // Zoom invites repetition: the menu stays, so a reader can zoom again.
  await clickControl(page, page.locator('#zoom-in'));
  await page.waitForTimeout(250);
  assert.equal(await menuOpen(page), true, 'zoom closed the menu a reader was about to use again');

  // Escape dismisses it, like every other surface in the shell.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert.equal(await menuOpen(page), false, 'Escape does not close the menu');

  // A click outside dismisses it too.
  await toggle.click();
  await page.waitForTimeout(150);
  assert.equal(await menuOpen(page), true, 'the ellipsis did not reopen the menu');
  await page.mouse.click(200, 300);
  await page.waitForTimeout(200);
  assert.equal(await menuOpen(page), false, 'a click outside does not dismiss the menu');

  // Open, it must not be clipped by the strip it hangs off.
  await toggle.click();
  await page.waitForTimeout(200);
  const box = await page.locator('.tools').boundingBox();
  assert.ok(box && box.width > 40 && box.y >= 0 && box.y + box.height <= 780 + 1,
    'the open menu is clipped or off screen');
  await page.close(); runs++;

  console.log(`status bar: all ${runs} configurations hold`);
} finally { await browser.close() }
