import { PrismaClient } from '@xeprime/prisma';

/**
 * Worker skeleton — chưa chạy job nào ở Phase 0.
 *
 * Job đã biết là sẽ cần (từ thiết kế hiện tại, không phải phỏng đoán):
 *   - booking_requests quá hạn phản hồi → chuyển `expired`
 *   - archive tin nhắn Firestore cũ sang Postgres (Phase 5)
 *   - tính lại rating_aggregates (Phase 5)
 *   - cảnh báo hết hạn gói/đăng kiểm/bảo hiểm (Phase 7)
 *
 * Ràng buộc BẮT BUỘC khi implement, ghi ở đây vì đây là lúc rẻ nhất để nhớ:
 *
 * 1. **Idempotent.** Mọi job phải chạy lại được mà không nhân đôi hậu quả. Job gửi thông
 *    báo phải kiểm tra đã gửi chưa, không phải "chắc là chưa gửi".
 * 2. **Khoá chống chạy song song.** Trên 1 VPS thì hôm nay chỉ có một process, nhưng deploy
 *    kiểu rolling sẽ có hai process cùng sống vài giây. Dùng `pg_try_advisory_lock` để
 *    đúng một instance chạy một job tại một thời điểm.
 * 3. **Ghi lịch qua OccupancyService.** Job nào đụng tới lịch xe cũng không được INSERT
 *    thẳng vào `vehicle_occupancies` (ADR 0006).
 * 4. **Audit.** Job đổi dữ liệu nghiệp vụ ghi `audit_logs` với `actor_scope = 'system'`.
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.$connect();
  console.log('XePrime worker: kết nối DB xong. Chưa đăng ký job nào (Phase 0).');
  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error('Worker lỗi:', err);
  await prisma.$disconnect();
  process.exit(1);
});
