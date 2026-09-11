/**
 * Hằng số và phép tính mốc thời gian của khoản GIỮ CHỖ — ADR 0021.
 *
 * Vì sao chúng sống ở `packages/types` chứ không ở service: api tính mốc lúc tạo hold, worker
 * dọn hold theo đúng mốc đó, web và mobile đếm ngược tới đúng nó. Bốn nơi phải nói **cùng một
 * con số** — cùng lý do `BOOKING_REQUEST_RESPOND_WINDOW_MINUTES` nằm ở đây.
 *
 * ⚠️ Toàn bộ file này là số học trên **mốc tuyệt đối** (`Timestamptz`). Múi giờ VN **không** vào
 * đây — nó chỉ vào ở khâu hiển thị. Đừng nhập `addCalendarMonthsVn` hay bất cứ thứ gì trong
 * `long-term.ts` vào file này: một mốc "trước 4 giờ" không phụ thuộc lịch Việt Nam.
 */

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

/**
 * Khách huỷ trong bấy nhiêu giờ **kể từ `acceptedAt`** thì được hoàn 100% số đã thanh toán
 * online (ADR 0032 điều 5).
 *
 * ⚠️ Mốc tính XUÔI từ lúc chủ xe duyệt, **không** tính ngược từ giờ nhận xe. Trước ADR 0032 nó
 * là `pickupAt − 4h`, nghĩa là người đặt trước một tháng có tới một tháng để đổi ý miễn phí,
 * còn người đặt sát giờ thì không có phút nào — cùng một "chính sách 4 giờ" mà hai khách nhận
 * hai thứ hoàn toàn khác nhau. Tính từ `acceptedAt` cho mọi khách đúng một cửa sổ như nhau.
 *
 * Đổi con số này **không** sửa quyền của đơn đã đặt: `free_cancel_until` là một CỘT lưu trong
 * database, chốt một lần lúc tạo hold. Hằng số ở đây chỉ dùng để tính mốc cho hold MỚI.
 */
export const HOLD_FREE_CANCEL_HOURS = 4;

/**
 * Khách có bấy nhiêu phút để chuyển khoản trước khi hold hết hạn và nhả lịch.
 *
 * **2 giờ** (ADR 0032 điều 2), giảm từ 24 giờ của R3. Đánh đổi được chốt ở cấp sản phẩm: một
 * chỗ bị giữ mà chưa có tiền là một chỗ khách khác không đặt được, và giữ nó cả ngày làm hỏng
 * chính cái lịch mà nền tảng bán. Bù lại phải có nhắc hạn giữa chừng
 * (`HOLD_COUNTDOWN_SEGMENT_MINUTES`) — cửa sổ ngắn mà im lặng thì chỉ giỏi huỷ đơn của khách
 * thật.
 *
 * Con số thật của từng hold lấy từ chính sách phí hiện hành
 * (`FeePolicyValues.holdPaymentWindowMinutes`); hằng này là mặc định khi seed policy.
 */
export const HOLD_PAYMENT_WINDOW_MINUTES = 2 * 60;

/**
 * Cửa sổ thanh toán được chia thành các chặng bấy nhiêu phút — hai đồng hồ 60 phút thay vì một
 * đồng hồ 120 phút (ADR 0032 điều 2).
 *
 * Không phải chuyện trang trí: hết chặng đầu là mốc hệ thống **nhắc** khách, và một cửa sổ dài
 * hiện thành một con số lớn ("còn 118 phút") không tạo được cảm giác cần hành động. Worker đọc
 * đúng hằng này để biết khi nào bắn nhắc.
 */
export const HOLD_COUNTDOWN_SEGMENT_MINUTES = 60;

/**
 * Sàn số tiền giữ chỗ. Dưới mức này thì phí chuyển khoản và công đối soát vượt khoản thu.
 *
 * **Đây là SÀN, không phải làm tròn** (ADR 0021 ràng buộc 3): VietQR mang sẵn số tiền, khách
 * không gõ gì, và số chính xác là thứ làm cho đối soát tự động rẻ. Khi sàn có hiệu lực thì
 * `computedAmount` và `amount` khác nhau, và cả hai đều được lưu để giải thích được chênh lệch.
 */
export const HOLD_MIN_AMOUNT = 20_000;

/**
 * Số hold đang chờ tiền tối đa của một khách.
 *
 * `awaiting_hold` chiếm chỗ thật mà chưa có tiền — đây là bề mặt phá hoại, và giới hạn này là
 * hàng rào rẻ nhất (ADR 0021 ràng buộc 4).
 */
export const HOLD_MAX_OPEN_PER_CUSTOMER = 3;

/**
 * Số đơn đầu tiên của một tenant được **miễn phí hoàn toàn**: 0% hoa hồng, không thu giữ chỗ
 * (ADR 0026 điều 1).
 *
 * Đếm theo **ĐƠN ĐƯỢC TẠO**, không theo chuyến hoàn thành — đếm theo chuyến hoàn thành mở đúng
 * một lỗ: đặt rồi huỷ vô hạn mà không bao giờ tiêu hết ưu đãi (ADR 0026 điều 2).
 *
 * Đổi số này **không hồi tố**: tenant đã tiêu lượt theo mức cũ giữ nguyên mức cũ.
 */
export const FREE_TRIP_ALLOWANCE = 2;

/**
 * Trần cứng cho khoản giữ chỗ mà GIAN HÀNG tự đặt (ADR 0025 điều 3).
 *
 * Số tiền escrow là công cụ chống bỏ chuyến của gian hàng, không phải doanh thu của nền tảng, nên
 * họ tự đặt. Nhưng không có trần thì "cọc giữ chỗ" biến thành **thu tiền thuê trước**, và lúc đó
 * nền tảng đang giữ hộ gần như cả chuyến tiền của người khác.
 */
export const ESCROW_MAX_PERCENT = 30;

/**
 * Biên hợp lệ của tỉ lệ hoa hồng (ADR 0020). Giá trị cụ thể là DỮ LIỆU trên `plans`; hai đầu mút
 * là QUY TẮC trong code — cùng ranh giới ADR 0015 điều 4 đã đặt.
 *
 * Chặn `0` là cố ý: một bậc gói tuyến hoa hồng với 0% không phải ưu đãi mà là một cấu hình sai
 * đang im lặng cho không dịch vụ. Miễn phí có đường riêng của nó — `FREE_TRIP_ALLOWANCE`.
 */
export const COMMISSION_PERCENT_MIN = 1;
export const COMMISSION_PERCENT_MAX = 20;

/**
 * Cam kết rút tiền (ADR 0025 điều 7). Con số là dữ liệu admin đổi được; *việc phải có một cam kết
 * và hiện nó ra trước khi người dùng bấm rút* là quy tắc.
 */
export const WITHDRAWAL_TERMS = {
  /** Số tiền rút tối thiểu mỗi lần (VND). */
  MIN_AMOUNT: 50_000,
  /** Giờ cắt trong ngày làm việc (giờ Việt Nam). Trước mốc này thì chuyển ngay trong ngày. */
  CUTOFF_HOUR_VN: 16,
  /**
   * Cam kết tối đa, tính bằng NGÀY LÀM VIỆC kể từ khi duyệt.
   *
   * 2 ngày — ADR 0028 điều 8 hạ từ 3 của ADR 0025 điều 7.
   */
  MAX_BUSINESS_DAYS: 2,
} as const;

/**
 * Mốc huỷ miễn phí — tính XUÔI từ `acceptedAt` (ADR 0032 điều 5).
 *
 * Kẹp trên bằng `pickupAt`: quyền huỷ miễn phí không thể sống qua thời điểm khách đã cầm xe.
 * Với chuyến đặt sát giờ (nhận xe sau chưa tới 4 tiếng) cửa sổ bị cắt ngắn theo — đó là lý do
 * ADR 0032 điều 5 bắt **cảnh báo chính sách huỷ sát giờ trước khi khách trả tiền**, chứ không
 * phải để họ phát hiện ra sau.
 *
 * SERVER tính và LƯU vào cột — client không gửi, và client cũng **không tự tính lại lúc đọc**:
 * lệch đồng hồ máy khách sẽ rơi đúng vào lúc tiền phụ thuộc vào nó. Web/mobile đọc
 * `freeCancelUntil` từ API rồi so với `Date.now()`.
 *
 * QR Pay thành công **không** khởi động lại mốc này (ADR 0032 điều 5) — nó được chốt một lần
 * lúc duyệt và không đường nào tính lại.
 */
export function holdFreeCancelUntil(
  acceptedAt: Date,
  hours: number = HOLD_FREE_CANCEL_HOURS,
  pickupAt?: Date,
): Date {
  const until = acceptedAt.getTime() + hours * MS_PER_HOUR;
  return new Date(pickupAt ? Math.min(until, pickupAt.getTime()) : until);
}

/** Hạn chuyển khoản của một hold tạo lúc `from`. SERVER tính. */
export function holdExpiresAt(
  from: Date,
  windowMinutes: number = HOLD_PAYMENT_WINDOW_MINUTES,
): Date {
  return new Date(from.getTime() + windowMinutes * MS_PER_MINUTE);
}

/**
 * Còn được huỷ miễn phí không — so MỐC ĐÃ LƯU, không bao giờ tính lại.
 *
 * Gian hàng dời giờ nhận xe **không** được nới hay xoá quyền khách đã có, và một lần chuyển
 * khoản thành công cũng không (ADR 0032 điều 5). Vì vậy hàm này cố ý chỉ nhận `freeCancelUntil`
 * — không nhận `pickupAt`, không nhận `acceptedAt`, không có đường nào tính lại.
 */
export function isWithinFreeCancel(
  freeCancelUntil: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!freeCancelUntil) return false;
  const until =
    freeCancelUntil instanceof Date ? freeCancelUntil : new Date(freeCancelUntil);
  return now.getTime() < until.getTime();
}

/** Mili-giây còn lại tới một mốc (0 khi đã qua hoặc không có mốc) — nuôi đồng hồ đếm ngược. */
export function holdRemainingMs(
  deadline: Date | string | null | undefined,
  now: Date = new Date(),
): number {
  if (!deadline) return 0;
  const due = deadline instanceof Date ? deadline : new Date(deadline);
  return Math.max(0, due.getTime() - now.getTime());
}

/**
 * Hold đã quá hạn chuyển khoản chưa — so mốc, không so trạng thái.
 *
 * Trạng thái `expired` do worker ghi, nên luôn có một cửa sổ (tới một nhịp worker) mà hold đã
 * quá hạn nhưng vẫn còn `pending` trong DB. Đường xử lý webhook phải hỏi hàm này chứ không phải
 * hỏi cột `status`, nếu không cửa sổ đó là một lỗ để kích hoạt một hold đã chết và chỗ đã bị
 * khách khác lấy. Cùng kỷ luật với `isBookingRequestPastDue`.
 */
export function isHoldPastDue(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  const due = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return due.getTime() <= now.getTime();
}
