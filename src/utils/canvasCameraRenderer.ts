import { CameraDevice, FaceDetails, PlateDetails } from '../types/nvr';
import { formatJalaliDateTime, toPersianDigits } from './cameraProtocols';

export interface SimulatedSubject {
  plates: PlateDetails[];
  faces: FaceDetails[];
}

const SAMPLE_PLATES: PlateDetails[] = [
  {
    plateText: '۴۵ ب ۷۸۱ - ایران ۱۱',
    plateFormat: 'iran_national',
    iranSegments: { twoDigits: '۴۵', letter: 'ب', threeDigits: '۷۸۱', iranCode: '۱۱' },
    countryOrRegion: 'ایران - تهران (۱۱)',
    vehicleType: 'پژو ۲۰۷ اتوماتیک',
    vehicleColor: 'سفید',
    confidence: 98,
  },
  {
    plateText: '۷۲ ج ۳۱۹ - ایران ۶۸',
    plateFormat: 'iran_national',
    iranSegments: { twoDigits: '۷۲', letter: 'ج', threeDigits: '۳۱۹', iranCode: '۶۸' },
    countryOrRegion: 'ایران - البرز (۶۸)',
    vehicleType: 'سمند سورن پلاس',
    vehicleColor: 'مشکی متالیک',
    confidence: 96,
  },
  {
    plateText: '۱۸ ص ۶۴۲ - ایران ۲۲',
    plateFormat: 'iran_national',
    iranSegments: { twoDigits: '۱۸', letter: 'ص', threeDigits: '۶۴۲', iranCode: '۲۲' },
    countryOrRegion: 'ایران - تهران (۲۲)',
    vehicleType: 'کی‌ام‌سی T8',
    vehicleColor: 'خاکستری',
    confidence: 97,
  },
  {
    plateText: '۶۴ الف ۱۲۸ - ایران ۱۱',
    plateFormat: 'iran_gov_taxi',
    iranSegments: { twoDigits: '۶۴', letter: 'الف', threeDigits: '۱۲۸', iranCode: '۱۱' },
    countryOrRegion: 'ایران - پلاک دولتی (۱۱)',
    vehicleType: 'دنا پلاس توربو',
    vehicleColor: 'نقره‌ای',
    confidence: 99,
  },
  {
    plateText: 'TR-34-AB-8921',
    plateFormat: 'international',
    countryOrRegion: 'پلاک بین‌المللی ترانزیت (TR)',
    vehicleType: 'کشنده ولوو FH500',
    vehicleColor: 'آبی',
    confidence: 95,
  },
];

const SAMPLE_FACES: FaceDetails[] = [
  {
    personName: 'مهندس امیرحسین رضایی',
    gender: 'مرد',
    ageRange: '۳۲ تا ۳۸ سال',
    attributes: ['عینک طبی', 'محاسن مرتب', 'پوشش رسمی'],
    expression: 'عادی',
    confidence: 97,
  },
  {
    personName: 'سارا محمدی (مراجعه‌کننده)',
    gender: 'زن',
    ageRange: '۲۶ تا ۳۲ سال',
    attributes: ['مانتو اداری', 'بدون عینک'],
    expression: 'لبخند ملایم',
    confidence: 95,
  },
  {
    personName: 'مهدی کاظمی (اپراتور فنی)',
    gender: 'مرد',
    ageRange: '۲۸ تا ۳۴ سال',
    attributes: ['لباس کار مهندسی', 'کلاه ایمنی'],
    expression: 'متمرکز',
    confidence: 96,
  },
];

export function getActiveSimulatedSubject(camera: CameraDevice, tick: number): SimulatedSubject {
  const plateIndex = Math.floor(tick / 120 + camera.id.length) % SAMPLE_PLATES.length;
  const faceIndex = Math.floor(tick / 140 + camera.channel) % SAMPLE_FACES.length;

  return {
    plates: [SAMPLE_PLATES[plateIndex]],
    faces: [SAMPLE_FACES[faceIndex]],
  };
}

/**
 * Renders a camera frame onto the target HTMLCanvasElement with real-time ISP filters applied
 * (Brightness, Contrast, Saturation, WDR, HLC, Starlight/IR Night Mode, Mirror/Flip, OSD).
 */
export function renderCameraCanvasFrame(params: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  camera: CameraDevice;
  tick: number;
  externalSource?: HTMLVideoElement | HTMLImageElement | null;
  ptzOffset?: { pan: number; tilt: number; zoom: number };
  motionActive?: boolean;
}) {
  const {
    ctx,
    width,
    height,
    camera,
    tick,
    externalSource,
    ptzOffset = { pan: 0, tilt: 0, zoom: 1 },
    motionActive = false,
  } = params;

  const isp = camera.ispSettings;

  ctx.save();

  // Compute CSS filter string from camera ISP parameters
  const bFactor = Math.max(0.35, Math.min(1.85, isp.brightness / 50));
  const cFactor = Math.max(0.45, Math.min(1.9, isp.contrast / 50));
  let sFactor = Math.max(0, Math.min(2.2, isp.saturation / 50));

  if (isp.dayNightMode === 'night_ir') {
    sFactor = 0; // Monochrome IR mode
  } else if (isp.dayNightMode === 'starlight_fullcolor') {
    sFactor = Math.max(1.15, sFactor * 1.15); // Tiandy Starlight warm full-color boost
  }

  ctx.filter = `brightness(${bFactor.toFixed(2)}) contrast(${cFactor.toFixed(2)}) saturate(${sFactor.toFixed(2)})`;

  // Apply Mirror / Flip / PTZ Zoom & Pan
  ctx.translate(width / 2, height / 2);
  const scaleX = (isp.mirror ? -1 : 1) * ptzOffset.zoom;
  const scaleY = (isp.flip ? -1 : 1) * ptzOffset.zoom;
  ctx.scale(scaleX, scaleY);
  ctx.translate(-width / 2 + ptzOffset.pan, -height / 2 + ptzOffset.tilt);

  if (externalSource) {
    try {
      ctx.drawImage(externalSource, 0, 0, width, height);
    } catch {
      drawHighDetailSurveillanceScene(ctx, width, height, camera, tick);
    }
  } else {
    drawHighDetailSurveillanceScene(ctx, width, height, camera, tick);
  }

  // WDR / HLC optical overlays
  if (isp.wdrMode !== 'off') {
    const wdrAlpha = (isp.wdrLevel / 100) * 0.14;
    ctx.fillStyle = `rgba(56, 189, 248, ${wdrAlpha})`;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.restore();

  // OSD Overlay (Camera Name, Brand, Codec, Timestamp, Detection Boxes)
  if (isp.osdOverlay) {
    drawOSDOverlay(ctx, width, height, camera, tick, motionActive);
  }
}

function drawHighDetailSurveillanceScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: CameraDevice,
  tick: number
) {
  const isLobby = camera.installEnvironment === 'indoor_lobby';
  const isNight =
    camera.installEnvironment === 'warehouse_night' ||
    camera.ispSettings.dayNightMode === 'night_ir';

  // Background gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
  if (isNight) {
    skyGrad.addColorStop(0, '#090D16');
    skyGrad.addColorStop(0.5, '#111827');
    skyGrad.addColorStop(1, '#1E293B');
  } else if (isLobby) {
    skyGrad.addColorStop(0, '#E2E8F0');
    skyGrad.addColorStop(0.45, '#CBD5E1');
    skyGrad.addColorStop(1, '#94A3B8');
  } else {
    skyGrad.addColorStop(0, '#1E293B');
    skyGrad.addColorStop(0.4, '#334155');
    skyGrad.addColorStop(1, '#0F172A');
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, height);

  // Perspective grid lines (Floor / Asphalt lane)
  ctx.strokeStyle = isLobby ? 'rgba(71, 85, 105, 0.25)' : 'rgba(148, 163, 184, 0.18)';
  ctx.lineWidth = 1.5;
  const horizonY = height * 0.36;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(width, horizonY);
  ctx.stroke();

  // Lane markings
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([16, 12]);
  ctx.beginPath();
  ctx.moveTo(width * 0.18, height);
  ctx.lineTo(width * 0.38, horizonY);
  ctx.moveTo(width * 0.82, height);
  ctx.lineTo(width * 0.62, horizonY);
  ctx.stroke();
  ctx.setLineDash([]);

  const subjects = getActiveSimulatedSubject(camera, tick);
  const activePlate = subjects.plates[0];
  const activeFace = subjects.faces[0];

  // Animated Vehicle in ANPR zone
  const cycle = (tick % 240) / 240; // 0.0 -> 1.0
  const carScale = 0.62 + cycle * 0.42;
  const carCenterX = width * 0.48 + Math.sin(tick * 0.02) * 8;
  const carCenterY = horizonY + (height * 0.46) * cycle;
  const carW = 190 * carScale;
  const carH = 105 * carScale;

  // Vehicle shadow & body
  ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
  ctx.beginPath();
  ctx.roundRect(carCenterX - carW / 2, carCenterY + carH * 0.42, carW, 18 * carScale, 8);
  ctx.fill();

  ctx.fillStyle = activePlate.vehicleColor.includes('مشکی') ? '#1E293B' : '#F1F5F9';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(carCenterX - carW / 2, carCenterY - carH / 2, carW, carH, 12 * carScale);
  ctx.fill();
  ctx.stroke();

  // Windshield
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.roundRect(
    carCenterX - carW * 0.4,
    carCenterY - carH * 0.42,
    carW * 0.8,
    carH * 0.36,
    6 * carScale
  );
  ctx.fill();

  // Headlights (affected by HLC mode: if HLC is OFF in parking_entrance, headlights bloom bright!)
  const hlcOn = camera.ispSettings.hlcMode === 'on';
  const headlightRadius = hlcOn ? 9 * carScale : 22 * carScale;
  ctx.fillStyle = hlcOn ? 'rgba(254, 240, 138, 0.85)' : 'rgba(255, 255, 255, 0.96)';
  ctx.beginPath();
  ctx.arc(carCenterX - carW * 0.34, carCenterY + carH * 0.1, headlightRadius, 0, Math.PI * 2);
  ctx.arc(carCenterX + carW * 0.34, carCenterY + carH * 0.1, headlightRadius, 0, Math.PI * 2);
  ctx.fill();

  // License Plate Box on front bumper
  const plateW = Math.max(88, 118 * carScale);
  const plateH = Math.max(22, 27 * carScale);
  const plateX = carCenterX - plateW / 2;
  const plateY = carCenterY + carH * 0.16;

  // Plate white background
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(plateX, plateY, plateW, plateH, 3);
  ctx.fill();
  ctx.stroke();

  // Left blue strip on plate
  ctx.fillStyle = '#1D4ED8';
  ctx.fillRect(plateX, plateY, plateW * 0.11, plateH);

  // Plate text rendered crisply
  ctx.fillStyle = '#0F172A';
  ctx.font = `bold ${Math.max(10, Math.round(12 * carScale))}px "Vazirmatn", "JetBrains Mono", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const shortPlate = activePlate.iranSegments
    ? `${activePlate.iranSegments.twoDigits}${activePlate.iranSegments.letter}${activePlate.iranSegments.threeDigits}-${activePlate.iranSegments.iranCode}`
    : activePlate.plateText;
  ctx.fillText(shortPlate, plateX + plateW * 0.54, plateY + plateH * 0.52);

  // AI Bounding Box around License Plate
  ctx.strokeStyle = '#22C55E';
  ctx.lineWidth = 1.8;
  ctx.strokeRect(plateX - 4, plateY - 4, plateW + 8, plateH + 8);
  ctx.fillStyle = 'rgba(22, 163, 74, 0.9)';
  ctx.fillRect(plateX - 4, plateY - 20, Math.min(plateW + 24, 135), 16);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 10px "JetBrains Mono", "Vazirmatn", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`ANPR ${activePlate.confidence}%`, plateX, plateY - 11);

  // Person Silhouette & Face Box on Pedestrian Walkwary (Right side)
  const personX = width * 0.78 + Math.cos(tick * 0.025) * 14;
  const personY = height * 0.52;

  // Body
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.roundRect(personX - 24, personY + 18, 48, 68, 12);
  ctx.fill();

  // Head / Face
  ctx.fillStyle = '#FDE68A';
  ctx.beginPath();
  ctx.arc(personX, personY - 4, 20, 0, Math.PI * 2);
  ctx.fill();

  // AI Face Recognition Bounding Box
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 1.8;
  ctx.strokeRect(personX - 26, personY - 30, 52, 52);
  ctx.fillStyle = 'rgba(2, 132, 199, 0.9)';
  ctx.fillRect(personX - 38, personY - 48, 96, 16);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 10px "Vazirmatn", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(activeFace.personName.slice(0, 16), personX + 10, personY - 39);
}

function drawOSDOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: CameraDevice,
  _tick: number,
  motionActive: boolean
) {
  const { jalaliDate, timeString } = formatJalaliDateTime(new Date());

  // Top dark gradient scrim for OSD legibility
  const topGrad = ctx.createLinearGradient(0, 0, 0, 48);
  topGrad.addColorStop(0, 'rgba(2, 6, 23, 0.78)');
  topGrad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, 48);

  // Timestamp top-left (LTR tabular mono)
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '600 12px "JetBrains Mono", "Vazirmatn", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(
    `${jalaliDate} ${timeString} | ${camera.ispSettings.codec} ${camera.ispSettings.fps}fps`,
    12,
    10
  );

  // Camera title top-right (RTL)
  ctx.textAlign = 'right';
  ctx.font = 'bold 12px "Vazirmatn", sans-serif';
  ctx.fillText(`${camera.name} [${camera.ipAddress}]`, width - 12, 10);

  // Bottom ISP telemetry bar
  const botGrad = ctx.createLinearGradient(0, height - 38, 0, height);
  botGrad.addColorStop(0, 'rgba(2, 6, 23, 0)');
  botGrad.addColorStop(1, 'rgba(2, 6, 23, 0.78)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, height - 38, width, 38);

  ctx.textAlign = 'left';
  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText(
    `WDR:${camera.ispSettings.wdrMode.toUpperCase()}  HLC:${camera.ispSettings.hlcMode.toUpperCase()}  SHUTTER:${camera.ispSettings.shutterSpeed}  MODE:${camera.ispSettings.dayNightMode.toUpperCase()}`,
    12,
    height - 20
  );

  if (motionActive) {
    ctx.fillStyle = 'rgba(217, 119, 6, 0.92)';
    ctx.beginPath();
    ctx.roundRect(width - 128, height - 28, 116, 20, 4);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px "Vazirmatn", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`تشخیص حرکت (${toPersianDigits(camera.motionSensitivity)}%)`, width - 70, height - 22);
  }
}
