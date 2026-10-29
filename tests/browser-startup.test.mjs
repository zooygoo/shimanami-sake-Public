import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browser } from './helpers/browser.mjs';

test('browser startup waits for a slow first launch before checking the administrator screen',async()=>{
 const fixture=await mkdtemp(join(tmpdir(),'sake-slow-start-'));
 const previous=process.env.CHROME_BIN;
 const executable=previous||['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(existsSync);
 assert.ok(executable,'A browser is required; do not skip the screen check');
 const wrapper=join(fixture,'slow-chrome');
 let client;
 try{
  await writeFile(wrapper,`#!/bin/sh\nsleep 6\nexec '${executable.replaceAll("'","'\\''")}' "$@"\n`,{mode:0o700});
  const admin=await readFile(new URL('../apps-script/Admin.html',import.meta.url),'utf8');
  await writeFile(join(fixture,'index.html'),admin.replace('__LOGO_DATA__','').replace('__BOOTSTRAP_JSON__',JSON.stringify({connected:false})));
  process.env.CHROME_BIN=wrapper;
  client=await browser(fixture);
  await client.open(pathToFileURL(join(fixture,'index.html')).href);
  assert.equal(await client.evaluate('document.title'),'SHIMANAMIの酒 管理画面');
  assert.equal(await client.evaluate('document.getElementById("login-button").disabled'),true);
 }finally{
  if(previous===undefined)delete process.env.CHROME_BIN;else process.env.CHROME_BIN=previous;
  if(client)await client.close();
  await rm(fixture,{recursive:true,force:true});
 }
});
