const { spawn } = require('child_process');
const fs = require('fs');

async function main() {
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/test-chrome-profile-' + Date.now(),
    '--disable-gpu',
    '--no-sandbox'
  ]);

  chrome.stderr.on('data', d => {});

  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/version');
      if (res.ok) {
        ready = true;
        break;
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  if (!ready) {
    console.error('Chrome failed to start');
    chrome.kill();
    return;
  }

  try {
    const versionRes = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' });
    const target = await versionRes.json();
    const wsUrl = target.webSocketDebuggerUrl;

    const ws = new WebSocket(wsUrl);
    let id = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg.result, msg.error);
        callbacks.delete(msg.id);
      }
    };

    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const msgId = id++;
      callbacks.set(msgId, (result, error) => {
        if (error) reject(error);
        else resolve(result);
      });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

    await new Promise(r => ws.onopen = r);

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });

    await send('Page.navigate', { url: 'http://localhost:3000/login' });
    await new Promise(r => setTimeout(r, 1000));

    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsInJvbGUiOiJjaXRpemVuIn0.27i6CIs2VIMfmwbEJbv2wfLOmRRw0nRH68qcNmLAY0c';
    await send('Runtime.evaluate', {
      expression: `localStorage.setItem("access_token", "${token}"); localStorage.setItem("user", JSON.stringify({id: 1, name: "Test User"}));`
    });

    console.log('Navigating to /dashboard/register...');
    await send('Page.navigate', { url: 'http://localhost:3000/dashboard/register' });
    await new Promise(r => setTimeout(r, 2000));

    // Fill in Step 1
    console.log('Filling Step 1...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        function setSelectValue(el, val) {
          el.value = val;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        function setInputValue(el, val) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        function setTextareaValue(el, val) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          nativeInputValueSetter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const selects = document.querySelectorAll('form select');
        if (selects[0]) setSelectValue(selects[0], 'Electricity');
      })()`
    });
    await new Promise(r => setTimeout(r, 500));

    await send('Runtime.evaluate', {
      expression: `(() => {
        function setSelectValue(el, val) {
          el.value = val;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        function setInputValue(el, val) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        function setTextareaValue(el, val) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          nativeInputValueSetter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const selects = document.querySelectorAll('form select');
        if (selects[1]) setSelectValue(selects[1], 'Street Light');
        const titleInput = document.querySelector('form input[type="text"]');
        if (titleInput) setInputValue(titleInput, 'Street light not working');
        const descTextarea = document.querySelector('form textarea');
        if (descTextarea) setTextareaValue(descTextarea, 'The street light near Mansarovar Metro Station has been not working since 3 days.');
      })()`
    });
    await new Promise(r => setTimeout(r, 500));

    // Click Next
    console.log('Clicking Next on Step 1...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('form button'));
        const nextBtn = btns.find(b => b.innerText.includes('Next'));
        if (nextBtn) nextBtn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 1000));

    let evalRes = await send('Runtime.evaluate', {
      expression: `document.body.innerText`
    });
    console.log('=== PAGE TEXT (AFTER NEXT 1 - STEP 2) ===\n', evalRes.result.value.substring(0, 500));

    // Click Next on Step 2 (Location)
    console.log('Clicking Next on Step 2...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('form button'));
        const nextBtn = btns.find(b => b.innerText.includes('Next'));
        if (nextBtn) nextBtn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 1000));

    evalRes = await send('Runtime.evaluate', {
      expression: `document.body.innerText`
    });
    console.log('=== PAGE TEXT (AFTER NEXT 2 - STEP 3) ===\n', evalRes.result.value.substring(0, 800));

    // Take screenshot of step 3
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/home/nandini/cms/end-user/scratch/step3_desktop_screenshot.png', Buffer.from(screenshot.data, 'base64'));
    console.log('Saved screenshot to /home/nandini/cms/end-user/scratch/step3_desktop_screenshot.png');

    ws.close();
  } finally {
    chrome.kill();
  }
}

main().catch(console.error);
