import React, { useState, useEffect } from 'react';
import {
  Camera,
  Radar,
  ShieldCheck,
  Wifi,
  X,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Lock,
  User,
  Server,
} from 'lucide-react';
import {
  CameraBrand,
  CameraDevice,
  DiscoveredNetworkDevice,
  InstallEnvironment,
} from '../types/nvr';
import {
  BRAND_METADATA,
  buildCameraEndpoints,
  INSTALL_ENVIRONMENT_LABELS,
} from '../utils/cameraProtocols';
import { runDualNetworkSweep } from '../utils/lanScanner';

interface CameraDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCameraConnected: (camera: CameraDevice, logMessage: string) => void;
  initialCamera?: CameraDevice | null;
}

export const CameraDiscoveryModal: React.FC<CameraDiscoveryModalProps> = ({
  isOpen,
  onClose,
  onCameraConnected,
  initialCamera = null,
}) => {
  const [activeTab, setActiveTab] = useState<'scan' | 'manual'>(initialCamera ? 'manual' : 'scan');
  const [ipRange, setIpRange] = useState('192.168.1.1-254');
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredNetworkDevice[]>([]);
  const [scanMessage, setScanMessage] = useState<string>('');

  // Connection form state
  const [brand, setBrand] = useState<CameraBrand>(initialCamera?.brand || 'tiandy');
  const [name, setName] = useState(initialCamera?.name || 'دوربین تیاندی ورودی اصلی');
  const [location, setLocation] = useState(initialCamera?.location || 'گیت ورودی و پلاک‌خوان');
  const [ipAddress, setIpAddress] = useState(initialCamera?.ipAddress || '192.168.1.108');
  const [httpPort, setHttpPort] = useState(initialCamera?.httpPort || 80);
  const [rtspPort, setRtspPort] = useState(initialCamera?.rtspPort || 554);
  const [onvifPort, setOnvifPort] = useState(initialCamera?.onvifPort || 80);
  const [username, setUsername] = useState(initialCamera?.username || 'admin');
  const [password, setPassword] = useState(initialCamera?.password || '');
  const [channel, setChannel] = useState(initialCamera?.channel || 1);
  const [streamUrl, setStreamUrl] = useState(initialCamera?.streamUrl || '');
  const [useLocalDeviceCamera, setUseLocalDeviceCamera] = useState(
    Boolean(initialCamera?.useLocalDeviceCamera)
  );
  const [installEnvironment, setInstallEnvironment] = useState<InstallEnvironment>(
    initialCamera?.installEnvironment || 'parking_entrance'
  );
  const [ptzSupported, setPtzSupported] = useState(initialCamera?.ptzSupported ?? true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialCamera) {
      setActiveTab('manual');
      setBrand(initialCamera.brand);
      setName(initialCamera.name);
      setLocation(initialCamera.location);
      setIpAddress(initialCamera.ipAddress);
      setHttpPort(initialCamera.httpPort);
      setRtspPort(initialCamera.rtspPort);
      setOnvifPort(initialCamera.onvifPort);
      setUsername(initialCamera.username);
      setPassword(initialCamera.password || '');
      setChannel(initialCamera.channel || 1);
      setStreamUrl(initialCamera.streamUrl || '');
      setUseLocalDeviceCamera(Boolean(initialCamera.useLocalDeviceCamera));
      setInstallEnvironment(initialCamera.installEnvironment || 'parking_entrance');
      setPtzSupported(initialCamera.ptzSupported ?? true);
    } else {
      setActiveTab('scan');
    }
  }, [initialCamera, isOpen]);

  if (!isOpen) return null;

  const previewEndpoints = buildCameraEndpoints({
    brand,
    ipAddress: ipAddress || '192.168.1.108',
    httpPort,
    rtspPort,
    onvifPort,
    username,
    password,
    channel,
  });

  const handleBrandSelect = (newBrand: CameraBrand) => {
    setBrand(newBrand);
    const meta = BRAND_METADATA[newBrand];
    setHttpPort(meta.defaultHttpPort);
    setRtspPort(meta.defaultRtspPort);
    setOnvifPort(meta.defaultOnvifPort);
    if (!initialCamera) {
      setName(`${meta.label} - کانال ${channel}`);
    }
  };

  const handleRunNetworkScan = async () => {
    setIsScanning(true);
    setErrorMsg(null);
    setScanMessage('در حال پویش واقعی شبکه محلی (LAN)...');
    try {
      const m = ipRange.trim().match(/^(\d+\.\d+\.\d+)\.(\d+)-(\d+)$/);
      const subnetPrefix = m ? m[1] : '192.168.1';
      const startHost = m ? Number(m[2]) : 1;
      const endHost = m ? Math.min(Number(m[3]), startHost + 60) : 60;

      const results = await runDualNetworkSweep({
        subnetPrefix,
        startHost,
        endHost,
        customIps: [],
        scanEngine: 'dual',
        onProgress: (cur, tot, found) => {
          setDiscoveredDevices(found);
          setScanMessage(`در حال اسکن آدرس ${cur} از ${tot}... (${found.length} دستگاه یافت شد)`);
        },
      });

      setDiscoveredDevices(results.devices);
      setScanMessage(
        results.devices.length > 0
          ? `${results.devices.length} دستگاه فعال واقعی در شبکه شناسایی شد.`
          : results.blockedByCloudHttps
          ? `به دلیل باز بودن برنامه روی سرور ابری (HTTPS)، مرورگر اجازه دسترسی مستقیم به LAN خصوصی را نمی‌دهد. به بخش «جستجوی IP شبکه (IP Search Config)» بروید و اسکریپت پل شبکه ویندوز (.bat) را اجرا کنید.`
          : `هیچ دستگاه فعالی در رنج ${ipRange} پاسخ نداد.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'خطا در پویش شبکه');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectDiscovered = (dev: DiscoveredNetworkDevice) => {
    setBrand(dev.detectedBrand);
    setIpAddress(dev.ipAddress);
    setHttpPort(dev.httpPort);
    setRtspPort(dev.rtspPort);
    setOnvifPort(dev.onvifPort);
    setName(`${BRAND_METADATA[dev.detectedBrand].label} (${dev.ipAddress})`);
    setActiveTab('manual');
  };

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/camera/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: initialCamera?.id,
          name,
          location,
          brand,
          ipAddress,
          httpPort,
          rtspPort,
          onvifPort,
          username,
          password,
          channel,
          streamUrl,
          useLocalDeviceCamera,
          installEnvironment,
          ptzSupported,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'خطا در برقراری اتصال با دوربین');
      }
      onCameraConnected(data.camera, data.protocolLog);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'خطا در اتصال به دوربین');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {initialCamera ? 'ویرایش اتصال و پروتکل دوربین شبکه' : 'کشف هوشمند دوربین‌های شبکه و اتصال NVR'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                پشتیبانی اختصاصی از Tiandy (S+265 / Starlight)، Hikvision (ISAPI)، Dahua (CGI) و ONVIF
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Control Tabs */}
        <div className="px-6 pt-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-3">
            <button
              type="button"
              onClick={() => setActiveTab('scan')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'scan'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Radar className="w-4 h-4 text-blue-600" />
              <span>اسکن خودکار شبکه (LAN / ONVIF)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'manual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>اتصال هوشمند با یوزر و پسورد (Tiandy / Hik / Dahua)</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Network Scanner */}
        {activeTab === 'scan' && (
          <div className="p-6 space-y-5">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  رنج آدرس IP شبکه محلی (IPv4 Subnet Range)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={ipRange}
                  onChange={(e) => setIpRange(e.target.value)}
                  placeholder="192.168.1.1-254"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <button
                type="button"
                onClick={handleRunNetworkScan}
                disabled={isScanning}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'در حال جستجوی دوربین‌ها...' : 'شروع پویش شبکه'}</span>
              </button>
            </div>

            {scanMessage && (
              <div className="flex items-center gap-2 text-xs text-slate-600 bg-blue-50/70 border border-blue-200 rounded-lg px-4 py-3">
                <Wifi className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{scanMessage}</span>
              </div>
            )}

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>فهرست دوربین‌ها و پورت‌های شناسایی‌شده در شبکه</span>
                <span className="font-mono-tabular">ONVIF / RTSP 554 / HTTP 80</span>
              </div>

              {discoveredDevices.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm font-medium text-slate-700">
                    برای کشف دوربین‌های فعال روی دکمه «شروع پویش شبکه» کلیک کنید یا مستقیماً مشخصات دوربین را وارد نمایید.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('manual')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>ورود مستقیم IP، یوزر و پسورد دوربین</span>
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {discoveredDevices.map((dev) => (
                    <div
                      key={dev.ipAddress}
                      className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tabular font-bold text-sm text-slate-900">
                            {dev.ipAddress}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-xs font-semibold text-blue-700">
                            {BRAND_METADATA[dev.detectedBrand].label}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-xs font-mono-tabular text-slate-500">
                            {dev.latencyMs}ms
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 font-mono-tabular">
                          پورت‌های باز: {dev.openPorts.join(', ')} · {dev.protocolHint}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectDiscovered(dev)}
                        className="px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        انتخاب و احراز هویت
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Smart Camera Connection Form */}
        {activeTab === 'manual' && (
          <form onSubmit={handleConnectSubmit} className="p-6 space-y-5">
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Brand Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                ۱. انتخاب برند و پروتکل دوربین (جهت استخراج خودکار تنظیمات و آدرس استریم)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {(['tiandy', 'hikvision', 'dahua', 'onvif'] as CameraBrand[]).map((b) => {
                  const active = brand === b;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => handleBrandSelect(b)}
                      className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                        active
                          ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-600/20'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-bold text-xs text-slate-900">
                        {BRAND_METADATA[b].label}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 truncate" dir="ltr">
                        {BRAND_METADATA[b].protocolName}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Network & Credentials Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  نام نمایشی دوربین
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  محل نصب فیزیکی
                </label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  شرایط محیطی محل نصب (برای هوش مصنوعی ISP)
                </label>
                <select
                  value={installEnvironment}
                  onChange={(e) => setInstallEnvironment(e.target.value as InstallEnvironment)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {(Object.keys(INSTALL_ENVIRONMENT_LABELS) as InstallEnvironment[]).map((envKey) => (
                    <option key={envKey} value={envKey}>
                      {INSTALL_ENVIRONMENT_LABELS[envKey]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  آدرس IP دوربین در شبکه
                </label>
                <div className="relative">
                  <Server className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    dir="ltr"
                    required
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    placeholder="192.168.1.108"
                    className="w-full pl-9 pr-3 py-2 text-xs font-mono-tabular bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  پورت HTTP/CGI
                </label>
                <input
                  type="number"
                  dir="ltr"
                  value={httpPort}
                  onChange={(e) => setHttpPort(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono-tabular bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  پورت RTSP
                </label>
                <input
                  type="number"
                  dir="ltr"
                  value={rtspPort}
                  onChange={(e) => setRtspPort(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono-tabular bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  شماره کانال
                </label>
                <input
                  type="number"
                  dir="ltr"
                  min={1}
                  max={64}
                  value={channel}
                  onChange={(e) => setChannel(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono-tabular bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  نام کاربری دوربین (Username)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    dir="ltr"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full pl-9 pr-3 py-2 text-xs font-mono-tabular bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  رمز عبور دوربین (Password)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 text-xs font-mono-tabular bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="flex items-end pb-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ptzSupported}
                    onChange={(e) => setPtzSupported(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>پشتیبانی PTZ</span>
                </label>
              </div>
            </div>

            {/* Optional Direct HTTP Stream or Device Camera */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  آدرس سفارشی استریم HTTP / MJPEG / Snapshot (اختیاری)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder={previewEndpoints.httpSnapshotUrl}
                  className="w-full px-3 py-2 text-xs font-mono-tabular bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="pt-4">
                <label className="inline-flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 cursor-pointer w-full">
                  <input
                    type="checkbox"
                    checked={useLocalDeviceCamera}
                    onChange={(e) => setUseLocalDeviceCamera(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>اتصال همزمان به دوربین دستگاه (وب‌کم ویندوز / دوربین موبایل) جهت تست زنده</span>
                </label>
              </div>
            </div>

            {/* Auto-Generated Protocol Endpoints Preview */}
            <div className="p-3.5 rounded-xl bg-slate-900 text-slate-200 text-xs space-y-1.5 font-mono-tabular" dir="ltr">
              <div className="text-[11px] text-sky-400 font-sans font-semibold mb-1" dir="rtl">
                مسیرهای استاندارد پروتکل {BRAND_METADATA[brand].label} (تولید شده به صورت خودکار):
              </div>
              <div className="truncate">
                <span className="text-slate-400">RTSP Main: </span>
                <span className="text-emerald-400">{previewEndpoints.rtspMainStream}</span>
              </div>
              <div className="truncate">
                <span className="text-slate-400">HTTP Snapshot: </span>
                <span className="text-amber-300">{previewEndpoints.httpSnapshotUrl}</span>
              </div>
              <div className="truncate">
                <span className="text-slate-400">ISP Config API: </span>
                <span className="text-sky-300">{previewEndpoints.configApiEndpoint}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={isConnecting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isConnecting
                    ? 'در حال اتصال و استخراج تنظیمات...'
                    : initialCamera
                    ? 'به‌روزرسانی و ذخیره تنظیمات اتصال'
                    : 'اتصال به دوربین و استخراج تنظیمات'}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
