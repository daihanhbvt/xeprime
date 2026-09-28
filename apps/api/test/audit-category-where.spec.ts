import type { Prisma } from '@xeprime/prisma';
import {
  AUDIT_ACTION_CATEGORY,
  AUDIT_ACTION_CATEGORY_PREFIXES,
  AUDIT_ACTION_CATEGORY_VALUES,
  PLATFORM_PARTNER_KIND_VALUES,
  auditActionCategoryOf,
  auditCategoriesFor,
} from '@xeprime/types';
import {
  auditCategoriesExclusionWhere,
  auditCategoryWhere,
} from '../src/modules/platform-admin/audit-category-where';

/**
 * Điều kiện Prisma lọc nhật ký theo nhóm PHẢI cho đúng cùng đáp án với hàm thuần
 * `auditActionCategoryOf` — nếu lệch, bộ lọc "Hành động" và phép loại nhóm (chi nhánh với chủ xe cá
 * nhân, tiền với người thiếu quyền) sẽ lặng lẽ để lọt hoặc giấu dòng. Không cần DB: một bộ diễn giải
 * nhỏ chạy đúng tập toán tử mà `auditCategoryWhere` sinh ra.
 */

type Where = Prisma.AuditLogWhereInput;

function matches(where: Where, row: { id: string; action: string }): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;
    if (key === 'OR') {
      if (!(value as Where[]).some((w) => matches(w, row))) return false;
    } else if (key === 'AND') {
      const list = Array.isArray(value) ? (value as Where[]) : [value as Where];
      if (!list.every((w) => matches(w, row))) return false;
    } else if (key === 'NOT') {
      const list = Array.isArray(value) ? (value as Where[]) : [value as Where];
      if (list.some((w) => matches(w, row))) return false;
    } else if (key === 'action') {
      const { startsWith } = value as { startsWith: string };
      if (!row.action.startsWith(startsWith)) return false;
    } else if (key === 'id') {
      const { in: ids } = value as { in: string[] };
      if (!ids.includes(row.id)) return false;
    } else {
      throw new Error(`Bộ diễn giải chưa hỗ trợ khoá ${key}`);
    }
  }
  return true;
}

/** Mọi tiền tố + một mã ví dụ phía sau, các ca biên, và vài mã không thuộc nhóm nào. */
const SAMPLE_ACTIONS = [
  ...AUDIT_ACTION_CATEGORY_PREFIXES.flatMap(([prefix]) => [prefix, `${prefix}update`]),
  'vehicle.document.create',
  'vehicle.maintenance.start',
  'vehicle.support.update',
  'tenant.lock',
  'tenant.unlock',
  'tenant.submit_review',
  'tax_period.closed',
  'tax_withholding.reverse',
  'booking_hold.settle',
  'booking.transition',
  'subscription_invoice.issue',
  'catalog.create',
  'platform_staff.add',
  'submit',
  '',
].map((action, index) => ({ id: `r${index}`, action }));

describe('auditCategoryWhere khớp auditActionCategoryOf', () => {
  it.each(AUDIT_ACTION_CATEGORY_VALUES)('nhóm %s', (category) => {
    const where = auditCategoryWhere(category);
    for (const row of SAMPLE_ACTIONS) {
      expect({ action: row.action, match: matches(where, row) }).toEqual({
        action: row.action,
        match: auditActionCategoryOf(row.action) === category,
      });
    }
  });

  it('mỗi mã thuộc ĐÚNG MỘT nhóm', () => {
    for (const row of SAMPLE_ACTIONS) {
      const hits = AUDIT_ACTION_CATEGORY_VALUES.filter((category) =>
        matches(auditCategoryWhere(category), row),
      );
      expect({ action: row.action, hits }).toEqual({
        action: row.action,
        hits: [auditActionCategoryOf(row.action)],
      });
    }
  });

  it('khoá/mở khoá là quyết định nền tảng, không phải sửa hồ sơ; tax_period là tiền', () => {
    expect(auditActionCategoryOf('tenant.lock')).toBe(AUDIT_ACTION_CATEGORY.PARTNER_STATUS);
    expect(auditActionCategoryOf('tenant.unlock')).toBe(AUDIT_ACTION_CATEGORY.PARTNER_STATUS);
    expect(auditActionCategoryOf('tenant.submit_review')).toBe(AUDIT_ACTION_CATEGORY.PROFILE);
    expect(auditActionCategoryOf('tax_period.closed')).toBe(AUDIT_ACTION_CATEGORY.FINANCE);
  });
});

describe('auditCategoriesExclusionWhere giữ đúng các nhóm được phép', () => {
  const cases = PLATFORM_PARTNER_KIND_VALUES.flatMap((kind) =>
    [true, false].map((canViewMoney) => ({ kind, canViewMoney })),
  );

  it.each(cases)('%o', ({ kind, canViewMoney }) => {
    const allowed = auditCategoriesFor(kind, { canViewMoney });
    const where = auditCategoriesExclusionWhere(allowed);
    for (const row of SAMPLE_ACTIONS) {
      expect({ action: row.action, kept: matches(where, row) }).toEqual({
        action: row.action,
        kept: allowed.includes(auditActionCategoryOf(row.action)),
      });
    }
  });
});
