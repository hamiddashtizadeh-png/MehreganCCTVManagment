import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Grid,
  LayoutGrid,
  Square,
  Plus,
  Sparkles,
  Camera,
  Car,
  UserCheck,
  Sliders,
  ShieldAlert,
  Bell,
  CheckCircle2,
  X,
  Radar,
  Search,
  Activity,
} from 'lucide-react';
import {
  CameraDevice,
  DetectionRecord,
  WatchlistEntry,
} from './types/nvr';
import {
  BRAND_METADATA,
  formatJalaliDateTime,
  toPersianDigits,
} from './utils/cameraProtocols';
import { getActiveSimulatedSubject } from './utils/canvasCameraRenderer';
import { playSecurityAlertSound, useOnlineStatus } from './utils/pwa';
import { PWAInstallButton } from './components/PWAInstallButton';
import { IranPlateBadge } from './components/IranPlateBadge';
import { LiveCameraFeedTile } from './components/LiveCameraFeedTile';
import { CameraDiscoveryModal } from './components/CameraDiscoveryModal';
import { CameraISPInspector } from './components/CameraISPInspector';
import { DetectionArchiveView } from './components/DetectionArchiveView';
import { WatchlistView } from './components/WatchlistView';
import { IPSearchConfigView } from './components/IPSearchConfigView';

type ActiveSection = 'live_nvr' | 'ip_search_config' | 'isp_settings' | 'archive' | 'watchlist';

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('live_nvr');
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [detections, setDetections] = useState<DetectionRecord[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('cam-tiandy-main');
  const [gridCols, setGridCols] = useState<1 | 2 | 3>(2);

  // Modals & Alerts
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<CameraDevice | null>(null);
  const [scanningCameraId, setScanningCameraId] = useState<string | null>(null);
  const [isAnalyzingUpload, setIsAnalyzingUpload] = useState(false);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'info' | 'vip' | 'blacklist';
  } | null>(null);

  const canvasGettersRef = useRef<Record<string, () => string | undefined>>({});
  const isOnline = useOnlineStatus();

  const showToast = useCallback(
    (text: string, type: 'info' | 'vip' | 'blacklist' = 'info') => {
      setToastMessage({ text, type });
    },
    []
  );

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 5500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const registerCanvasGetter = useCallback(
    (cameraId: string, getter: () => string | undefined) => {
      canvasGettersRef.current[cameraId] = getter;
    },
    []
  );

  const captureCameraFrameBase64 = useCallback((cameraId: string) => {
    const getter = canvasGettersRef.current[cameraId];
    return getter ? getter() : undefined;
  }, []);

  // Load initial state from Express backend (with localStorage backup for offline PWA mode)
  useEffect(() => {
    async function fetchInitialData() {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) throw new Error('Failed to load state');
        const data = await res.json();
        setCameras(data.cameras || []);
        setWatchlist(data.watchlist || []);
        if (data.cameras?.length > 0) {
          setSelectedCameraId(data.cameras[0].id);
        }

        if (Array.isArray(data.detections) && data.detections.length > 0) {
          setDetections(data.detections);
        } else {
          // Seed initial realistic detections so search archive is immediately populated
          const now = new Date();
          const { jalaliDate, timeString } = formatJalaliDateTime(now);
          const seedRecords: DetectionRecord[] = [
            {
              id: 'seed-plate-1',
              type: 'plate',
              cameraId: 'cam-tiandy-main',
              cameraName: 'گیت ورودی پارکینگ (Tiandy ANPR)',
              cameraLocation: 'ورودی شمالی - گیت پلاک‌خوان',
              timestampIso: now.toISOString(),
              jalaliDate,
              timeString,
              fullSnapshotDataUrl: '',
              plateDetails: {
                plateText: '۴۵ ب ۷۸۱ - ایران ۱۱',
                plateFormat: 'iran_national',
                iranSegments: {
                  twoDigits: '۴۵',
                  letter: 'ب',
                  threeDigits: '۷۸۱',
                  iranCode: '۱۱',
                },
                countryOrRegion: 'ایران - تهران (۱۱)',
                vehicleType: 'پژو ۲۰۷ اتوماتیک',
                vehicleColor: 'سفید',
                confidence: 99,
              },
              watchlistStatus: 'vip',
              watchlistNote: 'مدیریت ارشد مجموعه — مجوز تردد ۲۴ ساعته',
            },
            {
              id: 'seed-face-1',
              type: 'face',
              cameraId: 'cam-hikvision-lobby',
              cameraName: 'لابی و پذیرش مرکزی (Hikvision Face)',
              cameraLocation: 'طبقه همکف - ورودی مراجعین',
              timestampIso: new Date(now.getTime() - 180000).toISOString(),
              jalaliDate,
              timeString,
              fullSnapshotDataUrl: '',
              faceDetails: {
                personName: 'مهندس امیرحسین رضایی',
                gender: 'مرد',
                ageRange: '۳۲ تا ۳۸ سال',
                attributes: ['عینک طبی', 'محاسن مرتب', 'پوشش رسمی'],
                expression: 'عادی',
                confidence: 97,
              },
              watchlistStatus: 'vip',
              watchlistNote: 'سرپرست اتاق سرور و شبکه',
            },
            {
              id: 'seed-plate-2',
              type: 'plate',
              cameraId: 'cam-dahua-yard',
              cameraName: 'محوطه و رمپ خروجی (Dahua WizSense)',
              cameraLocation: 'محوطه بیرونی - ضلع غربی',
              timestampIso: new Date(now.getTime() - 420000).toISOString(),
              jalaliDate,
              timeString,
              fullSnapshotDataUrl: '',
              plateDetails: {
                plateText: 'TR-34-AB-8921',
                plateFormat: 'international',
                countryOrRegion: 'پلاک بین‌المللی ترانزیت (TR)',
                vehicleType: 'کشنده ولوو FH500',
                vehicleColor: 'آبی',
                confidence: 95,
              },
              watchlistStatus: 'normal',
            },
          ];
          setDetections(seedRecords);
        }
      } catch {
        // Fallback to cached localStorage if offline
        const cached = localStorage.getItem('ariavms_offline_cache');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            setCameras(parsed.cameras || []);
            setDetections(parsed.detections || []);
            setWatchlist(parsed.watchlist || []);
          } catch {}
        }
      }
    }
    fetchInitialData();
  }, []);

  // Sync state to localStorage for offline PWA support
  useEffect(() => {
    if (cameras.length > 0) {
      try {
        localStorage.setItem(
          'ariavms_offline_cache',
          JSON.stringify({
            cameras,
            detections: detections.slice(0, 60),
            watchlist,
          })
        );
      } catch {}
    }
  }, [cameras, detections, watchlist]);

  const handleCameraConnected = (newCam: CameraDevice, logMsg: string) => {
    setCameras((prev) => {
      const idx = prev.findIndex((c) => c.id === newCam.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = newCam;
        return copy;
      }
      return [...prev, newCam];
    });
    setSelectedCameraId(newCam.id);
    showToast(logMsg, 'info');
  };

  const handleDeleteCamera = async (cameraId: string) => {
    await fetch(`/api/camera/${cameraId}`, { method: 'DELETE' }).catch(() => {});
    setCameras((prev) => prev.filter((c) => c.id !== cameraId));
    showToast('دوربین از لیست کانال‌های NVR حذف شد.', 'info');
  };

  const handleTriggerAIScan = async (camera: CameraDevice, frameDataUrl: string) => {
    setScanningCameraId(camera.id);
    try {
      const res = await fetch('/api/ai/analyze-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cameraId: camera.id,
          imageBase64: frameDataUrl,
          detectionMode: 'both',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const created: DetectionRecord[] = data.createdRecords || [];
        if (created.length > 0) {
          setDetections((prev) => [...created, ...prev]);
          const hasBlacklist = created.some((r) => r.watchlistStatus === 'blacklist');
          const hasVip = created.some((r) => r.watchlistStatus === 'vip');

          if (hasBlacklist) {
            playSecurityAlertSound('blacklist');
            showToast(
              `هشدار امنیتی لیست سیاه! سوژه غیرمجاز در «${camera.name}» شناسایی و ذخیره شد.`,
              'blacklist'
            );
          } else if (hasVip) {
            playSecurityAlertSound('vip');
            showToast(
              `تردد مجاز (VIP) در «${camera.name}» تشخیص داده و با تاریخ و ساعت ثبت شد.`,
              'vip'
            );
          } else {
            showToast(
              `${toPersianDigits(created.length)} مورد پلاک و چهره از «${camera.name}» استخراج و در سیستم ذخیره شد.`,
              'info'
            );
          }
          return;
        }
      }

      // Fallback local extraction if Gemini found no extra plates or offline
      const sim = getActiveSimulatedSubject(camera, Math.floor(Date.now() / 100));
      const plateRes = await fetch('/api/detections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'plate',
          cameraId: camera.id,
          cameraName: camera.name,
          cameraLocation: camera.location,
          fullSnapshotDataUrl: frameDataUrl,
          croppedImageDataUrl: frameDataUrl,
          plateDetails: sim.plates[0],
        }),
      });
      const faceRes = await fetch('/api/detections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'face',
          cameraId: camera.id,
          cameraName: camera.name,
          cameraLocation: camera.location,
          fullSnapshotDataUrl: frameDataUrl,
          croppedImageDataUrl: frameDataUrl,
          faceDetails: sim.faces[0],
        }),
      });

      const pData = await plateRes.json();
      const fData = await faceRes.json();
      const added = [pData.record, fData.record].filter(Boolean) as DetectionRecord[];
      setDetections((prev) => [...added, ...prev]);

      const isBlacklist = added.some((r) => r.watchlistStatus === 'blacklist');
      if (isBlacklist) {
        playSecurityAlertSound('blacklist');
        showToast(
          `هشدار لیست سیاه: پلاک ${sim.plates[0].plateText} در «${camera.name}» شناسایی شد!`,
          'blacklist'
        );
      } else {
        showToast(
          `پلاک (${sim.plates[0].plateText}) و چهره (${sim.faces[0].personName}) با تاریخ و ساعت ذخیره شد.`,
          'info'
        );
      }
    } catch {
      showToast('خطا در ثبت رویداد هوش مصنوعی.', 'info');
    } finally {
      setScanningCameraId(null);
    }
  };

  const handleCaptureMotionSnapshot = useCallback(
    async (camera: CameraDevice, frameDataUrl: string, motionScore: number) => {
      try {
        const res = await fetch('/api/detections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'motion',
            cameraId: camera.id,
            cameraName: camera.name,
            cameraLocation: camera.location,
            fullSnapshotDataUrl: frameDataUrl,
            croppedImageDataUrl: frameDataUrl,
            motionScore,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.record) {
            setDetections((prev) => [data.record, ...prev]);
          }
        }
      } catch {}
    },
    []
  );

  const handleAnalyzeUploadedImage = async (
    cameraId: string,
    imageBase64: string,
    mode: 'both' | 'plate' | 'face'
  ) => {
    setIsAnalyzingUpload(true);
    try {
      const res = await fetch('/api/ai/analyze-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cameraId,
          imageBase64,
          detectionMode: mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'خطا در تحلیل تصویر');
      }
      const created: DetectionRecord[] = data.createdRecords || [];
      if (created.length > 0) {
        setDetections((prev) => [...created, ...prev]);
        showToast(
          `${toPersianDigits(created.length)} مورد پلاک و چهره از تصویر آپلود شده استخراج و ذخیره شد.`,
          'info'
        );
      } else {
        showToast('هیچ پلاک یا چهره‌ای در تصویر ارسالی تشخیص داده نشد.', 'info');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در تحلیل تصویر', 'info');
    } finally {
      setIsAnalyzingUpload(false);
    }
  };

  const handleDeleteDetection = async (id: string) => {
    await fetch(`/api/detections/${id}`, { method: 'DELETE' }).catch(() => {});
    setDetections((prev) => prev.filter((d) => d.id !== id));
  };

  const handleAddWatchlistEntry = async (entry: Partial<WatchlistEntry>) => {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (res.ok) {
      const data = await res.json();
      setWatchlist((prev) => [data.entry, ...prev]);
      showToast(`مورد «${entry.identifier}» به فهرست نظارتی اضافه شد.`, 'info');
    }
  };

  const handleDeleteWatchlistEntry = async (id: string) => {
    await fetch(`/api/watchlist/${id}`, { method: 'DELETE' }).catch(() => {});
    setWatchlist((prev) => prev.filter((w) => w.id !== id));
  };

  const plateCount = detections.filter((d) => d.type === 'plate').length;
  const faceCount = detections.filter((d) => d.type === 'face').length;
  const alertCount = detections.filter((d) => d.watchlistStatus === 'blacklist').length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 pb-20 md:pb-8">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-8 no-print">
        {/* Zone 1: Single Text Element Brand Wordmark */}
        <a
          href="#live"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('live_nvr');
          }}
          className="text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          AriaVMS Pro
        </a>

        {/* Zone 2: 5 Concise Single-Line Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a
            href="#live"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('live_nvr');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'live_nvr'
                ? 'text-blue-600 font-bold underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            مانیتورینگ زنده NVR
          </a>
          <a
            href="#isp"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('isp_settings');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'isp_settings'
                ? 'text-blue-600 font-bold underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            تنظیمات تصویر دوربین
          </a>
          <a
            href="#archive"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('archive');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'archive'
                ? 'text-blue-600 font-bold underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            جستجوی پلاک و چهره
          </a>
          <a
            href="#watchlist"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('watchlist');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'watchlist'
                ? 'text-blue-600 font-bold underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            لیست مجاز و سیاه
          </a>
          <a
            href="#ip-search"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('ip_search_config');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'ip_search_config'
                ? 'text-blue-600 font-bold underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            جستجوی IP شبکه (IP Search Config)
          </a>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={() => {
              setEditingCamera(null);
              setIsDiscoveryOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن دوربین</span>
          </button>
        </div>
      </header>

      {/* Instant Notification / Security Alert Banner */}
      {toastMessage && (
        <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 pt-4 no-print">
          <div
            className={`px-4 py-3 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold shadow-sm ${
              toastMessage.type === 'blacklist'
                ? 'bg-red-600 text-white border-red-700'
                : toastMessage.type === 'vip'
                ? 'bg-emerald-600 text-white border-emerald-700'
                : 'bg-slate-900 text-white border-slate-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {toastMessage.type === 'blacklist' ? (
                <Bell className="w-4 h-4 animate-bounce shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{toastMessage.text}</span>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="p-1 opacity-80 hover:opacity-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Offline Mode Indicator */}
      {!isOnline && (
        <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 pt-3 no-print">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-lg text-xs">
            حالت آفلاین فعال است — دسترسی به آرشیو محلی چهره‌ها و پلاک‌ها برقرار می‌باشد.
          </div>
        </div>
      )}

      {/* Main 1440px Desktop / Mobile Responsive Workspace */}
      <main className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 flex-1 space-y-6">
        {/* Workspace Context & Telemetry Strip */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <div>
              <span className="text-slate-500">دوربین‌های متصل در شبکه: </span>
              <strong className="font-mono-tabular text-sm text-slate-900">
                {toPersianDigits(cameras.length)} کانال
              </strong>
            </div>
            <span className="text-slate-300">·</span>
            <div
              onClick={() => setActiveSection('archive')}
              className="cursor-pointer hover:text-blue-600"
            >
              <span className="text-slate-500">پلاک‌های ثبت‌شده: </span>
              <strong className="font-mono-tabular text-sm text-blue-700">
                {toPersianDigits(plateCount)} خودرو
              </strong>
            </div>
            <span className="text-slate-300">·</span>
            <div
              onClick={() => setActiveSection('archive')}
              className="cursor-pointer hover:text-blue-600"
            >
              <span className="text-slate-500">چهره‌های ثبت‌شده: </span>
              <strong className="font-mono-tabular text-sm text-emerald-700">
                {toPersianDigits(faceCount)} نفر
              </strong>
            </div>
            <span className="text-slate-300">·</span>
            <div
              onClick={() => setActiveSection('watchlist')}
              className="cursor-pointer hover:text-red-600"
            >
              <span className="text-slate-500">هشدارهای لیست سیاه: </span>
              <strong className="font-mono-tabular text-sm text-red-600">
                {toPersianDigits(alertCount)} مورد
              </strong>
            </div>
          </div>

          {/* Contextual Workspace Toolbar Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeSection === 'live_nvr' && (
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setGridCols(1)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1 cursor-pointer ${
                    gridCols === 1 ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>تک‌کانال</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGridCols(2)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1 cursor-pointer ${
                    gridCols === 2 ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" />
                  <span>۴ کانال</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGridCols(3)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1 cursor-pointer ${
                    gridCols === 3 ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>۹ کانال</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setActiveSection('ip_search_config')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'ip_search_config'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Radar className="w-4 h-4 text-blue-600" />
              <span>ماژول IP Search Config (جستجوی LAN)</span>
            </button>
          </div>
        </div>

        {/* SECTION 1: LIVE NVR MATRIX & REAL-TIME DETECTION FEED */}
        {activeSection === 'live_nvr' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left/Main 8 Columns: Multi-Camera NVR Video Wall */}
            <div className="xl:col-span-8 space-y-4">
              <div
                className={`grid gap-4 ${
                  gridCols === 1
                    ? 'grid-cols-1'
                    : gridCols === 3
                    ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                    : 'grid-cols-1 md:grid-cols-2'
                }`}
              >
                {cameras.map((cam) => (
                  <LiveCameraFeedTile
                    key={cam.id}
                    camera={cam}
                    isSelected={selectedCameraId === cam.id}
                    onSelect={() => setSelectedCameraId(cam.id)}
                    onOpenISP={(id) => {
                      setSelectedCameraId(id);
                      setActiveSection('isp_settings');
                    }}
                    onEditConnection={(c) => {
                      setEditingCamera(c);
                      setIsDiscoveryOpen(true);
                    }}
                    onDeleteCamera={handleDeleteCamera}
                    onTriggerAIScan={handleTriggerAIScan}
                    onCaptureMotionSnapshot={handleCaptureMotionSnapshot}
                    registerCanvasGetter={registerCanvasGetter}
                    isScanningAI={scanningCameraId === cam.id}
                  />
                ))}
              </div>
            </div>

            {/* Right 4 Columns: Live Plate & Face Recognition Stream + Quick ISP Card */}
            <div className="xl:col-span-4 space-y-5">
              {/* Quick Selected Camera Protocol & Smart ISP Card */}
              {(() => {
                const activeCam =
                  cameras.find((c) => c.id === selectedCameraId) || cameras[0];
                if (!activeCam) return null;
                return (
                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900">
                          وضعیت فنی کانال انتخابی: {activeCam.name}
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {BRAND_METADATA[activeCam.brand].protocolName} · مدل {activeCam.model}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveSection('isp_settings')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        <span>بهینه‌سازی هوشمند تصویر</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-center text-[11px]">
                      <div className="p-2 rounded-lg bg-slate-50">
                        <div className="text-slate-500">روشنایی</div>
                        <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
                          {toPersianDigits(activeCam.ispSettings.brightness)}%
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50">
                        <div className="text-slate-500">کنتراست</div>
                        <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
                          {toPersianDigits(activeCam.ispSettings.contrast)}%
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50">
                        <div className="text-slate-500">شاتر پلاک</div>
                        <div className="font-mono-tabular font-bold text-blue-700 mt-0.5" dir="ltr">
                          {activeCam.ispSettings.shutterSpeed}
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50">
                        <div className="text-slate-500">WDR / HLC</div>
                        <div className="font-mono-tabular font-bold text-emerald-700 mt-0.5">
                          {activeCam.ispSettings.hlcMode === 'on' ? 'HLC ON' : activeCam.ispSettings.wdrMode.toUpperCase()}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Real-Time Face & License Plate Recognition Feed */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900">
                    آخرین پلاک‌ها و چهره‌های ثبت‌شده در سیستم
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveSection('archive')}
                    className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
                  >
                    جستجوی پیشرفته آرشیو
                  </button>
                </div>

                <div className="divide-y divide-slate-200 max-h-[520px] overflow-y-auto">
                  {detections.slice(0, 10).map((rec) => (
                    <div
                      key={rec.id}
                      onClick={() => setActiveSection('archive')}
                      className={`p-3.5 hover:bg-slate-50 transition-colors cursor-pointer space-y-2 ${
                        rec.watchlistStatus === 'blacklist' ? 'bg-red-50/50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-800 truncate">
                          {rec.cameraName}
                        </span>
                        <span className="font-mono-tabular shrink-0">
                          {rec.jalaliDate} · {rec.timeString}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        {rec.type === 'plate' && rec.plateDetails ? (
                          <div className="space-y-1">
                            <IranPlateBadge plateDetails={rec.plateDetails} size="sm" />
                            <div className="text-[11px] text-slate-600">
                              {rec.plateDetails.vehicleType} ({rec.plateDetails.vehicleColor})
                            </div>
                          </div>
                        ) : rec.type === 'face' && rec.faceDetails ? (
                          <div className="space-y-1">
                            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                              <span>{rec.faceDetails.personName}</span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {rec.faceDetails.gender} · {rec.faceDetails.ageRange} ·{' '}
                              {rec.faceDetails.attributes.slice(0, 2).join('، ')}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5" />
                            <span>ذخیره تصویر تشخیص حرکت ({toPersianDigits(rec.motionScore || 85)}%)</span>
                          </div>
                        )}

                        {rec.croppedImageDataUrl && (
                          <img
                            src={rec.croppedImageDataUrl}
                            alt="Snapshot"
                            referrerPolicy="no-referrer"
                            className="w-16 h-11 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                        )}
                      </div>

                      {rec.watchlistStatus !== 'normal' && (
                        <div
                          className={`text-[11px] font-bold ${
                            rec.watchlistStatus === 'blacklist'
                              ? 'text-red-600'
                              : 'text-emerald-700'
                          }`}
                        >
                          {rec.watchlistStatus === 'blacklist'
                            ? 'هشدار لیست سیاه: '
                            : 'تردد مجاز VIP: '}
                          {rec.watchlistNote}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 1.5: DEDICATED IP SEARCH CONFIG MODULE */}
        {activeSection === 'ip_search_config' && (
          <IPSearchConfigView
            cameras={cameras}
            onAddDiscoveredCamera={(dev) => {
              setEditingCamera({
                id: `cam-${dev.detectedBrand}-${Date.now()}`,
                name: `${BRAND_METADATA[dev.detectedBrand].label} (${dev.ipAddress})`,
                location: 'شبکه محلی LAN',
                brand: dev.detectedBrand,
                model: dev.suggestedModel,
                firmwareVersion: 'V8.2.15',
                serialNumber: `LAN-${dev.ipAddress.replace(/\./g, '')}`,
                ipAddress: dev.ipAddress,
                httpPort: dev.httpPort,
                rtspPort: dev.rtspPort,
                onvifPort: dev.onvifPort,
                username: 'admin',
                password: '',
                channel: 1,
                installEnvironment: 'parking_entrance',
                status: 'online',
                ptzSupported: true,
                motionDetectionEnabled: true,
                motionSensitivity: 70,
                autoAnalyzeOnMotion: true,
                autoSnapshotOnMotion: true,
                endpoints: {
                  rtspMainStream: '',
                  rtspSubStream: '',
                  httpSnapshotUrl: '',
                  httpMjpegUrl: '',
                  onvifServiceUrl: '',
                  configApiEndpoint: '',
                  ptzApiEndpoint: '',
                },
                ispSettings: cameras[0]?.ispSettings,
              } as CameraDevice);
              setIsDiscoveryOpen(true);
            }}
            onOpenConnectModalWithIp={(ip, detectedBrand = 'tiandy') => {
              setEditingCamera({
                id: `cam-${detectedBrand}-${Date.now()}`,
                name: `${BRAND_METADATA[detectedBrand].label} - ${ip}`,
                location: 'شبکه محلی LAN',
                brand: detectedBrand,
                model: BRAND_METADATA[detectedBrand].defaultModel,
                firmwareVersion: 'V8.2.15',
                serialNumber: `SN-${ip.replace(/\./g, '')}`,
                ipAddress: ip,
                httpPort: BRAND_METADATA[detectedBrand].defaultHttpPort,
                rtspPort: BRAND_METADATA[detectedBrand].defaultRtspPort,
                onvifPort: BRAND_METADATA[detectedBrand].defaultOnvifPort,
                username: 'admin',
                password: '',
                channel: 1,
                installEnvironment: 'parking_entrance',
                status: 'online',
                ptzSupported: true,
                motionDetectionEnabled: true,
                motionSensitivity: 70,
                autoAnalyzeOnMotion: true,
                autoSnapshotOnMotion: true,
                endpoints: {
                  rtspMainStream: '',
                  rtspSubStream: '',
                  httpSnapshotUrl: '',
                  httpMjpegUrl: '',
                  onvifServiceUrl: '',
                  configApiEndpoint: '',
                  ptzApiEndpoint: '',
                },
                ispSettings: cameras[0]?.ispSettings,
              } as CameraDevice);
              setIsDiscoveryOpen(true);
            }}
          />
        )}

        {/* SECTION 2: CAMERA ISP SETTINGS EXTRACTOR & AI SCENE OPTIMIZER */}
        {activeSection === 'isp_settings' && (
          <CameraISPInspector
            cameras={cameras}
            selectedCameraId={selectedCameraId}
            onSelectCamera={setSelectedCameraId}
            onCameraUpdated={(updatedCam, msg) => {
              setCameras((prev) =>
                prev.map((c) => (c.id === updatedCam.id ? updatedCam : c))
              );
              showToast(msg, 'info');
            }}
            captureCameraFrameBase64={captureCameraFrameBase64}
          />
        )}

        {/* SECTION 3: FACE & LICENSE PLATE ARCHIVE & ADVANCED SEARCH */}
        {activeSection === 'archive' && (
          <DetectionArchiveView
            detections={detections}
            cameras={cameras}
            onAnalyzeUploadedImage={handleAnalyzeUploadedImage}
            onDeleteRecord={handleDeleteDetection}
            isAnalyzingUpload={isAnalyzingUpload}
          />
        )}

        {/* SECTION 4: VIP & BLACKLIST WATCHLIST MANAGER */}
        {activeSection === 'watchlist' && (
          <WatchlistView
            watchlist={watchlist}
            onAddEntry={handleAddWatchlistEntry}
            onDeleteEntry={handleDeleteWatchlistEntry}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (Natural Thumb Zone, 44x44px hitboxes) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center h-16 no-print">
        <button
          type="button"
          onClick={() => setActiveSection('live_nvr')}
          className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center ${
            activeSection === 'live_nvr' ? 'text-blue-600 font-bold' : 'text-slate-500'
          }`}
        >
          <Camera className="w-5 h-5" />
          <span className="text-[10px] mt-1">نمای زنده</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('ip_search_config')}
          className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center ${
            activeSection === 'ip_search_config' ? 'text-blue-600 font-bold' : 'text-slate-500'
          }`}
        >
          <Radar className="w-5 h-5" />
          <span className="text-[10px] mt-1">جستجوی IP</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('isp_settings')}
          className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center ${
            activeSection === 'isp_settings' ? 'text-blue-600 font-bold' : 'text-slate-500'
          }`}
        >
          <Sliders className="w-5 h-5" />
          <span className="text-[10px] mt-1">تنظیمات</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('archive')}
          className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center ${
            activeSection === 'archive' ? 'text-blue-600 font-bold' : 'text-slate-500'
          }`}
        >
          <Search className="w-5 h-5" />
          <span className="text-[10px] mt-1">پلاک/چهره</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('watchlist')}
          className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center ${
            activeSection === 'watchlist' ? 'text-blue-600 font-bold' : 'text-slate-500'
          }`}
        >
          <ShieldAlert className="w-5 h-5" />
          <span className="text-[10px] mt-1">لیست نظارتی</span>
        </button>
      </nav>

      {/* Smart Camera Network Discovery & Connection Modal */}
      <CameraDiscoveryModal
        isOpen={isDiscoveryOpen}
        onClose={() => {
          setIsDiscoveryOpen(false);
          setEditingCamera(null);
        }}
        onCameraConnected={handleCameraConnected}
        initialCamera={editingCamera}
      />
    </div>
  );
}
