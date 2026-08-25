/**
 * Quy tắc CHỌN database cho test — nguồn DUY NHẤT cho hai nơi cần nó:
 * `global-setup.ts` (cổng CI, chạy một lần trước cả run) và `setup-test-db.ts` (chốt
 * `DATABASE_URL` trong TỪNG worker trước khi spec gọi `createPrismaClient()`).
 *
 * Hai bản sao của quy tắc này là một lỗi im lặng đặc biệt khó thấy: cổng CI ping một database
 * còn spec ghi vào database khác, và run vẫn xanh trong khi không có gì được kiểm chứng.
 */
export type TestDatabaseChoice = {
  url: string | undefined;
  /** Có `TEST_DATABASE_URL` riêng hay đang mượn `DATABASE_URL` của người đang code. */
  dedicated: boolean;
};

export function resolveTestDatabaseUrl(): TestDatabaseChoice {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  if (testUrl) return { url: testUrl, dedicated: true };
  return { url: process.env.DATABASE_URL?.trim(), dedicated: false };
}

/** Tên database để in ra thông báo — KHÔNG in cả URL vì nó chứa mật khẩu. */
export function databaseNameOf(url: string | undefined): string {
  if (!url) return '(chưa đặt)';
  return url.split('/').pop()?.split('?')[0] ?? url;
}
