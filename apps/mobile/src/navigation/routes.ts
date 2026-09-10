import type { Href } from 'expo-router';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from './vehicle-edit-tab';

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
    /** Wizard gửi yêu cầu thuê một chiếc xe (BKG-01) — CÔNG KHAI, khách vãng lai vào được. */
    request: (vehicleId: string, serviceType?: string): Href =>
      serviceType
        ? { pathname: '/listings/[id]/request', params: { id: vehicleId, serviceType } }
        : { pathname: '/listings/[id]/request', params: { id: vehicleId } },
  },

  /** Trò chuyện với gian hàng. */
  chat: {
    list: (): Href => '/chat',
    /** Một cuộc trò chuyện. Nhận id nên deep link và thông báo đẩy mở thẳng được. */
    thread: (conversationId: string): Href => ({
      pathname: '/chat/[id]',
      params: { id: conversationId },
    }),
  },

  /** Tài khoản, đăng nhập, hồ sơ. */
  account: {
    home: (): Href => '/account',
    login: (): Href => '/login',
    register: (): Href => '/register',
    setPassword: (): Href => '/set-password',
    forgotPassword: (): Href => '/forgot-password',
    resetPassword: (token?: string): Href =>
      token ? { pathname: '/reset-password', params: { token } } : '/reset-password',
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
     * `?customerName=&customerPhone=` mà web đặt lên URL khi bấm "Tạo đơn thuê" ở hồ sơ khách.
     *
     * Điền sẵn chứ KHÔNG dựng form thứ hai: một form tạo đơn nữa là hai bộ luật giá/lịch sẽ trôi
     * khỏi nhau.
     */
    bookingCreate: (prefill?: { customerName?: string; customerPhone?: string }): Href =>
      prefill?.customerName || prefill?.customerPhone
        ? {
            pathname: '/manage/bookings/new',
            params: {
              ...(prefill.customerName ? { customerName: prefill.customerName } : {}),
              ...(prefill.customerPhone ? { customerPhone: prefill.customerPhone } : {}),
            },
          }
        : '/manage/bookings/new',
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

    /** Chi nhánh gian hàng (SHP-03) — nơi xe thực sự nằm. */
    shopBranches: (): Href => '/manage/shop/branches',

    /** Chính sách thuê mặc định theo loại xe (SHP-04). */
    shopPolicies: (): Href => '/manage/shop/policies',

    /** Nhân sự gian hàng + lời mời (SHP-05). */
    members: (): Href => '/manage/members',

    /** Tài xế của gian hàng (SHP-06). */
    drivers: (): Href => '/manage/drivers',

    /** Tổng quan doanh thu (FIN-01) — ba lớp tiền của một kỳ + hai bảng xếp hạng. */
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
