import { GOOGLE_HOLIDAY_CALENDAR_ID_DEFAULT } from '@xeprime/types';

/** Đọc env cho worker (được nạp qua dotenv-cli ở dev; production set qua process manager). */
export const FIRESTORE_ENABLED = (process.env.FIRESTORE_ENABLED ?? '').toLowerCase() === 'true';

/** Số tin gần nhất giữ lại trên Firestore mỗi hội thoại (retention). Postgres vẫn giữ đủ. */
export const CHAT_FIRESTORE_KEEP = parsePositiveInt(process.env.CHAT_FIRESTORE_KEEP, 50);

/*
 * --- Đồng bộ ngày lễ Việt Nam từ Google Calendar (26/08/2026) ---
 *
 * Key này CHỈ sống ở worker. Nó không đi qua API, không đi qua `NEXT_PUBLIC_*`, và không bao
 * giờ được ghi vào `holiday_sync_runs.error_message` — xem `redactSecrets` ở jobs/holiday-sync.
 *
 * Là key RIÊNG, không dùng lại `GOOGLE_MAPS_SERVER_KEY`: khác API được bật trên Cloud Console
 * (Calendar API vs Geocoding + Routes), khác hạn mức, và khác cả kiểu khoá — key bản đồ khoá
 * theo IP của API server, còn key này dùng từ máy chạy worker. Gộp hai cái làm một nghĩa là
 * bật thêm quyền cho một key đang được dùng ở chỗ khác.
 */
export const GOOGLE_HOLIDAY_API_KEY = process.env.GOOGLE_HOLIDAY_API_KEY?.trim() ?? '';

/**
 * Lịch nguồn. Mặc định là lịch nghỉ lễ VN CÔNG KHAI của Google — công khai nên chỉ cần API
 * key, không OAuth, không service account.
 */
export const GOOGLE_HOLIDAY_CALENDAR_ID =
  process.env.GOOGLE_HOLIDAY_CALENDAR_ID?.trim() || GOOGLE_HOLIDAY_CALENDAR_ID_DEFAULT;

/**
 * Thiếu key ⇒ tính năng VẮNG MẶT, không phải hỏng.
 *
 * Giống bộ `R2_*`, OCR và `GOOGLE_MAPS_SERVER_KEY`: worker vẫn boot, ba vòng lặp còn lại vẫn
 * chạy, `GET /holidays` vẫn trả danh sách rỗng, và lịch xe hoạt động y như trước khi có tính
 * năng này. Ngày lễ chỉ là một lớp thông tin — nó không đáng để làm chết một tiến trình đang
 * giữ hạn phản hồi yêu cầu thuê.
 */
export const HOLIDAY_SYNC_ENABLED = GOOGLE_HOLIDAY_API_KEY.length > 0;

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} chưa được đặt cho worker`);
  return value;
}

/**
 * Kiểm env NGAY lúc khởi động thay vì lúc đẩy tin đầu tiên.
 *
 * Vì sao quan trọng: worker không có endpoint để ai đó phát hiện nó hỏng. Thiếu credential
 * Firebase mà chỉ nổ ở lần push đầu thì lỗi nằm im trong log, còn tin nhắn thì lặng lẽ không
 * bao giờ lên realtime. Sai cấu hình phải làm worker CHẾT lúc boot để process manager thấy.
 */
export function assertWorkerEnv(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL chưa được đặt cho worker');
  }
  if (!FIRESTORE_ENABLED) return;
  for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
    requireEnv(key);
  }
}

/** Số nguyên dương hoặc mặc định — `CHAT_FIRESTORE_KEEP=abc` không được biến thành NaN. */
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`CHAT_FIRESTORE_KEEP phải là số nguyên dương, nhận được "${raw}"`);
  }
  return value;
}
