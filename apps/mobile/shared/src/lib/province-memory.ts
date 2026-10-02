import { PROVINCE_CODES } from '@xeprime/types';
import { getSecureItem, deleteSecureItem, SECURE_KEY, setSecureItem } from '@/lib/secure-storage';

/**
 * Tỉnh/thành người dùng đã TỰ CHỌN gần nhất, nhớ lại giữa các màn.
 *
 * Bản native của `apps/web/src/lib/province-memory.ts` — **cùng luật, khác kho** (ADR 0042 điều 6).
 * Đọc bản web trước khi sửa bất cứ điều kiện nào ở đây; hai bản không tự đồng bộ.
 *
 * Bài toán: khách chọn Bắc Ninh ở màn tìm xe, mở luồng thuê, quay ra trang chủ — và mỗi lần lại
 * phải chọn lại đúng cái tỉnh đó. Tỉnh mà một người quan tâm gần như không đổi trong một phiên,
 * và thường không đổi trong nhiều tuần.
 *
 * ## Một khoá, mọi bề mặt
 *
 * Cố ý KHÔNG tách khoá theo màn. Thứ được nhớ là "tôi đang ở/quan tâm tỉnh nào", một câu trả lời
 * duy nhất cho cả thanh tìm kiếm lẫn các ô địa chỉ. Tách khoá là cách để hai bề mặt cùng hỏi một
 * câu mà nhận hai câu trả lời khác nhau.
 *
 * Khác với `delivery-address-memory`: ở đó là ĐỊA CHỈ ĐẦY ĐỦ đã xác nhận ghim của riêng luồng giao
 * xe tận nơi (số nhà + toạ độ). Ở đây chỉ là một mã tỉnh — thứ điền được vào mọi bộ chọn mà không
 * khẳng định gì về số nhà của ai.
 *
 * ## Chỉ ghi LỰA CHỌN CHỦ ĐỘNG
 *
 * `rememberProvince` chỉ được gọi từ trình xử lý thao tác của người dùng (chọn một tỉnh ở màn tìm
 * xe, đổi ô Tỉnh/thành trong form địa chỉ). Gợi ý điền sẵn KHÔNG bao giờ ghi ngược vào đây — nếu
 * có, lần mở sau không phân biệt được đâu là ý muốn của khách và đâu là con số máy tự điền, và một
 * tỉnh mặc định sẽ tự nhân bản ra khắp sản phẩm.
 *
 * ## "Toàn quốc" là một lựa chọn, không phải một khoảng trống
 *
 * Chọn Toàn quốc thì XOÁ bộ nhớ chứ không giữ tỉnh cũ. Giữ lại nghĩa là người dùng vừa nói "tôi
 * muốn xem cả nước" và màn sau vẫn điền Bắc Ninh cho họ.
 *
 * ## Form SỬA không bao giờ điền
 *
 * Nơi gọi thực thi điều này (`prefillRememberedProvince`, mặc định TẮT): ô tỉnh trống ở một form
 * sửa nghĩa là bản ghi đó có từ trước danh mục hành chính (ADR 0035 điều 7), và điền vào đó tỉnh
 * người dùng vừa tìm xe sẽ dời một địa điểm vận hành có thật sang tỉnh khác, âm thầm, chỉ vì họ
 * bấm Lưu.
 */

/** Bao lâu thì một lựa chọn cũ không còn nói lên ý định hiện tại. */
const MAX_AGE_DAYS = 180;

interface StoredShape {
  readonly provinceCode: string;
  /** Mốc ghi — dùng để bỏ lựa chọn đã quá cũ. */
  readonly savedAt: string;
}

function isFresh(savedAt: string): boolean {
  const at = Date.parse(savedAt);
  return !Number.isNaN(at) && Date.now() - at < MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Tỉnh đã nhớ. `null` = chưa có, đã quá cũ, không còn trong danh mục, hoặc dữ liệu hỏng.
 *
 * Mã được đối chiếu với danh mục HIỆN HÀNH lúc đọc: mô hình hành chính hai cấp đã sắp xếp lại một
 * lần, và điền một mã đã biến mất vào bộ chọn là dựng một lựa chọn không tồn tại.
 *
 * Bất đồng bộ vì `expo-secure-store` chỉ có API promise — nơi gọi đọc trong effect, không đọc lúc
 * render.
 */
export async function readRememberedProvince(): Promise<string | null> {
  const raw = await getSecureItem(SECURE_KEY.PROVINCE_CODE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredShape>;
    if (!parsed.provinceCode || !parsed.savedAt || !isFresh(parsed.savedAt)) return null;
    return PROVINCE_CODES.includes(parsed.provinceCode) ? parsed.provinceCode : null;
  } catch {
    // JSON hỏng (bản cũ, hoặc ghi dở lúc app bị kill) — coi như chưa nhớ gì.
    return null;
  }
}

/**
 * Ghi lại một lựa chọn CHỦ ĐỘNG. Mã rỗng ("Toàn quốc") xoá bộ nhớ — xem docblock đầu file.
 *
 * Mã không thuộc danh mục hiện hành cũng không được ghi: nhớ một thứ sẽ bị loại lúc đọc là tốn chỗ
 * cho không.
 *
 * Trả `void`: nơi gọi là một cú chạm của người dùng và nó phải đi tiếp ngay. Ghi nhớ hỏng không
 * được phép giữ họ lại.
 */
export function rememberProvince(provinceCode: string): void {
  if (!provinceCode) {
    void deleteSecureItem(SECURE_KEY.PROVINCE_CODE).catch(() => undefined);
    return;
  }
  if (!PROVINCE_CODES.includes(provinceCode)) return;

  const payload: StoredShape = { provinceCode, savedAt: new Date().toISOString() };
  void setSecureItem(SECURE_KEY.PROVINCE_CODE, JSON.stringify(payload)).catch(() => {
    // Keystore từ chối ghi: không nhớ được là mất tiện ích, không phải mất dữ liệu.
  });
}
