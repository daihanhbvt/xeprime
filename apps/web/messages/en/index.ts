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
import manageCommon from '@xeprime/domain/messages/en/manage-common.json';
import dashboard from '@xeprime/domain/messages/en/dashboard.json';
import shopOnboarding from '@xeprime/domain/messages/en/shop-onboarding.json';
import shop from '@xeprime/domain/messages/en/shop.json';
import bookingRequests from '@xeprime/domain/messages/en/booking-requests.json';
import bookings from '@xeprime/domain/messages/en/bookings.json';
import vehicles from '@xeprime/domain/messages/en/vehicles.json';
import customers from '@xeprime/domain/messages/en/customers.json';
import finance from '@xeprime/domain/messages/en/finance.json';

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
  Vehicles: vehicles,
  Customers: customers,
  Finance: finance,
};

export default messages;
