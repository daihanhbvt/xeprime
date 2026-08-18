import {
  CUSTOMER_DOCUMENT_TYPE_LABEL,
  CUSTOMER_DOCUMENT_TYPE_VALUES,
  TENANT_CUSTOMER_FINANCE_RELATIONSHIPS,
  TENANT_CUSTOMER_FINANCE_SORTS,
  TENANT_CUSTOMER_NOTE_TYPE_META,
  TENANT_CUSTOMER_NOTE_TYPE_VALUES,
  TENANT_CUSTOMER_RELATIONSHIP,
  TENANT_CUSTOMER_RELATIONSHIP_LABEL,
  TENANT_CUSTOMER_RELATIONSHIP_VALUES,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_CUSTOMER_RISK_LEVEL_META,
  TENANT_CUSTOMER_RISK_LEVEL_VALUES,
  TENANT_CUSTOMER_SORT_LABEL,
  TENANT_CUSTOMER_SORT_VALUES,
  type TenantCustomerRelationship,
  type TenantCustomerSort,
} from '@xeprime/types';

/**
 * Lựa chọn cho thanh lọc/sắp xếp — sinh TỪ `@xeprime/types`, không gõ tay chuỗi nghiệp vụ
 * (CLAUDE.md mục 5). Thêm một nhóm quan hệ mới ở types là nó tự có mặt ở đây.
 */

/** Nhóm quan hệ. Bỏ các nhóm TÀI CHÍNH khi người dùng không có `finance.view` — backend từ chối
 *  chúng bằng 403, nên bày ra một lựa chọn chắc chắn lỗi là bẫy người dùng. */
export function relationshipOptions(canViewFinance: boolean) {
  return TENANT_CUSTOMER_RELATIONSHIP_VALUES.filter(
    (value) => canViewFinance || !TENANT_CUSTOMER_FINANCE_RELATIONSHIPS.includes(value),
  ).map((value) => ({ value, label: TENANT_CUSTOMER_RELATIONSHIP_LABEL[value] }));
}

export function sortOptions(canViewFinance: boolean) {
  return TENANT_CUSTOMER_SORT_VALUES.filter(
    (value) => canViewFinance || !TENANT_CUSTOMER_FINANCE_SORTS.includes(value),
  ).map((value) => ({ value, label: TENANT_CUSTOMER_SORT_LABEL[value] }));
}

/** Giá trị lọc/sắp xếp có hợp lệ với quyền hiện tại không — dùng để rơi về mặc định an toàn. */
export function isAllowedRelationship(
  value: string | undefined,
  canViewFinance: boolean,
): value is TenantCustomerRelationship {
  if (!value) return false;
  const known = (TENANT_CUSTOMER_RELATIONSHIP_VALUES as readonly string[]).includes(value);
  if (!known) return false;
  return (
    canViewFinance ||
    !TENANT_CUSTOMER_FINANCE_RELATIONSHIPS.includes(value as TenantCustomerRelationship)
  );
}

export function isAllowedSort(
  value: string | undefined,
  canViewFinance: boolean,
): value is TenantCustomerSort {
  if (!value) return false;
  const known = (TENANT_CUSTOMER_SORT_VALUES as readonly string[]).includes(value);
  if (!known) return false;
  return canViewFinance || !TENANT_CUSTOMER_FINANCE_SORTS.includes(value as TenantCustomerSort);
}

export const RISK_LEVEL_OPTIONS = TENANT_CUSTOMER_RISK_LEVEL_VALUES.map((value) => ({
  value,
  label: TENANT_CUSTOMER_RISK_LEVEL_META[value].label,
}));

export const NOTE_TYPE_OPTIONS = TENANT_CUSTOMER_NOTE_TYPE_VALUES.map((value) => ({
  value,
  label: TENANT_CUSTOMER_NOTE_TYPE_META[value].label,
}));

export const DOCUMENT_TYPE_OPTIONS = CUSTOMER_DOCUMENT_TYPE_VALUES.map((value) => ({
  value,
  label: CUSTOMER_DOCUMENT_TYPE_LABEL[value],
}));

/** Giải thích cạnh nhãn — chỉ ở những chỗ tên trường không tự nói hết ý. */
export const CUSTOMER_HINTS = {
  relationship:
    '"Khách quen" là khách đã hoàn tất từ 2 chuyến trở lên. "Đã lưu trữ" nằm ngoài mọi nhóm khác.',
  riskLevel:
    '"Cần lưu ý" chỉ nhắc người trực, không chặn gì. "Từ chối phục vụ" chặn yêu cầu và đơn MỚI ở gian hàng này; đơn đang có giữ nguyên.',
  notes: 'Ghi chú chỉ hiển thị trong gian hàng của bạn — khách không bao giờ nhìn thấy.',
  documents:
    'Tệp nằm trong kho riêng tư. Mỗi lần mở đều được ghi vào nhật ký hệ thống và cần quyền xem tệp.',
  debt: 'Còn nợ = tổng tiền đơn − đã thu, bỏ qua đơn đã huỷ.',
} as const;

export { TENANT_CUSTOMER_RELATIONSHIP, TENANT_CUSTOMER_RISK_LEVEL };
