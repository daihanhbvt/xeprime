/**
 * Hằng số và phép tính mốc thời gian của khoản GIỮ CHỖ — ADR 0021.
 *
 * Vì sao chúng sống ở `packages/types` chứ không ở service: api tính mốc lúc tạo hold, worker
 * dọn hold theo đúng mốc đó, web và mobile đếm ngược tới đúng nó. Bốn nơi phải nói **cùng một
 * con số** — cùng lý do `bookingRequestRespondBy` nằm ở đây.
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
 *
 * **2 giờ** từ ADR 0066 (22/10/2026, trước đó 4): đây là TRẦN của cửa sổ động
 * (`holdFreeCancelMinutes` — 20% của ΔT, 15′–trần), là mặc định khi seed chính sách phí và là
 * con số hiển thị cho khách ở trang xe. Con số thật của từng hold lấy từ chính sách phí hiện hành
 * (`FeePolicyValues.freeCancelHours`).
 */
export const HOLD_FREE_CANCEL_HOURS = 2;

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
 * Với chuyến đặt sát giờ cửa sổ bị cắt ngắn theo — đó là lý do
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

// ── Cửa sổ ĐỘNG theo khoảng cách tới giờ nhận xe — ADR 0066 (22/10/2026) ──────────────────────

/**
 * Tỷ lệ và sàn của cửa sổ động — MỘT công thức cho mọi ΔT, nhưng hai cửa sổ BẮT ĐẦU ở hai mốc khác
 * nhau (ADR 0072 ghi đè ADR 0066 điều 3 ở mốc bắt đầu của huỷ miễn phí):
 *
 * | Cửa sổ         | Bắt đầu        | ΔT                     | Độ dài                                              |
 * | -------------- | -------------- | ---------------------- | --------------------------------------------------- |
 * | Hạn thanh toán | `acceptedAt`   | `pickupAt − acceptedAt` | `clamp(round(ΔT × 30%), 15′, holdPaymentWindowMinutes)` |
 * | Huỷ miễn phí   | `paidAt` (đủ)  | `pickupAt − paidAt`     | `clamp(round(ΔT × 20%), 15′, freeCancelHours × 60)`     |
 *
 * Huỷ miễn phí chỉ có nghĩa khi đã có ĐƠN: trước khi trả đủ khách chưa mất đồng nào, và không trả
 * thì hết hạn là tự huỷ (ADR 0044 điều 3). Nên đồng hồ huỷ miễn phí chạy từ lúc tiền về đủ — không
 * còn ca "huỷ miễn phí hết trước khi khách kịp trả" của ADR 0066.
 *
 * Chuyến xa tự chạm trần (ΔT ≥ 400′ với trần 120′ cho thanh toán; ΔT ≥ 600′ với trần 2 giờ cho
 * huỷ) — không còn ngưỡng "xa/gần/gấp" rời rạc. ADR 0066 bỏ luật cũ "ΔT < 2 giờ ⇒ không có huỷ
 * miễn phí": mọi chuyến luôn có ít nhất 15′ huỷ miễn phí (vẫn bị kẹp bởi giờ nhận xe).
 *
 * Vì sao tỉ lệ với ΔT: cửa sổ cố định cho khách đặt xe nhận sau vài giờ quyền huỷ miễn phí tới
 * tận lúc nhận xe — chủ xe giữ chỗ suốt buổi rồi mất khách sát giờ mà không được đền đồng nào.
 *
 * Hai mốc vẫn đếm XUÔI từ `acceptedAt`, KẸP bởi `pickupAt`, được LƯU một lần lúc tạo hold, không
 * gia hạn — không có đường nào tính lại lúc đọc (ADR 0032 điều 5 giữ nguyên).
 *
 * Mốc thanh toán được LƯU lúc tạo hold; mốc huỷ miễn phí được LƯU một lần lúc tiền về đủ
 * (`freeCancelWindowFromPayment`). Không mốc nào được tính lại lúc đọc.
 */
export const HOLD_DYNAMIC_WINDOW = {
  /** Phần của ΔT dành cho huỷ miễn phí. */
  FREE_CANCEL_SHARE: 0.2,
  /** Phần của ΔT dành cho thanh toán. */
  PAYMENT_SHARE: 0.3,
  /**
   * Sàn của CẢ HAI cửa sổ (phút) — bằng `HOLD_MIN_USABLE_WINDOW_MINUTES`, ngưỡng lượt tạo hold
   * dùng để từ chối một cửa sổ quá ngắn. Hai con số khác nhau thì sẽ có chuyến được hứa một cửa
   * sổ mà lượt tạo hold không chấp nhận.
   */
  MIN_MINUTES: HOLD_MIN_USABLE_WINDOW_MINUTES,
} as const;

/** `ΔT` tính bằng phút, không âm — giờ nhận đã qua thì coi như 0 (đặt gấp nhất có thể). */
function leadMinutesOf(acceptedAt: Date, pickupAt: Date): number {
  return Math.max(0, (pickupAt.getTime() - acceptedAt.getTime()) / MS_PER_MINUTE);
}

/**
 * `clamp(round(ΔT × share), sàn, trần)` — khi trần (chính sách) thấp hơn sàn thì TRẦN thắng: một
 * chính sách tắt huỷ miễn phí (`freeCancelHours = 0`) phải ra 0 chứ không bị sàn nâng lên 15′.
 */
function proportionalWindowMinutes(leadMinutes: number, share: number, maxMinutes: number): number {
  const max = Math.max(0, maxMinutes);
  const proportional = Math.round(Math.max(0, leadMinutes) * share);
  return Math.min(max, Math.max(HOLD_DYNAMIC_WINDOW.MIN_MINUTES, proportional));
}

/**
 * Số phút huỷ miễn phí cho một chuyến có `ΔT = leadMinutes` — `clamp(round(ΔT × 20%), 15′,
 * maxHours × 60)` (ADR 0066). `maxHours` là trần của chính sách phí (`freeCancelHours`).
 */
export function holdFreeCancelMinutes(leadMinutes: number, maxHours: number): number {
  return proportionalWindowMinutes(
    leadMinutes,
    HOLD_DYNAMIC_WINDOW.FREE_CANCEL_SHARE,
    Math.max(0, maxHours) * 60,
  );
}

/**
 * Số phút khách có để chuyển tiền giữ chỗ cho một chuyến có `ΔT = leadMinutes` —
 * `clamp(round(ΔT × 30%), 15′, maxMinutes)` (ADR 0066). `maxMinutes` là trần của chính sách phí
 * (`holdPaymentWindowMinutes`).
 */
export function holdPaymentWindowMinutes(leadMinutes: number, maxMinutes: number): number {
  return proportionalWindowMinutes(leadMinutes, HOLD_DYNAMIC_WINDOW.PAYMENT_SHARE, maxMinutes);
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
 * Hai cửa sổ của một hold tính từ `acceptedAt` — MỘT phép tính cho mọi nơi tạo hold. SERVER tính.
 *
 * Chỉ `expiresAt` được LƯU lúc tạo hold. `freeCancelUntil` ở đây là mốc huỷ miễn phí NẾU khách trả
 * đủ ngay lúc được nhận — dùng cho bản XEM TRƯỚC (màn duyệt của gian hàng); mốc thật tính lúc tiền
 * về bằng `freeCancelWindowFromPayment` (ADR 0072).
 */
export function holdWindowsFor(input: {
  acceptedAt: Date;
  pickupAt: Date;
  /** `FeePolicyValues.freeCancelHours` — TRẦN của cửa sổ huỷ miễn phí. */
  freeCancelHours: number;
  /** `FeePolicyValues.holdPaymentWindowMinutes` — TRẦN của hạn thanh toán. */
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
 * Mốc huỷ miễn phí của một hold VỪA được trả đủ — ADR 0072. `ΔT = pickupAt − paidAt`, độ dài
 * `clamp(round(ΔT × 20%), 15′, freeCancelHours × 60)`, đếm xuôi từ `paidAt`, kẹp bởi giờ nhận xe.
 *
 * SERVER gọi đúng MỘT lần, trong lượt lật hold sang `paid`, rồi lưu vào cột — không tính lại. Cũng
 * dùng để XEM TRƯỚC (`paidAt = now`) cho khách đang ở màn thanh toán: "trả bây giờ thì được huỷ
 * miễn phí trong N phút".
 */
export function freeCancelWindowFromPayment(input: {
  paidAt: Date;
  pickupAt: Date;
  /** `FeePolicyValues.freeCancelHours` đã đóng băng trong snapshot của hold — TRẦN của cửa sổ. */
  freeCancelHours: number;
}): { leadMinutes: number; freeCancelMinutes: number; freeCancelUntil: Date } {
  const leadMinutes = leadMinutesOf(input.paidAt, input.pickupAt);
  const freeCancelMinutes = holdFreeCancelMinutes(leadMinutes, input.freeCancelHours);
  return {
    leadMinutes,
    freeCancelMinutes,
    freeCancelUntil: new Date(
      Math.min(
        input.paidAt.getTime() + freeCancelMinutes * MS_PER_MINUTE,
        input.pickupAt.getTime(),
      ),
    ),
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
 * `h:mm:ss` khi còn từ một giờ trở lên, `m:ss` khi dưới — cho đồng hồ KHÔNG chia chặng mà cửa sổ
 * có thể dài hơn 60 phút (hạn phản hồi yêu cầu tới 4 giờ — ADR 0066). `clockText` sẽ in "239:59".
 */
export function longClockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  if (hours === 0) return clockText(total * 1000);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
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
  /** Huỷ SAU mốc miễn phí — bảo hiểm hoàn đủ, chủ xe nhận trọn `D`, XePrime giữ `S + H` (ADR 0066 điều 2). */
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
 * Chuyến có cửa sổ huỷ miễn phí không — so mốc huỷ miễn phí với MỐC BẮT ĐẦU của nó.
 *
 * Mốc bắt đầu là `paid_at` (ADR 0072); hold trả trước ADR 0072 bắt đầu từ lúc nhận chuyến. Mọi hold
 * có ít nhất 15′, nên hàm này chỉ trả `false` khi chính sách phí tắt huỷ miễn phí
 * (`freeCancelHours = 0`), giờ nhận xe kẹp cửa sổ về 0, hoặc hold cũ tạo theo luật trước ADR 0066 —
 * mốc đã lưu không bao giờ được tính lại.
 */
export function hasFreeCancelWindow(
  freeCancelUntil: Date | string,
  startedAt: Date | string,
): boolean {
  return new Date(freeCancelUntil).getTime() > new Date(startedAt).getTime();
}

/**
 * Nhịp hỏi lại chi tiết chuyến khi khoản giữ chỗ còn CHỜ TIỀN — LƯỚI AN TOÀN của web và app
 * (PR #183). Đường chính là thông báo `hold_paid` (push / bản chiếu huy hiệu làm mới `trips.all`).
 *  - Nghe được bản chiếu realtime: hai phút — chỉ bắt ca worker chết hoặc bản chiếu lệch.
 *  - Không nghe được: hai mươi giây — độ trễ tối đa giữa "ngân hàng báo về" và "màn đổi".
 */
export const HOLD_POLL_LIVE_MS = 120_000;
export const HOLD_POLL_FALLBACK_MS = 20_000;
