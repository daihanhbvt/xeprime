import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  APPROVAL_STATUS,
  missingVehicleReviewChecks,
  type VehicleReviewCheck,
} from '@xeprime/types';

/** Phiếu duyệt đã KHOÁ dòng trong transaction hiện tại — đủ cột lõi để điều phối. */
export interface LockedApprovalTask {
  id: string;
  status: string;
  tenantId: string | null;
  targetType: string;
  targetId: string;
}

/**
 * Khoá dòng phiếu duyệt (`SELECT … FOR UPDATE`) cho tới hết transaction của nơi gọi.
 *
 * MỌI thao tác GHI lên một phiếu — quyết định, đánh dấu kiểm tra, ghi chú nội bộ — đi qua đây
 * trước tiên. Đó là thứ biến ba cuộc đua có thật thành tuần tự:
 *
 *  1. **Hai người duyệt cùng quyết định.** Bản cũ đọc `status` NGOÀI transaction rồi mới ghi, nên
 *     cả hai cùng thấy `pending`, cùng ghi, và phiếu có hai dòng log + hai thông báo mâu thuẫn
 *     cho chủ xe. Giờ người thứ hai chờ khoá, đọc lại thấy phiếu đã xử lý, và nhận
 *     `APPROVAL_ALREADY_DECIDED`.
 *  2. **Bỏ đánh dấu một mục đúng lúc người khác bấm Phê duyệt.** Phê duyệt đọc danh mục SAU khi
 *     giữ khoá, nên không có khe nào để một lượt bỏ đánh dấu chen vào giữa "đọc thấy đủ" và "chốt".
 *  3. **Hai người cùng sửa ghi chú.** So mốc `internal_note_updated_at` dưới khoá là phép so sánh
 *     không còn ai đổi được giữa chừng.
 *
 * Khoá DÒNG, không phải advisory lock: thứ được bảo vệ là một hàng có thật, và khoá tự nhả khi
 * transaction kết thúc — kể cả khi nó ném lỗi.
 */
export async function lockApprovalTask(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<LockedApprovalTask | null> {
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      status: string;
      tenant_id: string | null;
      target_type: string;
      target_id: string;
    }>
  >`SELECT id, status, tenant_id, target_type, target_id
      FROM approval_tasks
     WHERE id = ${id}
     FOR UPDATE`;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    tenantId: row.tenant_id,
    targetType: row.target_type,
    targetId: row.target_id,
  };
}

/** Phiếu phải còn CHỜ — nếu không thì đã có người khác xử lý (hoặc nó đã bị huỷ). */
export function assertApprovalPending(task: LockedApprovalTask): void {
  if (task.status === APPROVAL_STATUS.PENDING) return;
  throw new ConflictException({
    code: API_ERROR_CODE.APPROVAL_ALREADY_DECIDED,
    message: 'Phiếu này đã được xử lý.',
    details: { status: task.status },
  });
}

/**
 * Cổng THẬT của nút Phê duyệt: đủ năm mục kiểm tra thủ công (`missingVehicleReviewChecks` — cùng
 * hàm mà web dùng để khoá nút). Web khoá nút chỉ là trang trí; một lời gọi API trực tiếp vẫn phải
 * bị chặn ở đây.
 *
 * Gọi SAU `lockApprovalTask` trong cùng transaction. Trả về khoá các mục đã đạt để nơi gọi ghi
 * vào audit — quyết định duyệt mang theo bằng chứng nó đã dựa trên.
 */
export async function assertVehicleChecksComplete(
  tx: Prisma.TransactionClient,
  approvalTaskId: string,
): Promise<VehicleReviewCheck[]> {
  const states = await tx.approvalReviewCheck.findMany({
    where: { approvalTaskId },
    select: { checkKey: true, passed: true },
  });
  const missing = missingVehicleReviewChecks(
    states.map((s) => ({ key: s.checkKey, passed: s.passed })),
  );
  if (missing.length > 0) {
    throw new ConflictException({
      code: API_ERROR_CODE.APPROVAL_CHECKLIST_INCOMPLETE,
      message: 'Hoàn tất kiểm tra thủ công trước khi phê duyệt.',
      details: { missing },
    });
  }
  return states.filter((s) => s.passed).map((s) => s.checkKey as VehicleReviewCheck);
}

export function approvalNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy phiếu duyệt',
  });
}

/** Lý do gửi chủ xe là BẮT BUỘC với từ chối / yêu cầu bổ sung. */
export function reasonRequired(): BadRequestException {
  return new BadRequestException({
    code: API_ERROR_CODE.VALIDATION_FAILED,
    message: 'Vui lòng nhập lý do gửi cho chủ xe',
  });
}
