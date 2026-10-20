import type { SVGProps } from 'react';

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
  | 'airbag';

/**
 * Icon theo KHOÁ danh mục tiện ích (`VEHICLE_FEATURE_LABEL` ở `@xeprime/types`), không theo nhãn.
 *
 * Bản trước dò chữ trong NHÃN ("lùi", "túi khí"…): nhãn là dữ liệu admin sửa được và đổi theo ngôn
 * ngữ, và phép dò còn bắt nhầm — "Cảm biến lùi" chứa "lùi" nên mang icon camera lùi. Khoá thì cố
 * định. Khoá chưa có icon riêng (danh mục mới) dùng icon mặc định.
 */
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

/**
 * Icons cho tiện ích trên xe khớp chuẩn Figma v2 (node 19707:83357).
 * Toàn bộ là inline SVG outline thanh mảnh, server-safe (không dùng context hay antd icon) và chỉ
 * là trang trí — tên tiện ích nằm ngay bên cạnh.
 */
export function VehicleFeatureIcon({
  featureKey,
  ...props
}: { featureKey: string } & SVGProps<SVGSVGElement>) {
  const svgProps = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };

  switch (ICON_BY_FEATURE[featureKey]) {
    case 'bluetooth':
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <path d="m8.5 7.5 7 7-3.5 3.5V6l3.5 3.5-7 7" />
        </svg>
      );
    case 'backupCamera':
      return (
        <svg {...svgProps}>
          <rect x="2" y="6" width="13" height="12" rx="3" />
          <path d="m15 10 5-3v10l-5-3v-4z" />
        </svg>
      );
    case 'camera':
      return (
        <svg {...svgProps}>
          <rect x="2" y="5" width="20" height="14" rx="3" />
          <circle cx="12" cy="12" r="3.5" />
          <circle cx="18" cy="8" r="1" fill="currentColor" />
        </svg>
      );
    case 'sensor':
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v12M9 8v8M15 8v8M6.5 10.5v3M17.5 10.5v3" />
        </svg>
      );
    case 'etc':
      return (
        <svg {...svgProps}>
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      );
    case 'usb':
      return (
        <svg {...svgProps}>
          <rect x="5" y="10" width="14" height="11" rx="2" />
          <path d="M8 10V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6" />
          <line x1="10" y1="6" x2="10" y2="7" />
          <line x1="14" y1="6" x2="14" y2="7" />
        </svg>
      );
    case 'map':
      return (
        <svg {...svgProps}>
          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
          <line x1="9" y1="3" x2="9" y2="18" />
          <line x1="15" y1="6" x2="15" y2="21" />
        </svg>
      );
    case 'screen':
      return (
        <svg {...svgProps}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="m16 3-4 4-4-4" />
        </svg>
      );
    case 'sunroof':
      return (
        <svg {...svgProps}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="12" y1="3" x2="12" y2="21" />
        </svg>
      );
    case 'airbag':
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      );
    default:
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
  }
}
