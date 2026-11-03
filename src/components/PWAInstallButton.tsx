import React, { useState } from 'react';
import { Download, MonitorSmartphone, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../utils/pwa';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        onClick={handleInstallClick}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        title="نصب نسخه ویندوز و موبایل (PWA)"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>نصب ویندوز / موبایل</span>
      </button>

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl text-right">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <MonitorSmartphone className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  نصب مستقیم AriaVMS Pro روی ویندوز و موبایل
                </h3>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-slate-600 leading-relaxed">
              {isIOS ? (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <p className="font-semibold text-slate-900">راهنمای نصب در آیفون و آیپد (Safari):</p>
                  <p>۱. در نوار پایین مرورگر Safari روی دکمه <strong>Share (اشتراک‌گذاری)</strong> بزنید.</p>
                  <p>۲. گزینه <strong>Add to Home Screen (افزودن به صفحه اصلی)</strong> را انتخاب کنید.</p>
                </div>
              ) : (
                <>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>نصب روی ویندوز (Chrome / Edge):</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      در نوار آدرس مرورگر (سمت راست) روی آیکون <strong>Install AriaVMS Pro</strong> کلیک کنید تا برنامه به صورت مستقل در دسکتاپ و منوی Start ویندوز نصب شود.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>نصب روی موبایل اندروید:</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      از منوی سه نقطه مرورگر کروم گزینه <strong>Install App / افزودن به صفحه اصلی</strong> را انتخاب نمایید.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
