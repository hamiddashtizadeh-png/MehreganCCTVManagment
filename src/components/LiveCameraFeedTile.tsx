import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Maximize2,
  Minimize2,
  Sliders,
  Sparkles,
  Move,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Video,
  Settings,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { CameraDevice } from '../types/nvr';
import { BRAND_METADATA } from '../utils/cameraProtocols';
import { renderCameraCanvasFrame } from '../utils/canvasCameraRenderer';

interface LiveCameraFeedTileProps {
  camera: CameraDevice;
  isSelected: boolean;
  onSelect: () => void;
  onOpenISP: (cameraId: string) => void;
  onEditConnection: (camera: CameraDevice) => void;
  onDeleteCamera: (cameraId: string) => void;
  onTriggerAIScan: (camera: CameraDevice, frameDataUrl: string) => void;
  onCaptureMotionSnapshot: (
    camera: CameraDevice,
    frameDataUrl: string,
    motionScore: number
  ) => void;
  registerCanvasGetter: (cameraId: string, getter: () => string | undefined) => void;
  isScanningAI: boolean;
}

export const LiveCameraFeedTile: React.FC<LiveCameraFeedTileProps> = ({
  camera,
  isSelected,
  onSelect,
  onOpenISP,
  onEditConnection,
  onDeleteCamera,
  onTriggerAIScan,
  onCaptureMotionSnapshot,
  registerCanvasGetter,
  isScanningAI,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const remoteImgRef = useRef<HTMLImageElement | null>(null);
  const prevPixelSampleRef = useRef<Uint8ClampedArray | null>(null);
  const lastMotionTriggerTimeRef = useRef<number>(0);

  const [ptzOffset, setPtzOffset] = useState({ pan: 0, tilt: 0, zoom: 1 });
  const [showPtzPad, setShowPtzPad] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [motionActive, setMotionActive] = useState(false);
  const [useWebcamLive, setUseWebcamLive] = useState(Boolean(camera.useLocalDeviceCamera));
  const [remoteFrameLoaded, setRemoteFrameLoaded] = useState(false);

  // Register frame getter for parent ISP optimizer or manual triggers
  useEffect(() => {
    registerCanvasGetter(camera.id, () => {
      if (!canvasRef.current) return undefined;
      return canvasRef.current.toDataURL('image/jpeg', 0.88);
    });
  }, [camera.id, registerCanvasGetter]);

  // Handle optional local device webcam stream
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    if (useWebcamLive && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
        .then((stream) => {
          activeStream = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
        })
        .catch(() => {
          setUseWebcamLive(false);
        });
    } else if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [useWebcamLive]);

  // Periodically fetch real camera snapshot frames from backend proxy or streamUrl
  useEffect(() => {
    let timer: NodeJS.Timeout;
    let isActive = true;

    const fetchSnapshotFrame = () => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      // Use custom streamUrl if specified, otherwise hit local backend snapshot proxy endpoint
      const targetSrc = camera.streamUrl || `/api/camera/${camera.id}/snapshot?t=${Date.now()}`;

      img.onload = () => {
        if (!isActive) return;
        remoteImgRef.current = img;
        setRemoteFrameLoaded(true);
      };
      img.onerror = () => {
        if (!isActive) return;
        // If snapshot endpoint fails (e.g. offline or unauthenticated), fallback to canvas scene
        setRemoteFrameLoaded(false);
      };
      img.src = targetSrc;
    };

    // Initial fetch
    fetchSnapshotFrame();

    // Poll live frame every 1200ms
    timer = setInterval(fetchSnapshotFrame, 1200);

    return () => {
      isActive = false;
      clearInterval(timer);
    };
  }, [camera.id, camera.streamUrl, camera.ipAddress, camera.httpPort]);

  // Main real-time render + Frame Differencing Motion Detection loop
  useEffect(() => {
    let animId: number;
    let tick = 0;

    const renderLoop = () => {
      tick += 1;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const extSource =
            useWebcamLive && videoRef.current && videoRef.current.readyState >= 2
              ? videoRef.current
              : remoteFrameLoaded && remoteImgRef.current
              ? remoteImgRef.current
              : null;

          renderCameraCanvasFrame({
            ctx,
            width: canvas.width,
            height: canvas.height,
            camera,
            tick,
            externalSource: extSource,
            ptzOffset,
            motionActive,
          });

          // Frame-Differencing Motion Engine (runs every 30 frames ~0.5s)
          if (camera.motionDetectionEnabled && tick % 30 === 0) {
            try {
              const sampleData = ctx.getImageData(
                Math.floor(canvas.width * 0.25),
                Math.floor(canvas.height * 0.25),
                120,
                80
              ).data;

              if (prevPixelSampleRef.current) {
                let diffSum = 0;
                const prev = prevPixelSampleRef.current;
                for (let i = 0; i < sampleData.length; i += 16) {
                  diffSum += Math.abs(sampleData[i] - prev[i]);
                }
                const avgDiff = diffSum / (sampleData.length / 16);
                const threshold = Math.max(4, 32 - camera.motionSensitivity * 0.26);

                if (avgDiff > threshold) {
                  setMotionActive(true);
                  const now = Date.now();
                  // Auto-snapshot on motion cooldown (every 35s max per camera to avoid flooding)
                  if (
                    camera.autoSnapshotOnMotion &&
                    now - lastMotionTriggerTimeRef.current > 35000
                  ) {
                    lastMotionTriggerTimeRef.current = now;
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    onCaptureMotionSnapshot(
                      camera,
                      dataUrl,
                      Math.min(99, Math.round(65 + avgDiff))
                    );
                  }
                } else {
                  setMotionActive(false);
                }
              }
              prevPixelSampleRef.current = new Uint8ClampedArray(sampleData);
            } catch {
              // Ignore cross-origin canvas read errors
            }
          }
        }
      }
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [camera, ptzOffset, useWebcamLive, remoteFrameLoaded, motionActive]);

  const handlePtzMove = async (
    dir: 'up' | 'down' | 'left' | 'right' | 'zoom_in' | 'zoom_out' | 'reset'
  ) => {
    if (dir === 'reset') {
      setPtzOffset({ pan: 0, tilt: 0, zoom: 1 });
      return;
    }

    setPtzOffset((prev) => {
      if (dir === 'left') return { ...prev, pan: Math.min(80, prev.pan + 16) };
      if (dir === 'right') return { ...prev, pan: Math.max(-80, prev.pan - 16) };
      if (dir === 'up') return { ...prev, tilt: Math.min(50, prev.tilt + 12) };
      if (dir === 'down') return { ...prev, tilt: Math.max(-50, prev.tilt - 12) };
      if (dir === 'zoom_in') return { ...prev, zoom: Math.min(2.4, +(prev.zoom + 0.2).toFixed(2)) };
      if (dir === 'zoom_out') return { ...prev, zoom: Math.max(1, +(prev.zoom - 0.2).toFixed(2)) };
      return prev;
    });

    // Send real PTZ command to backend protocol adapter
    fetch(`/api/camera/${camera.id}/ptz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: dir, speed: 5 }),
    }).catch(() => {});
  };

  const handleManualSnapshot = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.9);
    onCaptureMotionSnapshot(camera, dataUrl, 100);
  };

  const handleAnalyzeClick = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.9);
    onTriggerAIScan(camera, dataUrl);
  };

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl bg-white border transition-all overflow-hidden flex flex-col ${
        isFullscreen ? 'fixed inset-4 z-50 shadow-2xl' : 'relative'
      } ${
        isSelected
          ? 'border-blue-600 ring-2 ring-blue-600/15'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Hidden video element for webcam stream */}
      <video ref={videoRef} playsInline muted className="hidden" />

      {/* Top Camera Header Bar */}
      <div className="px-3.5 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full bg-emerald-600 shrink-0"
            title="استریم زنده برقرار است"
          />
          <span className="font-bold text-xs text-slate-900 truncate">{camera.name}</span>
          <span className="text-slate-300">·</span>
          <span className="text-[11px] font-semibold text-blue-700 whitespace-nowrap">
            {BRAND_METADATA[camera.brand].label}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setUseWebcamLive((v) => !v);
            }}
            className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
              useWebcamLive
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
            title="اتصال زنده به وب‌کم ویندوز / دوربین موبایل"
          >
            <span className="inline-flex items-center gap-1">
              <Video className="w-3 h-3" />
              <span>{useWebcamLive ? 'وب‌کم فعال' : 'دوربین دستگاه'}</span>
            </span>
          </button>

          {camera.ptzSupported && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowPtzPad((v) => !v);
              }}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                showPtzPad
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title="کنترل چرخش و زوم PTZ"
            >
              <Move className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditConnection(camera);
            }}
            className="p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
            title="ویرایش IP، یوزر و پسورد دوربین"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsFullscreen((v) => !v);
            }}
            className="p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
            title="بزرگ‌نمایی تصویر"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Main Video Canvas Container */}
      <div className="relative bg-slate-950 aspect-video w-full overflow-hidden flex-1">
        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          className="w-full h-full object-cover block"
        />

        {/* Live Stream Auth / Loading Warning Overlay */}
        {!remoteFrameLoaded && !useWebcamLive && (
          <div className="absolute inset-x-3 top-3 bg-slate-900/90 border border-amber-500/40 backdrop-blur-xs rounded-lg px-3 py-2 text-amber-200 text-xs flex items-center justify-between gap-2 shadow-lg z-10">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="truncate text-[11px] font-medium">
                استریم زنده از آدرس ({camera.ipAddress}): جهت نمایش تصویر واقعی دوربین، نام کاربری و رمز عبور را تنظیم کنید
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditConnection(camera);
              }}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] rounded transition-colors whitespace-nowrap cursor-pointer shrink-0"
            >
              ورود رمز عبور دوربین
            </button>
          </div>
        )}

        {/* Floating Interactive PTZ Controller Overlay */}
        {showPtzPad && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl p-2.5 shadow-lg flex items-center gap-3"
          >
            <div className="grid grid-cols-3 gap-1 w-24 h-24">
              <div />
              <button
                type="button"
                onClick={() => handlePtzMove('up')}
                className="bg-slate-100 hover:bg-blue-600 hover:text-white rounded flex items-center justify-center cursor-pointer"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <div />
              <button
                type="button"
                onClick={() => handlePtzMove('left')}
                className="bg-slate-100 hover:bg-blue-600 hover:text-white rounded flex items-center justify-center cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handlePtzMove('reset')}
                className="bg-slate-200 hover:bg-slate-800 hover:text-white rounded flex items-center justify-center cursor-pointer"
                title="بازگشت به نقطه مرجع"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => handlePtzMove('right')}
                className="bg-slate-100 hover:bg-blue-600 hover:text-white rounded flex items-center justify-center cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <div />
              <button
                type="button"
                onClick={() => handlePtzMove('down')}
                className="bg-slate-100 hover:bg-blue-600 hover:text-white rounded flex items-center justify-center cursor-pointer"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <div />
            </div>

            <div className="flex flex-col gap-1.5 border-r border-slate-200 pr-2.5">
              <button
                type="button"
                onClick={() => handlePtzMove('zoom_in')}
                className="p-2 bg-slate-100 hover:bg-blue-600 hover:text-white rounded-lg flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                <span>زوم +</span>
              </button>
              <button
                type="button"
                onClick={() => handlePtzMove('zoom_out')}
                className="p-2 bg-slate-100 hover:bg-blue-600 hover:text-white rounded-lg flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
                <span>زوم -</span>
              </button>
              <div className="text-[10px] font-mono-tabular text-center text-slate-500">
                {ptzOffset.zoom}x
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Camera Action Bar */}
      <div className="px-3.5 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[11px] text-slate-500 font-mono-tabular flex items-center gap-1.5">
          <span>{camera.ipAddress}:{camera.rtspPort}</span>
          <span>·</span>
          <span>{camera.ispSettings.resolution.split(' ')[0]}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleManualSnapshot();
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-[11px] font-semibold hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="ذخیره فوری تصویر در آرشیو"
          >
            <Camera className="w-3.5 h-3.5 text-slate-600" />
            <span>ذخیره تصویر</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenISP(camera.id);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-[11px] font-semibold hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="استخراج و ویرایش تنظیمات تصویر دوربین"
          >
            <Sliders className="w-3.5 h-3.5 text-amber-600" />
            <span>تنظیمات تصویر</span>
          </button>

          <button
            type="button"
            disabled={isScanningAI}
            onClick={(e) => {
              e.stopPropagation();
              handleAnalyzeClick();
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isScanningAI ? 'animate-spin' : ''}`} />
            <span>تشخیص چهره و پلاک</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteCamera(camera.id);
            }}
            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
            title="حذف دوربین"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
