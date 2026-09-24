import { newId, type PrismaClient } from '@xeprime/prisma';
import { VEHICLE_REVIEW_CHECK_VALUES } from '@xeprime/types';

/**
 * Đánh dấu ĐỦ năm mục kiểm tra thủ công của một phiếu duyệt xe.
 *
 * Từ 24/09/2026 phê duyệt xe bị backend chặn khi danh mục thủ công chưa đủ
 * (`APPROVAL_CHECKLIST_INCOMPLETE`). Spec nào kiểm thứ xảy ra SAU lượt duyệt (listing, hiển thị
 * trên chợ, thông báo) gọi hàm này trước `approve` — để nó đỏ vì đúng thứ nó đang kiểm, không vì
 * một cổng nằm ngoài phạm vi của nó. Cổng checklist có spec riêng
 * (`platform-vehicle-approvals.spec.ts`).
 *
 * Ghi thẳng bằng Prisma thay vì đi qua service: đây là dựng TIỀN ĐIỀU KIỆN, không phải hành vi
 * đang được kiểm.
 */
export async function passVehicleReviewChecks(
  prisma: PrismaClient,
  approvalTaskId: string,
  reviewerId: string,
): Promise<void> {
  const now = new Date();
  for (const checkKey of VEHICLE_REVIEW_CHECK_VALUES) {
    await prisma.approvalReviewCheck.upsert({
      where: { approvalTaskId_checkKey: { approvalTaskId, checkKey } },
      create: {
        id: newId(),
        approvalTaskId,
        checkKey,
        passed: true,
        updatedBy: reviewerId,
        updatedAt: now,
      },
      update: { passed: true, updatedBy: reviewerId, updatedAt: now },
    });
  }
}
