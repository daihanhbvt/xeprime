import type { RentalMode } from '@xeprime/domain';
import type { BookingRequestFormValues } from './booking-schema';

/**
 * BẢN NHÁP yêu cầu thuê đang chờ khách đăng nhập — bản native của `booking-draft.ts` bên web
 * (ADR 0060).
 *
 * Khách chưa đăng nhập bấm "Tiếp tục" ở bước Chuyến đi ⇒ thứ họ vừa nhập được giữ ở đây trong lúc
 * họ đăng nhập / đăng ký; màn đặt xe dựng lại từ bản nháp khi quay về.
 *
 * CHỈ trong bộ nhớ của tiến trình — không AsyncStorage, không SecureStore, không tham số điều
 * hướng: bản nháp mang địa chỉ của một người, và ADR 0060 cấm cất nó ở nơi bền. Tắt app là mất,
 * và đó là đúng ý. Một bản nháp một lúc; mở xe khác thì bản nháp của xe cũ không bao giờ dựng lại.
 */
export interface BookingDraft {
  vehicleId: string;
  values: BookingRequestFormValues;
  rentalMode: RentalMode;
  promoCode: string | null;
  /** Mốc ghi (ms) — chỉ phiên nạp SAU mốc này mới tính là "vừa đăng nhập". */
  savedAt: number;
}

let draft: BookingDraft | null = null;

export function saveBookingDraft(
  vehicleId: string,
  input: Omit<BookingDraft, 'vehicleId' | 'savedAt'>,
): BookingDraft {
  draft = { vehicleId, ...input, savedAt: Date.now() };
  return draft;
}

export function readBookingDraft(vehicleId: string): BookingDraft | null {
  return draft && draft.vehicleId === vehicleId ? draft : null;
}

export function clearBookingDraft(): void {
  draft = null;
}
