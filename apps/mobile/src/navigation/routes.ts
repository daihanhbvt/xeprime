import type { Href } from 'expo-router';

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

  /** Đơn thuê của khách. */
  booking: {
    list: (): Href => '/trips',
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
