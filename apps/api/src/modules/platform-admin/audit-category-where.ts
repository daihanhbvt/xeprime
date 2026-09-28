import type { Prisma } from '@xeprime/prisma';
import {
  AUDIT_ACTION_CATEGORY,
  AUDIT_ACTION_CATEGORY_PREFIXES,
  AUDIT_ACTION_CATEGORY_VALUES,
  type AuditActionCategory,
} from '@xeprime/types';

/**
 * `auditActionCategoryOf` (khớp tiền tố ĐẦU TIÊN, hàm thuần ở `@xeprime/types`) viết thành điều
 * kiện Prisma — để lọc và ĐẾM nhật ký theo nhóm ở DB, trước phân trang.
 *
 * Một mã thuộc nhóm C khi nó khớp một tiền tố `p` của C VÀ không khớp tiền tố nào đứng TRƯỚC `p`
 * thuộc nhóm khác. Chỉ đưa vào điều kiện các tiền tố đứng trước có thể CHỒNG LẤP với `p` (một bên
 * là tiền tố của bên kia) — tiền tố rời nhau không bao giờ cùng khớp, thêm vào chỉ làm câu SQL dài.
 * Nhờ vậy điều kiện đúng với mọi thứ tự khai báo, kể cả khi ai đó lỡ đặt tiền tố chung trước tiền
 * tố cụ thể. `audit-category-where.spec.ts` đối chiếu với hàm thuần trên mọi mã hành động thật.
 */
export function auditCategoryWhere(category: AuditActionCategory): Prisma.AuditLogWhereInput {
  const all = AUDIT_ACTION_CATEGORY_PREFIXES;
  if (category === AUDIT_ACTION_CATEGORY.OTHER) {
    return { NOT: { OR: all.map(([prefix]) => ({ action: { startsWith: prefix } })) } };
  }
  const branches: Prisma.AuditLogWhereInput[] = [];
  all.forEach(([prefix, cat], index) => {
    if (cat !== category) return;
    const shadowing = all
      .slice(0, index)
      .filter(
        ([earlier, earlierCat]) =>
          earlierCat !== category && (earlier.startsWith(prefix) || prefix.startsWith(earlier)),
      )
      .map(([earlier]) => ({ action: { startsWith: earlier } }));
    branches.push(
      shadowing.length > 0
        ? { action: { startsWith: prefix }, NOT: { OR: shadowing } }
        : { action: { startsWith: prefix } },
    );
  });
  // Nhóm không có tiền tố nào ⇒ không dòng nào.
  return branches.length > 0 ? { OR: branches } : { id: { in: [] } };
}

/** Loại mọi dòng thuộc các nhóm KHÔNG nằm trong `allowed`. */
export function auditCategoriesExclusionWhere(
  allowed: readonly AuditActionCategory[],
): Prisma.AuditLogWhereInput {
  const denied = AUDIT_ACTION_CATEGORY_VALUES.filter((category) => !allowed.includes(category));
  if (denied.length === 0) return {};
  return { NOT: { OR: denied.map((category) => auditCategoryWhere(category)) } };
}
