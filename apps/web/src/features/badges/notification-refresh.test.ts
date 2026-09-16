import { QueryClient, QueryObserver } from '@tanstack/react-query';
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

/**
 * MÀN CHI TIẾT ĐANG MỞ phải tự đổi khi thông báo `hold_paid` tới — Phase 6.
 *
 * Tình huống thật: khách đang nhìn mã QR giữ chỗ, chuyển khoản xong ở app ngân hàng rồi quay
 * lại tab. Webhook SePay đã mở đơn và bắn thông báo, `notificationsUnread` nhảy, và
 * `BadgeRealtimeProvider` gọi đúng hàm dưới đây. Nếu màn hình vẫn đứng ở khối QR thì khách sẽ
 * chuyển tiền LẦN HAI — đó là lý do ca này tồn tại.
 *
 * Khối trên khẳng định danh sách khoá được gọi; khối này khẳng định điều thật sự quan trọng:
 * khoá `trips.all` **phủ** được `trips.detail(id)`, nên query của màn đang mở thực sự chạy lại.
 * Hai chuyện đó khác nhau — một lần đổi hình dạng khoá chi tiết (ví dụ tách sang nhánh riêng)
 * sẽ giữ nguyên khối trên mà làm hỏng đúng thứ người dùng thấy.
 *
 * Dùng `QueryClient` THẬT với một observer thật, không mock `invalidateQueries`: thứ đang được
 * kiểm là hành vi khớp tiền tố của TanStack Query, và mock đi thì không còn gì để kiểm.
 */
describe('refreshNotificationAffected — màn chi tiết chuyến đang mở', () => {
  it('kéo lại CHI TIẾT chuyến đang mở, không chỉ danh sách', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const tripId = '01J0TRIPDETAIL0000000000';

    let calls = 0;
    const observer = new QueryObserver(client, {
      queryKey: queryKeys.trips.detail(tripId),
      queryFn: async () => {
        calls += 1;
        return { id: tripId };
      },
    });
    // Có observer = màn hình đang mở. Không có nó thì `invalidateQueries` chỉ đánh dấu cũ.
    const unsubscribe = observer.subscribe(() => undefined);
    /*
     * Chờ lượt tải đầu XONG HẲN, không chỉ chờ nó bắt đầu: một lệnh invalidate phát ra trong lúc
     * lượt tải còn đang bay sẽ bị gộp vào chính lượt đó và không sinh lượt mới — ca này sẽ xanh
     * giả, đúng thứ nó sinh ra để bắt.
     */
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    expect(calls).toBe(1);

    refreshNotificationAffected(client);

    await vi.waitFor(() => expect(calls).toBe(2));

    unsubscribe();
    client.clear();
  });
});
