import {
  CUSTOMER_DOCUMENT_TYPE_VALUES,
  TENANT_CUSTOMER_NOTE_TYPE_VALUES,
  TENANT_CUSTOMER_RELATIONSHIP,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_CUSTOMER_RISK_LEVEL_VALUES,
} from '@xeprime/types';

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
