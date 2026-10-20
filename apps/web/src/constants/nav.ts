import {
  ApartmentOutlined,
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
  InboxOutlined,
  LineChartOutlined,
  MobileOutlined,
  MessageOutlined,
  PercentageOutlined,
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

import {
  PERMISSION,
  PLAN_FEATURE,
  SUPPORT_WORKSPACE,
  type Permission,
  type PlanFeature,
  type SupportWorkspace,
} from '@xeprime/types';
import type { useTranslations } from 'next-intl';

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
   * Nghịch đảo của `ownerOnly` trên CÙNG trục sở hữu: chỉ người KHÔNG phải chủ gian hàng thấy.
   *
   * Dùng khi chủ và thành viên làm cùng một việc ở hai màn khác nhau — Owner Lite: chủ xe đọc yêu
   * cầu + đơn ở "Chuyến cho thuê" (`/trips` chỉ dựng phía chủ xe cho CHỦ), thành viên dùng hộp thư +
   * bảng đơn. Luật chuyển trang tương ứng ở `partnerPageRedirect`.
   */
  readonly memberOnly?: true;
  /**
   * Chỉ sáng khi đường dẫn KHỚP TUYỆT ĐỐI, không nhận route con.
   *
   * Dành cho mục có `href` là tiền tố của cả một khu: "Kiểm duyệt xe" sống ở `/manage/admin`, tức
   * là tiền tố của MỌI trang quản trị. Để nó nhận route con thì một trang admin chưa có mục riêng
   * (URL cũ đang chuyển tiếp, một route mới quên khai) sẽ sáng nhầm "Kiểm duyệt xe".
   */
  readonly exact?: true;
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
 * trên marketplace → cấu hình (đụng một lần rồi thôi) → hỗ trợ.
 *
 * Đợt dọn 16/09/2026 — toàn bộ là IA, KHÔNG đụng phép tính tiền nào:
 *  1. "Thu cọc qua XePrime" thôi làm mục độc lập: một trang cho đúng một công tắc. Nó về làm
 *     một section của "Chính sách thuê"; route cũ còn sống dưới dạng redirect.
 *  2. "Ví điểm" → "Số dư & rút tiền", GIỮ trong nhánh Tài chính. Tên cũ đọc như điểm thưởng,
 *     trong khi trang này có số dư thật, khoản chờ chuyển và lệnh rút.
 *  3. **Khối "Tài khoản & thanh toán" biến mất, cùng ba mục.** "Gói & hoá đơn" và "Hồ sơ người
 *     bán" về làm hai section của trang Cửa hàng — cả ba mục cũ đều trả lời cùng một câu hỏi
 *     ("gian hàng của tôi khai gì / trả tiền thế nào"), nên chúng là một trang chứ không phải
 *     ba. "Tài khoản & bảo mật" thì rời sidebar hẳn: mật khẩu và xoá tài khoản là việc của một
 *     CON NGƯỜI, không phải một bước vận hành, nên nó sống trong menu tài khoản ở thẻ người
 *     dùng (`ManageUserCard`) — đúng chỗ người ta đi tìm nó.
 *
 * Cả ba route cũ vẫn sống dưới dạng redirect: bookmark và link trong email không được chết vì
 * một lần sắp lại menu.
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
            /*
             * Lối tắt tới nhóm việc "đơn đã có, xe chưa rời bãi" — KHÔNG phải một loại đơn và
             * không phải một trạng thái mới. Nó đứng giữa vì nhịp làm việc đi đúng thứ tự đó:
             * duyệt yêu cầu → giao xe hôm nay → tra cứu mọi đơn.
             *
             * Cùng quyền với "Tất cả đơn thuê": nó không mở thêm dữ liệu nào, chỉ lọc sẵn.
             */
            key: 'bookings-awaiting-pickup',
            labelKey: 'manage.bookingsAwaitingPickup',
            href: ROUTES.MANAGE.BOOKINGS_AWAITING_PICKUP,
            permission: PERMISSION.BOOKING_VIEW,
            icon: CarOutlined,
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
            /*
             * "Số dư & rút tiền" đứng ĐẦU nhóm Tài chính: đây là tiền THẬT của gian hàng và là
             * mục duy nhất trong nhóm có HÀNH ĐỘNG (rút), ba mục sau là sổ sách để đọc. Trang này
             * chứa luôn "Tài khoản nhận tiền" (07/10/2026, trước là một section của Cửa hàng) và thẻ
             * thuế đã khấu trừ — cùng chỗ với tuyến hoa hồng: rút tiền và nơi tiền về là một việc.
             *
             * KHÔNG gác bằng `feature`: số dư là tiền của chính gian hàng, gói hết hạn vẫn phải
             * xem và rút được (ADR 0027 điều 3, ADR 0033).
             *
             * Gác bằng SỞ HỮU (`ownerOnly`), không bằng quyền: API đã là `@ShopOwnerOnly()`.
             * `permission` hạ về mức thấp nhất mọi vai đều có, để trục duy nhất còn quyết định
             * là quyền sở hữu — hai trục cùng hướng về một câu trả lời thì chỉ cần một.
             */
            key: 'balance',
            labelKey: 'manage.balance',
            href: ROUTES.MANAGE.BALANCE,
            permission: PERMISSION.TENANT_VIEW,
            ownerOnly: true,
            icon: WalletOutlined,
          },
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
        /*
         * MỘT mục cho toàn bộ thiết lập gian hàng (16/09/2026).
         *
         * Trang đích có bốn section — thông tin hiển thị · chủ gian hàng · địa chỉ & pháp lý ·
         * gói & hạn mức — nên ba mục sidebar cũ ("Gói & hoá đơn", "Tài khoản & bảo mật", "Hồ sơ
         * người bán") không còn lý do tồn tại: hai mục đầu hỏi cùng một loại câu hỏi với mục này,
         * mục thứ ba thì trùng nội dung với "Địa chỉ & pháp lý". "Tài khoản nhận tiền" rời trang
         * này về "Số dư & rút tiền" (07/10/2026). Cùng vai với "Hồ sơ chủ xe" của tuyến hoa hồng.
         *
         * KHÔNG gác bằng `feature`: hồ sơ, tiền và gói của chính gian hàng không bao giờ nằm
         * sau một cờ tính năng (ADR 0027 điều 3 · ADR 0038 điều 5). Section "Gói & hạn mức" bên
         * trong tự lọc theo `subscription.view`/`subscription.purchase` — cùng trục mà API gác.
         */
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
        // Không gác bằng cờ gói: tài xế mở cho cả hai tuyến (ADR 0063).
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
      {
        // Bộ CƠ BẢN (ADR 0027 điều 1): tranh chấp có hệ quả tiền, không được khoá sau gói.
        key: 'support-cases',
        labelKey: 'manage.supportCases',
        href: ROUTES.MANAGE.SUPPORT_CASES,
        permission: PERMISSION.SUPPORT_VIEW,
        icon: ExclamationCircleOutlined,
      },
    ],
  },
];

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
        // Bằng lái máy chưa tự xác thực được (ADR 0057) — đứng cạnh "Khách thuê" vì đây là việc
        // gỡ cho KHÁCH đặt được xe, không phải kiểm duyệt nguồn cung.
        key: 'admin-driver-licences',
        labelKey: 'platform.driverLicences',
        href: ROUTES.ADMIN.DRIVER_LICENCES,
        permission: PERMISSION.PLATFORM_DRIVER_LICENCE_REVIEW,
        icon: SafetyCertificateOutlined,
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
 * Menu của chủ xe TUYẾN HOA HỒNG ở site partner — Owner Lite (ADR 0051 điều 3).
 *
 * CÙNG KHUNG với menu gian hàng (07/10/2026): Tổng quan · Quản lý · Kinh doanh · Tài khoản · Hỗ trợ,
 * cùng nhãn và biểu tượng cho mục cùng nghĩa. Chủ xe nâng lên gói (hay gian hàng hết gói rơi về đây)
 * thấy các khối ở đúng chỗ cũ, chỉ khác số mục bên trong. Mỗi câu hỏi có MỘT chỗ ở cả hai tuyến:
 *
 *  - tiền về đâu, rút thế nào, bị trừ thuế bao nhiêu → "Số dư & rút tiền" (kèm tài khoản nhận tiền
 *    và thuế đã khấu trừ — y như tuyến gói);
 *  - tôi là ai trên chợ, khai thuế gì, đang dùng gói nào → "Hồ sơ chủ xe" — vai của trang Cửa hàng
 *    bên tuyến gói. Trước đợt này tài khoản nhận tiền, khai thuế và gói là ba mục riêng.
 *
 * Phần KHÁC là thứ phân biệt hai tuyến, và cố ý giữ:
 *  - "Chuyến cho thuê" thay CẢ hộp thư yêu cầu lẫn bảng đơn — hai bề mặt đó dựng cho đội xe hàng
 *    chục chiếc, không cho một chủ xe có vài chiếc;
 *  - không có khối "Cấu hình", không chi nhánh, nhân viên, tài xế, sổ thu chi, khách hàng: đó là năng
 *    lực của gói (ADR 0027 điều 1), server chặn bằng `@SubscriptionTrackOnly` và menu này không bày ra;
 *  - khối Hỗ trợ là tài liệu cho người mới cho thuê (cẩm nang, hợp đồng mẫu) thay cho trung tâm hỗ
 *    trợ của gian hàng — các thẻ "bắt đầu" ở đó trỏ vào trang chỉ của tuyến gói.
 *
 * Nhãn dùng lại nhóm `Navigation.account`/`Navigation.manage` — không bản dịch thứ hai.
 */
export const OWNER_LITE_NAV: readonly NavSection[] = [
  {
    key: 'owner-overview',
    labelKey: 'manageGroups.overview',
    pinned: true,
    children: [
      {
        key: 'home',
        labelKey: 'manage.dashboard',
        href: ROUTES.MANAGE.ROOT,
        permission: PERMISSION.TENANT_VIEW,
        icon: DashboardOutlined,
      },
    ],
  },
  {
    key: 'owner-operations',
    labelKey: 'manageGroups.operations',
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
        /*
         * MỘT mục cho cả yêu cầu lẫn đơn (07/10/2026). Chủ xe cá nhân có một tới ba xe: tách
         * "Yêu cầu đặt xe" và "Đơn thuê" thành hai bảng của gian hàng là bắt họ mở hai nơi cho
         * vài chuyến. Huy hiệu yêu cầu chờ duyệt đi theo mục này. Biểu tượng của "Đơn thuê" bên
         * tuyến gói — cùng một việc.
         */
        key: 'trips',
        labelKey: 'manage.ownerTrips',
        href: ROUTES.MANAGE.TRIPS,
        permission: PERMISSION.BOOKING_REQUEST_VIEW,
        icon: FileTextOutlined,
        badge: NAV_BADGE.BOOKING_REQUESTS_PENDING,
        ownerOnly: true,
      },
      /*
       * THÀNH VIÊN (vd nhân viên của gian hàng vừa hết gói, ADR 0038 điều 5) không có danh sách phía
       * chủ xe — họ giữ hộp thư + bảng đơn để còn bàn giao những chuyến đang chạy.
       */
      {
        key: 'booking-requests',
        labelKey: 'manage.bookingRequests',
        href: ROUTES.MANAGE.BOOKING_REQUESTS,
        permission: PERMISSION.BOOKING_REQUEST_VIEW,
        icon: InboxOutlined,
        badge: NAV_BADGE.BOOKING_REQUESTS_PENDING,
        memberOnly: true,
      },
      {
        key: 'bookings',
        labelKey: 'manage.bookings',
        href: ROUTES.MANAGE.BOOKINGS,
        permission: PERMISSION.BOOKING_VIEW,
        icon: FileDoneOutlined,
        memberOnly: true,
      },
      {
        // Chủ xe cá nhân cũng mời tài xế cho chuyến có tài xế (ADR 0063).
        key: 'drivers',
        labelKey: 'manage.drivers',
        href: ROUTES.MANAGE.DRIVERS,
        permission: PERMISSION.DRIVER_VIEW,
        icon: SolutionOutlined,
      },
    ],
  },
  {
    // Cùng khối "Kinh doanh" của tuyến gói: nói chuyện với khách + tiền.
    key: 'owner-business',
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
        /*
         * MỘT mục tiền (07/10/2026): số dư, lệnh rút, tài khoản nhận tiền và thuế đã khấu trừ. Ba mục
         * cũ ("Tài khoản nhận tiền", "Thông tin khai thuế" — phần tiền của nó — và chính mục này) trả
         * lời cùng một câu "tiền của tôi ở đâu"; route cũ của tài khoản nhận tiền là redirect.
         */
        key: 'balance',
        labelKey: 'manage.balance',
        href: ROUTES.MANAGE.BALANCE,
        permission: PERMISSION.TENANT_VIEW,
        icon: WalletOutlined,
        ownerOnly: true,
      },
    ],
  },
  {
    /*
     * KHÔNG có nhóm "Gian hàng" ở tuyến hoa hồng (06/10/2026): chủ xe cá nhân không có gian hàng
     * nào để quản lý — họ có MỘT hồ sơ. "Hồ sơ chủ xe" là trang tài khoản của chính họ (`ACCOUNT`,
     * bản gộp hồ sơ cá nhân + trang chủ xe công khai + khai thuế + gói — xem `OwnerProfilePage`).
     *
     * `ownerOnly`: thành viên của một gian hàng tuyến hoa hồng mở cùng URL đó chỉ thấy tài khoản
     * của riêng họ — nhãn "Hồ sơ chủ xe" sẽ nói sai, nên họ vào qua menu ở thẻ người dùng.
     */
    key: 'owner-account',
    labelKey: 'manageGroups.account',
    children: [
      {
        key: 'owner-profile',
        labelKey: 'account.ownerProfile',
        href: ROUTES.MANAGE.ACCOUNT,
        permission: PERMISSION.TENANT_VIEW,
        icon: SolutionOutlined,
        ownerOnly: true,
      },
    ],
  },
  {
    key: 'owner-support',
    labelKey: 'manageGroups.support',
    pinned: true,
    children: [
      {
        key: 'host-guide',
        labelKey: 'account.hostGuide',
        href: ROUTES.MANAGE.HOST_GUIDE,
        permission: PERMISSION.TENANT_VIEW,
        icon: QuestionCircleOutlined,
      },
      {
        key: 'contracts-documents',
        labelKey: 'account.contractsDocuments',
        href: ROUTES.MANAGE.CONTRACTS_DOCUMENTS,
        permission: PERMISSION.TENANT_VIEW,
        icon: SafetyCertificateOutlined,
      },
      {
        key: 'data-protection',
        labelKey: 'account.dataProtection',
        href: ROUTES.MANAGE.DATA_PROTECTION,
        permission: PERMISSION.TENANT_VIEW,
        icon: IdcardOutlined,
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

/**
 * Cây menu theo KHU và TUYẾN (ADR 0051 điều 3 — thay `navForScope(isPlatform)`).
 *
 *  - khu admin → menu nền tảng;
 *  - khu partner, tuyến gói → Full Manage; tuyến hoa hồng → Owner Lite; chưa có gian hàng hay đang
 *    nợ bước thanh toán → không có menu (hai màn đó là màn "bare").
 *
 * Khu khách không có khung này.
 */
export function navForZone(zone: Zone, track: PartnerTrack): readonly NavSection[] {
  if (zone === ZONE.ADMIN) return PLATFORM_NAV;
  if (track === PARTNER_TRACK.PACKAGE) return SHOP_NAV;
  if (track === PARTNER_TRACK.COMMISSION) return OWNER_LITE_NAV;
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

/** Bốn tab của Owner Lite — việc hằng ngày của một chủ xe có vài chiếc. */
const OWNER_LITE_MOBILE_TABS: readonly MobileTab[] = [
  {
    key: 'home',
    labelKey: 'manage.dashboard',
    href: ROUTES.MANAGE.ROOT,
    permission: PERMISSION.TENANT_VIEW,
    icon: DashboardOutlined,
  },
  {
    // Cùng nhãn + biểu tượng với sidebar (07/10/2026) — một mục, một hình ở mọi chỗ.
    key: 'vehicles',
    labelKey: 'manage.myVehicles',
    href: ROUTES.MANAGE.VEHICLES,
    permission: PERMISSION.VEHICLE_VIEW,
    icon: CarOutlined,
  },
  {
    key: 'trips',
    labelKey: 'manage.ownerTripsShort',
    href: ROUTES.MANAGE.TRIPS,
    permission: PERMISSION.BOOKING_REQUEST_VIEW,
    icon: FileTextOutlined,
    badge: NAV_BADGE.BOOKING_REQUESTS_PENDING,
  },
  {
    // Yêu cầu + đơn đã gộp vào "Chuyến" — ô thứ tư nhường cho lịch xe, việc hằng ngày kế tiếp.
    key: 'calendar',
    labelKey: 'manage.calendarShort',
    href: ROUTES.MANAGE.CALENDAR,
    permission: PERMISSION.CALENDAR_VIEW,
    icon: CalendarOutlined,
  },
];

/** 4 tab chính của bottom nav theo khu + tuyến (tab "Thêm" do MobileNav tự thêm). */
export function mobileTabsForZone(zone: Zone, track: PartnerTrack): readonly MobileTab[] {
  if (zone === ZONE.ADMIN) return PLATFORM_MOBILE_TABS;
  if (track === PARTNER_TRACK.PACKAGE) return SHOP_MOBILE_TABS;
  if (track === PARTNER_TRACK.COMMISSION) return OWNER_LITE_MOBILE_TABS;
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
 * Owner Lite trong phiên hỗ trợ — CHỈ công việc cho thuê, dùng lại đúng nhãn của `OWNER_LITE_NAV`.
 *
 * Không hồ sơ/mật khẩu/ví/thuế/chuyến đi thuê: đó là tài khoản CÁ NHÂN của chủ xe, không phải khu
 * vận hành của gian hàng. "Chuyến của tôi" (`/trips`) đọc theo NGƯỜI ĐĂNG NHẬP nên không dùng được
 * trong phiên — chuyến phía chủ xe đi qua hai màn tenant-scoped Yêu cầu thuê / Đơn thuê.
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
        key: 'booking-requests',
        labelKey: 'manage.bookingRequestsShort',
        href: ROUTES.MANAGE.BOOKING_REQUESTS,
        permission: PERMISSION.BOOKING_REQUEST_VIEW,
        icon: InboxOutlined,
      },
      {
        key: 'bookings',
        labelKey: 'manage.bookingsShort',
        href: ROUTES.MANAGE.BOOKINGS,
        permission: PERMISSION.BOOKING_VIEW,
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
    key: 'booking-requests',
    labelKey: 'manage.bookingRequestsShort',
    href: ROUTES.MANAGE.BOOKING_REQUESTS,
    permission: PERMISSION.BOOKING_REQUEST_VIEW,
    icon: InboxOutlined,
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
  const tabs = workspace === SUPPORT_WORKSPACE.MANAGE ? SHOP_MOBILE_TABS : OWNER_LITE_SUPPORT_TABS;
  return tabs.flatMap((tab) => {
    const href = tenantSupportHref(contextId, tab.href);
    return href ? [{ ...tab, href }] : [];
  });
}
