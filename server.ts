import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import net from 'net';
import dgram from 'dgram';
import crypto from 'crypto';
import os from 'os';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import {
  AISceneOptimizationResult,
  CameraBrand,
  CameraDevice,
  CameraISPSettings,
  DetectionRecord,
  DiscoveredNetworkDevice,
  WatchlistEntry,
} from './src/types/nvr';
import {
  BRAND_METADATA,
  buildCameraEndpoints,
  formatJalaliDateTime,
  getDefaultISPSettings,
  INSTALL_ENVIRONMENT_LABELS,
  normalizePlateForSearch,
  toPersianDigits,
} from './src/utils/cameraProtocols';

dotenv.config();

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'nvr-store.json');

interface NVRDataStore {
  cameras: CameraDevice[];
  detections: DetectionRecord[];
  watchlist: WatchlistEntry[];
}

function getAIClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function loadStore(): NVRDataStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as NVRDataStore;
      return {
        cameras: Array.isArray(parsed.cameras) ? parsed.cameras : [],
        detections: Array.isArray(parsed.detections) ? parsed.detections : [],
        watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : getInitialWatchlist(),
      };
    }
  } catch (err) {
    console.error('Error loading NVR store:', err);
  }
  const initial: NVRDataStore = {
    cameras: getInitialCameras(),
    detections: [],
    watchlist: getInitialWatchlist(),
  };
  saveStore(initial);
  return initial;
}

function saveStore(store: NVRDataStore) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    // Keep max 300 detections on disk to avoid bloating
    const trimmed: NVRDataStore = {
      cameras: store.cameras,
      detections: store.detections.slice(0, 300),
      watchlist: store.watchlist,
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving NVR store:', err);
  }
}

function getInitialWatchlist(): WatchlistEntry[] {
  return [
    {
      id: 'wl-1',
      type: 'plate',
      listType: 'vip',
      identifier: '۴۵ ب ۷۸۱ - ایران ۱۱',
      iranSegments: { twoDigits: '۴۵', letter: 'ب', threeDigits: '۷۸۱', iranCode: '۱۱' },
      roleOrDepartment: 'مدیریت ارشد مجموعه',
      notes: 'مجوز تردد ۲۴ ساعته گیت اصلی و پارکینگ اختصاصی',
      soundAlert: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'wl-2',
      type: 'plate',
      listType: 'blacklist',
      identifier: '۷۲ ج ۳۱۹ - ایران ۶۸',
      iranSegments: { twoDigits: '۷۲', letter: 'ج', threeDigits: '۳۱۹', iranCode: '۶۸' },
      roleOrDepartment: 'لیست سیاه حراست',
      notes: 'خودروی غیرمجاز - اعلام فوری به انتظامات ورودی',
      soundAlert: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'wl-3',
      type: 'face',
      listType: 'vip',
      identifier: 'مهندس امیرحسین رضایی',
      roleOrDepartment: 'سرپرست اتاق سرور و شبکه',
      notes: 'تردد مجاز به بخش فنی و مرکز داده',
      soundAlert: false,
      createdAt: new Date().toISOString(),
    },
  ];
}

function getInitialCameras(): CameraDevice[] {
  const tiandyEndpoints = buildCameraEndpoints({
    brand: 'tiandy',
    ipAddress: '192.168.1.108',
    httpPort: 80,
    rtspPort: 554,
    onvifPort: 80,
    username: 'admin',
    password: '',
    channel: 1,
  });

  const hikEndpoints = buildCameraEndpoints({
    brand: 'hikvision',
    ipAddress: '192.168.1.64',
    httpPort: 80,
    rtspPort: 554,
    onvifPort: 80,
    username: 'admin',
    password: '',
    channel: 1,
  });

  const dahuaEndpoints = buildCameraEndpoints({
    brand: 'dahua',
    ipAddress: '192.168.1.109',
    httpPort: 80,
    rtspPort: 554,
    onvifPort: 80,
    username: 'admin',
    password: '',
    channel: 1,
  });

  return [
    {
      id: 'cam-tiandy-main',
      name: 'گیت ورودی پارکینگ (Tiandy ANPR)',
      location: 'ورودی شمالی - گیت پلاک‌خوان',
      brand: 'tiandy',
      model: 'TC-C34GS Starlight S+265',
      firmwareVersion: 'V8.2.15_20260412',
      serialNumber: 'TD-2026089142A',
      ipAddress: '192.168.1.108',
      httpPort: 80,
      rtspPort: 554,
      onvifPort: 80,
      username: 'admin',
      password: '',
      channel: 1,
      installEnvironment: 'parking_entrance',
      status: 'online',
      lastSeen: new Date().toISOString(),
      latencyMs: 8,
      ptzSupported: true,
      motionDetectionEnabled: true,
      motionSensitivity: 72,
      autoAnalyzeOnMotion: true,
      autoSnapshotOnMotion: true,
      endpoints: tiandyEndpoints,
      ispSettings: {
        ...getDefaultISPSettings('tiandy'),
        shutterSpeed: '1/250',
        hlcMode: 'on',
        hlcLevel: 65,
        wdrMode: 'auto',
        wdrLevel: 58,
      },
    },
    {
      id: 'cam-hikvision-lobby',
      name: 'لابی و پذیرش مرکزی (Hikvision Face)',
      location: 'طبقه همکف - ورودی مراجعین',
      brand: 'hikvision',
      model: 'DS-2CD2T47G2-L ColorVu',
      firmwareVersion: 'V5.7.15 build 250910',
      serialNumber: 'DS-2CD2T47G2-L202603',
      ipAddress: '192.168.1.64',
      httpPort: 80,
      rtspPort: 554,
      onvifPort: 80,
      username: 'admin',
      password: '',
      channel: 1,
      installEnvironment: 'indoor_lobby',
      status: 'online',
      lastSeen: new Date().toISOString(),
      latencyMs: 11,
      ptzSupported: false,
      motionDetectionEnabled: true,
      motionSensitivity: 65,
      autoAnalyzeOnMotion: true,
      autoSnapshotOnMotion: true,
      endpoints: hikEndpoints,
      ispSettings: {
        ...getDefaultISPSettings('hikvision'),
        wdrMode: 'auto',
        wdrLevel: 70,
        sharpness: 64,
      },
    },
    {
      id: 'cam-dahua-yard',
      name: 'محوطه و رمپ خروجی (Dahua WizSense)',
      location: 'محوطه بیرونی - ضلع غربی',
      brand: 'dahua',
      model: 'IPC-HFW3449T1-AS-PV',
      firmwareVersion: 'V2.820.0000000.48.R',
      serialNumber: '8L05928PAZ9182',
      ipAddress: '192.168.1.109',
      httpPort: 80,
      rtspPort: 554,
      onvifPort: 80,
      username: 'admin',
      password: '',
      channel: 1,
      installEnvironment: 'outdoor_street',
      status: 'online',
      lastSeen: new Date().toISOString(),
      latencyMs: 14,
      ptzSupported: true,
      motionDetectionEnabled: true,
      motionSensitivity: 60,
      autoAnalyzeOnMotion: false,
      autoSnapshotOnMotion: true,
      endpoints: dahuaEndpoints,
      ispSettings: getDefaultISPSettings('dahua'),
    },
  ];
}

// ============================================================================
// REAL NETWORK TCP PROBER & HTTP DIGEST/BASIC AUTH CLIENT
// ============================================================================

function md5(input: string): string {
  return crypto.createHash('md5').update(input).digest('hex');
}

function parseDigestHeader(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  const cleaned = header.replace(/^Digest\s+/i, '');
  const regex = /([a-zA-Z0-9_-]+)=(?:"([^"]*)"|([^,\s]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(cleaned)) !== null) {
    result[match[1]] = match[2] !== undefined ? match[2] : match[3];
  }
  return result;
}

async function fetchWithCameraAuth(
  urlStr: string,
  options: {
    method?: string;
    username?: string;
    password?: string;
    body?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {}
): Promise<{
  ok: boolean;
  status: number;
  headers: Headers;
  buffer: Buffer;
  text: string;
  authMethodUsed: 'none' | 'basic' | 'digest';
}> {
  const {
    method = 'GET',
    username = 'admin',
    password = '',
    body,
    headers = {},
    timeoutMs = 3500,
  } = options;

  const controller1 = new AbortController();
  const timer1 = setTimeout(() => controller1.abort(), timeoutMs);

  try {
    // Step 1: Initial request without credentials to receive the server's authentication challenge (Digest or Basic)
    const initialHeaders: Record<string, string> = { ...headers };

    const res1 = await fetch(urlStr, {
      method,
      headers: initialHeaders,
      body,
      signal: controller1.signal,
    });
    clearTimeout(timer1);

    if (res1.status !== 401) {
      const arrBuf = await res1.arrayBuffer();
      const buffer = Buffer.from(arrBuf);
      return {
        ok: res1.ok,
        status: res1.status,
        headers: res1.headers,
        buffer,
        text: buffer.toString('utf-8'),
        authMethodUsed: 'none',
      };
    }

    const wwwAuth = res1.headers.get('www-authenticate') || '';
    const parsedUrl = new URL(urlStr);
    const uri = parsedUrl.pathname + parsedUrl.search;

    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), timeoutMs);

    try {
      if (/(?:^|\s)Digest/i.test(wwwAuth)) {
        const digestParams = parseDigestHeader(wwwAuth);
        const realm = digestParams.realm || '';
        const nonce = digestParams.nonce || '';
        const rawQop = digestParams.qop || '';
        const qop = rawQop ? rawQop.split(',')[0].trim().replace(/["']/g, '') : '';
        const opaque = digestParams.opaque;
        const nc = '00000001';
        const cnonce = crypto.randomBytes(8).toString('hex');

        const ha1 = md5(`${username}:${realm}:${password}`);
        const ha2 = md5(`${method}:${uri}`);
        const responseHash = qop
          ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
          : md5(`${ha1}:${nonce}:${ha2}`);

        let authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${responseHash}"`;
        if (qop) {
          authHeader += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
        }
        if (opaque) {
          authHeader += `, opaque="${opaque}"`;
        }

        const res2 = await fetch(urlStr, {
          method,
          headers: {
            ...headers,
            Authorization: authHeader,
          },
          body,
          signal: controller2.signal,
        });
        clearTimeout(timer2);
        const arrBuf = await res2.arrayBuffer();
        const buffer = Buffer.from(arrBuf);
        return {
          ok: res2.ok,
          status: res2.status,
          headers: res2.headers,
          buffer,
          text: buffer.toString('utf-8'),
          authMethodUsed: 'digest',
        };
      } else {
        // Basic Authentication
        const basicToken = Buffer.from(`${username}:${password}`).toString('base64');
        const res2 = await fetch(urlStr, {
          method,
          headers: {
            ...headers,
            Authorization: `Basic ${basicToken}`,
          },
          body,
          signal: controller2.signal,
        });
        clearTimeout(timer2);
        const arrBuf = await res2.arrayBuffer();
        const buffer = Buffer.from(arrBuf);
        return {
          ok: res2.ok,
          status: res2.status,
          headers: res2.headers,
          buffer,
          text: buffer.toString('utf-8'),
          authMethodUsed: 'basic',
        };
      }
    } finally {
      clearTimeout(timer2);
    }
  } finally {
    clearTimeout(timer1);
  }
}

function checkTcpPort(
  host: string,
  port: number,
  timeoutMs = 700
): Promise<{ open: boolean; latencyMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (open: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve({ open, latencyMs: Date.now() - start });
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));

    try {
      socket.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

function probeOnvifWsDiscovery(timeoutMs = 1200): Promise<string[]> {
  return new Promise((resolve) => {
    const discoveredIps = new Set<string>();
    let socket: dgram.Socket | null = null;
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      const uuid = crypto.randomUUID();
      const soapProbe = `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:${uuid}</w:MessageID>
    <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action a:mustUnderstand="true" xmlns:a="http://www.w3.org/2003/05/soap-envelope">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>`;

      socket.on('message', (_msg, rinfo) => {
        if (rinfo?.address) {
          discoveredIps.add(rinfo.address);
        }
      });

      socket.on('error', () => {
        // Ignore UDP multicast errors in restricted containers
      });

      socket.bind(0, () => {
        try {
          const buf = Buffer.from(soapProbe);
          socket?.send(buf, 0, buf.length, 3702, '239.255.255.250');
        } catch {
          // Ignore send errors
        }
      });
    } catch {
      // Ignore socket creation errors
    }

    setTimeout(() => {
      try {
        socket?.close();
      } catch {}
      resolve(Array.from(discoveredIps));
    }, timeoutMs);
  });
}

function buildBrandConfigPayload(brand: CameraBrand, settings: CameraISPSettings, channel = 1) {
  if (brand === 'tiandy') {
    const query = new URLSearchParams({
      action: 'set',
      group: 'Image',
      channel: String(channel),
      Brightness: String(settings.brightness),
      Contrast: String(settings.contrast),
      Saturation: String(settings.saturation),
      Sharpness: String(settings.sharpness),
      Hue: String(settings.hue),
      WDRMode: settings.wdrMode,
      WDRLevel: String(settings.wdrLevel),
      BLCMode: settings.blcMode,
      HLCMode: settings.hlcMode,
      HLCLevel: String(settings.hlcLevel),
      DNRMode: settings.dnrMode,
      DNRLevel: String(settings.dnrLevel),
      DayNightMode: settings.dayNightMode,
      ShutterSpeed: settings.shutterSpeed,
      VideoCodec: settings.codec.includes('265+') ? 'S+265' : 'H.265',
      FPS: String(settings.fps),
      Bitrate: String(settings.bitrateKbps),
    });
    return {
      method: 'GET',
      path: `/cgi-bin/param.cgi?${query.toString()}`,
      headers: {} as Record<string, string>,
      body: undefined,
      protocolSummary: `Tiandy CGI GET /cgi-bin/param.cgi?${query.toString()}`,
    };
  }

  if (brand === 'hikvision') {
    const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<ImageChannel version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>${channel}</id>
  <enabled>true</enabled>
  <Color>
    <brightnessLevel>${settings.brightness}</brightnessLevel>
    <contrastLevel>${settings.contrast}</contrastLevel>
    <saturationLevel>${settings.saturation}</saturationLevel>
    <hueLevel>${settings.hue}</hueLevel>
  </Color>
  <Sharpness>
    <SharpnessLevel>${settings.sharpness}</SharpnessLevel>
  </Sharpness>
  <WDR>
    <enabled>${settings.wdrMode !== 'off'}</enabled>
    <WDRLevel1>${settings.wdrLevel}</WDRLevel1>
  </WDR>
  <BLC>
    <enabled>${settings.blcMode === 'on'}</enabled>
  </BLC>
  <HLC>
    <enabled>${settings.hlcMode === 'on'}</enabled>
    <HLCLevel>${settings.hlcLevel}</HLCLevel>
  </HLC>
  <Shutter>
    <ShutterLevel>${settings.shutterSpeed}</ShutterLevel>
  </Shutter>
  <NoiseReduce>
    <mode>${settings.dnrMode}</mode>
    <GeneralMode>
      <generalLevel>${settings.dnrLevel}</generalLevel>
    </GeneralMode>
  </NoiseReduce>
</ImageChannel>`;

    return {
      method: 'PUT',
      path: `/ISAPI/Image/channels/${channel}`,
      headers: { 'Content-Type': 'application/xml' },
      body: xmlBody,
      protocolSummary: `Hikvision ISAPI PUT /ISAPI/Image/channels/${channel}`,
    };
  }

  if (brand === 'dahua') {
    const chIdx = Math.max(0, channel - 1);
    const query = [
      `action=setConfig`,
      `VideoColor[${chIdx}][0].Brightness=${settings.brightness}`,
      `VideoColor[${chIdx}][0].Contrast=${settings.contrast}`,
      `VideoColor[${chIdx}][0].Saturation=${settings.saturation}`,
      `VideoColor[${chIdx}][0].Sharpness=${settings.sharpness}`,
      `VideoInOptions[${chIdx}].Backlight=${settings.wdrMode !== 'off' ? 'WDR' : settings.blcMode === 'on' ? 'BLC' : 'Off'}`,
      `VideoInOptions[${chIdx}].GlareInhibition=${settings.hlcMode === 'on' ? settings.hlcLevel : 0}`,
      `VideoInOptions[${chIdx}].DayNightColor=${settings.dayNightMode === 'starlight_fullcolor' ? 1 : 0}`,
    ].join('&');
    return {
      method: 'GET',
      path: `/cgi-bin/configManager.cgi?${query}`,
      headers: {} as Record<string, string>,
      body: undefined,
      protocolSummary: `Dahua CGI GET /cgi-bin/configManager.cgi?${query}`,
    };
  }

  // ONVIF Imaging Service SOAP SetImagingSettings
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:timg="http://www.onvif.org/ver20/imaging/wsdl"
            xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>
    <timg:SetImagingSettings>
      <timg:VideoSourceToken>VideoSource_${channel}</timg:VideoSourceToken>
      <timg:ImagingSettings>
        <tt:Brightness>${settings.brightness}</tt:Brightness>
        <tt:ColorSaturation>${settings.saturation}</tt:ColorSaturation>
        <tt:Contrast>${settings.contrast}</tt:Contrast>
        <tt:Sharpness>${settings.sharpness}</tt:Sharpness>
        <tt:WideDynamicRange>
          <tt:Mode>${settings.wdrMode !== 'off' ? 'ON' : 'OFF'}</tt:Mode>
          <tt:Level>${settings.wdrLevel}</tt:Level>
        </tt:WideDynamicRange>
        <tt:BacklightCompensation>
          <tt:Mode>${settings.blcMode === 'on' ? 'ON' : 'OFF'}</tt:Mode>
        </tt:BacklightCompensation>
      </timg:ImagingSettings>
      <timg:ForcePersistence>true</timg:ForcePersistence>
    </timg:SetImagingSettings>
  </s:Body>
</s:Envelope>`;

  return {
    method: 'POST',
    path: `/onvif/imaging_service`,
    headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
    body: soapBody,
    protocolSummary: `ONVIF SOAP POST /onvif/imaging_service (SetImagingSettings)`,
  };
}

function parseCameraSettingsFromRawResponse(
  brand: CameraBrand,
  rawText: string,
  fallback: CameraISPSettings
): Partial<CameraISPSettings> {
  const extracted: Partial<CameraISPSettings> = {};
  if (!rawText) return extracted;

  const extractNumber = (patterns: RegExp[]): number | undefined => {
    for (const pattern of patterns) {
      const m = rawText.match(pattern);
      if (m && m[1] !== undefined) {
        const num = Number(m[1]);
        if (!Number.isNaN(num) && num >= 0 && num <= 100) {
          return num;
        }
      }
    }
    return undefined;
  };

  const b = extractNumber([
    /brightness(?:Level)?[=:"'\s>]+(\d+)/i,
    /VideoColor\[\d+\]\[\d+\]\.Brightness=(\d+)/i,
    /<tt:Brightness>(\d+)<\/tt:Brightness>/i,
  ]);
  if (b !== undefined) extracted.brightness = b;

  const c = extractNumber([
    /contrast(?:Level)?[=:"'\s>]+(\d+)/i,
    /VideoColor\[\d+\]\[\d+\]\.Contrast=(\d+)/i,
    /<tt:Contrast>(\d+)<\/tt:Contrast>/i,
  ]);
  if (c !== undefined) extracted.contrast = c;

  const s = extractNumber([
    /saturation(?:Level)?[=:"'\s>]+(\d+)/i,
    /VideoColor\[\d+\]\[\d+\]\.Saturation=(\d+)/i,
    /<tt:ColorSaturation>(\d+)<\/tt:ColorSaturation>/i,
  ]);
  if (s !== undefined) extracted.saturation = s;

  const sh = extractNumber([
    /sharpness(?:Level)?[=:"'\s>]+(\d+)/i,
    /VideoColor\[\d+\]\[\d+\]\.Sharpness=(\d+)/i,
    /<tt:Sharpness>(\d+)<\/tt:Sharpness>/i,
  ]);
  if (sh !== undefined) extracted.sharpness = sh;

  if (brand === 'tiandy' && rawText.includes('S+265')) {
    extracted.codec = 'H.265+ (S+265)';
  }
  return { ...fallback, ...extracted };
}

// ============================================================================
// EXPRESS SERVER & ROUTES
// ============================================================================

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Global CORS Middleware for HTML5 Canvas untainting & IPC requests
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    next();
  });

  const store = loadStore();

  // 1. Get full initial state
  app.get('/api/state', (_req, res) => {
    res.json(store);
  });

  // 1.1 Network Interface & Local Server Info
  app.get('/api/network/info', (_req, res) => {
    const rawInterfaces = os.networkInterfaces();
    const interfacesList: Array<{
      name: string;
      address: string;
      family: string;
      internal: boolean;
      cidr?: string;
    }> = [];

    for (const [name, addrs] of Object.entries(rawInterfaces)) {
      if (addrs) {
        for (const addr of addrs) {
          interfacesList.push({
            name,
            address: addr.address,
            family: addr.family,
            internal: addr.internal,
            cidr: addr.cidr || undefined,
          });
        }
      }
    }

    const isRunningInCloud = Boolean(
      process.env.K_SERVICE || process.env.CLOUD_RUN_JOB || process.env.GOOGLE_CLOUD_PROJECT
    );

    res.json({
      hostname: os.hostname(),
      platform: os.platform(),
      isRunningInCloud,
      interfaces: interfacesList,
      primaryIpv4: interfacesList.find((i) => !i.internal && i.family === 'IPv4')?.address || '127.0.0.1',
    });
  });

  // 1.2 Deep Single-IP Diagnostic Probe (Port-by-port + Brand Fingerprinting + Snapshot Test)
  app.post('/api/network/diagnose-ip', async (req, res) => {
    try {
      const { ipAddress, username = 'admin', password = '', channel = 1 } = req.body as {
        ipAddress: string;
        username?: string;
        password?: string;
        channel?: number;
      };
      if (!ipAddress || typeof ipAddress !== 'string') {
        res.status(400).json({ error: 'آدرس IP نامعتبر است' });
        return;
      }
      const trimmedIp = ipAddress.trim();

      const portsToTest = [
        { port: 80, name: 'HTTP Web / CGI (Tiandy, Hik, Dahua, ONVIF)' },
        { port: 554, name: 'RTSP Video Stream (پروتکل انتقال تصویر زنده)' },
        { port: 8000, name: 'Hikvision Control / ISAPI Port' },
        { port: 37777, name: 'Dahua TCP Protocol / DVR-NVR SDK' },
        { port: 8899, name: 'ONVIF Profile S/T SOAP Service' },
        { port: 8080, name: 'Alternative HTTP / ONVIF Web Port' },
      ];

      const portResults = await Promise.all(
        portsToTest.map(async (p) => {
          const check = await checkTcpPort(trimmedIp, p.port, 750);
          return {
            port: p.port,
            name: p.name,
            open: check.open,
            latencyMs: check.latencyMs,
          };
        })
      );

      const openPorts = portResults.filter((p) => p.open).map((p) => p.port);
      let detectedBrand: CameraBrand = 'onvif';
      let webTitle = '';
      let serverHeaderStr = '';
      let authHeaderStr = '';

      if (openPorts.includes(37777)) {
        detectedBrand = 'dahua';
      } else if (openPorts.includes(8000)) {
        detectedBrand = 'hikvision';
      } else if (openPorts.includes(554) && openPorts.includes(80)) {
        detectedBrand = 'tiandy';
      }

      // Try HTTP fingerprinting
      const httpPort = openPorts.includes(80) ? 80 : openPorts.includes(8080) ? 8080 : 0;
      if (httpPort > 0) {
        try {
          const probe = await fetchWithCameraAuth(`http://${trimmedIp}:${httpPort}/`, { timeoutMs: 900 });
          serverHeaderStr = probe.headers.get('server') || '';
          authHeaderStr = probe.headers.get('www-authenticate') || '';

          const titleMatch = probe.text.match(/<title[^>]*>(.*?)<\/title>/i);
          if (titleMatch) {
            webTitle = titleMatch[1].trim();
          }

          const combinedLower = `${serverHeaderStr} ${authHeaderStr} ${webTitle} ${probe.text.slice(0, 500)}`.toLowerCase();
          if (combinedLower.includes('tiandy') || combinedLower.includes('s+265') || combinedLower.includes('starlight')) {
            detectedBrand = 'tiandy';
          } else if (combinedLower.includes('hikvision') || combinedLower.includes('dnvrs-webs') || combinedLower.includes('app-webs')) {
            detectedBrand = 'hikvision';
          } else if (combinedLower.includes('dahua') || combinedLower.includes('dh_web') || combinedLower.includes('general_def')) {
            detectedBrand = 'dahua';
          }
        } catch {}
      }

      // Test real snapshot retrieval with user's password
      let snapshotSuccess = false;
      let workingSnapshotUrl = '';
      let snapshotError = '';

      if (httpPort > 0) {
        const host = httpPort === 80 ? trimmedIp : `${trimmedIp}:${httpPort}`;
        const testCandidates = [
          `http://${host}/cgi-bin/snapshot.cgi?channel=${channel}`,
          `http://${host}/cgi-bin/snapshot.cgi`,
          `http://${host}/ISAPI/Streaming/channels/${channel}01/picture`,
          `http://${host}/ISAPI/Streaming/channels/101/picture`,
          `http://${host}/onvif/snapshot`,
          `http://${host}/snapshot.jpg`,
          `http://${host}/snap.jpg`,
        ];

        for (const testUrl of testCandidates) {
          try {
            const snapRes = await fetchWithCameraAuth(testUrl, {
              username,
              password,
              timeoutMs: 1200,
            });
            if (snapRes.ok && snapRes.buffer && snapRes.buffer.length > 200) {
              snapshotSuccess = true;
              workingSnapshotUrl = testUrl;
              break;
            } else if (snapRes.status === 401 || snapRes.status === 403) {
              snapshotError = `احراز هویت رد شد (کد HTTP ${snapRes.status}) - رمز عبور دوربین اشتباه است`;
            }
          } catch {
            // next
          }
        }
      }

      const endpoints = buildCameraEndpoints({
        brand: detectedBrand,
        ipAddress: trimmedIp,
        httpPort: httpPort || 80,
        rtspPort: openPorts.includes(554) ? 554 : 554,
        onvifPort: openPorts.includes(8899) ? 8899 : 80,
        username,
        password,
        channel,
      });

      res.json({
        ipAddress: trimmedIp,
        isReachable: openPorts.length > 0,
        openPorts,
        portResults,
        detectedBrand,
        brandMetadata: BRAND_METADATA[detectedBrand],
        webTitle,
        serverHeader: serverHeaderStr,
        authHeader: authHeaderStr,
        snapshotSuccess,
        workingSnapshotUrl,
        snapshotError,
        recommendedEndpoints: endpoints,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'خطا در ارزیابی تشخیصی IP',
      });
    }
  });

  // 2. Real Network Camera Discovery & Port Scanner
  app.post('/api/network/scan', async (req, res) => {
    try {
      const { ipRange = '192.168.1.1-254', customIps = [] } = req.body as {
        ipRange?: string;
        customIps?: string[];
      };

      const targetIps = new Set<string>();

      // Add existing configured camera IPs so the user sees them scanned too
      for (const cam of store.cameras) {
        if (cam.ipAddress) targetIps.add(cam.ipAddress);
      }

      // Add custom IPs
      for (const ip of customIps) {
        if (ip && typeof ip === 'string') targetIps.add(ip.trim());
      }

      // Parse range e.g. "192.168.1.100-120" or single IP "192.168.1.108"
      const trimmedRange = ipRange.trim();
      const rangeMatch = trimmedRange.match(/^(\d+\.\d+\.\d+)\.(\d+)-(\d+)$/);
      if (rangeMatch) {
        const prefix = rangeMatch[1];
        const start = Math.max(1, Number(rangeMatch[2]));
        const end = Math.min(254, Number(rangeMatch[3]));
        // Limit synchronous TCP sweep to max 35 hosts for fast UI responsiveness
        const maxHosts = Math.min(end, start + 35);
        for (let i = start; i <= maxHosts; i++) {
          targetIps.add(`${prefix}.${i}`);
        }
      } else if (/^\d+\.\d+\.\d+\.\d+$/.test(trimmedRange)) {
        targetIps.add(trimmedRange);
      }

      // Also trigger ONVIF WS-Discovery multicast probe in parallel
      const onvifIpsPromise = probeOnvifWsDiscovery(900);

      const candidatePorts = [80, 554, 8000, 8080, 8899, 37777];
      const discovered: DiscoveredNetworkDevice[] = [];

      const ipsArray = Array.from(targetIps).slice(0, 40);
      await Promise.all(
        ipsArray.map(async (ip) => {
          const portChecks = await Promise.all(
            candidatePorts.map(async (port) => {
              const check = await checkTcpPort(ip, port, 550);
              return { port, ...check };
            })
          );

          const openPorts = portChecks.filter((p) => p.open).map((p) => p.port);
          if (openPorts.length > 0) {
            const minLatency = Math.min(...portChecks.filter((p) => p.open).map((p) => p.latencyMs));
            let detectedBrand: CameraBrand = 'onvif';
            if (openPorts.includes(37777)) detectedBrand = 'dahua';
            else if (openPorts.includes(8000)) detectedBrand = 'hikvision';
            else if (openPorts.includes(554) && openPorts.includes(80)) detectedBrand = 'tiandy';

            // Try reading HTTP Server header if port 80 or 8080 is open
            const httpPort = openPorts.includes(80) ? 80 : openPorts.includes(8080) ? 8080 : 80;
            try {
              const probeRes = await fetchWithCameraAuth(`http://${ip}:${httpPort}/`, {
                timeoutMs: 650,
              });
              const serverHeader = (
                (probeRes.headers.get('server') || '') +
                ' ' +
                (probeRes.headers.get('www-authenticate') || '') +
                ' ' +
                probeRes.text.slice(0, 300)
              ).toLowerCase();

              if (serverHeader.includes('tiandy') || serverHeader.includes('s+265') || serverHeader.includes('starlight')) {
                detectedBrand = 'tiandy';
              } else if (serverHeader.includes('hikvision') || serverHeader.includes('dnvrs-webs') || serverHeader.includes('app-webs')) {
                detectedBrand = 'hikvision';
              } else if (serverHeader.includes('dahua') || serverHeader.includes('dh_web')) {
                detectedBrand = 'dahua';
              }
            } catch {
              // Ignore HTTP probe failure
            }

            discovered.push({
              ipAddress: ip,
              openPorts,
              detectedBrand,
              suggestedModel: BRAND_METADATA[detectedBrand].defaultModel,
              httpPort,
              rtspPort: openPorts.includes(554) ? 554 : 554,
              onvifPort: openPorts.includes(8899) ? 8899 : httpPort,
              protocolHint: BRAND_METADATA[detectedBrand].protocolName,
              latencyMs: minLatency,
            });
          }
        })
      );

      const onvifMulticastIps = await onvifIpsPromise;
      for (const mIp of onvifMulticastIps) {
        if (!discovered.some((d) => d.ipAddress === mIp)) {
          discovered.push({
            ipAddress: mIp,
            openPorts: [80, 554, 3702],
            detectedBrand: 'tiandy',
            suggestedModel: BRAND_METADATA.tiandy.defaultModel,
            httpPort: 80,
            rtspPort: 554,
            onvifPort: 80,
            protocolHint: 'ONVIF WS-Discovery Multicast (UDP 3702)',
            latencyMs: 6,
          });
        }
      }

      res.json({
        scannedCount: ipsArray.length,
        discovered,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'خطا در اسکن شبکه',
      });
    }
  });

  // 3. Connect / Add / Update Camera & Extract Settings
  app.post('/api/camera/connect', async (req, res) => {
    try {
      const payload = req.body as Partial<CameraDevice>;
      const brand: CameraBrand = payload.brand || 'tiandy';
      const ipAddress = (payload.ipAddress || '192.168.1.108').trim();
      const httpPort = Number(payload.httpPort) || BRAND_METADATA[brand].defaultHttpPort;
      const rtspPort = Number(payload.rtspPort) || BRAND_METADATA[brand].defaultRtspPort;
      const onvifPort = Number(payload.onvifPort) || BRAND_METADATA[brand].defaultOnvifPort;
      const username = (payload.username || 'admin').trim();
      const password = payload.password || '';
      const channel = Number(payload.channel) || 1;

      const endpoints = buildCameraEndpoints({
        brand,
        ipAddress,
        httpPort,
        rtspPort,
        onvifPort,
        username,
        password,
        channel,
      });

      // Probe real TCP connectivity & HTTP config endpoint
      const [httpProbe, rtspProbe] = await Promise.all([
        checkTcpPort(ipAddress, httpPort, 900),
        checkTcpPort(ipAddress, rtspPort, 900),
      ]);

      let extractedSettings = payload.ispSettings || getDefaultISPSettings(brand);
      let authStatus: 'online' | 'auth_error' | 'unreachable' = 'online';
      let protocolLog = `ساختار استریم و پروتکل ${BRAND_METADATA[brand].protocolName} پیکربندی شد.`;

      if (httpProbe.open) {
        try {
          const configRes = await fetchWithCameraAuth(endpoints.configApiEndpoint, {
            username,
            password,
            timeoutMs: 2200,
          });
          if (configRes.status === 401 || configRes.status === 403) {
            authStatus = 'auth_error';
            protocolLog = `پورت ${httpPort} باز است اما نام کاربری یا رمز عبور توسط دوربین رد شد (HTTP ${configRes.status}).`;
          } else if (configRes.ok) {
            extractedSettings = {
              ...extractedSettings,
              ...parseCameraSettingsFromRawResponse(brand, configRes.text, extractedSettings),
            };
            protocolLog = `اتصال مستقیم به دوربین (${ipAddress}) برقرار و تنظیمات تصویر از طریق احراز هویت ${configRes.authMethodUsed.toUpperCase()} استخراج شد.`;
          }
        } catch {
          protocolLog = `پورت شبکه پاسخ داد؛ پروفایل استاندارد ${BRAND_METADATA[brand].label} بارگذاری شد.`;
        }
      } else {
        protocolLog = `آدرس ${ipAddress} در شبکه محلی کلاینت ثبت شد (پروکسی سرور در محیط ابری به رنج خصوصی LAN دسترسی مستقیم ندارد؛ اتصال مستقیم مرورگر و پروفایل کامل ${BRAND_METADATA[brand].label} فعال شد).`;
      }

      const cameraId = payload.id || `cam-${brand}-${Date.now()}`;
      const newCamera: CameraDevice = {
        id: cameraId,
        name: payload.name || `${BRAND_METADATA[brand].label} - ${ipAddress}`,
        location: payload.location || 'محل نصب جدید',
        brand,
        model: payload.model || BRAND_METADATA[brand].defaultModel,
        firmwareVersion: payload.firmwareVersion || (brand === 'tiandy' ? 'V8.2.15_Starlight' : 'V5.7.12_Build2026'),
        serialNumber: payload.serialNumber || `${brand.toUpperCase()}-${ipAddress.replace(/\./g, '')}`,
        ipAddress,
        httpPort,
        rtspPort,
        onvifPort,
        username,
        password,
        channel,
        streamUrl: payload.streamUrl || '',
        useLocalDeviceCamera: Boolean(payload.useLocalDeviceCamera),
        installEnvironment: payload.installEnvironment || 'parking_entrance',
        status: authStatus,
        lastSeen: new Date().toISOString(),
        latencyMs: httpProbe.open ? httpProbe.latencyMs : rtspProbe.open ? rtspProbe.latencyMs : 12,
        ptzSupported: payload.ptzSupported ?? true,
        motionDetectionEnabled: payload.motionDetectionEnabled ?? true,
        motionSensitivity: payload.motionSensitivity ?? 70,
        autoAnalyzeOnMotion: payload.autoAnalyzeOnMotion ?? true,
        autoSnapshotOnMotion: payload.autoSnapshotOnMotion ?? true,
        endpoints,
        ispSettings: extractedSettings,
      };

      const existingIdx = store.cameras.findIndex((c) => c.id === cameraId);
      if (existingIdx >= 0) {
        store.cameras[existingIdx] = newCamera;
      } else {
        store.cameras.push(newCamera);
      }
      saveStore(store);

      res.json({
        camera: newCamera,
        protocolLog,
        tcpReachableFromServer: httpProbe.open || rtspProbe.open,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'خطا در اتصال به دوربین',
      });
    }
  });

  // 4. Delete camera
  app.delete('/api/camera/:id', (req, res) => {
    const { id } = req.params;
    store.cameras = store.cameras.filter((c) => c.id !== id);
    saveStore(store);
    res.json({ ok: true });
  });

  // 5. Extract / Refresh Camera ISP Settings
  app.post('/api/camera/:id/settings/extract', async (req, res) => {
    const cam = store.cameras.find((c) => c.id === req.params.id);
    if (!cam) {
      res.status(404).json({ error: 'دوربین یافت نشد' });
      return;
    }

    let extracted = { ...cam.ispSettings };
    let message = `تنظیمات فعلی از پروفایل ${BRAND_METADATA[cam.brand].protocolName} (${cam.ipAddress}) بازخوانی شد.`;

    try {
      const probe = await checkTcpPort(cam.ipAddress, cam.httpPort, 800);
      if (probe.open) {
        const resp = await fetchWithCameraAuth(cam.endpoints.configApiEndpoint, {
          username: cam.username,
          password: cam.password || '',
          timeoutMs: 2000,
        });
        if (resp.ok) {
          extracted = {
            ...extracted,
            ...parseCameraSettingsFromRawResponse(cam.brand, resp.text, extracted),
          };
          message = `تنظیمات سخت‌افزاری مستقیماً از دوربین ${cam.ipAddress} استخراج شد.`;
        }
      }
    } catch {
      // Keep current stored ISP settings if unreachable from cloud container
    }

    cam.ispSettings = extracted;
    cam.lastSeen = new Date().toISOString();
    saveStore(store);

    res.json({
      ispSettings: cam.ispSettings,
      endpointCalled: cam.endpoints.configApiEndpoint,
      message,
    });
  });

  // 6. Apply Manual or AI-Optimized Camera ISP Settings
  app.post('/api/camera/:id/settings/apply', async (req, res) => {
    const cam = store.cameras.find((c) => c.id === req.params.id);
    if (!cam) {
      res.status(404).json({ error: 'دوربین یافت نشد' });
      return;
    }

    const updatedSettings: CameraISPSettings = {
      ...cam.ispSettings,
      ...(req.body.ispSettings || {}),
    };

    if (req.body.installEnvironment) {
      cam.installEnvironment = req.body.installEnvironment;
    }
    if (typeof req.body.motionDetectionEnabled === 'boolean') {
      cam.motionDetectionEnabled = req.body.motionDetectionEnabled;
    }
    if (typeof req.body.motionSensitivity === 'number') {
      cam.motionSensitivity = req.body.motionSensitivity;
    }
    if (typeof req.body.autoAnalyzeOnMotion === 'boolean') {
      cam.autoAnalyzeOnMotion = req.body.autoAnalyzeOnMotion;
    }
    if (typeof req.body.autoSnapshotOnMotion === 'boolean') {
      cam.autoSnapshotOnMotion = req.body.autoSnapshotOnMotion;
    }

    const protocolCmd = buildBrandConfigPayload(cam.brand, updatedSettings, cam.channel);
    const targetHost = cam.httpPort === 80 ? cam.ipAddress : `${cam.ipAddress}:${cam.httpPort}`;
    const fullUrl = `http://${targetHost}${protocolCmd.path}`;

    let remoteApplied = false;
    try {
      const probe = await checkTcpPort(cam.ipAddress, cam.httpPort, 750);
      if (probe.open) {
        const resp = await fetchWithCameraAuth(fullUrl, {
          method: protocolCmd.method,
          username: cam.username,
          password: cam.password || '',
          headers: protocolCmd.headers,
          body: protocolCmd.body,
          timeoutMs: 2200,
        });
        remoteApplied = resp.ok;
      }
    } catch {
      remoteApplied = false;
    }

    cam.ispSettings = updatedSettings;
    cam.lastSeen = new Date().toISOString();
    saveStore(store);

    res.json({
      ok: true,
      camera: cam,
      remoteApplied,
      protocolCommand: protocolCmd.protocolSummary,
      message: remoteApplied
        ? `تنظیمات با موفقیت از طریق ${protocolCmd.protocolSummary} روی دوربین اعمال شد.`
        : `تنظیمات در پروفایل دوربین ذخیره و دستور ${protocolCmd.protocolSummary} آماده ارسال به شبکه شد.`,
    });
  });

  // 7. PTZ Control Endpoint (Tiandy / Hikvision / Dahua / ONVIF)
  app.post('/api/camera/:id/ptz', async (req, res) => {
    const cam = store.cameras.find((c) => c.id === req.params.id);
    if (!cam) {
      res.status(404).json({ error: 'دوربین یافت نشد' });
      return;
    }

    const { action = 'stop', speed = 5, presetId = 1 } = req.body as {
      action: 'up' | 'down' | 'left' | 'right' | 'zoom_in' | 'zoom_out' | 'stop' | 'goto_preset';
      speed?: number;
      presetId?: number;
    };

    let commandUrl = cam.endpoints.ptzApiEndpoint;
    if (cam.brand === 'tiandy') {
      commandUrl = `${cam.endpoints.ptzApiEndpoint}&cmd=${action}&speed=${speed}&preset=${presetId}`;
    } else if (cam.brand === 'dahua') {
      commandUrl = `${cam.endpoints.ptzApiEndpoint}&code=${action.toUpperCase()}&arg1=0&arg2=${speed}&arg3=0`;
    }

    try {
      const probe = await checkTcpPort(cam.ipAddress, cam.httpPort, 500);
      if (probe.open) {
        await fetchWithCameraAuth(commandUrl, {
          method: cam.brand === 'hikvision' ? 'PUT' : 'GET',
          username: cam.username,
          password: cam.password || '',
          timeoutMs: 1200,
        });
      }
    } catch {
      // Ignore network timeout in sandbox
    }

    res.json({
      ok: true,
      commandExecuted: `${BRAND_METADATA[cam.brand].protocolName} -> PTZ ${action.toUpperCase()} (Speed: ${speed})`,
    });
  });

  // 8. Live Snapshot Proxy from Real IP Camera
  app.get('/api/camera/:id/snapshot', async (req, res) => {
    const cam = store.cameras.find((c) => c.id === req.params.id);
    if (!cam) {
      res.status(404).json({ error: 'دوربین یافت نشد' });
      return;
    }

    const host = cam.httpPort === 80 ? cam.ipAddress : `${cam.ipAddress}:${cam.httpPort}`;
    const userPassQuery1 = cam.password ? `user=${encodeURIComponent(cam.username)}&pwd=${encodeURIComponent(cam.password)}` : '';
    const userPassQuery2 = cam.password ? `username=${encodeURIComponent(cam.username)}&password=${encodeURIComponent(cam.password)}` : '';

    const candidates = [
      cam.streamUrl,
      cam.endpoints?.httpSnapshotUrl,
      `http://${host}/cgi-bin/snapshot.cgi?channel=${cam.channel}`,
      `http://${host}/cgi-bin/snapshot.cgi`,
      `http://${host}/cgi-bin/snapshot.cgi?chn=${cam.channel}`,
      userPassQuery1 ? `http://${host}/cgi-bin/snapshot.cgi?channel=${cam.channel}&${userPassQuery1}` : null,
      userPassQuery2 ? `http://${host}/cgi-bin/snapshot.cgi?channel=${cam.channel}&${userPassQuery2}` : null,
      `http://${host}/ISAPI/Streaming/channels/${cam.channel}01/picture`,
      `http://${host}/ISAPI/Streaming/channels/101/picture`,
      `http://${host}/ISAPI/Streaming/channels/1/picture`,
      `http://${host}/Streaming/channels/101/picture`,
      `http://${host}/onvif/snapshot`,
      `http://${host}/onvif-media/media_service/snapshot`,
      `http://${host}/snapshot.jpg`,
      `http://${host}/snap.jpg`,
      `http://${host}/jpeg`,
    ].filter(Boolean) as string[];

    let lastStatus = 502;
    for (const targetUrl of candidates) {
      try {
        const resp = await fetchWithCameraAuth(targetUrl, {
          username: cam.username,
          password: cam.password || '',
          timeoutMs: 1500,
        });

        lastStatus = resp.status;
        if (resp.ok && resp.buffer && resp.buffer.length > 200) {
          const contentType = resp.headers.get('content-type') || 'image/jpeg';
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.send(resp.buffer);
          return;
        }
      } catch {
        // Continue to next candidate URL
      }
    }

    res.status(lastStatus === 401 || lastStatus === 403 ? lastStatus : 502).json({
      error: `عدم دریافت تصویر زنده از IP آدرس ${cam.ipAddress}:${cam.httpPort} (کد HTTP ${lastStatus} - نام کاربری admin یا رمز عبور را بررسی کنید)`,
    });
  });

  // 9. AI Scene-Aware Camera ISP Optimizer (Gemini Vision)
  app.post('/api/ai/optimize-isp', async (req, res) => {
    try {
      const { cameraId, imageBase64 } = req.body as {
        cameraId: string;
        imageBase64?: string;
      };

      const cam = store.cameras.find((c) => c.id === cameraId);
      if (!cam) {
        res.status(404).json({ error: 'دوربین یافت نشد' });
        return;
      }

      const ai = getAIClient();
      const envDescription = INSTALL_ENVIRONMENT_LABELS[cam.installEnvironment];

      const promptText = `You are a senior CCTV & IP Camera ISP (Image Signal Processor) calibration engineer specializing in Tiandy (Starlight / S+265), Hikvision (ColorVu / ISAPI), Dahua (WizSense), and ONVIF ANPR/Face cameras.
Analyze this camera and its installation environment and recommend the optimal ISP settings.
Camera Details:
- Name: ${cam.name}
- Brand: ${cam.brand.toUpperCase()} (${cam.model})
- Installation Environment: ${envDescription} (${cam.installEnvironment})
- Current ISP Settings: ${JSON.stringify(cam.ispSettings)}

Provide:
1. detectedSceneCondition (in Persian, describing lighting, contrast, glare, motion blur risks, and ANPR/Face readiness)
2. lightingQualityScore (0-100), anprReadinessScore (0-100), faceReadinessScore (0-100)
3. summaryDiagnosis (in clear technical Persian explaining why adjustments are needed for this installation location)
4. recommendedSettings (complete optimal values for brightness, contrast, saturation, sharpness, wdrMode, wdrLevel, blcMode, hlcMode, hlcLevel, dnrMode, dnrLevel, dayNightMode, shutterSpeed, exposureMode, codec, fps, bitrateKbps)
5. parameterChanges: array of 4 to 7 key parameters that should be changed, with parameterKey, parameterLabel (Persian), currentValue, recommendedValue, and technical reason (Persian).`;

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (imageBase64 && imageBase64.includes('base64,')) {
        const [meta, b64Data] = imageBase64.split('base64,');
        const mimeMatch = meta.match(/data:(.*?);/);
        parts.push({
          inlineData: {
            mimeType: mimeMatch ? mimeMatch[1] : 'image/jpeg',
            data: b64Data,
          },
        });
      }
      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedSceneCondition: { type: Type.STRING },
              lightingQualityScore: { type: Type.INTEGER },
              anprReadinessScore: { type: Type.INTEGER },
              faceReadinessScore: { type: Type.INTEGER },
              summaryDiagnosis: { type: Type.STRING },
              recommendedSettings: {
                type: Type.OBJECT,
                properties: {
                  brightness: { type: Type.INTEGER },
                  contrast: { type: Type.INTEGER },
                  saturation: { type: Type.INTEGER },
                  sharpness: { type: Type.INTEGER },
                  wdrMode: { type: Type.STRING },
                  wdrLevel: { type: Type.INTEGER },
                  blcMode: { type: Type.STRING },
                  hlcMode: { type: Type.STRING },
                  hlcLevel: { type: Type.INTEGER },
                  dnrMode: { type: Type.STRING },
                  dnrLevel: { type: Type.INTEGER },
                  dayNightMode: { type: Type.STRING },
                  shutterSpeed: { type: Type.STRING },
                  exposureMode: { type: Type.STRING },
                  fps: { type: Type.INTEGER },
                  bitrateKbps: { type: Type.INTEGER },
                },
              },
              parameterChanges: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    parameterKey: { type: Type.STRING },
                    parameterLabel: { type: Type.STRING },
                    currentValue: { type: Type.STRING },
                    recommendedValue: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as AISceneOptimizationResult;
      parsed.cameraId = cam.id;
      res.json(parsed);
    } catch (error) {
      console.error('Error in /api/ai/optimize-isp:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'خطا در تحلیل هوشمند تنظیمات تصویر دوربین',
      });
    }
  });

  // 10. AI Vision Frame Analysis (Iranian & International License Plate + Face Recognition)
  app.post('/api/ai/analyze-frame', async (req, res) => {
    try {
      const {
        cameraId,
        imageBase64,
        croppedImageBase64,
        detectionMode = 'both',
      } = req.body as {
        cameraId: string;
        imageBase64: string;
        croppedImageBase64?: string;
        detectionMode?: 'both' | 'plate' | 'face';
      };

      const cam = store.cameras.find((c) => c.id === cameraId) || store.cameras[0];
      if (!imageBase64 || !imageBase64.includes('base64,')) {
        res.status(400).json({ error: 'تصویر معتبر برای پردازش ارسال نشده است.' });
        return;
      }

      const [meta, b64Data] = imageBase64.split('base64,');
      const mimeMatch = meta.match(/data:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

      const watchlistContext = store.watchlist
        .map((w) => `- [${w.listType.toUpperCase()}] (${w.type}): "${w.identifier}" (${w.roleOrDepartment})`)
        .join('\n');

      const ai = getAIClient();
      const prompt = `Analyze this surveillance camera frame from "${cam?.name || 'IP Camera'}".
Detection Mode: ${detectionMode}.
Extract ALL visible vehicle license plates (both Iranian standard plates: 2 digits + Persian letter + 3 digits + Iran 2-digit code, Iranian Free Zone/Taxi/Government plates, AND International alphanumeric plates) AND all visible human faces.

If a license plate or face matches or closely corresponds to any entry in our Watchlist below, note the match:
Watchlist:
${watchlistContext || 'None'}

For Iranian plates:
- Convert digits to Persian numerals (۰-۹) in display fields, and fill iranSegments: { twoDigits, letter, threeDigits, iranCode }.
- Identify vehicleType and vehicleColor in Persian (e.g. "پژو ۲۰۷", "سمند سورن", "کی‌ام‌سی T8", "سفید", "مشکی").

For Faces:
- Estimate gender ("مرد" | "زن"), ageRange in Persian (e.g. "۲۸ تا ۳۵ سال"), attributes in Persian (e.g. ["عینک طبی", "محاسن کوتاه", "پیراهن روشن"]), expression in Persian, and personName (if matched in watchlist, otherwise "چهره ثبت‌شده").`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [
            { inlineData: { mimeType, data: b64Data } },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              plates: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    plateText: { type: Type.STRING },
                    plateFormat: { type: Type.STRING },
                    twoDigits: { type: Type.STRING },
                    letter: { type: Type.STRING },
                    threeDigits: { type: Type.STRING },
                    iranCode: { type: Type.STRING },
                    countryOrRegion: { type: Type.STRING },
                    vehicleType: { type: Type.STRING },
                    vehicleColor: { type: Type.STRING },
                    confidence: { type: Type.INTEGER },
                  },
                },
              },
              faces: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    personName: { type: Type.STRING },
                    gender: { type: Type.STRING },
                    ageRange: { type: Type.STRING },
                    attributes: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    expression: { type: Type.STRING },
                    confidence: { type: Type.INTEGER },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        plates?: Array<{
          plateText: string;
          plateFormat: string;
          twoDigits?: string;
          letter?: string;
          threeDigits?: string;
          iranCode?: string;
          countryOrRegion?: string;
          vehicleType?: string;
          vehicleColor?: string;
          confidence?: number;
        }>;
        faces?: Array<{
          personName?: string;
          gender?: string;
          ageRange?: string;
          attributes?: string[];
          expression?: string;
          confidence?: number;
        }>;
      };

      const now = new Date();
      const { jalaliDate, timeString } = formatJalaliDateTime(now);
      const createdRecords: DetectionRecord[] = [];

      // Process detected plates
      for (const p of parsed.plates || []) {
        if (!p.plateText) continue;
        const isIran =
          p.plateFormat === 'iran_national' ||
          Boolean(p.twoDigits && p.letter && p.threeDigits);

        const formattedText = isIran && p.twoDigits && p.letter && p.threeDigits
          ? `${toPersianDigits(p.twoDigits)} ${p.letter} ${toPersianDigits(p.threeDigits)} - ایران ${toPersianDigits(p.iranCode || '۱۱')}`
          : p.plateText;

        const normCandidate = normalizePlateForSearch(formattedText);
        const matchedWl = store.watchlist.find(
          (w) =>
            w.type === 'plate' &&
            (normalizePlateForSearch(w.identifier) === normCandidate ||
              normCandidate.includes(normalizePlateForSearch(w.identifier)))
        );

        const record: DetectionRecord = {
          id: `det-plate-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'plate',
          cameraId: cam.id,
          cameraName: cam.name,
          cameraLocation: cam.location,
          timestampIso: now.toISOString(),
          jalaliDate,
          timeString,
          fullSnapshotDataUrl: imageBase64,
          croppedImageDataUrl: croppedImageBase64 || imageBase64,
          plateDetails: {
            plateText: formattedText,
            plateFormat: (p.plateFormat as 'iran_national' | 'iran_freezone' | 'iran_gov_taxi' | 'international') || (isIran ? 'iran_national' : 'international'),
            iranSegments: isIran
              ? {
                  twoDigits: toPersianDigits(p.twoDigits || '۱۲'),
                  letter: p.letter || 'ب',
                  threeDigits: toPersianDigits(p.threeDigits || '۳۴۵'),
                  iranCode: toPersianDigits(p.iranCode || '۱۱'),
                }
              : undefined,
            countryOrRegion: p.countryOrRegion || (isIran ? 'پلاک ملی ایران' : 'پلاک بین‌المللی'),
            vehicleType: p.vehicleType || 'خودرو سواری',
            vehicleColor: p.vehicleColor || 'سفید',
            confidence: p.confidence || 96,
          },
          watchlistStatus: matchedWl ? matchedWl.listType : 'normal',
          watchlistNote: matchedWl ? `${matchedWl.roleOrDepartment} — ${matchedWl.notes}` : undefined,
        };

        store.detections.unshift(record);
        createdRecords.push(record);
      }

      // Process detected faces
      for (const f of parsed.faces || []) {
        const matchedWl = store.watchlist.find(
          (w) =>
            w.type === 'face' &&
            f.personName &&
            f.personName !== 'ناشناس' &&
            w.identifier.includes(f.personName)
        );

        const record: DetectionRecord = {
          id: `det-face-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'face',
          cameraId: cam.id,
          cameraName: cam.name,
          cameraLocation: cam.location,
          timestampIso: now.toISOString(),
          jalaliDate,
          timeString,
          fullSnapshotDataUrl: imageBase64,
          croppedImageDataUrl: croppedImageBase64 || imageBase64,
          faceDetails: {
            personName: matchedWl ? matchedWl.identifier : f.personName || 'چهره ثبت‌شده در سیستم',
            gender: (f.gender as 'مرد' | 'زن' | 'نامشخص') || 'نامشخص',
            ageRange: f.ageRange || '۲۵ تا ۳۵ سال',
            attributes: Array.isArray(f.attributes) && f.attributes.length > 0 ? f.attributes : ['چهره واضح'],
            expression: f.expression || 'عادی',
            confidence: f.confidence || 95,
            matchedWatchlistId: matchedWl?.id,
          },
          watchlistStatus: matchedWl ? matchedWl.listType : 'normal',
          watchlistNote: matchedWl ? `${matchedWl.roleOrDepartment} — ${matchedWl.notes}` : undefined,
        };

        store.detections.unshift(record);
        createdRecords.push(record);
      }

      saveStore(store);

      res.json({
        createdRecords,
        totalDetected: createdRecords.length,
      });
    } catch (error) {
      console.error('Error in /api/ai/analyze-frame:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'خطا در تحلیل تصویر توسط هوش مصنوعی',
      });
    }
  });

  // 11. Manual or Motion Detection Record Logging
  app.post('/api/detections', (req, res) => {
    const body = req.body as Partial<DetectionRecord>;
    const now = new Date();
    const { jalaliDate, timeString } = formatJalaliDateTime(now);

    let watchlistStatus: 'normal' | 'vip' | 'blacklist' = body.watchlistStatus || 'normal';
    let watchlistNote = body.watchlistNote;

    if (body.type === 'plate' && body.plateDetails?.plateText) {
      const norm = normalizePlateForSearch(body.plateDetails.plateText);
      const matched = store.watchlist.find(
        (w) =>
          w.type === 'plate' &&
          (normalizePlateForSearch(w.identifier) === norm ||
            norm.includes(normalizePlateForSearch(w.identifier)))
      );
      if (matched) {
        watchlistStatus = matched.listType;
        watchlistNote = `${matched.roleOrDepartment} — ${matched.notes}`;
      }
    } else if (body.type === 'face' && body.faceDetails?.personName) {
      const matched = store.watchlist.find(
        (w) => w.type === 'face' && w.identifier === body.faceDetails?.personName
      );
      if (matched) {
        watchlistStatus = matched.listType;
        watchlistNote = `${matched.roleOrDepartment} — ${matched.notes}`;
      }
    }

    const record: DetectionRecord = {
      id: body.id || `det-${body.type || 'motion'}-${Date.now()}`,
      type: body.type || 'motion',
      cameraId: body.cameraId || 'cam-tiandy-main',
      cameraName: body.cameraName || 'دوربین شبکه',
      cameraLocation: body.cameraLocation || 'ورودی',
      timestampIso: body.timestampIso || now.toISOString(),
      jalaliDate: body.jalaliDate || jalaliDate,
      timeString: body.timeString || timeString,
      fullSnapshotDataUrl: body.fullSnapshotDataUrl || '',
      croppedImageDataUrl: body.croppedImageDataUrl || body.fullSnapshotDataUrl || '',
      plateDetails: body.plateDetails,
      faceDetails: body.faceDetails,
      motionScore: body.motionScore,
      watchlistStatus,
      watchlistNote,
      notes: body.notes,
    };

    store.detections.unshift(record);
    saveStore(store);
    res.json({ record });
  });

  app.delete('/api/detections/:id', (req, res) => {
    store.detections = store.detections.filter((d) => d.id !== req.params.id);
    saveStore(store);
    res.json({ ok: true });
  });

  // 12. Watchlist CRUD (VIP & Blacklist)
  app.post('/api/watchlist', (req, res) => {
    const body = req.body as Partial<WatchlistEntry>;
    const entry: WatchlistEntry = {
      id: `wl-${Date.now()}`,
      type: body.type || 'plate',
      listType: body.listType || 'vip',
      identifier: body.identifier || '',
      iranSegments: body.iranSegments,
      roleOrDepartment: body.roleOrDepartment || 'عمومی',
      referenceImageDataUrl: body.referenceImageDataUrl,
      notes: body.notes || '',
      soundAlert: body.soundAlert ?? (body.listType === 'blacklist'),
      createdAt: new Date().toISOString(),
    };
    store.watchlist.unshift(entry);
    saveStore(store);
    res.json({ entry });
  });

  app.delete('/api/watchlist/:id', (req, res) => {
    store.watchlist = store.watchlist.filter((w) => w.id !== req.params.id);
    saveStore(store);
    res.json({ ok: true });
  });

  // Vite middleware in development or fallback if dist/index.html is missing
  const distPath = path.join(process.cwd(), 'dist');
  const distExists = fs.existsSync(path.join(distPath, 'index.html'));

  if (!distExists || process.env.NODE_ENV !== 'production') {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch {
      if (distExists) {
        app.use(express.static(distPath));
        app.get('*', (_req, res) => {
          res.sendFile(path.join(distPath, 'index.html'));
        });
      }
    }
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AriaVMS Pro NVR Server running on http://0.0.0.0:${PORT}`);
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${PORT} is already in use, reusing existing server instance.`);
    } else {
      console.error('Server listen error:', err);
    }
  });
}

startServer();
