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
 * Khách có bấy nhiêu phút để chuyển TIỀN GIỮ CHỖ trước khi hold hết hạn và chỗ được nhả.
 *
 * **120 phút** (22/09/2026 — ADR 0044), trở lại đúng con số ADR 0032 điều 2 sau khi ADR 0039 bị
 * ghi đè. Hai thứ này không tách rời nhau được: cửa sổ 10 phút của ADR 0039 chỉ hợp lý khi hold
 * sinh ra lúc khách GỬI yêu cầu — khi đó chiếc xe bị khoá trước cả khi chủ xe kịp nhìn thấy,
 * nên giữ lâu là lấy chỗ của khách khác. Ở thứ tự mới, hold chỉ sinh SAU khi chuyến đã được
 * NHẬN: chỗ đó là của đúng một người, chủ xe đã đồng ý, và hai giờ là thời gian thật mà một
 * người cần để mở app ngân hàng, chuyển tiền và chờ ngân hàng xử lý.
 *
 * Hết hạn là HẾT — không còn lượt tự gia hạn nào (ADR 0044 điều 3). Đổi lại, khách được nhắc
 * hai lần trước khi hết giờ (`HOLD_PAYMENT_REMINDER_REMAINING_MINUTES`).
 *
 * Con số thật của từng hold lấy từ chính sách phí hiện hành
 * (`FeePolicyValues.holdPaymentWindowMinutes`); hằng này là mặc định khi seed policy.
 */
export const HOLD_PAYMENT_WINDOW_MINUTES = 120;

/**
 * Hai mốc nhắc khách chuyển tiền giữ chỗ, tính bằng **số phút CÒN LẠI** tới hạn (ADR 0044 điều 3).
 *
 * Vì sao tính theo phần còn lại chứ không theo thời gian đã trôi: hạn trả tiền bị KẸP bởi giờ
 * nhận xe, nên cửa sổ thật của một chuyến sát giờ có thể ngắn hơn hai tiếng. Một mốc "sau 60
 * phút" sẽ bắn sau khi hold đã chết; một mốc "còn 60 phút" thì tự nằm đúng chỗ, và worker chỉ
 * cần bỏ qua những hold chưa bao giờ dài tới ngần ấy.
 *
 * `FIRST` trùng đúng ranh giới hai chặng đồng hồ (`HOLD_COUNTDOWN_SEGMENT_MINUTES`) — thông báo
 * và đồng hồ trên màn hình vì thế nói cùng một điều tại cùng một thời điểm.
 */
export const HOLD_PAYMENT_REMINDER_REMAINING_MINUTES = {
  FIRST: 60,
  FINAL: 15,
} as const;

/**
 * Cửa sổ ngắn nhất còn có nghĩa để đưa QR cho khách.
 *
 * Hạn chuyển tiền bị KẸP bởi giờ nhận xe — một hold còn "chờ tiền" sau khi xe đáng lẽ đã giao
 * là một chỗ bị khoá vô nghĩa. Với chuyến đặt sát giờ, phần kẹp đó có thể còn lại vài phút, và
 * vài phút thì không đủ để ai mở được app ngân hàng: chuyến đó phải đi đường thoả thuận trực
 * tiếp với gian hàng, và người duyệt được nói rõ lý do (`HOLD_WINDOW_TOO_SHORT`).
 *
 * ⚠️ Hằng này phải NHỎ HƠN `HOLD_PAYMENT_WINDOW_MINUTES` — `holds.test.ts` khoá quan hệ đó.
 * `expiresAt − now` không bao giờ vượt quá cửa sổ, nên một ngưỡng lớn hơn cửa sổ sẽ từ chối
 * MỌI hold ngay lúc tạo, tức là cả sàn ngừng nhận đơn, im lặng.
 */
export const HOLD_MIN_USABLE_WINDOW_MINUTES = 15;

/**
 * Cửa sổ thanh toán được chia thành các chặng bấy nhiêu phút — **60** (ADR 0032 điều 2: "hai
 * countdown 60 phút").
 *
 * Một con số "còn 118 phút" không tạo được cảm giác cần hành động; chia thành hai chặng cho
 * người dùng một đồng hồ họ đọc được ngay, và mốc giao giữa hai chặng đúng là lúc worker bắn
 * lần nhắc thứ nhất — hai kênh nói cùng một điều.
 */
export const HOLD_COUNTDOWN_SEGMENT_MINUTES = 60;

/**
 * Đồng hồ hạn thanh toán đổi sắc CẢNH BÁO khi còn bấy nhiêu phút — đúng mốc nhắc CUỐI của worker
 * (`HOLD_PAYMENT_REMINDER_REMAINING_MINUTES.FINAL`), để màu cam và lượt nhắc tới cùng lúc. Một sắc
 * cam suốt cả chặng 60 phút thứ hai là báo động giả (design v2 vẽ đồng hồ xám ở "59:49").
 */
export const HOLD_COUNTDOWN_URGENT_MINUTES = HOLD_PAYMENT_REMINDER_REMAINING_MINUTES.FINAL;

/**
 * Cửa sổ huỷ miễn phí của khoản giữ chỗ đã bị KẸP bởi giờ nhận xe (chuyến sát giờ) — tức là nó đóng
 * không muộn hơn hạn thanh toán. ADR 0032 điều 5 buộc báo khách điều này TRƯỚC khi trả.
 *
 * So hai MỐC ĐÃ LƯU của server, không tính lại từ giờ nhận xe.
 */
export function isFreeCancelWindowShort(hold: {
  freeCancelUntil: Date | string;
  expiresAt: Date | string;
}): boolean {
  return new Date(hold.freeCancelUntil).getTime() <= new Date(hold.expiresAt).getTime();
}

/**
 * Sàn số tiền giữ chỗ. Dưới mức này thì phí chuyển khoản và công đối soát vượt khoản thu.
 *
 * **Đây là SÀN, không phải làm tròn** (ADR 0021 ràng buộc 3): VietQR mang sẵn số tiền, khách
 * không gõ gì, và số chính xác là thứ làm cho đối soát tự động rẻ. Khi sàn có hiệu lực thì
 * `computedAmount` và `amount` khác nhau, và cả hai đều được lưu để giải thích được chênh lệch.
 */
export const HOLD_MIN_AMOUNT = 20_000;

/**
 * Số hold đang chờ tiền tối đa của một khách (ADR 0021 ràng buộc 4).
 *
 * Bề mặt phá hoại này HẸP HẲN từ ADR 0044: hold chỉ sinh ra sau khi một con người ở gian hàng
 * (hoặc thiết lập "Đặt ngay" của chính họ) đã NHẬN chuyến, nên không ai tự khoá được ba chiếc
 * xe chỉ bằng ba lượt bấm đặt. Trần vẫn giữ để một khách không giữ nhiều chỗ cùng lúc rồi chỉ
 * trả tiền cho một chỗ.
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
  /**
   * Số tiền rút tối thiểu mỗi lần (VND).
   *
   * 10.000 — hạ từ 50.000 ngày 16/09/2026. Sàn tồn tại để một lần chuyển khoản đáng công đối
   * soát tay của admin, chứ không phải để giữ lại tiền của người khác; với chủ xe cá nhân mới
   * chạy vài chuyến, 50.000 là mức khiến số dư nằm im mà không có lý do nào giải thích được.
   */
  MIN_AMOUNT: 10_000,
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

// ── Cửa sổ ĐỘNG theo khoảng cách tới giờ nhận xe — luồng tiền v2 (20/10/2026) ─────────────────

/**
 * Ngưỡng và tỷ lệ của cửa sổ động. Gọi `ΔT = pickupAt − acceptedAt`:
 *
 * | ΔT              | Huỷ miễn phí                      | Hạn thanh toán                           |
 * | --------------- | --------------------------------- | ---------------------------------------- |
 * | `≥ 24 giờ`      | trọn `freeCancelHours` (4 giờ)    | trọn `holdPaymentWindowMinutes` (120′)   |
 * | `2 giờ – 24 giờ`| `min(4 giờ, ΔT × 30%)`            | `min(120′, max(15′, ΔT × 40%))`          |
 * | `< 2 giờ`       | **0** — đặt gấp thì cọc là chốt   | `min(120′, max(15′, ΔT × 40%))`          |
 *
 * Vì sao: cửa sổ cố định 4 giờ / 120 phút của ADR 0032 · 0044 cho khách đặt xe nhận sau 3 giờ
 * quyền huỷ miễn phí tới tận lúc nhận xe — chủ xe giữ chỗ suốt buổi rồi mất khách sát giờ mà
 * không được đền đồng nào. Cửa sổ tỉ lệ với ΔT giữ đúng tinh thần "huỷ sớm thì miễn phí" cho cả
 * chuyến xa lẫn chuyến gần.
 *
 * Hai mốc vẫn đếm XUÔI từ `acceptedAt` và được LƯU một lần lúc tạo hold — không có đường nào tính
 * lại lúc đọc (ADR 0032 điều 5 giữ nguyên).
 *
 * ⚠️ Khi ΔT < 24 giờ, hạn thanh toán (40%) DÀI HƠN cửa sổ huỷ miễn phí (30%): khách trả ở cuối hạn
 * đã qua mốc huỷ miễn phí. Đó là chủ đích của bản thiết kế — UI phải nói rõ mốc huỷ TRƯỚC khi
 * khách trả (`isFreeCancelWindowShort`).
 */
export const HOLD_DYNAMIC_WINDOW = {
  /** Từ ngần này giờ trở lên là đặt XA — dùng nguyên hai cửa sổ của chính sách phí. */
  FAR_LEAD_HOURS: 24,
  /** Dưới ngần này giờ là đặt GẤP — không có huỷ miễn phí. */
  URGENT_LEAD_HOURS: 2,
  /** Phần của ΔT dành cho huỷ miễn phí khi đặt cận ngày. */
  FREE_CANCEL_SHARE: 0.3,
  /** Phần của ΔT dành cho thanh toán khi đặt cận ngày. */
  PAYMENT_SHARE: 0.4,
} as const;

/** `ΔT` tính bằng phút, không âm — giờ nhận đã qua thì coi như 0 (đặt gấp nhất có thể). */
function leadMinutesOf(acceptedAt: Date, pickupAt: Date): number {
  return Math.max(0, (pickupAt.getTime() - acceptedAt.getTime()) / MS_PER_MINUTE);
}

/**
 * Số phút huỷ miễn phí cho một chuyến có `ΔT = leadMinutes`. `maxHours` là cửa sổ của chính sách
 * phí (`freeCancelHours`) — vừa là giá trị khi đặt xa, vừa là trần khi đặt cận ngày.
 */
export function holdFreeCancelMinutes(leadMinutes: number, maxHours: number): number {
  const max = Math.max(0, maxHours) * 60;
  if (leadMinutes >= HOLD_DYNAMIC_WINDOW.FAR_LEAD_HOURS * 60) return max;
  if (leadMinutes < HOLD_DYNAMIC_WINDOW.URGENT_LEAD_HOURS * 60) return 0;
  return Math.min(max, Math.round(leadMinutes * HOLD_DYNAMIC_WINDOW.FREE_CANCEL_SHARE));
}

/**
 * Số phút khách có để chuyển tiền giữ chỗ cho một chuyến có `ΔT = leadMinutes`. `maxMinutes` là
 * cửa sổ của chính sách phí (`holdPaymentWindowMinutes`).
 *
 * Sàn là `HOLD_MIN_USABLE_WINDOW_MINUTES` — CÙNG ngưỡng mà lượt tạo hold dùng để từ chối một cửa
 * sổ quá ngắn. Hai con số khác nhau thì sẽ có chuyến được hứa một cửa sổ mà lượt tạo hold không
 * chấp nhận.
 */
export function holdPaymentWindowMinutes(leadMinutes: number, maxMinutes: number): number {
  if (leadMinutes >= HOLD_DYNAMIC_WINDOW.FAR_LEAD_HOURS * 60) return maxMinutes;
  const proportional = Math.round(leadMinutes * HOLD_DYNAMIC_WINDOW.PAYMENT_SHARE);
  return Math.min(maxMinutes, Math.max(HOLD_MIN_USABLE_WINDOW_MINUTES, proportional));
}

/** Hai mốc của một hold mới, đã kẹp — kèm số phút để audit giải thích được con số. */
export interface HoldWindows {
  /** `ΔT = pickupAt − acceptedAt`, phút (không âm). */
  leadMinutes: number;
  freeCancelMinutes: number;
  paymentWindowMinutes: number;
  freeCancelUntil: Date;
  /**
   * Hạn chuyển tiền — KẸP bởi giờ nhận xe: một hold còn "chờ tiền" sau khi xe đáng lẽ đã giao là
   * một chỗ bị khoá vô nghĩa. Caller vẫn phải từ chối cửa sổ còn lại quá ngắn
   * (`HOLD_MIN_USABLE_WINDOW_MINUTES`).
   */
  expiresAt: Date;
}

/**
 * Hai mốc của một hold — MỘT phép tính cho mọi nơi tạo hold. SERVER tính và lưu vào cột; client
 * đọc mốc đã lưu, không tự tính lại.
 */
export function holdWindowsFor(input: {
  acceptedAt: Date;
  pickupAt: Date;
  /** `FeePolicyValues.freeCancelHours` — cửa sổ khi đặt xa. */
  freeCancelHours: number;
  /** `FeePolicyValues.holdPaymentWindowMinutes` — cửa sổ khi đặt xa. */
  paymentWindowMinutes: number;
}): HoldWindows {
  const leadMinutes = leadMinutesOf(input.acceptedAt, input.pickupAt);
  const freeCancelMinutes = holdFreeCancelMinutes(leadMinutes, input.freeCancelHours);
  const paymentWindowMinutes = holdPaymentWindowMinutes(leadMinutes, input.paymentWindowMinutes);
  const pickupMs = input.pickupAt.getTime();
  const from = input.acceptedAt.getTime();
  return {
    leadMinutes,
    freeCancelMinutes,
    paymentWindowMinutes,
    freeCancelUntil: new Date(Math.min(from + freeCancelMinutes * MS_PER_MINUTE, pickupMs)),
    expiresAt: new Date(Math.min(from + paymentWindowMinutes * MS_PER_MINUTE, pickupMs)),
  };
}

/**
 * XEM TRƯỚC hai cửa sổ nếu chuyến được nhận NGAY lúc `now` — `holdWindowsFor` với `acceptedAt = now`,
 * kèm cờ `tooShort` theo CÙNG ngưỡng lượt tạo hold dùng để từ chối (`HOLD_WINDOW_TOO_SHORT`).
 *
 * Dùng cho màn duyệt của gian hàng và cảnh báo đặt sát giờ của khách — đều là ƯỚC TÍNH: mốc thật
 * được tính và LƯU một lần lúc lượt duyệt chạy (không có đường nào đọc lại hàm này để quyết tiền).
 */
export function holdWindowsPreview(input: {
  now: Date;
  pickupAt: Date;
  freeCancelHours: number;
  paymentWindowMinutes: number;
}): HoldWindows & { tooShort: boolean } {
  const windows = holdWindowsFor({
    acceptedAt: input.now,
    pickupAt: input.pickupAt,
    freeCancelHours: input.freeCancelHours,
    paymentWindowMinutes: input.paymentWindowMinutes,
  });
  return {
    ...windows,
    tooShort:
      windows.expiresAt.getTime() - input.now.getTime() <
      HOLD_MIN_USABLE_WINDOW_MINUTES * MS_PER_MINUTE,
  };
}

/** Hai cửa sổ xem trước ở dạng ĐI TRÊN DÂY — mốc là chuỗi ISO, số phút đã làm tròn. */
export interface HoldWindowsPreviewDto {
  leadMinutes: number;
  paymentWindowMinutes: number;
  freeCancelMinutes: number;
  expiresAt: string;
  freeCancelUntil: string;
  tooShort: boolean;
}

/**
 * Kết quả `holdWindowsPreview` ⇒ dạng DTO. Một hàm cho cả server (`approvalPreview.windows`) lẫn
 * màn duyệt dài hạn của web (tự ước khi gian hàng chọn giờ nhận) — hai bên không tự map lệch nhau.
 */
export function toHoldWindowsPreviewDto(
  windows: HoldWindows & { tooShort: boolean },
): HoldWindowsPreviewDto {
  return {
    leadMinutes: Math.round(windows.leadMinutes),
    paymentWindowMinutes: windows.paymentWindowMinutes,
    freeCancelMinutes: windows.freeCancelMinutes,
    expiresAt: windows.expiresAt.toISOString(),
    freeCancelUntil: windows.freeCancelUntil.toISOString(),
    // CÙNG ngưỡng lượt tạo hold dùng để từ chối (`HOLD_WINDOW_TOO_SHORT`).
    tooShort: windows.tooShort,
  };
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
  const until = freeCancelUntil instanceof Date ? freeCancelUntil : new Date(freeCancelUntil);
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

/** Ba sắc thái của một đồng hồ đếm ngược — thứ tự ưu tiên khi vẽ. */
export type CountdownState = 'normal' | 'urgent' | 'expired';

/** Sắc thái của đồng hồ theo thời gian còn lại. Hết giờ thắng mọi ngưỡng khác. */
export function countdownState(remainingMs: number, urgentMs: number): CountdownState {
  if (remainingMs <= 0) return 'expired';
  return remainingMs <= urgentMs ? 'urgent' : 'normal';
}

/** `m:ss` — không đưa giờ vào vì mọi cửa sổ dùng đồng hồ này đều không quá 60 phút mỗi chặng. */
export function clockText(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Chia thời gian còn lại thành CHẶNG — ADR 0032 điều 2 ("hai countdown 60 phút").
 *
 * Vì sao chia: một cửa sổ dài và một con số "còn 118 phút" không tạo được cảm giác cần hành
 * động. Chia thành chặng cho người dùng một đồng hồ họ đọc được ngay, và mốc giao giữa hai chặng
 * đúng là lúc worker bắn nhắc — hai kênh nói cùng một điều.
 *
 * `index` đếm từ 1 và là chặng ĐANG chạy; `total` là số chặng của cả cửa sổ.
 *
 * Ở đây (`packages/types`) chứ không ở component của một app, vì đây là LUẬT trình bày cửa sổ
 * tiền — web và app native phải chia chặng giống hệt nhau, nếu không hai client nói hai con số
 * khác nhau về cùng một khoản.
 */
export function countdownSegment(
  remainingMs: number,
  segmentMs: number,
): { index: number; total: number; remainingInSegment: number } {
  if (segmentMs <= 0 || remainingMs <= 0) {
    return { index: 1, total: 1, remainingInSegment: Math.max(0, remainingMs) };
  }
  const rest = remainingMs % segmentMs;
  return {
    index: Math.ceil(remainingMs / segmentMs),
    total: Math.ceil(remainingMs / segmentMs),
    remainingInSegment: rest === 0 ? segmentMs : rest,
  };
}

/**
 * Kết quả XEM TRƯỚC một lượt khách tự huỷ (`GET /trips/:id/cancel-preview` — ADR 0064). Server tính
 * bằng đúng luật kết cục + phép chia mà lượt huỷ thật dùng; client chỉ chọn câu chữ theo mã này.
 */
export const CUSTOMER_CANCEL_PREVIEW_KIND = {
  /** Chưa có đồng nào qua XePrime (yêu cầu chờ duyệt, hoặc đã nhận mà chưa chuyển) — huỷ không mất gì. */
  NO_CHARGE: 'no_charge',
  /** Huỷ trong cửa sổ miễn phí, hoặc huỷ lúc chưa trả đủ — hoàn đủ số đã chuyển vào ví điểm. */
  FULL_REFUND: 'full_refund',
  /** Huỷ SAU mốc miễn phí — bảo hiểm hoàn đủ, `D + S + H` chia đôi chủ xe / XePrime. */
  LATE_CANCEL: 'late_cancel',
  /** Chặng này không huỷ được nữa (đã giao xe / đã khép). */
  NOT_ALLOWED: 'not_allowed',
} as const;

export type CustomerCancelPreviewKind =
  (typeof CUSTOMER_CANCEL_PREVIEW_KIND)[keyof typeof CUSTOMER_CANCEL_PREVIEW_KIND];
export const CUSTOMER_CANCEL_PREVIEW_KIND_VALUES = Object.values(
  CUSTOMER_CANCEL_PREVIEW_KIND,
) as CustomerCancelPreviewKind[];

/**
 * Chuyến có cửa sổ huỷ miễn phí không — so HAI MỐC ĐÃ LƯU (`freeCancelUntil` với mốc nhận chuyến).
 * Đặt gấp (ΔT < `HOLD_DYNAMIC_WINDOW.URGENT_LEAD_HOURS`) cho `freeCancelMinutes = 0` nên
 * `freeCancelUntil = acceptedAt`: mọi lượt huỷ sau khi trả đều là huỷ muộn.
 */
export function hasFreeCancelWindow(
  freeCancelUntil: Date | string,
  acceptedAt: Date | string,
): boolean {
  return new Date(freeCancelUntil).getTime() > new Date(acceptedAt).getTime();
}

/**
 * Nhịp hỏi lại chi tiết chuyến khi khoản giữ chỗ còn CHỜ TIỀN — LƯỚI AN TOÀN của web và app
 * (PR #183). Đường chính là thông báo `hold_paid` (push / bản chiếu huy hiệu làm mới `trips.all`).
 *  - Nghe được bản chiếu realtime: hai phút — chỉ bắt ca worker chết hoặc bản chiếu lệch.
 *  - Không nghe được: hai mươi giây — độ trễ tối đa giữa "ngân hàng báo về" và "màn đổi".
 */
export const HOLD_POLL_LIVE_MS = 120_000;
export const HOLD_POLL_FALLBACK_MS = 20_000;
