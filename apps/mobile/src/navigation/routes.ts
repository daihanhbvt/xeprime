import type { Href } from 'expo-router';
import type { LegalDoc } from '@xeprime/domain';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from './vehicle-edit-tab';
import {
  VEHICLE_REGISTRATION_SOURCE,
  type VehicleRegistrationSource,
} from './vehicle-registration-source';
import { VEHICLE_MANAGE_SECTION, type VehicleManageSection } from './vehicle-manage-section';

/**
 * BẢN ĐỒ ROUTE CỦA APP — nguồn duy nhất cho mọi lối đi giữa các màn.
 *
 * Không viết chuỗi đường dẫn thẳng trong component. Đường dẫn nằm trong cây thư mục `app/` của
 * Expo Router, nên đổi tên một file là mọi `router.push('/...')` rải rác đều sai — mà TypeScript
 * không bắt được vì chúng chỉ là chuỗi. Gom về đây thì đổi một chỗ, và trình biên dịch chỉ ra
 * ngay chỗ nào còn dùng sai.
 *
 * Cấu trúc: MỖI DOMAIN MỘT NAMESPACE (`explore`, `booking`, `account`, …), khớp với thư mục
 * `src/features/<domain>`. Thêm domain mới thì thêm namespace mới — KHÔNG gom mọi route vào một
 * object phẳng, vì phẳng thì sau vài phase không còn đọc được cái nào thuộc về ai.
 *
 * Mỗi entry là một hàm trả `Href`: tham số đi qua chữ ký hàm nên không thể quên, và query string
 * được dựng ở đúng một chỗ.
 */
/**
 * Đoạn đường dẫn của từng mục "quản lý xe" — MỘT bảng, không phải 13 nhánh `switch` cùng lặp lại
 * tiền tố `/account/vehicles/[id]/manage/`. Bảng là `Record` đầy đủ nên thêm một mục vào
 * `VEHICLE_MANAGE_SECTION` mà quên đường dẫn sẽ đỏ ngay ở đây, thay vì âm thầm rơi vào nhánh
 * `default`.
 */
const VEHICLE_MANAGE_SECTION_PATHNAME = {
  [VEHICLE_MANAGE_SECTION.INFORMATION]: '/account/vehicles/[id]/manage/information',
  [VEHICLE_MANAGE_SECTION.IMAGES]: '/account/vehicles/[id]/manage/images',
  [VEHICLE_MANAGE_SECTION.DOCUMENTS]: '/account/vehicles/[id]/manage/documents',
  [VEHICLE_MANAGE_SECTION.TRIP_HISTORY]: '/account/vehicles/[id]/manage/trip-history',
  [VEHICLE_MANAGE_SECTION.SELF_DRIVE_PRICING]: '/account/vehicles/[id]/manage/self-drive/pricing',
  [VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION]:
    '/account/vehicles/[id]/manage/self-drive/optimization',
  [VEHICLE_MANAGE_SECTION.SELF_DRIVE_DELIVERY]: '/account/vehicles/[id]/manage/self-drive/delivery',
  [VEHICLE_MANAGE_SECTION.SELF_DRIVE_HANDOVER_TIME]:
    '/account/vehicles/[id]/manage/self-drive/handover-time',
  [VEHICLE_MANAGE_SECTION.SELF_DRIVE_TERMS]: '/account/vehicles/[id]/manage/self-drive/terms',
  [VEHICLE_MANAGE_SECTION.WITH_DRIVER_PRICING]: '/account/vehicles/[id]/manage/with-driver/pricing',
  [VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION]:
    '/account/vehicles/[id]/manage/with-driver/optimization',
  [VEHICLE_MANAGE_SECTION.WITH_DRIVER_SURCHARGES]:
    '/account/vehicles/[id]/manage/with-driver/surcharges',
  [VEHICLE_MANAGE_SECTION.WITH_DRIVER_TERMS]: '/account/vehicles/[id]/manage/with-driver/terms',
} as const satisfies Record<VehicleManageSection, string>;

export const ROUTES = {
  /** Chợ xe: trang khám phá, tìm kiếm, chi tiết xe. */
  explore: {
    home: (): Href => '/explore',
    search: (params?: ExploreSearchParams): Href =>
      params && Object.keys(params).length > 0 ? { pathname: '/search', params } : '/search',
    listingDetail: (vehicleId: string, serviceType?: string): Href =>
      serviceType
        ? { pathname: '/listings/[id]', params: { id: vehicleId, serviceType } }
        : { pathname: '/listings/[id]', params: { id: vehicleId } },
    /**
     * Trang gian hàng công khai (MKT-05). Khoá là SLUG chứ không phải id — cùng địa chỉ với
     * `/shops/[slug]` bên web, nên một liên kết chia sẻ mở được ở cả hai nơi.
     */
    shopDetail: (slug: string): Href => ({ pathname: '/shops/[slug]', params: { slug } }),
  },

  /** Chuyến của khách — yêu cầu thuê và đơn thuê là HAI GIAI ĐOẠN của cùng một chuyến. */
  booking: {
    list: (): Href => '/trips',
    /**
     * `GET /trips/:id` nhận CẢ id yêu cầu lẫn id đơn, nên một route phục vụ cả hai giai đoạn của
     * cùng một chuyến — không phải đoán loại id trước khi điều hướng.
     */
    detail: (tripId: string): Href => ({ pathname: '/trips/[id]', params: { id: tripId } }),
    /**
     * Wizard gửi yêu cầu thuê một chiếc xe (BKG-01) — CÔNG KHAI, khách vãng lai vào được.
     *
     * `provinceCode` là tỉnh khách đang LỌC ở màn tìm xe — điền sẵn ô địa chỉ giao xe (ADR 0035).
     * Native không có URL để mang ngữ cảnh, nên nó đi qua tham số điều hướng, đúng cách
     * `serviceType` đang đi.
     */
    request: (
      vehicleId: string,
      context?: { serviceType?: string; provinceCode?: string },
    ): Href => ({
      pathname: '/listings/[id]/request',
      /*
       * `id` khai TƯỜNG MINH trong object, không gom vào một `Record<string, string>` dựng dần:
       * route có tham số động nên `Href` đòi `params.id`, và `Record` không chứng minh được là
       * nó có mặt — typecheck của app đỏ (CI hiện không chạy typecheck cho `apps/mobile`).
       */
      params: {
        id: vehicleId,
        ...(context?.serviceType ? { serviceType: context.serviceType } : {}),
        ...(context?.provinceCode ? { provinceCode: context.provinceCode } : {}),
      },
    }),
  },

  /**
   * Hộp thư KHÁCH — `side = customer`. Inbox gian hàng là một bề mặt KHÁC, ở `manage.chat`.
   *
   * Hai namespace chứ không một hàm nhận `side`: web cũng có hai địa chỉ (`/chat` và
   * `/manage/chat`) vì đó là hai tập dữ liệu khác nhau, và một tài khoản vừa thuê xe vừa làm chủ
   * gian hàng có cả hai. Gộp thành một route nhận tham số là mở đường cho một màn quên truyền
   * `side` và nhận về danh sách trộn.
   */
  chat: {
    list: (): Href => '/chat',
    /**
     * Một cuộc trò chuyện. Nhận id nên deep link và thông báo đẩy mở thẳng được.
     *
     * `vehicleId` là NGỮ CẢNH ĐANG CHỜ, không phải bộ lọc: nó đi kèm đúng câu nhắn ĐẦU TIÊN sau
     * khi khách bấm "Nhắn shop" từ một tin đăng, rồi biến mất. Cùng vai với `?v=` mà web đặt lên
     * URL — hội thoại thuộc về GIAN HÀNG (một thread cho mọi xe của shop), nên chiếc xe phải đi
     * kèm riêng.
     */
    thread: (conversationId: string, vehicleId?: string): Href => ({
      pathname: '/chat/[id]',
      params: vehicleId ? { id: conversationId, v: vehicleId } : { id: conversationId },
    }),
  },

  /** Tài khoản, đăng nhập, hồ sơ. */
  account: {
    home: (): Href => '/account',
    /**
     * Khu CHỦ XE trong tài khoản — gương của `ROUTES.ACCOUNT.*` bên web (08/09/2026).
     *
     * Tám màn, nằm ở STACK NGOÀI bộ tab (`app/account/*.tsx`, không phải `app/(tabs)/`) vì mỗi
     * màn là một nấc sâu mở ra từ menu tài khoản và phải lui được về đúng chỗ vừa rời — mục của
     * thanh tab thì không.
     *
     * `vehicles` và `calendar` chỉ đổi VỎ điều hướng quanh đúng feature của `/manage` (ADR 0027 —
     * Owner Lite dùng chung source): cùng API, cùng hook, cùng thẻ xe, cùng lưới lịch. Chi tiết xe
     * và hub sửa xe thì KHÔNG nhân bản — chúng là màn chen ngang nằm ngoài bộ tab quản lý
     * (`app/manage/vehicles/[id]/…`), nên mở từ đây vẫn lui về đúng danh sách này.
     */
    vehicles: (): Href => '/account/vehicles',
    calendar: (): Href => '/account/calendar',
    /** Hồ sơ 360 của một xe — cùng màn với `/manage`, mở từ danh sách xe của khu tài khoản. */
    vehicleDetail: (vehicleId: string): Href => ({
      pathname: '/account/vehicles/[id]',
      params: { id: vehicleId },
    }),
    /**
     * Không gian "QUẢN LÝ XE" của một chiếc xe — 13 mục, ba nhóm (web: menu trái; app: một màn
     * mục lục rồi mỗi mục một màn).
     *
     * Gốc là MỤC LỤC chứ không tự chuyển sang mục đầu tiên như web: web có menu trái luôn hiện
     * nên "gốc" của nó không cần tồn tại, còn trên điện thoại mục lục CHÍNH LÀ menu.
     */
    vehicleManage: (vehicleId: string): Href => ({
      pathname: '/account/vehicles/[id]/manage',
      params: { id: vehicleId },
    }),
    /**
     * Một mục của không gian quản lý xe. `section` là `VEHICLE_MANAGE_SECTION.*` — cùng bộ giá
     * trị web đặt trên URL, nên một liên kết sâu ánh xạ 1-1 giữa hai client.
     */
    vehicleManageSection: (vehicleId: string, section: VehicleManageSection): Href =>
      ({
        pathname: VEHICLE_MANAGE_SECTION_PATHNAME[section],
        params: { id: vehicleId },
      }) as Href,
    hostGuide: (): Href => '/account/host-guide',
    contractsDocuments: (): Href => '/account/contracts-documents',
    dataProtection: (): Href => '/account/data-protection',
    /** Thông tin khai thuế — bản compact của hồ sơ người bán, cùng `PUT /seller-profile`. */
    tax: (): Href => '/account/tax',
    /** Đổi mật khẩu, hoặc ĐẶT lần đầu với tài khoản OTP/mạng xã hội (`hasPassword === false`). */
    changePassword: (): Href => '/account/change-password',
    /** YÊU CẦU xoá tài khoản — mở support case `account_deletion`, nền tảng xử lý tay. */
    deleteAccount: (): Href => '/account/delete-account',
    /**
     * Gói dịch vụ nhìn từ khu KHÁCH — cùng màn với , khác đúng cái vỏ.
     *
     * Phải có bản này vì chủ xe tuyến hoa hồng KHÔNG vào khu quản lý được (ADR 0038 điều 4), mà
     * họ chính là người cần màn này nhất: đây là phễu nâng cấp lên gian hàng, và cũng là nơi duy
     * nhất hiện trần 3 xe của Owner Lite (điều 12). Thiếu nó thì đường nâng cấp đứt hẳn trên app.
     *
     * Rời MENU theo ADR 0038 điều 9 — nâng cấp là việc MỘT LẦN — nên lối vào là thẻ "Gian hàng
     * của tôi" đầu trang hồ sơ, không phải một mục thường trực.
     */
    subscription: (): Href => '/account/subscription',

    /**
     * "Tiền cho thuê xe" — sổ ví của GIAN HÀNG nhìn từ khu khách.
     *
     * Hai route vì HAI SỔ, không phải vì hai giao diện: cả hai đều dựng `WalletScreen`, chỉ khác
     * `scope`. Chủ xe tuyến hoa hồng không vào `/manage/balance` được, nên sổ tenant của họ cần
     * một cửa ở đây.
     */
    earnings: (): Href => '/account/earnings',

    /** Lịch sử thanh toán của CHÍNH khách — các khoản đã trả online cho XePrime. */
    payments: (): Href => '/account/payments',

    /** Tiến trình đăng ký chủ xe, và là màn "Hồ sơ chủ xe" về sau. */
    registration: (): Href => '/account/registration',
    /**
     * Ví điểm — sổ công nợ XePrime phải trả, KHÔNG phải ví điện tử (ADR 0033 điều 1).
     *
     * Không gác bằng `OwnerGate`: khách thuê cũng có số dư (tiền hoàn cọc) và họ là phần đông.
     */
    balance: (): Href => '/account/balance',
    /** Tài khoản NHẬN tiền hoàn và khoản phải trả — cũng không gác theo vai chủ xe. */
    bankAccounts: (): Href => '/account/bank-accounts',
    /** Yêu cầu hỗ trợ của CHÍNH người dùng — khác `/support` công khai của chợ xe. */
    support: (): Href => '/account/support',
    /** Một yêu cầu hỗ trợ — dòng thời gian, trả lời, đóng yêu cầu. */
    supportCase: (id: string): Href => ({ pathname: '/account/support/[id]', params: { id } }),
    login: (): Href => '/login',
    register: (): Href => '/register',
    setPassword: (): Href => '/set-password',
    forgotPassword: (): Href => '/forgot-password',
    resetPassword: (token?: string): Href =>
      token ? { pathname: '/reset-password', params: { token } } : '/reset-password',
  },

  /**
   * Đăng xe cho thuê — CỬA VÀO công khai của chủ xe mới, cùng địa chỉ với web.
   *
   * Nằm NGOÀI `manage` có chủ đích: người chưa có gian hàng không nên gặp form hỏi tên gian hàng
   * và mã số thuế trước khi biết mình sẽ được gì. Landing xem không cần đăng nhập; bấm CTA mới rẽ
   * theo trạng thái thật (đăng nhập → tạo hồ sơ chủ xe → đăng xe).
   */
  listYourVehicle: {
    root: (): Href => '/list-your-vehicle',
    /**
     * Wizard đăng xe nhanh — cửa của TUYẾN HOA HỒNG (ADR 0028).
     *
     * Nằm ở khu KHÁCH có chủ đích: chủ xe cá nhân đăng xe mà không cần gian hàng, nên nó không
     * được đứng sau `ScopeGuard`. `from` chỉ nhận một trong ba mã đã biết và chỉ dùng để chọn
     * đường lui — KHÔNG bao giờ nhận một URL để chuyển hướng: đó là cách tự mở một lỗ
     * open-redirect trên chính luồng đăng xe.
     */
    register: (from: VehicleRegistrationSource): Href => ({
      pathname: '/list-your-vehicle/register',
      params: { from },
    }),
  },

  /** Khu vận hành gian hàng — sau `ScopeGuard`, chỉ thành viên có quyền vào được. */
  manage: {
    home: (): Href => '/manage',
    more: (): Href => '/manage/more',
    requests: (): Href => '/manage/requests',
    /**
     * Danh sách đơn thuê. `vehicleId` lọc theo MỘT xe — cùng tham số web đặt trên URL
     * (`/manage/bookings?vehicleId=…`), dùng cho lối đi từ hồ sơ xe.
     */
    bookings: (filters?: { vehicleId?: string }): Href =>
      filters?.vehicleId
        ? { pathname: '/manage/bookings', params: { vehicleId: filters.vehicleId } }
        : '/manage/bookings',
    /**
     * Tạo đơn tại quầy. `prefill` mang tên + SĐT của một khách đã có trong sổ — cùng vai với
     * `?customerName=&customerPhone=` mà web đặt lên URL khi bấm "Tạo đơn thuê" ở hồ sơ khách —
     * và có thể mang sẵn XE + KHOẢNG THUÊ khi vào từ một ô trên lịch.
     *
     * Điền sẵn chứ KHÔNG dựng form thứ hai: một form tạo đơn nữa là hai bộ luật giá/lịch sẽ trôi
     * khỏi nhau. Web giải cùng bài này bằng `StaffBookingDialog` nhận thẳng `vehicleId`/
     * `pickupAt`/`returnAt`; app không có dialog nên nó đi qua route params.
     *
     * `pickupAt`/`returnAt` là ISO-8601 **UTC** — mốc tuyệt đối, không phải mặt đồng hồ.
     */
    bookingCreate: (prefill?: BookingCreatePrefill): Href => {
      const params = Object.fromEntries(
        Object.entries(prefill ?? {}).filter(([, value]) => Boolean(value)),
      ) as Record<string, string>;
      return Object.keys(params).length > 0
        ? { pathname: '/manage/bookings/new', params }
        : '/manage/bookings/new';
    },
    bookingDetail: (bookingId: string): Href => ({
      pathname: '/manage/bookings/[id]',
      params: { id: bookingId },
    }),
    /** `type` là `HANDOVER_TYPE.PICKUP` / `.RETURN` — không truyền chuỗi trần (ADR 0005). */
    handover: (bookingId: string, type: string): Href => ({
      pathname: '/manage/bookings/[id]/handover/[type]',
      params: { id: bookingId, type },
    }),
    /** Bổ sung ẢNH cho biên bản đã lập — chỉ ảnh, không sửa KM hay giờ (xem màn hình). */
    handoverPhotos: (bookingId: string): Href => ({
      pathname: '/manage/bookings/[id]/handover-photos',
      params: { id: bookingId },
    }),
    payments: (bookingId: string): Href => ({
      pathname: '/manage/bookings/[id]/payments',
      params: { id: bookingId },
    }),
    settlement: (bookingId: string): Href => ({
      pathname: '/manage/bookings/[id]/settlement',
      params: { id: bookingId },
    }),
    /** Hợp đồng của một đơn — id của HỢP ĐỒNG, không phải của đơn (server tạo idempotent). */
    contract: (contractId: string): Href => ({
      pathname: '/manage/contracts/[id]',
      params: { id: contractId },
    }),

    /** Đội xe của gian hàng — danh sách, thêm xe, hồ sơ 360, hub sửa xe, giá & chính sách. */
    vehicles: (): Href => '/manage/vehicles',
    vehicleNew: (): Href => '/manage/vehicles/new',
    vehicleDetail: (vehicleId: string): Href => ({
      pathname: '/manage/vehicles/[id]',
      params: { id: vehicleId },
    }),
    /** Hub sửa xe — sáu mục, mỗi mục một màn riêng (xem `vehicleEditTab`). */
    vehicleEdit: (vehicleId: string): Href => ({
      pathname: '/manage/vehicles/[id]/edit',
      params: { id: vehicleId },
    }),
    /**
     * Một mục của hub sửa xe. `tab` là `VEHICLE_EDIT_TAB.*` — cùng bộ giá trị web đặt trong
     * `?tab=`, nên một đường dẫn sâu do web hay thông báo đẩy sinh ra vẫn tới đúng chỗ.
     *
     * "Giá & chính sách" KHÔNG có màn con: nó là route riêng `vehiclePricing`, y như web
     * (`/manage/vehicles/[id]/pricing`).
     */
    vehicleEditTab: (vehicleId: string, tab: VehicleEditTab): Href => {
      const params = { id: vehicleId };
      switch (tab) {
        case VEHICLE_EDIT_TAB.PRICING:
          return { pathname: '/manage/vehicles/[id]/pricing', params };
        case VEHICLE_EDIT_TAB.MEDIA:
          return { pathname: '/manage/vehicles/[id]/edit/media', params };
        case VEHICLE_EDIT_TAB.SOURCE:
          return { pathname: '/manage/vehicles/[id]/edit/source', params };
        case VEHICLE_EDIT_TAB.DOCUMENTS:
          return { pathname: '/manage/vehicles/[id]/edit/documents', params };
        case VEHICLE_EDIT_TAB.MAINTENANCE:
          return { pathname: '/manage/vehicles/[id]/edit/maintenance', params };
        default:
          return { pathname: '/manage/vehicles/[id]/edit/information', params };
      }
    },
    maintenance: (): Href => '/manage/maintenance',

    /**
     * Lịch xe (CAL-01) — cùng địa chỉ với web (`/manage/calendar`) và cùng tham số.
     *
     * `q` là bộ lọc tên/biển số, KHÔNG phải một route riêng theo `vehicleId`: web cũng vậy
     * (`vehicleSchedulePath`), vì màn lịch dùng chung nhận `q` và không có route lịch-một-xe.
     * Bịa một route mới ở đây là làm "Xem lịch" dẫn tới hai kết quả khác nhau trên hai client.
     */
    calendar: (filters?: {
      q?: string;
      from?: string;
      days?: number;
      /**
       * Đã tới đây TỪ một màn khác ⇒ thanh công cụ bày nút quay lại.
       *
       * Web mang cả ĐƯỜNG DẪN quay lại (`?back=/manage/vehicles`) vì trình duyệt có thể mở
       * thẳng một URL bất kỳ. Ở app thì ngăn xếp điều hướng đã giữ sẵn lịch sử, nên chỉ cần biết
       * CÓ hay KHÔNG — mang thêm một đường dẫn là mở lại đúng lỗ open-redirect mà web phải chống
       * bằng `isSafeNextPath`.
       */
      back?: boolean;
    }): Href => {
      const params = Object.fromEntries(
        Object.entries(filters ?? {})
          .filter(([, value]) => Boolean(value))
          // `back` là một CỜ: hoá thành `'1'`, đúng quy ước `create` của sổ Thu-Chi.
          .map(([key, value]) => [key, value === true ? '1' : String(value)]),
      ) as Record<string, string>;
      return Object.keys(params).length > 0
        ? { pathname: '/manage/calendar', params }
        : '/manage/calendar';
    },

    /** Sổ khách của gian hàng (CUS-01) — mục `customers` của menu quản lý. */
    customers: (): Href => '/manage/customers',
    /**
     * Hồ sơ một khách (CUS-02) — route THẬT, deep-link được, y như web `/manage/customers/[id]`.
     *
     * Không phải một tấm trượt: hồ sơ khách được gửi cho nhau và mở lại nhiều lần trong ngày.
     */
    customerDetail: (customerId: string): Href => ({
      pathname: '/manage/customers/[id]',
      params: { id: customerId },
    }),

    /**
     * Đăng ký gian hàng (SHP-01) — lối đi DUY NHẤT tới form tạo gian hàng.
     *
     * Nằm dưới `manage/` như web (`/manage/onboarding`) để deep link ánh xạ 1-1, nhưng nó là
     * màn của người CHƯA có gian hàng: `ScopeGuard` cho qua đúng route này, xem `app/manage/_layout.tsx`.
     */
    onboarding: (): Href => '/manage/onboarding',

    /** Hồ sơ gian hàng + gửi duyệt (SHP-02). */
    shop: (): Href => '/manage/shop',

    /**
     * "Tài khoản & bảo mật" của NGƯỜI đăng nhập, bên trong khu quản lý (ADR 0038 điều 7).
     *
     * Hai HỒ SƠ khác nhau, và đây là chỗ tách chúng: `manage.shop` là hồ sơ PHÁP NHÂN (địa chỉ,
     * mã số thuế, tài khoản thu — đổi nó là đổi thứ in trên hợp đồng), còn màn này là hồ sơ CON
     * NGƯỜI. Trước đợt này, khu khách của một tài khoản gian hàng đóng lại mà không mục nào trong
     * `SHOP_NAV` dẫn tới màn đổi mật khẩu — họ phải tự đoán ra một URL thuộc khu khác.
     */
    account: (): Href => '/manage/account',

    /**
     * Chuyến ĐI THUÊ cũ của chính người đăng nhập — lối CHUYỂN TIẾP, không phải một mục menu.
     *
     * Ca thật: chủ xe tuyến hoa hồng đang đi thuê xe người khác thì nâng lên gói. Khu khách đóng
     * cùng lúc, nhưng chuyến đang chạy thì không: xe vẫn phải trả, khoản hoàn vẫn phải nhận. Lối
     * vào là một THẺ trong "Tài khoản & bảo mật", chỉ hiện khi còn chuyến chưa khép — một mục menu
     * hiện rồi biến mất theo ngày khiến hai người cùng vai nhìn thấy hai menu khác nhau.
     */
    accountTrips: (): Href => '/manage/account/trips',

    /** Chi nhánh gian hàng (SHP-03) — nơi xe thực sự nằm. */
    shopBranches: (): Href => '/manage/shop/branches',

    /** Chính sách thuê mặc định theo loại xe (SHP-04). */
    shopPolicies: (): Href => '/manage/shop/policies',

    /**
     * Công tắc thu cọc qua XePrime (Phase 6 — ADR 0032 điều 2).
     *
     * Khác `shopPolicies`: ở đó là CỌC/THẾ CHẤP giữa gian hàng và khách (tài sản, giấy tờ), ở đây
     * là khoản `D` XePrime THU HỘ trước chuyến. Hai khái niệm tiền khác nhau, hai màn.
     */
    shopPaymentSettings: (): Href => '/manage/shop/payment-settings',

    /**
     * Hồ sơ người bán (ADR 0028 release gate 1) — danh tính pháp lý + tài khoản NHẬN TIỀN.
     *
     * Cùng địa chỉ với web (`/manage/shop/seller-profile`). Bản COMPACT bốn trường ở khu tài
     * khoản (`ROUTES.account.tax()`) ghi vào CÙNG một hồ sơ — đây là bản đầy đủ của nó.
     */
    sellerProfile: (): Href => '/manage/shop/seller-profile',

    /** Nhân sự gian hàng + lời mời (SHP-05). */
    members: (): Href => '/manage/members',

    /** Tài xế của gian hàng (SHP-06). */
    drivers: (): Href => '/manage/drivers',

    /**
     * Inbox GIAN HÀNG (`side = shop`) — cùng địa chỉ với web (`/manage/chat`).
     *
     * KHÔNG dùng chung với `chat.list()`: đó là hộp thư của khách. Chủ gian hàng mở khu quản lý
     * mà thấy hội thoại riêng của mình lẫn vào là lỗi đã có thật ở web trước khi `side` thành
     * tham số bắt buộc.
     */
    chat: (): Href => '/manage/chat',
    chatThread: (conversationId: string): Href => ({
      pathname: '/manage/chat/[id]',
      params: { id: conversationId },
    }),

    /** Tổng quan doanh thu (FIN-01) — ba lớp tiền của một kỳ + hai bảng xếp hạng. */
    /** Ví điểm của GIAN HÀNG — khoản XePrime phải trả sau mỗi chuyến (ADR 0033 điều 2). */
    /** Gói thuê bao của gian hàng — mua/gia hạn, hoá đơn, mức dùng chỗ (ADR 0015/0026). */
    subscription: (): Href => '/manage/subscription',
    balance: (): Href => '/manage/balance',
    finance: (): Href => '/manage/finance',

    /** Công nợ (FIN-04) — các đơn còn nợ, lọc và phân trang ở server. */
    debts: (): Href => '/manage/debts',

    /**
     * Sổ Thu-Chi (FIN-02), tuỳ chọn LỌC SẴN — đường đi từ thẻ tổng, hồ sơ xe hay hồ sơ khách
     * sang đúng tập phiếu sinh ra con số trên đó. Gương của `receiptsPath.filtered` bên web:
     * cùng bộ tên tham số, nên một liên kết sâu do web hay thông báo đẩy sinh ra vẫn tới đúng chỗ.
     *
     * `create` KHÔNG phải bộ lọc — nó là Ý ĐỊNH mở sẵn form tạo phiếu, và web mã hoá nó thành cờ
     * `1` trên URL. Giữ nguyên quy ước đó ở đây.
     */
    receipts: (filters?: ReceiptRouteFilters): Href => {
      const params = Object.fromEntries(
        Object.entries(filters ?? {})
          .filter(([, value]) => Boolean(value))
          .map(([key, value]) => [key, value === true ? '1' : String(value)]),
      ) as Record<string, string>;
      return Object.keys(params).length > 0
        ? { pathname: '/manage/receipts', params }
        : '/manage/receipts';
    },
    vehiclePricing: (vehicleId: string): Href => ({
      pathname: '/manage/vehicles/[id]/pricing',
      params: { id: vehicleId },
    }),

    /**
     * Trung tâm hỗ trợ của cổng quản lý (SYS-05) — cùng địa chỉ với web (`/manage/support`).
     *
     * KHÔNG phải nơi mở yêu cầu hỗ trợ: kênh đó có mã theo dõi và sống ở `/manage/support/cases`
     * (web đã có, app chưa dựng). Ở đây chỉ có hướng dẫn nhanh, câu hỏi thường gặp và đường tới
     * văn bản pháp lý.
     */
    support: (): Href => '/manage/support',
    /** Yêu cầu hỗ trợ của GIAN HÀNG — tranh chấp, sự cố. Bề mặt khác hẳn khu khách. */
    supportCases: (): Href => '/manage/support/cases',
    supportCase: (id: string): Href => ({ pathname: '/manage/support/cases/[id]', params: { id } }),
  },

  /**
   * Văn bản pháp lý — CÔNG KHAI, không cần phiên.
   *
   * Cùng địa chỉ với web (`/legal/<slug>`) để một liên kết dán từ web mở thẳng được trong app.
   * Màn đích là WebView đọc chính trang đó: bản web là bản CÓ HIỆU LỰC và sửa được mà không chờ
   * một bản app mới qua vòng duyệt store (ADR 0028 điều 9 — xem `LegalDocScreen`).
   */
  legal: {
    doc: (doc: LegalDoc): Href => ({ pathname: '/legal/[doc]', params: { doc } }),
  },

  /** Gốc app — chỉ dùng cho fallback khi không có màn nào để lui về. */
  root: {
    index: (): Href => '/',
  },
} as const;

/**
 * Bộ lọc mang sang sổ Thu-Chi qua route params — CÙNG tên tham số với `?…` của web.
 *
 * `create` là ý định giao diện, không phải bộ lọc: nó không xuống API và không tính vào "đang
 * lọc". Kiểu `boolean` ở đây, hoá thành cờ `'1'` trên đường dẫn (đúng quy ước web).
 */
/**
 * Dữ liệu điền sẵn cho form tạo đơn tại quầy.
 *
 * Hai nguồn, hai tập trường: hồ sơ khách gửi tên + SĐT; một ô trên LỊCH gửi xe + khoảng thuê.
 * Gộp vào một kiểu vì đích đến là MỘT form — tách đôi sẽ có ngày ai đó dựng form thứ hai.
 */
export type BookingCreatePrefill = {
  customerName?: string;
  customerPhone?: string;
  vehicleId?: string;
  /**
   * Tên xe mang THEO, không để màn đích tự đi hỏi lại.
   *
   * Ô lịch đã có sẵn tên; bắt màn tạo đơn nạp lại qua `GET /vehicles/:id` là thêm một điểm hỏng
   * trên đường đi — endpoint đó đòi `vehicles.view`, một quyền mà `bookings.create` không bao
   * hàm. Thiếu nó thì bước THỜI GIAN hiện một thẻ xe rỗng và nút Tiếp tục im lặng.
   */
  vehicleName?: string;
  /** ISO-8601 UTC. */
  pickupAt?: string;
  /** ISO-8601 UTC. */
  returnAt?: string;
};

export type ReceiptRouteFilters = {
  type?: string;
  status?: string;
  categoryId?: string;
  source?: string;
  sourceGroup?: string;
  paymentMethod?: string;
  bookingId?: string;
  vehicleId?: string;
  tenantCustomerId?: string;
  q?: string;
  from?: string;
  to?: string;
  create?: boolean;
};

/**
 * Ngữ cảnh tìm kiếm đi qua route params. Expo Router chỉ chuyển được giá trị nguyên thuỷ, nên
 * `hourly` là cờ `'1'` chứ không phải boolean — màn `search` ép kiểu lại khi đọc.
 */
export type ExploreSearchParams = {
  vehicleType?: string;
  serviceType?: string;
  provinceCode?: string;
  routeType?: string;
  pickupAt?: string;
  returnAt?: string;
  hourly?: string;
};

/**
 * Danh sách xe TƯƠNG ỨNG với nơi người dùng đi vào wizard đăng xe nhanh — dùng cho nút quay lại
 * và đích sau khi lưu. Bản native của `vehicleListPathFor` bên web.
 *
 * Vào từ khu tài khoản thì lui về danh sách xe của khu tài khoản, vào từ cổng quản lý thì lui về
 * đội xe ở đó; vào từ chợ xe thì chưa chắc đã có danh sách nào để về, nên lui về trang giới thiệu.
 */
export function vehicleListPathFor(source: VehicleRegistrationSource): Href {
  switch (source) {
    case VEHICLE_REGISTRATION_SOURCE.MANAGE:
      return ROUTES.manage.vehicles();
    case VEHICLE_REGISTRATION_SOURCE.ACCOUNT:
      return ROUTES.account.vehicles();
    default:
      return ROUTES.listYourVehicle.root();
  }
}
