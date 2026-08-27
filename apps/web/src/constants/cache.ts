import { PUBLIC_CACHE_SECONDS } from '@xeprime/types';

/**
 * Thời gian sống của cache DỮ LIỆU phía server (giây), dùng cho `next.revalidate`.
 *
 * Vì sao cần tầng này: root layout đọc cookie `XP_LOCALE` nên MỌI route đều render theo request
 * (ADR 0012) — không có HTML tĩnh nào để dựa vào. Tầng duy nhất còn giảm tải được là cache dữ
 * liệu của từng lời gọi `fetch`, nên các con số này chính là biên hiệu năng của phần công khai.
 *
 * NGUỒN SỐ là `PUBLIC_CACHE_SECONDS` ở `@xeprime/types` — cùng bảng mà API dùng phát
 * `Cache-Control` (`apps/api/src/common/http-cache.ts`). File này chỉ đặt tên theo cách dùng
 * của web; sửa số thì sửa Ở NGUỒN, hai tầng tự khớp nhau.
 *
 * Lưu ý khi chọn số (ghi đầy đủ ở docblock nguồn): mutation đi thẳng client → NestJS, không qua
 * server action của Next, nên KHÔNG có đường `revalidateTag` — TTL là cơ chế vô hiệu hoá duy
 * nhất, và dữ liệu người dùng tự sửa được phải hết hạn trong vòng một phút.
 */

/** Chi tiết xe, danh sách xe của gian hàng — có giá, giữ ngắn. */
export const REVALIDATE_LISTING_SECONDS = PUBLIC_CACHE_SECONDS.listing;

/** Hồ sơ + danh sách gian hàng — chủ shop tự sửa, giai đoạn đầu đăng ký nhiều: một phút là trần. */
export const REVALIDATE_SHOP_SECONDS = PUBLIC_CACHE_SECONDS.shop;

/** Banner marketing: admin bật/tắt xong còn thấy kết quả trong một phiên làm việc. */
export const REVALIDATE_BANNER_SECONDS = PUBLIC_CACHE_SECONDS.banner;

/** Đánh giá công khai — chỉ dài thêm khi có khách viết review mới. */
export const REVALIDATE_REVIEWS_SECONDS = PUBLIC_CACHE_SECONDS.reviews;

/** Danh mục, địa điểm — admin quản, đổi vài lần một tháng. */
export const REVALIDATE_CATALOG_SECONDS = PUBLIC_CACHE_SECONDS.catalog;
