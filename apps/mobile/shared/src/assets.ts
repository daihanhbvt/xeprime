import logo from '../assets/images/xeprime-logo.png';
import logoMark from '../assets/images/xeprime-mark.png';
// SINH TỰ ĐỘNG từ `apps/web/public/illustrations/*.svg` — xem `scripts/sync-brand-art.mjs`.
import shopOnboarding from '../assets/images/shop-onboarding.png';
import ownerPersonalCar from '../assets/images/owner-personal-car.png';
import ownerShopShowroom from '../assets/images/owner-shop-showroom.png';

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
  ownerShopShowroom,
} as const;

/**
 * Tỉ lệ của hai minh hoạ tuyến chủ xe — đọc từ `viewBox` của chính file SVG bên web, không đo
 * bằng mắt. Cần nó vì `expo-image` phải biết khung trước khi ảnh tải xong, nếu không thẻ nhảy
 * một nhịp lúc ảnh vào.
 */
export const OWNER_PERSONAL_CAR_RATIO = 640 / 420;
export const OWNER_SHOP_SHOWROOM_RATIO = 720 / 420;

/** Tỉ lệ THẬT của file (rộng ÷ cao) — sai số ở đây là logo bị bóp méo. */
export const LOGO_RATIO = 1024 / 331;

/** Bề ngang của lockup ở một chiều cao cho trước. Dùng thay cho việc gõ tay hai con số. */
export const logoWidth = (height: number): number => Math.round(height * LOGO_RATIO);
