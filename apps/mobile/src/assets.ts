import logo from '../assets/images/logo.jpg';
// SINH TỰ ĐỘNG từ `apps/web/public/illustrations/*.svg` — xem `scripts/sync-brand-art.mjs`.
import shopOnboarding from '../assets/images/shop-onboarding.png';

/**
 * Ảnh tĩnh gom một chỗ vì Metro nội suy đường dẫn lúc build — không dựng động được.
 *
 * KHÔNG nằm trong `theme/`: đây là tài nguyên, không phải design token. Icon/splash của app
 * khai ở `app.json` và phải là PNG vuông (logo hiện tại là JPG 1024×768, chỉ dùng trong UI).
 */
export const images = { logo, shopOnboarding } as const;
