import {
  AppstoreOutlined,
  AuditOutlined,
  CalendarOutlined,
  CarOutlined,
  CreditCardOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  FieldTimeOutlined,
  ExclamationCircleOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  GiftOutlined,
  HistoryOutlined,
  IdcardOutlined,
  InsuranceOutlined,
  MobileOutlined,
  PercentageOutlined,
  PictureOutlined,
  ShopOutlined,
  SolutionOutlined,
  TeamOutlined,
  UsergroupAddOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';

import {
  PERMISSION,
  PLAN_FEATURE,
  SUPPORT_WORKSPACE,
  type Permission,
  type PlanFeature,
  type SupportWorkspace,
} from '@xeprime/types';
import type { useTranslations } from 'next-intl';

import { PARTNER_NAV_ICON } from '@/components/icons/nav-icons';
import { PARTNER_TRACK, type PartnerTrack } from '@/features/auth/post-auth-destination';
import { ZONE, type Zone } from '@/zones';

import { ROUTES, adminTenantSupportPath, tenantSupportContextIdFromPath } from './routes';
import { tenantSupportHref } from './tenant-support-routes';

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
 * Huy hiệu là lời kêu gọi hành động chứ không phải thống kê: đếm số xe, số khách hay mọi đơn
 * đang thuê lên menu thì mục nào cũng sáng và không mục nào còn nghĩa gì. Một việc chỉ được đếm
 * ở MỘT mục — khối menu cộng số của các mục con, đếm trùng là thổi phồng con số trên nhãn khối.
 * Nguồn số nằm ở `useNavBadges`; ở đây chỉ khai báo mục nào ĐƯỢC PHÉP mang huy hiệu.
 */
export const NAV_BADGE = {
  /**
   * Mục "Đơn thuê xe" gộp (05/11/2026): yêu cầu CHỜ DUYỆT + lượt giao/trả ĐẾN HẠN (hẹn tới hết hôm
   * nay, gồm quá giờ) — hai việc của cùng một ca trực, cộng lại vì giờ chúng ở cùng một mục. Đỏ khi
   * có yêu cầu sắp hết hạn trả lời HOẶC lượt quá giờ. Không đếm chuyến chờ khách thanh toán: đó là
   * việc của khách.
   */
  RENTALS_WORK: 'rentalsWork',
  /** Tin nhắn chưa đọc. */
  CHAT_UNREAD: 'chatUnread',
  /**
   * Xe có việc chặn: giấy tờ quá hạn, quá hạn bảo dưỡng, bị trả về/từ chối/ẩn khi đăng chợ, thiếu
   * KM trả xe — "Danh sách xe" (03/11/2026, `VEHICLE_ALERT_NEEDS_ACTION_KINDS`).
   */
  VEHICLES_NEEDS_ACTION: 'vehiclesNeedsAction',
} as const;

export type NavBadgeKey = (typeof NAV_BADGE)[keyof typeof NAV_BADGE];

/**
 * Quyền để THẤY một mục menu: một quyền, hoặc một DANH SÁCH mà có BẤT KỲ quyền nào trong đó là
 * thấy — cho màn gộp nhiều hàng đợi, mỗi hàng đợi gác bằng quyền riêng ("Tài chính": tiền vào
 * gác bằng quyền gói, phần còn lại bằng quyền tiền). Chỉ là lớp ẩn/hiện; guard backend chặn thật.
 */
export type NavPermission = Permission | readonly Permission[];

export function isNavPermissionGranted(
  permission: NavPermission,
  has: (permission: Permission) => boolean,
): boolean {
  return typeof permission === 'string' ? has(permission) : permission.some(has);
}

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
  readonly permission: NavPermission;
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
  /**
   * TRỤC THỨ BA: **quyền sở hữu**, không phải phân quyền (ADR 0038 điều 3).
   *
   * Chỉ `shop_owner` — người CHỦ của gian hàng — mới thấy. Khác hẳn `permission`: quyền cấp
   * được, thu hồi được, và một `shop_manager` có thể được cấp gần như tất cả; sở hữu thì
   * không cấp cho ai. Ví là NGHĨA VỤ PHẢI TRẢ của XePrime với một người cụ thể, nên nó đi
   * theo người đó chứ không theo chức danh trong gian hàng.
   *
   * Tồn tại để menu KHỚP với `@ShopOwnerOnly()` ở API. Trước 15/09/2026 mục ví gác bằng
   * `seller_profile.view`, nên một `shop_manager` nhìn thấy mục, bấm vào, rồi nhận 403 — giao
   * diện mời họ vào một cánh cửa đã khoá. Cách sửa là hạ menu xuống đúng luật của guard,
   * KHÔNG phải nới guard cho khớp menu.
   */
  readonly ownerOnly?: true;
  /**
   * Chỉ sáng khi đường dẫn KHỚP TUYỆT ĐỐI, không nhận route con.
   *
   * Dành cho mục có `href` là tiền tố của cả một khu: "Kiểm duyệt xe" sống ở `/manage/admin`, tức
   * là tiền tố của MỌI trang quản trị. Để nó nhận route con thì một trang admin chưa có mục riêng
   * (URL cũ đang chuyển tiếp, một route mới quên khai) sẽ sáng nhầm "Kiểm duyệt xe".
   */
  readonly exact?: true;
  /**
   * Trang VẪN thuộc khối này nhưng không vẽ thành một dòng menu.
   *
   * Dùng cho trang mà design mới gom vào bên trong một màn khác ("Chờ giao xe" sẽ là tab của
   * "Quản lý đơn thuê xe", "Công nợ" sẽ nằm trong một màn Doanh thu) trong khi màn đó chưa dựng.
   * Mục ẩn vẫn tham gia mọi thứ KHÔNG phải vẽ: khớp đường dẫn (breadcrumb ra đúng khối), tra cờ gói
   * cho băng "hết hạn" ở `AppShell`, và lọc quyền. Bỏ hẳn khỏi cây là mất cả ba.
   *
   * Lối vào thật của nó phải ghi ở `docs/design/09_PARTNER_REDESIGN.md` §2 — trang không có lối vào
   * nào là tính năng đã mất.
   */
  readonly hidden?: true;
  /**
   * TUYẾN được thấy mục này — vắng = cả hai tuyến (ADR 0085 điều 1).
   *
   * Site partner có MỘT cây menu (`PARTNER_NAV`); cây của từng tuyến SUY từ nó lúc nạp module
   * (`navForTrack`), không viết tay lần thứ hai. Trục này cho mục server chặn theo tuyến
   * (`@SubscriptionTrackOnly()`) — dù mục đó có cờ gói hay không, vì cờ là DỮ LIỆU admin sửa được
   * còn ranh giới tuyến thì không. Chỉ là lớp ẩn/hiện; guard backend chặn thật.
   */
  readonly tracks?: readonly PartnerTrack[];
  /**
   * Bản của mục ở tuyến HOA HỒNG khi cùng trang mà khác cách gọi (ADR 0085 điều 2): `/shop` là
   * "Thông tin cửa hàng" với gian hàng, "Hồ sơ chủ xe" với chủ xe cá nhân — và chỉ CHỦ mới có trang
   * đó (nó sửa danh tính tài khoản của chính người xem).
   */
  readonly commission?: Partial<Pick<NavLeaf, 'labelKey' | 'icon' | 'ownerOnly'>>;
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
  /**
   * Biểu tượng của khối khi nó là một mục cấp 1 trên menu NGANG của site partner (`PartnerTopNav`).
   * Sidebar không vẽ biểu tượng khối — nó dùng nhãn nhỏ in hoa.
   */
  readonly icon?: ComponentType<{ className?: string }>;
  /**
   * Trên menu ngang: khối là MỘT liên kết thẳng tới mục lá đầu tiên của nó, không mở dropdown
   * ("Tổng quan" — Figma vẽ không có dấu +).
   */
  readonly direct?: true;
}

export function isNavBranch(node: NavNode): node is NavBranch {
  return node.type === 'branch';
}

/**
 * Menu SITE PARTNER — MỘT cây cho cả hai tuyến (ADR 0085 điều 1); menu NGANG của design
 * Partner-XePrime (Figma Header `23649:27690`, SubMenu `23661:27362`, 02/11/2026). Mỗi khối là một
 * mục cấp 1 trên thanh trên cùng, mở ra một dropdown phẳng; "Tổng quan" là liên kết thẳng (`direct`).
 *
 * Sáu khối, đúng thứ tự design: Tổng quan · Vận hành · Xe & Tài xế · Doanh thu · Cấu hình ·
 * Trợ giúp. Bản đồ cũ → mới, và mọi tính năng rời menu đã được chuyển về đâu, nằm ở
 * `docs/design/09_PARTNER_REDESIGN.md` §2 — sửa cây này thì sửa bảng đó trong cùng thay đổi.
 *
 * Chủ xe cá nhân dùng CHÍNH cây này, mục không áp dụng thì vắng (`tracks`); cây của từng tuyến là
 * `SHOP_NAV` / `COMMISSION_NAV` bên dưới, suy bằng `navForTrack`. Không có design riêng cho họ.
 *
 * Rời menu nhưng KHÔNG mất (xem §2 của tài liệu trên):
 *  - "Tin nhắn" → icon tin nhắn ở thanh trên (`ChatMenu`), không còn là một mục menu;
 *  - "Chờ giao xe", "Công nợ" → mục ẨN (`hidden`) trong khối của chúng: trang vẫn sống, vào từ
 *    Tổng quan / Tổng quan doanh thu, và sẽ thành tab trong màn mới khi có design;
 *  - "Chi nhánh" → section của "Thông tin cửa hàng" (`/shop?section=branches`), route cũ chuyển tiếp.
 *
 * Route KHÔNG đổi: mọi trang giữ URL, quyền và hành vi; chỉ cách nhóm trên menu đổi.
 */
const PARTNER_NAV: readonly NavSection[] = [
  {
    key: 'overview',
    labelKey: 'manageGroups.overview',
    icon: PARTNER_NAV_ICON.overview,
    pinned: true,
    direct: true,
    children: [
      {
        key: 'dashboard',
        labelKey: 'manage.dashboard',
        href: ROUTES.MANAGE.ROOT,
        permission: PERMISSION.TENANT_VIEW,
        icon: PARTNER_NAV_ICON.overview,
      },
    ],
  },
  {
    key: 'operations',
    labelKey: 'manageGroups.partnerOperations',
    icon: PARTNER_NAV_ICON.operations,
    children: [
      {
        /*
         * MỘT mục cho cả chuyến (05/11/2026): yêu cầu chờ duyệt → chờ khách trả → chờ giao → đang
         * thuê trên cùng màn "Đơn thuê xe". Yêu cầu và đơn vẫn là hai thực thể, hai quyền — thấy
         * mục khi có MỘT trong hai, nhóm của thực thể thiếu quyền tự vắng trên màn.
         *
         * Đứng ĐẦU khối (06/11/2026): bấm nhãn "Vận hành" trên menu ngang đi thẳng tới mục đầu tiên
         * của khối — việc hằng ngày là đơn, không phải lịch.
         */
        key: 'bookings',
        labelKey: 'manage.rentals',
        href: ROUTES.MANAGE.BOOKINGS,
        permission: [PERMISSION.BOOKING_REQUEST_VIEW, PERMISSION.BOOKING_VIEW],
        icon: PARTNER_NAV_ICON.bookings,
        badge: NAV_BADGE.RENTALS_WORK,
      },
      {
        key: 'calendar',
        labelKey: 'manage.rentalCalendar',
        href: ROUTES.MANAGE.CALENDAR,
        permission: PERMISSION.CALENDAR_VIEW,
        icon: PARTNER_NAV_ICON.calendar,
      },
      {
        key: 'customers',
        labelKey: 'manage.customerList',
        href: ROUTES.MANAGE.CUSTOMERS,
        // Quyền RIÊNG `customers.view`, không mượn `bookings.view`: xem sổ khách và xem đơn
        // thuê là hai việc khác nhau.
        permission: PERMISSION.CUSTOMER_VIEW,
        icon: PARTNER_NAV_ICON.customers,
        // Sổ khách là năng lực gói (ADR 0027 · 0056): chủ xe cá nhân có quyền nhưng không có trang.
        tracks: [PARTNER_TRACK.PACKAGE],
      },
    ],
  },
  {
    key: 'fleet',
    labelKey: 'manageGroups.fleet',
    icon: PARTNER_NAV_ICON.fleet,
    children: [
      {
        key: 'vehicles',
        labelKey: 'manage.vehicleList',
        href: ROUTES.MANAGE.VEHICLES,
        badge: NAV_BADGE.VEHICLES_NEEDS_ACTION,
        permission: PERMISSION.VEHICLE_VIEW,
        icon: PARTNER_NAV_ICON.vehicles,
      },
      {
        key: 'drivers',
        labelKey: 'manage.driverManagement',
        href: ROUTES.MANAGE.DRIVERS,
        permission: PERMISSION.DRIVER_VIEW,
        icon: PARTNER_NAV_ICON.drivers,
        // Không gác bằng cờ gói: tài xế mở cho cả hai tuyến (ADR 0063).
      },
      {
        // Trang toàn đội; bảo dưỡng của MỘT xe vẫn ở tab trong hồ sơ xe.
        key: 'maintenance',
        labelKey: 'manage.maintenance',
        href: ROUTES.MANAGE.MAINTENANCE,
        permission: PERMISSION.VEHICLE_MAINTENANCE_VIEW,
        icon: PARTNER_NAV_ICON.maintenance,
        feature: PLAN_FEATURE.MAINTENANCE,
        tracks: [PARTNER_TRACK.PACKAGE],
      },
    ],
  },
  {
    key: 'revenue',
    labelKey: 'manageGroups.revenue',
    icon: PARTNER_NAV_ICON.revenue,
    children: [
      {
        key: 'finance-overview',
        labelKey: 'manage.financeOverview',
        href: ROUTES.MANAGE.FINANCE,
        permission: PERMISSION.FINANCE_VIEW,
        icon: PARTNER_NAV_ICON.financeOverview,
        feature: PLAN_FEATURE.FINANCE,
        tracks: [PARTNER_TRACK.PACKAGE],
      },
      {
        /*
         * Ví: số dư thật, lệnh rút, tài khoản nhận tiền và thuế đã khấu trừ.
         *
         * KHÔNG gác bằng `feature`: số dư là tiền của chính gian hàng, gói hết hạn vẫn phải xem và
         * rút được (ADR 0027 điều 3, ADR 0033). Gác bằng SỞ HỮU (`ownerOnly`), khớp
         * `@ShopOwnerOnly()` ở API; `permission` hạ về mức mọi vai đều có.
         */
        key: 'balance',
        labelKey: 'manage.wallet',
        href: ROUTES.MANAGE.BALANCE,
        permission: PERMISSION.TENANT_VIEW,
        ownerOnly: true,
        icon: PARTNER_NAV_ICON.wallet,
      },
      {
        /*
         * "Lịch sử giao dịch" gồm hai tab: Giao dịch thu chi và Công nợ (`?view=debts`, design
         * 04/11/2026). Công nợ không còn là mục ẩn riêng — `/debts` cũ chuyển tiếp về tab đó.
         */
        key: 'receipts',
        labelKey: 'manage.transactionHistory',
        href: ROUTES.MANAGE.RECEIPTS,
        permission: PERMISSION.FINANCE_VIEW,
        icon: PARTNER_NAV_ICON.transactions,
        feature: PLAN_FEATURE.FINANCE,
        tracks: [PARTNER_TRACK.PACKAGE],
      },
    ],
  },
  {
    key: 'settings',
    labelKey: 'manageGroups.settings',
    icon: PARTNER_NAV_ICON.settings,
    children: [
      {
        /*
         * Toàn bộ thiết lập gian hàng: hiển thị · chủ gian hàng · địa chỉ & pháp lý · khai thuế ·
         * chi nhánh · gói & hạn mức. KHÔNG gác bằng `feature`: hồ sơ, tiền và gói của chính gian
         * hàng không bao giờ nằm sau cờ tính năng (ADR 0027 điều 3 · ADR 0038 điều 5); section
         * nào cần quyền/cờ riêng thì tự lọc bên trong.
         */
        key: 'shop',
        labelKey: 'manage.shopInfo',
        href: ROUTES.MANAGE.SHOP,
        permission: PERMISSION.TENANT_VIEW,
        icon: PARTNER_NAV_ICON.shop,
        /*
         * Chủ xe cá nhân: CÙNG trang, mặt tiền cá nhân (ADR 0085 điều 2). Chỉ CHỦ — thành viên của một
         * chủ xe cá nhân mở trang đó sẽ sửa danh tính tài khoản của chính họ dưới nhãn "Hồ sơ chủ xe".
         */
        commission: {
          labelKey: 'account.ownerProfile',
          icon: PARTNER_NAV_ICON.ownerProfile,
          ownerOnly: true,
        },
      },
      {
        // Chủ xe cá nhân cấu hình chính sách trên TỪNG xe, không có chính sách chung (ADR 0085 điều 3).
        key: 'shop-policies',
        labelKey: 'manage.shopPolicies',
        href: ROUTES.MANAGE.SHOP_POLICIES,
        permission: PERMISSION.TENANT_VIEW,
        icon: PARTNER_NAV_ICON.policies,
        tracks: [PARTNER_TRACK.PACKAGE],
      },
      {
        key: 'members',
        labelKey: 'manage.staffPermissions',
        href: ROUTES.MANAGE.MEMBERS,
        permission: PERMISSION.MEMBER_VIEW,
        icon: PARTNER_NAV_ICON.members,
        feature: PLAN_FEATURE.MEMBERS,
        tracks: [PARTNER_TRACK.PACKAGE],
      },
    ],
  },
  {
    key: 'support',
    labelKey: 'manageGroups.help',
    icon: PARTNER_NAV_ICON.help,
    pinned: true,
    children: [
      {
        // Trung tâm hỗ trợ của GIAN HÀNG: các thẻ "bắt đầu" trỏ vào trang chỉ tuyến gói.
        key: 'support',
        labelKey: 'manage.support',
        href: ROUTES.MANAGE.SUPPORT,
        permission: PERMISSION.TENANT_VIEW,
        icon: PARTNER_NAV_ICON.supportCenter,
        tracks: [PARTNER_TRACK.PACKAGE],
      },
      /*
       * Tài liệu cho người mới cho thuê — chỗ của chúng ở tuyến hoa hồng là đúng vị trí của "Trung
       * tâm hỗ trợ" bên gian hàng. Giữ nguyên ba mục khi gộp cây: bỏ chúng là mất tính năng.
       */
      {
        key: 'host-guide',
        labelKey: 'account.hostGuide',
        href: ROUTES.MANAGE.HOST_GUIDE,
        permission: PERMISSION.TENANT_VIEW,
        icon: PARTNER_NAV_ICON.hostGuide,
        tracks: [PARTNER_TRACK.COMMISSION],
      },
      {
        key: 'contracts-documents',
        labelKey: 'account.contractsDocuments',
        href: ROUTES.MANAGE.CONTRACTS_DOCUMENTS,
        permission: PERMISSION.TENANT_VIEW,
        icon: PARTNER_NAV_ICON.contracts,
        tracks: [PARTNER_TRACK.COMMISSION],
      },
      {
        key: 'data-protection',
        labelKey: 'account.dataProtection',
        href: ROUTES.MANAGE.DATA_PROTECTION,
        permission: PERMISSION.TENANT_VIEW,
        icon: PARTNER_NAV_ICON.dataProtection,
        tracks: [PARTNER_TRACK.COMMISSION],
      },
      {
        // Bộ CƠ BẢN (ADR 0027 điều 1): tranh chấp có hệ quả tiền, không được khoá sau gói.
        key: 'support-cases',
        labelKey: 'manage.supportCases',
        href: ROUTES.MANAGE.SUPPORT_CASES,
        permission: PERMISSION.SUPPORT_VIEW,
        icon: PARTNER_NAV_ICON.supportCases,
      },
    ],
  },
];

/**
 * Cây của MỘT tuyến, suy từ `PARTNER_NAV`: bỏ mục không thuộc tuyến (`tracks`), áp bản hoa hồng của
 * mục (`commission`), bỏ mục cha / khối không còn mục nào. Tính một lần lúc nạp module — hai cây là
 * hai hằng số, nên mọi nơi so `===` hay tra khối theo href vẫn chạy như với cây viết tay.
 */
function navForTrack(sections: readonly NavSection[], track: PartnerTrack): NavSection[] {
  const leafFor = (leaf: NavLeaf): NavLeaf | null => {
    if (leaf.tracks && !leaf.tracks.includes(track)) return null;
    return track === PARTNER_TRACK.COMMISSION && leaf.commission
      ? { ...leaf, ...leaf.commission }
      : leaf;
  };
  return sections
    .map((section) => ({
      ...section,
      children: section.children
        .map((node): NavNode | null => {
          if (!isNavBranch(node)) return leafFor(node);
          const children = node.children
            .map(leafFor)
            .filter((leaf): leaf is NavLeaf => leaf !== null);
          return children.length > 0 ? { ...node, children } : null;
        })
        .filter((node): node is NavNode => node !== null),
    }))
    .filter((section) => section.children.length > 0);
}

/** Menu của GIAN HÀNG tuyến gói (Full Manage). */
export const SHOP_NAV: readonly NavSection[] = navForTrack(PARTNER_NAV, PARTNER_TRACK.PACKAGE);

/**
 * Menu của chủ xe TUYẾN HOA HỒNG — CÙNG cây với gian hàng, ít mục hơn (ADR 0085 điều 1): không sổ
 * khách, bảo dưỡng, thu chi, chính sách chung, nhân viên, trung tâm hỗ trợ của gian hàng; "Thông
 * tin cửa hàng" thành "Hồ sơ chủ xe" (chỉ chủ); Trợ giúp thêm tài liệu cho người mới cho thuê.
 */
export const COMMISSION_NAV: readonly NavSection[] = navForTrack(
  PARTNER_NAV,
  PARTNER_TRACK.COMMISSION,
);

/**
 * Sidebar của NỀN TẢNG (platform_admin/staff).
 *
 * Đợt dọn 23/09/2026 — thuần IA, **không mục nào bị bỏ và không route nào đổi**. Trước đợt này
 * cây nền tảng là 17 mục ngang cấp trong một khối duy nhất: phải đọc hết mới biết mình đang tìm
 * gì, và mục dùng mỗi ngày (duyệt hồ sơ, tiền vào) nằm lẫn với mục đụng một lần một quý (danh
 * mục lọc, tỉnh/thành).
 *
 * Sáu khối dưới Tổng quan trả lời sáu câu hỏi khác nhau của người trực:
 *
 *  1. **Chợ xe** — xe nào chờ duyệt, xe nào đang có trên sàn. Việc của reviewer.
 *  2. **Đối tác** — ai đang bán: gian hàng gói và chủ xe cá nhân, hai danh sách riêng.
 *  3. **Đơn & khách hàng** — khách đặt gì, khách là ai. Việc của support.
 *  4. **Tiền & vận hành** — tiền vào khớp chưa, ai chờ nhận tiền, ai đang khiếu nại. Việc của
 *     `finance_admin`, và là vòng phải khép kín trước Gate R2/R3.
 *  5. **Chính sách & gói** — nền tảng THU thế nào (gói, phí) và CHI tài trợ thế nào (mã khuyến
 *     mãi). Đụng ít, nhưng mỗi lần đụng là đổi tiền của mọi đơn sau đó.
 *  6. **Hệ thống** — dữ liệu nền và dấu vết: nhân sự, danh mục, địa chỉ, banner, nhật ký.
 *
 * Mục cha `platform-billing` gộp ở tầng ĐIỀU HƯỚNG chứ không gộp route — giống cách `SHOP_NAV`
 * gộp "Xe của tôi" và "Tài chính".
 *
 * Đợt dọn 28/09/2026 — khối "Chợ xe" cũ ôm cả đối tác lẫn đơn/khách, nên tách làm ba khối:
 *
 *  - **Chợ xe** chỉ còn XE: "Kiểm duyệt xe" (hàng đợi — đổi tên từ "Duyệt xe") và "Tất cả xe" (tra
 *    cứu), cùng cấp. Mục cha "Gian hàng & xe" biến mất. Hai màn vẫn là hai route, hai nguồn dữ liệu.
 *  - **Đối tác** — hai danh sách ĐỘC LẬP, mỗi danh sách một URL: "Gian hàng gói" và "Chủ xe cá
 *    nhân" (`PLATFORM_PARTNER_KIND`). Không phải hai tab: người trực hai nhóm này làm hai loại việc
 *    khác nhau (Full Manage vs Owner Lite). URL cũ `/manage/admin/tenants` chuyển tiếp.
 *  - **Đơn & khách hàng** — đơn thuê toàn hệ thống và khách thuê.
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
        href: ROUTES.ADMIN.DASHBOARD,
        permission: PERMISSION.PLATFORM_DASHBOARD_VIEW,
        icon: DashboardOutlined,
      },
    ],
  },
  {
    key: 'platform-marketplace',
    labelKey: 'manageGroups.platformMarketplace',
    children: [
      {
        /*
         * Kiểm duyệt xe đứng đầu khối: đây là hàng đợi có người CHỜ ở đầu kia — một chiếc xe chưa
         * được duyệt thì không lên chợ được. "Tất cả xe" ngay dưới là tra cứu.
         *
         * `exact`: href này là gốc của cả khu quản trị — xem docblock `NavLeaf.exact`.
         */
        key: 'approvals',
        labelKey: 'platform.approvals',
        href: ROUTES.ADMIN.ROOT,
        permission: PERMISSION.PLATFORM_APPROVAL_REVIEW,
        icon: AuditOutlined,
        exact: true,
      },
      {
        key: 'admin-vehicles',
        labelKey: 'platform.vehicles',
        href: ROUTES.ADMIN.VEHICLES,
        permission: PERMISSION.PLATFORM_VEHICLE_VIEW,
        icon: CarOutlined,
      },
    ],
  },
  {
    key: 'platform-partners',
    labelKey: 'manageGroups.platformPartners',
    children: [
      {
        // Cùng quyền với danh sách chung cũ: tách danh sách không mở thêm dữ liệu nào.
        key: 'admin-partner-shops',
        labelKey: 'platform.packageShops',
        href: ROUTES.ADMIN.PARTNER_SHOPS,
        permission: PERMISSION.PLATFORM_TENANT_VIEW,
        icon: ShopOutlined,
      },
      {
        key: 'admin-partner-owners',
        labelKey: 'platform.individualOwners',
        href: ROUTES.ADMIN.PARTNER_OWNERS,
        permission: PERMISSION.PLATFORM_TENANT_VIEW,
        icon: IdcardOutlined,
      },
    ],
  },
  {
    key: 'platform-orders',
    labelKey: 'manageGroups.platformOrders',
    children: [
      {
        /*
         * Vận hành chuyến đứng đầu khối: đây là HÀNG ĐỢI có người chờ ở đầu kia (khách chờ chủ xe trả
         * lời, khách đứng chờ giao xe) — tra cứu mọi đơn nằm ngay dưới. Cùng quyền với đơn thuê: màn
         * này không mở thêm dữ liệu nào, chỉ xếp lại theo chặng và theo giờ.
         */
        key: 'admin-trips',
        labelKey: 'platform.trips',
        href: ROUTES.ADMIN.TRIPS,
        permission: PERMISSION.PLATFORM_BOOKING_VIEW,
        icon: FieldTimeOutlined,
      },
      {
        key: 'admin-bookings',
        labelKey: 'platform.bookings',
        href: ROUTES.ADMIN.BOOKINGS,
        permission: PERMISSION.PLATFORM_BOOKING_VIEW,
        icon: FileTextOutlined,
      },
      {
        key: 'admin-customers',
        labelKey: 'platform.customers',
        href: ROUTES.ADMIN.CUSTOMERS,
        permission: PERMISSION.PLATFORM_CUSTOMER_VIEW,
        icon: TeamOutlined,
      },
      {
        // Một SĐT/email → mọi tài khoản ở cả ba realm (ADR 0053 điều 9). Cùng quyền với "Khách thuê".
        key: 'admin-account-lookup',
        labelKey: 'platform.accountLookup',
        href: ROUTES.ADMIN.ACCOUNT_LOOKUP,
        permission: PERMISSION.PLATFORM_CUSTOMER_VIEW,
        icon: SolutionOutlined,
      },
    ],
  },
  {
    key: 'platform-finance',
    labelKey: 'manageGroups.platformFinance',
    children: [
      {
        /*
         * "Tài chính" (01/10/2026) gộp hai mục cũ — "Đối soát tiền vào" và "Vận hành tiền" — vào
         * MỘT màn: cùng một người trực, cùng một tài khoản ngân hàng, và bảng đối soát ngày vốn
         * đã đếm tiền vào chưa khớp mà không cho xử lý tại chỗ. Hàng đợi tiền vào vẫn gác bằng
         * `platform.billing.manage` NGAY TRONG màn (thiếu quyền ⇒ hàng đợi đó ẩn hẳn); URL cũ
         * `/manage/admin/bank-transactions` chuyển tiếp về đúng hàng đợi.
         */
        key: 'admin-money',
        labelKey: 'platform.money',
        href: ROUTES.ADMIN.MONEY,
        // Cùng bộ quyền với các hàng đợi trong màn (`FINANCE_QUEUE_PERMISSION`): người chỉ có quyền
        // gói vẫn thấy mục này — và trong màn chỉ thấy hàng đợi tiền vào.
        permission: [PERMISSION.PLATFORM_MONEY_MANAGE, PERMISSION.PLATFORM_BILLING_MANAGE],
        icon: WalletOutlined,
      },
      {
        /*
         * Bảo hiểm chuyến (ADR 0064) đứng cạnh Tài chính: hàng đợi giấy chứng nhận là phí khách đã
         * trả đang giữ hộ (quyền tiền), danh mục sản phẩm là nội dung hiện cho khách (quyền bảo
         * hiểm). Có MỘT trong hai quyền là thấy mục — trong màn, mỗi tab tự gác theo quyền của nó.
         */
        key: 'admin-insurance',
        labelKey: 'platform.insurance',
        href: ROUTES.ADMIN.INSURANCE,
        permission: [PERMISSION.PLATFORM_INSURANCE_MANAGE, PERMISSION.PLATFORM_MONEY_MANAGE],
        icon: InsuranceOutlined,
      },
      {
        /*
         * Hỗ trợ/tranh chấp nằm trong khối TIỀN, không đứng riêng: một tranh chấp mở ra là một
         * khoản quyết toán bị tạm giữ, nên người xử lý nó và người xử lý sổ là cùng một ca trực.
         */
        key: 'admin-support',
        labelKey: 'platform.support',
        href: ROUTES.ADMIN.SUPPORT,
        permission: PERMISSION.PLATFORM_SUPPORT_MANAGE,
        icon: CustomerServiceOutlined,
      },
    ],
  },
  {
    key: 'platform-policy',
    labelKey: 'manageGroups.platformPolicy',
    children: [
      {
        /*
         * Gói và chính sách phí là hai nửa của cùng một câu: bậc gói quyết định gian hàng trả
         * BAO NHIÊU cho nền tảng, chính sách phí quyết định mỗi CHUYẾN cộng thêm những dòng nào
         * (ADR 0041 · ADR 0028). Sửa một bên mà không nhìn bên kia là cách tạo ra một bậc gói
         * "0% hoa hồng" vẫn đang cộng phí dịch vụ vào giá khách.
         */
        type: 'branch',
        key: 'platform-billing',
        labelKey: 'platform.billing',
        icon: CreditCardOutlined,
        children: [
          {
            key: 'admin-plans',
            labelKey: 'platform.plans',
            href: ROUTES.ADMIN.PLANS,
            permission: PERMISSION.PLATFORM_BILLING_MANAGE,
            icon: CreditCardOutlined,
          },
          {
            key: 'admin-fee-policies',
            labelKey: 'platform.feePolicies',
            href: ROUTES.ADMIN.FEE_POLICIES,
            permission: PERMISSION.PLATFORM_FEE_POLICY_MANAGE,
            icon: PercentageOutlined,
          },
        ],
      },
      {
        /*
         * Mã khuyến mãi đứng cạnh gói và phí có chủ đích: một bên đặt cách nền tảng THU, bên kia
         * đặt cách nền tảng CHI tài trợ. Hai quyền tách nhau (ADR 0046 điều 1), nhưng người đọc
         * menu nên thấy chúng là hai mặt của cùng một ngân sách.
         */
        key: 'admin-promo-codes',
        labelKey: 'platform.promoCodes',
        href: ROUTES.ADMIN.PROMO_CODES,
        permission: PERMISSION.PLATFORM_PROMO_CODE_MANAGE,
        icon: GiftOutlined,
      },
      {
        /*
         * Xác minh người bán là TRỤC KIỂM DUYỆT, không phải cổng mua gói (ADR 0040 điều 5) —
         * nên nó đứng ở khối chính sách chứ không chen vào hàng đợi duyệt hồ sơ hằng ngày.
         */
        key: 'admin-sellers',
        labelKey: 'platform.sellers',
        href: ROUTES.ADMIN.SELLERS,
        permission: PERMISSION.PLATFORM_SELLER_VERIFY,
        icon: IdcardOutlined,
      },
    ],
  },
  {
    key: 'platform-system',
    labelKey: 'manageGroups.platformSystem',
    children: [
      {
        key: 'admin-staff',
        labelKey: 'platform.staff',
        href: ROUTES.ADMIN.STAFF,
        permission: PERMISSION.PLATFORM_STAFF_MANAGE,
        icon: UsergroupAddOutlined,
      },
      {
        key: 'admin-catalog',
        labelKey: 'platform.catalog',
        href: ROUTES.ADMIN.CATALOG,
        permission: PERMISSION.PLATFORM_CATALOG_MANAGE,
        icon: AppstoreOutlined,
      },
      {
        key: 'admin-locations',
        labelKey: 'platform.locations',
        href: ROUTES.ADMIN.LOCATIONS,
        permission: PERMISSION.PLATFORM_LOCATION_VIEW,
        icon: EnvironmentOutlined,
      },
      {
        key: 'admin-banners',
        labelKey: 'platform.banners',
        href: ROUTES.ADMIN.BANNERS,
        permission: PERMISSION.PLATFORM_BANNER_MANAGE,
        icon: PictureOutlined,
      },
      {
        key: 'admin-app-config',
        labelKey: 'platform.appConfig',
        href: ROUTES.ADMIN.APP_CONFIG,
        permission: PERMISSION.PLATFORM_APP_CONFIG_MANAGE,
        icon: MobileOutlined,
      },
      {
        key: 'admin-audit',
        labelKey: 'platform.audit',
        href: ROUTES.ADMIN.AUDIT,
        permission: PERMISSION.PLATFORM_AUDIT_VIEW,
        icon: HistoryOutlined,
      },
    ],
  },
];

/**
 * Cây menu theo KHU và TUYẾN (ADR 0051 điều 3 — thay `navForScope(isPlatform)`).
 *
 *  - khu admin → menu nền tảng;
 *  - khu partner, tuyến gói → `SHOP_NAV`; tuyến hoa hồng → `COMMISSION_NAV` (cùng một cây, ADR 0085);
 *    chưa có gian hàng hay đang nợ bước thanh toán → không có menu (hai màn đó là màn "bare").
 *
 * Khu khách không có khung này.
 */
export function navForZone(zone: Zone, track: PartnerTrack): readonly NavSection[] {
  if (zone === ZONE.ADMIN) return PLATFORM_NAV;
  if (track === PARTNER_TRACK.PACKAGE) return SHOP_NAV;
  if (track === PARTNER_TRACK.COMMISSION) return COMMISSION_NAV;
  return [];
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
  readonly permission: NavPermission;
  readonly icon: ComponentType<{ className?: string }>;
  readonly badge?: NavBadgeKey;
  /**
   * Cùng nghĩa với `NavLeaf.feature` (ADR 0027). Bốn tab hiện tại đều là bậc cơ bản nên chưa tab
   * nào dùng — trường có mặt để lần sau không ai thêm được một tab bị gác mà quên lọc.
   */
  readonly feature?: PlanFeature;
  /** Cùng nghĩa với `NavLeaf.exact` — tab có href là tiền tố của cả một khu. */
  readonly exact?: true;
}

/** Bốn tab của site partner — chung cho hai tuyến (ADR 0085 điều 1): cả bốn đích có ở cả hai. */
const PARTNER_MOBILE_TABS: readonly MobileTab[] = [
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
    // "Đơn thuê xe" gộp yêu cầu + đơn (05/11/2026) — một ô cho cả chuyến.
    key: 'bookings',
    labelKey: 'manage.bookingsShort',
    href: ROUTES.MANAGE.BOOKINGS,
    permission: [PERMISSION.BOOKING_REQUEST_VIEW, PERMISSION.BOOKING_VIEW],
    icon: FileDoneOutlined,
    badge: NAV_BADGE.RENTALS_WORK,
  },
  {
    // Ô thứ tư nhường cho đội xe — việc hằng ngày kế tiếp sau khi yêu cầu + đơn gộp một ô.
    key: 'vehicles',
    labelKey: 'manage.vehiclesShort',
    href: ROUTES.MANAGE.VEHICLES,
    permission: PERMISSION.VEHICLE_VIEW,
    icon: CarOutlined,
    badge: NAV_BADGE.VEHICLES_NEEDS_ACTION,
  },
];

const PLATFORM_MOBILE_TABS: readonly MobileTab[] = [
  {
    key: 'dashboard',
    labelKey: 'manage.dashboard',
    href: ROUTES.ADMIN.DASHBOARD,
    permission: PERMISSION.PLATFORM_DASHBOARD_VIEW,
    icon: DashboardOutlined,
  },
  {
    // Tab 2: Kiểm duyệt xe — nhãn ngắn vì bốn tab chia nhau bề ngang màn điện thoại.
    key: 'approvals',
    labelKey: 'platform.approvalsShort',
    href: ROUTES.ADMIN.ROOT,
    permission: PERMISSION.PLATFORM_APPROVAL_REVIEW,
    icon: AuditOutlined,
    exact: true,
  },
  {
    // Tab 3: Tài chính — tiền vào, giữ chỗ, chi trả, đối soát ngày
    key: 'admin-money',
    labelKey: 'platform.money',
    href: ROUTES.ADMIN.MONEY,
    permission: [PERMISSION.PLATFORM_MONEY_MANAGE, PERMISSION.PLATFORM_BILLING_MANAGE],
    icon: WalletOutlined,
  },
  {
    // Tab 4: Bookings — đơn thuê toàn hệ thống
    key: 'admin-bookings',
    labelKey: 'platform.bookingsShort',
    href: ROUTES.ADMIN.BOOKINGS,
    permission: PERMISSION.PLATFORM_BOOKING_VIEW,
    icon: FileTextOutlined,
  },
];

/** 4 tab chính của bottom nav theo khu + tuyến (tab "Thêm" do MobileNav tự thêm). */
export function mobileTabsForZone(zone: Zone, track: PartnerTrack): readonly MobileTab[] {
  if (zone === ZONE.ADMIN) return PLATFORM_MOBILE_TABS;
  if (track === PARTNER_TRACK.PACKAGE || track === PARTNER_TRACK.COMMISSION) {
    return PARTNER_MOBILE_TABS;
  }
  return [];
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
 * Key menu khớp với đường dẫn hiện tại — trả về NHIỀU NHẤT một href: ưu tiên khớp tuyệt đối, nếu
 * không thì lấy mục lá có href là tiền tố dài nhất (để `/manage/vehicles/new` vẫn sáng mục "Danh
 * sách xe").
 *
 * Mục chỉ khớp tuyệt đối: `/manage` (Tổng quan) và mọi mục khai `exact` (vd. "Kiểm duyệt xe" ở
 * `/manage/admin`) — href của chúng là tiền tố của cả một khu, nhận route con là sáng nhầm.
 */
export function matchSelectedKey(pathname: string, leaves: readonly NavLeaf[]): string | undefined {
  const direct = longestPrefixLeaf(pathname, leaves);
  const contextId = tenantSupportContextIdFromPath(pathname);
  if (!contextId) return direct?.href;
  /*
   * Phiên hỗ trợ gian hàng (ADR 0050) sống dưới `/manage/admin/tenant-support/<id phiên>`. Trong
   * phiên, cây menu là cây của GIAN HÀNG với href đã ánh xạ vào phiên — khớp thẳng ở trên. Cây
   * nền tảng (vd. băng hết gói của AppShell tra trên cây chưa lọc) KHÔNG sáng mục nào: phiên được
   * mở từ một trong hai danh sách đối tác, và đường dẫn không nói là danh sách nào — đoán là sáng
   * sai một nửa số lần.
   */
  return direct?.href.startsWith(adminTenantSupportPath.root(contextId)) ? direct.href : undefined;
}

/** Hình dạng tối thiểu để dò mục đang mở — dùng chung cho mục sidebar và tab dưới đáy. */
interface NavTarget {
  readonly href: string;
  readonly exact?: true;
}

/**
 * Tab dưới đáy (mobile) đang mở — CÙNG luật với sidebar (`matchSelectedKey`): tiền tố dài nhất
 * thắng, mục `exact`/Tổng quan chỉ khớp tuyệt đối. Trả về nhiều nhất một href, nên hai tab không
 * bao giờ cùng sáng.
 */
export function matchActiveHref(
  pathname: string,
  targets: readonly NavTarget[],
): string | undefined {
  return longestPrefixLeaf(pathname, targets)?.href;
}

function longestPrefixLeaf<T extends NavTarget>(path: string, leaves: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const leaf of leaves) {
    // Gốc site (Tổng quan) là tiền tố của MỌI đường dẫn ở chế độ `host` — chỉ khớp tuyệt đối.
    const exactOnly =
      leaf.exact === true || leaf.href === ROUTES.MANAGE.ROOT || leaf.href === ROUTES.ADMIN.ROOT;
    const isMatch = path === leaf.href || (!exactOnly && path.startsWith(`${leaf.href}/`));
    if (isMatch && (!best || leaf.href.length > best.href.length)) {
      best = leaf;
    }
  }
  return best;
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

// ── Không gian hỗ trợ gian hàng (ADR 0050 §12) ────────────────────────────────────────────────

/**
 * Chủ xe cá nhân trong phiên hỗ trợ — CHỈ công việc cho thuê (cây riêng của phiên: trang hồ sơ, ví,
 * tài liệu của chủ xe không có route trong phiên).
 *
 * Không hồ sơ/mật khẩu/ví/thuế/chuyến đi thuê: đó là tài khoản CÁ NHÂN của chủ xe, không phải khu
 * vận hành của gian hàng. "Chuyến của tôi" (`/trips`) đọc theo NGƯỜI ĐĂNG NHẬP nên không dùng được
 * trong phiên — chuyến phía chủ xe đi qua màn tenant-scoped "Đơn thuê xe" (gộp yêu cầu + đơn).
 */
const OWNER_LITE_SUPPORT_NAV: readonly NavSection[] = [
  {
    key: 'owner-operations',
    labelKey: 'manageGroups.operations',
    pinned: true,
    children: [
      {
        key: 'vehicles',
        labelKey: 'manage.myVehicles',
        href: ROUTES.MANAGE.VEHICLES,
        permission: PERMISSION.VEHICLE_VIEW,
        icon: CarOutlined,
      },
      {
        key: 'calendar',
        labelKey: 'manage.calendar',
        href: ROUTES.MANAGE.CALENDAR,
        permission: PERMISSION.CALENDAR_VIEW,
        icon: CalendarOutlined,
      },
      {
        // Yêu cầu + đơn gộp một màn (05/11/2026) — cùng như site partner.
        key: 'bookings',
        labelKey: 'manage.bookingsShort',
        href: ROUTES.MANAGE.BOOKINGS,
        permission: [PERMISSION.BOOKING_REQUEST_VIEW, PERMISSION.BOOKING_VIEW],
        icon: FileDoneOutlined,
      },
      {
        key: 'support-cases',
        labelKey: 'manage.supportCases',
        href: ROUTES.MANAGE.SUPPORT_CASES,
        permission: PERMISSION.SUPPORT_VIEW,
        icon: ExclamationCircleOutlined,
      },
    ],
  },
];

const OWNER_LITE_SUPPORT_TABS: readonly MobileTab[] = [
  {
    key: 'vehicles',
    labelKey: 'manage.myVehicles',
    href: ROUTES.MANAGE.VEHICLES,
    permission: PERMISSION.VEHICLE_VIEW,
    icon: CarOutlined,
  },
  {
    key: 'calendar',
    labelKey: 'manage.calendarShort',
    href: ROUTES.MANAGE.CALENDAR,
    permission: PERMISSION.CALENDAR_VIEW,
    icon: CalendarOutlined,
  },
  {
    key: 'bookings',
    labelKey: 'manage.bookingsShort',
    href: ROUTES.MANAGE.BOOKINGS,
    permission: [PERMISSION.BOOKING_REQUEST_VIEW, PERMISSION.BOOKING_VIEW],
    icon: FileDoneOutlined,
  },
];

function mapLeaf(contextId: string, leaf: NavLeaf): NavLeaf | null {
  // Ví/tiền của CHỦ gian hàng không bao giờ mở trong phiên (vai của phiên là người xem).
  if (leaf.ownerOnly) return null;
  const href = tenantSupportHref(contextId, leaf.href);
  return href ? { ...leaf, href } : null;
}

/**
 * Cây menu của một phiên hỗ trợ: CHÍNH cây của gian hàng (Full Manage hoặc Owner Lite), href đã
 * ánh xạ sang route của phiên, bỏ mọi mục không có trang trong phiên (tài chính, chat, trung tâm
 * hỗ trợ của gian hàng…). Quyền/cờ gói vẫn lọc tiếp ở `useManageNav` như với chính gian hàng.
 */
export function supportNavSections(contextId: string, workspace: SupportWorkspace): NavSection[] {
  if (workspace === SUPPORT_WORKSPACE.ONBOARDING) return [];
  const tree = workspace === SUPPORT_WORKSPACE.MANAGE ? SHOP_NAV : OWNER_LITE_SUPPORT_NAV;
  return tree
    .map((section) => ({
      ...section,
      children: section.children
        .map((node): NavNode | null => {
          if (!isNavBranch(node)) return mapLeaf(contextId, node);
          const children = node.children
            .map((leaf) => mapLeaf(contextId, leaf))
            .filter((leaf): leaf is NavLeaf => leaf !== null);
          return children.length > 0 ? { ...node, children } : null;
        })
        .filter((node): node is NavNode => node !== null),
    }))
    .filter((section) => section.children.length > 0);
}

export function supportMobileTabs(contextId: string, workspace: SupportWorkspace): MobileTab[] {
  if (workspace === SUPPORT_WORKSPACE.ONBOARDING) return [];
  const tabs = workspace === SUPPORT_WORKSPACE.MANAGE ? PARTNER_MOBILE_TABS : OWNER_LITE_SUPPORT_TABS;
  return tabs.flatMap((tab) => {
    const href = tenantSupportHref(contextId, tab.href);
    return href ? [{ ...tab, href }] : [];
  });
}
