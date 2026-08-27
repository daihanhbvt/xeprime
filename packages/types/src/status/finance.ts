import { STATUS_COLOR, type StatusMeta } from './meta';

/**
 * Enum tài chính (Phase 6) — ADR 0005: DB lưu String, union ở đây là lớp chặn duy nhất.
 * `RECEIPT_STATUS` (draft/pending_approval/approved/cancelled) nằm ở `misc.ts`.
 */

/** Loại danh mục / phiếu: thu (income) hay chi (expense). */
export const FINANCE_CATEGORY_TYPE = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;
export type FinanceCategoryType =
  (typeof FINANCE_CATEGORY_TYPE)[keyof typeof FINANCE_CATEGORY_TYPE];
export const FINANCE_CATEGORY_TYPE_VALUES = Object.values(
  FINANCE_CATEGORY_TYPE,
) as FinanceCategoryType[];

export const FINANCE_CATEGORY_TYPE_META: Readonly<Record<FinanceCategoryType, StatusMeta>> = {
  [FINANCE_CATEGORY_TYPE.INCOME]: { label: 'Thu', color: STATUS_COLOR.SUCCESS },
  [FINANCE_CATEGORY_TYPE.EXPENSE]: { label: 'Chi', color: STATUS_COLOR.DANGER },
};

/**
 * Khoá ỔN ĐỊNH của danh mục thu/chi hệ thống (`finance_categories.system_key`).
 *
 * Phiếu sinh tự động phải rơi vào đúng danh mục, và tra danh mục bằng TÊN tiếng Việt là buộc một
 * quan hệ nghiệp vụ vào một chuỗi hiển thị — đổi một dấu cách là mọi phiếu tự động mất danh mục.
 * Tên ở đây chỉ để seed dựng lần đầu; sau đó luôn tra bằng khoá.
 */
export const SYSTEM_FINANCE_CATEGORY = {
  /** Thu tiền thuê của một đơn (`RECEIPT_SOURCE.PAYMENT`). */
  BOOKING_PAYMENT: 'booking_payment',
  /** Thu cọc (`RECEIPT_SOURCE.DEPOSIT`). */
  DEPOSIT: 'deposit',
  /** Chi hoàn cọc (`RECEIPT_SOURCE.DEPOSIT_REFUND`). */
  DEPOSIT_REFUND: 'deposit_refund',
  /** Chi bảo dưỡng thường (`RECEIPT_SOURCE.MAINTENANCE`, loại việc ≠ sửa chữa). */
  MAINTENANCE: 'maintenance',
  /** Chi sửa chữa sự cố (`RECEIPT_SOURCE.MAINTENANCE`, loại việc = sửa chữa). */
  REPAIR: 'repair',
} as const;

export type SystemFinanceCategoryKey =
  (typeof SYSTEM_FINANCE_CATEGORY)[keyof typeof SYSTEM_FINANCE_CATEGORY];
export const SYSTEM_FINANCE_CATEGORY_VALUES = Object.values(
  SYSTEM_FINANCE_CATEGORY,
) as SystemFinanceCategoryKey[];

/** Loại phiếu thu-chi — trùng giá trị với category type (thu/chi). */
export const RECEIPT_TYPE = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;
export type ReceiptType = (typeof RECEIPT_TYPE)[keyof typeof RECEIPT_TYPE];
export const RECEIPT_TYPE_VALUES = Object.values(RECEIPT_TYPE) as ReceiptType[];

export const RECEIPT_TYPE_META: Readonly<Record<ReceiptType, StatusMeta>> = {
  [RECEIPT_TYPE.INCOME]: { label: 'Phiếu thu', color: STATUS_COLOR.SUCCESS },
  [RECEIPT_TYPE.EXPENSE]: { label: 'Phiếu chi', color: STATUS_COLOR.DANGER },
};

/**
 * NGUỒN sinh ra một phiếu thu/chi — sổ phải trả lời được "đồng này từ đâu ra".
 *
 * Không suy từ `bookingId != null`: thu tiền thuê, thu cọc và hoàn cọc đều gắn đơn nhưng đảo ở ba
 * chỗ khác nhau. Cặp (`source`, `source_ref_id`) vừa nói nguồn vừa trỏ thẳng về bản ghi gốc, nên
 * khi chặn huỷ trực tiếp (§) hệ thống chỉ được đúng đường quay về.
 */
export const RECEIPT_SOURCE = {
  /** Người dùng tự nhập trên `/manage/receipts` — chỉ loại này mới duyệt/huỷ tay được. */
  MANUAL: 'manual',
  /** Thu tiền thuê của một đơn — `source_ref_id` = `payments.id`. */
  PAYMENT: 'payment',
  /** Thu cọc — `source_ref_id` = `payments.id` (payment có `kind = 'deposit'`). */
  DEPOSIT: 'deposit',
  /** Hoàn cọc — `source_ref_id` = `booking_deposit_settlements.id`. */
  DEPOSIT_REFUND: 'deposit_refund',
  /** Chi phí bảo dưỡng — `source_ref_id` = `vehicle_maintenance_records.id`. */
  MAINTENANCE: 'maintenance',
} as const;

export type ReceiptSource = (typeof RECEIPT_SOURCE)[keyof typeof RECEIPT_SOURCE];
export const RECEIPT_SOURCE_VALUES = Object.values(RECEIPT_SOURCE) as ReceiptSource[];

export const RECEIPT_SOURCE_META: Readonly<Record<ReceiptSource, StatusMeta>> = {
  [RECEIPT_SOURCE.MANUAL]: { label: 'Nhập tay', color: STATUS_COLOR.NEUTRAL },
  [RECEIPT_SOURCE.PAYMENT]: { label: 'Thu tiền đơn', color: STATUS_COLOR.INFO },
  [RECEIPT_SOURCE.DEPOSIT]: { label: 'Thu cọc', color: STATUS_COLOR.PROCESSING },
  [RECEIPT_SOURCE.DEPOSIT_REFUND]: { label: 'Hoàn cọc', color: STATUS_COLOR.WARNING },
  [RECEIPT_SOURCE.MAINTENANCE]: { label: 'Bảo dưỡng', color: STATUS_COLOR.SPECIAL },
};

/**
 * Phiếu tự động: sinh từ nghiệp vụ, đã duyệt sẵn, và KHÔNG huỷ trực tiếp được.
 *
 * Huỷ thẳng phiếu thu của một lần thu tiền sẽ làm sổ báo ít hơn thực tế trong khi đơn vẫn ghi đã
 * thu — hai con số cho cùng một đồng. Đảo phải đi qua chính nghiệp vụ đã sinh ra nó.
 */
export function isAutoReceipt(source: string): boolean {
  return source !== RECEIPT_SOURCE.MANUAL;
}

/**
 * Nguồn phiếu ứng với TIỀN GIỮ HỘ, không phải doanh thu hay chi phí của gian hàng.
 *
 * Cọc vào rồi cọc ra là cùng một khoản tiền đi qua tay chủ xe — nó nằm trong sổ (vì tiền có di
 * chuyển thật) nhưng KHÔNG được cộng vào "Doanh thu"/"Chi phí" của một chiếc xe hay của kỳ báo
 * cáo. Gộp vào thì doanh thu phình đúng bằng số cọc đang cầm, và "lãi thực theo xe" sai.
 */
export const HELD_FUNDS_RECEIPT_SOURCES: readonly ReceiptSource[] = [
  RECEIPT_SOURCE.DEPOSIT,
  RECEIPT_SOURCE.DEPOSIT_REFUND,
];

export function isHeldFundsSource(source: string): boolean {
  return HELD_FUNDS_RECEIPT_SOURCES.includes(source as ReceiptSource);
}

/**
 * NHÓM nguồn phiếu — bộ lọc để một danh sách phiếu cộng ra ĐÚNG con số của một thẻ tổng.
 *
 * `HELD_FUNDS_RECEIPT_SOURCES` nói được "khoản này có phải tiền giữ hộ không", nhưng bộ lọc của
 * `/receipts` chỉ nhận MỘT `source`. Không có nhóm này thì bấm vào thẻ "Doanh thu" sẽ mở ra một
 * sổ cộng cả tiền cọc — thẻ nói một số, danh sách sinh ra nó nói số khác, và người dùng thôi tin
 * cả hai.
 */
export const RECEIPT_SOURCE_GROUP = {
  /** Tiền THẬT của gian hàng: doanh thu và chi phí. Loại `deposit`/`deposit_refund`. */
  BUSINESS: 'business',
  /** Chỉ tiền giữ hộ — thu cọc và hoàn cọc. Dùng cho thẻ "Cọc đang giữ". */
  HELD_FUNDS: 'held_funds',
} as const;

export type ReceiptSourceGroup = (typeof RECEIPT_SOURCE_GROUP)[keyof typeof RECEIPT_SOURCE_GROUP];
export const RECEIPT_SOURCE_GROUP_VALUES = Object.values(
  RECEIPT_SOURCE_GROUP,
) as ReceiptSourceGroup[];

/**
 * Độ mịn của biểu đồ thu-chi theo thời gian.
 *
 * SERVER là bên chốt giá trị cuối: một kỳ 400 ngày vẽ theo `day` là 400 cột không đọc được và
 * một câu truy vấn vô ích, nên server tự nâng bậc rồi TRẢ LẠI giá trị đã dùng. Client hiển thị
 * đúng thứ server trả, không tự suy.
 */
export const FINANCE_GRANULARITY = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
} as const;

export type FinanceGranularity = (typeof FINANCE_GRANULARITY)[keyof typeof FINANCE_GRANULARITY];
export const FINANCE_GRANULARITY_VALUES = Object.values(
  FINANCE_GRANULARITY,
) as FinanceGranularity[];

/** Trần số cột của một biểu đồ — quá ngưỡng thì server nâng bậc độ mịn. */
export const FINANCE_MAX_BUCKETS = 92;

/** Cách sắp xếp bảng "Hiệu quả theo xe" — luôn giảm dần (câu hỏi là "xe nào nhất"). */
export const VEHICLE_PROFIT_SORT = {
  PROFIT: 'profit',
  REVENUE: 'revenue',
  COST: 'cost',
  TRIPS: 'trips',
} as const;

export type VehicleProfitSort = (typeof VEHICLE_PROFIT_SORT)[keyof typeof VEHICLE_PROFIT_SORT];
export const VEHICLE_PROFIT_SORT_VALUES = Object.values(
  VEHICLE_PROFIT_SORT,
) as VehicleProfitSort[];
export const DEFAULT_VEHICLE_PROFIT_SORT: VehicleProfitSort = VEHICLE_PROFIT_SORT.PROFIT;
/**
 * Cách sắp xếp bảng "Doanh thu theo khách" — luôn giảm dần (câu hỏi là "khách nào nhất").
 *
 * Cố ý KHÔNG có "còn nợ": công nợ là con số TẠI THỜI ĐIỂM NÀY, còn bảng này là của một KỲ. Trộn
 * hai đơn vị thời gian vào cùng một bảng là mời người đọc so hai thứ không so được — ai muốn hỏi
 * "ai đang nợ tôi" thì `/manage/debts` mới là chỗ trả lời.
 */
export const CUSTOMER_REVENUE_SORT = {
  REVENUE: 'revenue',
  TRIPS: 'trips',
} as const;

export type CustomerRevenueSort =
  (typeof CUSTOMER_REVENUE_SORT)[keyof typeof CUSTOMER_REVENUE_SORT];
export const CUSTOMER_REVENUE_SORT_VALUES = Object.values(
  CUSTOMER_REVENUE_SORT,
) as CustomerRevenueSort[];
export const DEFAULT_CUSTOMER_REVENUE_SORT: CustomerRevenueSort = CUSTOMER_REVENUE_SORT.REVENUE;

/** Hình thức thanh toán. */
export const PAYMENT_METHOD = {
  CASH: 'cash',
  BANK_TRANSFER: 'bank_transfer',
  QR: 'qr',
  CARD: 'card',
  OTHER: 'other',
} as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];
export const PAYMENT_METHOD_VALUES = Object.values(PAYMENT_METHOD) as PaymentMethod[];

export const PAYMENT_METHOD_META: Readonly<Record<PaymentMethod, StatusMeta>> = {
  [PAYMENT_METHOD.CASH]: { label: 'Tiền mặt', color: STATUS_COLOR.SUCCESS },
  [PAYMENT_METHOD.BANK_TRANSFER]: { label: 'Chuyển khoản', color: STATUS_COLOR.INFO },
  [PAYMENT_METHOD.QR]: { label: 'QR', color: STATUS_COLOR.PROCESSING },
  [PAYMENT_METHOD.CARD]: { label: 'Thẻ', color: STATUS_COLOR.SPECIAL },
  [PAYMENT_METHOD.OTHER]: { label: 'Khác', color: STATUS_COLOR.NEUTRAL },
};

/** Trạng thái giao dịch thanh toán. */
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
export const PAYMENT_STATUS_VALUES = Object.values(PAYMENT_STATUS) as PaymentStatus[];

export const PAYMENT_STATUS_META: Readonly<Record<PaymentStatus, StatusMeta>> = {
  [PAYMENT_STATUS.PENDING]: { label: 'Đang xử lý', color: STATUS_COLOR.WAITING },
  [PAYMENT_STATUS.SUCCEEDED]: { label: 'Thành công', color: STATUS_COLOR.SUCCESS },
  [PAYMENT_STATUS.FAILED]: { label: 'Thất bại', color: STATUS_COLOR.DANGER },
  [PAYMENT_STATUS.REFUNDED]: { label: 'Đã hoàn', color: STATUS_COLOR.SUCCESS },
};

/** Trạng thái hợp đồng thuê. */
export const CONTRACT_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  SIGNED: 'signed',
  VOID: 'void',
} as const;
export type ContractStatus = (typeof CONTRACT_STATUS)[keyof typeof CONTRACT_STATUS];
export const CONTRACT_STATUS_VALUES = Object.values(CONTRACT_STATUS) as ContractStatus[];

export const CONTRACT_STATUS_META: Readonly<Record<ContractStatus, StatusMeta>> = {
  [CONTRACT_STATUS.DRAFT]: { label: 'Nháp', color: STATUS_COLOR.NEUTRAL },
  [CONTRACT_STATUS.ACTIVE]: { label: 'Hiệu lực', color: STATUS_COLOR.SUCCESS },
  [CONTRACT_STATUS.SIGNED]: { label: 'Đã ký', color: STATUS_COLOR.SUCCESS },
  [CONTRACT_STATUS.VOID]: { label: 'Vô hiệu', color: STATUS_COLOR.NEUTRAL },
};
