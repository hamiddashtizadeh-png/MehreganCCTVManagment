export type CameraBrand = 'tiandy' | 'hikvision' | 'dahua' | 'onvif';

export type InstallEnvironment =
  | 'parking_entrance'
  | 'outdoor_street'
  | 'indoor_lobby'
  | 'warehouse_night'
  | 'perimeter_backlight';

export interface CameraISPSettings {
  brightness: number; // 0 - 100
  contrast: number; // 0 - 100
  saturation: number; // 0 - 100
  sharpness: number; // 0 - 100
  hue: number; // 0 - 100
  wdrMode: 'off' | 'auto' | 'manual'; // Wide Dynamic Range (TWDR / DWDR)
  wdrLevel: number; // 0 - 100
  blcMode: 'off' | 'on'; // Backlight Compensation
  hlcMode: 'off' | 'on'; // Highlight Compensation (crucial for ANPR/License plates at night)
  hlcLevel: number; // 0 - 100
  dnrMode: 'off' | '2d' | '3d' | 'auto'; // Digital Noise Reduction
  dnrLevel: number; // 0 - 100
  dayNightMode: 'auto' | 'day_color' | 'night_ir' | 'starlight_fullcolor'; // Tiandy Starlight / ColorMaker
  shutterSpeed: string; // e.g., '1/25', '1/50', '1/100', '1/250', '1/500', '1/1000', '1/2000'
  exposureMode: 'auto' | 'manual' | 'low_motion_blur' | 'plate_capture';
  defogMode: 'off' | 'auto' | 'manual';
  resolution: '3840x2160 (4K)' | '2560x1440 (2K)' | '1920x1080 (1080p)' | '1280x720 (720p)';
  fps: number; // 15, 20, 25, 30, 50, 60
  codec: 'H.265+ (S+265)' | 'H.265' | 'H.264+' | 'H.264';
  bitrateKbps: number; // e.g., 2048, 4096, 6144, 8192
  mirror: boolean;
  flip: boolean;
  corridorMode: boolean;
  osdOverlay: boolean;
  irLedStrength: number; // 0 - 100
}

export interface CameraProtocolEndpoints {
  rtspMainStream: string;
  rtspSubStream: string;
  httpSnapshotUrl: string;
  httpMjpegUrl: string;
  onvifServiceUrl: string;
  configApiEndpoint: string;
  ptzApiEndpoint: string;
}

export interface CameraDevice {
  id: string;
  name: string;
  location: string;
  brand: CameraBrand;
  model: string;
  firmwareVersion: string;
  serialNumber: string;
  ipAddress: string;
  httpPort: number;
  rtspPort: number;
  onvifPort: number;
  username: string;
  password?: string;
  channel: number;
  streamUrl?: string; // Custom HTTP/MJPEG/HLS stream URL if provided
  useLocalDeviceCamera?: boolean; // Optional browser MediaDevices fallback for live testing
  installEnvironment: InstallEnvironment;
  status: 'online' | 'connecting' | 'auth_error' | 'unreachable';
  lastSeen?: string;
  latencyMs?: number;
  ptzSupported: boolean;
  motionDetectionEnabled: boolean;
  motionSensitivity: number; // 1 - 100
  autoAnalyzeOnMotion: boolean;
  autoSnapshotOnMotion: boolean;
  endpoints: CameraProtocolEndpoints;
  ispSettings: CameraISPSettings;
}

export interface IranianPlateSegments {
  twoDigits: string; // e.g. "۴۵" or "45"
  letter: string; // e.g. "ب", "ج", "د", "س", "ص", "ط", "ق", "ل", "م", "ن", "و", "هـ", "ی", "الف", "ت", "ع"
  threeDigits: string; // e.g. "۷۸۱" or "781"
  iranCode: string; // e.g. "۱۱" or "11"
}

export interface PlateDetails {
  plateText: string; // Normalized full text
  plateFormat: 'iran_national' | 'iran_freezone' | 'iran_gov_taxi' | 'international';
  iranSegments?: IranianPlateSegments;
  countryOrRegion: string; // e.g., "ایران - تهران (۱۱)", "منطقه آزاد ارس", "EU / International"
  vehicleType: string; // e.g., "پژو ۲۰۷", "سمند", "تیبا", "شاسی‌بلند", "وانت"
  vehicleColor: string; // e.g., "سفید", "مشکی", "نقره‌ای"
  confidence: number; // 0 - 100
}

export interface FaceDetails {
  personName: string; // e.g., "ناشناس" or matched watchlist name
  gender: 'مرد' | 'زن' | 'نامشخص';
  ageRange: string; // e.g., "۲۵ تا ۳۵ سال"
  attributes: string[]; // e.g., ["عینک طبی", "ریش کوتاه", "پوشش رسمی"]
  expression: string; // e.g., "عادی", "جدی", "لبخند"
  confidence: number; // 0 - 100
  matchedWatchlistId?: string;
}

export interface DetectionRecord {
  id: string;
  type: 'plate' | 'face' | 'motion';
  cameraId: string;
  cameraName: string;
  cameraLocation: string;
  timestampIso: string; // ISO string for range filtering
  jalaliDate: string; // e.g. "۱۴۰۵/۰۸/۱۱"
  timeString: string; // e.g. "۲۲:۱۵:۰۸"
  fullSnapshotDataUrl: string;
  croppedImageDataUrl?: string;
  plateDetails?: PlateDetails;
  faceDetails?: FaceDetails;
  motionScore?: number;
  watchlistStatus: 'normal' | 'vip' | 'blacklist';
  watchlistNote?: string;
  notes?: string;
}

export interface WatchlistEntry {
  id: string;
  type: 'plate' | 'face';
  listType: 'vip' | 'blacklist';
  identifier: string; // Plate number or Person full name
  iranSegments?: IranianPlateSegments;
  roleOrDepartment: string;
  referenceImageDataUrl?: string;
  notes: string;
  soundAlert: boolean;
  createdAt: string;
}

export interface ISPParameterRecommendation {
  parameterKey: keyof CameraISPSettings;
  parameterLabel: string;
  currentValue: string | number | boolean;
  recommendedValue: string | number | boolean;
  reason: string;
}

export interface AISceneOptimizationResult {
  cameraId: string;
  detectedSceneCondition: string;
  lightingQualityScore: number; // 0 - 100
  anprReadinessScore: number; // 0 - 100
  faceReadinessScore: number; // 0 - 100
  summaryDiagnosis: string;
  recommendedSettings: Partial<CameraISPSettings>;
  parameterChanges: ISPParameterRecommendation[];
}

export interface DiscoveredNetworkDevice {
  ipAddress: string;
  openPorts: number[];
  detectedBrand: CameraBrand;
  suggestedModel: string;
  httpPort: number;
  rtspPort: number;
  onvifPort: number;
  protocolHint: string;
  latencyMs: number;
  detectionSource?: 'browser_lan' | 'server_socket' | 'onvif_multicast' | 'manual_diagnostic';
  testedPorts?: Array<{
    port: number;
    name: string;
    open: boolean;
    latencyMs: number;
  }>;
  webTitle?: string;
  macAddress?: string;
}

export interface NetworkInterfaceInfo {
  name: string;
  address: string;
  family: string;
  internal: boolean;
}
