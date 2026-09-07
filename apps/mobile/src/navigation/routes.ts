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
    bookingCreate: (): Href => '/manage/bookings/new',
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
