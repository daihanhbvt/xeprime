import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@xeprime/prisma';
import { API_ERROR_CODE, MEMBERSHIP_BRANCH_SCOPE, TENANT_ROLE } from '@xeprime/types';
import type { MemberBranchScopeDto } from './dto/member.dto';

/** Phạm vi đã được kiểm: `branchIds` rỗng ⇔ `branchScope = 'all'`. */
export interface ResolvedBranchScope {
  branchScope: string;
  branchIds: string[];
}

export const FULL_BRANCH_SCOPE: ResolvedBranchScope = {
  branchScope: MEMBERSHIP_BRANCH_SCOPE.ALL,
  branchIds: [],
};

/**
 * Đọc phạm vi chi nhánh người dùng gửi lên và trả về dạng đã kiểm — ADR 0052.
 *
 * Ba điều được chốt ở đây, một chỗ duy nhất cho cả lời mời lẫn đổi vai:
 *
 * 1. **Chủ gian hàng luôn là `all`.** Giới hạn chủ shop vào một chi nhánh là tự khoá mình khỏi
 *    chính gian hàng của mình — và không ai còn quyền mở khoá hộ.
 * 2. **`limited` phải nêu ít nhất một chi nhánh**, khớp với CHECK ở database. Phạm vi hẹp mà
 *    rỗng là một tài khoản không mở được gì, nhưng nhìn trên giao diện thì y hệt "chưa cấu hình".
 * 3. **Mọi id phải thuộc ĐÚNG gian hàng này và chưa bị xoá.** Không tin danh sách client gửi:
 *    một id của gian hàng khác lọt vào `membership_branches` sẽ thành một phạm vi xuyên tenant.
 */
export async function resolveMemberBranchScope(
  tx: Prisma.TransactionClient,
  tenantId: string,
  roleKey: string,
  dto: MemberBranchScopeDto,
  /**
   * Phạm vi của NGƯỜI THAO TÁC (`TenantContext.allowedBranchIds`). Bắt buộc, không mặc định —
   * quên nó là lỗi biên dịch, không phải một đường leo quyền im lặng. Xem `assertWithinActorScope`.
   */
  actorAllowed: readonly string[] | null,
): Promise<ResolvedBranchScope> {
  if (roleKey === TENANT_ROLE.SHOP_OWNER) return FULL_BRANCH_SCOPE;
  if (!dto.branchScope || dto.branchScope === MEMBERSHIP_BRANCH_SCOPE.ALL) {
    assertWithinActorScope(actorAllowed, FULL_BRANCH_SCOPE);
    return FULL_BRANCH_SCOPE;
  }

  const requested = [...new Set(dto.branchIds ?? [])];
  if (requested.length === 0) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Chọn ít nhất một chi nhánh khi giới hạn phạm vi',
    });
  }

  const found = await tx.tenantBranch.findMany({
    where: { tenantId, id: { in: requested }, deletedAt: null },
    select: { id: true },
  });
  if (found.length !== requested.length) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Có chi nhánh không thuộc gian hàng này hoặc đã bị xoá',
    });
  }

  const resolved = { branchScope: MEMBERSHIP_BRANCH_SCOPE.LIMITED, branchIds: found.map((b) => b.id) };
  assertWithinActorScope(actorAllowed, resolved);
  return resolved;
}

/**
 * TRẦN của việc giao quyền: không ai cấp được phạm vi rộng hơn phần của chính mình (ADR 0052).
 *
 * Thiếu trần này thì phạm vi chi nhánh chỉ là một gợi ý: một quản lý bị giới hạn ở chi nhánh A
 * mời email thứ hai của chính họ với "Tất cả chi nhánh" là có toàn gian hàng — và `PATCH
 * /members` mở đúng cái cửa đó cho một nhân viên có sẵn. Quyền `members.invite`/`.manage` trả
 * lời "anh có được giao việc cho người khác không", KHÔNG trả lời "anh giao được tới đâu".
 *
 * Dùng cho CẢ HAI phía của một thao tác:
 *  - phạm vi ĐƯỢC CẤP (lời mời mới, phạm vi mới của một thành viên);
 *  - phạm vi HIỆN CÓ của thành viên bị sửa/gỡ — một quản lý chi nhánh A không được hạ vai, thu
 *    hẹp hay gỡ một người đang phụ trách chi nhánh B. Đó là người của phần gian hàng anh ta không
 *    quản lý.
 *
 * `actorAllowed === null` (chủ shop, nhân viên `all`) ⇒ không có trần.
 */
export function assertWithinActorScope(
  actorAllowed: readonly string[] | null,
  target: ResolvedBranchScope,
): void {
  if (actorAllowed === null) return;
  const exceeds =
    target.branchScope !== MEMBERSHIP_BRANCH_SCOPE.LIMITED ||
    target.branchIds.some((id) => !actorAllowed.includes(id));
  if (!exceeds) return;
  throw new ForbiddenException({
    code: API_ERROR_CODE.BRANCH_SCOPE_EXCEEDED,
    message:
      'Bạn chỉ giao được chi nhánh trong phạm vi mình phụ trách, và không sửa được thành viên đang phụ trách chi nhánh khác.',
    details: { allowedBranchIds: actorAllowed },
  });
}

/**
 * Ghi lại danh sách chi nhánh của một membership — xoá sạch rồi chép lại.
 *
 * Xoá-rồi-chép chứ không so sánh từng dòng: bảng chỉ có khoá chính `(membership_id, branch_id)`,
 * không mang trạng thái riêng nào đáng giữ, nên một phép gán trọn vẹn đọc dễ hơn và không bao giờ
 * để sót một dòng thừa.
 */
export async function writeMembershipBranches(
  tx: Prisma.TransactionClient,
  tenantId: string,
  membershipId: string,
  branchIds: readonly string[],
): Promise<void> {
  await tx.membershipBranch.deleteMany({ where: { membershipId } });
  if (branchIds.length === 0) return;
  await tx.membershipBranch.createMany({
    data: branchIds.map((branchId) => ({ membershipId, branchId, tenantId })),
  });
}
