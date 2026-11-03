import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Sparkles,
  RefreshCw,
  Check,
  RotateCcw,
  Sun,
  Contrast,
  Eye,
  Cpu,
  ShieldAlert,
  ArrowLeft,
  CheckCircle2,
  Camera,
} from 'lucide-react';
import {
  AISceneOptimizationResult,
  CameraDevice,
  CameraISPSettings,
  InstallEnvironment,
} from '../types/nvr';
import {
  BRAND_METADATA,
   getDefaultISPSettings,
  INSTALL_ENVIRONMENT_LABELS,
  toPersianDigits,
} from '../utils/cameraProtocols';

interface CameraISPInspectorProps {
  cameras: CameraDevice[];
  selectedCameraId: string;
  onSelectCamera: (id: string) => void;
  onCameraUpdated: (updated: CameraDevice, message: string) => void;
  captureCameraFrameBase64: (cameraId: string) => string | undefined;
}

export const CameraISPInspector: React.FC<CameraISPInspectorProps> = ({
  cameras,
  selectedCameraId,
  onSelectCamera,
  onCameraUpdated,
  captureCameraFrameBase64,
}) => {
  const selectedCamera = cameras.find((c) => c.id === selectedCameraId) || cameras[0];

  const [draftSettings, setDraftSettings] = useState<CameraISPSettings>(
    selectedCamera?.ispSettings || getDefaultISPSettings('tiandy')
  );
  const [installEnv, setInstallEnv] = useState<InstallEnvironment>(
    selectedCamera?.installEnvironment || 'parking_entrance'
  );
  const [motionEnabled, setMotionEnabled] = useState<boolean>(
    selectedCamera?.motionDetectionEnabled ?? true
  );
  const [motionSensitivity, setMotionSensitivity] = useState<number>(
    selectedCamera?.motionSensitivity ?? 70
  );
  const [autoAnalyzeOnMotion, setAutoAnalyzeOnMotion] = useState<boolean>(
    selectedCamera?.autoAnalyzeOnMotion ?? true
  );
  const [autoSnapshotOnMotion, setAutoSnapshotOnMotion] = useState<boolean>(
    selectedCamera?.autoSnapshotOnMotion ?? true
  );

  const [isExtracting, setIsExtracting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<AISceneOptimizationResult | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  useEffect(() => {
    if (selectedCamera) {
      setDraftSettings(selectedCamera.ispSettings);
      setInstallEnv(selectedCamera.installEnvironment);
      setMotionEnabled(selectedCamera.motionDetectionEnabled);
      setMotionSensitivity(selectedCamera.motionSensitivity);
      setAutoAnalyzeOnMotion(selectedCamera.autoAnalyzeOnMotion);
      setAutoSnapshotOnMotion(selectedCamera.autoSnapshotOnMotion);
      setAiRecommendation(null);
    }
  }, [selectedCamera?.id]);

  if (!selectedCamera) {
    return (
      <div className="p-8 bg-white rounded-xl border border-slate-200 text-center">
        <p className="text-sm text-slate-600">هیچ دوربینی در سیستم ثبت نشده است.</p>
      </div>
    );
  }

  const updateField = <K extends keyof CameraISPSettings>(
    key: K,
    value: CameraISPSettings[K]
  ) => {
    setDraftSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleExtractFromCamera = async () => {
    setIsExtracting(true);
    setStatusBanner(null);
    try {
      const res = await fetch(`/api/camera/${selectedCamera.id}/settings/extract`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.ispSettings) {
        setDraftSettings(data.ispSettings);
        setStatusBanner(data.message);
      }
    } catch {
      setStatusBanner('خطا در بازخوانی تنظیمات از شبکه.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleApplySettings = async (settingsToApply: CameraISPSettings = draftSettings) => {
    setIsApplying(true);
    setStatusBanner(null);
    try {
      const res = await fetch(`/api/camera/${selectedCamera.id}/settings/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ispSettings: settingsToApply,
          installEnvironment: installEnv,
          motionDetectionEnabled: motionEnabled,
          motionSensitivity,
          autoAnalyzeOnMotion,
          autoSnapshotOnMotion,
        }),
      });
      const data = await res.json();
      if (res.ok && data.camera) {
        setDraftSettings(data.camera.ispSettings);
        onCameraUpdated(data.camera, data.message);
        setStatusBanner(data.message);
        setAiRecommendation(null);
      }
    } catch {
      setStatusBanner('خطا در اعمال تنظیمات روی دوربین.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleRunAIOptimization = async () => {
    setIsOptimizing(true);
    setStatusBanner(null);
    try {
      const frameBase64 = captureCameraFrameBase64(selectedCamera.id);
      const res = await fetch('/api/ai/optimize-isp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cameraId: selectedCamera.id,
          imageBase64: frameBase64,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'خطا در تحلیل هوشمند تصویر');
      }
      setAiRecommendation(data);
    } catch (err) {
      setStatusBanner(
        err instanceof Error ? err.message : 'خطا در دریافت پیشنهاد بهینه‌سازی تصویر'
      );
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleConfirmAIRecommendations = async () => {
    if (!aiRecommendation) return;
    const merged: CameraISPSettings = {
      ...draftSettings,
      ...(aiRecommendation.recommendedSettings as Partial<CameraISPSettings>),
    };
    setDraftSettings(merged);
    await handleApplySettings(merged);
  };

  return (
    <div className="space-y-6">
      {/* Top Camera Selector & Action Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              انتخاب دوربین جهت استخراج و ویرایش تنظیمات سخت‌افزاری (ISP)
            </label>
            <select
              value={selectedCamera.id}
              onChange={(e) => onSelectCamera(e.target.value)}
              className="px-3.5 py-2 text-sm font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.name} — [{BRAND_METADATA[cam.brand].label} | {cam.ipAddress}]
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs text-slate-500 space-y-1">
            <div>
              <span>پروتکل ارتباطی: </span>
              <span className="font-mono-tabular font-semibold text-slate-800">
                {BRAND_METADATA[selectedCamera.brand].protocolName}
              </span>
            </div>
            <div dir="ltr" className="font-mono-tabular text-[11px] text-slate-500 truncate max-w-md">
              API: {selectedCamera.endpoints.configApiEndpoint}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExtractFromCamera}
            disabled={isExtracting}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isExtracting ? 'animate-spin text-blue-600' : ''}`} />
            <span>استخراج مجدد از دوربین</span>
          </button>

          <button
            type="button"
            onClick={handleRunAIOptimization}
            disabled={isOptimizing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className={`w-4 h-4 ${isOptimizing ? 'animate-spin' : ''}`} />
            <span>
              {isOptimizing
                ? 'در حال تحلیل محیط نصب...'
                : 'تشخیص هوشمند بهترین تنظیمات محیط نصب'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleApplySettings(draftSettings)}
            disabled={isApplying}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{isApplying ? 'در حال ارسال به دوربین...' : 'اعمال دستی تغییرات روی دوربین'}</span>
          </button>
        </div>
      </div>

      {statusBanner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusBanner}</span>
          </div>
          <button
            onClick={() => setStatusBanner(null)}
            className="text-emerald-700 hover:underline text-xs"
          >
            بستن
          </button>
        </div>
      )}

      {/* AI Scene Optimization Confirmation Panel (When triggered) */}
      {aiRecommendation && (
        <div className="bg-white rounded-xl border-2 border-amber-500 p-6 space-y-5 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
                <Sparkles className="w-5 h-5" />
                <span>پیشنهاد هوش مصنوعی برای بهینه‌سازی تصویر با توجه به محل نصب</span>
              </div>
              <p className="text-xs text-slate-600">{aiRecommendation.detectedSceneCondition}</p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono-tabular">
              <div>
                <span className="text-slate-500 font-sans">کیفیت نور: </span>
                <span className="font-bold text-slate-900">
                  {toPersianDigits(aiRecommendation.lightingQualityScore)}%
                </span>
              </div>
              <span>·</span>
              <div>
                <span className="text-slate-500 font-sans">آمادگی پلاک‌خوان: </span>
                <span className="font-bold text-blue-700">
                  {toPersianDigits(aiRecommendation.anprReadinessScore)}%
                </span>
              </div>
              <span>·</span>
              <div>
                <span className="text-slate-500 font-sans">آمادگی تشخیص چهره: </span>
                <span className="font-bold text-emerald-700">
                  {toPersianDigits(aiRecommendation.faceReadinessScore)}%
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-700 leading-relaxed bg-amber-50/70 p-3.5 rounded-lg border border-amber-200">
            {aiRecommendation.summaryDiagnosis}
          </p>

          {/* Parameter comparison table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">پارامتر تصویر دوربین</th>
                  <th className="py-2.5 px-4 font-semibold">مقدار فعلی</th>
                  <th className="py-2.5 px-4 font-semibold">مقدار بهینه پیشنهادی</th>
                  <th className="py-2.5 px-4 font-semibold">علت فنی تغییر در این محل نصب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(aiRecommendation.parameterChanges || []).map((change, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 font-bold text-slate-900">
                      {change.parameterLabel}
                    </td>
                    <td className="py-2.5 px-4 font-mono-tabular text-slate-500">
                      {String(change.currentValue)}
                    </td>
                    <td className="py-2.5 px-4 font-mono-tabular font-bold text-emerald-700 flex items-center gap-1.5">
                      <ArrowLeft className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{String(change.recommendedValue)}</span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{change.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setAiRecommendation(null)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              رد پیشنهاد و حفظ تنظیمات فعلی
            </button>
            <button
              type="button"
              onClick={handleConfirmAIRecommendations}
              disabled={isApplying}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>تایید و اعمال بهترین تنظیمات روی دوربین</span>
            </button>
          </div>
        </div>
      )}

      {/* Main 3-Column Engineering Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Optical & Color Parameters */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">
                ۱. تنظیمات رنگ و روشنایی سنسور (Color & Optics)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setDraftSettings(getDefaultISPSettings(selectedCamera.brand))}
              className="text-[11px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>پیش‌فرض کارخانه</span>
            </button>
          </div>

          {[
            { key: 'brightness' as const, label: 'روشنایی تصویر (Brightness)', val: draftSettings.brightness },
            { key: 'contrast' as const, label: 'کنتراست (Contrast)', val: draftSettings.contrast },
            { key: 'saturation' as const, label: 'اشباع رنگ (Saturation)', val: draftSettings.saturation },
            { key: 'sharpness' as const, label: 'وضوح و تیزی لبه‌ها (Sharpness)', val: draftSettings.sharpness },
            { key: 'irLedStrength' as const, label: 'قدرت پروژکتور دید در شب (IR/Warm LED)', val: draftSettings.irLedStrength },
          ].map((item) => (
            <div key={item.key} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{item.label}</span>
                <span className="font-mono-tabular font-bold text-slate-900">
                  {toPersianDigits(item.val)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={item.val}
                onChange={(e) => updateField(item.key, Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>
          ))}

          <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2.5 text-xs">
            <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={draftSettings.mirror}
                onChange={(e) => updateField('mirror', e.target.checked)}
                className="rounded text-blue-600"
              />
              <span>قرینه افقی (Mirror)</span>
            </label>
            <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={draftSettings.flip}
                onChange={(e) => updateField('flip', e.target.checked)}
                className="rounded text-blue-600"
              />
              <span>چرخش عمودی (Flip)</span>
            </label>
          </div>
        </div>

        {/* Column 2: Exposure, WDR, HLC (ANPR) & Night Starlight */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Eye className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              ۲. ضدنور، شاتر پلاک‌خوان و دید در شب (WDR / HLC / Starlight)
            </h3>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              محل نصب و پروفایل نوری محیط
            </label>
            <select
              value={installEnv}
              onChange={(e) => setInstallEnv(e.target.value as InstallEnvironment)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            >
              {(Object.keys(INSTALL_ENVIRONMENT_LABELS) as InstallEnvironment[]).map((k) => (
                <option key={k} value={k}>
                  {INSTALL_ENVIRONMENT_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                سرعت شاتر (Shutter Speed)
              </label>
              <select
                value={draftSettings.shutterSpeed}
                onChange={(e) => updateField('shutterSpeed', e.target.value)}
                dir="ltr"
                className="w-full px-3 py-2 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg"
              >
                {['1/25', '1/50', '1/100', '1/250', '1/500', '1/1000', '1/2000'].map((s) => (
                  <option key={s} value={s}>
                    {s} sec
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                حالت شب و روز (Starlight/IR)
              </label>
              <select
                value={draftSettings.dayNightMode}
                onChange={(e) =>
                  updateField(
                    'dayNightMode',
                    e.target.value as CameraISPSettings['dayNightMode']
                  )
                }
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="starlight_fullcolor">رنگی ۲۴ ساعته (Tiandy Starlight / ColorVu)</option>
                <option value="auto">خودکار هوشمند (Auto ICR)</option>
                <option value="day_color">فقط روز (رنگی)</option>
                <option value="night_ir">فقط شب (مادون قرمز سیاه‌وسفید)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ضدنور هوشمند (True WDR)
              </label>
              <select
                value={draftSettings.wdrMode}
                onChange={(e) =>
                  updateField('wdrMode', e.target.value as CameraISPSettings['wdrMode'])
                }
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="off">خاموش (Off)</option>
                <option value="auto">خودکار (Auto WDR 120dB)</option>
                <option value="manual">دستی (Manual Level)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                حذف تابش چراغ خودرو (HLC پلاک‌خوان)
              </label>
              <select
                value={draftSettings.hlcMode}
                onChange={(e) =>
                  updateField('hlcMode', e.target.value as CameraISPSettings['hlcMode'])
                }
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="on">فعال (مخصوص خواندن پلاک در شب)</option>
                <option value="off">غیرفعال</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">سطح WDR و جبران نوری</span>
              <span className="font-mono-tabular font-bold text-slate-900">
                {toPersianDigits(draftSettings.wdrLevel)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={draftSettings.wdrLevel}
              onChange={(e) => updateField('wdrLevel', Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">کاهش نویز سه‌بعدی (3D DNR Level)</span>
              <span className="font-mono-tabular font-bold text-slate-900">
                {toPersianDigits(draftSettings.dnrLevel)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={draftSettings.dnrLevel}
              onChange={(e) => updateField('dnrLevel', Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
          </div>
        </div>

        {/* Column 3: Encoding (S+265 / H.265) & Motion Detection Settings */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Cpu className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              ۳. کدک فشرده‌سازی و تشخیص حرکت هوشمند (Motion & NVR)
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                کدک ویدیویی
              </label>
              <select
                value={draftSettings.codec}
                onChange={(e) =>
                  updateField('codec', e.target.value as CameraISPSettings['codec'])
                }
                dir="ltr"
                className="w-full px-3 py-2 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="H.265+ (S+265)">H.265+ (Tiandy S+265)</option>
                <option value="H.265">H.265 (HEVC)</option>
                <option value="H.264+">H.264+</option>
                <option value="H.264">H.264</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رزولوشن تصویر
              </label>
              <select
                value={draftSettings.resolution}
                onChange={(e) =>
                  updateField(
                    'resolution',
                    e.target.value as CameraISPSettings['resolution']
                  )
                }
                dir="ltr"
                className="w-full px-3 py-2 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="3840x2160 (4K)">3840x2160 (4K)</option>
                <option value="2560x1440 (2K)">2560x1440 (2K / 4MP)</option>
                <option value="1920x1080 (1080p)">1920x1080 (1080p)</option>
                <option value="1280x720 (720p)">1280x720 (720p)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                نرخ فریم (FPS)
              </label>
              <select
                value={draftSettings.fps}
                onChange={(e) => updateField('fps', Number(e.target.value))}
                dir="ltr"
                className="w-full px-3 py-2 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg"
              >
                {[15, 20, 25, 30, 50, 60].map((f) => (
                  <option key={f} value={f}>
                    {f} FPS
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                پهنای باند استریم (Bitrate)
              </label>
              <select
                value={draftSettings.bitrateKbps}
                onChange={(e) => updateField('bitrateKbps', Number(e.target.value))}
                dir="ltr"
                className="w-full px-3 py-2 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg"
              >
                {[1024, 2048, 4096, 6144, 8192].map((b) => (
                  <option key={b} value={b}>
                    {b} Kbps
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 space-y-3">
            <label className="flex items-center justify-between text-xs font-bold text-slate-900 cursor-pointer">
              <span>فعال‌سازی تشخیص حرکت (Motion Detection)</span>
              <input
                type="checkbox"
                checked={motionEnabled}
                onChange={(e) => setMotionEnabled(e.target.checked)}
                className="rounded text-blue-600 w-4 h-4"
              />
            </label>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">حساسیت سنسور حرکت</span>
                <span className="font-mono-tabular font-bold text-slate-900">
                  {toPersianDigits(motionSensitivity)}%
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                disabled={!motionEnabled}
                value={motionSensitivity}
                onChange={(e) => setMotionSensitivity(Number(e.target.value))}
                className="w-full accent-amber-600 cursor-pointer"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSnapshotOnMotion}
                onChange={(e) => setAutoSnapshotOnMotion(e.target.checked)}
                className="rounded text-blue-600"
              />
              <span>ذخیره خودکار تصویر (Snapshot) به محض تشخیص حرکت</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoAnalyzeOnMotion}
                onChange={(e) => setAutoAnalyzeOnMotion(e.target.checked)}
                className="rounded text-blue-600"
              />
              <span>ارسال خودکار به پلاک‌خوان و تشخیص چهره هنگام حرکت</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
