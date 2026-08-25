import { createPrismaClient } from '@xeprime/prisma';
import { databaseNameOf, resolveTestDatabaseUrl } from './test-database-url';

/**
 * Cổng vào của bộ test API — chạy MỘT lần trước cả run (`globalSetup` trong jest.config.js).
 *
 * ## Vì sao cần
 *
 * 51/58 spec ở đây tự bọc mình bằng `let dbAvailable = false` + `catch { return }`: không kết
 * nối được PostgreSQL thì chúng **bỏ qua trong im lặng và báo XANH**. Trên máy dev đó là DX tốt
 * (không ai bị chặn vì quên `pnpm db:up`). Trên CI thì đó là nói dối — một run xanh không chứng
 * minh được gì, và mọi luật quan trọng nhất của hệ thống (`EXCLUDE USING gist` của ADR 0006,
 * unique chống ghi kép phiếu thu, composite FK sở hữu) đều chỉ sống trong những spec đó.
 *
 * ## Hợp đồng
 *
 * - `REQUIRE_DB=1` (CI đặt): không kết nối được → **ném lỗi, cả run đỏ**. Guard `dbAvailable`
 *   trong 51 spec trở thành nhánh chết — không phải sửa file nào trong số đó.
 * - Không đặt (mặc định, máy dev): giữ nguyên hành vi cũ — cảnh báo rồi để spec tự skip.
 *
 * Đặt cổng ở đây thay vì trong `setup-test-db.ts` vì file đó chạy trong TỪNG worker: cùng một
 * sự cố sẽ in ra nhiều bản và không dừng được run.
 */
export default async function globalSetup(): Promise<void> {
  const required = process.env.REQUIRE_DB === '1';
  const choice = resolveTestDatabaseUrl();

  // Trên CI không có database dev để mượn, và mượn `DATABASE_URL` của môi trường dùng chung là
  // cách nhanh nhất để một run test xoá dữ liệu của thứ khác.
  if (required && !choice.dedicated) {
    throw new Error(
      'REQUIRE_DB=1 nhưng TEST_DATABASE_URL chưa đặt — test sẽ ghi vào DATABASE_URL. ' +
        'Đặt TEST_DATABASE_URL trỏ tới một database riêng cho test.',
    );
  }

  if (!choice.url) {
    if (required)
      throw new Error('REQUIRE_DB=1 nhưng không có DATABASE_URL lẫn TEST_DATABASE_URL.');
    return;
  }

  // Truyền URL tường minh: `globalSetup` chạy trước `setupFiles`, nên `DATABASE_URL` chưa được
  // `setup-test-db.ts` chốt lại, và thay đổi `process.env` ở đây không chắc tới được worker.
  const prisma = createPrismaClient(choice.url);
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    const name = databaseNameOf(choice.url);
    // Lỗi kết nối của Prisma hay có `message` RỖNG (chi tiết nằm ở `code`/`name`) — in thẳng nó ra
    // thì người đọc log CI chỉ thấy "Nguyên nhân:" cụt, đúng lúc họ cần biết vì sao nhất.
    const cause =
      (error instanceof Error && (error.message.trim() || error.name)) ||
      String(error) ||
      'không rõ';
    if (required) {
      throw new Error(
        `Không kết nối được PostgreSQL ("${name}") mà REQUIRE_DB=1. ` +
          'Bộ test API chạy trên database THẬT — không có nó thì run này không kiểm chứng được gì. ' +
          `Nguyên nhân: ${cause}`,
      );
    }
    console.warn(
      `\n[test] Không kết nối được PostgreSQL ("${name}") — các spec cần DB sẽ tự bỏ qua.\n` +
        '[test] Chạy `pnpm db:up` trước, hoặc đặt REQUIRE_DB=1 để thiếu DB là lỗi.\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}
