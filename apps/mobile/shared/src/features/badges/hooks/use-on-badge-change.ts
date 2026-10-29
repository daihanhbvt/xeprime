import { useEffect, useRef } from 'react';
import { useAppActive } from '@/hooks/use-app-active';

/**
 * Chạy `onChange` khi một con số huy hiệu ĐỔI — cầu nối giữa bản chiếu realtime và những query
 * hiển thị chi tiết của chính con số đó.
 *
 * Bản native của `apps/web/src/features/badges/hooks/use-on-badge-change.ts`, cùng ba luật; chỉ
 * khác cách biết "người dùng có đang nhìn không" (xem luật 2).
 *
 * Vì sao cần: bản chiếu `user_badges/{uid}` chỉ mang CON SỐ. Danh sách đứng sau nó — hộp thư,
 * danh sách thông báo, số yêu cầu chờ duyệt — là những query riêng với nhịp làm mới riêng. Không
 * nối hai thứ lại thì con số nhảy tức thì còn danh sách đứng im tới nhịp poll kế tiếp, và người
 * dùng thấy đúng thứ khó chịu nhất: chuông báo có việc mới, mở ra không có gì.
 *
 * Ba luật, và cả ba đều để KHÔNG gọi API khi không ai được lợi:
 *
 *  1. **Bỏ qua giá trị ĐẦU TIÊN được biết.** Lúc mount, query đứng sau đã tự tải rồi — gọi thêm
 *     một lượt nữa là tự sinh một request thừa ở mọi màn. `null` nghĩa là CHƯA biết con số
 *     (`/me/badges` chưa về, hoặc vừa đăng xuất) và không lập mốc: nếu nơi gọi đưa 0 thay cho
 *     "chưa biết", lượt REST đầu tiên của người còn thông báo chưa đọc trông như thay đổi 0 → N
 *     và mọi danh sách đang mở bị tải lại ngay sau khi vừa tải xong.
 *  2. **App ở nền thì hoãn.** `refetchInterval` của TanStack đã được tắt tay theo `AppState`,
 *     nhưng `invalidateQueries` thì không: listener Firestore vẫn sống khi app xuống nền, nên mỗi
 *     sự kiện sẽ kéo theo một lượt tải cho một màn không ai nhìn — pin và dữ liệu di động tiêu
 *     cho không. Thay vì gọi ngay, ghi nhận "còn nợ một lượt" và trả nợ đúng lúc quay lại.
 *  3. **Chỉ CON SỐ mới kích hoạt**, không phải danh tính của `onChange` — nên nơi gọi không cần
 *     `useCallback`.
 *
 * Việc hoãn không làm chậm cái gì người dùng thấy: lúc quay lại app, hook chạy `onChange` ngay
 * trước cả khi `useRefetchOnForeground` của query kịp làm gì.
 */
export function useOnBadgeChange(value: number | null, onChange: () => void): void {
  const handler = useRef(onChange);
  useEffect(() => {
    handler.current = onChange;
  });

  const appActive = useAppActive();

  const previous = useRef<number | null>(null);
  /** Có thay đổi xảy ra trong lúc app ở nền — phải chạy bù khi quay lại. */
  const pending = useRef(false);

  useEffect(() => {
    if (value === null) {
      // Mất con số (đăng xuất / đổi tài khoản): giá trị biết được kế tiếp là MỐC MỚI, không phải
      // một thay đổi — và món nợ của tài khoản trước không được trả cho tài khoản sau.
      previous.current = null;
      pending.current = false;
      return;
    }
    if (previous.current !== null && previous.current !== value) {
      if (appActive) handler.current();
      else pending.current = true;
    }
    previous.current = value;
    // `appActive` cố ý KHÔNG có trong deps: effect này chỉ phản ứng với CON SỐ. Việc trả nợ khi
    // quay lại tiền cảnh là của effect bên dưới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!appActive || !pending.current) return;
    pending.current = false;
    handler.current();
  }, [appActive]);
}
