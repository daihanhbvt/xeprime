import {
  AppstoreOutlined,
  AuditOutlined,
  CalendarOutlined,
  CarOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  HistoryOutlined,
  MessageOutlined,
  PictureOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  SettingOutlined,
  ShopOutlined,
  SolutionOutlined,
  TeamOutlined,
  ToolOutlined,
  TransactionOutlined,
  UsergroupAddOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';

import { PERMISSION, type Permission } from '@xeprime/types';
import type { useTranslations } from 'next-intl';

import { ROUTES } from './routes';

/**
 * Khoá nhãn menu — một chuỗi trong namespace `Navigation`.
 *
 * Cây menu là DỮ LIỆU (route + quyền + biểu tượng), không phải chữ. Giữ khoá thay vì câu
 * tiếng Việt để cùng một cây phục vụ được cả hai ngôn ngữ, và để đổi cách gọi một mục chỉ
 * phải sửa ở bó message. `NavLabelKey` là union đóng lấy từ chính bó message tiếng Việt,
 * nên gõ sai khoá là lỗi biên dịch chứ không phải một mục menu trống trên production.
 */
export type NavLabelKey = Parameters<ReturnType<typeof useTranslations<'Navigation'>>>[0];

/**
 * Mục menu dẫn tới một trang.
 *
 * `permission` chỉ dùng để ẩn/hiện — guard backend mới chặn thật (CLAUDE.md mục 6).
 * `comingSoon` đánh dấu chức năng chưa làm: menu vẫn hiện nhưng trang là placeholder
 * (yêu cầu của chủ dự án: "chưa làm thì để menu trống").
 */
export interface NavLeaf {
  readonly type?: 'leaf';
  readonly key: string;
  /** Khoá trong namespace `Navigation` — nhãn dựng lúc render theo ngôn ngữ. */
  readonly labelKey: NavLabelKey;
  readonly href: string;
  readonly permission: Permission;
  readonly icon: ComponentType<{ className?: string }>;
  readonly comingSoon?: boolean;
}

/** Nhóm menu cha (submenu cấp 2) gom nhiều mục con. */
export interface NavGroup {
  readonly type: 'group';
  readonly key: string;
  readonly labelKey: NavLabelKey;
  readonly icon: ComponentType<{ className?: string }>;
  readonly children: readonly NavLeaf[];
}

export type NavNode = NavLeaf | NavGroup;

export function isNavGroup(node: NavNode): node is NavGroup {
  return node.type === 'group';
}

/**
 * Menu của gian hàng — bám theo giao diện Firebase-code (index.html), gom về 2 cấp:
 * Tổng quan · Quản lý · Cài đặt. Đã bỏ Phạt nguội / Nâng cấp xe / AI trợ lý theo yêu cầu.
 * Mục nào chưa dựng trang thật đánh `comingSoon`.
 */
export const SHOP_NAV: readonly NavNode[] = [
  {
    key: 'dashboard',
    labelKey: 'manage.dashboard',
    href: ROUTES.MANAGE.ROOT,
    permission: PERMISSION.TENANT_VIEW,
    icon: DashboardOutlined,
  },
  {
    type: 'group',
    key: 'operations',
    labelKey: 'manageGroups.operations',
    icon: AppstoreOutlined,
    children: [
      {
        key: 'calendar',
        labelKey: 'manage.calendar',
        href: ROUTES.MANAGE.CALENDAR,
        permission: PERMISSION.CALENDAR_VIEW,
        icon: CalendarOutlined,
      },
      {
        key: 'vehicles',
        labelKey: 'manage.vehicles',
        href: ROUTES.MANAGE.VEHICLES,
        permission: PERMISSION.VEHICLE_VIEW,
        icon: CarOutlined,
      },
      {
        key: 'maintenance',
        labelKey: 'manage.maintenance',
        href: ROUTES.MANAGE.MAINTENANCE,
        permission: PERMISSION.VEHICLE_MAINTENANCE_VIEW,
        icon: ToolOutlined,
      },
      {
        key: 'bookings',
        labelKey: 'manage.bookings',
        href: ROUTES.MANAGE.BOOKINGS,
        permission: PERMISSION.BOOKING_VIEW,
        icon: FileTextOutlined,
      },
      {
        key: 'booking-requests',
        labelKey: 'manage.bookingRequests',
        href: ROUTES.MANAGE.BOOKING_REQUESTS,
        permission: PERMISSION.BOOKING_REQUEST_VIEW,
        icon: ScheduleOutlined,
      },
      {
        key: 'customers',
        labelKey: 'manage.customers',
        href: ROUTES.MANAGE.CUSTOMERS,
        // Trang thật từ 18/08 (sổ khách của gian hàng — gap S-01). Quyền RIÊNG `customers.view`,
        // không mượn `bookings.view` như trước: xem sổ khách và xem đơn thuê là hai việc khác nhau.
        permission: PERMISSION.CUSTOMER_VIEW,
        icon: TeamOutlined,
      },
      {
        key: 'finance',
        labelKey: 'manage.finance',
        href: ROUTES.MANAGE.FINANCE,
        permission: PERMISSION.FINANCE_VIEW,
        icon: WalletOutlined,
      },
      {
        key: 'receipts',
        labelKey: 'manage.receipts',
        href: ROUTES.MANAGE.RECEIPTS,
        permission: PERMISSION.FINANCE_VIEW,
        icon: TransactionOutlined,
      },
      {
        key: 'debts',
        labelKey: 'manage.debts',
        href: ROUTES.MANAGE.DEBTS,
        permission: PERMISSION.FINANCE_VIEW,
        icon: CreditCardOutlined,
      },
    ],
  },
  {
    type: 'group',
    key: 'settings',
    labelKey: 'manageGroups.settings',
    icon: SettingOutlined,
    children: [
      {
        key: 'shop',
        labelKey: 'manage.shop',
        href: ROUTES.MANAGE.SHOP,
        permission: PERMISSION.TENANT_VIEW,
        icon: ShopOutlined,
      },
      {
        key: 'shop-branches',
        labelKey: 'manage.shopBranches',
        href: ROUTES.MANAGE.SHOP_BRANCHES,
        permission: PERMISSION.BRANCH_VIEW,
        icon: EnvironmentOutlined,
      },
      {
        key: 'shop-policies',
        labelKey: 'manage.shopPolicies',
        href: ROUTES.MANAGE.SHOP_POLICIES,
        permission: PERMISSION.TENANT_VIEW,
        icon: SafetyCertificateOutlined,
      },
      {
        key: 'members',
        labelKey: 'manage.members',
        href: ROUTES.MANAGE.MEMBERS,
        permission: PERMISSION.MEMBER_VIEW,
        icon: UsergroupAddOutlined,
      },
      {
        key: 'pickup-areas',
        labelKey: 'manage.pickupAreas',
        href: ROUTES.MANAGE.PICKUP_AREAS,
        permission: PERMISSION.TENANT_VIEW,
        icon: EnvironmentOutlined,
        comingSoon: true,
      },
      {
        key: 'drivers',
        labelKey: 'manage.drivers',
        href: ROUTES.MANAGE.DRIVERS,
        // Trang thật từ 17/08 (nghiệp vụ xe có tài xế) — hồ sơ tài xế + gán vào đơn.
        permission: PERMISSION.DRIVER_VIEW,
        icon: SolutionOutlined,
      },
      {
        key: 'chat',
        labelKey: 'manage.chat',
        href: ROUTES.MANAGE.CHAT,
        permission: PERMISSION.TENANT_VIEW,
        icon: MessageOutlined,
      },
      {
        key: 'trash',
        labelKey: 'manage.trash',
        href: ROUTES.MANAGE.TRASH,
        permission: PERMISSION.TENANT_VIEW,
        icon: DeleteOutlined,
        comingSoon: true,
      },
    ],
  },
];

/**
 * Menu của nền tảng (platform_admin/staff). Các chức năng quản trị chưa có UI nhưng đã có
 * permission trong RBAC — thêm vào đây để lộ dần, gate đúng quyền.
 */
export const PLATFORM_NAV: readonly NavNode[] = [
  {
    key: 'platform-dashboard',
    labelKey: 'manage.dashboard',
    href: ROUTES.MANAGE.ROOT,
    permission: PERMISSION.PLATFORM_DASHBOARD_VIEW,
    icon: DashboardOutlined,
  },
  {
    type: 'group',
    key: 'platform',
    labelKey: 'manageGroups.platform',
    icon: SafetyCertificateOutlined,
    children: [
      {
        key: 'approvals',
        labelKey: 'platform.approvals',
        href: ROUTES.MANAGE.ADMIN,
        permission: PERMISSION.PLATFORM_APPROVAL_REVIEW,
        icon: AuditOutlined,
      },
      {
        key: 'admin-tenants',
        labelKey: 'platform.tenants',
        href: ROUTES.MANAGE.ADMIN_TENANTS,
        permission: PERMISSION.PLATFORM_TENANT_MANAGE,
        icon: ShopOutlined,
      },
      {
        key: 'admin-vehicles',
        labelKey: 'platform.vehicles',
        href: ROUTES.MANAGE.ADMIN_VEHICLES,
        permission: PERMISSION.PLATFORM_VEHICLE_VIEW,
        icon: CarOutlined,
      },
      {
        key: 'admin-bookings',
        labelKey: 'platform.bookings',
        href: ROUTES.MANAGE.ADMIN_BOOKINGS,
        permission: PERMISSION.PLATFORM_BOOKING_VIEW,
        icon: FileTextOutlined,
      },
      {
        key: 'admin-customers',
        labelKey: 'platform.customers',
        href: ROUTES.MANAGE.ADMIN_CUSTOMERS,
        permission: PERMISSION.PLATFORM_CUSTOMER_VIEW,
        icon: TeamOutlined,
      },
      {
        key: 'admin-staff',
        labelKey: 'platform.staff',
        href: ROUTES.MANAGE.ADMIN_STAFF,
        permission: PERMISSION.PLATFORM_STAFF_MANAGE,
        icon: UsergroupAddOutlined,
      },
      {
        key: 'admin-plans',
        labelKey: 'platform.plans',
        href: ROUTES.MANAGE.ADMIN_PLANS,
        permission: PERMISSION.PLATFORM_BILLING_MANAGE,
        icon: CreditCardOutlined,
      },
      {
        key: 'admin-banners',
        labelKey: 'platform.banners',
        href: ROUTES.MANAGE.ADMIN_BANNERS,
        permission: PERMISSION.PLATFORM_BANNER_MANAGE,
        icon: PictureOutlined,
      },
      {
        key: 'admin-catalog',
        labelKey: 'platform.catalog',
        href: ROUTES.MANAGE.ADMIN_CATALOG,
        permission: PERMISSION.PLATFORM_CATALOG_MANAGE,
        icon: AppstoreOutlined,
      },
      {
        key: 'admin-locations',
        labelKey: 'platform.locations',
        href: ROUTES.MANAGE.ADMIN_LOCATIONS,
        permission: PERMISSION.PLATFORM_LOCATION_VIEW,
        icon: EnvironmentOutlined,
      },
      {
        key: 'admin-audit',
        labelKey: 'platform.audit',
        href: ROUTES.MANAGE.ADMIN_AUDIT,
        permission: PERMISSION.PLATFORM_AUDIT_VIEW,
        icon: HistoryOutlined,
      },
    ],
  },
];

/** Chọn cây menu theo scope: có platformRole → menu nền tảng, còn lại → menu gian hàng. */
export function navForScope(isPlatform: boolean): readonly NavNode[] {
  return isPlatform ? PLATFORM_NAV : SHOP_NAV;
}

/**
 * Tab trên thanh điều hướng dưới đáy (mobile). Tab "Thêm" mở Drawer, thêm ở component.
 *
 * `permission` thêm ở Wave 1D-C. Trước đó thanh tab KHÔNG lọc quyền trong khi sidebar thì có,
 * nên một vai trò tuỳ biến thiếu quyền vẫn thấy tab dẫn tới trang mà API sẽ trả 403. Đây chỉ
 * là lớp trải nghiệm — chặn thật vẫn nằm ở guard backend (CLAUDE.md mục 6).
 *
 * Đây là **tập con** của cây menu, không phải bản sao: 4 đích chính, phần còn lại nằm trong
 * Drawer "Thêm".
 */
export interface MobileTab {
  readonly key: string;
  readonly labelKey: NavLabelKey;
  readonly href: string;
  readonly permission: Permission;
  readonly icon: ComponentType<{ className?: string }>;
}

const SHOP_MOBILE_TABS: readonly MobileTab[] = [
  {
    key: 'dashboard',
    labelKey: 'manage.dashboard',
    href: ROUTES.MANAGE.ROOT,
    permission: PERMISSION.TENANT_VIEW,
    icon: DashboardOutlined,
  },
  {
    key: 'calendar',
    labelKey: 'manage.calendarShort',
    href: ROUTES.MANAGE.CALENDAR,
    permission: PERMISSION.CALENDAR_VIEW,
    icon: CalendarOutlined,
  },
  {
    key: 'booking-requests',
    labelKey: 'manage.bookingRequests',
    href: ROUTES.MANAGE.BOOKING_REQUESTS,
    permission: PERMISSION.BOOKING_REQUEST_VIEW,
    icon: ScheduleOutlined,
  },
  {
    key: 'bookings',
    labelKey: 'manage.bookings',
    href: ROUTES.MANAGE.BOOKINGS,
    permission: PERMISSION.BOOKING_VIEW,
    icon: FileTextOutlined,
  },
];

const PLATFORM_MOBILE_TABS: readonly MobileTab[] = [
  {
    key: 'dashboard',
    labelKey: 'manage.dashboard',
    href: ROUTES.MANAGE.ROOT,
    permission: PERMISSION.PLATFORM_DASHBOARD_VIEW,
    icon: DashboardOutlined,
  },
  {
    key: 'approvals',
    labelKey: 'platform.approvals',
    href: ROUTES.MANAGE.ADMIN,
    permission: PERMISSION.PLATFORM_APPROVAL_REVIEW,
    icon: AuditOutlined,
  },
  {
    key: 'admin-vehicles',
    labelKey: 'platform.vehiclesShort',
    href: ROUTES.MANAGE.ADMIN_VEHICLES,
    permission: PERMISSION.PLATFORM_VEHICLE_VIEW,
    icon: CarOutlined,
  },
  {
    key: 'admin-bookings',
    labelKey: 'platform.bookingsShort',
    href: ROUTES.MANAGE.ADMIN_BOOKINGS,
    permission: PERMISSION.PLATFORM_BOOKING_VIEW,
    icon: FileTextOutlined,
  },
];

/** 4 tab chính của bottom nav theo scope (tab "Thêm" do MobileNav tự thêm). */
export function mobileTabsForScope(isPlatform: boolean): readonly MobileTab[] {
  return isPlatform ? PLATFORM_MOBILE_TABS : SHOP_MOBILE_TABS;
}

/** Trải phẳng mọi mục lá của một cây menu. */
export function flattenLeaves(nodes: readonly NavNode[]): NavLeaf[] {
  return nodes.flatMap((node) => (isNavGroup(node) ? [...node.children] : [node]));
}

/**
 * Key menu khớp với đường dẫn hiện tại: ưu tiên khớp tuyệt đối, nếu không thì lấy mục lá
 * có href là tiền tố dài nhất (để `/manage/vehicles/new` vẫn sáng mục "Xe").
 * `/manage` (Tổng quan) chỉ khớp tuyệt đối, không thì mọi trang đều dính vì đều bắt đầu bằng nó.
 */
export function matchSelectedKey(pathname: string, leaves: readonly NavLeaf[]): string | undefined {
  let best: NavLeaf | undefined;
  for (const leaf of leaves) {
    const isMatch =
      pathname === leaf.href ||
      (leaf.href !== ROUTES.MANAGE.ROOT && pathname.startsWith(`${leaf.href}/`));
    if (isMatch && (!best || leaf.href.length > best.href.length)) {
      best = leaf;
    }
  }
  return best?.href;
}

/** Key nhóm cha chứa mục lá đang chọn — để mở sẵn đúng nhóm. */
export function groupKeyOf(nodes: readonly NavNode[], selectedHref: string | undefined): string[] {
  if (!selectedHref) return [];
  return nodes
    .filter(isNavGroup)
    .filter((group) => group.children.some((child) => child.href === selectedHref))
    .map((group) => group.key);
}
