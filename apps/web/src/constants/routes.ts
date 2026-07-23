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
  MANAGE: {
    ROOT: '/manage',
    CALENDAR: '/manage/calendar',
    VEHICLES: '/manage/vehicles',
    BOOKINGS: '/manage/bookings',
    ADMIN: '/manage/admin',
  },
} as const;

export type ManageRoute = (typeof ROUTES.MANAGE)[keyof typeof ROUTES.MANAGE];
