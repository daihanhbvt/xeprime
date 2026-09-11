/**
 * HOÀN KHOẢN GIỮ CHỖ — ADR 0028 điều 6 và 8 (R3).
 *
 * Ở R3 XePrime chỉ giữ tiền CỦA MÌNH (khoản giữ chỗ = phí dịch vụ), nên "hoàn" không đi qua
 * một sổ công nợ: nó là một YÊU CẦU CHUYỂN TRẢ mà admin thực hiện bằng tay qua ngân hàng rồi
 * ghi mã giao dịch. Số dư chủ xe / ledger append-only là R4 — không dựng trước.
 *
 * Mỗi hold có tối đa MỘT yêu cầu hoàn (unique `hold_id`) — hoàn hai lần cho một khoản là lỗi
 * kế toán, chặn bằng DB chứ không bằng check ở app.
 */

import { STATUS_COLOR, type StatusMeta } from './meta';

export const HOLD_REFUND_STATUS = {
  /** Đã ghi nhận, chờ admin chuyển. */
  PENDING: 'pending',
  /** Admin đã chuyển và ghi mã giao dịch ngân hàng. Chỉ dùng với `settlement_mode = bank_transfer`. */
  PAID: 'paid',
  /**
   * Đã GHI CÓ vào ví điểm của khách — trạng thái cuối, KHÁC `paid` (ADR 0033 điều 5).
   *
   * Phải phân biệt "tiền đã rời tài khoản ngân hàng nền tảng" với "nghĩa vụ đổi hình thức":
   * gộp hai cái là mất khả năng đối chiếu chiều ra.
   */
  CREDITED: 'credited',
  /** Admin từ chối (vd tranh chấp kết luận khách sai) — có lý do, có audit. */
  REJECTED: 'rejected',
} as const;

export type HoldRefundStatus = (typeof HOLD_REFUND_STATUS)[keyof typeof HOLD_REFUND_STATUS];
export const HOLD_REFUND_STATUS_VALUES = Object.values(HOLD_REFUND_STATUS) as HoldRefundStatus[];

export function isHoldRefundStatus(value: unknown): value is HoldRefundStatus {
  return typeof value === 'string' && (HOLD_REFUND_STATUS_VALUES as string[]).includes(value);
}

export const HOLD_REFUND_STATUS_META: Readonly<Record<HoldRefundStatus, StatusMeta>> = {
  [HOLD_REFUND_STATUS.PENDING]: { label: 'Chờ chuyển trả', color: STATUS_COLOR.WAITING },
  [HOLD_REFUND_STATUS.PAID]: { label: 'Đã chuyển trả', color: STATUS_COLOR.SUCCESS },
  [HOLD_REFUND_STATUS.CREDITED]: { label: 'Đã vào ví điểm', color: STATUS_COLOR.SUCCESS },
  [HOLD_REFUND_STATUS.REJECTED]: { label: 'Từ chối hoàn', color: STATUS_COLOR.DANGER },
};

/**
 * Khoản hoàn đi ra bằng đường nào — ADR 0033 điều 5.
 *
 * Hai kỷ nguyên song song, không phải cũ/mới: ghi có ví là mặc định cho khách CÓ tài khoản,
 * còn chuyển khoản tay là đường VĨNH VIỄN cho khách vãng lai — XePrime cho đặt xe không cần
 * đăng ký, nên luôn tồn tại người được hoàn tiền mà không có ví để ghi có.
 */
export const REFUND_SETTLEMENT_MODE = {
  BALANCE: 'balance',
  BANK_TRANSFER: 'bank_transfer',
} as const;

export type RefundSettlementMode =
  (typeof REFUND_SETTLEMENT_MODE)[keyof typeof REFUND_SETTLEMENT_MODE];
export const REFUND_SETTLEMENT_MODE_VALUES = Object.values(
  REFUND_SETTLEMENT_MODE,
) as RefundSettlementMode[];

/** Vì sao hoàn — mỗi lý do một quy tắc, snapshot lên yêu cầu để đọc lại không phải suy. */
export const HOLD_REFUND_REASON = {
  /** Khách huỷ TRƯỚC mốc miễn phí — hoàn 100%. */
  EARLY_CANCEL: 'early_cancel',
  /** Chủ xe/gian hàng huỷ — khách không có lỗi, hoàn 100%. */
  OWNER_CANCEL: 'owner_cancel',
  /** Khách chuyển THỪA — hoàn phần dư (ADR 0022 điều 5). */
  OVERPAID: 'overpaid',
  /** Hold trả THIẾU rồi hết hạn — phần đã chuyển phải quay về khách (ADR 0033). */
  HOLD_EXPIRED: 'hold_expired',
  /** Admin quyết sau tranh chấp/sự cố — bắt buộc có ghi chú. */
  ADMIN_DECISION: 'admin_decision',
} as const;

export type HoldRefundReason = (typeof HOLD_REFUND_REASON)[keyof typeof HOLD_REFUND_REASON];
export const HOLD_REFUND_REASON_VALUES = Object.values(HOLD_REFUND_REASON) as HoldRefundReason[];

export function isHoldRefundReason(value: unknown): value is HoldRefundReason {
  return typeof value === 'string' && (HOLD_REFUND_REASON_VALUES as string[]).includes(value);
}

export const HOLD_REFUND_REASON_LABEL: Readonly<Record<HoldRefundReason, string>> = {
  [HOLD_REFUND_REASON.EARLY_CANCEL]: 'Khách huỷ trước mốc miễn phí',
  [HOLD_REFUND_REASON.OWNER_CANCEL]: 'Chủ xe huỷ chuyến',
  [HOLD_REFUND_REASON.OVERPAID]: 'Chuyển thừa',
  [HOLD_REFUND_REASON.HOLD_EXPIRED]: 'Hết hạn giữ chỗ khi chưa đủ tiền',
  [HOLD_REFUND_REASON.ADMIN_DECISION]: 'Quyết định của XePrime',
};

/**
 * Cam kết chuyển trả — ADR 0028 điều 8: mục tiêu nội bộ dưới 10 phút khi có người trực, tối đa
 * 2 NGÀY LÀM VIỆC. Là dữ liệu hiển thị cho khách trước khi họ bấm huỷ.
 */
export const HOLD_REFUND_SLA = {
  TARGET_MINUTES: 10,
  MAX_BUSINESS_DAYS: 2,
} as const;
