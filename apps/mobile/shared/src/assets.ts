import logo from '../assets/images/xeprime-logo.png';
import logoMark from '../assets/images/xeprime-mark.png';
// SINH TỰ ĐỘNG từ `apps/web/public/illustrations/*.svg` — xem `scripts/sync-brand-art.mjs`.
import shopOnboarding from '../assets/images/shop-onboarding.png';
import ownerPersonalCar from '../assets/images/owner-personal-car.png';
// Minh hoạ màn "Dành cho đối tác" — Figma `21943:42616` (cắt đúng khung 358×316).
import partnerHero from '../assets/images/partner/partner-hero.webp';
// Dải ảnh đầu màn đăng nhập app Partner - Figma Partner-XePrime "Login" `24464:24577` (nền đường
// hầm 390×179 đã cắt), logo "xe prime PARTNER" `24464:24578`, linh vật + xe `24464:24583`.
import partnerLoginBanner from '../assets/images/partner/login-banner.webp';
import partnerLoginLogo from '../assets/images/partner/login-logo.webp';
import partnerLoginMascot from '../assets/images/partner/login-mascot.webp';
// Thẻ chọn tuyến app Partner - Figma "Signup - Plan" `24464:25566`: minh hoạ hai tuyến, nền thẻ
// gian hàng (mờ 30%) và ruy băng "Đề xuất" (chữ vẽ đè bằng `Text` để còn dịch được).
import partnerTrackPersonal from '../assets/images/partner/track-personal.webp';
import partnerTrackShop from '../assets/images/partner/track-shop.webp';
import partnerTrackShopBg from '../assets/images/partner/track-shop-bg.webp';
import partnerTrackRibbon from '../assets/images/partner/track-ribbon.webp';
// Dấu tích 3D màn "Đã gửi duyệt xe thành công" - Figma Thêm xe MB `24486:113267` (100px, xuất 300px).
import vehicleSubmitSuccess from '../assets/images/partner/vehicle-submit-success.webp';
import ownerShopShowroom from '../assets/images/owner-shop-showroom.png';
// Minh hoạ "chưa có bằng lái" — xuất thẳng từ Figma (Empty State, node 20043:49464).
import driverLicenceEmpty from '../assets/images/driver-licence-empty.png';
// Minh hoạ ba bước quên mật khẩu của app Partner - Figma Partner-XePrime `24382:85620` · `85789` ·
// `85898` (cùng tệp web `public/auth/*.webp`).
import forgotLock from '../assets/images/forgot-lock.webp';
import otpLock from '../assets/images/otp-lock.webp';
import resetShield from '../assets/images/reset-shield.webp';
// Hộp rỗng 160px — Figma "List - Scroll - Empty" (20063:60274), sinh từ apps/web/public/illustrations/list-empty.svg.
import listEmpty from '../assets/images/list-empty.png';
// Logo Zalo của nút liên hệ khách — CHÉP NGUYÊN apps/web/public/icons/brand/zalo.png (`CustomerContactButtons`).
import zaloLogo from '../assets/images/brand/zalo.png';
// Ảnh CHỤP THẬT từ app XePrime Partner cho màn hướng dẫn đăng ký ở app khách. Chụp lại khi giao
// diện ba màn đó đổi: form tạo tài khoản đối tác, màn chọn cách cho thuê, wizard đăng xe.
// Tranh minh hoạ trang chủ v2 — CHÉP NGUYÊN từ `apps/web/public/home/` (ADR 0062). Hai tấm là
// SPRITE: mỗi thẻ cắt một ô bằng khung `overflow: hidden`, cùng vị trí cắt với CSS bên web.
import homeHeroFallback from '../assets/images/home/hero-fallback.webp';
import homeDestCities from '../assets/images/home/dest-cities.webp';
import homeDestBg from '../assets/images/home/dest-bg.webp';
// Nền loang vàng thẻ "Rút được ngay" - cùng tệp web `public/illustrations/wallet/balance-glow.webp`.
import walletBalanceGlow from '../assets/images/wallet-balance-glow.webp';
import homeStepsSprite from '../assets/images/home/steps-sprite.webp';
// Vùng cắt riêng của bản vẽ MB (`19771:51743`) — web dùng cùng ảnh ở ≤640px.
import homePartnerBackdrop from '../assets/images/home/partner-bg-mobile.webp';
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
// Nền thẻ "Doanh nghiệp" của Gói & hạn mức (Figma Partner `24231:113941`) — CHÉP NGUYÊN apps/web/public/shops/plans/enterprise-bg.png.
import shopEnterpriseBg from '../assets/images/shops/enterprise-bg.png';

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
  zaloLogo,
  logoMark,
  shopOnboarding,
  ownerPersonalCar,
  partnerHero,
  vehicleSubmitSuccess,
  partnerLoginBanner,
  partnerLoginLogo,
  partnerLoginMascot,
  partnerTrackPersonal,
  partnerTrackShop,
  partnerTrackShopBg,
  partnerTrackRibbon,
  ownerShopShowroom,
  driverLicenceEmpty,
  forgotLock,
  otpLock,
  resetShield,
  listEmpty,
  homeHeroFallback,
  homeDestCities,
  homeDestBg,
  walletBalanceGlow,
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
  shopEnterpriseBg,
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

/**
 * Khung dải ảnh đầu màn đăng nhập app Partner (Figma `24464:24574`, khung 390): nền 390×179, logo
 * 145×65 đặt ở (27, 22), linh vật 239×191 mép phải chạm (160 + 239), đáy lấn 16 vào tấm trắng.
 */
export const PARTNER_LOGIN_ART = {
  frameWidth: 390,
  bannerHeight: 179,
  logo: { left: 27, top: 22, width: 145.3, height: 65 },
  mascot: { left: 160, width: 239, height: 191, overlap: 16 },
} as const;

/** Tỉ lệ (rộng ÷ cao) của hai minh hoạ thẻ chọn tuyến và ruy băng — đọc từ chính tệp đã cắt. */
export const PARTNER_TRACK_PERSONAL_RATIO = 339 / 279;
export const PARTNER_TRACK_SHOP_RATIO = 218 / 177;
export const PARTNER_TRACK_RIBBON_RATIO = 117 / 38;
export const OWNER_PERSONAL_CAR_RATIO = 640 / 420;
export const OWNER_SHOP_SHOWROOM_RATIO = 720 / 420;

/** Tỉ lệ (rộng ÷ cao) của ba ảnh chụp hướng dẫn — cùng khung cắt 1080×2190, thu về 480 ngang. */
export const PARTNER_GUIDE_SHOT_RATIO = 480 / 973;

/** Tỉ lệ THẬT của file (rộng ÷ cao) — sai số ở đây là logo bị bóp méo. */
export const LOGO_RATIO = 1024 / 331;

/** Bề ngang của lockup ở một chiều cao cho trước. Dùng thay cho việc gõ tay hai con số. */
export const logoWidth = (height: number): number => Math.round(height * LOGO_RATIO);
