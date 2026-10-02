import enBookingRequests from '@xeprime/domain/messages/en/booking-requests.json';
import enBookings from '@xeprime/domain/messages/en/bookings.json';
import enChat from '@xeprime/domain/messages/en/chat.json';
import enTrips from '@xeprime/domain/messages/en/trips.json';
import enAddress from '@xeprime/domain/messages/en/address.json';
import enAccount from '@xeprime/domain/messages/en/account.json';
import enAccountPayments from '@xeprime/domain/messages/en/account-payments.json';
import enBankAccounts from '@xeprime/domain/messages/en/bank-accounts.json';
import enSupport from '@xeprime/domain/messages/en/support.json';
import enSupportCases from '@xeprime/domain/messages/en/support-cases.json';
import enSubscription from '@xeprime/domain/messages/en/subscription.json';
import enWallet from '@xeprime/domain/messages/en/wallet.json';
import enAuth from '@xeprime/domain/messages/en/auth.json';
import enCommon from '@xeprime/domain/messages/en/common.json';
import enDomain from '@xeprime/domain/messages/en/domain.json';
import enErrors from '@xeprime/domain/messages/en/errors.json';
import enNotifications from '@xeprime/domain/messages/en/notifications.json';
import enHomeSearch from '@xeprime/domain/messages/en/home-search.json';
import enListYourVehicle from '@xeprime/domain/messages/en/list-your-vehicle.json';
import enListings from '@xeprime/domain/messages/en/listings.json';
import enMarketplace from '@xeprime/domain/messages/en/marketplace.json';
import enPromoCodes from '@xeprime/domain/messages/en/promo-codes.json';
import enMobileShell from '@xeprime/domain/messages/en/mobile-shell.json';
import enNavigation from '@xeprime/domain/messages/en/navigation.json';
import enManageCommon from '@xeprime/domain/messages/en/manage-common.json';
import enVehicleManage from '@xeprime/domain/messages/en/vehicle-manage.json';
import enVehicles from '@xeprime/domain/messages/en/vehicles.json';
import enBranches from '@xeprime/domain/messages/en/branches.json';
import enCalendar from '@xeprime/domain/messages/en/calendar.json';
import enCustomers from '@xeprime/domain/messages/en/customers.json';
import enFinance from '@xeprime/domain/messages/en/finance.json';
import enMaintenance from '@xeprime/domain/messages/en/maintenance.json';
import enDashboard from '@xeprime/domain/messages/en/dashboard.json';
import enDrivers from '@xeprime/domain/messages/en/drivers.json';
import enLegal from '@xeprime/domain/messages/en/legal.json';
import enMembers from '@xeprime/domain/messages/en/members.json';
import enShop from '@xeprime/domain/messages/en/shop.json';
import enSellerProfile from '@xeprime/domain/messages/en/seller-profile.json';
import enShopOnboarding from '@xeprime/domain/messages/en/shop-onboarding.json';
import enShops from '@xeprime/domain/messages/en/shops.json';
import viBookingRequests from '@xeprime/domain/messages/vi/booking-requests.json';
import viBookings from '@xeprime/domain/messages/vi/bookings.json';
import viChat from '@xeprime/domain/messages/vi/chat.json';
import viTrips from '@xeprime/domain/messages/vi/trips.json';
import viAddress from '@xeprime/domain/messages/vi/address.json';
import viAccount from '@xeprime/domain/messages/vi/account.json';
import viAccountPayments from '@xeprime/domain/messages/vi/account-payments.json';
import viBankAccounts from '@xeprime/domain/messages/vi/bank-accounts.json';
import viSupport from '@xeprime/domain/messages/vi/support.json';
import viSupportCases from '@xeprime/domain/messages/vi/support-cases.json';
import viSubscription from '@xeprime/domain/messages/vi/subscription.json';
import viWallet from '@xeprime/domain/messages/vi/wallet.json';
import viAuth from '@xeprime/domain/messages/vi/auth.json';
import viCommon from '@xeprime/domain/messages/vi/common.json';
import viDomain from '@xeprime/domain/messages/vi/domain.json';
import viErrors from '@xeprime/domain/messages/vi/errors.json';
import viNotifications from '@xeprime/domain/messages/vi/notifications.json';
import viHomeSearch from '@xeprime/domain/messages/vi/home-search.json';
import viListYourVehicle from '@xeprime/domain/messages/vi/list-your-vehicle.json';
import viListings from '@xeprime/domain/messages/vi/listings.json';
import viMarketplace from '@xeprime/domain/messages/vi/marketplace.json';
import viPromoCodes from '@xeprime/domain/messages/vi/promo-codes.json';
import viMobileShell from '@xeprime/domain/messages/vi/mobile-shell.json';
import viNavigation from '@xeprime/domain/messages/vi/navigation.json';
import viManageCommon from '@xeprime/domain/messages/vi/manage-common.json';
import viVehicleManage from '@xeprime/domain/messages/vi/vehicle-manage.json';
import viVehicles from '@xeprime/domain/messages/vi/vehicles.json';
import viBranches from '@xeprime/domain/messages/vi/branches.json';
import viCalendar from '@xeprime/domain/messages/vi/calendar.json';
import viCustomers from '@xeprime/domain/messages/vi/customers.json';
import viFinance from '@xeprime/domain/messages/vi/finance.json';
import viMaintenance from '@xeprime/domain/messages/vi/maintenance.json';
import viDashboard from '@xeprime/domain/messages/vi/dashboard.json';
import viDrivers from '@xeprime/domain/messages/vi/drivers.json';
import viLegal from '@xeprime/domain/messages/vi/legal.json';
import viMembers from '@xeprime/domain/messages/vi/members.json';
import viShop from '@xeprime/domain/messages/vi/shop.json';
import viSellerProfile from '@xeprime/domain/messages/vi/seller-profile.json';
import viShopOnboarding from '@xeprime/domain/messages/vi/shop-onboarding.json';
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
    Notifications: viNotifications,
    Navigation: viNavigation,
    Account: viAccount,
    AccountPayments: viAccountPayments,
    BankAccounts: viBankAccounts,
    Support: viSupport,
    SupportCases: viSupportCases,
    Subscription: viSubscription,
    Wallet: viWallet,
    Address: viAddress,
    Trips: viTrips,
    BookingRequests: viBookingRequests,
    Bookings: viBookings,
    Chat: viChat,
    HomeSearch: viHomeSearch,
    Marketplace: viMarketplace,
    PromoCodes: viPromoCodes,
    Listings: viListings,
    ListYourVehicle: viListYourVehicle,
    ManageCommon: viManageCommon,
    Vehicles: viVehicles,
    VehicleManage: viVehicleManage,
    Branches: viBranches,
    Calendar: viCalendar,
    Customers: viCustomers,
    Finance: viFinance,
    Maintenance: viMaintenance,
    Dashboard: viDashboard,
    Drivers: viDrivers,
    Legal: viLegal,
    Members: viMembers,
    Shop: viShop,
    SellerProfile: viSellerProfile,
    ShopOnboarding: viShopOnboarding,
    Shops: viShops,
    MobileShell: viMobileShell,
  },
  en: {
    Common: enCommon,
    Domain: enDomain,
    Auth: enAuth,
    Errors: enErrors,
    Notifications: enNotifications,
    Navigation: enNavigation,
    Account: enAccount,
    AccountPayments: enAccountPayments,
    BankAccounts: enBankAccounts,
    Support: enSupport,
    SupportCases: enSupportCases,
    Subscription: enSubscription,
    Wallet: enWallet,
    Address: enAddress,
    Trips: enTrips,
    BookingRequests: enBookingRequests,
    Bookings: enBookings,
    Chat: enChat,
    HomeSearch: enHomeSearch,
    Marketplace: enMarketplace,
    PromoCodes: enPromoCodes,
    Listings: enListings,
    ListYourVehicle: enListYourVehicle,
    ManageCommon: enManageCommon,
    Vehicles: enVehicles,
    VehicleManage: enVehicleManage,
    Branches: enBranches,
    Calendar: enCalendar,
    Customers: enCustomers,
    Finance: enFinance,
    Maintenance: enMaintenance,
    Dashboard: enDashboard,
    Drivers: enDrivers,
    Legal: enLegal,
    Members: enMembers,
    Shop: enShop,
    SellerProfile: enSellerProfile,
    ShopOnboarding: enShopOnboarding,
    Shops: enShops,
    MobileShell: enMobileShell,
  },
} as const satisfies Record<AppLocale, unknown>;

/** Tiếng Việt là ngôn ngữ CHUẨN về cấu trúc khoá — tiếng Anh phải khớp đúng hình dạng này. */
export type AppMessages = (typeof MESSAGES)['vi'];
