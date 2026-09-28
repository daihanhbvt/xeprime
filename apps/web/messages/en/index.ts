/**
 * Bó message của MỘT ngôn ngữ (en).
 *
 * Import tĩnh, tường minh từng namespace: bundler nhờ vậy tách được đúng hai chunk và
 * `i18n/messages.ts` chỉ chạm vào chunk của ngôn ngữ đang dùng — không bao giờ nạp cả hai.
 *
 * Danh sách namespace phải khớp `src/i18n/namespaces.ts`; `pnpm i18n:check` fail nếu lệch.
 * File này SINH RA THỦ CÔNG nhưng có test giữ — đừng sửa lệch một bên.
 *
 * TOÀN BỘ 21 namespace đến từ `@xeprime/domain/messages` — quyết định 24/08/2026: bó message
 * dùng chung cho web và app native, một bản dịch duy nhất cho mỗi khoá. File này chỉ còn là
 * BẢNG GOM của web (import tĩnh để bundler tách đúng chunk theo ngôn ngữ); mobile sẽ có bảng
 * gom riêng của nó trỏ vào cùng các file JSON đó.
 */
import common from '@xeprime/domain/messages/en/common.json';
import navigation from '@xeprime/domain/messages/en/navigation.json';
import notifications from '@xeprime/domain/messages/en/notifications.json';
import address from '@xeprime/domain/messages/en/address.json';
import domain from '@xeprime/domain/messages/en/domain.json';
import errors from '@xeprime/domain/messages/en/errors.json';
import auth from '@xeprime/domain/messages/en/auth.json';
import homeSearch from '@xeprime/domain/messages/en/home-search.json';
import marketplace from '@xeprime/domain/messages/en/marketplace.json';
import listings from '@xeprime/domain/messages/en/listings.json';
import shops from '@xeprime/domain/messages/en/shops.json';
import chat from '@xeprime/domain/messages/en/chat.json';
import trips from '@xeprime/domain/messages/en/trips.json';
import account from '@xeprime/domain/messages/en/account.json';
import legal from '@xeprime/domain/messages/en/legal.json';
import support from '@xeprime/domain/messages/en/support.json';
import about from '@xeprime/domain/messages/en/about.json';
import appPromo from '@xeprime/domain/messages/en/app-promo.json';
import listYourVehicle from '@xeprime/domain/messages/en/list-your-vehicle.json';
import manageCommon from '@xeprime/domain/messages/en/manage-common.json';
import dashboard from '@xeprime/domain/messages/en/dashboard.json';
import shopOnboarding from '@xeprime/domain/messages/en/shop-onboarding.json';
import shop from '@xeprime/domain/messages/en/shop.json';
import bookingRequests from '@xeprime/domain/messages/en/booking-requests.json';
import bookings from '@xeprime/domain/messages/en/bookings.json';
import calendar from '@xeprime/domain/messages/en/calendar.json';
import vehicles from '@xeprime/domain/messages/en/vehicles.json';
import vehicleManage from '@xeprime/domain/messages/en/vehicle-manage.json';
import branches from '@xeprime/domain/messages/en/branches.json';
import customers from '@xeprime/domain/messages/en/customers.json';
import finance from '@xeprime/domain/messages/en/finance.json';
import adminCatalog from '@xeprime/domain/messages/en/admin-catalog.json';
import adminVehicles from '@xeprime/domain/messages/en/admin-vehicles.json';
import adminBookings from '@xeprime/domain/messages/en/admin-bookings.json';
import adminTenants from '@xeprime/domain/messages/en/admin-tenants.json';
import tenantSupport from '@xeprime/domain/messages/en/tenant-support.json';
import adminPlans from '@xeprime/domain/messages/en/admin-plans.json';
import approvals from '@xeprime/domain/messages/en/approvals.json';
import platformDashboard from '@xeprime/domain/messages/en/platform-dashboard.json';
import bankTransactions from '@xeprime/domain/messages/en/bank-transactions.json';
import subscription from '@xeprime/domain/messages/en/subscription.json';
import members from '@xeprime/domain/messages/en/members.json';
import drivers from '@xeprime/domain/messages/en/drivers.json';
import maintenance from '@xeprime/domain/messages/en/maintenance.json';
import bankAccounts from '@xeprime/domain/messages/en/bank-accounts.json';
import accountPayments from '@xeprime/domain/messages/en/account-payments.json';
import wallet from '@xeprime/domain/messages/en/wallet.json';
import sellerProfile from '@xeprime/domain/messages/en/seller-profile.json';
import supportCases from '@xeprime/domain/messages/en/support-cases.json';
import feePolicies from '@xeprime/domain/messages/en/fee-policies.json';
import promoCodes from '@xeprime/domain/messages/en/promo-codes.json';
import platformMoney from '@xeprime/domain/messages/en/platform-money.json';
import platformSellers from '@xeprime/domain/messages/en/platform-sellers.json';

const messages = {
  Common: common,
  Navigation: navigation,
  Notifications: notifications,
  Address: address,
  Domain: domain,
  Errors: errors,
  Auth: auth,
  HomeSearch: homeSearch,
  Marketplace: marketplace,
  Listings: listings,
  Shops: shops,
  Chat: chat,
  Trips: trips,
  Account: account,
  Legal: legal,
  Support: support,
  About: about,
  AppPromo: appPromo,
  ListYourVehicle: listYourVehicle,
  ManageCommon: manageCommon,
  Dashboard: dashboard,
  ShopOnboarding: shopOnboarding,
  Shop: shop,
  BookingRequests: bookingRequests,
  Bookings: bookings,
  Calendar: calendar,
  Vehicles: vehicles,
  VehicleManage: vehicleManage,
  Branches: branches,
  Customers: customers,
  Finance: finance,
  AdminCatalog: adminCatalog,
  AdminVehicles: adminVehicles,
  AdminBookings: adminBookings,
  AdminTenants: adminTenants,
  TenantSupport: tenantSupport,
  AdminPlans: adminPlans,
  Approvals: approvals,
  PlatformDashboard: platformDashboard,
  BankTransactions: bankTransactions,
  Subscription: subscription,
  Members: members,
  Drivers: drivers,
  Maintenance: maintenance,
  BankAccounts: bankAccounts,
  AccountPayments: accountPayments,
  Wallet: wallet,
  SellerProfile: sellerProfile,
  SupportCases: supportCases,
  FeePolicies: feePolicies,
  PromoCodes: promoCodes,
  PlatformMoney: platformMoney,
  PlatformSellers: platformSellers,
};

export default messages;
