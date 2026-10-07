/**
 * Mọi đường dẫn của web nằm ở đây.
 *
 * CLAUDE.md mục 5 cấm rải string literal nghiệp vụ trong component; route cũng vậy — đổi
 * cấu trúc URL mà phải grep chuỗi `/manage/...` khắp source là cách sinh link chết.
 */
import {
  PLATFORM_PARTNER_KIND,
  REGISTRATION_TRACK,
  isSupportContextId,
  type PlatformPartnerKind,
  type RegistrationTrack,
} from '@xeprime/types';
import { ZONE, siteHref, zonePath, type Zone } from '@/zones';

/** Đường dẫn trong khu partner/admin — xem `zones/zone-config.ts` (chế độ `host` | `path`). */
const partner = (path: string): string => zonePath(ZONE.PARTNER, path);
const admin = (path: string): string => zonePath(ZONE.ADMIN, path);

export const ROUTES = {
  HOME: '/',
  /** Trang kết quả tìm xe — sở hữu bộ lọc, sắp xếp, phân trang (trang chủ chỉ xem trước). */
  SEARCH: '/search',
  /**
   * Giới thiệu XePrime — trang công khai trả lời "sàn này là gì, vận hành thế nào".
   *
   * Mục "Về Prime" trên thanh điều hướng trỏ về `HOME` cho tới 23/09/2026, tức một mục menu
   * bấm vào thì không đi đâu cả. Trang này là đích thật của nó, và cũng là nơi duy nhất nói ra
   * mô hình hai tuyến (ADR 0028) bằng ngôn ngữ người dùng thay vì ngôn ngữ ADR.
   */
  ABOUT: '/about',
  /**
   * Giới thiệu ỨNG DỤNG di động — trang đích của mục "Tải ứng dụng" ở chân trang.
   *
   * Tách khỏi `ABOUT` vì hai trang trả lời hai câu hỏi khác nhau ("sàn này là gì" ≠ "app làm
   * được gì"), và vì khi app lên store thì đây là trang mang link store — chân trang chỉ cần
   * trỏ vào đúng một chỗ.
   */
  APP: '/app',
  /**
   * Yêu cầu xoá tài khoản — bề mặt CÔNG KHAI, không cần phiên.
   *
   * App Store và Google Play đều bắt buộc một app có tài khoản phải công bố một địa chỉ web để
   * người dùng yêu cầu xoá tài khoản, truy cập được mà KHÔNG cần cài app và KHÔNG cần đăng nhập —
   * người duyệt app không có tài khoản thật. Đây là địa chỉ điền vào hồ sơ nộp store.
   *
   * KHÁC `ACCOUNT.DELETE_ACCOUNT`: đường đó nằm trong khu tài khoản, cần đăng nhập, mở support
   * case và theo dõi/rút được yêu cầu. Trang công khai này chỉ ghi nhận.
   */
  DELETE_ACCOUNT: '/delete-account',
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  /** Khu khách hàng: các chuyến thuê + đánh giá sau chuyến (cần đăng nhập, ngoài khu /manage). */
  TRIPS: '/trips',
  /** Khu tin nhắn của khách (chat với shop). Shop dùng /manage/chat. */
  CHAT: '/chat',
  /**
   * Trung tâm hỗ trợ CÔNG KHAI — kênh liên hệ thật, không cần đăng nhập.
   *
   * Khác `/account/support` (hàng đợi ticket của một người, chưa dựng): người đang gặp sự cố
   * giữa chuyến thường không đăng nhập được, nên kênh liên hệ phải nằm ngoài tường đăng nhập.
   */
  SUPPORT: '/support',
  /**
   * Khu TÀI KHOẢN của KHÁCH THUÊ trên `xeprime.vn` (ADR 0053: một tài khoản realm `customer`).
   *
   * Từ ADR 0051/0053 khu này chỉ còn phần của khách: hồ sơ, chuyến (ở `TRIPS`), tiền đã trả, ví
   * điểm (tiền hoàn), tài khoản nhận tiền, giấy tờ tuỳ thân. Owner Lite đã sang site partner
   * (`ROUTES.MANAGE`) — URL cũ của nó chuyển hướng qua `zones/legacy-redirects.ts`.
   *
   * Mục "Chuyến của tôi" và "Tin nhắn" KHÔNG nằm dưới `/account`: chúng có route riêng (`TRIPS`,
   * `CHAT`) và đang được thông báo trỏ tới — menu tài khoản chỉ dẫn sang.
   */
  ACCOUNT: {
    ROOT: '/account',
    /** Đổi mật khẩu (có mật khẩu hiện tại) hoặc đặt lần đầu (tài khoản OTP/social). */
    CHANGE_PASSWORD: '/account/change-password',
    /** YÊU CẦU xoá tài khoản — mở support case `account_deletion`, nền tảng xử lý tay. */
    DELETE_ACCOUNT: '/account/delete-account',
    /** Tiền của các chuyến đã thuê — đọc từ `payments`, không phải ví. */
    PAYMENTS: '/account/payments',
    /** Tài khoản ngân hàng NHẬN tiền hoàn và khoản phải trả (ADR 0033). */
    BANK_ACCOUNTS: '/account/bank-accounts',
    /** Ví điểm — sổ công nợ XePrime phải trả, KHÔNG phải ví điện tử (ADR 0033 điều 1). */
    BALANCE: '/account/balance',
    FAVORITES: '/account/favorites',
    ADDRESSES: '/account/addresses',
    /** Kho giấy tờ tuỳ thân của khách (GPLX/CCCD) — ADR 0014: gian hàng đối chiếu tay. */
    DOCUMENTS: '/account/documents',
    NOTIFICATIONS: '/account/notifications',
    SUPPORT: '/account/support',
    SETTINGS: '/account/settings',
  },
  /**
   * Đăng xe cho thuê — LANDING công khai trên `xeprime.vn`.
   *
   * Từ ADR 0051 điều 3, đăng ký cả hai tuyến diễn ra ở site partner; landing này chỉ còn là lối dẫn
   * sang `partner.xeprime.vn/register`. Wizard đăng xe nhanh đã sang `ROUTES.MANAGE.VEHICLE_REGISTER`.
   */
  LIST_YOUR_VEHICLE: {
    ROOT: '/list-your-vehicle',
  },

  /**
   * SITE PARTNER (`partner.xeprime.vn`, realm `partner`) — ADR 0051 điều 2–3.
   *
   * Phục vụ HAI tuyến trên MỘT cây URL: gian hàng tuyến gói (Full Manage) và chủ xe cá nhân tuyến
   * hoa hồng (Owner Lite). Trang cùng ý nghĩa ở hai tuyến dùng MỘT URL và chọn nội dung theo tuyến
   * hiệu lực do server trả; trang chỉ của tuyến gói do server chặn (`@SubscriptionTrackOnly`) và ẩn
   * khỏi menu tuyến hoa hồng.
   *
   * Mọi đường dẫn dựng qua `partner()` = `zonePath('partner', …)`: `/manage/vehicles` ở chế độ
   * `path` (máy dev), `/vehicles` trên host partner ở chế độ `host`.
   */
  MANAGE: {
    ROOT: partner('/'),
    /** Đăng nhập site partner. Route CÔNG KHAI. */
    LOGIN: partner('/login'),
    /**
     * Đăng ký tài khoản đối tác + chọn tuyến (ADR 0040). Chưa đăng nhập: form đăng ký; đã đăng nhập
     * mà chưa có gian hàng: hai cửa tuyến hoa hồng / tuyến gói. Route CÔNG KHAI.
     */
    REGISTER: partner('/register'),
    FORGOT_PASSWORD: partner('/forgot-password'),
    /** Đích của link trong email đặt lại mật khẩu (API: `${WEB_PARTNER_URL}/reset-password`). */
    RESET_PASSWORD: partner('/reset-password'),
    /** Gốc trang nhận lời mời — `invitePath(token)`. Route CÔNG KHAI (xem trước rồi mới đăng nhập). */
    INVITES: partner('/invites'),
    /**
     * ONBOARDING — hai bước, hai tuyến, một route (ADR 0040).
     *
     * | Trạng thái thật | Màn hiện ra |
     * | --- | --- |
     * | chưa có gian hàng, `?track=commission` (mặc định) | form hồ sơ chủ xe |
     * | chưa có gian hàng, `?track=package` | bước 1: tạo gian hàng trả phí |
     * | `package_pending` | bước 2: chọn gói → QR chuyển khoản |
     * | gói đã hiệu lực | chuyển tới `SHOP?welcome=1` |
     * | tuyến hoa hồng | chuyển tới trang chủ Owner Lite (`ROOT`) |
     *
     * `?track=` CHỈ có nghĩa khi chưa có gian hàng — sau đó `tenants.onboarding_state` là nguồn.
     */
    ONBOARDING: partner('/onboarding'),

    // ── Vận hành (cả hai tuyến) ───────────────────────────────────────────────────────────────
    CALENDAR: partner('/calendar'),
    VEHICLES: partner('/vehicles'),
    VEHICLE_NEW: partner('/vehicles/new'),
    /**
     * Wizard đăng xe nhanh 3 bước — bản trước ở `/list-your-vehicle/register` của khu khách. Đứng
     * cạnh `/vehicles/[id]` là an toàn: Next ưu tiên đoạn TĨNH, id xe là ULID 26 ký tự.
     */
    VEHICLE_REGISTER: partner('/vehicles/register'),
    /** Trung tâm bảo dưỡng toàn đội xe (Wave 6 — docs/design/12 §9.2). */
    MAINTENANCE: partner('/maintenance'),
    BOOKINGS: partner('/bookings'),
    /**
     * Lối tắt "Chờ giao xe" — CÙNG danh sách, cùng endpoint, chỉ khác một nhóm việc dựng sẵn. Là
     * một ĐƯỜNG DẪN (không phải `?preset=`) vì mục menu đang mở quyết bằng `usePathname()`.
     */
    BOOKINGS_AWAITING_PICKUP: partner('/bookings/awaiting-pickup'),
    BOOKING_REQUESTS: partner('/booking-requests'),
    /**
     * CHUYẾN CHO THUÊ — chỉ CHỦ xe tuyến HOA HỒNG (Owner Lite): MỘT danh sách thẻ gộp yêu cầu thuê
     * và đơn thuê trên xe của chủ xe cá nhân (vài chiếc), đọc `GET /trips?role=host`. Với họ,
     * `BOOKING_REQUESTS`/`BOOKINGS` chuyển về đây; tuyến gói và thành viên không phải chủ đi ngược
     * lại về hộp thư — luật ở `partnerPageRedirect`.
     */
    TRIPS: partner('/trips'),
    CUSTOMERS: partner('/customers'),
    FINANCE: partner('/finance'),
    /**
     * "Số dư & rút tiền" — ví điểm gian hàng, khoản XePrime phải trả (ADR 0033). Cả hai tuyến;
     * KHÔNG gác bằng gói. Chứa luôn "Tài khoản nhận tiền" (07/10/2026 — `balancePayoutPath`): rút
     * tiền và nơi tiền về là một việc, nên là một trang.
     */
    BALANCE: partner('/balance'),
    RECEIPTS: partner('/receipts'),
    DEBTS: partner('/debts'),

    /**
     * CỬA HÀNG — một trang cho toàn bộ thiết lập của gian hàng tuyến gói (16/09/2026), năm section
     * chọn bằng `?section=` (xem `SHOP_SECTION`).
     */
    SHOP: partner('/shop'),
    /**
     * ALIAS CHUYỂN TIẾP (05/10/2026) — "Bảo mật tài khoản" đã gộp vào `ACCOUNT`; route cũ redirect
     * tới section "Thông tin đăng nhập". Không mục menu nào còn trỏ tới đây.
     */
    SECURITY: partner('/security'),
    /**
     * TÀI KHOẢN của tài khoản đối tác — MỘT URL, nội dung theo tuyến (ADR 0051 điều 3):
     *
     *  - tuyến gói / thành viên: "Tài khoản & bảo mật" — tên, ảnh, đăng nhập, mật khẩu, xoá tài khoản;
     *    hồ sơ GIAN HÀNG sống riêng ở `SHOP`.
     *  - CHỦ xe tuyến hoa hồng: "Hồ sơ chủ xe" — cùng bốn phần trên CỘNG trang chủ xe công khai,
     *    địa chỉ nhận xe (06/10/2026), thông tin khai thuế và gói dịch vụ (07/10/2026). Với họ người
     *    và "gian hàng" là một, nên là một trang — cùng vai với trang Cửa hàng của tuyến gói.
     *
     * Section chọn bằng `?section=` (xem `ACCOUNT_SECTION`).
     */
    ACCOUNT: partner('/account'),
    /**
     * LỐI ĐI CHUYỂN TIẾP tới chuyến ĐI THUÊ cũ của tài khoản này (15/09/2026) — từ ADR 0053 tài khoản
     * đối tác không đặt xe nữa; trang chỉ còn cho dữ liệu có trước đợt tách realm.
     */
    /** Chi nhánh gian hàng — nơi xe thực sự nằm, và là vị trí công khai của xe. */
    SHOP_BRANCHES: partner('/shop/branches'),
    /** Chính sách thuê mặc định của gian hàng (Wave 2 — cọc/giao nhận/quá giờ/ưu đãi). */
    SHOP_POLICIES: partner('/shop/policies'),
    /** ALIAS CHUYỂN TIẾP (16/09/2026) — đích thật: `SHOP_POLICIES#deposit-collection`. */
    SHOP_PAYMENT_SETTINGS: partner('/shop/payment-settings'),
    /** ALIAS CHUYỂN TIẾP (16/09/2026) — đích thật: `SHOP?section=tax` (07/10/2026). */
    SELLER_PROFILE: partner('/shop/seller-profile'),
    MEMBERS: partner('/members'),
    /**
     * ALIAS CHUYỂN TIẾP — gói dịch vụ là một SECTION ở cả hai tuyến: tuyến gói ở `SHOP?section=plan`
     * (16/09/2026), tuyến hoa hồng ở `ACCOUNT?section=plan` của "Hồ sơ chủ xe" (07/10/2026, phễu nâng
     * cấp — ADR 0028 điều 1). Không mục menu nào còn trỏ tới đây.
     */
    SUBSCRIPTION: partner('/subscription'),
    DRIVERS: partner('/drivers'),
    /** Hộp thư phía gian hàng — CẢ hai tuyến (chủ xe hoa hồng nhắn với khách ở đây). */
    CHAT: partner('/chat'),
    /** Trung tâm hỗ trợ — hướng dẫn nhanh + câu hỏi thường gặp. */
    SUPPORT: partner('/support'),
    /** Case hỗ trợ / tranh chấp của gian hàng (R3 — ADR 0028 release gate 7). */
    SUPPORT_CASES: partner('/support/cases'),

    // ── Owner Lite — trang của tuyến hoa hồng (ADR 0051 điều 3) ─────────────────────────────────
    /**
     * ALIAS CHUYỂN TIẾP (06/10/2026) — "Hồ sơ chủ xe" đã gộp vào `ACCOUNT` (section trang chủ xe);
     * tiến trình đăng ký là trang chủ Owner Lite ở bậc `registering`. Không mục menu nào còn trỏ
     * tới đây; route giữ cho bookmark, thông báo cũ và app native.
     */
    REGISTRATION: partner('/registration'),
    /**
     * ALIAS CHUYỂN TIẾP (07/10/2026) — "Thông tin khai thuế" là section `?section=tax` của trang
     * hồ sơ ở cả hai tuyến: "Hồ sơ chủ xe" (`ACCOUNT`) và Cửa hàng (`SHOP`). Không mục menu nào
     * còn trỏ tới đây.
     */
    TAX: partner('/tax'),
    /**
     * ALIAS CHUYỂN TIẾP (07/10/2026) — "Tài khoản nhận tiền" là section của "Số dư & rút tiền" ở CẢ
     * hai tuyến (`balancePayoutPath`). Không mục menu nào còn trỏ tới đây.
     */
    BANK_ACCOUNTS: partner('/bank-accounts'),
    /** Cẩm nang cho thuê xe — tài liệu PDF ở `public/owner-resources/`. */
    HOST_GUIDE: partner('/host-guide'),
    /** Hợp đồng & chứng từ MẪU (thư viện PDF) — không phải hợp đồng theo đơn thuê. */
    CONTRACTS_DOCUMENTS: partner('/contracts-documents'),
    /** Chính sách bảo vệ dữ liệu — dẫn tới văn bản thật ở `/legal/privacy`. */
    DATA_PROTECTION: partner('/data-protection'),
  },

  /**
   * SITE QUẢN TRỊ (`admin.xeprime.vn`, realm `platform`) — ADR 0051 điều 2.
   *
   * Thư mục nội bộ `app/(admin)/admin`; mọi đường dẫn dựng qua `admin()` = `zonePath('admin', …)`.
   * Đăng nhập chỉ bằng mật khẩu, không tự đăng ký (ADR 0053 điều 3).
   */
  ADMIN: {
    /** "Kiểm duyệt xe" — hàng đợi duyệt xe lên chợ. Chỉ khớp TUYỆT ĐỐI trên menu (`NavLeaf.exact`). */
    ROOT: admin('/'),
    /** Tổng quan nền tảng (`PlatformDashboardView`) — trước ADR 0051 nằm ở gốc `/manage`. */
    DASHBOARD: admin('/dashboard'),
    LOGIN: admin('/login'),
    FORGOT_PASSWORD: admin('/forgot-password'),
    /** Đích của link đặt lại mật khẩu — cũng là trang đặt mật khẩu LẦN ĐẦU của nhân sự mới (B4). */
    RESET_PASSWORD: admin('/reset-password'),
    /** Bảo mật tài khoản của nhân sự đang đăng nhập (đổi mật khẩu). */
    SECURITY: admin('/security'),
    /**
     * BỘ TRA LOẠI ĐỐI TÁC — và là URL cũ của danh sách gian hàng chung (trước 28/09/2026).
     *
     * ⚠️ KHÔNG xoá như một route "legacy": `adminPartnerPath.resolveTenant` dựa vào nó cho chi tiết
     * đơn thuê, lối thoát phiên hỗ trợ và dashboard nền tảng.
     */
    TENANTS: admin('/tenants'),
    /** Gốc hai danh sách đối tác — chuyển tiếp về "Gian hàng gói". */
    PARTNERS: admin('/partners'),
    PARTNER_SHOPS: admin('/partners/shops'),
    PARTNER_OWNERS: admin('/partners/owners'),
    VEHICLES: admin('/vehicles'),
    BOOKINGS: admin('/bookings'),
    CUSTOMERS: admin('/customers'),
    /** Tra cứu XUYÊN REALM — mọi tài khoản trùng một SĐT/email (ADR 0053 điều 9, B4). */
    ACCOUNT_LOOKUP: admin('/accounts'),
    AUDIT: admin('/audit'),
    STAFF: admin('/staff'),
    PLANS: admin('/plans'),
    /** URL CŨ của hàng đợi tiền vào — chuyển tiếp về `MONEY?queue=bank-in` (01/10/2026). */
    BANK_TRANSACTIONS: admin('/bank-transactions'),
    CATALOG: admin('/catalog'),
    /** Danh mục hành chính (tỉnh/thành) — dữ liệu dùng chung cho mọi gian hàng. */
    LOCATIONS: admin('/locations'),
    BANNERS: admin('/marketplace-banners'),
    /** Hàng đợi xác minh người bán (R3 — ADR 0028 release gate 1). */
    SELLERS: admin('/sellers'),
    /** Quản trị chính sách phí có phiên bản (R3 — ADR 0028 điều 2–3). */
    FEE_POLICIES: admin('/fee-policies'),
    PROMO_CODES: admin('/promo-codes'),
    /** Màn Tài chính: tiền vào, giữ chỗ, hoàn, rút, bảo hiểm, thuế, đối soát ngày (`?queue=`). */
    MONEY: admin('/money'),
    /** Hàng đợi hỗ trợ/tranh chấp toàn sàn (R3 — ADR 0028 release gate 7). */
    SUPPORT: admin('/support'),
    /**
     * Không gian hỗ trợ gian hàng (ADR 0050) — gốc của các phiên `/…/<id phiên>/…`. Tách hẳn khỏi
     * `SUPPORT` (hàng đợi hỗ trợ/tranh chấp): hai tính năng khác nhau, không chung tiền tố.
     */
    TENANT_SUPPORT: admin('/tenant-support'),
  },
} as const;

export type ManageRoute = (typeof ROUTES.MANAGE)[keyof typeof ROUTES.MANAGE];

/**
 * Ba trang TÀI KHOẢN của từng site — đăng nhập, quên mật khẩu, đặt lại mật khẩu (ADR 0053: mỗi site
 * một không gian tài khoản, nên mỗi site có bộ trang của mình). Form dùng chung đọc khu đang render
 * (`useZone()`) rồi lấy đường dẫn ở đây, không tự ghép.
 *
 * Site khách đăng nhập bằng MODAL: `ROUTES.LOGIN` là route cũ mà proxy chuyển thành `/?auth=login`.
 */
export function zoneAuthRoutes(zone: Zone): {
  login: string;
  forgotPassword: string;
  resetPassword: string;
} {
  switch (zone) {
    case ZONE.PARTNER:
      return {
        login: ROUTES.MANAGE.LOGIN,
        forgotPassword: ROUTES.MANAGE.FORGOT_PASSWORD,
        resetPassword: ROUTES.MANAGE.RESET_PASSWORD,
      };
    case ZONE.ADMIN:
      return {
        login: ROUTES.ADMIN.LOGIN,
        forgotPassword: ROUTES.ADMIN.FORGOT_PASSWORD,
        resetPassword: ROUTES.ADMIN.RESET_PASSWORD,
      };
    default:
      return {
        login: ROUTES.LOGIN,
        forgotPassword: ROUTES.FORGOT_PASSWORD,
        resetPassword: ROUTES.RESET_PASSWORD,
      };
  }
}

/**
 * Xe của chủ xe TUYẾN HOA HỒNG ở site partner. Chi tiết dùng CHUNG URL với tuyến gói
 * (`/vehicles/[id]` — một URL, nội dung theo tuyến); riêng không gian "Quản lý xe" rút gọn của
 * Owner Lite sống ở `/vehicles/[id]/manage/<mục>` (tuyến gói sửa xe ở `/vehicles/[id]/edit`).
 */
export const ownerVehiclePath = {
  detail: (id: string): string => `${ROUTES.MANAGE.VEHICLES}/${id}`,
  /** Không gian "Quản lý xe" của chủ xe (08/09/2026) — gốc tự chuyển tới mục đầu tiên. */
  manage: (id: string): string => `${ROUTES.MANAGE.VEHICLES}/${id}/manage`,
};

/**
 * Các mục của không gian "Quản lý xe" (`/vehicles/[id]/manage/<mục>`) — GIÁ TRỊ đường
 * dẫn, không phải nhãn. Menu trái, trang con và `VehicleEditWorkspace` ở `/manage` cùng đọc.
 *
 * Nhóm "có tài xế" KHÔNG có mục "Tiện ích bổ sung": mockup có nó nhưng nghiệp vụ không — phụ phí
 * mặc định đã nằm ở `WITH_DRIVER_SURCHARGES`.
 *
 * Tám mục (30/09/2026) — CÙNG cấu trúc menu với màn sửa xe ở cổng quản lý, bỏ phần nâng cao.
 * Sáu đường dẫn cũ vẫn sống dưới dạng trang CHUYỂN HƯỚNG (bookmark, thông báo cũ, link trong
 * email): `self-drive/pricing`, `with-driver/pricing`, `self-drive/delivery` → `pricing`;
 * `self-drive/handover-time` → `handover-time`; `self-drive/terms`, `with-driver/terms` → mục
 * `optimization` cùng dịch vụ, neo `#rental-terms`.
 */
export const VEHICLE_MANAGE_SECTION = {
  INFORMATION: 'information',
  IMAGES: 'images',
  DOCUMENTS: 'documents',
  TRIP_HISTORY: 'trip-history',
  /** Giá & chính sách — giá mọi dịch vụ + cọc · giao xe · km, một nút Lưu. */
  PRICING: 'pricing',
  /** Thời gian giao nhận — áp cho CẢ chiếc xe, không thuộc dịch vụ nào. */
  HANDOVER_TIME: 'handover-time',
  /** "Nhận chuyến & thủ tục" của tự lái (tối ưu nhận chuyến + thủ tục cho thuê). */
  SELF_DRIVE_OPTIMIZATION: 'self-drive/optimization',
  /** "Nhận chuyến & thủ tục" của có tài xế. */
  WITH_DRIVER_OPTIMIZATION: 'with-driver/optimization',
  WITH_DRIVER_SURCHARGES: 'with-driver/surcharges',
} as const;

export type VehicleManageSection =
  (typeof VEHICLE_MANAGE_SECTION)[keyof typeof VEHICLE_MANAGE_SECTION];
export const VEHICLE_MANAGE_SECTION_VALUES = Object.values(
  VEHICLE_MANAGE_SECTION,
) as VehicleManageSection[];

/**
 * Neo của card "Thủ tục cho thuê" trong mục "Nhận chuyến & thủ tục" — dùng chung cho hai khu. Nằm
 * ở đây (không ở component) để trang server chuyển hướng đọc được: một hằng export từ file
 * `'use client'` chỉ là tham chiếu client khi import vào server component.
 */
export const RENTAL_TERMS_ANCHOR = 'rental-terms';

/** Mục mở mặc định khi vào gốc không gian quản lý của một xe. */
export const VEHICLE_MANAGE_DEFAULT_SECTION: VehicleManageSection =
  VEHICLE_MANAGE_SECTION.INFORMATION;

export const ownerVehicleManagePath = {
  section: (id: string, section: VehicleManageSection): string =>
    `${ownerVehiclePath.manage(id)}/${section}`,
};

/**
 * Đường dẫn có thuộc không gian quản lý xe của Owner Lite không (mọi mục con) — khung partner
 * dùng để mở bố cục trọn bề ngang cho CẢ tiền tố.
 */
export function isOwnerVehicleManagePath(pathname: string): boolean {
  const base = ROUTES.MANAGE.VEHICLES;
  if (!pathname.startsWith(`${base}/`)) return false;
  return /^[^/]+\/manage(\/|$)/.test(pathname.slice(base.length + 1));
}

/**
 * Mục đang mở suy từ đường dẫn — `null` khi đang ở gốc hoặc một mục lạ.
 *
 * Khớp theo ĐUÔI `/vehicles/<id>/manage/<mục>`, không theo gốc `/account`: cùng không gian quản lý
 * xe còn được dựng dưới phiên hỗ trợ của nhân sự nền tảng (ADR 0050), với một gốc khác.
 */
export function vehicleManageSectionOf(pathname: string): VehicleManageSection | null {
  const match = /\/vehicles\/[^/]+\/manage\/(.+?)\/?$/.exec(pathname);
  const candidate = match?.[1];
  return candidate && (VEHICLE_MANAGE_SECTION_VALUES as string[]).includes(candidate)
    ? (candidate as VehicleManageSection)
    : null;
}

/** Đường dẫn động của xe — hàm để không rải template `/manage/vehicles/${id}` khắp component. */
/**
 * Nơi người dùng bấm vào wizard đăng xe nhanh — quyết định nút "Quay lại" và đích sau khi lưu.
 *
 * Là một ENUM đóng, không phải URL tự do trong query: nhận URL từ query rồi redirect tới đó là
 * cách tự mở một lỗ open-redirect trên chính luồng đăng xe.
 */
export const VEHICLE_REGISTRATION_SOURCE = {
  /** Từ trang chọn cách cho thuê (`/register` của site partner, hoặc landing công khai của site khách). */
  MARKETPLACE: 'marketplace',
  /** Từ danh sách xe của chủ xe tuyến hoa hồng (Owner Lite — `/vehicles` của site partner). */
  ACCOUNT: 'account',
  /** Từ cổng gian hàng (`/manage/vehicles`). */
  MANAGE: 'manage',
} as const;

export type VehicleRegistrationSource =
  (typeof VEHICLE_REGISTRATION_SOURCE)[keyof typeof VEHICLE_REGISTRATION_SOURCE];
export const VEHICLE_REGISTRATION_SOURCE_VALUES = Object.values(
  VEHICLE_REGISTRATION_SOURCE,
) as VehicleRegistrationSource[];

export function isVehicleRegistrationSource(
  value: string | null | undefined,
): value is VehicleRegistrationSource {
  return (VEHICLE_REGISTRATION_SOURCE_VALUES as string[]).includes(value ?? '');
}

/** Trang danh sách xe tương ứng với nơi người dùng đi vào — dùng cho nút quay lại và sau khi lưu. */
export function vehicleListPathFor(source: VehicleRegistrationSource): string {
  switch (source) {
    case VEHICLE_REGISTRATION_SOURCE.MANAGE:
    case VEHICLE_REGISTRATION_SOURCE.ACCOUNT:
      return ROUTES.MANAGE.VEHICLES;
    default:
      /*
       * Trang chọn cách cho thuê của site partner — chỗ người dùng vừa bấm "Đăng xe đầu tiên" (cùng
       * site, cùng tài khoản đối tác). Đã có gian hàng thì trang đó tự đưa về trang chủ theo tuyến.
       */
      return ROUTES.MANAGE.REGISTER;
  }
}

/** Wizard đăng xe nhanh, mang theo ngữ cảnh mở. */
export function listYourVehicleRegisterPath(source: VehicleRegistrationSource): string {
  return `${ROUTES.MANAGE.VEHICLE_REGISTER}?from=${source}`;
}

/** Trang nhận lời mời vào gian hàng — đích của link trong email (`${WEB_PARTNER_URL}/invites/<token>`). */
export function invitePath(token: string): string {
  return `${ROUTES.MANAGE.INVITES}/${encodeURIComponent(token)}`;
}

/**
 * Hai KHU LÀM VIỆC của người cho thuê xe — `/manage` (gian hàng có gói, nhân viên) và `/account`
 * (chủ xe tuyến hoa hồng, Owner Lite). ADR 0027/0028: cùng tính năng, khác vỏ.
 */
export const WORKSPACE = {
  MANAGE: 'manage',
  ACCOUNT: 'account',
} as const;

export type Workspace = (typeof WORKSPACE)[keyof typeof WORKSPACE];

/**
 * Bảng đường dẫn theo khu — **nguồn DUY NHẤT** cho mọi link "về chỗ làm việc của tôi".
 *
 * Lý do tồn tại: trước bảng này, 19 chỗ trong khu công khai và khu tài khoản trỏ thẳng vào
 * `/manage/...` — thẻ gian hàng, menu marketplace, màn kết thúc wizard đăng xe, deep link của
 * thông báo, huy hiệu chat, dải trạng thái gian hàng, thậm chí link "mở hồ sơ đầy đủ" ngay trong
 * `/account/tax`. Mỗi chỗ tự quyết định là mỗi chỗ một luật, và chủ xe tuyến hoa hồng rơi vào
 * cổng quản lý qua bất kỳ cái nào trong 19 đường đó.
 *
 * Không phải mọi mục đều có bản `/account` một-đối-một, và chỗ khác nhau là chỗ có chủ đích:
 *  - `bookings`/`bookingRequests` của Owner Lite GIỮ URL hộp thư + bảng đơn dù CHỦ xe đọc chúng ở
 *    "Chuyến cho thuê" (`TRIPS`): bảng này còn là gốc của phiên hỗ trợ gian hàng (ánh xạ qua
 *    `tenantSupportHref`, nơi không có `TRIPS`), và thành viên không phải chủ vẫn dùng hai màn đó.
 *    Chủ xe tới `TRIPS` qua `partnerPageRedirect`.
 *  - `branches` không có bản `/account`: chủ xe tuyến hoa hồng chỉ có chi nhánh mặc định, và địa
 *    chỉ của nó sửa ngay trong hồ sơ chủ xe. Chi nhánh là tính năng của gói (ADR 0027 điều 1).
 *  - `sellerProfile` và `subscription` của Owner Lite là hai SECTION của "Hồ sơ chủ xe" (07/10/2026)
 *    — cùng vị trí mà tuyến gói đặt chúng trong trang Cửa hàng.
 */
export function workspacePaths(workspace: Workspace): {
  home: string;
  vehicles: string;
  vehicleNew: string;
  calendar: string;
  chat: string;
  bookings: string;
  bookingRequests: string;
  ownerProfile: string;
  branches: string;
  subscription: string;
  sellerProfile: string;
  support: string;
} {
  if (workspace === WORKSPACE.MANAGE) {
    return {
      home: ROUTES.MANAGE.ROOT,
      vehicles: ROUTES.MANAGE.VEHICLES,
      vehicleNew: ROUTES.MANAGE.VEHICLE_NEW,
      calendar: ROUTES.MANAGE.CALENDAR,
      chat: ROUTES.MANAGE.CHAT,
      bookings: ROUTES.MANAGE.BOOKINGS,
      bookingRequests: ROUTES.MANAGE.BOOKING_REQUESTS,
      ownerProfile: ROUTES.MANAGE.SHOP,
      branches: ROUTES.MANAGE.SHOP_BRANCHES,
      // Hai mục này KHÔNG còn là trang riêng ở cổng quản lý (16/09/2026) — chúng là section
      // của trang Cửa hàng. Trỏ vào hằng số route cũ vẫn tới nơi, nhưng qua một lần chuyển
      // hướng thừa, và mỗi lần chuyển hướng là một lần mất tham số mà người gọi vừa gắn vào.
      subscription: shopSectionPath(SHOP_SECTION.PLAN),
      sellerProfile: shopSectionPath(SHOP_SECTION.TAX),
      support: ROUTES.MANAGE.SUPPORT,
    };
  }
  /*
   * Owner Lite ở site partner (ADR 0051 điều 3): trang cùng ý nghĩa dùng CHUNG URL với tuyến gói
   * (xe, lịch, hộp thư, đơn, yêu cầu, gói, hỗ trợ) — chỉ những mục không có bản tuyến gói một-đối-
   * một mới trỏ sang trang riêng của tuyến hoa hồng. Đơn + yêu cầu: xem docblock ở trên.
   */
  return {
    home: ROUTES.MANAGE.ROOT,
    vehicles: ROUTES.MANAGE.VEHICLES,
    vehicleNew: listYourVehicleRegisterPath(VEHICLE_REGISTRATION_SOURCE.ACCOUNT),
    calendar: ROUTES.MANAGE.CALENDAR,
    chat: ROUTES.MANAGE.CHAT,
    bookings: ROUTES.MANAGE.BOOKINGS,
    bookingRequests: ROUTES.MANAGE.BOOKING_REQUESTS,
    // Hồ sơ chủ xe = trang tài khoản của họ. Chủ xe tuyến hoa hồng chỉ có chi nhánh mặc định,
    // và địa chỉ của nó sửa ở section "Địa chỉ nhận xe" của chính trang đó.
    ownerProfile: accountSectionPath(ACCOUNT_SECTION.PROFILE),
    branches: accountSectionPath(ACCOUNT_SECTION.ADDRESS),
    subscription: accountSectionPath(ACCOUNT_SECTION.PLAN),
    sellerProfile: accountSectionPath(ACCOUNT_SECTION.TAX),
    support: ROUTES.MANAGE.SUPPORT_CASES,
  };
}

export type WorkspacePaths = ReturnType<typeof workspacePaths>;

/**
 * Đường dẫn tới MỘT chiếc xe theo khu đang đứng — cùng lý do tồn tại với `workspacePaths`: không
 * component nào của `vehicles`/`vehicle-manage` tự biết mình đang ở `/account`, `/manage` hay
 * trong một phiên hỗ trợ của nhân sự nền tảng (ADR 0050). Tách khỏi `WorkspacePaths` vì bảng đó
 * là bảng CHUỖI (nơi khác dùng `keyof` của nó làm đích link).
 */
export interface WorkspaceVehiclePaths {
  /** Trang chính của một xe khi bấm vào nó từ danh sách. */
  detail: (id: string) => string;
  /**
   * HỒ SƠ 360 của xe — trang TỔNG QUAN (việc cần làm · trạng thái chợ · lịch sắp tới · hiệu suất).
   *
   * Khác `detail`: ở khu tài khoản, bấm vào một chiếc xe từ danh sách mở thẳng không gian
   * "Quản lý xe" (`detail` → `…/manage`), nhưng Hồ sơ 360 vẫn là một trang RIÊNG và có thật ở
   * `/account/vehicles/:id`. Thiếu đường dẫn này thì không gian quản lý xe là ngõ cụt một chiều:
   * vào được, không có lối quay về trang tổng quan của chính chiếc xe đó.
   */
  overview: (id: string) => string;
  /** Một mục của không gian "Quản lý xe" (Owner Lite). */
  manageSection: (id: string, section: VehicleManageSection) => string;
  /**
   * Màn sửa xe nhiều tab — CHỈ có ở cổng quản lý.
   *
   * Cố ý trả `/manage/...` ở cả hai khu: nó là đường dẫn NỘI BỘ của chính màn đó
   * (`VehicleEditWorkspace` ghi lại `?tab=` khi đổi tab), và màn đó không được dựng ở khu tài
   * khoản. Link ĐI TỚI một phần hồ sơ xe phải đi qua `part`, không qua hàm này.
   */
  edit: (id: string) => string;
  /**
   * Một PHẦN của hồ sơ xe, khai bằng CẢ HAI hệ toạ độ: `tab` của màn sửa ở cổng quản lý và
   * `section` của không gian "Quản lý xe" ở khu tài khoản.
   *
   * Vì sao bắt khai cả hai thay vì tra một bảng `tab → section`: vài phần **không có bản ở khu
   * tài khoản** (nguồn xe, bảo dưỡng — cả hai thuộc tuyến gói), và một bảng tra sẽ âm thầm rơi
   * về tab mặc định thay vì nói ra điều đó. `section: null` = phần chỉ có ở cổng quản lý, và ở
   * khu tài khoản nó trả `null` để nơi gọi **ẩn hẳn lối vào** thay vì dẫn người dùng ra ngoài khu
   * của họ — nơi `AppShell` sẽ đá họ ngược lại.
   */
  part: (id: string, tab: VehicleEditTab, section: VehicleManageSection | null) => string | null;
  /**
   * "Nơi chủ xe sửa hồ sơ chiếc xe này" — đích của nút **Chỉnh sửa** trên Hồ sơ 360.
   *
   * Khác `edit`: `edit` là một ROUTE cụ thể của cổng quản lý, còn đây là một Ý ĐỊNH, và hai khu
   * thực hiện nó bằng hai màn khác nhau (màn sửa nhiều tab · không gian "Quản lý xe").
   */
  profile: (id: string) => string;
  /** Giá & chính sách của xe — hai khu hai màn, cùng `PUT /vehicles/:id/pricing`. */
  pricing: (id: string) => string;
  /** Tối ưu nhận chuyến (tự động nhận, khoảng đặt trước) — có ở cả hai khu. */
  optimization: (id: string) => string;
}

export function workspaceVehiclePaths(workspace: Workspace): WorkspaceVehiclePaths {
  const isManage = workspace === WORKSPACE.MANAGE;
  return {
    detail: isManage ? vehiclePath.detail : ownerVehiclePath.manage,
    overview: isManage ? vehiclePath.detail : ownerVehiclePath.detail,
    manageSection: ownerVehicleManagePath.section,
    edit: (id) => vehiclePath.edit(id),
    part: (id, tab, section) =>
      isManage
        ? vehicleTabPath(id, tab)
        : section
          ? ownerVehicleManagePath.section(id, section)
          : null,
    profile: (id) =>
      isManage
        ? vehiclePath.edit(id)
        : ownerVehicleManagePath.section(id, VEHICLE_MANAGE_DEFAULT_SECTION),
    // Cổng quản lý: MỤC trong màn sửa xe, không phải route `/pricing` cũ — route đó nay chỉ
    // còn là một lần chuyển hướng tới đúng mục này, và bắt link mới đi qua nó là một nhịp thừa.
    pricing: (id) =>
      isManage
        ? vehicleTabPath(id, VEHICLE_EDIT_TAB.PRICING)
        : ownerVehicleManagePath.section(id, VEHICLE_MANAGE_SECTION.PRICING),
    optimization: (id) =>
      isManage
        ? vehicleTabPath(id, VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION)
        : ownerVehicleManagePath.section(id, VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION),
  };
}

/**
 * Không gian hỗ trợ gian hàng của nhân sự nền tảng — ADR 0050.
 *
 * MỘT chỗ dựng gốc: ngày khu quản lý tách sang tên miền riêng, chỉ bảng này và
 * `tenantSupportContextIdFromPath` phải đổi. Không component nào tự ghép chuỗi `/manage/admin/tenant-support/`.
 */
export const adminTenantSupportPath = {
  root: (contextId: string): string => `${ROUTES.ADMIN.TENANT_SUPPORT}/${contextId}`,
  vehicleEdit: (contextId: string, id: string): string =>
    `${ROUTES.ADMIN.TENANT_SUPPORT}/${contextId}/vehicles/${id}/edit`,
  vehicleManageSection: (contextId: string, id: string, section: VehicleManageSection): string =>
    `${ROUTES.ADMIN.TENANT_SUPPORT}/${contextId}/vehicles/${id}/manage/${section}`,
};

/** Tham số URL mở sẵn chi tiết một gian hàng trên danh sách đối tác (ADR 0004 — sống qua F5). */
export const ADMIN_PARTNER_TENANT_PARAM = 'tenant';

/** Tab đang mở của drawer chi tiết đối tác — cùng URL với `tenant`, để F5/Back mở lại đúng tab. */
export const ADMIN_PARTNER_TAB_PARAM = 'tab';

const ADMIN_PARTNER_LIST_ROUTE: Readonly<Record<PlatformPartnerKind, string>> = {
  [PLATFORM_PARTNER_KIND.PACKAGE_SHOP]: ROUTES.ADMIN.PARTNER_SHOPS,
  [PLATFORM_PARTNER_KIND.INDIVIDUAL_OWNER]: ROUTES.ADMIN.PARTNER_OWNERS,
};

/**
 * Hai danh sách đối tác của Platform Admin — MỘT chỗ ghép URL.
 *
 * `resolveTenant` dành cho nơi biết gian hàng nhưng KHÔNG biết loại (một đơn thuê, lối thoát phiên
 * hỗ trợ): nó đi qua URL cũ `ADMIN_TENANTS`, nơi server nói gian hàng thuộc danh sách nào. Client
 * không bao giờ tự đoán loại.
 */
export const adminPartnerPath = {
  list: (kind: PlatformPartnerKind): string => ADMIN_PARTNER_LIST_ROUTE[kind],
  tenant: (kind: PlatformPartnerKind, tenantId: string): string =>
    `${ADMIN_PARTNER_LIST_ROUTE[kind]}?${new URLSearchParams({ [ADMIN_PARTNER_TENANT_PARAM]: tenantId })}`,
  resolveTenant: (tenantId: string): string =>
    `${ROUTES.ADMIN.TENANTS}?${new URLSearchParams({ [ADMIN_PARTNER_TENANT_PARAM]: tenantId })}`,
};

/** Tham số URL mở sẵn chi tiết MỘT xe trên màn "Xe toàn hệ thống" (ADR 0004 — sống qua F5, gửi link được). */
export const ADMIN_VEHICLE_OPEN_PARAM = 'open';

/** Tham số URL mở sẵn một PHIẾU trên màn "Duyệt xe" (trang gốc của site quản trị). */
export const ADMIN_APPROVAL_TASK_PARAM = 'task';

/**
 * Màn "Xe toàn hệ thống" của Platform Admin — MỘT chỗ ghép URL cho các màn khác trỏ tới:
 * mở sẵn một xe (từ đơn thuê, phiếu duyệt, nhật ký) hay xem cả đội xe của một gian hàng.
 */
export const adminVehiclePath = {
  open: (vehicleId: string): string =>
    `${ROUTES.ADMIN.VEHICLES}?${new URLSearchParams({ [ADMIN_VEHICLE_OPEN_PARAM]: vehicleId })}`,
  forTenant: (tenantId: string): string =>
    `${ROUTES.ADMIN.VEHICLES}?${new URLSearchParams({ tenantId })}`,
};

/** Màn "Duyệt xe" — mở sẵn một phiếu. */
export const adminApprovalPath = {
  task: (taskId: string): string =>
    `${ROUTES.ADMIN.ROOT}?${new URLSearchParams({ [ADMIN_APPROVAL_TASK_PARAM]: taskId })}`,
};

/** Màn "Đơn thuê toàn hệ thống" — lọc sẵn theo xe (tham số `vehicleId` của `useAdminBookingFilters`). */
export const adminBookingPath = {
  forVehicle: (vehicleId: string): string =>
    `${ROUTES.ADMIN.BOOKINGS}?${new URLSearchParams({ vehicleId })}`,
};

/**
 * Link từ site partner/quản trị sang một trang CÔNG KHAI của site khách (trang xe, trang gian
 * hàng): tương đối ở chế độ `path`, tuyệt đối ở chế độ `host` — một `<a href="/listings/…">` trần
 * trên `admin.xeprime.vn` sẽ rơi vào khu quản trị và 404 (ADR 0051).
 */
export function marketSiteHref(path: string): string {
  return siteHref(ZONE.MARKET, path);
}

export function tenantSupportContextIdFromPath(pathname: string): string | null {
  const prefix = `${ROUTES.ADMIN.TENANT_SUPPORT}/`;
  if (!pathname.startsWith(prefix)) return null;
  const segment = pathname.slice(prefix.length).split('/')[0];
  return isSupportContextId(segment) ? segment : null;
}

export const vehiclePath = {
  detail: (id: string): string => `${ROUTES.MANAGE.VEHICLES}/${id}`,
  edit: (id: string): string => `${ROUTES.MANAGE.VEHICLES}/${id}/edit`,
  /** Giá & chính sách theo xe (Wave 2): kế thừa gian hàng hoặc ghi đè riêng. */
  pricing: (id: string): string => `${ROUTES.MANAGE.VEHICLES}/${id}/pricing`,
  /**
   * Tối ưu nhận chuyến — tự động nhận, khoảng đặt trước, lộ trình ưu tiên (17/09/2026).
   *
   * Bề mặt chủ xe tuyến hoa hồng có mục này từ lâu ở `/account/vehicles/...`; gian hàng thì
   * không, nên xe gian hàng không có đường nào bật "Đặt ngay" dù server vẫn đọc đúng cờ đó.
   */
  optimization: (id: string): string => `${ROUTES.MANAGE.VEHICLES}/${id}/optimization`,
};

/**
 * Giá trị `?tab=` CHUẨN của màn sửa xe (Wave 8).
 *
 * Đặt tên ở đây vì hai phía cùng phải hiểu một chuỗi: `VehicleEditWorkspace` đọc nó từ URL,
 * còn Hồ sơ 360 / cảnh báo sinh link tới nó. Gõ lệch một chữ thì link không chết — nó âm thầm
 * rơi về tab "Thông tin", và không ai nhận ra.
 */
export const VEHICLE_EDIT_TAB = {
  INFORMATION: 'information',
  /** Thư viện ảnh — giá trị chuẩn là `media` (không phải `images`). */
  MEDIA: 'media',
  PRICING: 'pricing',
  SOURCE: 'source',
  DOCUMENTS: 'documents',
  MAINTENANCE: 'maintenance',
  /**
   * Vận hành & điều kiện thuê — tab của develop, nay là BÍ DANH: mở "Thời gian giao nhận" (khối
   * đầu tiên của tab cũ). Link cũ, bookmark và cảnh báo mang `?tab=operations` vẫn mở được.
   */
  OPERATIONS: 'operations',

  /*
   * ── Mục bổ ra từ tab "Vận hành & điều kiện thuê" (29/09/2026) ────────────
   *
   * Bốn giá trị là MỤC MENU (giao nhận · nhận chuyến & thủ tục × 2 · phụ phí). Hai giá trị
   * `*-terms` là BÍ DANH trỏ về "Nhận chuyến & thủ tục" của dịch vụ đó — xem `resolveEditTab`.
   *
   * Giá trị TRÙNG TÊN với mục của `VEHICLE_MANAGE_SECTION` (dấu `-` thay cho `/`) để
   * `vehicles.part()` ánh xạ được một-một giữa hai khu.
   */
  HANDOVER_TIME: 'handover-time',
  SELF_DRIVE_OPTIMIZATION: 'self-drive-optimization',
  SELF_DRIVE_TERMS: 'self-drive-terms',
  WITH_DRIVER_OPTIMIZATION: 'with-driver-optimization',
  WITH_DRIVER_SURCHARGES: 'with-driver-surcharges',
  WITH_DRIVER_TERMS: 'with-driver-terms',
} as const;

export type VehicleEditTab = (typeof VEHICLE_EDIT_TAB)[keyof typeof VEHICLE_EDIT_TAB];
export const VEHICLE_EDIT_TAB_VALUES = Object.values(VEHICLE_EDIT_TAB) as VehicleEditTab[];

export function vehicleTabPath(id: string, tab: VehicleEditTab): string {
  return `${vehiclePath.edit(id)}?tab=${tab}`;
}

/**
 * Chi tiết một đơn thuê (Wave 10) — route THẬT, không phải drawer.
 *
 * Vận hành một chuyến (giao xe → đang thuê → nhận lại → hoàn cọc) kéo dài nhiều ngày và nhiều
 * người cùng nhìn; nó cần một đường link gửi được, F5 không mất và mở lại đúng chỗ. Drawer ở
 * danh sách vẫn giữ cho thao tác nhanh.
 */
export const bookingPath = {
  detail: (id: string): string => `${ROUTES.MANAGE.BOOKINGS}/${id}`,
};

/**
 * Hồ sơ một khách trong SỔ KHÁCH của gian hàng (S-01) — route thật, không phải drawer.
 *
 * Cùng lý do với `bookingPath`: người ta gửi link hồ sơ khách cho nhau ("xem giúp anh khách
 * này"), mở lại nhiều lần trong ngày, và F5 không được mất chỗ đang đọc.
 */
export const customerPath = {
  detail: (id: string): string => `${ROUTES.MANAGE.CUSTOMERS}/${id}`,
};

/** Trang xem/in hợp đồng thuê. */
export const contractPath = {
  detail: (id: string): string => `${partner('/contracts')}/${id}`,
};

/**
 * Nhật ký kiểm toán của MỘT đối tượng (admin nền tảng).
 *
 * Trang audit đọc sẵn `targetType`/`targetId` từ URL (tham số "sâu" — có test ở
 * `audit-page.test.tsx`), nên đây là một đường link thật chứ không phải URL đoán. `targetType`
 * là mã API ghi vào `audit_logs.target_type` — xem `AUDIT_TARGET_TYPE` ở `features/admin-audit`.
 */
export const adminAuditPath = {
  forTarget: (targetType: string, targetId: string): string =>
    `${ROUTES.ADMIN.AUDIT}?${new URLSearchParams({ targetType, targetId }).toString()}`,
};

/**
 * Sổ Thu-Chi đã LỌC SẴN — đường đi từ một đơn / một xe / một khách / một con số tổng sang đúng
 * tập phiếu sinh ra nó.
 *
 * Ba tham số đối tượng (`bookingId`/`vehicleId`/`tenantCustomerId`) không có ô nào trên thanh
 * lọc: chúng chỉ đến từ đây. Bốn tham số còn lại có ô, nhưng thẻ tổng ở `/manage/finance` phải
 * ghi CHÍNH XÁC bộ đó — nhất là `sourceGroup` và `status`: thiếu chúng, bấm vào thẻ "Doanh thu"
 * sẽ mở ra một sổ cộng cả tiền cọc lẫn phiếu chưa duyệt, tức thẻ nói một số và danh sách nó dẫn
 * tới nói số khác. Dựng chuỗi ở một chỗ để không màn nào tự ghép query rồi lệch tên tham số.
 */
export const receiptsPath = {
  filtered: (params: {
    bookingId?: string;
    vehicleId?: string;
    tenantCustomerId?: string;
    categoryId?: string;
    type?: string;
    status?: string;
    sourceGroup?: string;
    from?: string;
    to?: string;
    /**
     * Mở sẵn form tạo phiếu khi tới nơi (`create=1`) — không phải một bộ lọc.
     *
     * Cho phép một cú bấm ở hồ sơ xe vừa lọc sổ về xe đó vừa mở form với xe đã chọn, mà vẫn là
     * một đường dẫn thường: gửi được, quay lại được, sống sót qua reload.
     */
    create?: boolean;
  }): string => {
    // `create` là boolean; `String(true)` cho ra `create=true`, mà URL quy ước ở đây là cờ `1`.
    const query = new URLSearchParams(
      Object.entries(params)
        .filter(([, value]) => Boolean(value))
        .map(([key, value]) => [key, value === true ? '1' : String(value)]),
    ).toString();
    return query ? `${ROUTES.MANAGE.RECEIPTS}?${query}` : ROUTES.MANAGE.RECEIPTS;
  },
};

/**
 * Chi tiết một chuyến của KHÁCH (Wave 11).
 *
 * `id` nhận cả id yêu cầu thuê lẫn id đơn thuê: thông báo phát ra từ Wave 5/9/10 trỏ vào cả hai
 * loại, và backend phân giải cả hai về cùng một chuyến. Nhờ vậy không có link thông báo nào cần
 * biết trước chuyến đã lên đơn hay chưa.
 */
export const tripPath = {
  /**
   * `base` đổi KHU chứa chuyến, không đổi chuyến.
   *
   * Cùng một chuyến đọc được từ hai vỏ: khu khách (`/trips`) và lối chuyển tiếp trong Manage
   * (`/manage/account/trips`) — xem `ROUTES.MANAGE.ACCOUNT_TRIPS`. Ghép chuỗi tại nơi gọi thì mỗi
   * màn tự nhớ một tiền tố, và một trong số đó sẽ trỏ ngược vào khu người dùng vừa bị đưa ra.
   */
  detail: (id: string, base: string = ROUTES.TRIPS): string => `${base}/${id}`,
};

/** Đường dẫn xe công khai trên Marketplace. */
export const listingPath = {
  detail: (id: string): string => `/listings/${id}`,
};

/** Đường dẫn trang gian hàng công khai `/shops/[slug]`. */
export const shopPath = {
  detail: (slug: string): string => `/shops/${slug}`,
};

/**
 * Tên tham số URL chọn section của MỌI trang nhiều section ở site partner — Cửa hàng, Tài khoản /
 * Hồ sơ chủ xe, Số dư & rút tiền. Một hằng, để bộ dựng đường dẫn và nơi đọc không lệch nhau.
 */
export const SECTION_PARAM = 'section';

/**
 * Năm section của trang Cửa hàng — GIÁ TRỊ đi trong `?section=`, không phải nhãn.
 *
 * Ở URL chứ không ở state React vì ba lý do, và cả ba đều là hành vi người dùng trông đợi ở một
 * trang: gửi được link tới đúng phần ("xem hộ mục Gói & hạn mức"), F5 không mất chỗ đang đọc, và
 * nút Quay lại của trình duyệt đi ngược đúng thứ tự vừa xem. Đây cũng là điều kiện để ba route
 * cũ redirect vào đúng phần thay vì đổ hết về đầu trang.
 */
export const SHOP_SECTION = {
  /** Tên hiển thị, giới thiệu, logo, ảnh bìa — thứ khách nhìn thấy trên chợ. */
  PROFILE: 'profile',
  /** Tài khoản chủ sở hữu (`tenants.owner_user_id`) — chỉ đọc với mọi vai khác chủ. */
  OWNER: 'owner',
  /** Địa chỉ chi nhánh mặc định + số giấy phép kinh doanh (tuỳ chọn). */
  LEGAL: 'legal',
  /**
   * Thông tin khai thuế — hồ sơ NGƯỜI BÁN (`seller_profiles`): loại chủ thể, tên pháp lý, MST
   * (07/10/2026). CÙNG section, cùng component với "Hồ sơ chủ xe" của tuyến hoa hồng — nguồn duy
   * nhất của MST mà hợp đồng và báo cáo thuế đọc.
   */
  TAX: 'tax',
  /** Gói hiện hành, hạn mức chỗ, và hoá đơn thanh toán. */
  PLAN: 'plan',
} as const;

/**
 * `?section=payout` CŨ của trang Cửa hàng (16/09 → 07/10/2026). "Tài khoản nhận tiền" đã về trang
 * "Số dư & rút tiền" ở cả hai tuyến; trang Cửa hàng đưa giá trị này sang `balancePayoutPath()` để
 * link trong thông báo và bookmark cũ vẫn tới đúng chỗ. KHÔNG còn là một `ShopSection`.
 */
export const SHOP_LEGACY_PAYOUT_SECTION = 'payout';

export type ShopSection = (typeof SHOP_SECTION)[keyof typeof SHOP_SECTION];
export const SHOP_SECTION_VALUES = Object.values(SHOP_SECTION) as ShopSection[];

/** Section mở khi `?section=` vắng mặt hoặc không hợp lệ. */
export const SHOP_SECTION_DEFAULT: ShopSection = SHOP_SECTION.PROFILE;

/**
 * `?section=` → section hợp lệ. Giá trị lạ (bookmark cũ, gõ tay) rơi về `profile` thay vì dựng
 * một trang trống — người dùng gõ sai một chữ vẫn phải thấy nội dung.
 */
export function shopSectionOf(value: string | null | undefined): ShopSection {
  return (SHOP_SECTION_VALUES as string[]).includes(value ?? '')
    ? (value as ShopSection)
    : SHOP_SECTION_DEFAULT;
}

/** Đường dẫn tới một section — dùng cho link, redirect và nút điều hướng trong trang. */
export function shopSectionPath(section: ShopSection): string {
  return `${ROUTES.MANAGE.SHOP}?${SECTION_PARAM}=${section}`;
}

/** Id của phần tử section trong DOM — dùng chung cho `aria-controls`, anchor và scroll. */
export function shopSectionDomId(section: ShopSection): string {
  return `shop-section-${section}`;
}

/**
 * `id` của NÚT tải logo gian hàng trong section "Thông tin hiển thị".
 *
 * Hai chỗ nhắm vào nó: dải "Còn 1 bước để đăng xe" sau khi gian hàng thanh toán xong, và thông
 * báo lỗi khi gửi xe duyệt mà hồ sơ chưa có logo (ADR 0040). Hằng số chứ không phải chuỗi gõ tay
 * ở ba nơi — gõ sai một ký tự là nút cuộn về hư không, và không có gì đỏ lên để báo.
 */
export const SHOP_LOGO_TRIGGER_ID = 'shop-logo-upload';

/**
 * ── SỐ DƯ & RÚT TIỀN (07/10/2026) ───────────────────────────────────────────────────────────
 *
 * "Tài khoản nhận tiền" là một khối của trang số dư ở CẢ hai tuyến — không còn là trang riêng
 * (`/bank-accounts`, Owner Lite) hay section của trang Cửa hàng (tuyến gói). Rút tiền và nơi tiền
 * về là một việc: người bấm "Rút" mà chưa có tài khoản phải thấy chỗ khai ngay trên cùng trang.
 *
 * `?section=payout` chỉ để CUỘN tới khối đó — đích của hai đường cũ và của link chia sẻ.
 */
export const BALANCE_PAYOUT_SECTION = 'payout';

/** Id DOM của khối "Tài khoản nhận tiền" trên trang số dư — đích cuộn của `?section=payout`. */
export const BALANCE_PAYOUT_DOM_ID = 'balance-payout';

/** Đường dẫn tới khối "Tài khoản nhận tiền" của trang số dư. */
export function balancePayoutPath(): string {
  return `${ROUTES.MANAGE.BALANCE}?${SECTION_PARAM}=${BALANCE_PAYOUT_SECTION}`;
}

/**
 * ── TÀI KHOẢN (site partner, 05/10/2026) ─────────────────────────────────────────────────────
 *
 * MỘT trang cho mọi thứ của CON NGƯỜI đang đăng nhập — gộp "Hồ sơ cá nhân" và "Bảo mật tài
 * khoản" vốn là hai trang lặp nhau (cả hai đều hiện email/SĐT). Cùng khuôn với trang Cửa hàng:
 * section xếp dọc, mục lục dính, `?section=` ở URL để link/F5/Quay lại đúng chỗ.
 *
 * `ADDRESS`, `TAX`, `PLAN` CHỈ có ở bản "Hồ sơ chủ xe" (chủ xe tuyến hoa hồng). Ở tuyến gói, ba thứ
 * đó là section của `SHOP` (địa chỉ & pháp lý, gói & hạn mức) — trang của họ bỏ qua các giá trị
 * này (`PERSONAL_ACCOUNT_SECTIONS`). Bookmark cũ `?section=storefront` (trước 07/10/2026) rơi về
 * `PROFILE` — nơi lời giới thiệu đã chuyển tới.
 */
export const ACCOUNT_SECTION = {
  /**
   * Tên và ảnh đại diện của tài khoản — với chủ xe hoa hồng là "Thông tin chủ xe": họ tên, ảnh
   * và lời giới thiệu, tức TOÀN BỘ thứ khách thấy về họ (ADR 0054).
   */
  PROFILE: 'profile',
  /** Địa chỉ nhận xe (chi nhánh mặc định) + MST/giấy phép tuỳ chọn (chỉ chủ xe hoa hồng). */
  ADDRESS: 'address',
  /**
   * Thông tin khai thuế — loại chủ thể, tên pháp lý, CCCD/MST của hồ sơ người bán (chỉ chủ xe hoa
   * hồng; trước 07/10/2026 là trang riêng `/tax`). Thuế ĐÃ khấu trừ là chuyện tiền, nên nó ở trang
   * "Số dư & rút tiền", không ở đây.
   */
  TAX: 'tax',
  /** Gói dịch vụ + phễu nâng cấp lên gian hàng (chỉ chủ xe hoa hồng; trước là trang `/subscription`). */
  PLAN: 'plan',
  /** Email và SĐT đăng nhập — đổi qua OTP. */
  LOGIN: 'login',
  /** Đổi (hoặc đặt lần đầu) mật khẩu. */
  PASSWORD: 'password',
  /** Yêu cầu xoá tài khoản — một support case, không phải nút xoá. */
  DELETE: 'delete',
} as const;

export type AccountSection = (typeof ACCOUNT_SECTION)[keyof typeof ACCOUNT_SECTION];
export const ACCOUNT_SECTION_VALUES = Object.values(ACCOUNT_SECTION) as AccountSection[];

/** Section của trang "Tài khoản & bảo mật" thường (tuyến gói, thành viên) — không có phần gian hàng. */
export const PERSONAL_ACCOUNT_SECTIONS: readonly AccountSection[] = [
  ACCOUNT_SECTION.PROFILE,
  ACCOUNT_SECTION.LOGIN,
  ACCOUNT_SECTION.PASSWORD,
  ACCOUNT_SECTION.DELETE,
];

/** `?section=` → section hợp lệ; giá trị lạ rơi về `profile` (cùng luật với `shopSectionOf`). */
export function accountSectionOf(value: string | null | undefined): AccountSection {
  return (ACCOUNT_SECTION_VALUES as string[]).includes(value ?? '')
    ? (value as AccountSection)
    : ACCOUNT_SECTION.PROFILE;
}

/** Đường dẫn tới một section của trang tài khoản partner. */
export function accountSectionPath(section: AccountSection): string {
  return `${ROUTES.MANAGE.ACCOUNT}?${SECTION_PARAM}=${section}`;
}

/** Id của phần tử section trong DOM — đích của anchor và của cuộn. */
export function accountSectionDomId(section: AccountSection): string {
  return `account-section-${section}`;
}

/**
 * Section của "Hồ sơ chủ xe" → section CÙNG VAI ở trang Cửa hàng, cho người nay đã ở tuyến gói:
 * chủ xe vừa thanh toán nâng cấp ngay trên section "Gói dịch vụ", hay một bookmark cũ của gian hàng
 * hết gói rồi gia hạn. `null` = section của CON NGƯỜI (đăng nhập, mật khẩu…) — vẫn ở trang tài khoản.
 *
 * Nhận chuỗi thô của `?section=` (không qua `accountSectionOf`): giá trị vắng/lạ không phải là lời
 * mời sang trang khác.
 */
export function shopSectionForAccountSection(value: string | null | undefined): ShopSection | null {
  switch (value) {
    case ACCOUNT_SECTION.PLAN:
      return SHOP_SECTION.PLAN;
    case ACCOUNT_SECTION.TAX:
      return SHOP_SECTION.TAX;
    case ACCOUNT_SECTION.ADDRESS:
      return SHOP_SECTION.LEGAL;
    default:
      return null;
  }
}

/**
 * ── ONBOARDING GIAN HÀNG (ADR 0040) ──────────────────────────────────────────────────────────
 *
 * Hai tham số URL, hai vai trò khác nhau, và cả hai chỉ là GỢI Ý cho lần vẽ đầu — trạng thái
 * thật luôn đến từ server (`onboardingState`, `billingMode`).
 */

/** `?track=` của màn onboarding — chỉ có nghĩa khi người dùng CHƯA có gian hàng nào. */
export const REGISTRATION_TRACK_PARAM = 'track';

/**
 * `?welcome=1` của trang Cửa hàng — "vừa thanh toán xong, chào mừng".
 *
 * Chỉ điều khiển một dải chào NHỎ, không mở/khoá bất cứ thứ gì: quyền đến từ `/auth/me`. Đó là
 * lý do nó được phép nằm trong URL và được phép sống sót qua một lần chia sẻ link — kịch bản xấu
 * nhất là ai đó thấy một dòng chào mừng không dành cho họ.
 */
export const SHOP_WELCOME_PARAM = 'welcome';

/** Đường vào màn onboarding theo CỬA người dùng vừa bấm. */
export function manageOnboardingPath(track: RegistrationTrack): string {
  return track === REGISTRATION_TRACK.COMMISSION
    ? ROUTES.MANAGE.ONBOARDING
    : `${ROUTES.MANAGE.ONBOARDING}?${REGISTRATION_TRACK_PARAM}=${track}`;
}

/**
 * Trang ĐĂNG KÝ của site partner, mang sẵn tuyến đã chọn (ADR 0040 điều 1 · ADR 0051 điều 3) — dùng
 * TỪ SITE KHÁCH ("Đăng xe cho thuê", "Mở gian hàng"), nên là link KHÁC site: tuyệt đối ở chế độ
 * `host`. `?track=` chỉ là gợi ý cho bước chọn tuyến; tuyến thật lưu ở `tenants.onboarding_state`
 * khi tạo gian hàng.
 */
export function partnerRegisterHref(track?: RegistrationTrack): string {
  const path = track ? `/register?${REGISTRATION_TRACK_PARAM}=${track}` : '/register';
  return siteHref(ZONE.PARTNER, path);
}

/**
 * Bước ĐẦU của một tuyến, cho tài khoản đối tác CHƯA có gian hàng — đích của hai nút trên trang chọn
 * cách cho thuê, và của `/register?track=…` sau khi tạo tài khoản:
 *
 *  - hoa hồng → wizard đăng xe nhanh: khai hồ sơ chủ xe + chiếc xe đầu tiên, gian hàng mở ở bước lưu;
 *  - gói → onboarding gói: tạo gian hàng trả phí rồi thanh toán (ADR 0040).
 */
export function partnerTrackStartHref(track: RegistrationTrack): string {
  return track === REGISTRATION_TRACK.COMMISSION
    ? listYourVehicleRegisterPath(VEHICLE_REGISTRATION_SOURCE.MARKETPLACE)
    : manageOnboardingPath(REGISTRATION_TRACK.PACKAGE);
}

/**
 * Đích SAU LẦN THANH TOÁN ĐẦU TIÊN của gian hàng trả phí.
 *
 * `/manage/shop` chứ không `/manage`: gian hàng vừa mở chưa có xe, chưa có đơn, nên dashboard
 * chỉ toàn số 0 và không nói được việc gì tiếp theo. Việc duy nhất còn lại — tải logo để gửi xe
 * duyệt — nằm ở section hồ sơ của trang Cửa hàng.
 */
export function shopWelcomePath(): string {
  return `${ROUTES.MANAGE.SHOP}?${SHOP_WELCOME_PARAM}=1&section=${SHOP_SECTION.PROFILE}`;
}

/**
 * Anchor của section "Thanh toán giữ chỗ qua XePrime" bên trong trang Chính sách thuê.
 *
 * Sống ở đây chứ không trong `page.tsx`: route redirect `/manage/shop/payment-settings` cũng
 * cần đúng chuỗi này để đưa người đã bookmark rơi vào đúng phần, và hai chỗ gõ tay cùng một
 * hash là hai chỗ để nó trôi khỏi nhau.
 */
export const SHOP_POLICIES_DEPOSIT_ANCHOR = 'deposit-collection';
