import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('===================================================');
console.log('  AriaVMS Pro - Electron Setup Generator Script');
console.log('===================================================\n');

const electronDir = path.join(__dirname, 'electron');
if (!fs.existsSync(electronDir)) {
  fs.mkdirSync(electronDir, { recursive: true });
  console.log('✔ Created /electron directory');
}

const mainJsContent = `import { app, BrowserWindow, shell, ipcMain, session } from 'electron';
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
const SERVER_URL = \`http://localhost:\${PORT}\`;

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
    console.error('Express Backend Error:', err);
  });
}

function setupLocalProxyRules() {
  const filter = { urls: ['http://192.168.*/*', 'http://10.*/*', 'http://172.16.*/*', 'http://localhost:*/*'] };

  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
    responseHeaders['Access-Control-Allow-Headers'] = ['*'];
    responseHeaders['Access-Control-Allow-Credentials'] = ['true'];
    callback({ responseHeaders });
  });

  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    requestHeaders['Origin'] = SERVER_URL;
    callback({ requestHeaders });
  });
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
      if (!url.includes(\`localhost:\${PORT}\`)) {
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
`;

fs.writeFileSync(path.join(electronDir, 'main.js'), mainJsContent, 'utf-8');
console.log('✔ Generated /electron/main.js with local proxy rules');

const preloadJsContent = `import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
`;

fs.writeFileSync(path.join(electronDir, 'preload.js'), preloadJsContent, 'utf-8');
console.log('✔ Generated /electron/preload.js');

const pkgPath = path.join(__dirname, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkgData = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkgData.main = 'electron/main.js';
  pkgData.scripts = pkgData.scripts || {};
  pkgData.scripts.electron = 'electron .';
  pkgData.scripts['build:exe'] = 'electron-builder --win';
  pkgData.scripts['setup:electron'] = 'node build-electron-setup.js';

  pkgData.build = {
    appId: 'com.ariavms.pro',
    productName: 'AriaVMS Pro',
    directories: {
      output: 'dist-electron'
    },
    files: [
      '**/*'
    ],
    win: {
      target: 'nsis',
      icon: 'public/icon.svg'
    }
  };

  fs.writeFileSync(pkgPath, JSON.stringify(pkgData, null, 2), 'utf-8');
  console.log('✔ Updated package.json');
}

console.log('\n===================================================');
console.log('  Electron Setup Complete!');
console.log('===================================================\n');
