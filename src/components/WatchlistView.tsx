import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Plus,
  Trash2,
  Bell,
  Car,
  UserCheck,
} from 'lucide-react';
import { WatchlistEntry } from '../types/nvr';
import {
  formatIranPlateString,
  IRAN_PLATE_LETTERS,
  toPersianDigits,
} from '../utils/cameraProtocols';
import { IranPlateBadge } from './IranPlateBadge';

interface WatchlistViewProps {
  watchlist: WatchlistEntry[];
  onAddEntry: (entry: Partial<WatchlistEntry>) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
}

export const WatchlistView: React.FC<WatchlistViewProps> = ({
  watchlist,
  onAddEntry,
  onDeleteEntry,
}) => {
  const [type, setType] = useState<'plate' | 'face'>('plate');
  const [listType, setListType] = useState<'vip' | 'blacklist'>('vip');
  const [plateFormatMode, setPlateFormatMode] = useState<'iran' | 'intl'>('iran');

  // Iran plate inputs
  const [twoDigits, setTwoDigits] = useState('۴۵');
  const [letter, setLetter] = useState('ب');
  const [threeDigits, setThreeDigits] = useState('۷۸۱');
  const [iranCode, setIranCode] = useState('۱۱');

  // International plate or Person Name input
  const [customIdentifier, setCustomIdentifier] = useState('');
  const [roleOrDepartment, setRoleOrDepartment] = useState('');
  const [notes, setNotes] = useState('');
  const [soundAlert, setSoundAlert] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const isIranPlate = type === 'plate' && plateFormatMode === 'iran';
      const iranSegments = isIranPlate
        ? {
            twoDigits: toPersianDigits(twoDigits),
            letter,
            threeDigits: toPersianDigits(threeDigits),
            iranCode: toPersianDigits(iranCode),
          }
        : undefined;

      const identifier = isIranPlate
        ? formatIranPlateString(iranSegments!)
        : customIdentifier.trim();

      if (!identifier) return;

      await onAddEntry({
        type,
        listType,
        identifier,
        iranSegments,
        roleOrDepartment: roleOrDepartment || (listType === 'vip' ? 'پرسنل مجاز' : 'لیست سیاه حراست'),
        notes,
        soundAlert,
      });

      setCustomIdentifier('');
      setRoleOrDepartment('');
      setNotes('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Form: Add New VIP / Blacklist Item */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 h-fit">
        <div className="pb-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">
            ثبت پلاک یا چهره در لیست مجاز (VIP) و لیست سیاه
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            تطبیق خودکار لحظه‌ای با تمام دوربین‌های شبکه و صدور هشدار صوتی
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setType('plate')}
              className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md cursor-pointer ${
                type === 'plate' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Car className="w-3.5 h-3.5 text-blue-600" />
              <span>پلاک خودرو</span>
            </button>
            <button
              type="button"
              onClick={() => setType('face')}
              className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md cursor-pointer ${
                type === 'face' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>چهره شخص</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setListType('vip');
                setSoundAlert(false);
              }}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                listType === 'vip'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>لیست مجاز (VIP)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setListType('blacklist');
                setSoundAlert(true);
              }}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                listType === 'blacklist'
                  ? 'border-red-600 bg-red-50 text-red-800'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-red-600" />
              <span>لیست سیاه (غیرمجاز)</span>
            </button>
          </div>

          {type === 'plate' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={plateFormatMode === 'iran'}
                    onChange={() => setPlateFormatMode('iran')}
                  />
                  <span>پلاک ملی ایران</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={plateFormatMode === 'intl'}
                    onChange={() => setPlateFormatMode('intl')}
                  />
                  <span>پلاک بین‌المللی / منطقه آزاد</span>
                </label>
              </div>

              {plateFormatMode === 'iran' ? (
                <div
                  dir="ltr"
                  className="flex items-center justify-between gap-1.5 p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                >
                  <span className="text-[10px] font-bold text-blue-700">IR</span>
                  <input
                    type="text"
                    maxLength={2}
                    required
                    value={twoDigits}
                    onChange={(e) => setTwoDigits(e.target.value)}
                    className="w-12 text-center py-1.5 text-xs font-mono-tabular font-bold bg-white border border-slate-300 rounded"
                  />
                  <select
                    value={letter}
                    onChange={(e) => setLetter(e.target.value)}
                    className="py-1.5 px-2 text-xs font-bold bg-white border border-slate-300 rounded"
                  >
                    {IRAN_PLATE_LETTERS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    maxLength={3}
                    required
                    value={threeDigits}
                    onChange={(e) => setThreeDigits(e.target.value)}
                    className="w-16 text-center py-1.5 text-xs font-mono-tabular font-bold bg-white border border-slate-300 rounded"
                  />
                  <span className="text-slate-400">-</span>
                  <input
                    type="text"
                    maxLength={2}
                    required
                    value={iranCode}
                    onChange={(e) => setIranCode(e.target.value)}
                    className="w-12 text-center py-1.5 text-xs font-mono-tabular font-bold bg-white border border-slate-300 rounded"
                  />
                </div>
              ) : (
                <input
                  type="text"
                  dir="ltr"
                  required
                  value={customIdentifier}
                  onChange={(e) => setCustomIdentifier(e.target.value)}
                  placeholder="TR-34-AB-8921"
                  className="w-full px-3 py-2 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg"
                />
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                نام و نام خانوادگی شخص
              </label>
              <input
                type="text"
                required
                value={customIdentifier}
                onChange={(e) => setCustomIdentifier(e.target.value)}
                placeholder="مثال: مهندس امیرحسین رضایی"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              واحد سازمانی / سمت / برچسب
            </label>
            <input
              type="text"
              value={roleOrDepartment}
              onChange={(e) => setRoleOrDepartment(e.target.value)}
              placeholder="مثال: مدیریت، حراست، خودروی توقیفی..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              توضیحات و دستورالعمل انتظامات
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: بازگشایی خودکار راهبند / اعلام هشدار فوری"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={soundAlert}
              onChange={(e) => setSoundAlert(e.target.checked)}
              className="rounded text-blue-600"
            />
            <Bell className="w-3.5 h-3.5 text-amber-600" />
            <span>پخش آژیر هشدار صوتی به محض رویت در دوربین‌ها</span>
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن به فهرست نظارتی هوشمند</span>
          </button>
        </form>
      </div>

      {/* Right Table: Active Watchlist Entries */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            فهرست فعال پلاک‌ها و چهره‌های تحت نظارت ({toPersianDigits(watchlist.length)} مورد)
          </h3>
        </div>

        <div className="divide-y divide-slate-200">
          {watchlist.map((item) => (
            <div
              key={item.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-3 flex-wrap">
                  {item.type === 'plate' ? (
                    <IranPlateBadge
                      plateDetails={{
                        plateText: item.identifier,
                        plateFormat: item.iranSegments ? 'iran_national' : 'international',
                        iranSegments: item.iranSegments,
                        countryOrRegion: 'ایران',
                        vehicleType: '',
                        vehicleColor: '',
                        confidence: 100,
                      }}
                      size="sm"
                    />
                  ) : (
                    <span className="text-sm font-bold text-slate-900">{item.identifier}</span>
                  )}

                  <span className="text-slate-300">·</span>
                  <span
                    className={`text-xs font-bold ${
                      item.listType === 'blacklist' ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {item.listType === 'blacklist'
                      ? 'لیست سیاه (غیرمجاز - هشدار فوری)'
                      : 'لیست سفید مجاز (VIP)'}
                  </span>
                </div>

                <div className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">{item.roleOrDepartment}</span>
                  {item.notes && <span> — {item.notes}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                {item.soundAlert && (
                  <span className="text-[11px] text-amber-700 flex items-center gap-1">
                    <Bell className="w-3.5 h-3.5" />
                    <span>آژیر فعال</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onDeleteEntry(item.id)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title="حذف از لیست"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
