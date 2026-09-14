import { QueryClient } from '@tanstack/react-query';
import { NOTIFICATION_TYPE, NOTIFICATION_TYPE_VALUES } from '@xeprime/types';
import { queryKeys } from '@/queries/query-keys';
import { refreshForNotification } from './notification-refresh';

/**
 * Một thông báo tới ⇒ làm mới ĐÚNG thứ nó vừa làm đổi.
 *
 * Lỗi thật người dùng gặp: khách nhận thông báo "chuyến đã bị huỷ", con số trên chuông nhảy ngay,
 * nhưng danh sách chuyến vẫn còn nguyên dòng đó cho tới khi tự kéo làm mới.
 *
 * Hai đường tin tới, hai mức chính xác: payload FCM mang `data.type` nên làm mới HẸP; bản chiếu
 * huy hiệu chỉ mang một con số nên làm mới RỘNG. Bài test khoá cả hai, cộng với ràng buộc không
 * bao giờ quét sạch cache.
 */
describe('refreshForNotification', () => {
  let client: QueryClient;
  let invalidated: unknown[][];

  const key = (queryKey: readonly unknown[]) => [...queryKey];

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invalidated = [];
    jest
      .spyOn(client, 'invalidateQueries')
      .mockImplementation((filters?: { queryKey?: readonly unknown[] }) => {
        invalidated.push([...(filters?.queryKey ?? [])]);
        return Promise.resolve();
      });
  });

  describe('biết loại — làm mới hẹp', () => {
    /**
     * Trường hợp người dùng báo: huỷ chuyến. Một chuyến có BA bề mặt nhìn vào nó, và cùng một
     * tài khoản có thể đang mở bất kỳ bề mặt nào — chủ xe tự thuê xe của người khác là chuyện
     * bình thường, nên không suy bề mặt từ vai người dùng.
     */
    it('thông báo về CHUYẾN ⇒ chuyến của khách + đơn của gian hàng + lịch thuê', () => {
      refreshForNotification(client, NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED);

      expect(invalidated).toContainEqual(key(queryKeys.trips.all));
      expect(invalidated).toContainEqual(key(queryKeys.bookings.all));
      expect(invalidated).toContainEqual(key(queryKeys.calendar.all));
    });

    /** Duyệt xong thì yêu cầu BIẾN thành một chuyến — cả hai danh sách cùng đổi. */
    it('thông báo về YÊU CẦU THUÊ ⇒ thêm hộp thư chờ duyệt', () => {
      refreshForNotification(client, NOTIFICATION_TYPE.BOOKING_REQUEST_APPROVED);

      expect(invalidated).toContainEqual(key(queryKeys.bookingRequests.all));
      expect(invalidated).toContainEqual(key(queryKeys.trips.all));
      expect(invalidated).toContainEqual(key(queryKeys.bookings.all));
      expect(invalidated).toContainEqual(key(queryKeys.calendar.all));
    });

    /** Làm mới HẸP nghĩa là có thứ KHÔNG được làm mới — nếu không thì nó chỉ là làm mới rộng. */
    it('thông báo về chuyến KHÔNG kéo theo gói dịch vụ hay kho xe', () => {
      refreshForNotification(client, NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED);

      expect(invalidated).not.toContainEqual(key(queryKeys.subscription.all));
      expect(invalidated).not.toContainEqual(key(queryKeys.vehicles.all));
    });

    it('thông báo DUYỆT XE ⇒ kho xe và chợ, không đụng chuyến', () => {
      refreshForNotification(client, NOTIFICATION_TYPE.VEHICLE_APPROVED);

      expect(invalidated).toContainEqual(key(queryKeys.vehicles.all));
      expect(invalidated).toContainEqual(key(queryKeys.marketplace.all));
      expect(invalidated).not.toContainEqual(key(queryKeys.trips.all));
    });

    /**
     * Chat có đường tín hiệu riêng và màn hình của nó tự lo (ADR 0009). Nối thông báo vào việc
     * tải lại hộp thư nghĩa là mỗi tin đến là một lượt gọi API cho một màn người dùng có thể
     * đang không nhìn.
     */
    it('thông báo TIN NHẮN không làm mới gì', () => {
      refreshForNotification(client, NOTIFICATION_TYPE.CHAT_MESSAGE_RECEIVED);

      expect(invalidated).toEqual([]);
    });
  });

  describe('không biết loại — làm mới rộng', () => {
    /**
     * Bản chiếu `user_badges/{uid}` chỉ nói "có thêm một thông báo chưa đọc". Loại chỉ đọc được
     * từ `GET /notifications`, mà danh sách đó chỉ tải khi người dùng MỞ chuông — tới lúc biết
     * được loại thì đã quá muộn để làm mới màn đang xem.
     */
    it('phủ mọi nhánh mà một loại bất kỳ có thể đụng tới', () => {
      refreshForNotification(client, null);

      for (const type of NOTIFICATION_TYPE_VALUES) {
        const narrow: unknown[][] = [];
        const probe = new QueryClient();
        jest
          .spyOn(probe, 'invalidateQueries')
          .mockImplementation((filters?: { queryKey?: readonly unknown[] }) => {
            narrow.push([...(filters?.queryKey ?? [])]);
            return Promise.resolve();
          });
        refreshForNotification(probe, type);

        for (const branch of narrow) expect(invalidated).toContainEqual(branch);
      }
    });

    it('không lặp lại một nhánh dù nhiều loại cùng dùng nó', () => {
      refreshForNotification(client, null);

      const seen = invalidated.map((k) => JSON.stringify(k));
      expect(new Set(seen).size).toBe(seen.length);
    });
  });

  /**
   * KHÔNG quét sạch cache, ở CẢ HAI mức.
   *
   * `notifications` được làm mới ở nơi gọi (nó là chính con số vừa đổi), và một lệnh invalidate
   * không tham số sẽ kéo theo cả banner, danh mục, kết quả tìm xe — thứ không thông báo nào đụng.
   */
  it('mọi lời gọi đều mang queryKey, và không nhánh nào là `notifications`', () => {
    refreshForNotification(client, null);

    expect(invalidated.length).toBeGreaterThan(0);
    expect(invalidated.every((k) => k.length > 0)).toBe(true);
    expect(invalidated).not.toContainEqual(key(queryKeys.notifications.all));
  });
});
