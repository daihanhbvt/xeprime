import type { RentalMode } from '@xeprime/domain';
import { BOOKING_DRAFT_TTL_MS } from '@xeprime/types';
import { appWallClockToIso, toAppTz, type Dayjs } from '@/lib/datetime';
import type { RequestFormValues } from './schema';

/**
 * BẢN NHÁP yêu cầu thuê đang chờ khách đăng nhập — ADR 0060.
 *
 * Gửi yêu cầu thuê cần tài khoản khách đã đăng nhập. Khách chưa đăng nhập bấm "Tiếp tục" thì
 * thứ họ vừa nhập (thời gian, dịch vụ, địa chỉ giao/đón, gói dài hạn, mã khuyến mãi) được giữ
 * ở đây trong lúc họ đăng nhập hoặc đăng ký. Đăng nhập bằng mật khẩu diễn ra NGAY TRÊN trang nên
 * hộp yêu cầu thuê vẫn còn mở; Google/Facebook thì RỜI TRANG (ADR 0019) — quay về đúng trang xe,
 * bản nháp này là thứ dựng lại hộp và đưa khách đi tiếp.
 *
 * Vì sao `sessionStorage` chứ không URL hay `localStorage`:
 *  - URL đi vào lịch sử trình duyệt, log của proxy và link chia sẻ — không được mang địa chỉ hay
 *    bất cứ gì của một người (yêu cầu sản phẩm). Lượt quay về sau OAuth vẫn là CÙNG một tab nên
 *    `sessionStorage` sống qua nó.
 *  - `localStorage` sống qua cả việc đóng trình duyệt và nằm lại cho người dùng sau trên cùng máy.
 *
 * Không chứa danh tính: họ tên/SĐT của người thuê đọc từ tài khoản, không có trong form. Không
 * chứa ô "đồng ý điều khoản": đó là lời đồng ý của MỘT người, còn người đăng nhập xong trên tab này
 * có thể là người khác — khôi phục xong ô đó luôn trống. Một bản
 * nháp cho một xe, sống {@link BOOKING_DRAFT_TTL_MS}; quá hạn là bỏ — giá và lịch trống đã có thể khác.
 * Không bao giờ được dùng để TỰ GỬI yêu cầu: khôi phục xong khách vẫn phải tự bấm "Gửi yêu cầu".
 */

const STORAGE_KEY = 'xp.bookingDraft.v1';

/** Ba trường ngày giờ của form là `Dayjs` — trên đĩa là ISO của chính giờ VN đã chọn. */
type DateField = 'pickupAt' | 'returnAt' | 'requestedPickupDate';

type StoredValues = Omit<RequestFormValues, DateField | 'acceptedTerms'> &
  Record<DateField, string | null>;

interface StoredDraft {
  vehicleId: string;
  savedAt: number;
  values: StoredValues;
  rentalMode: RentalMode;
  promoCode: string | null;
}

export interface BookingDraft {
  values: RequestFormValues;
  rentalMode: RentalMode;
  promoCode: string | null;
}

/** Bản nháp đọc lại — kèm mốc ghi, để biết một `/auth/me` trong cache là CŨ hơn hay MỚI hơn nó. */
export interface RestoredBookingDraft extends BookingDraft {
  savedAt: number;
}

/**
 * Mọi truy cập storage bọc `try`: chế độ riêng tư, site data bị chặn hay iframe khác origin làm
 * chính lời gọi `sessionStorage` NÉM. Không ghi được thì luồng vẫn chạy — chỉ mất phần khôi phục
 * sau một lần rời trang.
 */
function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
function notify(): void {
  for (const listener of listeners) listener();
}

/** Cho `useSyncExternalStore` — báo khi bản nháp được ghi/xoá trong tab này. */
export function subscribeBookingDraft(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function readStored(): StoredDraft | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft> | null;
    if (
      !parsed ||
      typeof parsed.vehicleId !== 'string' ||
      typeof parsed.savedAt !== 'number' ||
      typeof parsed.values !== 'object' ||
      parsed.values === null
    ) {
      store.removeItem(STORAGE_KEY);
      return null;
    }
    if (Date.now() - parsed.savedAt > BOOKING_DRAFT_TTL_MS) {
      store.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as StoredDraft;
  } catch {
    return null;
  }
}

function toWire(value: Dayjs | null | undefined): string | null {
  return value ? appWallClockToIso(value) : null;
}

function fromWire(value: unknown): Dayjs | null {
  if (typeof value !== 'string') return null;
  const parsed = toAppTz(value);
  return parsed.isValid() ? parsed : null;
}

/** Giữ thứ khách vừa nhập cho xe này, đè lên bản nháp cũ (của bất kỳ xe nào). */
export function saveBookingDraft(vehicleId: string, draft: BookingDraft): void {
  const store = storage();
  if (!store) return;
  const {
    pickupAt,
    returnAt,
    requestedPickupDate,
    acceptedTerms: _acceptedTerms, // không lưu — xem docblock đầu file
    ...rest
  } = draft.values;
  const stored: StoredDraft = {
    vehicleId,
    savedAt: Date.now(),
    values: {
      ...rest,
      pickupAt: toWire(pickupAt),
      returnAt: toWire(returnAt),
      requestedPickupDate: toWire(requestedPickupDate),
    },
    rentalMode: draft.rentalMode,
    promoCode: draft.promoCode,
  };
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Đầy bộ nhớ / bị chặn — xem docblock của `storage()`.
    return;
  }
  notify();
}

/** Bản nháp còn hạn của ĐÚNG xe này, hoặc `null`. Không xoá — xem `clearBookingDraft`. */
export function readBookingDraft(vehicleId: string): RestoredBookingDraft | null {
  const stored = readStored();
  if (!stored || stored.vehicleId !== vehicleId) return null;
  const { pickupAt, returnAt, requestedPickupDate, ...rest } = stored.values;
  return {
    values: {
      ...rest,
      acceptedTerms: false,
      pickupAt: fromWire(pickupAt),
      returnAt: fromWire(returnAt),
      requestedPickupDate: fromWire(requestedPickupDate),
    } as RequestFormValues,
    rentalMode: stored.rentalMode === 'hourly' ? 'hourly' : 'daily',
    promoCode: typeof stored.promoCode === 'string' ? stored.promoCode : null,
    savedAt: stored.savedAt,
  };
}

/**
 * Mốc ghi bản nháp còn hạn của xe này (ms), hoặc `null` — snapshot của `useSyncExternalStore`.
 * Trả MỐC chứ không trả có/không: nơi đọc cần so nó với `dataUpdatedAt` của `/auth/me` (một phiên
 * nạp TRƯỚC lúc ghi bản nháp là phiên đã chết, chỉ còn trong cache).
 */
export function bookingDraftSavedAt(vehicleId: string): number | null {
  const stored = readStored();
  return stored?.vehicleId === vehicleId ? stored.savedAt : null;
}

/** Snapshot phía server: không có `sessionStorage`, nên HTML dựng sẵn luôn là "không có". */
export function serverBookingDraftSavedAt(): number | null {
  return null;
}

/** Có bản nháp còn hạn cho xe này không. */
export function hasBookingDraft(vehicleId: string): boolean {
  return bookingDraftSavedAt(vehicleId) !== null;
}

/**
 * Bỏ bản nháp — khi yêu cầu đã gửi, khi khách tự đóng hộp, hoặc khi luồng đã đi tiếp sau đăng
 * nhập. Để nó nằm lại là mời hộp yêu cầu thuê tự mở lại ở lần ghé trang xe sau.
 */
export function clearBookingDraft(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
  notify();
}
