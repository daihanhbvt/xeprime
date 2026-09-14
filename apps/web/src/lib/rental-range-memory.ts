import { defaultRentalRange, type RentalMode } from '@xeprime/domain';
import { DAY_PARAM_FORMAT, appWallClockToIso, nowInAppTz, toAppTz, type Dayjs } from './datetime';

/**
 * Khoảng thuê khách đã TỰ CHỌN, nhớ lại giữa các trang.
 *
 * Bài toán: khách chọn "17:00 mai → 17:00 ngày kia" ở trang chủ, bấm Tìm xe, mở một xe, đóng
 * lại, mở xe khác từ tab mới — và phải chọn lại từ đầu. URL mang được ngữ cảnh khi người dùng đi
 * theo liên kết trong sản phẩm, nhưng không mang được khi họ mở thẳng một trang.
 *
 * ## Thứ tự ưu tiên (nơi gọi thực thi, module này chỉ là một mắt xích)
 *
 *   1. **URL hợp lệ** — luôn thắng. Một link chia sẻ phải mở ra đúng thứ người gửi nhìn thấy,
 *      không bị lựa chọn cũ của người nhận đè lên.
 *   2. **Phiên hiện tại** (`sessionStorage`) — cùng một lượt duyệt, giữ nguyên không điều kiện.
 *   3. **Lần trước** (`localStorage`) — chỉ khi còn TRONG CÙNG NGÀY Việt Nam. Một lựa chọn từ
 *      tuần trước không còn nói lên ý định hôm nay, và điền lại nó chỉ tạo ra một khoảng ngày
 *      khách phải nhớ xoá.
 *   4. **Gợi ý sinh ra** (`defaultRentalRange`).
 *
 * ## Chỉ ghi LỰA CHỌN CHỦ ĐỘNG
 *
 * `remember...` được gọi từ đúng một chỗ: hàm xử lý khi người dùng đổi ô thời gian. Gợi ý tự
 * sinh KHÔNG bao giờ đi vào đây — nếu có, lần mở sau sẽ không phân biệt được đâu là ý muốn của
 * khách và đâu là con số máy tự điền, và mọi khách đều bị đóng dấu một khoảng ngày họ chưa hề
 * chọn.
 *
 * ## An toàn hydration
 *
 * Không hàm nào ở đây được gọi trong lúc render lần đầu: `sessionStorage` không tồn tại trên
 * server, nên đọc nó lúc render sẽ cho hai kết quả khác nhau giữa HTML server dựng và lần render
 * đầu ở client. Nơi gọi đọc nó trong effect (sau khi mount) hoặc trong một trình xử lý sự kiện.
 */

const STORAGE_KEY = 'xp.rentalRange';

export interface RememberedRentalRange {
  readonly pickupAt: Dayjs;
  readonly returnAt: Dayjs;
  readonly mode: RentalMode;
}

interface StoredShape {
  readonly pickupAt: string;
  readonly returnAt: string;
  readonly mode: RentalMode;
  /** Mốc ghi — dùng để biết lựa chọn `localStorage` còn thuộc NGÀY hôm nay hay không. */
  readonly savedAt: string;
}

/**
 * Mọi truy cập storage đều bọc `try`: trình duyệt ở chế độ riêng tư, cấu hình chặn site data,
 * hoặc iframe khác origin đều làm chính lời gọi `sessionStorage` NÉM, không phải trả `null`.
 * Một trang tìm xe không được trắng vì trình duyệt từ chối cho ghi nhớ một khoảng ngày.
 */
function store(kind: 'session' | 'local'): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function readRaw(kind: 'session' | 'local'): StoredShape | null {
  const target = store(kind);
  if (!target) return null;
  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Partial<StoredShape>;
    if (typeof value.pickupAt !== 'string' || typeof value.returnAt !== 'string') return null;
    if (typeof value.savedAt !== 'string') return null;
    return {
      pickupAt: value.pickupAt,
      returnAt: value.returnAt,
      mode: value.mode === 'hourly' ? 'hourly' : 'daily',
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}

function drop(kind: 'session' | 'local'): void {
  try {
    store(kind)?.removeItem(STORAGE_KEY);
  } catch {
    // Xoá được hay không đều không đổi kết quả trả về — giá trị hỏng đã bị bỏ qua ở trên.
  }
}

/**
 * Còn dùng được không: hai mốc đọc ra được, trả sau nhận, và **giờ nhận chưa trôi qua**.
 *
 * Mốc đã qua là trường hợp thường gặp nhất chứ không phải ngoại lệ — khách chọn "hôm nay 09:00"
 * rồi quay lại vào buổi chiều. Điền lại nó là mời người ta gửi một yêu cầu chắc chắn bị từ chối.
 */
function usable(value: StoredShape, now: Dayjs): RememberedRentalRange | null {
  const pickupAt = toAppTz(value.pickupAt);
  const returnAt = toAppTz(value.returnAt);
  if (!pickupAt.isValid() || !returnAt.isValid()) return null;
  if (!returnAt.isAfter(pickupAt)) return null;
  if (!pickupAt.isAfter(now)) return null;
  return { pickupAt, returnAt, mode: value.mode };
}

function sameAppDay(savedAt: string, now: Dayjs): boolean {
  const saved = toAppTz(savedAt);
  return saved.isValid() && saved.format(DAY_PARAM_FORMAT) === now.format(DAY_PARAM_FORMAT);
}

/**
 * Lựa chọn đã lưu còn dùng được, hoặc `null`.
 *
 * Giá trị hỏng/hết hạn bị XOÁ ngay tại đây thay vì để nằm lại: nó không bao giờ dùng được nữa,
 * và giữ nó chỉ khiến mỗi lần đọc sau tốn thêm một vòng kiểm tra cho cùng một kết quả.
 */
export function readRememberedRentalRange(now: Dayjs = nowInAppTz()): RememberedRentalRange | null {
  const session = readRaw('session');
  if (session) {
    const ok = usable(session, now);
    if (ok) return ok;
    drop('session');
  }

  const local = readRaw('local');
  if (local) {
    const ok = sameAppDay(local.savedAt, now) ? usable(local, now) : null;
    if (ok) return ok;
    drop('local');
  }

  return null;
}

/**
 * Ghi lại một lựa chọn CHỦ ĐỘNG. Khoảng chưa đủ hai đầu thì không ghi gì — một nửa khoảng không
 * phải một lựa chọn, và ghi nó sẽ làm lần đọc sau trả về `null` sau khi đã xoá mất bản tốt.
 */
export function rememberRentalRange(range: {
  pickupAt: Dayjs | null;
  returnAt: Dayjs | null;
  mode: RentalMode;
}): void {
  if (!range.pickupAt || !range.returnAt) return;

  const payload: StoredShape = {
    // Lưu MỐC TUYỆT ĐỐI (ISO có `Z`), không phải mặt đồng hồ: đúng thứ URL và API mang đi, nên
    // đọc ra không cần đoán xem chuỗi này đang nói theo múi giờ nào.
    pickupAt: appWallClockToIso(range.pickupAt),
    returnAt: appWallClockToIso(range.returnAt),
    mode: range.mode,
    savedAt: new Date().toISOString(),
  };

  const raw = JSON.stringify(payload);
  for (const kind of ['session', 'local'] as const) {
    try {
      store(kind)?.setItem(STORAGE_KEY, raw);
    } catch {
      // Hết hạn mức lưu trữ hoặc bị chặn: ghi nhớ là tiện ích, không phải điều kiện để dùng sản
      // phẩm. Lần sau khách chọn lại — không có gì hỏng.
    }
  }
}

/** Lựa chọn đã nhớ, hoặc gợi ý sinh ra. Đây là bước 2–4 của thứ tự ưu tiên ở docblock đầu file. */
export function rememberedOrDefaultRentalRange(now: Dayjs = nowInAppTz()): RememberedRentalRange {
  const remembered = readRememberedRentalRange(now);
  if (remembered) return remembered;
  return { ...defaultRentalRange(now), mode: 'daily' };
}
