import { PROVINCE_CODES } from '@xeprime/types';
import { getSecureItem, deleteSecureItem, SECURE_KEY, setSecureItem } from '@/lib/secure-storage';

/**
 * Tỉnh SUY RA từ vị trí thiết bị — bộ nhớ đệm của một phép đo, KHÔNG phải một lựa chọn.
 *
 * Khoá riêng, cố ý không dùng chung với `province-memory.ts`. Hai thứ trả lời hai câu khác nhau và
 * có thứ tự ưu tiên khác nhau (ADR 0042 điều 6):
 *
 *   - `xp.provinceCode` = "tôi ĐÃ CHỌN tỉnh này" — do người dùng ghi, thắng mọi thứ, hạn 180 ngày;
 *   - `xp.geoProvince`  = "máy ĐOÁN tôi đang ở đây" — do app ghi, chỉ dùng khi không có lựa chọn
 *     nào, hạn ngắn.
 *
 * Gộp hai thứ vào một khoá là đúng thứ ADR 0042 cấm: một giá trị máy tự điền sẽ tự phong thành
 * "người dùng đã chọn", sống 180 ngày, và theo người dùng sang mọi ô địa chỉ trong sản phẩm —
 * kể cả khi họ đã đi tỉnh khác từ lâu.
 *
 * Hạn ngắn vì đây là một câu trả lời về VỊ TRÍ: người ta đi công tác, và một phép đo tuần trước
 * không nói được gì về hôm nay. Hết hạn thì đo lại — rẻ, vì `readDeviceCoords` đọc bộ nhớ của máy
 * trước khi bật GPS.
 *
 * `''` (Toàn quốc) là một KẾT QUẢ hợp lệ và được nhớ: nó nghĩa là "đã đo, và tỉnh đo được không có
 * xe nào trên chợ". Nhớ nó chính là thứ giữ cho app không đo lại GPS mỗi lần mở trang chủ ở một
 * tỉnh chưa có xe.
 */

/** Bao lâu thì một phép đo vị trí không còn nói lên "tôi đang ở đâu". */
const MAX_AGE_HOURS = 12;

interface StoredShape {
  /** Mã tỉnh, hoặc `''` = đã đo nhưng không quy được về một tỉnh đang có xe. */
  readonly provinceCode: string;
  /** Mốc đo — dùng để đo lại khi đã cũ. */
  readonly savedAt: string;
}

function isFresh(savedAt: string): boolean {
  const at = Date.parse(savedAt);
  return !Number.isNaN(at) && Date.now() - at < MAX_AGE_HOURS * 60 * 60 * 1000;
}

/**
 * Tỉnh đã suy ra lần gần nhất.
 *
 * `null` = chưa đo, đã quá cũ, hoặc dữ liệu hỏng ⇒ nơi gọi đo lại.
 * `''` = đã đo và kết quả là "Toàn quốc" ⇒ nơi gọi KHÔNG đo lại. Hai thứ khác nhau, đừng rút gọn
 * thành một.
 */
export async function readGeoProvince(): Promise<string | null> {
  const raw = await getSecureItem(SECURE_KEY.GEO_PROVINCE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredShape>;
    if (typeof parsed.provinceCode !== 'string' || !parsed.savedAt || !isFresh(parsed.savedAt)) {
      return null;
    }
    if (parsed.provinceCode === '') return '';
    return PROVINCE_CODES.includes(parsed.provinceCode) ? parsed.provinceCode : null;
  } catch {
    // JSON hỏng (bản cũ, hoặc ghi dở lúc app bị kill) — coi như chưa đo.
    return null;
  }
}

/** Ghi lại kết quả một phép đo. Mã không thuộc danh mục hiện hành thì ghi `''` (Toàn quốc). */
export function rememberGeoProvince(provinceCode: string): void {
  const value = PROVINCE_CODES.includes(provinceCode) ? provinceCode : '';
  const payload: StoredShape = { provinceCode: value, savedAt: new Date().toISOString() };
  void setSecureItem(SECURE_KEY.GEO_PROVINCE, JSON.stringify(payload)).catch(() => {
    // Keystore từ chối ghi: mất bộ đệm là đo lại lần sau, không phải mất dữ liệu.
  });
}

/** Quên phép đo — dùng khi người dùng TỰ chọn một tỉnh, vì từ đó lựa chọn của họ mới là câu trả lời. */
export function forgetGeoProvince(): void {
  void deleteSecureItem(SECURE_KEY.GEO_PROVINCE).catch(() => undefined);
}
