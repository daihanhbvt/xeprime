/**
 * Vị trí THÔ của trình duyệt — lớp mỏng bọc `navigator.geolocation`, không hơn.
 *
 * Bản web của `apps/mobile/shared/src/lib/device-location.ts`: chỉ đọc MỘT lần, khi người dùng bấm
 * "vị trí hiện tại". Không theo dõi liên tục, không đọc lúc mở trang — trình duyệt hiện hộp hỏi
 * quyền ngay khi gọi, và một hộp hỏi quyền không do thao tác nào gây ra là thứ người dùng bấm
 * "Chặn" theo phản xạ (sau đó site không bao giờ hỏi lại được nữa).
 *
 * ## Safari
 *
 * Mọi quyết định dưới đây là vì Safari (macOS + iOS), trình duyệt khó tính nhất với API này:
 *
 * - **Gọi ĐỒNG BỘ trong trình xử lý cú bấm.** `getCurrentPosition` được gọi ngay trong executor của
 *   Promise — chạy đồng bộ — nên nơi gọi chỉ cần gọi {@link readBrowserCoords} trực tiếp trong
 *   `onClick`, TRƯỚC mọi `await`. WebKit gắn lời hỏi quyền với thao tác của người dùng; gọi sau một
 *   vòng `await` có lúc không hiện hộp hỏi mà trả thẳng lỗi.
 * - **`timeout` dài.** WebKit tính cả thời gian hộp hỏi quyền đang mở vào `timeout` (trái spec), nên
 *   10 giây là đủ để người dùng đọc hộp hỏi xong thì lượt đo đã hết giờ.
 * - **Đo lại một lần ở độ chính xác thấp.** iOS hay trả `POSITION_UNAVAILABLE`
 *   (`kCLErrorLocationUnknown`) ở lượt đầu khi GPS chưa bắt được, và máy Mac không có GPS có thể hết
 *   giờ ở chế độ chính xác cao. Lượt hai chấp nhận vị trí Wi-Fi/bộ nhớ đệm — đủ để biết TỈNH.
 * - **Không dùng `navigator.permissions`.** Safari < 16 không có, và kể cả khi có thì trạng thái
 *   `prompt` của nó không đáng tin. Lỗi `PERMISSION_DENIED` của chính lượt đo là câu trả lời.
 * - **Cần secure context.** Trên `http://` (trừ localhost) mọi trình duyệt đều chặn hẳn — mở site
 *   dev qua IP LAN trên iPhone sẽ rơi vào nhánh `insecure`, không phải lỗi code.
 */

export const BROWSER_LOCATION_ERROR = {
  /** Trình duyệt không có Geolocation API. */
  UNSUPPORTED: 'unsupported',
  /** Trang không chạy trên HTTPS — trình duyệt chặn API. */
  INSECURE: 'insecure',
  /** Người dùng (hoặc cài đặt hệ thống) từ chối quyền vị trí. */
  DENIED: 'denied',
  /** Máy không xác định được vị trí (tắt dịch vụ định vị, không có tín hiệu). */
  UNAVAILABLE: 'unavailable',
  /** Hết giờ chờ cả hai lượt đo. */
  TIMEOUT: 'timeout',
} as const;

export type BrowserLocationErrorCode =
  (typeof BROWSER_LOCATION_ERROR)[keyof typeof BROWSER_LOCATION_ERROR];

export class BrowserLocationError extends Error {
  constructor(readonly code: BrowserLocationErrorCode) {
    super(`browser-location:${code}`);
    this.name = 'BrowserLocationError';
  }
}

export interface BrowserCoords {
  readonly latitude: number;
  readonly longitude: number;
  /** Bán kính sai số (mét) trình duyệt tự báo. */
  readonly accuracy: number;
}

/** Lượt đầu: chính xác cao, chờ đủ lâu cho cả hộp hỏi quyền của Safari. */
const PRECISE_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20_000,
  maximumAge: 30_000,
};

/** Lượt dự phòng: nhận vị trí Wi-Fi hoặc vị trí máy còn nhớ trong 5 phút. */
const COARSE_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15_000,
  maximumAge: 5 * 60_000,
};

function measure(geo: Geolocation, options: PositionOptions): Promise<BrowserCoords> {
  return new Promise((resolve, reject) => {
    geo.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(err),
      options,
    );
  });
}

function toLocationError(err: unknown): BrowserLocationError {
  // So bằng số chứ không bằng `err.PERMISSION_DENIED`: một số bản Safari cũ trả đối tượng lỗi
  // không mang các hằng số đó trên chính nó.
  const code = (err as { code?: number } | null)?.code;
  if (code === 1) return new BrowserLocationError(BROWSER_LOCATION_ERROR.DENIED);
  if (code === 3) return new BrowserLocationError(BROWSER_LOCATION_ERROR.TIMEOUT);
  return new BrowserLocationError(BROWSER_LOCATION_ERROR.UNAVAILABLE);
}

/**
 * Đo vị trí hiện tại. Gọi TRỰC TIẾP trong trình xử lý cú bấm (xem docblock đầu file).
 *
 * Luôn reject bằng {@link BrowserLocationError} — nơi gọi chỉ cần đọc `code`.
 */
export function readBrowserCoords(): Promise<BrowserCoords> {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    return Promise.reject(new BrowserLocationError(BROWSER_LOCATION_ERROR.UNSUPPORTED));
  }
  if (window.isSecureContext === false) {
    return Promise.reject(new BrowserLocationError(BROWSER_LOCATION_ERROR.INSECURE));
  }

  const geo = navigator.geolocation;
  // Lượt đầu bắt đầu NGAY, đồng bộ — đây là lời gọi gắn với cú bấm.
  return measure(geo, PRECISE_OPTIONS).catch((first: unknown) => {
    const firstError = toLocationError(first);
    // Bị từ chối thì đo lại cũng bị từ chối — và có thể làm Safari hiện hộp hỏi lần hai.
    if (firstError.code === BROWSER_LOCATION_ERROR.DENIED) throw firstError;
    return measure(geo, COARSE_OPTIONS).catch((second: unknown) => {
      throw toLocationError(second);
    });
  });
}

/**
 * iPhone/iPad — kể cả iPad ở chế độ "máy tính" (UA giả làm Macintosh nhưng có màn cảm ứng). Chỉ để
 * chọn câu hướng dẫn mở quyền vị trí cho đúng chỗ cài đặt; không quyết định gì khác.
 */
export function isAppleMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
