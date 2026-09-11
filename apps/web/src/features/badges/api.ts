import type { components } from '@xeprime/types';
import { apiGet } from '@/services/api-client';

/**
 * Bộ đếm + mốc máy chủ. Type lấy THẲNG từ contract OpenAPI (ADR 0007) — bản chiếu realtime cũng
 * điền đúng hình dạng này khi ghi vào cache, nên cả hai nguồn chỉ có một kiểu duy nhất.
 */
export type BadgesSnapshot = components['schemas']['UserBadgesDto'];

/**
 * Huy hiệu của tôi — MỘT request cho mọi con số hiện ở khung ứng dụng.
 *
 * Thay cho ba lời gọi cũ (`/conversations/unread-summary`, `/conversations/unread-count`,
 * `/notifications/unread-count`) mà mọi trang đều gọi song song. Ba endpoint kia vẫn còn ở
 * backend cho app native; web không dùng nữa.
 */
export const fetchBadges = (): Promise<BadgesSnapshot> => apiGet<BadgesSnapshot>('/me/badges');
