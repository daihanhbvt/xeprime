import { SvgXml } from 'react-native-svg';

/**
 * Icon tiện ích xe — CÙNG bộ SVG nét với web `VehicleFeatureIcon`
 * (`apps/web/src/features/marketplace/components/VehicleFeatureIcons.tsx`, Figma v2 `19707:83357`).
 *
 * Tra theo KHOÁ danh mục (`VEHICLE_FEATURE_LABEL`), không theo nhãn — nhãn đổi theo ngôn ngữ và do
 * admin sửa. Khoá chưa có icon riêng dùng dấu tích tròn, như web.
 */
type IconKind =
  | 'bluetooth'
  | 'backupCamera'
  | 'camera'
  | 'sensor'
  | 'etc'
  | 'usb'
  | 'map'
  | 'screen'
  | 'sunroof'
  | 'airbag'
  | 'default';

const ICON_BY_FEATURE: Readonly<Record<string, IconKind>> = {
  bluetooth: 'bluetooth',
  backup_camera: 'backupCamera',
  camera_360: 'camera',
  dash_camera: 'camera',
  reverse_sensor: 'sensor',
  etc: 'etc',
  usb: 'usb',
  map: 'map',
  gps: 'map',
  screen: 'screen',
  sunroof: 'sunroof',
  airbag: 'airbag',
};

const BODY: Readonly<Record<IconKind, string>> = {
  bluetooth: '<circle cx="12" cy="12" r="10"/><path d="m8.5 7.5 7 7-3.5 3.5V6l3.5 3.5-7 7"/>',
  backupCamera:
    '<rect x="2" y="6" width="13" height="12" rx="3"/><path d="m15 10 5-3v10l-5-3v-4z"/>',
  camera:
    '<rect x="2" y="5" width="20" height="14" rx="3"/><circle cx="12" cy="12" r="3.5"/><circle cx="18" cy="8" r="1" fill="currentColor"/>',
  sensor:
    '<circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 8v8M15 8v8M6.5 10.5v3M17.5 10.5v3"/>',
  etc: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  usb: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6"/><line x1="10" y1="6" x2="10" y2="7"/><line x1="14" y1="6" x2="14" y2="7"/>',
  map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
  screen: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="m16 3-4 4-4-4"/>',
  sunroof:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/>',
  airbag: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  default: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
};

const xmlCache = new Map<IconKind, string>();

function xmlFor(kind: IconKind): string {
  const hit = xmlCache.get(kind);
  if (hit) return hit;
  const xml = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${BODY[kind]}</svg>`;
  xmlCache.set(kind, xml);
  return xml;
}

export function VehicleFeatureIcon({
  featureKey,
  size,
  color,
}: {
  featureKey: string;
  size: number;
  color: string;
}) {
  const kind = ICON_BY_FEATURE[featureKey] ?? 'default';
  return <SvgXml xml={xmlFor(kind)} width={size} height={size} color={color} />;
}
