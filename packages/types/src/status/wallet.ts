/**
 * Ví — **sổ công nợ phải trả** của nền tảng. ADR 0023, viết lại điều 1–2 bởi ADR 0025.
 *
 * Số dư ví là **nghĩa vụ của nền tảng với chủ ví**, không phải tiền của chủ ví do nền tảng cất hộ.
 *
 * Ban đầu (ADR 0023) ví chỉ chứa tiền hoàn và bồi thường — tức là thỉnh thoảng mới có dòng. Từ
 * ADR 0025 thì **không còn đúng cho tuyến gói**: khi gian hàng bật thu cọc qua sàn, mỗi chuyến đều
 * sinh một khoản nền tảng **giữ hộ và phải trả lại**. Rút tiền vì thế là luồng **thường xuyên**,
 * có cam kết thời gian (`WITHDRAWAL_TERMS`), không phải ngoại lệ.
 *
 * Hệ quả kế toán phải nhớ: số dư ngân hàng của nền tảng **không phải** tiền của nền tảng. Phải
 * tách được ba con số mỗi ngày — tiền của mình, tiền giữ hộ, chênh lệch chưa đối soát
 * (ADR 0025 điều 6). Không tách được nghĩa là không biết mình đang tiêu tiền của ai.
 *
 * Vẫn giữ nguyên từ ADR 0023: không nạp tiền, không thanh toán bằng ví, không rút tự động — mỗi
 * thứ đó biến ví thành ví điện tử, và ví điện tử cần giấy phép trung gian thanh toán.
 *
 * Trên giao diện **đừng gọi là "ví tiền"** (ADR 0023 ràng buộc 1) — dùng "Số dư gian hàng" với
 * gian hàng và "Số dư hoàn tiền" với khách.
 */

import { STATUS_COLOR, type StatusMeta } from './meta';

// ── Chủ ví ──────────────────────────────────────────────────────────────────

/**
 * Một bộ bảng cho cả hai phía, không phải hai bộ song sinh (ADR 0023 điều 7) — hai bộ là hai chỗ
 * để quên sửa.
 */
export const WALLET_OWNER_TYPE = {
  /** Khách thuê — nhận tiền hoàn khoản giữ chỗ. */
  USER: 'user',
  /** Gian hàng — nhận bồi thường khi khách huỷ muộn hoặc không đến. */
  TENANT: 'tenant',
} as const;

export type WalletOwnerType = (typeof WALLET_OWNER_TYPE)[keyof typeof WALLET_OWNER_TYPE];
export const WALLET_OWNER_TYPE_VALUES = Object.values(WALLET_OWNER_TYPE) as WalletOwnerType[];

export function isWalletOwnerType(value: unknown): value is WalletOwnerType {
  return typeof value === 'string' && (WALLET_OWNER_TYPE_VALUES as string[]).includes(value);
}

// ── Dòng sổ cái ─────────────────────────────────────────────────────────────

/**
 * Loại bút toán. Sổ cái **chỉ ghi thêm** — sửa sai bằng dòng ĐẢO, không update, không delete
 * (ADR 0023 điều 4), cùng tinh thần append-only của `tenant_subscriptions` (ADR 0010).
 *
 * `amount` dương = vào ví, âm = ra khỏi ví.
 */
export const WALLET_ENTRY_KIND = {
  /** + Bồi thường: khách huỷ muộn/không đến, khoản giữ chỗ chuyển cho gian hàng. */
  HOLD_FORFEIT: 'hold_forfeit',
  /**
   * + Trả lại tiền giữ hộ: chuyến hoàn thành, khoản escrow vốn là của gian hàng (ADR 0025).
   *
   * Tách khỏi `HOLD_FORFEIT` dù cùng cộng vào một ví: một bên là **bồi thường vì khách sai hẹn**,
   * bên kia là **trả lại tiền của chính họ**. Gộp lại thì báo cáo của gian hàng nói sai về việc
   * khách của họ có đáng tin hay không.
   */
  HOLD_RELEASE: 'hold_release',
  /** + Hoàn khoản giữ chỗ cho khách: huỷ trước mốc miễn phí, chủ xe huỷ, hoặc chuyển thừa. */
  HOLD_REFUND: 'hold_refund',
  /** − Đã chi theo một yêu cầu rút. */
  WITHDRAWAL: 'withdrawal',
  /** + Đảo một dòng rút bị từ chối hoặc chuyển hụt. */
  WITHDRAWAL_REVERSAL: 'withdrawal_reversal',
  /** ± Điều chỉnh tay của admin — luôn kèm `note` và người thực hiện. */
  ADJUSTMENT: 'adjustment',
} as const;

export type WalletEntryKind = (typeof WALLET_ENTRY_KIND)[keyof typeof WALLET_ENTRY_KIND];
export const WALLET_ENTRY_KIND_VALUES = Object.values(WALLET_ENTRY_KIND) as WalletEntryKind[];

export function isWalletEntryKind(value: unknown): value is WalletEntryKind {
  return typeof value === 'string' && (WALLET_ENTRY_KIND_VALUES as string[]).includes(value);
}

export const WALLET_ENTRY_KIND_LABEL: Readonly<Record<WalletEntryKind, string>> = {
  [WALLET_ENTRY_KIND.HOLD_FORFEIT]: 'Bồi thường huỷ chuyến',
  [WALLET_ENTRY_KIND.HOLD_RELEASE]: 'Tiền giữ chỗ của chuyến',
  [WALLET_ENTRY_KIND.HOLD_REFUND]: 'Hoàn tiền giữ chỗ',
  [WALLET_ENTRY_KIND.WITHDRAWAL]: 'Rút về ngân hàng',
  [WALLET_ENTRY_KIND.WITHDRAWAL_REVERSAL]: 'Hoàn lại do rút không thành',
  [WALLET_ENTRY_KIND.ADJUSTMENT]: 'Điều chỉnh',
};

/**
 * Nguồn sinh ra một dòng sổ cái. Cùng với `sourceRefId` nó tạo nên khoá chống cộng tiền hai lần
 * `@@unique([wallet_id, source_type, source_ref_id])` — **ràng buộc DB**, không phải check ở tầng
 * app (ADR 0023 điều 5). Worker chạy lại, webhook gửi lại, admin bấm hai lần: cùng một kết quả.
 */
export const WALLET_ENTRY_SOURCE = {
  BOOKING_HOLD: 'booking_hold',
  WITHDRAWAL_REQUEST: 'withdrawal_request',
  MANUAL: 'manual',
} as const;

export type WalletEntrySource = (typeof WALLET_ENTRY_SOURCE)[keyof typeof WALLET_ENTRY_SOURCE];
export const WALLET_ENTRY_SOURCE_VALUES = Object.values(
  WALLET_ENTRY_SOURCE,
) as WalletEntrySource[];

// ── Yêu cầu rút ─────────────────────────────────────────────────────────────

/**
 * Rút tiền là **chuyển khoản admin thủ công** — chuyển khoản ở VN là đẩy, nền tảng không có API
 * nào tự trả tiền về tài khoản người nhận (ADR 0023 điều 3).
 *
 * `APPROVED` tách khỏi `PAID` vì duyệt và chuyển tiền là hai việc, đôi khi hai người, và khoảng
 * giữa chúng là lúc tiền đã bị khoá khỏi số dư nhưng chưa rời tài khoản nền tảng.
 */
export const WITHDRAWAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  PAID: 'paid',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const;

export type WithdrawalStatus = (typeof WITHDRAWAL_STATUS)[keyof typeof WITHDRAWAL_STATUS];
export const WITHDRAWAL_STATUS_VALUES = Object.values(WITHDRAWAL_STATUS) as WithdrawalStatus[];

export function isWithdrawalStatus(value: unknown): value is WithdrawalStatus {
  return typeof value === 'string' && (WITHDRAWAL_STATUS_VALUES as string[]).includes(value);
}

export const WITHDRAWAL_STATUS_META: Readonly<Record<WithdrawalStatus, StatusMeta>> = {
  [WITHDRAWAL_STATUS.PENDING]: { label: 'Chờ duyệt', color: STATUS_COLOR.WAITING },
  [WITHDRAWAL_STATUS.APPROVED]: { label: 'Đã duyệt, chờ chuyển', color: STATUS_COLOR.PROCESSING },
  [WITHDRAWAL_STATUS.PAID]: { label: 'Đã chuyển', color: STATUS_COLOR.SUCCESS },
  [WITHDRAWAL_STATUS.REJECTED]: { label: 'Bị từ chối', color: STATUS_COLOR.DANGER },
  [WITHDRAWAL_STATUS.CANCELLED]: { label: 'Đã huỷ', color: STATUS_COLOR.NEUTRAL },
};

/** Yêu cầu đang khoá tiền trong `pendingWithdrawAmount` — chưa chi nhưng không dùng được nữa. */
export const WITHDRAWAL_STATUS_HOLDING_FUNDS: readonly WithdrawalStatus[] = [
  WITHDRAWAL_STATUS.PENDING,
  WITHDRAWAL_STATUS.APPROVED,
];
