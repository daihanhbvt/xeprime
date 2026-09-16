import {
  appWallClockToIso,
  DAY_PARAM_FORMAT,
  defaultRentalRange,
  nowInAppTz,
  toAppTz,
  type Dayjs,
  type RentalMode,
} from '@xeprime/domain';
import { getSecureItem, SECURE_KEY, setSecureItem, deleteSecureItem } from '@/lib/secure-storage';

/**
 * Khoảng thuê khách đã TỰ CHỌN, nhớ lại giữa các màn hình và giữa các lần mở app.
 *
 * Bản native của `apps/web/src/lib/rental-range-memory.ts` — **cùng luật, khác kho**. Đọc bản
 * web trước khi sửa bất cứ điều kiện nào ở đây; hai bản không tự đồng bộ.
 *
 * ## Thứ tự ưu tiên (nơi gọi thực thi, module này chỉ là một mắt xích)
 *
 *   1. **Tham số điều hướng hợp lệ** — luôn thắng, đúng vai trò URL của web: mở một xe từ kết
 *      quả tìm kiếm phải giữ nguyên khoảng khách vừa lọc, không bị lựa chọn cũ đè lên.
 *   2. **Lượt dùng hiện tại** (bộ nhớ tiến trình) — giữ nguyên không điều kiện.
 *   3. **Lần trước** (`expo-secure-store`) — chỉ khi còn TRONG CÙNG NGÀY Việt Nam. Một lựa chọn
 *      từ tuần trước không còn nói lên ý định hôm nay, và điền lại nó chỉ tạo ra một khoảng ngày
 *      khách phải nhớ xoá.
 *   4. **Gợi ý sinh ra** (`defaultRentalRange`).
 *
 * ## Vì sao hai tầng, và vì sao tầng 2 là biến module
 *
 * Web có `sessionStorage` (một lượt duyệt) và `localStorage` (lâu dài). Native không có cặp đó,
 * nhưng nó KHÔNG cần: một tiến trình app **chính là** một lượt duyệt. Biến module sống đúng bằng
 * tuổi tiến trình, nên nó là bản tương đương chính xác của `sessionStorage` chứ không phải một
 * cách làm gần đúng — app bị hệ điều hành thu hồi rồi mở lại là một lượt mới, và đúng lúc đó
 * cổng "cùng ngày" của tầng 3 bắt đầu có việc.
 *
 * ## Chỉ ghi LỰA CHỌN CHỦ ĐỘNG
 *
 * `rememberRentalRange` chỉ được gọi từ hàm xử lý khi người dùng đổi ô thời gian. Gợi ý tự sinh
 * KHÔNG bao giờ đi vào đây — nếu có, lần mở sau sẽ không phân biệt được đâu là ý muốn của khách
 * và đâu là con số máy tự điền, và mọi khách đều bị đóng dấu một khoảng ngày họ chưa hề chọn.
 *
 * ## Đọc là BẤT ĐỒNG BỘ
 *
 * `expo-secure-store` chỉ có API promise. Nơi gọi đọc trong effect hoặc trong một trình xử lý sự
 * kiện — giống hệt ràng buộc "không đọc lúc render" của bản web, chỉ khác lý do (ở đó là
 * hydration, ở đây là vì giá trị chưa có lúc render đầu).
 */

export interface RememberedRentalRange {
  readonly pickupAt: Dayjs;
  readonly returnAt: Dayjs;
  readonly mode: RentalMode;
}

interface StoredShape {
  readonly pickupAt: string;
  readonly returnAt: string;
  readonly mode: RentalMode;
  /** Mốc ghi — dùng để biết bản lưu bền còn thuộc NGÀY hôm nay hay không. */
  readonly savedAt: string;
}

/** Tầng "lượt dùng hiện tại". Bản tương đương `sessionStorage` của web — xem docblock đầu file. */
let sessionValue: StoredShape | null = null;

function parse(raw: string | null): StoredShape | null {
  if (!raw) return null;
  try {
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
    // JSON hỏng (bản cũ, hoặc ghi dở lúc app bị kill) — coi như chưa nhớ gì.
    return null;
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
export async function readRememberedRentalRange(
  now: Dayjs = nowInAppTz(),
): Promise<RememberedRentalRange | null> {
  if (sessionValue) {
    const ok = usable(sessionValue, now);
    if (ok) return ok;
    sessionValue = null;
  }

  const stored = parse(await getSecureItem(SECURE_KEY.RENTAL_RANGE));
  if (stored) {
    const ok = sameAppDay(stored.savedAt, now) ? usable(stored, now) : null;
    if (ok) return ok;
    await deleteSecureItem(SECURE_KEY.RENTAL_RANGE);
  }

  return null;
}

/**
 * Ghi lại một lựa chọn CHỦ ĐỘNG. Khoảng chưa đủ hai đầu thì không ghi gì — một nửa khoảng không
 * phải một lựa chọn, và ghi nó sẽ làm lần đọc sau trả về `null` sau khi đã xoá mất bản tốt.
 *
 * Trả `void` chứ không phải promise: nơi gọi là hàm xử lý thao tác người dùng, và ghi nhớ là
 * tiện ích — bắt ô thời gian `await` một lượt ghi Keystore chỉ làm chậm cú chạm.
 */
export function rememberRentalRange(range: {
  pickupAt: Dayjs | null;
  returnAt: Dayjs | null;
  mode: RentalMode;
}): void {
  if (!range.pickupAt || !range.returnAt) return;

  const payload: StoredShape = {
    // Lưu MỐC TUYỆT ĐỐI (ISO có `Z`), không phải mặt đồng hồ: đúng thứ tham số điều hướng và API
    // mang đi, nên đọc ra không cần đoán xem chuỗi này đang nói theo múi giờ nào.
    pickupAt: appWallClockToIso(range.pickupAt),
    returnAt: appWallClockToIso(range.returnAt),
    mode: range.mode,
    savedAt: new Date().toISOString(),
  };

  sessionValue = payload;
  void setSecureItem(SECURE_KEY.RENTAL_RANGE, JSON.stringify(payload)).catch(() => {
    // Keystore từ chối ghi (thiết bị chưa mở khoá lần nào, hết chỗ): tầng phiên ở trên đã nhận
    // giá trị rồi, nên lượt này vẫn nhớ đúng. Mất đúng phần "mở lại app ngày mai".
  });
}

/** Lựa chọn đã nhớ, hoặc gợi ý sinh ra. Đây là bước 2–4 của thứ tự ưu tiên ở docblock đầu file. */
export async function rememberedOrDefaultRentalRange(
  now: Dayjs = nowInAppTz(),
): Promise<RememberedRentalRange> {
  const remembered = await readRememberedRentalRange(now);
  if (remembered) return remembered;
  return { ...defaultRentalRange(now), mode: 'daily' };
}

/** Chỉ dành cho test — dọn tầng phiên giữa các ca. */
export function __resetRentalRangeMemory(): void {
  sessionValue = null;
}
