/**
 * SUPPORT CASE / TRANH CHẤP gắn đơn — Gap Analysis §3.D, ADR 0028 release gate 7 (R3).
 *
 * Một case là MỘT hồ sơ có mã, có người phụ trách, có dòng thời gian và có bằng chứng. Nó gắn
 * vào đơn/yêu cầu khi có, nhưng không bắt buộc: khách hỏi về tài khoản cũng là một case.
 *
 * Tranh chấp (`dispute`) là loại case có hệ quả về TIỀN: khi mở, quyết toán khoản giữ chỗ của
 * đơn đó bị TẠM GIỮ (`hold.outcome` không được chốt) cho tới khi case đóng — R3 chỉ giữ, việc
 * phân xử tiền là quyết định của admin ghi vào `resolution`.
 */

import { STATUS_COLOR, type StatusMeta } from './meta';

export const SUPPORT_CASE_CATEGORY = {
  /** Tranh chấp giữa khách và chủ xe về chuyến — có hệ quả tiền. */
  DISPUTE: 'dispute',
  /** Sự cố trong chuyến: hỏng xe, tai nạn, mất giấy tờ. */
  INCIDENT: 'incident',
  /** Tiền: chuyển nhầm, chưa thấy tiền, hỏi hoàn. */
  PAYMENT: 'payment',
  /** Tài khoản, đăng nhập, dữ liệu cá nhân. */
  ACCOUNT: 'account',
  OTHER: 'other',
} as const;

export type SupportCaseCategory =
  (typeof SUPPORT_CASE_CATEGORY)[keyof typeof SUPPORT_CASE_CATEGORY];
export const SUPPORT_CASE_CATEGORY_VALUES = Object.values(
  SUPPORT_CASE_CATEGORY,
) as SupportCaseCategory[];

export function isSupportCaseCategory(value: unknown): value is SupportCaseCategory {
  return typeof value === 'string' && (SUPPORT_CASE_CATEGORY_VALUES as string[]).includes(value);
}

export const SUPPORT_CASE_CATEGORY_LABEL: Readonly<Record<SupportCaseCategory, string>> = {
  [SUPPORT_CASE_CATEGORY.DISPUTE]: 'Tranh chấp chuyến đi',
  [SUPPORT_CASE_CATEGORY.INCIDENT]: 'Sự cố trong chuyến',
  [SUPPORT_CASE_CATEGORY.PAYMENT]: 'Thanh toán / hoàn tiền',
  [SUPPORT_CASE_CATEGORY.ACCOUNT]: 'Tài khoản',
  [SUPPORT_CASE_CATEGORY.OTHER]: 'Khác',
};

export const SUPPORT_CASE_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  /** Đang chờ một bên cung cấp thêm — đồng hồ SLA của nền tảng tạm dừng. */
  WAITING_PARTY: 'waiting_party',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
} as const;

export type SupportCaseStatus = (typeof SUPPORT_CASE_STATUS)[keyof typeof SUPPORT_CASE_STATUS];
export const SUPPORT_CASE_STATUS_VALUES = Object.values(SUPPORT_CASE_STATUS) as SupportCaseStatus[];

export function isSupportCaseStatus(value: unknown): value is SupportCaseStatus {
  return typeof value === 'string' && (SUPPORT_CASE_STATUS_VALUES as string[]).includes(value);
}

export const SUPPORT_CASE_STATUS_META: Readonly<Record<SupportCaseStatus, StatusMeta>> = {
  [SUPPORT_CASE_STATUS.OPEN]: { label: 'Mới', color: STATUS_COLOR.WAITING },
  [SUPPORT_CASE_STATUS.IN_PROGRESS]: { label: 'Đang xử lý', color: STATUS_COLOR.PROCESSING },
  [SUPPORT_CASE_STATUS.WAITING_PARTY]: { label: 'Chờ phản hồi', color: STATUS_COLOR.WARNING },
  [SUPPORT_CASE_STATUS.RESOLVED]: { label: 'Đã giải quyết', color: STATUS_COLOR.SUCCESS },
  [SUPPORT_CASE_STATUS.CLOSED]: { label: 'Đã đóng', color: STATUS_COLOR.NEUTRAL },
};

/** Case còn "mở" — đếm vào hàng đợi và giữ quyết toán khi là tranh chấp. */
export const SUPPORT_CASE_STATUS_OPEN: readonly SupportCaseStatus[] = [
  SUPPORT_CASE_STATUS.OPEN,
  SUPPORT_CASE_STATUS.IN_PROGRESS,
  SUPPORT_CASE_STATUS.WAITING_PARTY,
];

export function isSupportCaseOpen(status: SupportCaseStatus): boolean {
  return SUPPORT_CASE_STATUS_OPEN.includes(status);
}

/**
 * Máy trạng thái — chỉ những bước có nghĩa. `closed` là cuối: mở lại = tạo case mới tham chiếu
 * case cũ, để lịch sử không bị viết lại.
 */
const TRANSITIONS: Readonly<Record<SupportCaseStatus, readonly SupportCaseStatus[]>> = {
  [SUPPORT_CASE_STATUS.OPEN]: [SUPPORT_CASE_STATUS.IN_PROGRESS, SUPPORT_CASE_STATUS.CLOSED],
  [SUPPORT_CASE_STATUS.IN_PROGRESS]: [
    SUPPORT_CASE_STATUS.WAITING_PARTY,
    SUPPORT_CASE_STATUS.RESOLVED,
    SUPPORT_CASE_STATUS.CLOSED,
  ],
  [SUPPORT_CASE_STATUS.WAITING_PARTY]: [
    SUPPORT_CASE_STATUS.IN_PROGRESS,
    SUPPORT_CASE_STATUS.RESOLVED,
    SUPPORT_CASE_STATUS.CLOSED,
  ],
  [SUPPORT_CASE_STATUS.RESOLVED]: [SUPPORT_CASE_STATUS.CLOSED, SUPPORT_CASE_STATUS.IN_PROGRESS],
  [SUPPORT_CASE_STATUS.CLOSED]: [],
};

export function canTransitionSupportCase(
  from: SupportCaseStatus,
  to: SupportCaseStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export const SUPPORT_CASE_PRIORITY = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export type SupportCasePriority =
  (typeof SUPPORT_CASE_PRIORITY)[keyof typeof SUPPORT_CASE_PRIORITY];
export const SUPPORT_CASE_PRIORITY_VALUES = Object.values(
  SUPPORT_CASE_PRIORITY,
) as SupportCasePriority[];

export function isSupportCasePriority(value: unknown): value is SupportCasePriority {
  return typeof value === 'string' && (SUPPORT_CASE_PRIORITY_VALUES as string[]).includes(value);
}

/** Loại sự kiện trên dòng thời gian của case — append-only. */
export const SUPPORT_CASE_EVENT_KIND = {
  MESSAGE: 'message',
  STATUS_CHANGE: 'status_change',
  /** Bằng chứng: ảnh/tài liệu ở kho riêng tư. */
  EVIDENCE: 'evidence',
  ASSIGNMENT: 'assignment',
  RESOLUTION: 'resolution',
} as const;

export type SupportCaseEventKind =
  (typeof SUPPORT_CASE_EVENT_KIND)[keyof typeof SUPPORT_CASE_EVENT_KIND];
export const SUPPORT_CASE_EVENT_KIND_VALUES = Object.values(
  SUPPORT_CASE_EVENT_KIND,
) as SupportCaseEventKind[];

/**
 * Ai thấy được một sự kiện. `internal` = ghi chú giữa nhân sự nền tảng, hai bên tranh chấp
 * KHÔNG thấy — nhưng vẫn nằm trong cùng dòng thời gian để không phải giữ hai sổ.
 */
export const SUPPORT_EVENT_VISIBILITY = {
  PUBLIC: 'public',
  INTERNAL: 'internal',
} as const;

export type SupportEventVisibility =
  (typeof SUPPORT_EVENT_VISIBILITY)[keyof typeof SUPPORT_EVENT_VISIBILITY];

/** Ai mở/ghi case — quyết định họ thấy sự kiện nào và được đổi trạng thái nào. */
export const SUPPORT_PARTY = {
  CUSTOMER: 'customer',
  TENANT: 'tenant',
  PLATFORM: 'platform',
} as const;

export type SupportParty = (typeof SUPPORT_PARTY)[keyof typeof SUPPORT_PARTY];
export const SUPPORT_PARTY_VALUES = Object.values(SUPPORT_PARTY) as SupportParty[];
