/**
 * Mọi đường dẫn của web nằm ở đây.
 *
 * CLAUDE.md mục 5 cấm rải string literal nghiệp vụ trong component; route cũng vậy — đổi
 * cấu trúc URL mà phải grep chuỗi `/manage/...` khắp source là cách sinh link chết.
 */
import { REGISTRATION_TRACK, type RegistrationTrack } from '@xeprime/types';

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
   * Khu TÀI KHOẢN của một CON NGƯỜI — khác hoàn toàn hồ sơ gian hàng (`/manage/shop`).
   *
   * ADR 0014: chủ xe, chủ gian hàng và khách thuê là cùng một con người có thể mang nhiều vai,
   * nên tất cả vào CHUNG khu này. Không có `/manage/account` — cổng quản lý chỉ link sang đây
   * (`ManageUserCard`), vì hai trang cùng ghi vào một hàng `users` là bug chờ sẵn.
   *
   * Mục "Chuyến của tôi" và "Tin nhắn" KHÔNG nằm dưới `/account`: chúng đã có route riêng từ
   * trước (`TRIPS`, `CHAT`) và đang được thông báo trỏ tới — menu tài khoản chỉ dẫn sang.
   */
  ACCOUNT: {
    ROOT: '/account',
    /*
     * Khu CHỦ XE trong /account (08/09/2026): bản rút gọn cho người có ít xe — cùng feature, cùng
     * API với `/manage`, chỉ khác vỏ điều hướng (ADR 0027/0028: Owner Lite dùng chung source).
     * Chỉ hiện với `tenant.roleKey === shop_owner`; nhân viên gian hàng dùng `/manage`.
     */
    /**
     * Tiến trình ĐĂNG KÝ chủ xe — hồ sơ và chiếc xe đầu tiên đang đi qua vòng duyệt nền tảng.
     *
     * Đây là toàn bộ khu chủ xe của bậc `registering` (`resolveOwnerStage`): một màn nói rõ đang
     * chờ gì, thiếu gì, bị từ chối vì sao, và sửa được ngay tại chỗ. Nó thay cho đường vòng cũ
     * — bắt chủ xe mới vào `/manage/shop` bấm "Gửi duyệt", tức là kéo tuyến hoa hồng vào đúng
     * cổng quản lý mà họ không thuộc về (ADR 0027/0028).
     */
    REGISTRATION: '/account/registration',
    /** Danh sách xe của chủ xe — cùng `features/vehicles` với `/manage/vehicles`. */
    VEHICLES: '/account/vehicles',
    /**
     * Hộp thư phía CHỦ XE (`side=shop`) — khác `/chat` là hộp thư phía khách thuê.
     *
     * Một con người có cả hai vai (ADR 0014) nên có cả hai hộp thư; chủ xe tuyến hoa hồng không
     * vào `/manage/chat` được nên hộp thư gian hàng của họ sống ở đây, dựng lại từ CÙNG
     * `ChatView` chứ không phải một khung chat thứ hai.
     */
    MESSAGES: '/account/messages',
    /**
     * Gói dịch vụ của chủ xe — bản `/account` của `/manage/subscription`.
     *
     * Đây là phễu nâng cấp từ tuyến hoa hồng lên tuyến gian hàng (ADR 0028 điều 1). Chặn
     * `/manage` mà không dời màn này sang đây nghĩa là cắt đứt chính đường mà người dùng đi để
     * trả tiền.
     */
    SUBSCRIPTION: '/account/subscription',
    /** Lịch xe — import thẳng `CalendarScheduler`, không có lịch thứ hai. */
    CALENDAR: '/account/calendar',
    /** Cẩm nang cho thuê xe — tài liệu PDF ở `public/owner-resources/` (xem `owner-resources.ts`). */
    HOST_GUIDE: '/account/host-guide',
    /** Thông tin khai thuế — bản compact của hồ sơ người bán (`/seller-profile`). */
    TAX: '/account/tax',
    /** Hợp đồng & chứng từ MẪU (thư viện PDF) — không phải hợp đồng theo đơn thuê. */
    CONTRACTS_DOCUMENTS: '/account/contracts-documents',
    /** Chính sách bảo vệ dữ liệu — dẫn tới văn bản thật ở `/legal/privacy`. */
    DATA_PROTECTION: '/account/data-protection',
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
    /**
     * Tiền cho thuê xe — ví điểm của GIAN HÀNG, bản `/account` của `/manage/balance`.
     *
     * Vì sao phải có hai đường vào cùng một sổ: chủ xe tuyến hoa hồng KHÔNG vào được `/manage`
     * (`canUseManagePortal` = false), mà ADR 0032 khiến mỗi chuyến hoàn thành của họ đều sinh
     * khoản XePrime phải trả `D − T`. Không có route này thì tiền vào sổ rồi nằm đó, chủ xe
     * không thấy và không rút được — đúng thứ ADR 0033 điều 1 nói là không được phép.
     *
     * KHÁC `BALANCE`: `BALANCE` là ví của MỘT CON NGƯỜI (tiền hoàn khoản giữ chỗ khi họ đi
     * thuê), đây là ví của gian hàng họ sở hữu. Hai loại tiền, hai sổ, không trộn.
     */
    EARNINGS: '/account/earnings',
    FAVORITES: '/account/favorites',
    ADDRESSES: '/account/addresses',
    /** Kho giấy tờ tuỳ thân của khách (GPLX/CCCD) — ADR 0014: gian hàng đối chiếu tay. */
    DOCUMENTS: '/account/documents',
    NOTIFICATIONS: '/account/notifications',
    SUPPORT: '/account/support',
    SETTINGS: '/account/settings',
  },
  /**
   * Đăng xe cho thuê — CỬA VÀO công khai của chủ xe mới (09/09/2026).
   *
   * Nằm ngoài `/manage` có chủ đích: người chưa có gian hàng không nên gặp cổng quản lý trước
   * khi biết mình sẽ được gì. Landing xem không cần đăng nhập; bấm CTA mới đi qua auth →
   * onboarding → wizard.
   */
  LIST_YOUR_VEHICLE: {
    ROOT: '/list-your-vehicle',
    /** Wizard đăng xe nhanh 3 bước — cần đăng nhập + có gian hàng (guard ở trang). */
    REGISTER: '/list-your-vehicle/register',
  },

  MANAGE: {
    ROOT: '/manage',
    /** Đăng nhập cổng quản lý (chủ xe / nhân viên / quản trị nền tảng). Route CÔNG KHAI. */
    LOGIN: '/manage/login',
    /**
     * ONBOARDING — hai bước, hai tuyến, một route (ADR 0040).
     *
     * Chỉ mở khi user có ý định tường minh (CTA chủ xe / CTA gian hàng), không tự bật. Nội dung
     * suy từ SERVER, không từ `?track=`:
     *
     * | Trạng thái thật | Màn hiện ra |
     * | --- | --- |
     * | chưa có gian hàng, `?track=commission` (mặc định) | form hồ sơ chủ xe |
     * | chưa có gian hàng, `?track=package` | bước 1: tạo gian hàng trả phí |
     * | `package_pending` | bước 2: chọn gói → QR chuyển khoản |
     * | gói đã hiệu lực | chuyển tới `/manage/shop?welcome=1` |
     * | tuyến hoa hồng | chuyển tới `/account/registration` |
     *
     * `?track=` CHỈ có nghĩa khi chưa có gian hàng — sau đó `tenants.onboarding_state` là nguồn,
     * nên F5 / đóng trình duyệt / đăng nhập lại đều rơi đúng bước còn nợ.
     */
    ONBOARDING: '/manage/onboarding',

    // Quản lý gian hàng
    CALENDAR: '/manage/calendar',
    VEHICLES: '/manage/vehicles',
    VEHICLE_NEW: '/manage/vehicles/new',
    /** Trung tâm bảo dưỡng toàn đội xe (Wave 6 — docs/design/12 §9.2). */
    MAINTENANCE: '/manage/maintenance',
    BOOKINGS: '/manage/bookings',
    /**
     * Lối tắt "Chờ giao xe" — CÙNG danh sách, cùng endpoint, chỉ khác một nhóm việc dựng sẵn
     * (`preset=awaiting_pickup` gửi lên server).
     *
     * Vì sao là một ĐƯỜNG DẪN chứ không phải `/manage/bookings?preset=…`: mục menu đang mở được
     * quyết bằng `matchSelectedKey(pathname, …)`, và `usePathname()` không mang query. Một mục
     * menu gắn query sẽ hoặc không bao giờ sáng, hoặc làm sáng luôn cả "Tất cả đơn thuê". Sửa
     * bằng cách cho khung ứng dụng đọc `useSearchParams()` thì đắt hơn nhiều: `AppShell` không
     * nằm trong `Suspense` nào, nên cả cổng quản lý sẽ rơi xuống render phía client.
     *
     * Đứng cạnh `/manage/bookings/[id]` là an toàn: Next ưu tiên đoạn TĨNH, và id đơn là ULID
     * 26 ký tự nên không có đơn nào mang tên này.
     */
    BOOKINGS_AWAITING_PICKUP: '/manage/bookings/awaiting-pickup',
    BOOKING_REQUESTS: '/manage/booking-requests',
    CUSTOMERS: '/manage/customers',
    FINANCE: '/manage/finance',
    /** Ví điểm gian hàng — khoản XePrime phải trả (ADR 0033). KHÔNG gác bằng gói. */
    BALANCE: '/manage/balance',
    RECEIPTS: '/manage/receipts',
    DEBTS: '/manage/debts',

    /**
     * CỬA HÀNG — một trang cho toàn bộ thiết lập của gian hàng (16/09/2026).
     *
     * Năm section, chọn bằng `?section=` (xem `SHOP_SECTION`): thông tin hiển thị · chủ gian
     * hàng · địa chỉ & pháp lý · tài khoản nhận tiền · gói & hạn mức (kèm hoá đơn).
     *
     * Trước đợt này chúng nằm rải ở bốn mục sidebar — "Cửa hàng", "Gói & hoá đơn", "Tài khoản &
     * bảo mật", "Hồ sơ người bán" — và ba trong bốn mục đó hỏi cùng một loại câu hỏi ("gian
     * hàng của tôi khai gì"). Gộp ở tầng TRANG, không gộp dữ liệu: mỗi section vẫn gọi đúng API
     * của nó, và section "Gói & hạn mức" dựng lại chính `SubscriptionWorkspace` chứ không clone.
     */
    SHOP: '/manage/shop',
    /**
     * BẢO MẬT TÀI KHOẢN của NGƯỜI đang đăng nhập — phương thức đăng nhập, mật khẩu, xoá tài khoản.
     *
     * KHÔNG có mục sidebar (16/09/2026): đây là việc của một CON NGƯỜI, không phải một bước vận
     * hành, nên nó vào menu tài khoản ở thẻ người dùng — đúng chỗ người ta đi tìm nó. Một dòng
     * thường trực trong sidebar gian hàng đứng cạnh "Đơn thuê" và "Chi nhánh" là một dòng nói về
     * chủ đề khác hẳn các dòng còn lại.
     */
    SECURITY: '/manage/security',
    /**
     * ALIAS CHUYỂN TIẾP (16/09/2026) — đích thật: `SECURITY`.
     *
     * Trang cũ gộp hồ sơ CON NGƯỜI (tên, ảnh) với bảo mật (mật khẩu, xoá tài khoản) và một thẻ
     * lối vào gian hàng. Hai nửa đầu tách ra: tên/ảnh thuộc tài khoản marketplace và sửa ở
     * `/account`, còn bảo mật ở `SECURITY`. Hằng số này chỉ còn cho trang redirect.
     */
    ACCOUNT: '/manage/account',
    /**
     * LỐI ĐI CHUYỂN TIẾP tới chuyến ĐI THUÊ cũ của người đang đăng nhập (15/09/2026).
     *
     * Chỉ dành cho người từng là chủ xe tuyến hoa hồng rồi nâng lên gian hàng tuyến gói: họ có
     * thể còn chuyến đi thuê chưa khép, kênh liên hệ với chủ xe kia, và khoản hoàn chưa nhận.
     * Ẩn `/trips` mà không để lại đường nào là GIẤU MẤT tiền và nghĩa vụ của chính họ.
     *
     * KHÔNG có mục menu nào dẫn tới đây — nó là lối THEO NGỮ CẢNH, hiện trong "Tài khoản & bảo
     * mật" đúng khi còn chuyến. Một mục "Chuyến của tôi" thường trực trong Manage sẽ dựng lại
     * đúng thứ tuyến gói vừa gỡ bỏ.
     *
     * Dữ liệu ở đây LUÔN khoá vai `renter`. Chuyến họ CHO THUÊ sống ở `/manage/bookings`.
     */
    ACCOUNT_TRIPS: '/manage/account/trips',
    /** Chi nhánh gian hàng — nơi xe thực sự nằm, và là vị trí công khai của xe. */
    SHOP_BRANCHES: '/manage/shop/branches',
    /** Chính sách thuê mặc định của gian hàng (Wave 2 — cọc/giao nhận/quá giờ/ưu đãi). */
    SHOP_POLICIES: '/manage/shop/policies',
    /**
     * ALIAS CHUYỂN TIẾP (16/09/2026) — không còn là trang thật, không còn mục nav nào dẫn tới.
     * Đích thật: `SHOP_POLICIES` + `#${SHOP_POLICIES_DEPOSIT_ANCHOR}`.
     *
     * Công tắc thu cọc qua XePrime (Phase 6 — ADR 0032 điều 2) đã gộp vào `SHOP_POLICIES` làm
     * một section riêng (khái niệm tiền vẫn khác `SHOP_POLICIES` — cọc/thế chấp tại quầy vs
     * khoản `D` XePrime thu hộ — chỉ không còn cần HAI route cho hai khái niệm đó). Hằng số
     * này chỉ còn để trang redirect giữ đường dẫn cũ sống cho ai đã bookmark.
     */
    SHOP_PAYMENT_SETTINGS: '/manage/shop/payment-settings',
    /**
     * ALIAS CHUYỂN TIẾP (16/09/2026) — đích thật: `SHOP` + `?section=legal`.
     *
     * Hồ sơ người bán THÔI làm một màn của chủ gian hàng: bốn thứ nó hỏi (loại chủ thể, tên pháp
     * lý, MST, số giấy tờ) đã có chỗ trong "Địa chỉ & pháp lý", còn tài khoản nhận tiền — thứ
     * chiếm nửa màn cũ — đã về `bank_accounts`. Backend GIỮ NGUYÊN (`seller_profiles`, hàng đợi
     * xác minh `/manage/admin/sellers`, quan hệ khấu trừ thuế): nó vẫn là hồ sơ mà nền tảng
     * duyệt và module thuế đọc, chỉ không còn là một mục trong menu của chủ shop.
     */
    SELLER_PROFILE: '/manage/shop/seller-profile',
    MEMBERS: '/manage/members',
    /**
     * ALIAS CHUYỂN TIẾP (16/09/2026) — đích thật: `SHOP` + `?section=plan`.
     *
     * Gói và hạn mức là MỘT PHẦN của "gian hàng của tôi khai gì", không phải một khu riêng. Nội
     * dung không mất gì: hạn mức chỗ, hạn gói, mua/gia hạn và hoá đơn (kèm QR) đều sống tiếp
     * trong section đó, dựng từ chính `SubscriptionWorkspace`.
     *
     * `/account/subscription` thì GIỮ NGUYÊN là trang thật — chủ xe tuyến hoa hồng không vào
     * `/manage` được, và đó là phễu nâng cấp của họ (ADR 0028 điều 1).
     */
    SUBSCRIPTION: '/manage/subscription',
    DRIVERS: '/manage/drivers',
    CHAT: '/manage/chat',
    /** Trung tâm hỗ trợ của cổng quản lý — hướng dẫn nhanh + câu hỏi thường gặp. */
    SUPPORT: '/manage/support',
    /** Case hỗ trợ / tranh chấp của gian hàng (R3 — ADR 0028 release gate 7). */
    SUPPORT_CASES: '/manage/support/cases',

    // Quản trị nền tảng
    ADMIN: '/manage/admin',
    ADMIN_TENANTS: '/manage/admin/tenants',
    ADMIN_VEHICLES: '/manage/admin/vehicles',
    ADMIN_BOOKINGS: '/manage/admin/bookings',
    ADMIN_CUSTOMERS: '/manage/admin/customers',
    ADMIN_AUDIT: '/manage/admin/audit',
    ADMIN_STAFF: '/manage/admin/staff',
    ADMIN_PLANS: '/manage/admin/plans',
    /** Hàng đợi đối soát tiền vào (R2 — ADR 0022 điều 4): khớp tay khoản không rút được mã. */
    ADMIN_BANK_TRANSACTIONS: '/manage/admin/bank-transactions',
    ADMIN_CATALOG: '/manage/admin/catalog',
    /** Danh mục hành chính (tỉnh/thành) — dữ liệu dùng chung cho mọi gian hàng. */
    ADMIN_LOCATIONS: '/manage/admin/locations',
    ADMIN_BANNERS: '/manage/admin/marketplace-banners',
    /** Hàng đợi xác minh người bán (R3 — ADR 0028 release gate 1). */
    ADMIN_SELLERS: '/manage/admin/sellers',
    /** Quản trị chính sách phí có phiên bản (R3 — ADR 0028 điều 2–3). */
    ADMIN_FEE_POLICIES: '/manage/admin/fee-policies',
    ADMIN_PROMO_CODES: '/manage/admin/promo-codes',
    /** Money operations: hàng đợi giữ chỗ, chuyển trả, đối chiếu ngày (R3 — ADR 0028 gate 6–7). */
    ADMIN_MONEY: '/manage/admin/money',
    /** Hàng đợi hỗ trợ/tranh chấp toàn sàn (R3 — ADR 0028 release gate 7). */
    ADMIN_SUPPORT: '/manage/admin/support',
  },
} as const;

export type ManageRoute = (typeof ROUTES.MANAGE)[keyof typeof ROUTES.MANAGE];

/**
 * Chi tiết một xe nhìn từ KHU TÀI KHOẢN của chủ xe — cùng `VehicleDetailContent` với
 * `/manage/vehicles/[id]`, chỉ khác vỏ và đường quay lại.
 */
export const accountVehiclePath = {
  detail: (id: string): string => `${ROUTES.ACCOUNT.VEHICLES}/${id}`,
  /** Không gian "Quản lý xe" của chủ xe (08/09/2026) — gốc tự chuyển tới mục đầu tiên. */
  manage: (id: string): string => `${ROUTES.ACCOUNT.VEHICLES}/${id}/manage`,
};

/**
 * Các mục của không gian "Quản lý xe" (`/account/vehicles/[id]/manage/<mục>`) — GIÁ TRỊ đường
 * dẫn, không phải nhãn. Menu trái, trang con và `VehicleEditWorkspace` ở `/manage` cùng đọc.
 *
 * Nhóm "có tài xế" KHÔNG có mục "Tiện ích bổ sung": mockup có nó nhưng nghiệp vụ không — phụ phí
 * mặc định đã nằm ở `WITH_DRIVER_SURCHARGES`.
 */
export const VEHICLE_MANAGE_SECTION = {
  INFORMATION: 'information',
  IMAGES: 'images',
  DOCUMENTS: 'documents',
  TRIP_HISTORY: 'trip-history',
  SELF_DRIVE_PRICING: 'self-drive/pricing',
  SELF_DRIVE_OPTIMIZATION: 'self-drive/optimization',
  SELF_DRIVE_DELIVERY: 'self-drive/delivery',
  SELF_DRIVE_HANDOVER_TIME: 'self-drive/handover-time',
  SELF_DRIVE_TERMS: 'self-drive/terms',
  WITH_DRIVER_PRICING: 'with-driver/pricing',
  WITH_DRIVER_OPTIMIZATION: 'with-driver/optimization',
  WITH_DRIVER_SURCHARGES: 'with-driver/surcharges',
  WITH_DRIVER_TERMS: 'with-driver/terms',
} as const;

export type VehicleManageSection =
  (typeof VEHICLE_MANAGE_SECTION)[keyof typeof VEHICLE_MANAGE_SECTION];
export const VEHICLE_MANAGE_SECTION_VALUES = Object.values(
  VEHICLE_MANAGE_SECTION,
) as VehicleManageSection[];

/** Mục mở mặc định khi vào gốc `/manage` của một xe. */
export const VEHICLE_MANAGE_DEFAULT_SECTION: VehicleManageSection =
  VEHICLE_MANAGE_SECTION.INFORMATION;

export const accountVehicleManagePath = {
  section: (id: string, section: VehicleManageSection): string =>
    `${accountVehiclePath.manage(id)}/${section}`,
};

/**
 * Đường dẫn có thuộc không gian quản lý xe không — `AccountShell` dùng để chuyển sang bố cục
 * trọn bề ngang cho CẢ tiền tố (mọi mục con), khác lịch xe chỉ khớp tuyệt đối.
 */
export function isAccountVehicleManagePath(pathname: string): boolean {
  return /^\/account\/vehicles\/[^/]+\/manage(\/|$)/.test(pathname);
}

/** Mục đang mở suy từ đường dẫn — `null` khi đang ở gốc hoặc một mục lạ. */
export function vehicleManageSectionOf(pathname: string): VehicleManageSection | null {
  const match = /^\/account\/vehicles\/[^/]+\/manage\/(.+?)\/?$/.exec(pathname);
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
  /** Từ chợ / landing công khai. */
  MARKETPLACE: 'marketplace',
  /** Từ khu tài khoản của chủ xe (`/account/vehicles`). */
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
      return ROUTES.MANAGE.VEHICLES;
    case VEHICLE_REGISTRATION_SOURCE.ACCOUNT:
      return ROUTES.ACCOUNT.VEHICLES;
    default:
      return ROUTES.LIST_YOUR_VEHICLE.ROOT;
  }
}

/** Wizard đăng xe nhanh, mang theo ngữ cảnh mở. */
export function listYourVehicleRegisterPath(source: VehicleRegistrationSource): string {
  return `${ROUTES.LIST_YOUR_VEHICLE.REGISTER}?from=${source}`;
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
 *  - `bookings`/`bookingRequests` của Owner Lite là **"Chuyến của tôi"** — một danh sách gồm cả
 *    hai phía, chủ xe duyệt/từ chối ngay trên thẻ (xem CODEMAP "Chuyến của tôi gồm CẢ HAI PHÍA").
 *  - `branches` không có bản `/account`: chủ xe tuyến hoa hồng chỉ có chi nhánh mặc định, và địa
 *    chỉ của nó sửa ngay trong hồ sơ chủ xe. Chi nhánh là tính năng của gói (ADR 0027 điều 1).
 *  - `sellerProfile` về `/account/tax` — bản compact của cùng hồ sơ người bán.
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
      sellerProfile: shopSectionPath(SHOP_SECTION.LEGAL),
      support: ROUTES.MANAGE.SUPPORT,
    };
  }
  return {
    home: ROUTES.ACCOUNT.ROOT,
    vehicles: ROUTES.ACCOUNT.VEHICLES,
    vehicleNew: listYourVehicleRegisterPath(VEHICLE_REGISTRATION_SOURCE.ACCOUNT),
    calendar: ROUTES.ACCOUNT.CALENDAR,
    chat: ROUTES.ACCOUNT.MESSAGES,
    bookings: ROUTES.TRIPS,
    bookingRequests: ROUTES.TRIPS,
    ownerProfile: ROUTES.ACCOUNT.REGISTRATION,
    branches: ROUTES.ACCOUNT.REGISTRATION,
    subscription: ROUTES.ACCOUNT.SUBSCRIPTION,
    sellerProfile: ROUTES.ACCOUNT.TAX,
    support: ROUTES.ACCOUNT.SUPPORT,
  };
}

export type WorkspacePaths = ReturnType<typeof workspacePaths>;

export const vehiclePath = {
  detail: (id: string): string => `/manage/vehicles/${id}`,
  edit: (id: string): string => `/manage/vehicles/${id}/edit`,
  /** Giá & chính sách theo xe (Wave 2): kế thừa gian hàng hoặc ghi đè riêng. */
  pricing: (id: string): string => `/manage/vehicles/${id}/pricing`,
  /**
   * Tối ưu nhận chuyến — tự động nhận, khoảng đặt trước, lộ trình ưu tiên (17/09/2026).
   *
   * Bề mặt chủ xe tuyến hoa hồng có mục này từ lâu ở `/account/vehicles/...`; gian hàng thì
   * không, nên xe gian hàng không có đường nào bật "Đặt ngay" dù server vẫn đọc đúng cờ đó.
   */
  optimization: (id: string): string => `/manage/vehicles/${id}/optimization`,
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
  /** Vận hành & điều kiện thuê (08/09/2026) — cùng các khối với không gian quản lý xe ở /account. */
  OPERATIONS: 'operations',
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
  detail: (id: string): string => `/manage/bookings/${id}`,
};

/**
 * Hồ sơ một khách trong SỔ KHÁCH của gian hàng (S-01) — route thật, không phải drawer.
 *
 * Cùng lý do với `bookingPath`: người ta gửi link hồ sơ khách cho nhau ("xem giúp anh khách
 * này"), mở lại nhiều lần trong ngày, và F5 không được mất chỗ đang đọc.
 */
export const customerPath = {
  detail: (id: string): string => `/manage/customers/${id}`,
};

/** Trang xem/in hợp đồng thuê. */
export const contractPath = {
  detail: (id: string): string => `/manage/contracts/${id}`,
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
    `${ROUTES.MANAGE.ADMIN_AUDIT}?${new URLSearchParams({ targetType, targetId }).toString()}`,
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
  /** Địa chỉ chi nhánh mặc định + mã số thuế/giấy phép (tuỳ chọn). */
  LEGAL: 'legal',
  /** Sổ `bank_accounts` phạm vi gian hàng. */
  PAYOUT: 'payout',
  /** Gói hiện hành, hạn mức chỗ, và hoá đơn thanh toán. */
  PLAN: 'plan',
} as const;

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
  return `${ROUTES.MANAGE.SHOP}?section=${section}`;
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
