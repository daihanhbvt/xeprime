/**
 * Mọi đường dẫn của web nằm ở đây.
 *
 * CLAUDE.md mục 5 cấm rải string literal nghiệp vụ trong component; route cũng vậy — đổi
 * cấu trúc URL mà phải grep chuỗi `/manage/...` khắp source là cách sinh link chết.
 */
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  /** Khu khách hàng: các chuyến thuê + đánh giá sau chuyến (cần đăng nhập, ngoài khu /manage). */
  TRIPS: '/trips',
  /** Khu tin nhắn của khách (chat với shop). Shop dùng /manage/chat. */
  CHAT: '/chat',
  MANAGE: {
    ROOT: '/manage',

    // Quản lý gian hàng
    CALENDAR: '/manage/calendar',
    VEHICLES: '/manage/vehicles',
    VEHICLE_NEW: '/manage/vehicles/new',
    BOOKINGS: '/manage/bookings',
    BOOKING_REQUESTS: '/manage/booking-requests',
    CUSTOMERS: '/manage/customers',
    FINANCE: '/manage/finance',
    RECEIPTS: '/manage/receipts',
    DEBTS: '/manage/debts',

    // Cài đặt gian hàng
    SHOP: '/manage/shop',
    MEMBERS: '/manage/members',
    PICKUP_AREAS: '/manage/pickup-areas',
    DRIVERS: '/manage/drivers',
    CHAT: '/manage/chat',
    TRASH: '/manage/trash',

    // Quản trị nền tảng
    ADMIN: '/manage/admin',
    ADMIN_TENANTS: '/manage/admin/tenants',
    ADMIN_AUDIT: '/manage/admin/audit',
    ADMIN_STAFF: '/manage/admin/staff',
  },
} as const;

export type ManageRoute = (typeof ROUTES.MANAGE)[keyof typeof ROUTES.MANAGE];

/** Đường dẫn động của xe — hàm để không rải template `/manage/vehicles/${id}` khắp component. */
export const vehiclePath = {
  detail: (id: string): string => `/manage/vehicles/${id}`,
  edit: (id: string): string => `/manage/vehicles/${id}/edit`,
};

/** Đường dẫn xe công khai trên Marketplace. */
export const listingPath = {
  detail: (id: string): string => `/listings/${id}`,
};
