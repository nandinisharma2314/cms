import { spawn } from 'child_process';

async function main() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9235',
    '--no-sandbox',
    '--user-data-dir=/tmp/chrome-art-debug',
    'about:blank'
  ]);

  await new Promise(r => setTimeout(r, 1200));
  const versionRes = await fetch('http://127.0.0.1:9235/json/list');
  const tabs = await versionRes.json();
  const pageTab = tabs[0];
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

  let id = 1;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await new Promise(r => (ws.onopen = r));

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });

  await send('Page.navigate', { url: 'http://localhost:3000/dashboard' });
  await new Promise(r => setTimeout(r, 1500));

  const info = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const mobArt = document.querySelector('.banner-artwork-container.mobile-art');
        const deskArt = document.querySelector('.banner-artwork-container.desktop-art');
        const svg = mobArt ? mobArt.querySelector('svg') : null;
        const g = svg ? svg.querySelector('.megaphone-hand-group') : null;

        return {
          mobArtDisplay: mobArt ? getComputedStyle(mobArt).display : null,
          mobArtRect: mobArt ? mobArt.getBoundingClientRect() : null,
          deskArtDisplay: deskArt ? getComputedStyle(deskArt).display : null,
          svgRect: svg ? svg.getBoundingClientRect() : null,
          gBBox: g ? g.getBBox() : null
        };
      })()
    `,
    returnByValue: true
  });

  console.log('Mobile art info:', JSON.stringify(info.result.value, null, 2));

  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch(console.error);
