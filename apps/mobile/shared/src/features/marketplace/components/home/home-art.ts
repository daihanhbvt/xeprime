import { market } from '@/theme/tokens';
/**
 * MÀU TRANH của các khối trang chủ — màu vẽ sẵn trong ảnh SVG của web (`/home/*.svg`), không phải
 * màu giao diện: không token nào của `@xeprime/ui` mang chúng và chúng KHÔNG đổi theo sáng/tối
 * (web cũng hiện đúng tấm SVG đó ở cả hai chế độ). Gom một chỗ để hai khối dùng cùng ngôi sao không
 * giữ hai bản chép tay.
 */

/** Sao đánh giá — `/home/star-16.svg` · `/home/star-24.svg` web. */
export const STAR_ART = market.star;
/** Con dấu xác thực XANH của thẻ trang chủ — `/home/card-verified.svg` web. */
export const SEAL_ART = '#49ADF4';
