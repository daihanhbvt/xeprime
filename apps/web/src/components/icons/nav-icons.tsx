import type { ComponentType } from 'react';
import { LineIcon, type LineIconName } from './LineIcon';

type NavIcon = ComponentType<{ className?: string }>;

/**
 * Icon menu của site partner — bộ nét của design Partner-XePrime, gói thành component cùng hình
 * dạng với icon AntD (`ComponentType<{ className }>`) để `constants/nav` khai được cả hai bộ trong
 * một kiểu `NavLeaf.icon`. Menu nền tảng vẫn dùng icon AntD cho tới khi có design riêng.
 */
function lineNavIcon(name: LineIconName): NavIcon {
  function NavLineIcon({ className }: { className?: string }) {
    return <LineIcon name={name} className={className} />;
  }
  NavLineIcon.displayName = `NavLineIcon(${name})`;
  return NavLineIcon;
}

/** Tên theo VAI của mục menu, không theo hình — đổi hình về sau chỉ sửa một dòng ở đây. */
export const PARTNER_NAV_ICON = {
  // Mục cấp 1 (Figma Header `23649:27690`)
  overview: lineNavIcon('discovery'),
  operations: lineNavIcon('folder'),
  fleet: lineNavIcon('category'),
  revenue: lineNavIcon('dollar-square'),
  settings: lineNavIcon('setting'),
  help: lineNavIcon('faq'),
  // Mục con (Figma SubMenu `23661:27362`)
  calendar: lineNavIcon('calendar-2'),
  bookingRequests: lineNavIcon('doc-right'),
  bookings: lineNavIcon('doc-left'),
  customers: lineNavIcon('users'),
  vehicles: lineNavIcon('car'),
  drivers: lineNavIcon('profile'),
  maintenance: lineNavIcon('setting'),
  financeOverview: lineNavIcon('dollar-circle'),
  wallet: lineNavIcon('wallet'),
  transactions: lineNavIcon('doc-right'),
  shop: lineNavIcon('bag'),
  policies: lineNavIcon('shield-star'),
  members: lineNavIcon('add-category'),
  // Chưa có trong design — chọn trong cùng bộ nét, ghi ở docs/design/09_PARTNER_REDESIGN.md §4.
  supportCenter: lineNavIcon('faq'),
  supportCases: lineNavIcon('doc-left'),
  ownerProfile: lineNavIcon('profile'),
  hostGuide: lineNavIcon('faq'),
  contracts: lineNavIcon('doc-right'),
  dataProtection: lineNavIcon('shield-star'),
} as const satisfies Record<string, NavIcon>;
