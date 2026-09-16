/**
 * Mọi đường dẫn của web nằm ở đây.
 *
 * CLAUDE.md mục 5 cấm rải string literal nghiệp vụ trong component; route cũng vậy — đổi
 * cấu trúc URL mà phải grep chuỗi `/manage/...` khắp source là cách sinh link chết.
 */
export const ROUTES = {
  HOME: '/',
  /** Trang kết quả tìm xe — sở hữu bộ lọc, sắp xếp, phân trang (trang chủ chỉ xem trước). */
  SEARCH: '/search',
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
    /** Tạo gian hàng — chỉ mở khi user có owner intent tường minh, không tự bật. */
    ONBOARDING: '/manage/onboarding',

    // Quản lý gian hàng
    CALENDAR: '/manage/calendar',
    VEHICLES: '/manage/vehicles',
    VEHICLE_NEW: '/manage/vehicles/new',
    /** Trung tâm bảo dưỡng toàn đội xe (Wave 6 — docs/design/12 §9.2). */
    MAINTENANCE: '/manage/maintenance',
    BOOKINGS: '/manage/bookings',
    BOOKING_REQUESTS: '/manage/booking-requests',
    CUSTOMERS: '/manage/customers',
    FINANCE: '/manage/finance',
    /** Ví điểm gian hàng — khoản XePrime phải trả (ADR 0033). KHÔNG gác bằng gói. */
    BALANCE: '/manage/balance',
    RECEIPTS: '/manage/receipts',
    DEBTS: '/manage/debts',

    // Cài đặt gian hàng
    SHOP: '/manage/shop',
    /**
     * Tài khoản & bảo mật của NGƯỜI đang đăng nhập — tách khỏi hồ sơ gian hàng (`SHOP`).
     * Trước 15/09/2026 không có màn này, nên nhân viên sống trong `/manage` không có đường nào
     * trong cổng để đổi mật khẩu của chính mình.
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
     * Công tắc thu cọc qua XePrime (Phase 6 — ADR 0032 điều 2).
     *
     * Khác `SHOP_POLICIES`: ở đó là **cọc/thế chấp giữa gian hàng và khách** (tài sản, giấy tờ),
     * ở đây là **khoản `D` XePrime thu hộ trước chuyến**. Hai khái niệm tiền khác nhau, hai màn.
     */
    SHOP_PAYMENT_SETTINGS: '/manage/shop/payment-settings',
    /** Hồ sơ người bán do gian hàng khai — điều kiện trước khi nhận tiền khách thật (ADR 0028 gate 1). */
    SELLER_PROFILE: '/manage/shop/seller-profile',
    MEMBERS: '/manage/members',
    /** "Gói của tôi" — gói hiện hành, hạn mức chỗ, lượt miễn phí, mua gói (W2, ADR 0015/0026). */
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
export const VEHICLE_MANAGE_DEFAULT_SECTION: VehicleManageSection = VEHICLE_MANAGE_SECTION.INFORMATION;

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
      subscription: ROUTES.MANAGE.SUBSCRIPTION,
      sellerProfile: ROUTES.MANAGE.SELLER_PROFILE,
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
