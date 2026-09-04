import {
  ApartmentOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  CalendarOutlined,
  CarOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  HistoryOutlined,
  InboxOutlined,
  LineChartOutlined,
  MessageOutlined,
  PictureOutlined,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  SolutionOutlined,
  TeamOutlined,
  ToolOutlined,
  TransactionOutlined,
  UnorderedListOutlined,
  UsergroupAddOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';

import { PERMISSION, PLAN_FEATURE, type Permission, type PlanFeature } from '@xeprime/types';
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
 * Con số "cần bạn xử lý" gắn trên một mục menu.
 *
 * Chỉ có hai — và cố ý chỉ có hai. Huy hiệu là lời kêu gọi hành động chứ không phải thống kê:
 * đếm số xe hay số khách lên sidebar thì mục nào cũng sáng và không mục nào còn nghĩa gì.
 * Nguồn số nằm ở `useNavBadges`; ở đây chỉ khai báo mục nào ĐƯỢC PHÉP mang huy hiệu.
 */
export const NAV_BADGE = {
  /** Yêu cầu đặt xe đang chờ gian hàng duyệt. */
  BOOKING_REQUESTS_PENDING: 'bookingRequestsPending',
  /** Tin nhắn chưa đọc. */
  CHAT_UNREAD: 'chatUnread',
} as const;

export type NavBadgeKey = (typeof NAV_BADGE)[keyof typeof NAV_BADGE];

/**
 * Mục menu dẫn tới một trang.
 *
 * `permission` chỉ dùng để ẩn/hiện — guard backend mới chặn thật (CLAUDE.md mục 6).
 */
export interface NavLeaf {
  readonly type?: 'leaf';
  readonly key: string;
  /** Khoá trong namespace `Navigation` — nhãn dựng lúc render theo ngôn ngữ. */
  readonly labelKey: NavLabelKey;
  readonly href: string;
  readonly permission: Permission;
  readonly icon: ComponentType<{ className?: string }>;
  readonly badge?: NavBadgeKey;
  /**
   * Tính năng NÂNG CAO mà trang này thuộc về (ADR 0027) — TRỤC THỨ HAI, độc lập với
   * `permission`. Cả hai phải cùng đạt thì mục mới hiện.
   *
   * `hidden` ⇒ vắng khỏi menu (sản phẩm của chủ xe trông gọn, không trông cụt).
   * `read_only` ⇒ VẪN hiện — không ai được mất lối vào sổ sách của chính mình vì hết hạn gói.
   *
   * Không có cờ = bậc cơ bản, không gói nào ẩn được. Đây cũng là bản đồ `href → feature` mà
   * `AppShell` tra để dựng băng "hết hạn" — nên nó là nguồn DUY NHẤT, không đẻ bản đồ thứ hai.
   */
  readonly feature?: PlanFeature;
}

/**
 * Mục cha mở ra vài mục con (submenu cấp 2) — bản thân KHÔNG dẫn tới trang nào.
 *
 * Dùng đúng ba chỗ mà nghiệp vụ là một nhưng route thì nhiều: "Xe của tôi" (danh sách xe +
 * trung tâm bảo dưỡng), "Đơn thuê" (yêu cầu đặt xe + đơn đã chốt) và "Tài chính" (doanh thu +
 * thu chi + công nợ). Gộp ở tầng ĐIỀU HƯỚNG chứ không gộp route: mọi trang cũ giữ nguyên URL,
 * quyền và hành vi.
 */
export interface NavBranch {
  readonly type: 'branch';
  readonly key: string;
  readonly labelKey: NavLabelKey;
  readonly icon: ComponentType<{ className?: string }>;
  readonly children: readonly NavLeaf[];
}

export type NavNode = NavLeaf | NavBranch;

/**
 * Khối chức năng của sidebar: nhãn nhỏ in hoa + vài mục bên dưới.
 *
 * Đây là tầng làm cho sidebar đọc được trong năm giây — mỗi khối trả lời một câu hỏi của chủ
 * xe ("hôm nay chạy thế nào", "vận hành cái gì", "tiền nong ra sao", "chỉnh ở đâu"), thay cho
 * 18 mục ngang cấp không có thứ bậc.
 *
 * `pinned` = luôn hiện, không có nút gập: Tổng quan (điểm bắt đầu) và Hỗ trợ (lối thoát).
 */
export interface NavSection {
  readonly key: string;
  readonly labelKey: NavLabelKey;
  readonly children: readonly NavNode[];
  readonly pinned?: boolean;
}

export function isNavBranch(node: NavNode): node is NavBranch {
  return node.type === 'branch';
}

/**
 * Sidebar của GIAN HÀNG — sắp theo hành trình của chủ xe, không theo bảng chức năng.
 *
 * Trật tự có chủ đích: xem tình hình → vận hành đội xe và đơn → chăm khách & tiền → mặt tiền
 * trên marketplace → cấu hình (đụng một lần rồi thôi) → hỗ trợ. Không mục nào bị xoá so với
 * bản 18-mục-ngang-cấp: ba mục lui xuống làm mục con (Bảo dưỡng, Thu chi, Công nợ), Đơn đặt xe
 * thành mục con của Đơn thuê, Thùng rác lui về Cấu hình.
 */
export const SHOP_NAV: readonly NavSection[] = [
  {
    key: 'overview',
    labelKey: 'manageGroups.overview',
    pinned: true,
    children: [
      {
        key: 'dashboard',
        labelKey: 'manage.dashboard',
        href: ROUTES.MANAGE.ROOT,
        permission: PERMISSION.TENANT_VIEW,
        icon: DashboardOutlined,
      },
    ],
  },
  {
    key: 'operations',
    labelKey: 'manageGroups.operations',
    children: [
      {
        type: 'branch',
        key: 'fleet',
        labelKey: 'manage.myVehicles',
        icon: CarOutlined,
        children: [
          {
            key: 'vehicles',
            labelKey: 'manage.vehicleList',
            href: ROUTES.MANAGE.VEHICLES,
            permission: PERMISSION.VEHICLE_VIEW,
            icon: UnorderedListOutlined,
          },
          {
            // Bảo dưỡng là việc CỦA XE, không phải nghiệp vụ ngang hàng với xe — nên nó nằm
            // dưới đội xe. Trang toàn đội giữ nguyên route; bảo dưỡng của MỘT xe vẫn ở tab
            // trong hồ sơ xe (`VEHICLE_EDIT_TAB.MAINTENANCE`).
            key: 'maintenance',
            labelKey: 'manage.maintenance',
            href: ROUTES.MANAGE.MAINTENANCE,
            permission: PERMISSION.VEHICLE_MAINTENANCE_VIEW,
            icon: ToolOutlined,
            feature: PLAN_FEATURE.MAINTENANCE,
          },
        ],
      },
      {
        key: 'calendar',
        labelKey: 'manage.calendar',
        href: ROUTES.MANAGE.CALENDAR,
        permission: PERMISSION.CALENDAR_VIEW,
        icon: CalendarOutlined,
      },
      {
        type: 'branch',
        key: 'orders',
        labelKey: 'manage.orders',
        icon: FileTextOutlined,
        children: [
          {
            // Yêu cầu khách gửi lên, CHƯA phải đơn thuê: thực thể riêng, quyền riêng, luồng
            // duyệt riêng. Không gộp được vào tab của `/manage/bookings` mà không đổi hành vi
            // trang đó — nên gộp ở tầng menu. Đứng trước vì đây là việc phải làm trong ngày.
            key: 'booking-requests',
            labelKey: 'manage.bookingRequests',
            href: ROUTES.MANAGE.BOOKING_REQUESTS,
            permission: PERMISSION.BOOKING_REQUEST_VIEW,
            icon: InboxOutlined,
            badge: NAV_BADGE.BOOKING_REQUESTS_PENDING,
          },
          {
            key: 'bookings',
            labelKey: 'manage.bookings',
            href: ROUTES.MANAGE.BOOKINGS,
            permission: PERMISSION.BOOKING_VIEW,
            icon: FileDoneOutlined,
          },
        ],
      },
      {
        key: 'customers',
        labelKey: 'manage.customers',
        href: ROUTES.MANAGE.CUSTOMERS,
        // Quyền RIÊNG `customers.view`, không mượn `bookings.view`: xem sổ khách và xem đơn
        // thuê là hai việc khác nhau.
        permission: PERMISSION.CUSTOMER_VIEW,
        icon: TeamOutlined,
      },
    ],
  },
  {
    key: 'business',
    labelKey: 'manageGroups.business',
    children: [
      {
        key: 'chat',
        labelKey: 'manage.chat',
        href: ROUTES.MANAGE.CHAT,
        permission: PERMISSION.TENANT_VIEW,
        icon: MessageOutlined,
        badge: NAV_BADGE.CHAT_UNREAD,
      },
      {
        type: 'branch',
        key: 'finance',
        labelKey: 'manage.finance',
        icon: WalletOutlined,
        children: [
          {
            key: 'finance-overview',
            labelKey: 'manage.financeOverview',
            href: ROUTES.MANAGE.FINANCE,
            permission: PERMISSION.FINANCE_VIEW,
            icon: LineChartOutlined,
            feature: PLAN_FEATURE.FINANCE,
          },
          {
            key: 'receipts',
            labelKey: 'manage.receipts',
            href: ROUTES.MANAGE.RECEIPTS,
            permission: PERMISSION.FINANCE_VIEW,
            icon: TransactionOutlined,
            feature: PLAN_FEATURE.FINANCE,
          },
          {
            key: 'debts',
            labelKey: 'manage.debts',
            href: ROUTES.MANAGE.DEBTS,
            permission: PERMISSION.FINANCE_VIEW,
            icon: CreditCardOutlined,
            feature: PLAN_FEATURE.DEBTS,
          },
        ],
      },
    ],
  },
  {
    key: 'storefront',
    labelKey: 'manageGroups.storefront',
    children: [
      {
        key: 'shop',
        labelKey: 'manage.shop',
        href: ROUTES.MANAGE.SHOP,
        permission: PERMISSION.TENANT_VIEW,
        icon: ShopOutlined,
      },
    ],
  },
  {
    key: 'settings',
    labelKey: 'manageGroups.settings',
    children: [
      {
        key: 'shop-policies',
        labelKey: 'manage.shopPolicies',
        href: ROUTES.MANAGE.SHOP_POLICIES,
        permission: PERMISSION.TENANT_VIEW,
        icon: SafetyCertificateOutlined,
      },
      {
        // "Gói của tôi" (W2, ADR 0015/0026): quyền RIÊNG `subscription.view` — xem gói/hạn mức
        // là việc điều hành, mua gói (`subscription.purchase`) server chặn riêng.
        key: 'subscription',
        labelKey: 'manage.subscription',
        href: ROUTES.MANAGE.SUBSCRIPTION,
        permission: PERMISSION.SUBSCRIPTION_VIEW,
        icon: CreditCardOutlined,
      },
      {
        key: 'shop-branches',
        labelKey: 'manage.shopBranches',
        href: ROUTES.MANAGE.SHOP_BRANCHES,
        permission: PERMISSION.BRANCH_VIEW,
        icon: ApartmentOutlined,
        feature: PLAN_FEATURE.BRANCHES,
      },
      {
        key: 'drivers',
        labelKey: 'manage.drivers',
        href: ROUTES.MANAGE.DRIVERS,
        permission: PERMISSION.DRIVER_VIEW,
        icon: SolutionOutlined,
        feature: PLAN_FEATURE.DRIVERS,
      },
      {
        key: 'members',
        labelKey: 'manage.members',
        href: ROUTES.MANAGE.MEMBERS,
        permission: PERMISSION.MEMBER_VIEW,
        icon: UsergroupAddOutlined,
        feature: PLAN_FEATURE.MEMBERS,
      },
    ],
  },
  {
    key: 'support',
    labelKey: 'manageGroups.support',
    pinned: true,
    children: [
      {
        key: 'support',
        labelKey: 'manage.support',
        href: ROUTES.MANAGE.SUPPORT,
        permission: PERMISSION.TENANT_VIEW,
        icon: QuestionCircleOutlined,
      },
    ],
  },
];

/**
 * Sidebar của NỀN TẢNG (platform_admin/staff).
 *
 * Cùng mô hình khối như gian hàng, nhưng KHÔNG đổi thứ tự hay cách gom: bản thiết kế lại lần
 * này nói về hành trình của chủ xe. Đổi cả hai cây trong một nhịp là gộp hai quyết định khác
 * nhau vào cùng một diff.
 */
export const PLATFORM_NAV: readonly NavSection[] = [
  {
    key: 'overview',
    labelKey: 'manageGroups.overview',
    pinned: true,
    children: [
      {
        key: 'platform-dashboard',
        labelKey: 'manage.dashboard',
        href: ROUTES.MANAGE.ROOT,
        permission: PERMISSION.PLATFORM_DASHBOARD_VIEW,
        icon: DashboardOutlined,
      },
    ],
  },
  {
    key: 'platform',
    labelKey: 'manageGroups.platform',
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
        // Cùng quyền với quản trị gói: cả hai đều là việc TIỀN của nền tảng, và
        // `finance_admin` có sẵn quyền đó.
        key: 'admin-bank-transactions',
        labelKey: 'platform.bankTransactions',
        href: ROUTES.MANAGE.ADMIN_BANK_TRANSACTIONS,
        permission: PERMISSION.PLATFORM_BILLING_MANAGE,
        icon: BankOutlined,
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
export function navForScope(isPlatform: boolean): readonly NavSection[] {
  return isPlatform ? PLATFORM_NAV : SHOP_NAV;
}

/**
 * Tab trên thanh điều hướng dưới đáy (mobile). Tab "Thêm" mở Drawer, thêm ở component.
 *
 * `permission` lọc như sidebar — thanh tab không được dẫn tới trang mà API sẽ trả 403. Đây chỉ
 * là lớp trải nghiệm; chặn thật vẫn nằm ở guard backend (CLAUDE.md mục 6).
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
  readonly badge?: NavBadgeKey;
  /**
   * Cùng nghĩa với `NavLeaf.feature` (ADR 0027). Bốn tab hiện tại đều là bậc cơ bản nên chưa tab
   * nào dùng — trường có mặt để lần sau không ai thêm được một tab bị gác mà quên lọc.
   */
  readonly feature?: PlanFeature;
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
    labelKey: 'manage.bookingRequestsShort',
    href: ROUTES.MANAGE.BOOKING_REQUESTS,
    permission: PERMISSION.BOOKING_REQUEST_VIEW,
    icon: InboxOutlined,
    badge: NAV_BADGE.BOOKING_REQUESTS_PENDING,
  },
  {
    key: 'bookings',
    labelKey: 'manage.bookingsShort',
    href: ROUTES.MANAGE.BOOKINGS,
    permission: PERMISSION.BOOKING_VIEW,
    icon: FileDoneOutlined,
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

/** Mọi mục lá của một khối, không phân biệt nằm trực tiếp hay trong một mục cha. */
export function leavesOfSection(section: NavSection): NavLeaf[] {
  return section.children.flatMap((node) => (isNavBranch(node) ? [...node.children] : [node]));
}

/** Trải phẳng mọi mục lá của một cây menu. */
export function flattenLeaves(sections: readonly NavSection[]): NavLeaf[] {
  return sections.flatMap(leavesOfSection);
}

/**
 * Key menu khớp với đường dẫn hiện tại: ưu tiên khớp tuyệt đối, nếu không thì lấy mục lá
 * có href là tiền tố dài nhất (để `/manage/vehicles/new` vẫn sáng mục "Danh sách xe").
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

/**
 * Khối chứa mục đang mở — khối đó phải bung ra dù người dùng đã gập nó lại, nếu không sẽ có
 * một trang "đang mở" mà không nhìn thấy trong menu.
 */
export function sectionKeyOf(
  sections: readonly NavSection[],
  selectedHref: string | undefined,
): string | undefined {
  if (!selectedHref) return undefined;
  return sections.find((section) =>
    leavesOfSection(section).some((leaf) => leaf.href === selectedHref),
  )?.key;
}

/** Mục cha (submenu) chứa mục đang mở — để bung sẵn đúng submenu. */
export function branchKeyOf(
  sections: readonly NavSection[],
  selectedHref: string | undefined,
): string | undefined {
  if (!selectedHref) return undefined;
  for (const section of sections) {
    for (const node of section.children) {
      if (isNavBranch(node) && node.children.some((leaf) => leaf.href === selectedHref)) {
        return node.key;
      }
    }
  }
  return undefined;
}
