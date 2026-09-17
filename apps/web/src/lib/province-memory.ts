import { PROVINCE_CODES } from '@xeprime/types';

/**
 * Tỉnh/thành người dùng đã TỰ CHỌN gần nhất, nhớ lại giữa các màn hình và qua F5.
 *
 * Bài toán: khách chọn Bắc Ninh ở thanh tìm xe, mở modal thuê, quay ra trang chủ, F5 — và mỗi
 * lần lại phải chọn lại đúng cái tỉnh đó. Tỉnh mà một người quan tâm gần như không đổi trong
 * một phiên, và thường không đổi trong nhiều tuần.
 *
 * ## Một khoá, mọi bề mặt
 *
 * Cố ý KHÔNG tách khoá theo màn hình. Thứ được nhớ là "tôi đang ở/quan tâm tỉnh nào", một câu
 * trả lời duy nhất cho cả thanh tìm kiếm lẫn các ô địa chỉ. Tách khoá là cách để hai bề mặt
 * cùng hỏi một câu mà nhận hai câu trả lời khác nhau.
 *
 * Khác với {@link module:./delivery-address-memory}: ở đó là ĐỊA CHỈ ĐẦY ĐỦ đã xác nhận ghim của
 * riêng luồng giao xe tận nơi (số nhà + toạ độ). Ở đây chỉ là một mã tỉnh — thứ điền được vào
 * mọi bộ chọn mà không khẳng định gì về số nhà của ai.
 *
 * ## Chỉ ghi LỰA CHỌN CHỦ ĐỘNG
 *
 * `rememberProvince` chỉ được gọi từ trình xử lý thao tác của người dùng (bấm một tỉnh trong bộ
 * chọn địa điểm, đổi ô Tỉnh/thành trong form địa chỉ). Gợi ý điền sẵn KHÔNG bao giờ ghi ngược
 * vào đây — nếu có, lần mở sau không phân biệt được đâu là ý muốn của khách và đâu là con số máy
 * tự điền, và một tỉnh mặc định sẽ tự nhân bản ra khắp sản phẩm.
 *
 * ## "Toàn quốc" là một lựa chọn, không phải một khoảng trống
 *
 * Chọn Toàn quốc thì XOÁ bộ nhớ chứ không giữ tỉnh cũ. Giữ lại nghĩa là người dùng vừa nói "tôi
 * muốn xem cả nước" và màn sau vẫn điền Bắc Ninh cho họ.
 *
 * ## An toàn hydration
 *
 * `localStorage` không tồn tại trên server. Không hàm nào ở đây được gọi trong lúc render lần
 * đầu — nơi gọi đọc qua `useSyncExternalStore` (xem `search-context`) hoặc trong effect. Cùng
 * hình thái với `rental-range-memory.ts`, và ba hàm `subscribe`/`snapshot` dưới đây tồn tại đúng
 * vì lý do đó.
 */

const STORAGE_KEY = 'xp.provinceCode';

/** Bao lâu thì một lựa chọn cũ không còn nói lên ý định hiện tại. */
const MAX_AGE_DAYS = 180;

interface StoredShape {
  readonly provinceCode: string;
  /** Mốc ghi — dùng để bỏ lựa chọn đã quá cũ. */
  readonly savedAt: string;
}

/**
 * Mọi truy cập storage đều bọc `try`: chế độ riêng tư, cấu hình chặn site data, hoặc iframe khác
 * origin đều làm chính lời gọi `localStorage` NÉM chứ không trả `null`. Một trang tìm xe không
 * được trắng vì trình duyệt từ chối cho ghi nhớ một mã tỉnh.
 */
function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readRaw(): string {
  try {
    return storage()?.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Lựa chọn còn dùng được, hoặc `null`.
 *
 * Mã được đối chiếu với {@link PROVINCE_CODES} chứ không tin nguyên văn: một mã của danh mục
 * TRƯỚC sắp xếp 01/07/2025 còn nằm trong `localStorage` của khách cũ sẽ điền vào bộ chọn một
 * giá trị không có trong danh sách — ô hiện ra trống trong khi bộ lọc đang mang mã đó.
 */
export function readRememberedProvince(): string | null {
  const raw = readRaw();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredShape>;
    if (!parsed.provinceCode || !parsed.savedAt) return null;
    if (!PROVINCE_CODES.includes(parsed.provinceCode)) return null;
    const at = Date.parse(parsed.savedAt);
    if (Number.isNaN(at) || Date.now() - at >= MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return null;
    return parsed.provinceCode;
  } catch {
    // JSON hỏng (bản cũ, người dùng tự sửa) — coi như chưa nhớ gì.
    return null;
  }
}

/**
 * Ghi lại một lựa chọn CHỦ ĐỘNG. Mã rỗng ("Toàn quốc") xoá bộ nhớ — xem docblock đầu file.
 * Mã không thuộc danh mục hiện hành cũng không được ghi: nhớ một thứ sẽ bị loại lúc đọc là tốn
 * chỗ cho không.
 */
export function rememberProvince(provinceCode: string): void {
  const store = storage();
  if (!store) return;
  try {
    if (!provinceCode) {
      store.removeItem(STORAGE_KEY);
      return;
    }
    if (!PROVINCE_CODES.includes(provinceCode)) return;
    const payload: StoredShape = { provinceCode, savedAt: new Date().toISOString() };
    store.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Hết quota hoặc bị chặn ghi: bỏ qua. Không nhớ được là mất tiện ích, không phải mất dữ liệu.
  }
}

let snapshotKey: string | null = null;
let snapshotValue: string | null = null;

/**
 * Ảnh chụp cho `useSyncExternalStore`.
 *
 * `getSnapshot` phải trả về CÙNG MỘT giá trị khi không có gì đổi, nếu không React kết luận store
 * vừa đổi và render lại không dừng. Giá trị ở đây là chuỗi nên so sánh tham chiếu không phải vấn
 * đề, nhưng vẫn nhớ lại nội dung thô để không parse JSON ở mỗi lần React hỏi — và nó bị hỏi rất
 * nhiều lần trong một lần render.
 */
export function rememberedProvinceSnapshot(): string | null {
  const raw = readRaw();
  if (raw === snapshotKey) return snapshotValue;
  snapshotKey = raw;
  snapshotValue = readRememberedProvince();
  return snapshotValue;
}

/**
 * Ảnh chụp phía SERVER — luôn `null`.
 *
 * Đây là lý do cả cơ chế này tồn tại: server không có `localStorage`, nên HTML nó dựng phải là
 * bản "chưa nhớ gì". React dùng đúng ảnh chụp này cho lần render đầu ở client (khớp hydration)
 * rồi đọc lại kho thật ngay sau đó.
 */
export function serverRememberedProvinceSnapshot(): null {
  return null;
}

/**
 * Trong CÙNG một tab không có nguồn nào phát tín hiệu: mọi lần ghi đều đi qua
 * {@link rememberProvince} từ chính thao tác của người dùng, và thao tác đó đã làm React render
 * lại. Tab KHÁC ghi thì `storage` bắn — nghe nó để hai tab đang mở không nói hai chuyện khác nhau.
 */
export function subscribeRememberedProvince(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}
