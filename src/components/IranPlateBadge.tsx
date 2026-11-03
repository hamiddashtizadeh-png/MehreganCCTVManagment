import React from 'react';
import { PlateDetails } from '../types/nvr';
import { toPersianDigits } from '../utils/cameraProtocols';

interface IranPlateBadgeProps {
  plateDetails: PlateDetails;
  size?: 'sm' | 'md' | 'lg';
}

export const IranPlateBadge: React.FC<IranPlateBadgeProps> = ({
  plateDetails,
  size = 'md',
}) => {
  const isIranNational =
    plateDetails.plateFormat === 'iran_national' ||
    plateDetails.plateFormat === 'iran_gov_taxi' ||
    Boolean(plateDetails.iranSegments);

  const isGov = plateDetails.iranSegments?.letter === 'الف';
  const isTaxi = plateDetails.iranSegments?.letter === 'ت' || plateDetails.iranSegments?.letter === 'ع';

  const bgMain = isGov
    ? 'bg-red-600 text-white'
    : isTaxi
    ? 'bg-amber-400 text-slate-950'
    : 'bg-white text-slate-950';

  const heightClass = size === 'sm' ? 'h-8 text-xs' : size === 'lg' ? 'h-12 text-lg' : 'h-10 text-sm';

  if (isIranNational && plateDetails.iranSegments) {
    const { twoDigits, letter, threeDigits, iranCode } = plateDetails.iranSegments;
    return (
      <div
        dir="ltr"
        className={`inline-flex items-stretch rounded-md border-2 border-slate-800 shadow-xs overflow-hidden font-mono-tabular select-none shrink-0 ${heightClass}`}
      >
        {/* Left Blue Flag Band */}
        <div className="bg-blue-700 text-white px-1.5 flex flex-col items-center justify-between py-0.5 text-[8px] leading-none font-sans">
          <div className="flex flex-col w-3.5 gap-[1px] mt-0.5">
            <span className="h-[2px] w-full bg-emerald-500 block" />
            <span className="h-[2px] w-full bg-white block" />
            <span className="h-[2px] w-full bg-red-500 block" />
          </div>
          <span className="font-bold tracking-tighter">I.R.</span>
          <span className="font-bold tracking-tighter">IRAN</span>
        </div>

        {/* Main Number Body */}
        <div className={`${bgMain} px-2.5 flex items-center gap-1.5 font-bold tracking-wider`}>
          <span>{toPersianDigits(twoDigits)}</span>
          <span className="font-sans px-0.5 text-base font-extrabold">{letter}</span>
          <span>{toPersianDigits(threeDigits)}</span>
        </div>

        {/* Right Iran Code Box */}
        <div
          className={`${bgMain} border-l-2 border-slate-800 px-2 flex flex-col items-center justify-center leading-none`}
        >
          <span className="text-[9px] font-sans font-semibold opacity-80 mb-0.5">ایران</span>
          <span className="font-extrabold">{toPersianDigits(iranCode)}</span>
        </div>
      </div>
    );
  }

  // International or Free Zone Plate
  return (
    <div
      dir="ltr"
      className={`inline-flex items-stretch rounded-md border-2 border-slate-800 bg-white text-slate-950 shadow-xs overflow-hidden font-mono-tabular select-none shrink-0 ${heightClass}`}
    >
      <div className="bg-blue-700 text-white px-1.5 flex flex-col items-center justify-center text-[9px] font-bold">
        <span>INTL</span>
      </div>
      <div className="px-3 flex items-center font-bold tracking-widest uppercase">
        {plateDetails.plateText}
      </div>
    </div>
  );
};
