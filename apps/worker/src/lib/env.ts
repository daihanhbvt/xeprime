/** Đọc env cho worker (được nạp qua dotenv-cli ở dev; production set qua process manager). */
export const FIRESTORE_ENABLED = (process.env.FIRESTORE_ENABLED ?? '').toLowerCase() === 'true';

/** Số tin gần nhất giữ lại trên Firestore mỗi hội thoại (retention). Postgres vẫn giữ đủ. */
export const CHAT_FIRESTORE_KEEP = Number(process.env.CHAT_FIRESTORE_KEEP ?? 50);

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} chưa được đặt cho worker`);
  return value;
}
