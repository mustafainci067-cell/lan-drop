const { app, BrowserWindow, dialog, ipcMain, Tray, Menu, Notification, nativeImage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

// ─── Config ───────────────────────────────────────────────────────────────────
const JAVA_PORT = 8080;
const NEXT_PORT = 3000;
const isDev = !app.isPackaged;

let mainWindow = null;
let javaProcess = null;
let tray = null;
let isQuitting = false;

// ─── Setup IPC ────────────────────────────────────────────────────────────────
ipcMain.handle('get-local-ip', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
});

// ─── Find JAR path ────────────────────────────────────────────────────────────
function getJarPath() {
  if (isDev) {
    // Dev: JAR is at the project root /target/ relative to frontend/
    return path.join(__dirname, '..', '..', 'target', 'lan-drop-server.jar');
  }
  // Production (packaged): extra resources land in process.resourcesPath
  return path.join(process.resourcesPath, 'lan-drop-server.jar');
}

function getJavaExecutable() {
  const fs = require('fs');
  
  // 1. Check bundled JRE if one exists
  const bundledJava = path.join(process.resourcesPath, 'jre', 'bin', 'java.exe');
  if (fs.existsSync(bundledJava)) return bundledJava;
  
  // 2. Check Adoptium (the one that built it)
  const adoptium = 'C:\\Program Files\\Eclipse Adoptium\\jdk-25.0.3.9-hotspot\\bin\\java.exe';
  if (fs.existsSync(adoptium)) return adoptium;
  
  // 3. Check Microsoft JDK
  const ms = 'C:\\Program Files\\Microsoft\\jdk-21.0.0.35-hotspot\\bin\\java.exe';
  if (fs.existsSync(ms)) return ms;
  
  // 4. Check JAVA_HOME
  if (process.env.JAVA_HOME) {
    const jh = path.join(process.env.JAVA_HOME, 'bin', 'java.exe');
    if (fs.existsSync(jh)) return jh;
  }
  
  // 5. Fallback to system path
  return 'java';
}

// ─── Wait for a port to be ready ─────────────────────────────────────────────
function waitForPort(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        res.destroy();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Timed out waiting for port ${port}`));
        } else {
          setTimeout(check, 500);
        }
      });
      req.setTimeout(500, () => {
        req.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error(`Timed out waiting for port ${port}`));
        } else {
          setTimeout(check, 500);
        }
      });
    };
    check();
  });
}

// ─── Spawn the Java backend ───────────────────────────────────────────────────
function startJavaBackend() {
  return new Promise((resolve, reject) => {
    const jarPath = getJarPath();
    const fs = require('fs');
    
    if (!fs.existsSync(jarPath)) {
      dialog.showErrorBox('Missing JAR', 'JAR missing at: ' + jarPath);
      app.quit();
      return reject(new Error('JAR missing at: ' + jarPath));
    }

    const javaExe = getJavaExecutable();
    const os = require('os');
    const logFilePath = path.join(os.homedir(), 'Desktop', 'landrop-crash.log');
    const logFile = fs.createWriteStream(logFilePath, { flags: 'a' });
    logFile.write(`\n\n--- Starting LAN-Drop Java Backend at ${new Date().toISOString()} ---\n`);
    logFile.write(`Java Exe: ${javaExe}\nJar Path: ${jarPath}\n`);

    console.log(`[Electron] Starting Java backend: ${javaExe} -jar ${jarPath}`);

    let spawnFailed = false;

    const outPath = path.join(__dirname, '..', 'out');

    try {
      javaProcess = spawn(javaExe, ['-jar', jarPath, '--static', outPath], {
        stdio: 'pipe',
        detached: false,
        windowsHide: true,
      });
      javaProcess.stdout.pipe(logFile);
      javaProcess.stderr.pipe(logFile);
    } catch (err) {
      logFile.write(`Spawn exception: ${err.stack}\n`);
      dialog.showErrorBox('Spawn Exception', err.message + '\nPath: ' + javaExe);
      app.quit();
      return reject(err);
    }

    javaProcess.on('error', (err) => {
      spawnFailed = true;
      console.error('[Electron] Failed to start Java process:', err);
      dialog.showErrorBox('Spawn Error', err.message + '\nMake sure Java is installed and in your PATH.');
      app.quit();
      reject(err);
    });

    javaProcess.on('exit', (code, signal) => {
      console.log(`[Electron] Java process exited with code ${code}, signal ${signal}`);
      javaProcess = null;
    });

    // Wait up to 20 seconds for the Java HTTP server to be ready
    waitForPort(JAVA_PORT, 20000)
      .then(() => {
        if (!spawnFailed) {
          console.log(`[Electron] Java backend is ready on port ${JAVA_PORT}`);
          resolve();
        }
      })
      .catch((err) => {
        if (!spawnFailed) {
          console.error('[Electron] Java backend did not start in time:', err.message);
          reject(err);
        }
      });
  });
}

// ─── Create the browser window ────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#09090b',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '..', 'public', 'icon-512.png'),
    show: false, // show after ready-to-show to avoid white flash
  });

  if (isDev) {
    console.log(`[Electron] Loading URL: http://localhost:${NEXT_PORT}`);
    mainWindow.loadURL(`http://localhost:${NEXT_PORT}`);
  } else {
    const htmlPath = path.join(__dirname, '..', 'out', 'index.html');
    console.log(`[Electron] Loading File: ${htmlPath}`);
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Force DevTools open in production to debug blank screen
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const notifiedTransfers = new Set();

function startNotificationPolling() {
  setInterval(() => {
    const req = http.get(`http://localhost:${JAVA_PORT}/api/pending-transfers`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const transfers = JSON.parse(data);
          for (const t of transfers) {
            if (!notifiedTransfers.has(t.id)) {
              notifiedTransfers.add(t.id);
              showTransferNotification(t);
            }
          }
        } catch (e) {}
      });
    });
    req.on('error', () => {});
  }, 2000);
}

function showTransferNotification(transfer) {
  const n = new Notification({
    title: 'Incoming File - LAN-Drop',
    body: `${transfer.senderDevice} wants to send ${transfer.filename} (${(transfer.size / 1024 / 1024).toFixed(2)} MB).`,
    actions: [{ type: 'button', text: 'Accept' }, { type: 'button', text: 'Reject' }]
  });
  
  n.on('action', (event, index) => {
    const action = index === 0 ? 'ACCEPT' : 'REJECT';
    const postData = `transferId=${transfer.id}&action=${action}`;
    const req = http.request({
      hostname: 'localhost',
      port: JAVA_PORT,
      path: '/api/transfer-action',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    });
    req.write(postData);
    req.end();
  });
  
  n.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
  
  n.show();
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    await startJavaBackend();
    createWindow();
    
    const iconPath = path.join(__dirname, '..', 'public', 'icon-512.png');
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show App', click: () => { if (mainWindow) mainWindow.show(); } },
      { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setToolTip('LAN-Drop');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => { if (mainWindow) mainWindow.show(); });
    
    startNotificationPolling();
    
  } catch (err) {
    dialog.showErrorBox(
      'LAN-Drop — Backend Error',
      `Failed to start the Java backend.\n\n${err.message}\n\nMake sure Java (JRE 21+) is installed.`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // We only close if quitting
  if (isQuitting && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  if (javaProcess) {
    console.log('[Electron] Killing Java backend process...');
    javaProcess.kill('SIGTERM');
    javaProcess = null;
  }
});
