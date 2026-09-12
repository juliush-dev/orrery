/* playwright-core bundles no browser, and the version it expects is not always
   the one a machine has. Try, in order: the browser CHROMIUM_PATH names, the
   one Playwright resolves for itself, and any Chromium already sitting in
   Playwright's cache — then say plainly what to do. No path here is true of
   one machine only. */
import { chromium } from 'playwright-core';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

const CACHES = {
  linux: join(homedir(), '.cache', 'ms-playwright'),
  darwin: join(homedir(), 'Library', 'Caches', 'ms-playwright'),
  win32: join(process.env.LOCALAPPDATA || homedir(), 'ms-playwright'),
};
const BINARIES = [
  ['chrome-linux', 'chrome'], ['chrome-linux', 'headless_shell'],
  ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
  ['chrome-win', 'chrome.exe'],
];

function cached(){
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || CACHES[platform()];
  if (!root || !existsSync(root)) return [];
  const out = [];
  for (const dir of readdirSync(root)) {
    if (!/^chromium/.test(dir)) continue;
    for (const parts of BINARIES) {
      const exe = join(root, dir, ...parts);
      if (existsSync(exe)) out.push(exe);
    }
  }
  return out;
}

export async function launchBrowser(){
  const tried = [];
  const attempts = [process.env.CHROMIUM_PATH, '', ...cached()];
  for (const exe of attempts) {
    if (exe === undefined || (exe && tried.includes(exe))) continue;
    tried.push(exe);
    try { return await chromium.launch(exe ? {executablePath: exe} : {}); }
    catch { /* try the next candidate */ }
  }
  console.error('Cannot start a browser.\n' +
    'Install one with `npx playwright install chromium`, or point CHROMIUM_PATH ' +
    'at a Chrome or Chromium you already have.');
  process.exit(2);
}
