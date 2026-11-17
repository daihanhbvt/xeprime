import type { Href } from 'expo-router';
import { PERMISSION, PLAN_FEATURE, type Permission, type PlanFeature } from '@xeprime/types';
import type { LineIconName } from '@/components/icons/LineIcon';
import { ROUTES } from '@/navigation/routes';
import { PARTNER_TRACK, type PartnerTrack } from './partner-track';

/**
 * Cây menu site partner trên app — gương của `PARTNER_NAV` ở `apps/web/src/constants/nav.ts`
 * (design Partner-XePrime, `docs/design/09_PARTNER_REDESIGN.md` §2): MỘT cây cho cả hai tuyến
 * (ADR 0085 điều 1), sáu khối đúng thứ tự design — Tổng quan · Vận hành · Xe & Tài xế · Doanh thu ·
 * Cấu hình · Trợ giúp. Cây của từng tuyến SUY từ cây chung (`tracks`, `commission`), không viết tay
 * lần thứ hai.
 *
 * Khác web đúng ba chỗ, đều là chuyện nền tảng:
 *  1. **Biểu tượng** là CHÍNH bộ nét `PARTNER_NAV_ICON` của web (`LineIcon`, cùng file SVG). Hình
 *     dạng điều hướng theo design APP (Figma `Menu MB`): năm ô theo khối thay cho drawer + bốn ô
 *     của web — xem `PARTNER_MENU_TABS` ở cuối file.
 *  2. **Mục ẩn (`hidden`) còn màn riêng trên app** — "Đơn đã kết thúc", "Chi nhánh", "Công nợ": web
 *     đã gộp chúng vào màn khác (nút đầu "Đơn thuê xe", thẻ của "Thông tin cửa hàng", tab của "Lịch sử
 *     giao dịch"); app vẫn giữ route cho lối vào từ các màn đó và từ thông báo. ("Yêu cầu đặt xe",
 *     "Chờ giao xe" chỉ còn là route CHUYỂN TIẾP vào "Đơn thuê xe" — không cần mục.) Chúng KHÔNG vẽ thành dòng menu, nhưng vẫn tham gia khớp đường dẫn
 *     (`activeAs` — sáng đúng mục cha) và tra cờ gói cho dải "hết hạn" (`ManageShellNotices`).
 *  3. **Tin nhắn** không phải mục menu — icon ở thanh trên, như web.
 *
 * `permission` chỉ để ẩn/hiện — guard backend mới là lớp chặn thật (CLAUDE.md mục 6).
 */

/** Khoá nhãn trong namespace `Navigation`. */
export type ManageNavLabel = string;

/** Chỗ ĐƯỢC PHÉP mang huy hiệu "cần xử lý" — đúng bộ `NAV_BADGE` của web (05/11/2026). */
export const MANAGE_NAV_BADGE = {
  /** "Đơn thuê xe" gộp: yêu cầu CHỜ DUYỆT + lượt giao/trả ĐẾN HẠN. Đỏ khi sắp trễ / quá giờ. */
  RENTALS_WORK: 'rentalsWork',
  /** Tin nhắn chưa đọc phía gian hàng — icon tin nhắn ở thanh trên. */
  CHAT_UNREAD: 'chatUnread',
  /** Xe có việc chặn (giấy tờ/bảo dưỡng quá hạn, bị trả về khi đăng chợ, thiếu KM trả). */
  VEHICLES_NEEDS_ACTION: 'vehiclesNeedsAction',
} as const;

export type ManageNavBadge = (typeof MANAGE_NAV_BADGE)[keyof typeof MANAGE_NAV_BADGE];

/** Một quyền, hoặc danh sách mà có BẤT KỲ quyền nào là thấy (web `NavPermission`). */
export type ManageNavPermission = Permission | readonly Permission[];

export function isManageNavPermissionGranted(
  permission: ManageNavPermission,
  has: (permission: Permission) => boolean,
): boolean {
  return typeof permission === 'string' ? has(permission) : permission.some(has);
}

/** Mục dẫn tới một trang. */
export interface ManageNavLeaf {
  readonly type?: 'leaf';
  readonly key: string;
  readonly labelKey: ManageNavLabel;
  readonly icon: LineIconName;
  readonly permission: ManageNavPermission;
  readonly href?: Href;
  readonly badge?: ManageNavBadge;
  /** Cờ NĂNG LỰC THEO GÓI (ADR 0027) — trục độc lập với `permission`, kiểm nối tiếp. */
  readonly feature?: PlanFeature;
  /** Chỉ CHỦ gian hàng (ADR 0038 điều 3) — khớp `@ShopOwnerOnly()` ở API. */
  readonly ownerOnly?: true;
  /** Tuyến được thấy mục — vắng = cả hai tuyến (ADR 0085 điều 1). */
  readonly tracks?: readonly PartnerTrack[];
  /** Bản của mục ở tuyến HOA HỒNG khi cùng trang mà khác cách gọi (ADR 0085 điều 2). */
  readonly commission?: Partial<Pick<ManageNavLeaf, 'labelKey' | 'icon' | 'ownerOnly'>>;
  /** Trang vẫn thuộc khối nhưng không vẽ thành dòng menu — xem docblock đầu file. */
  readonly hidden?: true;
  /** Mục ẩn đang mở thì mục HIỆN nào sáng thay (href của nó). */
  readonly activeAs?: Href;
}

/** Mục cha mở ra vài mục con. Cây hiện tại không dùng (web gỡ ở design mới) — giữ kiểu cho test. */
export interface ManageNavBranch {
  readonly type: 'branch';
  readonly key: string;
  readonly labelKey: ManageNavLabel;
  readonly icon: LineIconName;
  readonly children: readonly ManageNavLeaf[];
}

export type ManageNavNode = ManageNavLeaf | ManageNavBranch;

export function isManageNavBranch(node: ManageNavNode): node is ManageNavBranch {
  return node.type === 'branch';
}

export interface ManageNavSection {
  readonly key: string;
  readonly labelKey: ManageNavLabel;
  /** Khối luôn bung, không gập được — Tổng quan và Trợ giúp. */
  readonly pinned?: boolean;
  readonly icon?: LineIconName;
  readonly children: readonly ManageNavNode[];
}

/** Biểu tượng theo VAI của mục — gương `PARTNER_NAV_ICON` của web. */
const ICON = {
  overview: 'discovery',
  operations: 'folder',
  fleet: 'category',
  revenue: 'dollar-square',
  settings: 'setting',
  help: 'faq',
  calendar: 'calendar-2',
  bookings: 'doc-left',
  customers: 'users',
  vehicles: 'car',
  drivers: 'profile',
  maintenance: 'setting',
  financeOverview: 'dollar-circle',
  wallet: 'wallet',
  transactions: 'doc-right',
  shop: 'bag',
  policies: 'shield-star',
  members: 'add-category',
  supportCenter: 'faq',
  supportCases: 'doc-left',
  ownerProfile: 'profile',
  hostGuide: 'faq',
  contracts: 'doc-right',
  dataProtection: 'shield-star',
} as const satisfies Record<string, LineIconName>;

const PARTNER_NAV: readonly ManageNavSection[] = [
  {
    key: 'overview',
    labelKey: 'manageGroups.overview',
    icon: ICON.overview,
    pinned: true,
    children: [
      {
        key: 'dashboard',
        labelKey: 'manage.dashboard',
        icon: ICON.overview,
        permission: PERMISSION.TENANT_VIEW,
        href: ROUTES.manage.home(),
      },
    ],
  },
  {
    key: 'operations',
    labelKey: 'manageGroups.partnerOperations',
    icon: ICON.operations,
    children: [
      {
        // MỘT mục cho cả chuyến (05/11/2026): yêu cầu chờ duyệt → chờ khách trả → chờ giao → đang thuê.
        key: 'bookings',
        labelKey: 'manage.rentals',
        icon: ICON.bookings,
        permission: [PERMISSION.BOOKING_REQUEST_VIEW, PERMISSION.BOOKING_VIEW],
        href: ROUTES.manage.bookings(),
        badge: MANAGE_NAV_BADGE.RENTALS_WORK,
      },
      {
        key: 'bookings-ended',
        labelKey: 'manage.bookingsEnded',
        icon: ICON.bookings,
        permission: PERMISSION.BOOKING_VIEW,
        href: ROUTES.manage.bookingsEnded(),
        hidden: true,
        activeAs: ROUTES.manage.bookings(),
      },
      {
        key: 'calendar',
        labelKey: 'manage.rentalCalendar',
        icon: ICON.calendar,
        permission: PERMISSION.CALENDAR_VIEW,
        href: ROUTES.manage.calendar(),
      },
      {
        key: 'customers',
        labelKey: 'manage.customerList',
        icon: ICON.customers,
        permission: PERMISSION.CUSTOMER_VIEW,
        href: ROUTES.manage.customers(),
        // Sổ khách là năng lực gói (ADR 0027 · 0056).
        tracks: [PARTNER_TRACK.PACKAGE],
      },
    ],
  },
  {
    key: 'fleet',
    labelKey: 'manageGroups.fleet',
    icon: ICON.fleet,
    children: [
      {
        key: 'vehicles',
        labelKey: 'manage.vehicleList',
        icon: ICON.vehicles,
        permission: PERMISSION.VEHICLE_VIEW,
        href: ROUTES.manage.vehicles(),
        badge: MANAGE_NAV_BADGE.VEHICLES_NEEDS_ACTION,
      },
      {
        // Không gác bằng cờ gói: tài xế mở cho cả hai tuyến (ADR 0063).
        key: 'drivers',
        labelKey: 'manage.driverManagement',
        icon: ICON.drivers,
        permission: PERMISSION.DRIVER_VIEW,
        href: ROUTES.manage.drivers(),
      },
      {
        key: 'maintenance',
        labelKey: 'manage.maintenance',
        icon: ICON.maintenance,
        permission: PERMISSION.VEHICLE_MAINTENANCE_VIEW,
        feature: PLAN_FEATURE.MAINTENANCE,
        href: ROUTES.manage.maintenance(),
        tracks: [PARTNER_TRACK.PACKAGE],
      },
    ],
  },
  {
    key: 'revenue',
    labelKey: 'manageGroups.revenue',
    icon: ICON.revenue,
    children: [
      {
        key: 'finance-overview',
        labelKey: 'manage.financeOverview',
        icon: ICON.financeOverview,
        permission: PERMISSION.FINANCE_VIEW,
        feature: PLAN_FEATURE.FINANCE,
        href: ROUTES.manage.finance(),
        tracks: [PARTNER_TRACK.PACKAGE],
      },
      {
        /*
         * Ví: KHÔNG gác bằng `feature` — số dư là tiền của chính gian hàng (ADR 0027 điều 3, ADR
         * 0033). Gác bằng SỞ HỮU (`ownerOnly`), khớp `@ShopOwnerOnly()` ở API.
         */
        key: 'balance',
        labelKey: 'manage.wallet',
        icon: ICON.wallet,
        permission: PERMISSION.TENANT_VIEW,
        ownerOnly: true,
        href: ROUTES.manage.balance(),
      },
      {
        // Hai tab: Giao dịch thu chi và Công nợ.
        key: 'receipts',
        labelKey: 'manage.transactionHistory',
        icon: ICON.transactions,
        permission: PERMISSION.FINANCE_VIEW,
        feature: PLAN_FEATURE.FINANCE,
        href: ROUTES.manage.receipts(),
        tracks: [PARTNER_TRACK.PACKAGE],
      },
      {
        key: 'debts',
        labelKey: 'manage.debts',
        icon: ICON.transactions,
        permission: PERMISSION.FINANCE_VIEW,
        feature: PLAN_FEATURE.DEBTS,
        href: ROUTES.manage.debts(),
        tracks: [PARTNER_TRACK.PACKAGE],
        hidden: true,
        activeAs: ROUTES.manage.receipts(),
      },
    ],
  },
  {
    key: 'settings',
    labelKey: 'manageGroups.settings',
    icon: ICON.settings,
    children: [
      {
        key: 'shop',
        labelKey: 'manage.shopInfo',
        icon: ICON.shop,
        permission: PERMISSION.TENANT_VIEW,
        href: ROUTES.manage.shop(),
        // Chủ xe cá nhân: CÙNG trang, mặt tiền cá nhân (ADR 0085 điều 2) — chỉ CHỦ.
        commission: { labelKey: 'account.ownerProfile', icon: ICON.ownerProfile, ownerOnly: true },
      },
      {
        // Chi nhánh là thẻ của "Thông tin cửa hàng" (06/11/2026).
        key: 'shop-branches',
        labelKey: 'manage.shopBranches',
        icon: ICON.shop,
        permission: PERMISSION.BRANCH_VIEW,
        feature: PLAN_FEATURE.BRANCHES,
        href: ROUTES.manage.shopBranches(),
        tracks: [PARTNER_TRACK.PACKAGE],
        hidden: true,
        activeAs: ROUTES.manage.shop(),
      },
      {
        // Chủ xe cá nhân cấu hình chính sách trên TỪNG xe (ADR 0085 điều 3).
        key: 'shop-policies',
        labelKey: 'manage.shopPolicies',
        icon: ICON.policies,
        permission: PERMISSION.TENANT_VIEW,
        href: ROUTES.manage.shopPolicies(),
        tracks: [PARTNER_TRACK.PACKAGE],
      },
      {
        key: 'members',
        labelKey: 'manage.staffPermissions',
        icon: ICON.members,
        permission: PERMISSION.MEMBER_VIEW,
        feature: PLAN_FEATURE.MEMBERS,
        href: ROUTES.manage.members(),
        tracks: [PARTNER_TRACK.PACKAGE],
      },
    ],
  },
  {
    key: 'support',
    labelKey: 'manageGroups.help',
    icon: ICON.help,
    pinned: true,
    children: [
      {
        key: 'support',
        labelKey: 'manage.support',
        icon: ICON.supportCenter,
        permission: PERMISSION.TENANT_VIEW,
        href: ROUTES.manage.support(),
        tracks: [PARTNER_TRACK.PACKAGE],
      },
      {
        key: 'host-guide',
        labelKey: 'account.hostGuide',
        icon: ICON.hostGuide,
        permission: PERMISSION.TENANT_VIEW,
        href: ROUTES.manage.hostGuide(),
        tracks: [PARTNER_TRACK.COMMISSION],
      },
      {
        key: 'contracts-documents',
        labelKey: 'account.contractsDocuments',
        icon: ICON.contracts,
        permission: PERMISSION.TENANT_VIEW,
        href: ROUTES.manage.contractsDocuments(),
        tracks: [PARTNER_TRACK.COMMISSION],
      },
      {
        key: 'data-protection',
        labelKey: 'account.dataProtection',
        icon: ICON.dataProtection,
        permission: PERMISSION.TENANT_VIEW,
        href: ROUTES.manage.dataProtection(),
        tracks: [PARTNER_TRACK.COMMISSION],
      },
      {
        // Bộ CƠ BẢN (ADR 0027 điều 1): tranh chấp có hệ quả tiền, không khoá sau gói.
        key: 'support-cases',
        labelKey: 'manage.supportCases',
        icon: ICON.supportCases,
        permission: PERMISSION.SUPPORT_VIEW,
        href: ROUTES.manage.supportCases(),
      },
    ],
  },
];

/** Cây của MỘT tuyến — bản native của `navForTrack` web. */
function navForTrack(
  sections: readonly ManageNavSection[],
  track: PartnerTrack,
): ManageNavSection[] {
  const leafFor = (leaf: ManageNavLeaf): ManageNavLeaf | null => {
    if (leaf.tracks && !leaf.tracks.includes(track)) return null;
    return track === PARTNER_TRACK.COMMISSION && leaf.commission
      ? { ...leaf, ...leaf.commission }
      : leaf;
  };
  return sections
    .map((section) => ({
      ...section,
      children: section.children
        .map((node): ManageNavNode | null => {
          if (!isManageNavBranch(node)) return leafFor(node);
          const children = node.children
            .map(leafFor)
            .filter((leaf): leaf is ManageNavLeaf => leaf !== null);
          return children.length > 0 ? { ...node, children } : null;
        })
        .filter((node): node is ManageNavNode => node !== null),
    }))
    .filter((section) => section.children.length > 0);
}

const SHOP_NAV: readonly ManageNavSection[] = navForTrack(PARTNER_NAV, PARTNER_TRACK.PACKAGE);
const COMMISSION_NAV: readonly ManageNavSection[] = navForTrack(
  PARTNER_NAV,
  PARTNER_TRACK.COMMISSION,
);

/**
 * Cây menu theo TUYẾN (web `navForZone(ZONE.PARTNER, track)`). Hai tuyến chưa vào được khu quản lý
 * không có menu (`ScopeGuard` giữ họ ở màn chọn tuyến/onboarding).
 */
export function manageNavForTrack(track: PartnerTrack): readonly ManageNavSection[] {
  if (track === PARTNER_TRACK.PACKAGE) return SHOP_NAV;
  if (track === PARTNER_TRACK.COMMISSION) return COMMISSION_NAV;
  return [];
}

/** Trải phẳng mọi mục lá (kể cả mục ẩn) — cùng vai trò `flattenLeaves` của web. */
export function flattenManageLeaves(
  sections: readonly ManageNavSection[],
): readonly ManageNavLeaf[] {
  return sections.flatMap((section) =>
    section.children.flatMap((node) => (isManageNavBranch(node) ? [...node.children] : [node])),
  );
}

/** Mục được VẼ của một khối (bỏ mục ẩn). */
export function visibleNodes(section: ManageNavSection): readonly ManageNavNode[] {
  return section.children.filter((node) => isManageNavBranch(node) || node.hidden !== true);
}

/**
 * `href` của ĐÚNG MỘT mục đang mở: mục có href là tiền tố DÀI NHẤT của đường dẫn hiện tại — bản
 * native của `matchSelectedKey` web. Mục ẩn khớp thì trả mục HIỆN mà nó thuộc về (`activeAs`).
 *
 * Tổng quan (`/manage`) chỉ khớp TUYỆT ĐỐI — nó là tiền tố của mọi trang trong khu quản lý.
 */
export function matchActiveHref(
  pathname: string,
  leaves: readonly ManageNavLeaf[],
  homeHref: string,
): string | null {
  let best: ManageNavLeaf | null = null;
  let bestLength = -1;

  for (const leaf of leaves) {
    if (!leaf.href) continue;
    const target = String(leaf.href);
    const matches =
      pathname === target || (target !== homeHref && pathname.startsWith(`${target}/`));
    if (matches && target.length > bestLength) {
      best = leaf;
      bestLength = target.length;
    }
  }
  if (!best) return null;
  return String(best.activeAs ?? best.href);
}

/**
 * Ô của thanh menu dưới đáy app Partner — Figma Partner-XePrime `Menu MB` (`24175:37780`).
 *
 * Design app CHIA cây menu thành năm ô theo KHỐI, không phải bốn đích chính + "Thêm" như web
 * `PARTNER_MOBILE_TABS`: Tổng quan · Vận hành · Xe & Tài xế · Doanh thu · Tài khoản. Mỗi ô ôm trọn
 * một khối của `PARTNER_NAV` (cùng mục, cùng thứ tự, cùng luật ẩn/hiện); ô Tài khoản ôm hai khối
 * còn lại — Cấu hình và Trợ giúp — trên màn "Tài khoản của tôi" (`ROUTES.manage.more()`).
 *
 * Mô hình chỉ nói ô nào gom KHỐI nào; ô hiện khi còn mục được phép trong khối của nó (thanh tab tự
 * lọc bằng `resolveSections`), biểu tượng là việc của thanh tab.
 */
export const MANAGE_MENU_TAB = {
  OVERVIEW: 'overview',
  OPERATIONS: 'operations',
  FLEET: 'fleet',
  REVENUE: 'revenue',
  ACCOUNT: 'account',
} as const;

export type ManageMenuTabKey = (typeof MANAGE_MENU_TAB)[keyof typeof MANAGE_MENU_TAB];

export interface ManageMenuTab {
  readonly key: ManageMenuTabKey;
  readonly labelKey: ManageNavLabel;
  /** Khối của `PARTNER_NAV` mà ô gom (theo `ManageNavSection.key`). */
  readonly sections: readonly string[];
  /** Ô dẫn thẳng tới một MÀN (Tài khoản) thay vì mở danh sách mục của khối. */
  readonly href?: Href;
}

const PARTNER_MENU_TABS: readonly ManageMenuTab[] = [
  { key: MANAGE_MENU_TAB.OVERVIEW, labelKey: 'manageGroups.overview', sections: ['overview'] },
  {
    key: MANAGE_MENU_TAB.OPERATIONS,
    labelKey: 'manageGroups.partnerOperations',
    sections: ['operations'],
  },
  { key: MANAGE_MENU_TAB.FLEET, labelKey: 'manageGroups.fleet', sections: ['fleet'] },
  { key: MANAGE_MENU_TAB.REVENUE, labelKey: 'manageGroups.revenue', sections: ['revenue'] },
  {
    key: MANAGE_MENU_TAB.ACCOUNT,
    labelKey: 'manageGroups.account',
    sections: ['settings', 'support'],
    href: ROUTES.manage.more(),
  },
];

/** Năm ô theo tuyến — hai tuyến chưa vào được khu quản lý không có thanh menu. */
export function manageMenuTabsForTrack(track: PartnerTrack): readonly ManageMenuTab[] {
  return track === PARTNER_TRACK.PACKAGE || track === PARTNER_TRACK.COMMISSION
    ? PARTNER_MENU_TABS
    : [];
}
