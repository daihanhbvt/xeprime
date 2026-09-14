/**
 * Địa chỉ giao xe khách đã TỰ KHAI, nhớ lại giữa các lần đặt.
 *
 * Bài toán: khách gõ đủ tỉnh → xã/phường → số nhà cho một chuyến, rồi lần sau đặt xe khác và
 * phải gõ lại y hệt. Địa chỉ nhà của một người gần như không đổi, nên bắt họ khai lại mỗi lần
 * là bắt họ làm một việc mà hệ thống đã biết câu trả lời.
 *
 * ## Thứ tự ưu tiên (nơi gọi thực thi, module này chỉ là một mắt xích)
 *
 *   1. **Địa chỉ đã nhớ** — thắng, vì đó là địa chỉ khách TỰ gõ và xác nhận ghim.
 *   2. **Tỉnh đang lọc ở trang tìm xe** — khách đang tìm xe ở Đà Nẵng thì nhiều khả năng muốn
 *      nhận xe ở Đà Nẵng.
 *   3. **Tỉnh của chính chiếc xe** — giao tận nơi có bán kính vài chục km, nên xe ở đâu thì địa
 *      chỉ giao gần như chắc chắn ở đó.
 *
 * ## Chỉ ghi khi đã GỬI THÀNH CÔNG
 *
 * `rememberDeliveryAddress` được gọi từ đúng một chỗ: sau khi yêu cầu thuê gửi đi thành công.
 * Ghi lúc đang gõ dở sẽ đóng dấu một địa chỉ chưa hoàn chỉnh lên mọi lần đặt sau.
 *
 * ## An toàn hydration
 *
 * `localStorage` không tồn tại trên server, nên đọc nó lúc render sẽ cho hai kết quả khác nhau
 * giữa HTML server dựng và lần render đầu ở client. Nơi gọi đọc trong effect (sau khi mount).
 *
 * Cùng hình thái với `rental-range-memory.ts`; hai thứ nhớ hai loại lựa chọn khác nhau nên tách
 * khoá riêng — xoá một cái không được kéo theo cái kia.
 */

const STORAGE_KEY = 'xp.deliveryAddress';

/** Bao lâu thì một địa chỉ cũ không còn đáng điền lại. */
const MAX_AGE_DAYS = 180;

export interface RememberedDeliveryAddress {
  readonly provinceCode: string;
  readonly wardCode: string;
  readonly addressLine: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly placeId: string | null;
  readonly locationSource: string | null;
}

interface StoredShape extends RememberedDeliveryAddress {
  /** Mốc ghi — dùng để bỏ những địa chỉ đã quá cũ. */
  readonly savedAt: string;
}

/**
 * Mọi truy cập storage đều bọc `try`: chế độ riêng tư, cấu hình chặn site data, hoặc iframe
 * khác origin đều làm chính lời gọi `localStorage` NÉM chứ không trả `null`. Một luồng đặt xe
 * không được gãy vì trình duyệt từ chối cho ghi nhớ một địa chỉ.
 */
function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isFresh(savedAt: string): boolean {
  const at = Date.parse(savedAt);
  if (Number.isNaN(at)) return false;
  return Date.now() - at < MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/** Địa chỉ giao xe lần trước. `null` = chưa có, đã quá cũ, hoặc dữ liệu hỏng. */
export function readDeliveryAddress(): RememberedDeliveryAddress | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredShape>;
    if (!parsed.provinceCode || !parsed.savedAt || !isFresh(parsed.savedAt)) return null;
    return {
      provinceCode: parsed.provinceCode,
      wardCode: parsed.wardCode ?? '',
      addressLine: parsed.addressLine ?? '',
      latitude: parsed.latitude ?? null,
      longitude: parsed.longitude ?? null,
      placeId: parsed.placeId ?? null,
      locationSource: parsed.locationSource ?? null,
    };
  } catch {
    // JSON hỏng (bản cũ, người dùng tự sửa) — coi như chưa nhớ gì, đừng để nó làm gãy form.
    return null;
  }
}

/** Ghi lại địa chỉ vừa dùng. Thiếu tỉnh thì KHÔNG ghi — một mảnh địa chỉ không điền lại được. */
export function rememberDeliveryAddress(address: RememberedDeliveryAddress): void {
  const store = storage();
  if (!store || !address.provinceCode) return;
  try {
    const payload: StoredShape = { ...address, savedAt: new Date().toISOString() };
    store.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Hết quota hoặc bị chặn ghi: bỏ qua. Không nhớ được là mất tiện ích, không phải mất dữ liệu.
  }
}
