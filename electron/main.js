import { app, BrowserWindow, shell, ipcMain, session } from 'electron';
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import os from 'os';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let serverProcess = null;
const PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${PORT}`;

function checkServerReady(url, timeout = 12000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve(true);
        }
      }).on('error', () => {
        if (Date.now() - start > timeout) {
          clearInterval(interval);
          resolve(false);
        }
      });
    }, 250);
  });
}

function startBackendServer() {
  const isPackaged = app.isPackaged;
  let serverPath;
  let execArgv = [];

  if (isPackaged) {
    serverPath = path.join(process.resourcesPath, 'app.asar', 'dist', 'server.js');
    if (!fs.existsSync(serverPath)) {
      serverPath = path.join(__dirname, '..', 'server.ts');
      execArgv = ['--import', 'tsx'];
    }
  } else {
    serverPath = path.resolve(__dirname, '..', 'server.ts');
    execArgv = ['--import', 'tsx'];
  }

  try {
    serverProcess = fork(serverPath, [], {
      execArgv,
      env: { ...process.env, PORT: String(PORT) }
    });

    serverProcess.on('error', (err) => {
      console.error('Express Backend Server Error:', err);
    });
  } catch (err) {
    console.error('Failed to start server process:', err);
  }
}

/**
 * Configure Electron Network Session Local Proxy rules using valid Chromium pattern filters
 */
function setupLocalProxyRules() {
  // Use Chromium valid URL pattern filter matchers
  const filter = { urls: ['http://*/*', 'https://*/*'] };

  try {
    session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
      responseHeaders['Access-Control-Allow-Headers'] = ['*'];
      callback({ responseHeaders });
    });
  } catch (err) {
    console.warn('Proxy rules notice:', err);
  }
}

async function createWindow() {
  const preloadPath = path.resolve(__dirname, 'preload.js');

  try {
    setupLocalProxyRules();
  } catch {}

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 850,
    minWidth: 1024,
    minHeight: 640,
    title: 'AriaVMS Pro - سیستم مدیریت ویدئویی و پلاک‌خوان',
    icon: path.resolve(__dirname, '..', 'public', 'icon.svg'),
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      if (!url.includes(`localhost:${PORT}`)) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    }
    return { action: 'allow' };
  });

  const loadApp = async () => {
    await checkServerReady(SERVER_URL, 6000);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(SERVER_URL).catch(() => {});
    }
  };

  loadApp();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('get-system-info', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    networkInterfaces: os.networkInterfaces()
  };
});

ipcMain.handle('open-external', async (_, url) => {
  await shell.openExternal(url);
  return true;
});

app.whenReady().then(async () => {
  startBackendServer();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
