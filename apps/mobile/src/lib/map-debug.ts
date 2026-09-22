/**
 * Log chẩn đoán cho ảnh bản đồ tĩnh (Geoapify — ADR 0037).
 *
 * Khối bản đồ hỏng theo HAI cách khác hẳn nhau mà trên máy chúng trông gần như một (một ô xám
 * kèm một dòng chữ), nên không log thì không có cách nào phân biệt:
 *
 *   1. `url:null`   — app KHÔNG dựng nổi URL. Thiếu khoá, hoặc toạ độ không hợp lệ. Ảnh chưa
 *                     bao giờ được yêu cầu.
 *   2. `image:failed` — URL có, nhưng `expo-image` tải hỏng. Mạng, DNS, hạn mức Geoapify, hoặc
 *                     khoá bị từ chối.
 *
 * Cái đầu là lỗi CẤU HÌNH BUNDLE và sửa bằng cách khởi động lại Metro; cái sau là lỗi MẠNG hoặc
 * KHOÁ và khởi động lại bao nhiêu lần cũng vô ích. Đoán nhầm hướng là mất một buổi.
 *
 * Chỉ chạy khi `__DEV__` — bản phát hành im lặng hoàn toàn. Dùng `console.warn` chứ không
 * `console.log`: đây là chẩn đoán một thứ đang HỎNG, và lint của app chỉ cho phép warn/error.
 *
 * ## Khoá không bao giờ in ra nguyên vẹn
 *
 * `EXPO_PUBLIC_GEOAPIFY_MAP_KEY` nằm lộ thiên trong bundle nên nó không phải bí mật, nhưng log
 * đi vào logcat và vào ảnh chụp màn hình người ta dán vào chat. In ĐỘ DÀI và 4 ký tự cuối là đủ
 * để trả lời câu hỏi thật sự cần trả lời — "có đúng cái khoá tôi vừa đặt không" — mà không rải
 * thêm một bản sao của nó ra chỗ khác.
 */

const TAG = '[map]';

/** `null` → "(trống)"; ngược lại: độ dài + bốn ký tự cuối. Không bao giờ in nguyên khoá. */
export function maskKey(key: string | null | undefined): string {
  if (!key) return '(trống)';
  return `len=${key.length} …${key.slice(-4)}`;
}

/**
 * Bỏ `apiKey` khỏi URL trước khi in.
 *
 * URL bản đồ mang khoá trong query string, nên in thẳng nó là in luôn khoá — và URL là thứ người
 * ta hay chép nguyên vào issue để nhờ xem hộ.
 */
export function redactUrl(url: string): string {
  return url.replace(/([?&]apiKey=)[^&]*/i, '$1<đã ẩn>');
}

export const mapDebug = {
  /** Không dựng được URL, kèm LÝ DO — đây là dòng phân biệt "thiếu khoá" với "toạ độ hỏng". */
  urlNull(reason: 'no-key' | 'bad-point', detail: string): void {
    if (!__DEV__) return;
    console.warn(`${TAG} url:null reason=${reason} ${detail}`);
  },

  /** Dựng được URL — in bản đã ẩn khoá để đối chiếu với URL thử bằng curl. */
  urlBuilt(url: string): void {
    if (!__DEV__) return;
    console.warn(`${TAG} url:ok ${redactUrl(url)}`);
  },

  /** `expo-image` báo hỏng. Tới được đây nghĩa là URL đã đúng dạng — vấn đề ở mạng hoặc khoá. */
  imageFailed(url: string | null | undefined): void {
    if (!__DEV__) return;
    console.warn(`${TAG} image:failed ${url ? redactUrl(url) : '(không có uri)'}`);
  },
};
