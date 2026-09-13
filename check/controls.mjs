// Drive the real narrow-screen disclosure before activating a view control.
export async function clickControl(page, target){
  const toggle = page.locator('#tools-toggle');
  if (!await target.isVisible() && await toggle.isVisible()) await toggle.click();
  await target.click();
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'true')
    await toggle.click();
}
