import { app, BrowserWindow, shell, ipcMain, session } from 'electron';
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import os from 'os';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prevent unhandled errors from closing Electron
process.on('uncaughtException', (err) => {
  console.error('Electron Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Electron Unhandled Rejection:', reason);
});

let mainWindow = null;
let serverProcess = null;
const PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${PORT}`;

function checkServerReady(url, timeout = 15000) {
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
    }, 200);
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
      console.error('Express Backend Error:', err);
    });
  } catch (err) {
    console.error('Failed to fork server process:', err);
  }
}

function setupLocalProxyRules() {
  try {
    const filter = { urls: ['http://*/*', 'https://*/*'] };
    session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
      responseHeaders['Access-Control-Allow-Headers'] = ['*'];
      callback({ responseHeaders });
    });
  } catch (e) {
    console.warn('Proxy setup notice:', e);
  }
}

async function createWindow() {
  const preloadPath = path.resolve(__dirname, 'preload.js');

  setupLocalProxyRules();

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

  // Initial loading HTML page so window is NEVER empty or blank
  const loadingHtml = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
      <meta charset="utf-8">
      <title>AriaVMS Pro - در حال راه‌اندازی</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; height: 100vh; align-items: center; justify-content: center; margin: 0; }
        .box { text-align: center; background: #1e293b; padding: 2rem 3rem; border-radius: 1rem; border: 1px solid #334155; }
        .spinner { width: 40px; height: 40px; border: 4px solid #334155; border-top-color: #2563eb; border-radius: 50%; animation: spin 1s infinite linear; margin: 0 auto 1.5rem; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="box">
        <div class="spinner"></div>
        <h2 style="margin:0 0 0.5rem 0; font-size: 1.25rem;">در حال راه‌اندازی AriaVMS Pro...</h2>
        <p style="color:#94a3b8; font-size:0.875rem; margin:0;">در حال اتصال به سرور محلی و دوربین‌های شبکه</p>
      </div>
    </body>
    </html>
  `;
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml)}`);

  // Connect to SERVER_URL once active
  const connectToServer = async () => {
    const isReady = await checkServerReady(SERVER_URL, 15000);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(SERVER_URL).catch(() => {});
    }
  };

  connectToServer();

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
    try { serverProcess.kill(); } catch {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (serverProcess) {
    try { serverProcess.kill(); } catch {}
  }
});
