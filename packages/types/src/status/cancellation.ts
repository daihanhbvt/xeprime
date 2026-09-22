/**
 * HUỶ CHUYẾN — ai chịu trách nhiệm, vì lý do gì, và điều đó có vào chỉ số uy tín không.
 *
 * Vì sao là một bộ từ vựng riêng chứ không phải một chuỗi `reason` tự do trên `bookings`:
 *
 *  1. **Chỉ số uy tín công khai đọc nó.** "Tỉ lệ nhận và giữ chuyến" cần biết một chuyến hỏng vì
 *     chủ xe hay vì khách; một cột văn xuôi không trả lời được câu đó bằng SQL, và mọi cách suy
 *     từ `status` cuối đều sai ở ít nhất một ca (xem `hold_expired` của ADR 0039).
 *  2. **Trách nhiệm KHÔNG phải thứ người huỷ tự khai.** Nếu chủ xe chọn được nhãn "bất khả
 *     kháng" thì chỉ số uy tín biến mất trong một tuần. `responsibleParty` vì thế do SERVER suy
 *     từ người thao tác; nhóm lý do là thứ duy nhất người dùng chọn, và nó chỉ mô tả *vì sao*,
 *     không đổi *ai chịu*.
 *
 * ⚠️ Nhân viên gian hàng huỷ VẪN là phía gian hàng (`HOST`). Uỷ quyền là chuyện nội bộ của người
 * bán; với khách và với chỉ số, một chiếc xe bị rút lại vẫn là một chiếc xe bị rút lại.
 */

import { STATUS_COLOR, type StatusMeta } from './meta';

// ── Ai chịu trách nhiệm ─────────────────────────────────────────────────────

export const CANCELLATION_PARTY = {
  /** Gian hàng/chủ xe — kể cả khi người bấm là nhân viên được uỷ quyền. */
  HOST: 'host',
  /** Khách thuê tự huỷ hoặc không đến. */
  CUSTOMER: 'customer',
  /** XePrime huỷ (vi phạm, sự cố vận hành của nền tảng). Không tính cho chủ xe. */
  PLATFORM: 'platform',
  /**
   * Sự cố ngoài kiểm soát ĐÃ ĐƯỢC NỀN TẢNG XÁC MINH (thiên tai, xe bị tai nạn có hồ sơ…).
   *
   * ⚠️ CHỈ `platform_admin` đặt được giá trị này. Đường huỷ của gian hàng không bao giờ gán nó —
   * đó chính là cái chốt giữ cho chỉ số uy tín còn nghĩa.
   */
  FORCE_MAJEURE: 'force_majeure',
} as const;

export type CancellationParty = (typeof CANCELLATION_PARTY)[keyof typeof CANCELLATION_PARTY];
export const CANCELLATION_PARTY_VALUES = Object.values(
  CANCELLATION_PARTY,
) as CancellationParty[];

export function isCancellationParty(value: unknown): value is CancellationParty {
  return typeof value === 'string' && (CANCELLATION_PARTY_VALUES as string[]).includes(value);
}

export const CANCELLATION_PARTY_META: Readonly<Record<CancellationParty, StatusMeta>> = {
  [CANCELLATION_PARTY.HOST]: { label: 'Chủ xe huỷ', color: STATUS_COLOR.DANGER },
  [CANCELLATION_PARTY.CUSTOMER]: { label: 'Khách huỷ', color: STATUS_COLOR.NEUTRAL },
  [CANCELLATION_PARTY.PLATFORM]: { label: 'XePrime huỷ', color: STATUS_COLOR.SPECIAL },
  [CANCELLATION_PARTY.FORCE_MAJEURE]: {
    label: 'Sự cố bất khả kháng',
    color: STATUS_COLOR.WARNING,
  },
};

/**
 * Lượt huỷ này có tính vào chỉ số uy tín của gian hàng không — **hàm thuần, một nguồn**.
 *
 * Cả đường ghi (`booking_cancellations.counts_against_host`) lẫn đường đọc (chỉ số công khai,
 * điểm xếp hạng) đều hỏi đúng hàm này. Cột vẫn được LƯU chứ không suy lại lúc đọc: quyết định
 * "ai chịu" được chốt tại thời điểm huỷ, và đổi luật về sau không được viết lại lịch sử của một
 * gian hàng (cùng kỷ luật snapshot của ADR 0024).
 */
export function cancellationCountsAgainstHost(party: CancellationParty): boolean {
  return party === CANCELLATION_PARTY.HOST;
}

// ── Vì sao huỷ ──────────────────────────────────────────────────────────────

/**
 * Nhóm lý do — thứ DUY NHẤT người huỷ chọn.
 *
 * Có nhóm vì một ô văn xuôi không thống kê được: vận hành cần biết "xe hỏng" hay "khách đổi ý"
 * chiếm bao nhiêu phần trăm để sửa đúng chỗ. Ô chữ tự do vẫn còn, ở cạnh nhóm chứ không thay nó.
 *
 * KHÔNG có nhóm "bất khả kháng" ở đây: đó là `responsibleParty`, do nền tảng xác minh, không
 * phải một lựa chọn trong hộp thoại của chủ xe.
 */
export const CANCELLATION_REASON_CATEGORY = {
  /** Xe hỏng, tai nạn, đang bảo dưỡng ngoài kế hoạch. */
  VEHICLE_UNAVAILABLE: 'vehicle_unavailable',
  /** Trùng lịch, xe đã cho người khác thuê ngoài hệ thống. */
  SCHEDULE_CONFLICT: 'schedule_conflict',
  /** Khách không đáp ứng điều kiện thuê (giấy tờ, độ tuổi, lộ trình). */
  CUSTOMER_REQUIREMENTS: 'customer_requirements',
  /** Không liên hệ được với khách. */
  CUSTOMER_UNREACHABLE: 'customer_unreachable',
  /** Khách đổi ý / đổi kế hoạch. */
  CUSTOMER_CHANGED_PLAN: 'customer_changed_plan',
  /** Còn lại — bắt buộc kèm chữ giải thích. */
  OTHER: 'other',
} as const;

export type CancellationReasonCategory =
  (typeof CANCELLATION_REASON_CATEGORY)[keyof typeof CANCELLATION_REASON_CATEGORY];

export const CANCELLATION_REASON_CATEGORY_VALUES = Object.values(
  CANCELLATION_REASON_CATEGORY,
) as CancellationReasonCategory[];

export function isCancellationReasonCategory(
  value: unknown,
): value is CancellationReasonCategory {
  return (
    typeof value === 'string' &&
    (CANCELLATION_REASON_CATEGORY_VALUES as string[]).includes(value)
  );
}

export const CANCELLATION_REASON_CATEGORY_META: Readonly<
  Record<CancellationReasonCategory, StatusMeta>
> = {
  [CANCELLATION_REASON_CATEGORY.VEHICLE_UNAVAILABLE]: {
    label: 'Xe không sẵn sàng',
    color: STATUS_COLOR.WARNING,
  },
  [CANCELLATION_REASON_CATEGORY.SCHEDULE_CONFLICT]: {
    label: 'Trùng lịch',
    color: STATUS_COLOR.WARNING,
  },
  [CANCELLATION_REASON_CATEGORY.CUSTOMER_REQUIREMENTS]: {
    label: 'Khách chưa đáp ứng điều kiện thuê',
    color: STATUS_COLOR.NEUTRAL,
  },
  [CANCELLATION_REASON_CATEGORY.CUSTOMER_UNREACHABLE]: {
    label: 'Không liên hệ được khách',
    color: STATUS_COLOR.NEUTRAL,
  },
  [CANCELLATION_REASON_CATEGORY.CUSTOMER_CHANGED_PLAN]: {
    label: 'Khách đổi kế hoạch',
    color: STATUS_COLOR.NEUTRAL,
  },
  [CANCELLATION_REASON_CATEGORY.OTHER]: { label: 'Lý do khác', color: STATUS_COLOR.NEUTRAL },
};

/** Nhóm nào bắt buộc kèm chữ giải thích — `other` không nói được gì nếu đứng một mình. */
export function cancellationReasonNeedsText(category: CancellationReasonCategory): boolean {
  return category === CANCELLATION_REASON_CATEGORY.OTHER;
}

// ── Chặng lúc huỷ ───────────────────────────────────────────────────────────

/**
 * Chuyến đang ở đâu khi bị huỷ — quyết định đường TIỀN, nên nó được LƯU chứ không suy lại.
 *
 * Suy từ `status` cuối là sai: sau khi huỷ, yêu cầu và đơn đều mang một trạng thái kết thúc
 * giống nhau bất kể lúc đó tiền đã về hay chưa, mà đúng cái "lúc đó" mới là thứ giải thích được
 * vì sao khoản hoàn là 100% hay là một phần.
 */
export const CANCELLATION_STAGE = {
  /** Chuyến đã được nhận, khách chưa trả xong tiền giữ chỗ (ADR 0044 điều 2). */
  AWAITING_HOLD: 'awaiting_hold',
  /** LEGACY ADR 0039 — khách đã trả đủ, gian hàng chưa nhận. */
  HOLD_PAID: 'hold_paid',
  /** Đơn thuê đã tồn tại, xe chưa giao. */
  BOOKING_BEFORE_PICKUP: 'booking_before_pickup',
  /** Xe đã giao — chấm dứt sớm, đi qua quyết toán chứ không phải một lượt đổi trạng thái. */
  BOOKING_ACTIVE: 'booking_active',
} as const;

export type CancellationStage = (typeof CANCELLATION_STAGE)[keyof typeof CANCELLATION_STAGE];
export const CANCELLATION_STAGE_VALUES = Object.values(CANCELLATION_STAGE) as CancellationStage[];

export function isCancellationStage(value: unknown): value is CancellationStage {
  return typeof value === 'string' && (CANCELLATION_STAGE_VALUES as string[]).includes(value);
}

export const CANCELLATION_STAGE_META: Readonly<Record<CancellationStage, StatusMeta>> = {
  [CANCELLATION_STAGE.AWAITING_HOLD]: {
    label: 'Chờ khách thanh toán',
    color: STATUS_COLOR.WARNING,
  },
  [CANCELLATION_STAGE.HOLD_PAID]: { label: 'Đã thanh toán, chờ duyệt', color: STATUS_COLOR.INFO },
  [CANCELLATION_STAGE.BOOKING_BEFORE_PICKUP]: {
    label: 'Đơn đã tạo, chưa giao xe',
    color: STATUS_COLOR.INFO,
  },
  [CANCELLATION_STAGE.BOOKING_ACTIVE]: { label: 'Đang thuê', color: STATUS_COLOR.DANGER },
};
