import { PERMISSION, type Permission } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import type { PlatformMoneySummary } from './types';

/**
 * Các hàng đợi của màn TÀI CHÍNH (`/manage/admin/money`) — 01/10/2026 gộp "Đối soát tiền vào" và
 * "Vận hành tiền" làm một.
 *
 * Giá trị là mã đi trên URL (`?queue=bank-in`), không phải nhãn — nhãn nằm ở namespace
 * `PlatformMoney.queues`.
 */
export const FINANCE_QUEUE = {
  BANK_IN: 'bank-in',
  HOLDS: 'holds',
  REFUNDS: 'refunds',
  WITHDRAWALS: 'withdrawals',
  INSURANCE: 'insurance',
  TAX: 'tax',
  LEDGER: 'ledger',
} as const;

export type FinanceQueue = (typeof FINANCE_QUEUE)[keyof typeof FINANCE_QUEUE];
export const FINANCE_QUEUE_VALUES = Object.values(FINANCE_QUEUE) as FinanceQueue[];

export function isFinanceQueue(value: unknown): value is FinanceQueue {
  return typeof value === 'string' && (FINANCE_QUEUE_VALUES as string[]).includes(value);
}

/**
 * Nhóm theo CHIỀU TIỀN — thứ tự là thứ tự một đồng tiền đi qua nền tảng: vào → đang giữ → ra →
 * phần của bên thứ ba → sổ kiểm cả vòng.
 */
export const FINANCE_QUEUE_GROUPS = [
  { key: 'moneyIn', queues: [FINANCE_QUEUE.BANK_IN] },
  { key: 'held', queues: [FINANCE_QUEUE.HOLDS] },
  { key: 'moneyOut', queues: [FINANCE_QUEUE.REFUNDS, FINANCE_QUEUE.WITHDRAWALS] },
  { key: 'thirdParty', queues: [FINANCE_QUEUE.INSURANCE, FINANCE_QUEUE.TAX] },
  { key: 'ledger', queues: [FINANCE_QUEUE.LEDGER] },
] as const satisfies readonly { key: string; queues: readonly FinanceQueue[] }[];

export type FinanceQueueGroupKey = (typeof FINANCE_QUEUE_GROUPS)[number]['key'];

/**
 * Quyền của từng hàng đợi — khớp `@RequirePermissions` của controller tương ứng. Tiền vào gác bằng
 * quyền GÓI (`platform/bank-transactions`), mọi hàng đợi khác bằng quyền tiền marketplace.
 * Thiếu quyền thì hàng đợi ẩn HẲN khỏi màn, không hiện rồi báo 403.
 */
export const FINANCE_QUEUE_PERMISSION: Readonly<Record<FinanceQueue, Permission>> = {
  [FINANCE_QUEUE.BANK_IN]: PERMISSION.PLATFORM_BILLING_MANAGE,
  [FINANCE_QUEUE.HOLDS]: PERMISSION.PLATFORM_MONEY_MANAGE,
  [FINANCE_QUEUE.REFUNDS]: PERMISSION.PLATFORM_MONEY_MANAGE,
  [FINANCE_QUEUE.WITHDRAWALS]: PERMISSION.PLATFORM_MONEY_MANAGE,
  [FINANCE_QUEUE.INSURANCE]: PERMISSION.PLATFORM_MONEY_MANAGE,
  [FINANCE_QUEUE.TAX]: PERMISSION.PLATFORM_MONEY_MANAGE,
  [FINANCE_QUEUE.LEDGER]: PERMISSION.PLATFORM_MONEY_MANAGE,
};

/** Tham số URL của MÀN (không phải của một hàng đợi) — đổi hàng đợi thì chỉ hai tham số này sống sót. */
export const FINANCE_PARAM = {
  QUEUE: 'queue',
  /** Ngày đối soát (`YYYY-MM-DD`, giờ VN) của thẻ trạng thái và sổ đối soát ngày. Vắng = hôm nay. */
  DATE: 'date',
} as const;

/** Đường dẫn tới một hàng đợi — cho lối tắt từ màn khác (tranh chấp → giữ chỗ, URL cũ…). */
export function financeQueueHref(queue: FinanceQueue, params?: Record<string, string>): string {
  const query = new URLSearchParams({ [FINANCE_PARAM.QUEUE]: queue, ...params });
  return `${ROUTES.MANAGE.ADMIN_MONEY}?${query.toString()}`;
}

/**
 * Số khoản + tổng tiền của MỘT hàng đợi — ánh xạ hàng đợi → nhóm của `GET /platform/money/summary`
 * đặt ở MỘT chỗ cho cả thẻ đếm lẫn cột hàng đợi (hai nơi tự viết switch là hai nơi lệch nhau).
 * `null` cho sổ đối soát — nó không phải một hàng đợi việc.
 */
export function queueSummary(
  queue: FinanceQueue,
  summary: PlatformMoneySummary,
): { count: number; amount: string } | null {
  switch (queue) {
    case FINANCE_QUEUE.BANK_IN:
      return summary.bankIn;
    case FINANCE_QUEUE.HOLDS:
      return summary.holds;
    case FINANCE_QUEUE.REFUNDS:
      return summary.refunds;
    case FINANCE_QUEUE.WITHDRAWALS:
      return summary.withdrawals;
    case FINANCE_QUEUE.INSURANCE:
      return summary.insurance;
    case FINANCE_QUEUE.TAX:
      return summary.tax;
    case FINANCE_QUEUE.LEDGER:
      return null;
  }
}

/** Tham số riêng của hàng đợi thuế: kỳ đang xem (`YYYY-MM`) — xem `TaxPeriodPanel`. */
export const TAX_PERIOD_PARAM = 'period';

/** Khoản tiền vào chờ khớp quá mốc này thì đánh dấu khẩn — một ngày là một gói chưa được mở. */
export const BANK_IN_URGENT_HOURS = 24;
