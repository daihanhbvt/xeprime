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
  /**
   * Tài xế KHÔNG trả lời trong hạn (`bookings.driver_respond_by`, ADR 0066) — hệ thống gỡ lượt
   * gán, đơn quay về chưa có tài xế và bên thuê được báo khẩn. Đơn của khách KHÔNG bị huỷ.
   */
  EXPIRED: 'expired',
  /**
   * Tài xế RÚT khỏi chuyến đã nhận, kèm lý do (ADR 0074). Đơn KHÔNG bị huỷ: quay về chưa có tài
   * xế, bên thuê được báo khẩn kèm SLA điều phối lại. Dòng sổ mang `drop_reason_category` + vùng.
   */
  DROPPED: 'dropped',
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
    [DRIVER_ASSIGNMENT_OUTCOME.EXPIRED]: {
      label: 'Quá hạn xác nhận',
      color: STATUS_COLOR.WARNING,
    },
    [DRIVER_ASSIGNMENT_OUTCOME.DROPPED]: {
      label: 'Tài xế rút khỏi chuyến',
      color: STATUS_COLOR.DANGER,
    },
  };

/** Nhóm lý do tài xế RÚT khỏi chuyến đã nhận (ADR 0074) — CHECK ở migration. */
export const DRIVER_DROP_REASON = {
  HEALTH_ISSUE: 'health_issue',
  VEHICLE_ACCIDENT: 'vehicle_accident',
  FAMILY_EMERGENCY: 'family_emergency',
  ROUTE_BLOCKED: 'route_blocked',
  /** Còn lại — bắt buộc kèm ghi chú `DRIVER_DROP_NOTE_LENGTH.MIN`–`MAX` ký tự. */
  OTHER: 'other',
} as const;

export type DriverDropReason = (typeof DRIVER_DROP_REASON)[keyof typeof DRIVER_DROP_REASON];
export const DRIVER_DROP_REASON_VALUES = Object.values(DRIVER_DROP_REASON) as DriverDropReason[];

/** Nhãn tiếng Việt cho câu thông báo dựng ở server — giao diện dùng namespace `Domain`. */
export const DRIVER_DROP_REASON_LABEL: Readonly<Record<DriverDropReason, string>> = {
  [DRIVER_DROP_REASON.HEALTH_ISSUE]: 'Sức khoẻ',
  [DRIVER_DROP_REASON.VEHICLE_ACCIDENT]: 'Tai nạn / sự cố phương tiện',
  [DRIVER_DROP_REASON.FAMILY_EMERGENCY]: 'Việc gia đình khẩn cấp',
  [DRIVER_DROP_REASON.ROUTE_BLOCKED]: 'Đường đi bị chặn / thiên tai',
  [DRIVER_DROP_REASON.OTHER]: 'Lý do khác',
};

/** Ghi chú khi rút chuyến: tối đa `MAX` ký tự; nhóm `other` bắt buộc ít nhất `MIN` (sau khi cắt trắng). */
export const DRIVER_DROP_NOTE_LENGTH = { MIN: 10, MAX: 500 } as const;

/**
 * Vùng của một lượt rút theo độ sát giờ nhận (ADR 0074 điều 2). `grace` = còn trong cửa sổ trả lại
 * (`driverReleaseUntil`) — không phạt; các vùng còn lại theo `ΔT = pickupAt − droppedAt`.
 */
export const DRIVER_DROP_ZONE = {
  GRACE: 'grace',
  FAR: 'far',
  SAME_DAY: 'same_day',
  CRITICAL: 'critical',
} as const;

export type DriverDropZone = (typeof DRIVER_DROP_ZONE)[keyof typeof DRIVER_DROP_ZONE];
export const DRIVER_DROP_ZONE_VALUES = Object.values(DRIVER_DROP_ZONE) as DriverDropZone[];

/** Ranh giới vùng (giờ trước giờ nhận). */
export const DRIVER_DROP_ZONE_HOURS = { FAR: 12, CRITICAL: 2 } as const;

/** SLA bên thuê điều phối lại (phút) theo vùng ΔT — `grace` dùng vùng ΔT thật của nó. */
const DRIVER_REASSIGN_SLA_MINUTES = {
  [DRIVER_DROP_ZONE.FAR]: 120,
  [DRIVER_DROP_ZONE.SAME_DAY]: 45,
  [DRIVER_DROP_ZONE.CRITICAL]: 15,
} as const;

/** Cooldown "Đặt ngay" (giờ) theo vùng — `grace`/`far` không phạt. */
const DRIVER_DROP_COOLDOWN_HOURS: Readonly<Record<DriverDropZone, number>> = {
  [DRIVER_DROP_ZONE.GRACE]: 0,
  [DRIVER_DROP_ZONE.FAR]: 0,
  [DRIVER_DROP_ZONE.SAME_DAY]: 24,
  [DRIVER_DROP_ZONE.CRITICAL]: 48,
};

/** Vùng theo ΔT thuần (không xét cửa sổ trả lại). */
export function driverDropLeadZone(
  droppedAt: Date,
  pickupAt: Date,
): Exclude<DriverDropZone, 'grace'> {
  const leadMs = pickupAt.getTime() - droppedAt.getTime();
  if (leadMs >= DRIVER_DROP_ZONE_HOURS.FAR * HOUR_MS) return DRIVER_DROP_ZONE.FAR;
  if (leadMs >= DRIVER_DROP_ZONE_HOURS.CRITICAL * HOUR_MS) return DRIVER_DROP_ZONE.SAME_DAY;
  return DRIVER_DROP_ZONE.CRITICAL;
}

/**
 * Hệ quả của MỘT lượt rút lúc `droppedAt` (ADR 0074 điều 2) — server ghi, client chỉ dùng để báo
 * trước mức phạt trong hộp thoại xác nhận. `releaseUntil` = mốc cửa sổ trả lại của lượt nhận đó
 * (`driverReleaseUntil`), `null` khi không còn cửa sổ.
 *
 *  - `zone`          — vùng ghi vào sổ (`grace` nếu còn trong cửa sổ trả lại);
 *  - `reassignBy`    — hạn bên thuê điều phối lại = min(droppedAt + SLA, pickupAt);
 *  - `cooldownUntil` — tài xế bị loại khỏi tự gán "Đặt ngay" tới mốc này (`null` = không phạt).
 */
export function driverDropPolicy(input: {
  droppedAt: Date;
  pickupAt: Date;
  releaseUntil: Date | null;
}): { zone: DriverDropZone; reassignBy: Date; cooldownUntil: Date | null } {
  const leadZone = driverDropLeadZone(input.droppedAt, input.pickupAt);
  const zone =
    input.releaseUntil && input.releaseUntil.getTime() > input.droppedAt.getTime()
      ? DRIVER_DROP_ZONE.GRACE
      : leadZone;
  const reassignBy = new Date(
    Math.max(
      input.droppedAt.getTime(),
      Math.min(
        input.droppedAt.getTime() + DRIVER_REASSIGN_SLA_MINUTES[leadZone] * MINUTE_MS,
        input.pickupAt.getTime(),
      ),
    ),
  );
  const cooldownHours = DRIVER_DROP_COOLDOWN_HOURS[zone];
  return {
    zone,
    reassignBy,
    cooldownUntil:
      cooldownHours > 0 ? new Date(input.droppedAt.getTime() + cooldownHours * HOUR_MS) : null,
  };
}

/** Số giờ cooldown của một vùng — câu chữ cảnh báo trước khi rút. */
export function driverDropCooldownHours(zone: DriverDropZone): number {
  return DRIVER_DROP_COOLDOWN_HOURS[zone];
}

/** Lượt rút bị tính là vi phạm (mọi vùng trừ `grace`) — đếm trên danh sách tài xế của bên thuê. */
export const DRIVER_DROP_VIOLATION_ZONES: readonly DriverDropZone[] = [
  DRIVER_DROP_ZONE.FAR,
  DRIVER_DROP_ZONE.SAME_DAY,
  DRIVER_DROP_ZONE.CRITICAL,
];

/** Cửa sổ đếm số lần rút trên danh sách tài xế (ngày). */
export const DRIVER_DROP_STATS_WINDOW_DAYS = 90;

/**
 * Mức hiển thị sự cố tài xế cho KHÁCH (ADR 0074 điều 3) — không bao giờ lộ ai đã rút.
 *
 *  - `arranging`   — còn xa giờ nhận: "Đang sắp xếp tài xế";
 *  - `rearranging` — sự cố trong ngày: "Đang điều phối lại tài xế";
 *  - `urgent`      — còn dưới 2 giờ: cảnh báo "Chuyến đang gặp sự cố điều phối" + hỗ trợ.
 */
export const DRIVER_INCIDENT_LEVEL = {
  ARRANGING: 'arranging',
  REARRANGING: 'rearranging',
  URGENT: 'urgent',
} as const;

export type DriverIncidentLevel = (typeof DRIVER_INCIDENT_LEVEL)[keyof typeof DRIVER_INCIDENT_LEVEL];
export const DRIVER_INCIDENT_LEVEL_VALUES = Object.values(
  DRIVER_INCIDENT_LEVEL,
) as DriverIncidentLevel[];

/**
 * Sự cố tài xế trên một đơn: một tài xế ĐÃ NHẬN đã rút (`droppedAt`) và chưa ai nhận lại. Trả `null`
 * khi đơn không có sự cố mở. Một phép tính cho API (DTO khách + phép kiểm huỷ hoàn 100%) — client
 * KHÔNG tự tính, chỉ đọc kết quả server trả.
 *
 * `freeCancel` = khách huỷ được hoàn 100% vì lỗi phía cho thuê: đã quá hạn điều phối HOẶC còn dưới
 * 2 giờ tới giờ nhận.
 */
export function driverIncidentState(
  booking: {
    status: string;
    pickupAt: Date;
    driverDroppedAt: Date | null;
    driverReassignBy: Date | null;
    driverAssignmentStatus: string | null;
  },
  now: Date = new Date(),
): { level: DriverIncidentLevel; reassignBy: Date; freeCancel: boolean } | null {
  if (!booking.driverDroppedAt || !booking.driverReassignBy) return null;
  if (!isDriverReassignable(booking.status)) return null;
  if (booking.driverAssignmentStatus === DRIVER_ASSIGNMENT_STATUS.ACCEPTED) return null;
  const leftMs = booking.pickupAt.getTime() - now.getTime();
  const urgent = leftMs < DRIVER_DROP_ZONE_HOURS.CRITICAL * HOUR_MS;
  const level = urgent
    ? DRIVER_INCIDENT_LEVEL.URGENT
    : driverDropLeadZone(booking.driverDroppedAt, booking.pickupAt) === DRIVER_DROP_ZONE.FAR
      ? DRIVER_INCIDENT_LEVEL.ARRANGING
      : DRIVER_INCIDENT_LEVEL.REARRANGING;
  return {
    level,
    reassignBy: booking.driverReassignBy,
    freeCancel: urgent || now.getTime() >= booking.driverReassignBy.getTime(),
  };
}

/**
 * Hạn tài xế trả lời một lượt gán — ADR 0066 (ghi đè "lượt chờ KHÔNG hết hạn" của ADR 0063).
 *
 * `T = clamp(round(ΔT × 10%), 15′, 60′)` với `ΔT = pickupAt − assignedAt`. Giờ nhận đã qua (hoặc
 * trùng mốc gán) ⇒ sàn 15′. Server tính MỘT lần lúc gán và lưu `bookings.driver_respond_by`;
 * client chỉ đọc mốc đó để đếm ngược, không tự tính lại.
 */
export const DRIVER_RESPONSE_WINDOW = {
  RATIO: 0.1,
  MIN_MINUTES: 15,
  MAX_MINUTES: 60,
} as const;

/**
 * Bên thuê nên gán người khác trong bấy nhiêu phút sau khi tài xế từ chối / không phản hồi — câu
 * chữ của thông báo khẩn (ADR 0066). Mục tiêu vận hành, KHÔNG phải một hạn hệ thống tự thi hành.
 */
export const DRIVER_REASSIGN_TARGET_MINUTES = 30;

/**
 * Nguồn của tài xế đang phủ một đơn `with_driver` (ADR 0067).
 *
 *  - `linked`   — tài khoản khách đã liên kết với bên thuê (ADR 0063), có lượt gán chờ/đã nhận;
 *  - `external` — tên + SĐT bên thuê ghi trên ĐÚNG đơn đó, không tài khoản, coi là đã nhận ngay.
 *
 * Hai nguồn loại trừ nhau trên một đơn (CHECK `bookings_external_driver_exclusive_check`).
 */
export const DRIVER_SOURCE = {
  LINKED: 'linked',
  EXTERNAL: 'external',
} as const;

export type DriverSource = (typeof DRIVER_SOURCE)[keyof typeof DRIVER_SOURCE];
export const DRIVER_SOURCE_VALUES = Object.values(DRIVER_SOURCE) as DriverSource[];

/**
 * Độ dài tên tài xế ngoài hệ thống (ký tự, sau khi cắt khoảng trắng hai đầu) — một luật cho DTO
 * API, form web và app native; trần khớp `bookings.external_driver_name VARCHAR(120)`.
 */
export const EXTERNAL_DRIVER_NAME_LENGTH = { MIN: 2, MAX: 120 } as const;

/**
 * Còn bấy nhiêu phút tới giờ nhận mà đơn `with_driver` đang `reserved` vẫn KHÔNG có ai phủ — không
 * lượt gán liên kết nào (kể cả đang chờ) và không tài xế ngoài hệ thống — thì worker báo KHẨN bên
 * thuê MỘT lần (ADR 0067 điều 2). Không huỷ đơn, không đổi đồng tiền nào. Giao diện khu quản lý
 * dùng cùng mốc để hiện cảnh báo trên đơn.
 */
export const DRIVER_MISSING_ALERT_LEAD_MINUTES = 120;

/**
 * Đơn `with_driver` CHƯA có ai phủ và giờ nhận đã vào vùng cảnh báo (`≤ DRIVER_MISSING_ALERT_LEAD_MINUTES`
 * phút, chưa qua giờ nhận) — một phép kiểm cho cảnh báo trên web/app. Worker dùng điều kiện SQL
 * tương đương ở `@xeprime/prisma` (`driverMissingAlertWhere`).
 */
export function isDriverMissingAlertDue(
  booking: { pickupAt: Date | string; hasDriver: boolean },
  now: Date = new Date(),
): boolean {
  if (booking.hasDriver) return false;
  const pickupMs = new Date(booking.pickupAt).getTime();
  if (!Number.isFinite(pickupMs)) return false;
  const left = pickupMs - now.getTime();
  return left > 0 && left <= DRIVER_MISSING_ALERT_LEAD_MINUTES * MINUTE_MS;
}

/**
 * Mã `audit_logs.action` của lượt gán tài xế mà API và worker cùng ghi — hai tiến trình phải ra
 * đúng MỘT mã để tra cứu/đối soát (ADR 0066). Đích luôn là `AUDIT_TARGET_TYPE.BOOKING`.
 */
export const DRIVER_ASSIGNMENT_AUDIT_ACTION = {
  /** Lượt `pending` quá `driver_respond_by` được trả về bên thuê (worker quét, hoặc tài xế Từ chối muộn). */
  RESPONSE_EXPIRED: 'booking.driver_response_expired',
  /** Bên thuê ghi / đổi tài xế NGOÀI HỆ THỐNG trên đơn (ADR 0067) — tên + SĐT trong audit đã che. */
  EXTERNAL_SET: 'booking.driver_external_set',
  /** Tài xế ngoài hệ thống bị xoá khỏi đơn (bỏ gán, hoặc thay bằng tài xế liên kết — ADR 0067). */
  EXTERNAL_CLEARED: 'booking.driver_external_cleared',
  /** Worker đã báo khẩn "chuyến sắp nhận chưa có tài xế" (ADR 0067 điều 2) — một lần mỗi đơn. */
  MISSING_ALERTED: 'booking.driver_missing_alerted',
  /** Tài xế đã nhận rồi RÚT khỏi chuyến (ADR 0074) — kèm lý do, vùng, hạn điều phối lại. */
  DROPPED: 'booking.driver_dropped',
} as const;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Số phút tài xế có để nhận/từ chối một lượt gán lập lúc `assignedAt` cho chuyến nhận lúc `pickupAt`. */
export function driverResponseWindowMinutes(assignedAt: Date, pickupAt: Date): number {
  const deltaMinutes = (pickupAt.getTime() - assignedAt.getTime()) / MINUTE_MS;
  // `!(x > 0)` bắt cả NaN (ngày hỏng) — rơi về sàn thay vì sinh một mốc NaN.
  if (!(deltaMinutes > 0)) return DRIVER_RESPONSE_WINDOW.MIN_MINUTES;
  return Math.min(
    DRIVER_RESPONSE_WINDOW.MAX_MINUTES,
    Math.max(
      DRIVER_RESPONSE_WINDOW.MIN_MINUTES,
      Math.round(deltaMinutes * DRIVER_RESPONSE_WINDOW.RATIO),
    ),
  );
}

/**
 * Hai khu của "Trung tâm Tài xế" (`/account/driving`, Figma `21768:51021`) — tham số URL `view`.
 * Mặc định (vắng tham số) là `trips`; thông báo lời mời đưa thẳng tới `partners`. Web, app native
 * và đích thông báo (`@xeprime/domain`) dùng chung chuỗi này.
 */
export const DRIVER_CENTER_VIEW_PARAM = 'view';
export const DRIVER_CENTER_VIEW = {
  TRIPS: 'trips',
  PARTNERS: 'partners',
} as const;
export type DriverCenterView = (typeof DRIVER_CENTER_VIEW)[keyof typeof DRIVER_CENTER_VIEW];

/**
 * Trần (giờ) của cửa sổ tài xế được TRẢ LẠI chuyến đã nhận — cùng công thức huỷ miễn phí của
 * khách (ADR 0066 điều 3): `clamp(20% × ΔT, 15′, trần)` với `ΔT = pickupAt − acceptedAt`, tính
 * XUÔI từ lúc nhận, kẹp bởi giờ nhận (sửa ADR 0063 điều 6, 26/10/2026).
 */
export const DRIVER_RELEASE_WINDOW_MAX_HOURS = 2;

/** Mốc cuối tài xế còn được trả lại chuyến đã nhận lúc `acceptedAt`. Server và client dùng chung. */
export function driverReleaseUntil(acceptedAt: Date, pickupAt: Date): Date {
  const leadMinutes = Math.max(0, (pickupAt.getTime() - acceptedAt.getTime()) / MINUTE_MS);
  const ratio = 0.2;
  const minutes = Math.min(
    DRIVER_RELEASE_WINDOW_MAX_HOURS * 60,
    Math.max(DRIVER_RESPONSE_WINDOW.MIN_MINUTES, Math.round(leadMinutes * ratio)),
  );
  return new Date(Math.min(acceptedAt.getTime() + minutes * MINUTE_MS, pickupAt.getTime()));
}

/** Mốc hết hạn trả lời — giá trị ghi vào `bookings.driver_respond_by`. */
export function driverRespondByFor(assignedAt: Date, pickupAt: Date): Date {
  return new Date(
    assignedAt.getTime() + driverResponseWindowMinutes(assignedAt, pickupAt) * MINUTE_MS,
  );
}

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
