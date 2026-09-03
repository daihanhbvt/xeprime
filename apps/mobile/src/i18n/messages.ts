import enBookingRequests from '@xeprime/domain/messages/en/booking-requests.json';
import enBookings from '@xeprime/domain/messages/en/bookings.json';
import enChat from '@xeprime/domain/messages/en/chat.json';
import enTrips from '@xeprime/domain/messages/en/trips.json';
import enAccount from '@xeprime/domain/messages/en/account.json';
import enAuth from '@xeprime/domain/messages/en/auth.json';
import enCommon from '@xeprime/domain/messages/en/common.json';
import enDomain from '@xeprime/domain/messages/en/domain.json';
import enErrors from '@xeprime/domain/messages/en/errors.json';
import enHomeSearch from '@xeprime/domain/messages/en/home-search.json';
import enListings from '@xeprime/domain/messages/en/listings.json';
import enMarketplace from '@xeprime/domain/messages/en/marketplace.json';
import enMobileShell from '@xeprime/domain/messages/en/mobile-shell.json';
import enNavigation from '@xeprime/domain/messages/en/navigation.json';
import enManageCommon from '@xeprime/domain/messages/en/manage-common.json';
import enShops from '@xeprime/domain/messages/en/shops.json';
import viBookingRequests from '@xeprime/domain/messages/vi/booking-requests.json';
import viBookings from '@xeprime/domain/messages/vi/bookings.json';
import viChat from '@xeprime/domain/messages/vi/chat.json';
import viTrips from '@xeprime/domain/messages/vi/trips.json';
import viAccount from '@xeprime/domain/messages/vi/account.json';
import viAuth from '@xeprime/domain/messages/vi/auth.json';
import viCommon from '@xeprime/domain/messages/vi/common.json';
import viDomain from '@xeprime/domain/messages/vi/domain.json';
import viErrors from '@xeprime/domain/messages/vi/errors.json';
import viHomeSearch from '@xeprime/domain/messages/vi/home-search.json';
import viListings from '@xeprime/domain/messages/vi/listings.json';
import viMarketplace from '@xeprime/domain/messages/vi/marketplace.json';
import viMobileShell from '@xeprime/domain/messages/vi/mobile-shell.json';
import viNavigation from '@xeprime/domain/messages/vi/navigation.json';
import viManageCommon from '@xeprime/domain/messages/vi/manage-common.json';
import viShops from '@xeprime/domain/messages/vi/shops.json';
import { type AppLocale } from './config';

/**
 * Bảng gom message của app native.
 *
 * **Gốc là `@xeprime/domain/messages`, dùng CHUNG với `apps/web`** (quyết định 24/08/2026):
 * một khoá chỉ có một bản dịch, nên hai client không bao giờ nói khác nhau về cùng một thứ.
 * File này KHÔNG chứa chữ — nó chỉ chọn namespace nào được nạp vào bundle.
 *
 * Danh sách là TẬP CON có chủ đích: Metro không tách chunk theo màn hình, nên mọi namespace
 * kể ra đây nằm trong app kể cả khi chưa màn nào dùng. Thêm namespace ĐÚNG LÚC mở tính năng
 * tương ứng — mở màn booking thì thêm `bookings`/`booking-requests` của gốc chung, KHÔNG viết
 * lại chuỗi vào `mobile-shell` (namespace chia theo tính năng, không theo client).
 *
 * `pnpm --filter @xeprime/web i18n:check` canh file này: gom namespace không có ở gốc, hay hai
 * ngôn ngữ gom lệch nhau, là fail ở cổng chứ không phải lúc bundle chạy.
 *
 * Cả hai ngôn ngữ nạp tĩnh: người dùng đổi ngôn ngữ ngay trong app nên bó kia phải có sẵn.
 */
export const MESSAGES = {
  vi: {
    Common: viCommon,
    Domain: viDomain,
    Auth: viAuth,
    Errors: viErrors,
    Navigation: viNavigation,
    Account: viAccount,
    Trips: viTrips,
    BookingRequests: viBookingRequests,
    Bookings: viBookings,
    Chat: viChat,
    HomeSearch: viHomeSearch,
    Marketplace: viMarketplace,
    Listings: viListings,
    ManageCommon: viManageCommon,
    Shops: viShops,
    MobileShell: viMobileShell,
  },
  en: {
    Common: enCommon,
    Domain: enDomain,
    Auth: enAuth,
    Errors: enErrors,
    Navigation: enNavigation,
    Account: enAccount,
    Trips: enTrips,
    BookingRequests: enBookingRequests,
    Bookings: enBookings,
    Chat: enChat,
    HomeSearch: enHomeSearch,
    Marketplace: enMarketplace,
    Listings: enListings,
    ManageCommon: enManageCommon,
    Shops: enShops,
    MobileShell: enMobileShell,
  },
} as const satisfies Record<AppLocale, unknown>;

/** Tiếng Việt là ngôn ngữ CHUẨN về cấu trúc khoá — tiếng Anh phải khớp đúng hình dạng này. */
export type AppMessages = (typeof MESSAGES)['vi'];
