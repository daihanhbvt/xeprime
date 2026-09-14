import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { queryKeys } from '@/services/query-keys';
import { refreshNotificationAffected } from './notification-refresh';

/**
 * Một thông báo tới ⇒ làm mới thứ nó có thể vừa làm đổi.
 *
 * Lỗi thật người dùng gặp: khách nhận thông báo "chuyến đã bị huỷ", con số trên chuông nhảy ngay,
 * nhưng danh sách chuyến vẫn còn nguyên dòng đó cho tới khi tải lại trang.
 */
describe('refreshNotificationAffected', () => {
  let client: QueryClient;
  let invalidated: unknown[][];

  const key = (queryKey: readonly unknown[]) => [...queryKey];

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invalidated = [];
    vi.spyOn(client, 'invalidateQueries').mockImplementation(
      (filters?: { queryKey?: readonly unknown[] }) => {
        invalidated.push([...(filters?.queryKey ?? [])]);
        return Promise.resolve();
      },
    );
  });

  /**
   * Cùng một tài khoản có thể đang mở bất kỳ bề mặt nào — chủ xe tự thuê xe của người khác là
   * chuyện bình thường — nên không suy bề mặt từ vai người dùng.
   */
  it('làm mới chuyến của KHÁCH và đơn của GIAN HÀNG — hai bề mặt, cùng vòng đời', () => {
    refreshNotificationAffected(client);

    expect(invalidated).toContainEqual(key(queryKeys.trips.all));
    expect(invalidated).toContainEqual(key(queryKeys.bookings.all));
  });

  it('làm mới hộp thư yêu cầu — vừa là danh sách, vừa là con số trên menu', () => {
    refreshNotificationAffected(client);

    expect(invalidated).toContainEqual(key(queryKeys.bookingRequests.all));
  });

  /** Một chuyến bị huỷ là một ô lịch vừa được trả lại. */
  it('làm mới lịch bận', () => {
    refreshNotificationAffected(client);

    expect(invalidated).toContainEqual(key(queryKeys.calendar.all));
  });

  /**
   * KHÔNG quét sạch cache.
   *
   * `chat` và `notifications` có tín hiệu RIÊNG chính xác hơn (`chatCustomer`/`chatShop` và
   * `notificationsUnread` đọc ở hook của chính chúng), nên gộp vào đây là làm mới hai lần cho
   * cùng một sự kiện. Và một lệnh invalidate không tham số sẽ kéo theo cả banner, danh mục, kết
   * quả tìm xe — thứ không thông báo nào đụng tới.
   */
  it('KHÔNG đụng nhánh có tín hiệu riêng, và không invalidate toàn bộ', () => {
    refreshNotificationAffected(client);

    expect(invalidated).not.toContainEqual(key(queryKeys.chat.all));
    expect(invalidated).not.toContainEqual(key(queryKeys.notifications.all));
    expect(invalidated.length).toBeGreaterThan(0);
    expect(invalidated.every((k) => k.length > 0)).toBe(true);
  });
});
