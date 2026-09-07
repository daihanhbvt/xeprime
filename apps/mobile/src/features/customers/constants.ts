import {
  CUSTOMER_DOCUMENT_TYPE_VALUES,
  TENANT_CUSTOMER_NOTE_TYPE_VALUES,
  TENANT_CUSTOMER_RISK_LEVEL_VALUES,
} from '@xeprime/types';

/**
 * Lựa chọn lọc/sắp xếp của sổ khách trên app — CÙNG vị từ với `apps/web`.
 *
 * Luật gate tài chính (`has_debt`, `total_value`, `debt` cần `finance.view`) sống ở
 * `@xeprime/types`, không chép ở đây: backend từ chối chúng bằng 403, nên hai client phải lọc
 * theo đúng một danh sách — lệch một bên là bày ra lựa chọn chắc chắn lỗi.
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

