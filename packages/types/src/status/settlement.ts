/**
 * Phát sinh cuối chuyến & hoàn cọc thủ công (Wave 10) —
 * `docs/design/14_SIMPLIFIED_HANDOVER_AND_RETURN.md` §4.2 + §5.
 *
 * Hai điều đóng đinh ở tầng vựng từ này:
 *
 *  - **Không có danh mục nhiên liệu.** Wave 10 bỏ hẳn mức xăng/% pin khỏi bàn giao, nên cũng
 *    không có phụ phí thiếu xăng để mà ghi. Thêm lại một khoá `fuel` ở đây là mở đường cho cả
 *    một luồng đã bị loại bỏ quay lại.
 *  - **Hoàn cọc là GHI NHẬN, không phải giao dịch.** Chủ xe chuyển tiền ngoài hệ thống rồi vào
 *    đánh dấu; XePrime không có cổng thanh toán và không được nói như thể có.
 */

import type { StatusMeta } from './meta';

/** Danh mục phát sinh được phép. Cố ý KHÔNG có nhiên liệu (§8). */
export const SURCHARGE_CATEGORY = {
  OVERTIME: 'overtime',
  CLEANING: 'cleaning',
  DAMAGE: 'damage',
  OTHER: 'other',
} as const;

export type SurchargeCategory = (typeof SURCHARGE_CATEGORY)[keyof typeof SURCHARGE_CATEGORY];
export const SURCHARGE_CATEGORY_VALUES = Object.values(SURCHARGE_CATEGORY) as SurchargeCategory[];

export const SURCHARGE_CATEGORY_META: Readonly<Record<SurchargeCategory, StatusMeta>> = {
  [SURCHARGE_CATEGORY.OVERTIME]: { label: 'Quá giờ', color: 'gold' },
  [SURCHARGE_CATEGORY.CLEANING]: { label: 'Vệ sinh', color: 'blue' },
  [SURCHARGE_CATEGORY.DAMAGE]: { label: 'Hư hại / bồi thường', color: 'red' },
  [SURCHARGE_CATEGORY.OTHER]: { label: 'Khác', color: 'default' },
};

export const SURCHARGE_CATEGORY_LABEL: Readonly<Record<SurchargeCategory, string>> = {
  [SURCHARGE_CATEGORY.OVERTIME]: 'Quá giờ',
  [SURCHARGE_CATEGORY.CLEANING]: 'Vệ sinh',
  [SURCHARGE_CATEGORY.DAMAGE]: 'Hư hại / bồi thường',
  [SURCHARGE_CATEGORY.OTHER]: 'Khác',
};

/**
 * Cách chủ xe trả tiền cọc lại cho khách — NGOÀI hệ thống. Cố ý hẹp hơn `PAYMENT_METHOD`: đây
 * không phải một giao dịch trong sổ, chỉ là ghi lại "đã hoàn bằng cách nào".
 */
export const REFUND_METHOD = {
  BANK_TRANSFER: 'bank_transfer',
  CASH: 'cash',
  OTHER: 'other',
} as const;

export type RefundMethod = (typeof REFUND_METHOD)[keyof typeof REFUND_METHOD];
export const REFUND_METHOD_VALUES = Object.values(REFUND_METHOD) as RefundMethod[];

export const REFUND_METHOD_LABEL: Readonly<Record<RefundMethod, string>> = {
  [REFUND_METHOD.BANK_TRANSFER]: 'Chuyển khoản',
  [REFUND_METHOD.CASH]: 'Tiền mặt',
  [REFUND_METHOD.OTHER]: 'Khác',
};

/**
 * Trạng thái CỌC của một đơn (§6.1) — suy ra ở server từ tiền cọc ĐÃ THU và bản ghi hoàn cọc.
 *
 * `NOT_RECEIVED` khác hẳn `NONE`: đơn có yêu cầu cọc nhưng hệ thống chưa có bằng chứng đã thu
 * tiền. Gộp hai cái đó lại là cách chắc chắn nhất để đẻ ra một việc "hoàn cọc" cho khoản tiền
 * chưa bao giờ vào túi ai.
 */
export const DEPOSIT_STATUS = {
  /** Đơn không yêu cầu cọc. */
  NONE: 'none',
  /** Có yêu cầu cọc nhưng CHƯA ghi nhận đã thu — không tạo việc hoàn cọc. */
  NOT_RECEIVED: 'not_received',
  /** Đã thu cọc, chuyến đã xong, chưa hoàn lại. */
  AWAITING_REFUND: 'awaiting_refund',
  /** Đã hoàn đủ phần đề xuất. */
  REFUNDED: 'refunded',
  /** Đã hoàn nhưng ít hơn số đề xuất (chủ xe chủ động ghi số khác). */
  PARTIALLY_REFUNDED: 'partially_refunded',
} as const;

export type DepositStatus = (typeof DEPOSIT_STATUS)[keyof typeof DEPOSIT_STATUS];
export const DEPOSIT_STATUS_VALUES = Object.values(DEPOSIT_STATUS) as DepositStatus[];

export const DEPOSIT_STATUS_META: Readonly<Record<DepositStatus, StatusMeta>> = {
  [DEPOSIT_STATUS.NONE]: { label: 'Không có cọc', color: 'default' },
  [DEPOSIT_STATUS.NOT_RECEIVED]: { label: 'Chưa ghi nhận đã thu cọc', color: 'default' },
  [DEPOSIT_STATUS.AWAITING_REFUND]: { label: 'Chờ hoàn cọc', color: 'gold' },
  [DEPOSIT_STATUS.REFUNDED]: { label: 'Đã hoàn cọc', color: 'green' },
  [DEPOSIT_STATUS.PARTIALLY_REFUNDED]: { label: 'Hoàn một phần', color: 'blue' },
};

/**
 * Câu bắt buộc hiện ở mọi bề mặt hoàn cọc (§5.2). Đặt thành hằng số để không nơi nào diễn đạt
 * nhẹ đi thành "hệ thống đang chuyển khoản".
 */
export const REFUND_DISCLAIMER =
  'XePrime chỉ ghi nhận trạng thái; hệ thống không thực hiện chuyển tiền.';

/**
 * Tiền thu của một khoản thanh toán: tiền THUÊ hay tiền CỌC.
 *
 * Trước Wave 10 mọi `payments` đều là tiền thuê và không có cách nào chứng minh đã thu cọc —
 * nên `depositAmount` cấu hình trên đơn từng bị đọc nhầm thành "đã có tiền trong tay". Khoá này
 * là ranh giới đó: chỉ khoản `deposit` mới sinh ra việc hoàn cọc.
 */
export const PAYMENT_KIND = {
  RENTAL: 'rental',
  DEPOSIT: 'deposit',
} as const;

export type PaymentKind = (typeof PAYMENT_KIND)[keyof typeof PAYMENT_KIND];
export const PAYMENT_KIND_VALUES = Object.values(PAYMENT_KIND) as PaymentKind[];

export const PAYMENT_KIND_LABEL: Readonly<Record<PaymentKind, string>> = {
  [PAYMENT_KIND.RENTAL]: 'Tiền thuê',
  [PAYMENT_KIND.DEPOSIT]: 'Tiền cọc',
};

/** Tình trạng xe ghi nhận ở phần nâng cao — hai mức, không phải một thang điểm. */
export const HANDOVER_CONDITION = {
  NORMAL: 'normal',
  ATTENTION: 'attention',
} as const;

export type HandoverCondition = (typeof HANDOVER_CONDITION)[keyof typeof HANDOVER_CONDITION];
export const HANDOVER_CONDITION_VALUES = Object.values(HANDOVER_CONDITION) as HandoverCondition[];

export const HANDOVER_CONDITION_META: Readonly<Record<HandoverCondition, StatusMeta>> = {
  [HANDOVER_CONDITION.NORMAL]: { label: 'Bình thường', color: 'green' },
  [HANDOVER_CONDITION.ATTENTION]: { label: 'Có điểm cần lưu ý', color: 'gold' },
};
