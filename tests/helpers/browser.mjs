import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, extname } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

// Chromium DevTools Protocol via Node's built-in WebSocket; no npm packages.
export async function browser(serveRoot = process.cwd()) {
  const profile = await mkdtemp(join(tmpdir(), 'sake-browser-'));
  const executable = process.env.CHROME_BIN || ['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(existsSync) || 'chromium';
  const child = spawn(executable, ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-proxy-server', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let launchError;
  child.on('error', error => { launchError = error; });
  let port;
  // A cold Chrome launch on CI can take longer than five seconds.
  for (let i = 0; i < 800; i++) {
    if (launchError) throw launchError;
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(25); }
  }
  if (!port) { child.kill(); throw new Error('Chromium did not start'); }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const pending = new Map();
  const listeners = new Map();
  let sequence = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if(message.method) (listeners.get(message.method)||[]).forEach(fn=>fn(message.params));
    if (message.id) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result); }
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  await send('Page.enable');
  // Keep automated tests offline, including Google Fonts.
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['https://*'] });
  const base = '/shimanami-sake-Public/';
  const server = createServer(async (req,res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if (!pathname.startsWith(base)) { res.writeHead(404).end(); return; }
      let path = resolve(serveRoot, pathname.slice(base.length));
      if (!path.startsWith(serveRoot + '/')) { res.writeHead(403).end(); return; }
      if (pathname.endsWith('/')) path=join(path,'index.html');
      res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.css':'text/css','.mjs':'text/javascript','.png':'image/png','.jpg':'image/jpeg'})[extname(path)] || 'application/octet-stream');
      res.end(await readFile(path));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    send, evaluate,
    on(method,callback){const list=listeners.get(method)||[];list.push(callback);listeners.set(method,list);},
    async open(url, width = 1366, height = 900) {
      if (url.startsWith('file:')) url=origin+base+relative(serveRoot,fileURLToPath(url));
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await send('Page.navigate', { url });
      for (let i = 0; i < 200; i++) {
        if (await evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`)) break;
        await delay(25);
      }
      await evaluate('document.fonts.ready.then(() => true)');
    },
    async screenshot(path, fullPage = false) {
      await evaluate("Promise.all([...document.images].map(img=>{img.loading='eager';return img.decode()})).then(()=>true)");
      const metrics = await send('Page.getLayoutMetrics');
      const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage, ...(fullPage ? { clip: { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 } } : {}) });
      await writeFile(path, Buffer.from(result.data, 'base64'));
    },
    async close() { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); socket.close(); child.kill(); await new Promise(resolve => child.once('exit', resolve)); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  };
}
