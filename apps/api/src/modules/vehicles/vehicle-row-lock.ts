import type { Prisma } from '@xeprime/prisma';

/**
 * Khoá dòng XE (`SELECT … FOR UPDATE`) cho tới hết transaction của nơi gọi.
 *
 * Hai phía phải cùng đi qua đây để lượt Phê duyệt không duyệt một chiếc xe khác với thứ nó vừa đọc
 * (ADR 0049 điều 7):
 *
 *  - **Phê duyệt** (`PlatformApprovalService.assertVehicleApprovable`) khoá xe TRƯỚC khi dựng ảnh
 *    chụp sống để so với hồ sơ gửi duyệt.
 *  - **Chủ xe sửa xe** (`VehiclesService.applyUpdate` — gồm cả thay ảnh) khoá xe TRƯỚC khi đọc bản
 *    hiện tại để quyết định trường nào còn sửa được.
 *
 * Bên thua chờ khoá rồi đọc bản ĐÃ COMMIT của bên thắng: sửa trước ⇒ lượt duyệt thấy xe đã đổi
 * (`APPROVAL_SUBJECT_CHANGED`); duyệt trước ⇒ lượt sửa thấy xe đã duyệt (`VEHICLE_FIELD_LOCKED`).
 * Không có kết cục thứ ba "xe được duyệt với biển số không ai xem".
 *
 * Thứ tự khoá toàn hệ thống: PHIẾU duyệt trước, XE sau — nơi nào cần cả hai phải theo đúng thứ tự
 * đó, nếu không hai transaction ngược chiều sẽ chờ nhau (deadlock).
 *
 * Trả `false` khi không có dòng (id sai) — nơi gọi tự quyết định lỗi của nó.
 */
export async function lockVehicleRow(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
      FROM vehicles
     WHERE id = ${id}
     FOR UPDATE`;
  return rows.length > 0;
}
