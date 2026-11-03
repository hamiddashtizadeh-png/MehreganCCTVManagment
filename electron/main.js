import { app, BrowserWindow, shell, ipcMain, session } from 'electron';
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let serverProcess = null;
const PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${PORT}`;

function checkServerReady(url, timeout = 25000) {
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
    }, 300);
  });
}

function startBackendServer() {
  const serverPath = path.resolve(__dirname, '..', 'server.ts');
  
  serverProcess = fork(serverPath, [], {
    execArgv: ['--import', 'tsx'],
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' }
  });

  serverProcess.on('error', (err) => {
    console.error('Express Server Error:', err);
  });
}

/**
 * Configure Electron Network Session Local Proxy rules to bypass CORS
 * and handle custom HTTP Auth headers for LAN IP Cameras (Hikvision, Dahua, Tiandy, ONVIF)
 */
function setupLocalProxyRules() {
  const filter = { urls: ['http://192.168.*/*', 'http://10.*/*', 'http://172.16.*/*', 'http://localhost:*/*'] };

  // 1. Bypass CORS headers on incoming HTTP responses from LAN camera IP addresses
  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const responseHeaders = { ...details.responseHeaders };

    // Inject permissive CORS headers
    responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
    responseHeaders['Access-Control-Allow-Headers'] = ['*'];
    responseHeaders['Access-Control-Allow-Credentials'] = ['true'];

    callback({ responseHeaders });
  });

  // 2. Ensure custom Authorization & Range headers are preserved for camera snapshot / stream requests
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    requestHeaders['Origin'] = SERVER_URL;
    callback({ requestHeaders });
  });
}

async function createWindow() {
  const preloadPath = path.resolve(__dirname, 'preload.js');

  // Activate Local Proxy & CORS Bypass interceptors
  setupLocalProxyRules();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 850,
    minWidth: 1024,
    minHeight: 640,
    title: 'AriaVMS Pro - سیستم مدیریت ویدئویی و پلاک‌خوان',
    icon: path.resolve(__dirname, '..', 'public', 'icon.svg'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Bypasses cross-origin restrictions for LAN video streams & HTTP snapshots
      allowRunningInsecureContent: true // Allows HTTP camera feeds inside HTTPS contexts
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

  await checkServerReady(SERVER_URL);
  mainWindow.loadURL(SERVER_URL);

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
