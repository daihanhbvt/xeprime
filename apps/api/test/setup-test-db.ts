/**
 * Chọn database cho test — chạy TRƯỚC mọi spec (`setupFiles` trong jest.config.js), trong TỪNG
 * worker.
 *
 * Các spec ở đây chạy trên PostgreSQL THẬT (ADR 0006: `EXCLUDE USING gist` không mock được), và
 * `createPrismaClient()` đọc `DATABASE_URL`. Script test nạp `.env` gốc repo, nên nếu không có
 * lớp này thì test ghi thẳng vào database DEV của người đang code: một suite bị ngắt giữa chừng
 * để lại bản ghi mồ côi lẫn vào dữ liệu demo, và một `deleteMany` viết rộng tay trong spec là
 * mất dữ liệu thật.
 *
 * Cách dùng: đặt `TEST_DATABASE_URL` trong `.env` (xem `.env.example`). Không đặt thì test vẫn
 * chạy trên `DATABASE_URL` như trước — kèm CẢNH BÁO, chứ không im lặng.
 *
 * Việc "có kết nối được PostgreSQL không" KHÔNG kiểm ở đây mà ở `global-setup.ts`: kiểm ở đây
 * là kiểm lại một lần cho mỗi worker, và thông báo lỗi sẽ nhân lên thành nhiều bản.
 */
import { databaseNameOf, resolveTestDatabaseUrl } from './test-database-url';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Không chạy test với NODE_ENV=production.');
}

const choice = resolveTestDatabaseUrl();

if (choice.dedicated) {
  process.env.DATABASE_URL = choice.url;
} else {
  console.warn(
    `\n[test] TEST_DATABASE_URL chưa đặt — test sẽ ghi vào "${databaseNameOf(choice.url)}" (database dev).\n` +
      `[test] Tạo một database riêng rồi đặt TEST_DATABASE_URL trong .env để tách hẳn.\n`,
  );
}
