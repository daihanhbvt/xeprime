/**
 * Bó message của MỘT ngôn ngữ (en).
 *
 * Import tĩnh, tường minh từng namespace: bundler nhờ vậy tách được đúng hai chunk và
 * `i18n/messages.ts` chỉ chạm vào chunk của ngôn ngữ đang dùng — không bao giờ nạp cả hai.
 *
 * Danh sách namespace phải khớp `src/i18n/namespaces.ts`; `pnpm i18n:check` fail nếu lệch.
 * File này SINH RA THỦ CÔNG nhưng có test giữ — đừng sửa lệch một bên.
 */
import common from './common.json';
import navigation from './navigation.json';
import domain from './domain.json';
import errors from './errors.json';
import auth from './auth.json';
import homeSearch from './home-search.json';
import marketplace from './marketplace.json';
import listings from './listings.json';
import shops from './shops.json';
import chat from './chat.json';
import trips from './trips.json';
import account from './account.json';
import manageCommon from './manage-common.json';
import shopOnboarding from './shop-onboarding.json';
import bookingRequests from './booking-requests.json';
import bookings from './bookings.json';
import vehicles from './vehicles.json';
import customers from './customers.json';
import finance from './finance.json';

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
  ShopOnboarding: shopOnboarding,
  BookingRequests: bookingRequests,
  Bookings: bookings,
  Vehicles: vehicles,
  Customers: customers,
  Finance: finance,
};

export default messages;
