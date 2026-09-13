/* Drive the real narrow-screen disclosure before activating a view control.
 *
 * It opens the menu when the control is behind it, and then stops. It used to
 * close the menu again after every click, which meant no check ever observed
 * the state a user is actually left in — the menu stayed open over the stage
 * after Fit and nothing reported it. A helper that tidies up after the thing it
 * is testing is testing the helper.
 *
 * What a control does to the menu is the app's decision, not this file's. */
export async function clickControl(page, target){
  const toggle = page.locator('#tools-toggle');
  if (!await target.isVisible() && await toggle.isVisible()) await toggle.click();
  await target.click();
}

/* Is the narrow menu open right now? */
export const menuOpen = page =>
  page.evaluate(() => !!document.querySelector('.status.tools-open'));

/* Close it if it is open, for checks that need a known starting point. */
export async function closeMenu(page){
  const toggle = page.locator('#tools-toggle');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'true')
    await toggle.click();
}
