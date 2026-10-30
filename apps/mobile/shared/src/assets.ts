import logo from '../assets/images/xeprime-logo.png';
import logoMark from '../assets/images/xeprime-mark.png';
// SINH TỰ ĐỘNG từ `apps/web/public/illustrations/*.svg` — xem `scripts/sync-brand-art.mjs`.
import shopOnboarding from '../assets/images/shop-onboarding.png';
import ownerPersonalCar from '../assets/images/owner-personal-car.png';
// Minh hoạ màn "Dành cho đối tác" — Figma `21943:42616` (cắt đúng khung 358×316).
import partnerHero from '../assets/images/partner/partner-hero.webp';
import ownerShopShowroom from '../assets/images/owner-shop-showroom.png';
// Minh hoạ "chưa có bằng lái" — xuất thẳng từ Figma (Empty State, node 20043:49464).
import driverLicenceEmpty from '../assets/images/driver-licence-empty.png';
// Ảnh CHỤP THẬT từ app XePrime Partner cho màn hướng dẫn đăng ký ở app khách. Chụp lại khi giao
// diện ba màn đó đổi: form tạo tài khoản đối tác, màn chọn cách cho thuê, wizard đăng xe.
import partnerGuideAccount from '../assets/images/partner-guide/step-account.png';
import partnerGuideChoose from '../assets/images/partner-guide/step-choose.png';
import partnerGuidePublish from '../assets/images/partner-guide/step-publish.png';
// Tranh minh hoạ trang chủ v2 — CHÉP NGUYÊN từ `apps/web/public/home/` (ADR 0062). Hai tấm là
// SPRITE: mỗi thẻ cắt một ô bằng khung `overflow: hidden`, cùng vị trí cắt với CSS bên web.
import homeHeroFallback from '../assets/images/home/hero-fallback.webp';
import homeDestCities from '../assets/images/home/dest-cities.webp';
import homeDestBg from '../assets/images/home/dest-bg.webp';
import homeStepsSprite from '../assets/images/home/steps-sprite.webp';
import homePartnerBackdrop from '../assets/images/home/partner-bg.webp';
// Huy hiệu thẻ trạng thái của các màn chuyến — CHÉP NGUYÊN apps/web/public/booking/request-sent.webp.
import bookingRequestSent from '../assets/images/booking/request-sent.webp';
import bookingRequestSentEnvelope from '../assets/images/booking/request-sent-envelope.webp';
// Ảnh thẻ trạng thái chuyến đã khép — CHÉP NGUYÊN apps/web/public/trips/status-{success,cancelled}.webp
// (Figma `21621:54650` dấu tích xanh · `21621:55005` dấu X đỏ).
import tripStatusSuccess from '../assets/images/trips/status-success.webp';
import tripStatusCancelled from '../assets/images/trips/status-cancelled.webp';
// Phong bì chặng chờ chủ xe phản hồi — CHÉP NGUYÊN apps/web/public/trips/request-sent.webp (Figma `21788:60649`).
import tripRequestSent from '../assets/images/trips/request-sent.webp';
// Trang gian hàng (web #222) — CHÉP NGUYÊN apps/web/public/shops/*.webp: vương miện + vân nền thẻ
// hồ sơ gian hàng, và ba minh hoạ ô cam kết của khối uy tín.
import shopCrown from '../assets/images/shops/crown.webp';
import shopCardTexture from '../assets/images/shops/card-texture.webp';
import shopTileLegal from '../assets/images/shops/tile-legal.webp';
import shopTileMaintenance from '../assets/images/shops/tile-maintenance.webp';
import shopTileWallet from '../assets/images/shops/tile-wallet.webp';

/**
 * Ảnh tĩnh gom một chỗ vì Metro nội suy đường dẫn lúc build — không dựng động được.
 *
 * KHÔNG nằm trong `theme/`: đây là tài nguyên, không phải design token.
 *
 * Hai file logo, hai vai trò khác nhau chứ không phải hai kích thước của một thứ — giống hệt
 * `apps/web/src/components/brand/Logo.tsx`, cùng artwork, cùng tên file:
 * - `xeprime-logo.png` — lockup ngang (biểu tượng + chữ "xe prime"), dùng ở chỗ có bề ngang.
 *   Nó ĐÃ chứa tên thương hiệu, nên đừng đặt thêm `APP_NAME` cạnh nó.
 * - `xeprime-mark.png` — biểu tượng vuông, dùng khi cạnh logo còn chữ khác (tên gian hàng ở
 *   `ManageDrawer`) hoặc khi nền không hợp với lockup.
 */
export const images = {
  logo,
  logoMark,
  shopOnboarding,
  ownerPersonalCar,
  partnerHero,
  ownerShopShowroom,
  driverLicenceEmpty,
  partnerGuideAccount,
  partnerGuideChoose,
  partnerGuidePublish,
  homeHeroFallback,
  homeDestCities,
  homeDestBg,
  homeStepsSprite,
  homePartnerBackdrop,
  bookingRequestSent,
  /** Phong bì "đã gửi yêu cầu" — web `/booking/request-sent-envelope.webp` (Figma `21836:55889`). */
  bookingRequestSentEnvelope,
  tripStatusSuccess,
  tripStatusCancelled,
  tripRequestSent,
  shopCrown,
  shopCardTexture,
  shopTileLegal,
  shopTileMaintenance,
  shopTileWallet,
} as const;

/**
 * Tỉ lệ của hai minh hoạ tuyến chủ xe — đọc từ `viewBox` của chính file SVG bên web, không đo
 * bằng mắt. Cần nó vì `expo-image` phải biết khung trước khi ảnh tải xong, nếu không thẻ nhảy
 * một nhịp lúc ảnh vào.
 */
/** Tỉ lệ ảnh `partnerHero` (358 × 316). */
export const PARTNER_HERO_RATIO = 358 / 316;
export const OWNER_PERSONAL_CAR_RATIO = 640 / 420;
export const OWNER_SHOP_SHOWROOM_RATIO = 720 / 420;

/** Tỉ lệ (rộng ÷ cao) của ba ảnh chụp hướng dẫn — cùng khung cắt 1080×2190, thu về 480 ngang. */
export const PARTNER_GUIDE_SHOT_RATIO = 480 / 973;

/** Tỉ lệ THẬT của file (rộng ÷ cao) — sai số ở đây là logo bị bóp méo. */
export const LOGO_RATIO = 1024 / 331;

/** Bề ngang của lockup ở một chiều cao cho trước. Dùng thay cho việc gõ tay hai con số. */
export const logoWidth = (height: number): number => Math.round(height * LOGO_RATIO);
