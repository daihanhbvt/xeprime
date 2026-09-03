import type { Href } from 'expo-router';
import { PERMISSION, type Permission } from '@xeprime/types';
import type { IconName } from '@/components/ui/Chip';
import { ROUTES } from '@/navigation/routes';

/**
 * Cây menu khu quản lý — gương của `apps/web/src/constants/nav.ts`: cùng KHOÁ, cùng khối, cùng
 * THỨ BẬC, cùng quyền, cùng chỗ gắn huy hiệu. Khác web đúng hai chỗ, cả hai là chuyện nền tảng:
 *
 *  1. **Biểu tượng** là tên Ionicons chứ không phải component AntD.
 *  2. **`href` có thể vắng.** Khu quản lý trên app mới dựng vài màn; mục chưa có màn thì vẫn HIỆN
 *     đúng chỗ của nó trong menu và chạm vào báo "đang phát triển". Đây chính là quy ước
 *     `comingSoon` của web ("chưa làm thì để menu trống") — ẩn đi thì người dùng không biết
 *     chức năng có tồn tại, và menu hai nền tảng đọc ra hai sản phẩm khác nhau.
 *
 * Vì sao CHÉP chứ không đưa vào `packages/domain`: cây này neo vào `Href` của expo-router và vào
 * bộ icon của từng client — hai thứ không thể sống trong một package framework-free. Phần THẬT SỰ
 * dùng chung (mã quyền `PERMISSION`, nhãn ở namespace `Navigation`) thì vẫn dùng chung, nên hai
 * bên không thể lệch nhau về quyền hay về chữ.
 *
 * `permission` chỉ để ẩn/hiện — guard backend mới là lớp chặn thật (CLAUDE.md mục 6).
 */

/** Khoá nhãn trong namespace `Navigation`. Ghép động sẽ lọt typecheck của `use-intl`. */
export type ManageNavLabel = string;

/** Chỗ ĐƯỢC PHÉP mang huy hiệu "cần xử lý" — đúng hai, y như web. */
export const MANAGE_NAV_BADGE = {
  BOOKING_REQUESTS_PENDING: 'bookingRequestsPending',
  CHAT_UNREAD: 'chatUnread',
} as const;

export type ManageNavBadge = (typeof MANAGE_NAV_BADGE)[keyof typeof MANAGE_NAV_BADGE];

/** Mục dẫn tới một trang. `href` vắng = màn chưa dựng ở app. */
export interface ManageNavLeaf {
  readonly type?: 'leaf';
  readonly key: string;
  readonly labelKey: ManageNavLabel;
  readonly icon: IconName;
  readonly permission: Permission;
  readonly href?: Href;
  readonly badge?: ManageNavBadge;
}

/**
 * Mục cha mở ra vài mục con — bản thân KHÔNG dẫn tới trang nào.
 *
 * Đúng ba chỗ, y như web, và vì cùng lý do: nghiệp vụ là MỘT nhưng route thì nhiều. "Xe của tôi"
 * (danh sách + bảo dưỡng), "Đơn thuê" (yêu cầu đặt xe + đơn đã chốt), "Tài chính" (doanh thu +
 * thu chi + công nợ). Gộp ở tầng ĐIỀU HƯỚNG chứ không gộp route: mọi trang giữ nguyên URL,
 * quyền và hành vi.
 *
 * Mục cha không có `permission` riêng — nó hiện khi CÒN ÍT NHẤT MỘT mục con được phép, đúng cách
 * web lọc. Cho nó một quyền riêng là tạo ra cửa thứ hai có thể khoá nhầm cả nhánh.
 */
export interface ManageNavBranch {
  readonly type: 'branch';
  readonly key: string;
  readonly labelKey: ManageNavLabel;
  readonly icon: IconName;
  readonly children: readonly ManageNavLeaf[];
}

export type ManageNavNode = ManageNavLeaf | ManageNavBranch;

export function isManageNavBranch(node: ManageNavNode): node is ManageNavBranch {
  return node.type === 'branch';
}

export interface ManageNavSection {
  readonly key: string;
  readonly labelKey: ManageNavLabel;
  /** Khối luôn bung, không gập được — Tổng quan và Hỗ trợ. */
  readonly pinned?: boolean;
  readonly children: readonly ManageNavNode[];
}

/**
 * Menu GIAN HÀNG — cùng trật tự với web: xem tình hình → vận hành đội xe và đơn → chăm khách &
 * tiền → mặt tiền trên marketplace → cấu hình → hỗ trợ.
 */
const SHOP_NAV: readonly ManageNavSection[] = [
  {
    key: 'overview',
    labelKey: 'manageGroups.overview',
    pinned: true,
    children: [
      {
        key: 'dashboard',
        labelKey: 'manage.dashboard',
        icon: 'speedometer-outline',
        permission: PERMISSION.TENANT_VIEW,
        href: ROUTES.manage.home(),
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
        icon: 'car-outline',
        children: [
          {
            key: 'vehicles',
            labelKey: 'manage.vehicleList',
            icon: 'list-outline',
            permission: PERMISSION.VEHICLE_VIEW,
          },
          {
            key: 'maintenance',
            labelKey: 'manage.maintenance',
            icon: 'construct-outline',
            permission: PERMISSION.VEHICLE_MAINTENANCE_VIEW,
          },
        ],
      },
      {
        key: 'calendar',
        labelKey: 'manage.calendar',
        icon: 'calendar-outline',
        permission: PERMISSION.CALENDAR_VIEW,
      },
      {
        type: 'branch',
        key: 'orders',
        labelKey: 'manage.orders',
        icon: 'document-text-outline',
        children: [
          {
            key: 'booking-requests',
            labelKey: 'manage.bookingRequests',
            icon: 'mail-unread-outline',
            permission: PERMISSION.BOOKING_REQUEST_VIEW,
            href: ROUTES.manage.requests(),
            badge: MANAGE_NAV_BADGE.BOOKING_REQUESTS_PENDING,
          },
          {
            key: 'bookings',
            labelKey: 'manage.bookings',
            icon: 'checkbox-outline',
            permission: PERMISSION.BOOKING_VIEW,
            href: ROUTES.manage.bookings(),
          },
        ],
      },
      {
        key: 'customers',
        labelKey: 'manage.customers',
        icon: 'people-outline',
        permission: PERMISSION.CUSTOMER_VIEW,
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
        icon: 'chatbubble-ellipses-outline',
        permission: PERMISSION.TENANT_VIEW,
        badge: MANAGE_NAV_BADGE.CHAT_UNREAD,
      },
      {
        type: 'branch',
        key: 'finance',
        labelKey: 'manage.finance',
        icon: 'wallet-outline',
        children: [
          {
            key: 'finance-overview',
            labelKey: 'manage.financeOverview',
            icon: 'stats-chart-outline',
            permission: PERMISSION.FINANCE_VIEW,
          },
          {
            key: 'receipts',
            labelKey: 'manage.receipts',
            icon: 'swap-horizontal-outline',
            permission: PERMISSION.FINANCE_VIEW,
          },
          {
            key: 'debts',
            labelKey: 'manage.debts',
            icon: 'card-outline',
            permission: PERMISSION.FINANCE_VIEW,
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
        icon: 'storefront-outline',
        permission: PERMISSION.TENANT_VIEW,
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
        icon: 'shield-checkmark-outline',
        permission: PERMISSION.TENANT_VIEW,
      },
      {
        key: 'pickup-areas',
        labelKey: 'manage.pickupAreas',
        icon: 'location-outline',
        permission: PERMISSION.TENANT_VIEW,
      },
      {
        key: 'shop-branches',
        labelKey: 'manage.shopBranches',
        icon: 'git-network-outline',
        permission: PERMISSION.BRANCH_VIEW,
      },
      {
        key: 'drivers',
        labelKey: 'manage.drivers',
        icon: 'id-card-outline',
        permission: PERMISSION.DRIVER_VIEW,
      },
      {
        key: 'members',
        labelKey: 'manage.members',
        icon: 'person-add-outline',
        permission: PERMISSION.MEMBER_VIEW,
      },
      {
        key: 'trash',
        labelKey: 'manage.trash',
        icon: 'trash-outline',
        permission: PERMISSION.TENANT_VIEW,
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
        icon: 'help-circle-outline',
        permission: PERMISSION.TENANT_VIEW,
      },
    ],
  },
];

/** Menu NHÂN SỰ NỀN TẢNG — phẳng hoàn toàn, y như web (không mục cha nào). */
const PLATFORM_NAV: readonly ManageNavSection[] = [
  {
    key: 'overview',
    labelKey: 'manageGroups.overview',
    pinned: true,
    children: [
      {
        key: 'platform-dashboard',
        labelKey: 'manage.dashboard',
        icon: 'speedometer-outline',
        permission: PERMISSION.PLATFORM_DASHBOARD_VIEW,
        href: ROUTES.manage.home(),
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
        icon: 'checkmark-done-outline',
        permission: PERMISSION.PLATFORM_APPROVAL_REVIEW,
      },
      {
        key: 'admin-tenants',
        labelKey: 'platform.tenants',
        icon: 'business-outline',
        permission: PERMISSION.PLATFORM_TENANT_MANAGE,
      },
      {
        key: 'admin-vehicles',
        labelKey: 'platform.vehicles',
        icon: 'car-outline',
        permission: PERMISSION.PLATFORM_VEHICLE_VIEW,
      },
      {
        key: 'admin-bookings',
        labelKey: 'platform.bookings',
        icon: 'document-text-outline',
        permission: PERMISSION.PLATFORM_BOOKING_VIEW,
      },
      {
        key: 'admin-customers',
        labelKey: 'platform.customers',
        icon: 'people-outline',
        permission: PERMISSION.PLATFORM_CUSTOMER_VIEW,
      },
      {
        key: 'admin-staff',
        labelKey: 'platform.staff',
        icon: 'person-add-outline',
        permission: PERMISSION.PLATFORM_STAFF_MANAGE,
      },
      {
        key: 'admin-plans',
        labelKey: 'platform.plans',
        icon: 'card-outline',
        permission: PERMISSION.PLATFORM_BILLING_MANAGE,
      },
      {
        key: 'admin-banners',
        labelKey: 'platform.banners',
        icon: 'image-outline',
        permission: PERMISSION.PLATFORM_BANNER_MANAGE,
      },
      {
        key: 'admin-catalog',
        labelKey: 'platform.catalog',
        icon: 'apps-outline',
        permission: PERMISSION.PLATFORM_CATALOG_MANAGE,
      },
      {
        key: 'admin-locations',
        labelKey: 'platform.locations',
        icon: 'map-outline',
        permission: PERMISSION.PLATFORM_LOCATION_VIEW,
      },
      {
        key: 'admin-audit',
        labelKey: 'platform.audit',
        icon: 'time-outline',
        permission: PERMISSION.PLATFORM_AUDIT_VIEW,
      },
    ],
  },
];

/** Chọn cây menu theo scope — cùng luật với `navForScope` của web. */
export function manageNavForScope(isPlatform: boolean): readonly ManageNavSection[] {
  return isPlatform ? PLATFORM_NAV : SHOP_NAV;
}
