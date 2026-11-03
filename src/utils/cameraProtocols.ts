import {
  CameraBrand,
  CameraISPSettings,
  CameraProtocolEndpoints,
  InstallEnvironment,
  IranianPlateSegments,
} from '../types/nvr';

export const IRAN_PLATE_LETTERS = [
  'الف',
  'ب',
  'پ',
  'ت',
  'ث',
  'ج',
  'د',
  'ز',
  'س',
  'ش',
  'ص',
  'ط',
  'ع',
  'ف',
  'ق',
  'ک',
  'گ',
  'ل',
  'م',
  'ن',
  'و',
  'هـ',
  'ی',
  'D',
  'S',
];

export const INSTALL_ENVIRONMENT_LABELS: Record<InstallEnvironment, string> = {
  parking_entrance: 'ورودی پارکینگ و گیت پلاک‌خوان (ضدنور / چراغ خودرو)',
  outdoor_street: 'معابر شهری و فضای باز (تغییرات نوری روز و شب)',
  indoor_lobby: 'لابی، پذیرش و ورودی ساختمان (تشخیص چهره دقیق)',
  warehouse_night: 'انبار، محوطه کم‌نور و دید در شب (نیاز به Starlight / IR)',
  perimeter_backlight: 'دیوار پیرامونی و محیط با کنتراست نوری شدید (WDR)',
};

export const BRAND_METADATA: Record<
  CameraBrand,
  {
    label: string;
    badgeColor: string;
    defaultHttpPort: number;
    defaultRtspPort: number;
    defaultOnvifPort: number;
    protocolName: string;
    defaultModel: string;
    description: string;
  }
> = {
  tiandy: {
    label: 'Tiandy (تیاندی)',
    badgeColor: 'text-blue-700 bg-blue-50 border-blue-200',
    defaultHttpPort: 80,
    defaultRtspPort: 554,
    defaultOnvifPort: 80,
    protocolName: 'Tiandy CGI / S+265 / Starlight ONVIF',
    defaultModel: 'TC-C34GS Spec: I5/E/Y/M/H/2.8mm (Starlight)',
    description: 'پشتیبانی هوشمند از کدک S+265، تنظیمات کالر میکر (Starlight) و CGI/ONVIF تیاندی',
  },
  hikvision: {
    label: 'Hikvision (هایک‌ویژن)',
    badgeColor: 'text-rose-700 bg-rose-50 border-rose-200',
    defaultHttpPort: 80,
    defaultRtspPort: 554,
    defaultOnvifPort: 80,
    protocolName: 'Hikvision ISAPI (REST XML) / ONVIF',
    defaultModel: 'DS-2CD2T47G2-L (ColorVu AcuSense)',
    description: 'استخراج و ویرایش تنظیمات تصویر از طریق پروتکل استاندارد ISAPI و کانال‌های ۱۰۱/۱۰۲',
  },
  dahua: {
    label: 'Dahua (داهوا)',
    badgeColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    defaultHttpPort: 80,
    defaultRtspPort: 554,
    defaultOnvifPort: 80,
    protocolName: 'Dahua HTTP CGI (configManager) / ONVIF',
    defaultModel: 'IPC-HFW3449T1-AS-PV (WizSense Full-Color)',
    description: 'ارتباط مستقیم با configManager.cgi و استریم realmonitor با احراز هویت Digest',
  },
  onvif: {
    label: 'ONVIF / Noname (عمومی)',
    badgeColor: 'text-slate-700 bg-slate-100 border-slate-200',
    defaultHttpPort: 80,
    defaultRtspPort: 554,
    defaultOnvifPort: 8899,
    protocolName: 'ONVIF Profile S/T SOAP & RTSP',
    defaultModel: 'Generic ONVIF Profile-S/T IP Camera',
    description: 'اتصال استاندارد SOAP XML به تمامی دوربین‌های شبکه و برندهای متفرقه (Noname)',
  },
};

export function buildCameraEndpoints(params: {
  brand: CameraBrand;
  ipAddress: string;
  httpPort: number;
  rtspPort: number;
  onvifPort: number;
  username: string;
  password?: string;
  channel?: number;
}): CameraProtocolEndpoints {
  const {
    brand,
    ipAddress,
    httpPort,
    rtspPort,
    onvifPort,
    username,
    password = '',
    channel = 1,
  } = params;

  const encodedUser = encodeURIComponent(username || 'admin');
  const encodedPass = password ? `:${encodeURIComponent(password)}` : '';
  const authPrefix = `${encodedUser}${encodedPass}@`;
  const httpHost = httpPort === 80 ? ipAddress : `${ipAddress}:${httpPort}`;
  const onvifHost = onvifPort === 80 ? ipAddress : `${ipAddress}:${onvifPort}`;

  switch (brand) {
    case 'tiandy':
      return {
        rtspMainStream: `rtsp://${authPrefix}${ipAddress}:${rtspPort}/${channel}/1`,
        rtspSubStream: `rtsp://${authPrefix}${ipAddress}:${rtspPort}/${channel}/2`,
        httpSnapshotUrl: `http://${httpHost}/cgi-bin/snapshot.cgi?channel=${channel}`,
        httpMjpegUrl: `http://${httpHost}/cgi-bin/mjpg/video.cgi?channel=${channel}&subtype=1`,
        onvifServiceUrl: `http://${onvifHost}/onvif/device_service`,
        configApiEndpoint: `http://${httpHost}/cgi-bin/param.cgi?action=get&group=Image&channel=${channel}`,
        ptzApiEndpoint: `http://${httpHost}/cgi-bin/ptz.cgi?channel=${channel}`,
      };

    case 'hikvision': {
      const hikChannelMain = `${channel}01`;
      const hikChannelSub = `${channel}02`;
      return {
        rtspMainStream: `rtsp://${authPrefix}${ipAddress}:${rtspPort}/Streaming/Channels/${hikChannelMain}`,
        rtspSubStream: `rtsp://${authPrefix}${ipAddress}:${rtspPort}/Streaming/Channels/${hikChannelSub}`,
        httpSnapshotUrl: `http://${httpHost}/ISAPI/Streaming/channels/${hikChannelMain}/picture`,
        httpMjpegUrl: `http://${httpHost}/ISAPI/Streaming/channels/${hikChannelSub}/httpPreview`,
        onvifServiceUrl: `http://${onvifHost}/onvif/device_service`,
        configApiEndpoint: `http://${httpHost}/ISAPI/Image/channels/${channel}`,
        ptzApiEndpoint: `http://${httpHost}/ISAPI/PTZCtrl/channels/${channel}/continuous`,
      };
    }

    case 'dahua':
      return {
        rtspMainStream: `rtsp://${authPrefix}${ipAddress}:${rtspPort}/cam/realmonitor?channel=${channel}&subtype=0`,
        rtspSubStream: `rtsp://${authPrefix}${ipAddress}:${rtspPort}/cam/realmonitor?channel=${channel}&subtype=1`,
        httpSnapshotUrl: `http://${httpHost}/cgi-bin/snapshot.cgi?channel=${channel}`,
        httpMjpegUrl: `http://${httpHost}/cgi-bin/mjpg/video.cgi?channel=${channel}&subtype=1`,
        onvifServiceUrl: `http://${onvifHost}/onvif/device_service`,
        configApiEndpoint: `http://${httpHost}/cgi-bin/configManager.cgi?action=getConfig&name=VideoColor[${channel - 1}]`,
        ptzApiEndpoint: `http://${httpHost}/cgi-bin/ptz.cgi?action=start&channel=${channel}`,
      };

    case 'onvif':
    default:
      return {
        rtspMainStream: `rtsp://${authPrefix}${ipAddress}:${rtspPort}/stream1`,
        rtspSubStream: `rtsp://${authPrefix}${ipAddress}:${rtspPort}/stream2`,
        httpSnapshotUrl: `http://${httpHost}/snapshot.jpg`,
        httpMjpegUrl: `http://${httpHost}/video.mjpg`,
        onvifServiceUrl: `http://${onvifHost}/onvif/device_service`,
        configApiEndpoint: `http://${onvifHost}/onvif/imaging_service`,
        ptzApiEndpoint: `http://${onvifHost}/onvif/ptz_service`,
      };
  }
}

export function getDefaultISPSettings(brand: CameraBrand): CameraISPSettings {
  return {
    brightness: 50,
    contrast: 52,
    saturation: 50,
    sharpness: 55,
    hue: 50,
    wdrMode: brand === 'tiandy' ? 'auto' : 'off',
    wdrLevel: 50,
    blcMode: 'off',
    hlcMode: 'off',
    hlcLevel: 50,
    dnrMode: '3d',
    dnrLevel: 60,
    dayNightMode: brand === 'tiandy' ? 'starlight_fullcolor' : 'auto',
    shutterSpeed: '1/50',
    exposureMode: 'auto',
    defogMode: 'off',
    resolution: '2560x1440 (2K)',
    fps: 25,
    codec: brand === 'tiandy' ? 'H.265+ (S+265)' : 'H.265',
    bitrateKbps: 4096,
    mirror: false,
    flip: false,
    corridorMode: false,
    osdOverlay: true,
    irLedStrength: 75,
  };
}

export function formatJalaliDateTime(date: Date = new Date()): {
  jalaliDate: string;
  timeString: string;
} {
  try {
    const jalaliDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);

    const timeString = new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);

    return { jalaliDate, timeString };
  } catch {
    const iso = date.toISOString();
    return {
      jalaliDate: iso.slice(0, 10),
      timeString: iso.slice(11, 19),
    };
  }
}

export function toEnglishDigits(str: string): string {
  return str
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function toPersianDigits(str: string | number): string {
  return String(str).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

export function formatIranPlateString(segments: IranianPlateSegments): string {
  return `${toPersianDigits(segments.twoDigits)} ${segments.letter} ${toPersianDigits(segments.threeDigits)} - ایران ${toPersianDigits(segments.iranCode)}`;
}

export function normalizePlateForSearch(text: string): string {
  return toEnglishDigits(text)
    .replace(/[\s\-_ایران]/g, '')
    .toUpperCase();
}
