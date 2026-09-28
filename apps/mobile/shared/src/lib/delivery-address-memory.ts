import { getSecureItem, SECURE_KEY, setSecureItem } from '@/lib/secure-storage';

/**
 * Địa chỉ giao xe khách đã TỰ KHAI, nhớ lại giữa các lần đặt.
 *
 * Bản native của `apps/web/src/lib/delivery-address-memory.ts` — **cùng luật, khác kho**. Đọc bản
 * web trước khi sửa bất cứ điều kiện nào ở đây; hai bản không tự đồng bộ.
 *
 * Bài toán: khách gõ đủ tỉnh → xã/phường → số nhà cho một chuyến, rồi lần sau đặt xe khác và
 * phải gõ lại y hệt. Địa chỉ nhà của một người gần như không đổi, nên bắt họ khai lại mỗi lần là
 * bắt họ làm một việc mà hệ thống đã biết câu trả lời.
 *
 * ## Thứ tự ưu tiên (nơi gọi thực thi, module này chỉ là một mắt xích)
 *
 *   1. **Địa chỉ đã nhớ** — thắng, vì đó là địa chỉ khách TỰ gõ và xác nhận ghim.
 *   2. **Tỉnh đang lọc ở màn tìm xe** — khách đang tìm xe ở Đà Nẵng thì nhiều khả năng muốn nhận
 *      xe ở Đà Nẵng.
 *   3. **Tỉnh của chính chiếc xe** — giao tận nơi có bán kính vài chục km, nên xe ở đâu thì địa
 *      chỉ giao gần như chắc chắn ở đó.
 *
 * ## Chỉ ghi khi đã GỬI THÀNH CÔNG
 *
 * `rememberDeliveryAddress` được gọi từ đúng một chỗ: sau khi yêu cầu thuê gửi đi thành công.
 * Ghi lúc đang gõ dở sẽ đóng dấu một địa chỉ chưa hoàn chỉnh lên mọi lần đặt sau.
 *
 * Cùng hình thái với `rental-range-memory.ts`; hai thứ nhớ hai loại lựa chọn khác nhau nên tách
 * khoá riêng — xoá một cái không được kéo theo cái kia. Khác một điểm: ở đây KHÔNG có tầng
 * "lượt dùng hiện tại", vì địa chỉ nhà không phải thứ đổi theo lượt duyệt — web cũng chỉ dùng
 * một tầng `localStorage`.
 */

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

function isFresh(savedAt: string): boolean {
  const at = Date.parse(savedAt);
  if (Number.isNaN(at)) return false;
  return Date.now() - at < MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Địa chỉ giao xe lần trước. `null` = chưa có, đã quá cũ, hoặc dữ liệu hỏng.
 *
 * Bất đồng bộ vì `expo-secure-store` chỉ có API promise — nơi gọi đọc trong effect, không đọc
 * lúc render.
 */
export async function readDeliveryAddress(): Promise<RememberedDeliveryAddress | null> {
  const raw = await getSecureItem(SECURE_KEY.DELIVERY_ADDRESS);
  if (!raw) return null;
  try {
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
    // JSON hỏng (bản cũ, hoặc ghi dở lúc app bị kill) — coi như chưa nhớ gì, đừng để nó làm gãy
    // form đặt xe.
    return null;
  }
}

/**
 * Ghi lại địa chỉ vừa dùng. Thiếu tỉnh thì KHÔNG ghi — một mảnh địa chỉ không điền lại được.
 *
 * Trả `void`: nơi gọi là nhánh thành công của lượt gửi yêu cầu, và nó phải đi tiếp sang màn xác
 * nhận ngay. Ghi nhớ hỏng không được phép giữ khách lại ở màn biểu mẫu.
 */
export function rememberDeliveryAddress(address: RememberedDeliveryAddress): void {
  if (!address.provinceCode) return;
  const payload: StoredShape = { ...address, savedAt: new Date().toISOString() };
  void setSecureItem(SECURE_KEY.DELIVERY_ADDRESS, JSON.stringify(payload)).catch(() => {
    // Keystore từ chối ghi: không nhớ được là mất tiện ích, không phải mất dữ liệu — yêu cầu
    // thuê đã nằm ở server rồi.
  });
}
