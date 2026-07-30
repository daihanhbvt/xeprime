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
  SafetyCertificateOutlined,
  ScheduleOutlined,
  SettingOutlined,
  ShopOutlined,
  SolutionOutlined,
  TeamOutlined,
  TransactionOutlined,
  UsergroupAddOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';

import { PERMISSION, type Permission } from '@xeprime/types';

import { ROUTES } from './routes';

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
  readonly label: string;
  readonly href: string;
  readonly permission: Permission;
  readonly icon: ComponentType<{ className?: string }>;
  readonly comingSoon?: boolean;
}

/** Nhóm menu cha (submenu cấp 2) gom nhiều mục con. */
export interface NavGroup {
  readonly type: 'group';
  readonly key: string;
  readonly label: string;
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
    label: 'Tổng quan',
    href: ROUTES.MANAGE.ROOT,
    permission: PERMISSION.TENANT_VIEW,
    icon: DashboardOutlined,
  },
  {
    type: 'group',
    key: 'operations',
    label: 'Quản lý',
    icon: AppstoreOutlined,
    children: [
      {
        key: 'calendar',
        label: 'Lịch thuê xe',
        href: ROUTES.MANAGE.CALENDAR,
        permission: PERMISSION.CALENDAR_VIEW,
        icon: CalendarOutlined,
      },
      {
        key: 'vehicles',
        label: 'Xe',
        href: ROUTES.MANAGE.VEHICLES,
        permission: PERMISSION.VEHICLE_VIEW,
        icon: CarOutlined,
      },
      {
        key: 'bookings',
        label: 'Đơn thuê',
        href: ROUTES.MANAGE.BOOKINGS,
        permission: PERMISSION.BOOKING_VIEW,
        icon: FileTextOutlined,
      },
      {
        key: 'booking-requests',
        label: 'Đơn đặt xe',
        href: ROUTES.MANAGE.BOOKING_REQUESTS,
        permission: PERMISSION.BOOKING_REQUEST_VIEW,
        icon: ScheduleOutlined,
      },
      {
        key: 'customers',
        label: 'Khách hàng',
        href: ROUTES.MANAGE.CUSTOMERS,
        permission: PERMISSION.BOOKING_VIEW,
        icon: TeamOutlined,
        comingSoon: true,
      },
      {
        key: 'finance',
        label: 'Tài chính',
        href: ROUTES.MANAGE.FINANCE,
        permission: PERMISSION.FINANCE_VIEW,
        icon: WalletOutlined,
      },
      {
        key: 'receipts',
        label: 'Thu chi',
        href: ROUTES.MANAGE.RECEIPTS,
        permission: PERMISSION.FINANCE_VIEW,
        icon: TransactionOutlined,
      },
      {
        key: 'debts',
        label: 'Công nợ',
        href: ROUTES.MANAGE.DEBTS,
        permission: PERMISSION.FINANCE_VIEW,
        icon: CreditCardOutlined,
      },
    ],
  },
  {
    type: 'group',
    key: 'settings',
    label: 'Cài đặt',
    icon: SettingOutlined,
    children: [
      {
        key: 'shop',
        label: 'Cửa hàng',
        href: ROUTES.MANAGE.SHOP,
        permission: PERMISSION.TENANT_VIEW,
        icon: ShopOutlined,
      },
      {
        key: 'members',
        label: 'Người dùng',
        href: ROUTES.MANAGE.MEMBERS,
        permission: PERMISSION.MEMBER_VIEW,
        icon: UsergroupAddOutlined,
      },
      {
        key: 'pickup-areas',
        label: 'Khu vực nhận xe',
        href: ROUTES.MANAGE.PICKUP_AREAS,
        permission: PERMISSION.TENANT_VIEW,
        icon: EnvironmentOutlined,
        comingSoon: true,
      },
      {
        key: 'drivers',
        label: 'Tài xế',
        href: ROUTES.MANAGE.DRIVERS,
        permission: PERMISSION.TENANT_VIEW,
        icon: SolutionOutlined,
        comingSoon: true,
      },
      {
        key: 'chat',
        label: 'Trò chuyện',
        href: ROUTES.MANAGE.CHAT,
        permission: PERMISSION.TENANT_VIEW,
        icon: MessageOutlined,
      },
      {
        key: 'trash',
        label: 'Thùng rác',
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
    label: 'Tổng quan',
    href: ROUTES.MANAGE.ROOT,
    permission: PERMISSION.PLATFORM_DASHBOARD_VIEW,
    icon: DashboardOutlined,
  },
  {
    type: 'group',
    key: 'platform',
    label: 'Quản trị nền tảng',
    icon: SafetyCertificateOutlined,
    children: [
      {
        key: 'approvals',
        label: 'Duyệt hồ sơ',
        href: ROUTES.MANAGE.ADMIN,
        permission: PERMISSION.PLATFORM_APPROVAL_REVIEW,
        icon: AuditOutlined,
      },
      {
        key: 'admin-tenants',
        label: 'Gian hàng',
        href: ROUTES.MANAGE.ADMIN_TENANTS,
        permission: PERMISSION.PLATFORM_TENANT_MANAGE,
        icon: ShopOutlined,
      },
      {
        key: 'admin-staff',
        label: 'Nhân sự nền tảng',
        href: ROUTES.MANAGE.ADMIN_STAFF,
        permission: PERMISSION.PLATFORM_STAFF_MANAGE,
        icon: TeamOutlined,
        comingSoon: true,
      },
      {
        key: 'admin-audit',
        label: 'Nhật ký kiểm duyệt',
        href: ROUTES.MANAGE.ADMIN_AUDIT,
        permission: PERMISSION.PLATFORM_AUDIT_VIEW,
        icon: HistoryOutlined,
        comingSoon: true,
      },
    ],
  },
];

/** Chọn cây menu theo scope: có platformRole → menu nền tảng, còn lại → menu gian hàng. */
export function navForScope(isPlatform: boolean): readonly NavNode[] {
  return isPlatform ? PLATFORM_NAV : SHOP_NAV;
}

/** Tab trên thanh điều hướng dưới đáy (mobile). Tab "Thêm" mở Drawer, thêm ở component. */
export interface MobileTab {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: ComponentType<{ className?: string }>;
}

const SHOP_MOBILE_TABS: readonly MobileTab[] = [
  { key: 'dashboard', label: 'Tổng quan', href: ROUTES.MANAGE.ROOT, icon: DashboardOutlined },
  { key: 'calendar', label: 'Lịch xe', href: ROUTES.MANAGE.CALENDAR, icon: CalendarOutlined },
  {
    key: 'booking-requests',
    label: 'Đơn đặt xe',
    href: ROUTES.MANAGE.BOOKING_REQUESTS,
    icon: ScheduleOutlined,
  },
  { key: 'bookings', label: 'Đơn thuê', href: ROUTES.MANAGE.BOOKINGS, icon: FileTextOutlined },
];

const PLATFORM_MOBILE_TABS: readonly MobileTab[] = [
  { key: 'dashboard', label: 'Tổng quan', href: ROUTES.MANAGE.ROOT, icon: DashboardOutlined },
  { key: 'approvals', label: 'Duyệt hồ sơ', href: ROUTES.MANAGE.ADMIN, icon: AuditOutlined },
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
