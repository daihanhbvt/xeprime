/** Đọc env cho worker (được nạp qua dotenv-cli ở dev; production set qua process manager). */
export const FIRESTORE_ENABLED = (process.env.FIRESTORE_ENABLED ?? '').toLowerCase() === 'true';

/** Số tin gần nhất giữ lại trên Firestore mỗi hội thoại (retention). Postgres vẫn giữ đủ. */
export const CHAT_FIRESTORE_KEEP = parsePositiveInt(process.env.CHAT_FIRESTORE_KEEP, 50);

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
