/**
 * Bó message của MỘT ngôn ngữ (vi).
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
import common from '@xeprime/domain/messages/vi/common.json';
import navigation from '@xeprime/domain/messages/vi/navigation.json';
import domain from '@xeprime/domain/messages/vi/domain.json';
import errors from '@xeprime/domain/messages/vi/errors.json';
import auth from '@xeprime/domain/messages/vi/auth.json';
import homeSearch from '@xeprime/domain/messages/vi/home-search.json';
import marketplace from '@xeprime/domain/messages/vi/marketplace.json';
import listings from '@xeprime/domain/messages/vi/listings.json';
import shops from '@xeprime/domain/messages/vi/shops.json';
import chat from '@xeprime/domain/messages/vi/chat.json';
import trips from '@xeprime/domain/messages/vi/trips.json';
import account from '@xeprime/domain/messages/vi/account.json';
import manageCommon from '@xeprime/domain/messages/vi/manage-common.json';
import dashboard from '@xeprime/domain/messages/vi/dashboard.json';
import shopOnboarding from '@xeprime/domain/messages/vi/shop-onboarding.json';
import shop from '@xeprime/domain/messages/vi/shop.json';
import bookingRequests from '@xeprime/domain/messages/vi/booking-requests.json';
import bookings from '@xeprime/domain/messages/vi/bookings.json';
import calendar from '@xeprime/domain/messages/vi/calendar.json';
import vehicles from '@xeprime/domain/messages/vi/vehicles.json';
import branches from '@xeprime/domain/messages/vi/branches.json';
import customers from '@xeprime/domain/messages/vi/customers.json';
import finance from '@xeprime/domain/messages/vi/finance.json';

const messages = {
  Common: common,
  Navigation: navigation,
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
  ManageCommon: manageCommon,
  Dashboard: dashboard,
  ShopOnboarding: shopOnboarding,
  Shop: shop,
  BookingRequests: bookingRequests,
  Bookings: bookings,
  Calendar: calendar,
  Vehicles: vehicles,
  Branches: branches,
  Customers: customers,
  Finance: finance,
};

export default messages;
