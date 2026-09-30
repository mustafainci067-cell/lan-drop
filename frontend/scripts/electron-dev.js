#!/usr/bin/env node
/**
 * scripts/electron-dev.js
 * Cross-platform dev launcher: waits for Next.js on :3000, then spawns Electron.
 * Avoids shell && operator which doesn't work in PowerShell without PSv7.
 */
const { spawn } = require('child_process');
const http = require('http');

const NEXT_PORT = 3000;
const POLL_INTERVAL = 500;
const TIMEOUT = 60000;

function waitForPort(port) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        res.destroy();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > TIMEOUT) {
          reject(new Error(`Timed out waiting for port ${port}`));
        } else {
          setTimeout(check, POLL_INTERVAL);
        }
      });
      req.setTimeout(POLL_INTERVAL, () => { req.destroy(); });
    };
    check();
  });
}

(async () => {
  console.log(`[launcher] Waiting for Next.js on port ${NEXT_PORT}...`);
  try {
    await waitForPort(NEXT_PORT);
    console.log('[launcher] Next.js ready. Launching Electron...');
  } catch (e) {
    console.error('[launcher]', e.message);
    process.exit(1);
  }

  const electronPath = require('electron');
  const electron = spawn(String(electronPath), ['.'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  });

  electron.on('close', (code) => {
    console.log(`[launcher] Electron exited with code ${code}`);
    process.exit(code || 0);
  });
})();
