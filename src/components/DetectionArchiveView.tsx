import React, { useState, useMemo, useRef } from 'react';
import {
  Search,
  Calendar,
  Clock,
  FileSpreadsheet,
  Printer,
  Upload,
  Trash2,
  Eye,
  X,
  UserCheck,
  Car,
  Activity,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { CameraDevice, DetectionRecord } from '../types/nvr';
import {
  IRAN_PLATE_LETTERS,
  normalizePlateForSearch,
  toEnglishDigits,
  toPersianDigits,
} from '../utils/cameraProtocols';
import { IranPlateBadge } from './IranPlateBadge';

interface DetectionArchiveViewProps {
  detections: DetectionRecord[];
  cameras: CameraDevice[];
  initialTypeFilter?: 'all' | 'plate' | 'face' | 'motion';
  onAnalyzeUploadedImage: (
    cameraId: string,
    imageBase64: string,
    mode: 'both' | 'plate' | 'face'
  ) => Promise<void>;
  onDeleteRecord: (id: string) => void;
  isAnalyzingUpload: boolean;
}

export const DetectionArchiveView: React.FC<DetectionArchiveViewProps> = ({
  detections,
  cameras,
  initialTypeFilter = 'all',
  onAnalyzeUploadedImage,
  onDeleteRecord,
  isAnalyzingUpload,
}) => {
  const [typeFilter, setTypeFilter] = useState<'all' | 'plate' | 'face' | 'motion'>(
    initialTypeFilter
  );
  const [cameraFilter, setCameraFilter] = useState<string>('all');
  const [watchlistFilter, setWatchlistFilter] = useState<'all' | 'normal' | 'vip' | 'blacklist'>(
    'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');

  // Structured Iranian Plate Filter
  const [platePart1, setPlatePart1] = useState('');
  const [plateLetter, setPlateLetter] = useState('');
  const [platePart2, setPlatePart2] = useState('');
  const [plateIranCode, setPlateIranCode] = useState('');

  const [selectedRecord, setSelectedRecord] = useState<DetectionRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadCameraId, setUploadCameraId] = useState<string>(cameras[0]?.id || '');

  const filteredDetections = useMemo(() => {
    return detections.filter((rec) => {
      if (typeFilter !== 'all' && rec.type !== typeFilter) return false;
      if (cameraFilter !== 'all' && rec.cameraId !== cameraFilter) return false;
      if (watchlistFilter !== 'all' && rec.watchlistStatus !== watchlistFilter) return false;

      // Date range filter (ISO YYYY-MM-DD or Jalali substring match)
      if (dateFrom) {
        const recDateIso = rec.timestampIso.slice(0, 10);
        if (recDateIso < dateFrom && !rec.jalaliDate.includes(dateFrom)) return false;
      }
      if (dateTo) {
        const recDateIso = rec.timestampIso.slice(0, 10);
        if (recDateIso > dateTo && !rec.jalaliDate.includes(dateTo)) return false;
      }

      // Time range filter (HH:MM)
      if (timeFrom || timeTo) {
        const engRecTime = toEnglishDigits(rec.timeString).slice(0, 5);
        if (timeFrom && engRecTime < timeFrom) return false;
        if (timeTo && engRecTime > timeTo) return false;
      }

      // Structured Iranian Plate Segments Filter
      if (platePart1 || plateLetter || platePart2 || plateIranCode) {
        if (rec.type !== 'plate' || !rec.plateDetails) return false;
        const seg = rec.plateDetails.iranSegments;
        if (!seg) return false;
        if (
          platePart1 &&
          !toEnglishDigits(seg.twoDigits).includes(toEnglishDigits(platePart1))
        ) {
          return false;
        }
        if (plateLetter && seg.letter !== plateLetter) {
          return false;
        }
        if (
          platePart2 &&
          !toEnglishDigits(seg.threeDigits).includes(toEnglishDigits(platePart2))
        ) {
          return false;
        }
        if (
          plateIranCode &&
          !toEnglishDigits(seg.iranCode).includes(toEnglishDigits(plateIranCode))
        ) {
          return false;
        }
      }

      // General Search Query (Plate text, Vehicle type, Face name, attributes, Camera name)
      if (searchQuery.trim()) {
        const q = toEnglishDigits(searchQuery.trim()).toLowerCase();
        const normQ = normalizePlateForSearch(searchQuery);

        const plateMatch =
          rec.plateDetails &&
          (normalizePlateForSearch(rec.plateDetails.plateText).includes(normQ) ||
            rec.plateDetails.vehicleType.toLowerCase().includes(q) ||
            rec.plateDetails.vehicleColor.toLowerCase().includes(q) ||
            rec.plateDetails.countryOrRegion.toLowerCase().includes(q));

        const faceMatch =
          rec.faceDetails &&
          (rec.faceDetails.personName.toLowerCase().includes(q) ||
            rec.faceDetails.gender.toLowerCase().includes(q) ||
            rec.faceDetails.ageRange.toLowerCase().includes(q) ||
            rec.faceDetails.attributes.some((a) => a.toLowerCase().includes(q)));

        const camMatch =
          rec.cameraName.toLowerCase().includes(q) ||
          rec.cameraLocation.toLowerCase().includes(q) ||
          toEnglishDigits(rec.jalaliDate).includes(q);

        if (!plateMatch && !faceMatch && !camMatch) return false;
      }

      return true;
    });
  }, [
    detections,
    typeFilter,
    cameraFilter,
    watchlistFilter,
    dateFrom,
    dateTo,
    timeFrom,
    timeTo,
    platePart1,
    plateLetter,
    platePart2,
    plateIranCode,
    searchQuery,
  ]);

  const handleResetFilters = () => {
    setTypeFilter('all');
    setCameraFilter('all');
    setWatchlistFilter('all');
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setTimeFrom('');
    setTimeTo('');
    setPlatePart1('');
    setPlateLetter('');
    setPlatePart2('');
    setPlateIranCode('');
  };

  const handleExportCSV = () => {
    const headers = [
      'شناسه',
      'نوع رویداد',
      'نام دوربین',
      'محل نصب',
      'تاریخ شمسی',
      'ساعت',
      'شماره پلاک / نام چهره',
      'مشخصات تکمیلی (خودرو / ویژگی چهره)',
      'وضعیت لیست نظارتی',
      'درصد اطمینان',
    ];

    const rows = filteredDetections.map((rec) => {
      const typeLabel =
        rec.type === 'plate' ? 'پلاک خودرو' : rec.type === 'face' ? 'تشخیص چهره' : 'تشخیص حرکت';
      const identifier =
        rec.type === 'plate'
          ? rec.plateDetails?.plateText || ''
          : rec.type === 'face'
          ? rec.faceDetails?.personName || ''
          : 'حرکت در صحنه';
      const details =
        rec.type === 'plate'
          ? `${rec.plateDetails?.vehicleType || ''} - ${rec.plateDetails?.vehicleColor || ''} (${rec.plateDetails?.countryOrRegion || ''})`
          : rec.type === 'face'
          ? `${rec.faceDetails?.gender || ''} | ${rec.faceDetails?.ageRange || ''} | ${(rec.faceDetails?.attributes || []).join('، ')}`
          : `امتیاز حرکت: ${rec.motionScore || 100}%`;
      const wlLabel =
        rec.watchlistStatus === 'blacklist'
          ? 'لیست سیاه (غیرمجاز)'
          : rec.watchlistStatus === 'vip'
          ? 'مجاز (VIP)'
          : 'عادی';
      const conf =
        rec.plateDetails?.confidence || rec.faceDetails?.confidence || rec.motionScore || 100;

      return [
        rec.id,
        typeLabel,
        rec.cameraName,
        rec.cameraLocation,
        rec.jalaliDate,
        rec.timeString,
        identifier,
        details,
        wlLabel,
        `${conf}%`,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AriaVMS-Report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintPDF = () => {
    window.print();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        await onAnalyzeUploadedImage(
          uploadCameraId || cameras[0]?.id || 'cam-tiandy-main',
          reader.result,
          'both'
        );
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Top Action & Upload Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            بانک جامع تصاویر، پلاک خودروها و چهره‌های شناسایی‌شده
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            جستجوی پیشرفته بر اساس تاریخ، ساعت، شماره پلاک (ملی و بین‌المللی)، چهره و دوربین به همراه خروجی اکسل و PDF
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <select
            value={uploadCameraId}
            onChange={(e) => setUploadCameraId(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            title="انتخاب دوربین مبدا برای ثبت تصویر"
          >
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                ثبت روی: {c.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={isAnalyzingUpload}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isAnalyzingUpload ? (
              <Sparkles className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span>
              {isAnalyzingUpload
                ? 'در حال تشخیص چهره و پلاک...'
                : 'آپلود تصویر جهت تشخیص هوشمند چهره و پلاک'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>خروجی اکسل (Excel CSV)</span>
          </button>

          <button
            type="button"
            onClick={handlePrintPDF}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span>چاپ / گزارش PDF</span>
          </button>
        </div>
      </div>

      {/* Multi-Facet Search & Filter Panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          {/* Interactive Type Segmented Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {[
              { id: 'all' as const, label: 'همه رویدادها', icon: null },
              { id: 'plate' as const, label: 'پلاک خودروها', icon: Car },
              { id: 'face' as const, label: 'چهره افراد', icon: UserCheck },
              { id: 'motion' as const, label: 'تشخیص حرکت', icon: Activity },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTypeFilter(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    typeFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5 text-blue-600" />}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>
              تعداد نتایج یافت‌شده:{' '}
              <strong className="font-mono-tabular text-slate-900">
                {toPersianDigits(filteredDetections.length)}
              </strong>{' '}
              مورد
            </span>
            <span>·</span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-blue-600 hover:underline font-medium cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>پاک کردن فیلترها</span>
            </button>
          </div>
        </div>

        {/* Row 1: General Search, Camera, Watchlist, Date & Time Range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              جستجوی متنی (شماره پلاک، نام شخص، مدل خودرو، ویژگی چهره)
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="مثال: ۴۵ ب ۷۸۱، پژو، رضایی، عینک، TR-34..."
                className="w-full pr-9 pl-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              فیلتر دوربین
            </label>
            <select
              value={cameraFilter}
              onChange={(e) => setCameraFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            >
              <option value="all">تمام دوربین‌های شبکه</option>
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              وضعیت لیست نظارتی
            </label>
            <select
              value={watchlistFilter}
              onChange={(e) =>
                setWatchlistFilter(
                  e.target.value as 'all' | 'normal' | 'vip' | 'blacklist'
                )
              }
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="vip">فقط مجاز (VIP)</option>
              <option value="blacklist">فقط لیست سیاه (غیرمجاز)</option>
              <option value="normal">تردد عادی</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              بازه تاریخ (از / تا)
            </label>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-1/2 px-2 py-2 text-[11px] font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-1/2 px-2 py-2 text-[11px] font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              بازه ساعت (از / تا)
            </label>
            <div className="flex items-center gap-1" dir="ltr">
              <input
                type="time"
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.target.value)}
                className="w-1/2 px-2 py-2 text-[11px] font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg"
              />
              <input
                type="time"
                value={timeTo}
                onChange={(e) => setTimeTo(e.target.value)}
                className="w-1/2 px-2 py-2 text-[11px] font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Row 2: Dedicated Iranian License Plate Segment Search */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-xs font-semibold text-slate-700">
            جستجوی جزء‌به‌جزء پلاک ملی ایران:
          </span>
          <div
            dir="ltr"
            className="inline-flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300"
          >
            <span className="text-[11px] font-bold text-blue-700 px-1">I.R. IRAN</span>
            <input
              type="text"
              maxLength={2}
              value={platePart1}
              onChange={(e) => setPlatePart1(e.target.value)}
              placeholder="45"
              className="w-12 text-center py-1 text-xs font-mono-tabular font-bold bg-white border border-slate-300 rounded"
            />
            <select
              value={plateLetter}
              onChange={(e) => setPlateLetter(e.target.value)}
              className="py-1 px-2 text-xs font-bold bg-white border border-slate-300 rounded"
            >
              <option value="">همه حروف</option>
              {IRAN_PLATE_LETTERS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <input
              type="text"
              maxLength={3}
              value={platePart2}
              onChange={(e) => setPlatePart2(e.target.value)}
              placeholder="781"
              className="w-16 text-center py-1 text-xs font-mono-tabular font-bold bg-white border border-slate-300 rounded"
            />
            <span className="text-slate-400">|</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500">ایران</span>
              <input
                type="text"
                maxLength={2}
                value={plateIranCode}
                onChange={(e) => setPlateIranCode(e.target.value)}
                placeholder="11"
                className="w-12 text-center py-1 text-xs font-mono-tabular font-bold bg-white border border-slate-300 rounded"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filteredDetections.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-bold text-slate-800">
              هیچ رکوردی مطابق با فیلترهای جستجو یافت نشد
            </p>
            <p className="text-xs text-slate-500">
              می‌توانید در نمای زنده دوربین‌ها روی دکمه «ثبت و تشخیص چهره/پلاک» کلیک کنید یا تصویری را از بالا آپلود نمایید.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-semibold">تصویر ثبت‌شده</th>
                  <th className="py-3 px-4 font-semibold">نوع رویداد</th>
                  <th className="py-3 px-4 font-semibold">پلاک خودرو / مشخصات چهره</th>
                  <th className="py-3 px-4 font-semibold">جزئیات تکمیلی</th>
                  <th className="py-3 px-4 font-semibold">دوربین و محل</th>
                  <th className="py-3 px-4 font-semibold">تاریخ و ساعت</th>
                  <th className="py-3 px-4 font-semibold">وضعیت نظارتی</th>
                  <th className="py-3 px-4 font-semibold text-left no-print">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredDetections.map((rec) => (
                  <tr
                    key={rec.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      rec.watchlistStatus === 'blacklist' ? 'bg-red-50/40' : ''
                    }`}
                  >
                    <td className="py-2.5 px-4">
                      <div
                        onClick={() => setSelectedRecord(rec)}
                        className="w-20 h-12 rounded-lg bg-slate-900 border border-slate-200 overflow-hidden cursor-pointer relative group"
                      >
                        {rec.croppedImageDataUrl || rec.fullSnapshotDataUrl ? (
                          <img
                            src={rec.croppedImageDataUrl || rec.fullSnapshotDataUrl}
                            alt={rec.cameraName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                            بدون تصویر
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                      {rec.type === 'plate'
                        ? 'پلاک خودرو (ANPR)'
                        : rec.type === 'face'
                        ? 'تشخیص چهره (Face)'
                        : 'تشخیص حرکت (Motion)'}
                    </td>

                    <td className="py-2.5 px-4">
                      {rec.type === 'plate' && rec.plateDetails ? (
                        <IranPlateBadge plateDetails={rec.plateDetails} size="sm" />
                      ) : rec.type === 'face' && rec.faceDetails ? (
                        <div className="font-bold text-slate-900">{rec.faceDetails.personName}</div>
                      ) : (
                        <span className="text-slate-600">ذخیره خودکار تشخیص حرکت</span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-slate-600">
                      {rec.type === 'plate' && rec.plateDetails ? (
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="font-semibold text-slate-800">
                            {rec.plateDetails.vehicleType}
                          </span>
                          <span>·</span>
                          <span>{rec.plateDetails.vehicleColor}</span>
                          <span>·</span>
                          <span className="font-mono-tabular">
                            دقت {toPersianDigits(rec.plateDetails.confidence)}%
                          </span>
                        </div>
                      ) : rec.type === 'face' && rec.faceDetails ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{rec.faceDetails.gender}</span>
                          <span>·</span>
                          <span>{rec.faceDetails.ageRange}</span>
                          <span>·</span>
                          <span>{rec.faceDetails.attributes.join('، ')}</span>
                        </div>
                      ) : (
                        <span className="font-mono-tabular">
                          شدت حرکت: {toPersianDigits(rec.motionScore || 85)}%
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-900">{rec.cameraName}</div>
                      <div className="text-[11px] text-slate-500">{rec.cameraLocation}</div>
                    </td>

                    <td className="py-2.5 px-4 font-mono-tabular whitespace-nowrap">
                      <div className="font-bold text-slate-900 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{rec.jalaliDate}</span>
                      </div>
                      <div className="text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{rec.timeString}</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {rec.watchlistStatus === 'blacklist' ? (
                        <span className="font-bold text-red-600">
                          هشدار لیست سیاه (غیرمجاز)
                        </span>
                      ) : rec.watchlistStatus === 'vip' ? (
                        <span className="font-bold text-emerald-700">تردد مجاز (VIP)</span>
                      ) : (
                        <span className="text-slate-500">تردد عادی</span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-left whitespace-nowrap no-print">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedRecord(rec)}
                          className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="مشاهده تصویر کامل و جزئیات"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRecord(rec.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="حذف رکورد"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Full Snapshot Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  جزئیات کامل رویداد ثبت‌شده — {selectedRecord.cameraName}
                </h3>
                <p className="text-xs text-slate-500 font-mono-tabular mt-0.5">
                  {selectedRecord.jalaliDate} · ساعت {selectedRecord.timeString}
                </p>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-xl overflow-hidden bg-slate-950 border border-slate-200 max-h-80 flex items-center justify-center">
                {selectedRecord.fullSnapshotDataUrl ? (
                  <img
                    src={selectedRecord.fullSnapshotDataUrl}
                    alt="Full Surveillance Frame"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain max-h-80"
                  />
                ) : (
                  <div className="p-12 text-xs text-slate-400">تصویر ذخیره نشده است</div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div className="space-y-2">
                  <div>
                    <span className="text-slate-500">دوربین ثبت‌کننده: </span>
                    <span className="font-bold text-slate-900">{selectedRecord.cameraName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">موقعیت: </span>
                    <span className="font-medium text-slate-800">
                      {selectedRecord.cameraLocation}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">وضعیت امنیتی: </span>
                    <span
                      className={`font-bold ${
                        selectedRecord.watchlistStatus === 'blacklist'
                          ? 'text-red-600'
                          : selectedRecord.watchlistStatus === 'vip'
                          ? 'text-emerald-700'
                          : 'text-slate-800'
                      }`}
                    >
                      {selectedRecord.watchlistStatus === 'blacklist'
                        ? 'لیست سیاه (غیرمجاز)'
                        : selectedRecord.watchlistStatus === 'vip'
                        ? 'مجاز (VIP)'
                        : 'عادی'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {selectedRecord.plateDetails && (
                    <>
                      <div className="mb-2">
                        <IranPlateBadge plateDetails={selectedRecord.plateDetails} size="md" />
                      </div>
                      <div>
                        <span className="text-slate-500">خودرو: </span>
                        <span className="font-bold text-slate-900">
                          {selectedRecord.plateDetails.vehicleType} ({selectedRecord.plateDetails.vehicleColor})
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">منطقه پلاک: </span>
                        <span className="font-medium text-slate-800">
                          {selectedRecord.plateDetails.countryOrRegion}
                        </span>
                      </div>
                    </>
                  )}

                  {selectedRecord.faceDetails && (
                    <>
                      <div>
                        <span className="text-slate-500">نام شخص: </span>
                        <span className="font-bold text-slate-900">
                          {selectedRecord.faceDetails.personName}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">جنسیت و رده سنی: </span>
                        <span className="font-medium text-slate-800">
                          {selectedRecord.faceDetails.gender} · {selectedRecord.faceDetails.ageRange}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">مشخصات ظاهری: </span>
                        <span className="font-medium text-slate-800">
                          {selectedRecord.faceDetails.attributes.join('، ')}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
