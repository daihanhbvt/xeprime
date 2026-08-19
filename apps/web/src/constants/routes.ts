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
  /** Hồ sơ tài khoản của KHÁCH — khác hoàn toàn hồ sơ gian hàng (`/manage/shop`). */
  ACCOUNT: '/account',
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
    RECEIPTS: '/manage/receipts',
    DEBTS: '/manage/debts',

    // Cài đặt gian hàng
    SHOP: '/manage/shop',
    /** Chi nhánh gian hàng — nơi xe thực sự nằm, và là vị trí công khai của xe. */
    SHOP_BRANCHES: '/manage/shop/branches',
    /** Chính sách thuê mặc định của gian hàng (Wave 2 — cọc/giao nhận/quá giờ/ưu đãi). */
    SHOP_POLICIES: '/manage/shop/policies',
    MEMBERS: '/manage/members',
    PICKUP_AREAS: '/manage/pickup-areas',
    DRIVERS: '/manage/drivers',
    CHAT: '/manage/chat',
    TRASH: '/manage/trash',

    // Quản trị nền tảng
    ADMIN: '/manage/admin',
    ADMIN_TENANTS: '/manage/admin/tenants',
    ADMIN_VEHICLES: '/manage/admin/vehicles',
    ADMIN_BOOKINGS: '/manage/admin/bookings',
    ADMIN_CUSTOMERS: '/manage/admin/customers',
    ADMIN_AUDIT: '/manage/admin/audit',
    ADMIN_STAFF: '/manage/admin/staff',
    ADMIN_PLANS: '/manage/admin/plans',
    ADMIN_CATALOG: '/manage/admin/catalog',
    /** Danh mục hành chính (tỉnh/thành) — dữ liệu dùng chung cho mọi gian hàng. */
    ADMIN_LOCATIONS: '/manage/admin/locations',
    ADMIN_BANNERS: '/manage/admin/marketplace-banners',
  },
} as const;

export type ManageRoute = (typeof ROUTES.MANAGE)[keyof typeof ROUTES.MANAGE];

/** Đường dẫn động của xe — hàm để không rải template `/manage/vehicles/${id}` khắp component. */
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
 * Sổ Thu-Chi đã LỌC SẴN — đường đi từ một đơn / một xe / một khách sang phần tiền của nó.
 *
 * Ba tham số này không có ô nào trên thanh lọc: chúng chỉ đến từ đây. Dựng chuỗi ở một chỗ để
 * ba màn nguồn không tự ghép query khác nhau rồi lệch tên tham số với backend.
 */
export const receiptsPath = {
  filtered: (params: {
    bookingId?: string;
    vehicleId?: string;
    tenantCustomerId?: string;
  }): string => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => Boolean(value)) as [string, string][],
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
  detail: (id: string): string => `/trips/${id}`,
};

/** Đường dẫn xe công khai trên Marketplace. */
export const listingPath = {
  detail: (id: string): string => `/listings/${id}`,
};

/** Đường dẫn trang gian hàng công khai `/shops/[slug]`. */
export const shopPath = {
  detail: (slug: string): string => `/shops/${slug}`,
};
