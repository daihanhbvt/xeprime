import { STATUS_COLOR, type StatusMeta } from './meta';
import { BOOKING_STATUS, type BookingStatus } from './booking';

/**
 * Tài xế = LIÊN KẾT giữa một bên thuê (gian hàng hoặc chủ xe tuyến hoa hồng) và một TÀI KHOẢN
 * KHÁCH (ADR 0063). Bảng `drivers` không còn là hồ sơ tự nhập: mỗi dòng là một lời mời/liên kết,
 * người được mời chấp nhận ở app/web khách. Bằng lái lấy từ tài khoản khách (ADR 0057).
 */
export const DRIVER_TYPE = {
  STAFF: 'staff',
  COLLABORATOR: 'collaborator',
  TEMPORARY: 'temporary',
} as const;

export type DriverType = (typeof DRIVER_TYPE)[keyof typeof DRIVER_TYPE];
export const DRIVER_TYPE_VALUES = Object.values(DRIVER_TYPE) as DriverType[];

export const DRIVER_TYPE_LABEL: Readonly<Record<DriverType, string>> = {
  [DRIVER_TYPE.STAFF]: 'Nhân viên',
  [DRIVER_TYPE.COLLABORATOR]: 'Cộng tác viên',
  [DRIVER_TYPE.TEMPORARY]: 'Thời vụ',
};

/**
 * Trạng thái LIÊN KẾT tài xế.
 *
 *  - `invited`   — bên thuê đã mời, chờ tài xế trả lời;
 *  - `active`    — tài xế đã chấp nhận, gán được vào đơn;
 *  - `suspended` — bên thuê tạm khoá: giữ liên kết, không gán đơn mới;
 *  - `declined`  — tài xế từ chối lời mời (kết thúc);
 *  - `ended`     — một trong hai bên chấm dứt, hoặc lời mời bị thu hồi (kết thúc).
 *
 * Hai trạng thái cuối là LỊCH SỬ: mời lại sinh một dòng mới, dòng cũ giữ cho các đơn đã chạy.
 */
export const DRIVER_LINK_STATUS = {
  INVITED: 'invited',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DECLINED: 'declined',
  ENDED: 'ended',
} as const;

export type DriverLinkStatus = (typeof DRIVER_LINK_STATUS)[keyof typeof DRIVER_LINK_STATUS];
export const DRIVER_LINK_STATUS_VALUES = Object.values(DRIVER_LINK_STATUS) as DriverLinkStatus[];

/** Liên kết còn "mở" — mỗi cặp (bên thuê, tài khoản) có tối đa MỘT dòng ở tập này (unique DB). */
export const DRIVER_LINK_OPEN_STATUSES: readonly DriverLinkStatus[] = [
  DRIVER_LINK_STATUS.INVITED,
  DRIVER_LINK_STATUS.ACTIVE,
  DRIVER_LINK_STATUS.SUSPENDED,
];

/** Giá trị lọc `linkStatus` = mọi trạng thái (bỏ trống = chỉ liên kết còn mở). */
export const DRIVER_LINK_STATUS_FILTER_ANY = 'any';

export const DRIVER_LINK_STATUS_META: Readonly<Record<DriverLinkStatus, StatusMeta>> = {
  [DRIVER_LINK_STATUS.INVITED]: { label: 'Chờ tài xế đồng ý', color: STATUS_COLOR.WARNING },
  [DRIVER_LINK_STATUS.ACTIVE]: { label: 'Đang liên kết', color: STATUS_COLOR.SUCCESS },
  [DRIVER_LINK_STATUS.SUSPENDED]: { label: 'Tạm khoá', color: STATUS_COLOR.NEUTRAL },
  [DRIVER_LINK_STATUS.DECLINED]: { label: 'Đã từ chối', color: STATUS_COLOR.DANGER },
  [DRIVER_LINK_STATUS.ENDED]: { label: 'Đã kết thúc', color: STATUS_COLOR.NEUTRAL },
};

export function isDriverLinkStatus(value: unknown): value is DriverLinkStatus {
  return typeof value === 'string' && (DRIVER_LINK_STATUS_VALUES as string[]).includes(value);
}

/** Ai chấm dứt liên kết — ghi lại để hai phía đọc đúng câu chuyện. */
export const DRIVER_LINK_END_PARTY = {
  EMPLOYER: 'employer',
  DRIVER: 'driver',
} as const;

export type DriverLinkEndParty = (typeof DRIVER_LINK_END_PARTY)[keyof typeof DRIVER_LINK_END_PARTY];
export const DRIVER_LINK_END_PARTY_VALUES = Object.values(
  DRIVER_LINK_END_PARTY,
) as DriverLinkEndParty[];

/**
 * Lượt GÁN tài xế vào một đơn (`bookings.driver_assignment_status`). Gán xong là `pending` —
 * tài xế phải chấp nhận; từ chối thì đơn quay về chưa có tài xế (không có trạng thái thứ ba).
 * Lượt chờ VẪN giữ lịch của tài xế: không bên nào gán trùng giờ được.
 */
export const DRIVER_ASSIGNMENT_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
} as const;

export type DriverAssignmentStatus =
  (typeof DRIVER_ASSIGNMENT_STATUS)[keyof typeof DRIVER_ASSIGNMENT_STATUS];
export const DRIVER_ASSIGNMENT_STATUS_VALUES = Object.values(
  DRIVER_ASSIGNMENT_STATUS,
) as DriverAssignmentStatus[];

export const DRIVER_ASSIGNMENT_STATUS_META: Readonly<Record<DriverAssignmentStatus, StatusMeta>> = {
  [DRIVER_ASSIGNMENT_STATUS.PENDING]: { label: 'Chờ tài xế nhận', color: STATUS_COLOR.WARNING },
  [DRIVER_ASSIGNMENT_STATUS.ACCEPTED]: { label: 'Tài xế đã nhận', color: STATUS_COLOR.SUCCESS },
};

/**
 * Kết quả của MỘT lượt gán (`booking_driver_assignments.outcome`, ADR 0063) — CHECK ở migration.
 * `open` = lượt đang hiệu lực (trạng thái chờ/đã nhận đọc ở `bookings.driver_assignment_status`).
 */
export const DRIVER_ASSIGNMENT_OUTCOME = {
  OPEN: 'open',
  /** Tài xế từ chối chuyến. */
  DECLINED: 'declined',
  /** Bên thuê đổi người / bỏ gán, hoặc liên kết chấm dứt khi chuyến chưa nhận. */
  UNASSIGNED: 'unassigned',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
  COMPLETED: 'completed',
} as const;

export type DriverAssignmentOutcome =
  (typeof DRIVER_ASSIGNMENT_OUTCOME)[keyof typeof DRIVER_ASSIGNMENT_OUTCOME];
export const DRIVER_ASSIGNMENT_OUTCOME_VALUES = Object.values(
  DRIVER_ASSIGNMENT_OUTCOME,
) as DriverAssignmentOutcome[];

export const DRIVER_ASSIGNMENT_OUTCOME_META: Readonly<Record<DriverAssignmentOutcome, StatusMeta>> =
  {
    [DRIVER_ASSIGNMENT_OUTCOME.OPEN]: { label: 'Đang giao', color: STATUS_COLOR.INFO },
    [DRIVER_ASSIGNMENT_OUTCOME.DECLINED]: { label: 'Tài xế từ chối', color: STATUS_COLOR.DANGER },
    [DRIVER_ASSIGNMENT_OUTCOME.UNASSIGNED]: { label: 'Đã gỡ tài xế', color: STATUS_COLOR.NEUTRAL },
    [DRIVER_ASSIGNMENT_OUTCOME.CANCELLED]: { label: 'Đơn đã huỷ', color: STATUS_COLOR.NEUTRAL },
    [DRIVER_ASSIGNMENT_OUTCOME.NO_SHOW]: { label: 'Khách không đến', color: STATUS_COLOR.NEUTRAL },
    [DRIVER_ASSIGNMENT_OUTCOME.COMPLETED]: { label: 'Hoàn thành', color: STATUS_COLOR.SUCCESS },
  };

/**
 * Bằng lái của tài khoản tài xế, nhìn từ phía BÊN THUÊ — chỉ ba mức, không lộ ảnh/số bằng
 * (ADR 0063). Nguồn: `customer_driver_licences` của chính tài khoản đó (ADR 0057).
 */
export const DRIVER_LICENCE_STATE = {
  VERIFIED: 'verified',
  PENDING: 'pending',
  NONE: 'none',
} as const;

export type DriverLicenceState = (typeof DRIVER_LICENCE_STATE)[keyof typeof DRIVER_LICENCE_STATE];
export const DRIVER_LICENCE_STATE_VALUES = Object.values(
  DRIVER_LICENCE_STATE,
) as DriverLicenceState[];

/** Tab "Chuyến tôi lái" của tài khoản khách. */
export const DRIVER_TRIP_TAB = {
  /** Chờ tôi nhận + sắp tới + đang chạy. */
  UPCOMING: 'upcoming',
  /** Đã xong / đã huỷ / khách không đến. */
  PAST: 'past',
} as const;

export type DriverTripTab = (typeof DRIVER_TRIP_TAB)[keyof typeof DRIVER_TRIP_TAB];
export const DRIVER_TRIP_TAB_VALUES = Object.values(DRIVER_TRIP_TAB) as DriverTripTab[];

/**
 * Đơn ở các trạng thái này mới đổi/gỡ tài xế được — TRƯỚC bàn giao. Đã giao xe (`active`) hay đã
 * khép thì người cầm lái đã chốt (ADR 0063). Server chặn; giao diện ẩn nút theo cùng danh sách.
 */
export const DRIVER_REASSIGNABLE_BOOKING_STATUSES: readonly BookingStatus[] = [
  BOOKING_STATUS.RESERVED,
  BOOKING_STATUS.CONFIRMED,
];

/** Chuyến còn chờ CHÍNH tài xế trả lời — chỉ khi lượt của họ còn mở (web + app khách dùng chung). */
export function isDriverTripAwaitingAnswer(trip: {
  outcome: string;
  assignmentStatus: string;
}): boolean {
  return (
    trip.outcome === DRIVER_ASSIGNMENT_OUTCOME.OPEN &&
    trip.assignmentStatus === DRIVER_ASSIGNMENT_STATUS.PENDING
  );
}

/** Phạm vi "Nơi tôi làm tài xế": `open` = lời mời + đang liên kết + tạm khoá · `closed` = đã từ chối/kết thúc. */
export const DRIVER_LINK_SCOPE = { OPEN: 'open', CLOSED: 'closed' } as const;
export type DriverLinkScope = (typeof DRIVER_LINK_SCOPE)[keyof typeof DRIVER_LINK_SCOPE];
export const DRIVER_LINK_SCOPE_VALUES = Object.values(DRIVER_LINK_SCOPE) as DriverLinkScope[];

/** Đơn còn đổi/gỡ tài xế được không (chưa giao xe) — một phép kiểm cho API, web và app native. */
export function isDriverReassignable(status: string): boolean {
  return (DRIVER_REASSIGNABLE_BOOKING_STATUSES as readonly string[]).includes(status);
}
