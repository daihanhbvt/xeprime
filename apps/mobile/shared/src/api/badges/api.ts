import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

/**
 * Bộ đếm + mốc máy chủ. Type lấy THẲNG từ contract OpenAPI (ADR 0007) — bản chiếu realtime cũng
 * điền đúng hình dạng này khi ghi vào cache, nên cả hai nguồn chỉ có một kiểu duy nhất.
 */
export type BadgesSnapshot = components['schemas']['UserBadgesDto'];

/**
 * Huy hiệu của tôi — MỘT request cho mọi con số hiện ở khung ứng dụng.
 *
 * Thay cho ba lời gọi cũ (`/conversations/unread-summary`, `/conversations/unread-count`,
 * `/notifications/unread-count`) mà mọi màn đều gọi song song. Ba endpoint kia vẫn còn ở backend
 * (tài liệu chuyển tiếp §A: KHÔNG gỡ trong đợt này), app chỉ ngừng dùng.
 *
 * ⚠️ `UserBadgesDto` dùng `chatCustomer`/`chatShop`, còn `ChatUnreadSummaryDto` cũ dùng
 * `customer`/`shop` — khác tên trường cho cùng một con số. Đừng map nhầm khi đọc code cũ.
 *
 * Theo ADR 0031: tầng gọi theo nghiệp vụ nằm ở `apps/mobile/src/api/<feature>/`, web có bản
 * riêng ở `apps/web/src/features/badges/api.ts`. Hai bản KHÔNG tự đồng bộ — sửa contract là sửa
 * cả hai.
 */
export const badgesApi = {
  me(): Promise<BadgesSnapshot> {
    return getApiClient().get<BadgesSnapshot>('/me/badges');
  },
};
