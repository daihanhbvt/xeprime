import {
  CUSTOMER_DOCUMENT_TYPE_VALUES,
  TENANT_CUSTOMER_NOTE_TYPE_VALUES,
  STATUS_COLOR,
  TENANT_CUSTOMER_RELATIONSHIP,
  TENANT_CUSTOMER_RETURNING_MIN_RENTALS,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_CUSTOMER_RISK_LEVEL_VALUES,
  type StatusColor,
} from '@xeprime/types';
import { isZeroMoney } from '@/lib/money';

/**
 * Lựa chọn cho thanh lọc/sắp xếp của sổ khách.
 *
 * Bốn vị từ gate tài chính (`relationshipValues`, `sortValues`, `isAllowedRelationship`,
 * `isAllowedSort`) sống ở `@xeprime/types`, ngay cạnh `TENANT_CUSTOMER_FINANCE_*` mà chúng đọc:
 * web và app native phải lọc theo ĐÚNG một danh sách, nếu không một bên sẽ bày ra lựa chọn mà
 * backend chắc chắn trả 403.
 *
 * Chúng trả về GIÁ TRỊ, không phải `{value,label}` — nhãn là chữ hiện cho người dùng nên đi qua
 * `useDomainLabel()` (namespace `Domain`, ADR 0012).
 */
export {
  isAllowedRelationship,
  isAllowedSort,
  isPreviewableImage,
  relationshipValues,
  sortValues,
} from '@xeprime/types';

export const RISK_LEVEL_VALUES = TENANT_CUSTOMER_RISK_LEVEL_VALUES;
export const NOTE_TYPE_VALUES = TENANT_CUSTOMER_NOTE_TYPE_VALUES;
export const DOCUMENT_TYPE_VALUES = CUSTOMER_DOCUMENT_TYPE_VALUES;

export { TENANT_CUSTOMER_RELATIONSHIP, TENANT_CUSTOMER_RISK_LEVEL };

/** Nhãn trạng thái MỘT khách trên danh sách — khoá của nó trùng `TENANT_CUSTOMER_RELATIONSHIP`. */
export type CustomerStatusKey =
  | typeof TENANT_CUSTOMER_RELATIONSHIP.BLOCKED
  | typeof TENANT_CUSTOMER_RELATIONSHIP.WATCHLIST
  | typeof TENANT_CUSTOMER_RELATIONSHIP.ARCHIVED
  | typeof TENANT_CUSTOMER_RELATIONSHIP.HAS_DEBT
  | typeof TENANT_CUSTOMER_RELATIONSHIP.RETURNING
  | 'unclassified';

/**
 * Suy MỘT nhãn trạng thái theo thứ tự ưu tiên (chốt 02/11/2026): điều chặn việc phục vụ đứng
 * trước điều nhắc nhở, nhắc nhở trước tiền, tiền trước lòng trung thành. "Còn nợ" chỉ khi được xem
 * tiền — không có quyền thì không có thông tin nợ để suy.
 */
export function customerStatusOf(
  row: {
    riskLevel: string;
    archivedAt?: string | null;
    debtAmount?: string | null;
    completedRentalCount: number;
  },
  canViewFinance: boolean,
): { key: CustomerStatusKey; color: StatusColor } {
  if (row.riskLevel === TENANT_CUSTOMER_RISK_LEVEL.BLOCKED) {
    return { key: TENANT_CUSTOMER_RELATIONSHIP.BLOCKED, color: STATUS_COLOR.ACCENT };
  }
  if (row.riskLevel === TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST) {
    return { key: TENANT_CUSTOMER_RELATIONSHIP.WATCHLIST, color: STATUS_COLOR.WARNING };
  }
  if (row.archivedAt) {
    return { key: TENANT_CUSTOMER_RELATIONSHIP.ARCHIVED, color: STATUS_COLOR.SPECIAL };
  }
  if (canViewFinance && row.debtAmount && !isZeroMoney(row.debtAmount)) {
    return { key: TENANT_CUSTOMER_RELATIONSHIP.HAS_DEBT, color: STATUS_COLOR.DANGER };
  }
  if (row.completedRentalCount >= TENANT_CUSTOMER_RETURNING_MIN_RENTALS) {
    return { key: TENANT_CUSTOMER_RELATIONSHIP.RETURNING, color: STATUS_COLOR.SUCCESS };
  }
  return { key: 'unclassified', color: STATUS_COLOR.NEUTRAL };
}
