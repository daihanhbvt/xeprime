/**
 * MỘT KỲ thuê bao nhìn từ hôm nay — và các mã đi cùng vòng đời của nó (ADR 0010 · ADR 0041).
 *
 * `tenant_subscriptions.status` chỉ LƯU `active | cancelled` (ADR 0010 điều 2). Một dòng `active`
 * có thể là kỳ ĐANG CHẠY, kỳ ĐÃ HẾT, hoặc kỳ ĐÃ XẾP LỊCH (gia hạn trước hạn nối đuôi kỳ đang chạy
 * — `starts_at = ends_at` của kỳ trước). In thẳng `status` ra màn hình là nói với người đọc rằng
 * gian hàng có hai gói cùng hiệu lực, trong khi tại mọi thời điểm chỉ có MỘT. Hàm dưới đây là
 * phép suy duy nhất, dùng chung cho web, api và app native.
 */

import { BILLING_MODE } from './status/billing';
import { STATUS_COLOR, type StatusMeta } from './status/meta';
import { SUBSCRIPTION_STATUS } from './status/misc';
import { planScopesConflict, planVehicleScopeOf } from './plan-billing';

export const SUBSCRIPTION_TERM_STATE = {
  /** `starts_at <= now < ends_at` — kỳ đang được tính. Tại mỗi thời điểm có tối đa một. */
  CURRENT: 'current',
  /** `starts_at > now` — kỳ đã xếp lịch (gia hạn/đổi gói từ kỳ sau), chưa có hiệu lực. */
  SCHEDULED: 'scheduled',
  /** `ends_at <= now` — kỳ đã qua. */
  ENDED: 'ended',
  /** Đã huỷ trước khi hết kỳ. */
  CANCELLED: 'cancelled',
} as const;

export type SubscriptionTermState =
  (typeof SUBSCRIPTION_TERM_STATE)[keyof typeof SUBSCRIPTION_TERM_STATE];

export const SUBSCRIPTION_TERM_STATE_VALUES = Object.values(
  SUBSCRIPTION_TERM_STATE,
) as SubscriptionTermState[];

export const SUBSCRIPTION_TERM_STATE_META: Readonly<Record<SubscriptionTermState, StatusMeta>> = {
  [SUBSCRIPTION_TERM_STATE.CURRENT]: { label: 'Đang hiệu lực', color: STATUS_COLOR.SUCCESS },
  [SUBSCRIPTION_TERM_STATE.SCHEDULED]: { label: 'Chờ đến kỳ', color: STATUS_COLOR.INFO },
  [SUBSCRIPTION_TERM_STATE.ENDED]: { label: 'Đã hết hạn', color: STATUS_COLOR.NEUTRAL },
  [SUBSCRIPTION_TERM_STATE.CANCELLED]: { label: 'Đã huỷ', color: STATUS_COLOR.NEUTRAL },
};

/** Hình dạng tối thiểu để chấm — nhận cả `Date` (Prisma) lẫn chuỗi ISO (JSON). */
export interface SubscriptionTermRow {
  status: string;
  startsAt: Date | string;
  endsAt: Date | string;
}

function toMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function subscriptionTermStateOf(
  row: SubscriptionTermRow,
  now: Date | number = Date.now(),
): SubscriptionTermState {
  if (row.status === SUBSCRIPTION_STATUS.CANCELLED) return SUBSCRIPTION_TERM_STATE.CANCELLED;
  const at = typeof now === 'number' ? now : now.getTime();
  if (toMs(row.startsAt) > at) return SUBSCRIPTION_TERM_STATE.SCHEDULED;
  if (toMs(row.endsAt) <= at) return SUBSCRIPTION_TERM_STATE.ENDED;
  return SUBSCRIPTION_TERM_STATE.CURRENT;
}

/**
 * Admin gán gói khi gian hàng đang còn một kỳ ĐÃ TRẢ TIỀN — kỳ mới bắt đầu lúc nào.
 *
 *  - `next_term` (mặc định, ADR 0010 điều 2): nối đuôi kỳ cuối cùng còn hạn. Kỳ đang chạy giữ
 *    nguyên tới hết — gia hạn sớm không được cắt ngắn một kỳ khách đã trả.
 *  - `now` (ADR 0041 điều 6 — "đổi bậc giữa kỳ là cancel() rồi assign()"): huỷ MỌI kỳ còn hạn
 *    (đang chạy + đã xếp lịch) và bắt đầu kỳ mới từ bây giờ, trong MỘT transaction. Hai lượt bấm
 *    rời nhau để lại một khoảng giữa hai request mà gian hàng không có gói nào.
 *
 * Phần còn lại của kỳ bị huỷ KHÔNG tự hoàn (prorate hoãn — ADR 0024): bù trừ là giá đàm phán
 * admin nhập cho kỳ mới.
 */
export const SUBSCRIPTION_CHANGE_TIMING = {
  NEXT_TERM: 'next_term',
  NOW: 'now',
} as const;

export type SubscriptionChangeTiming =
  (typeof SUBSCRIPTION_CHANGE_TIMING)[keyof typeof SUBSCRIPTION_CHANGE_TIMING];

export const SUBSCRIPTION_CHANGE_TIMING_VALUES = Object.values(
  SUBSCRIPTION_CHANGE_TIMING,
) as SubscriptionChangeTiming[];

/**
 * Mã hành động audit của vòng đời thuê bao. Tách bốn đường gán vì người đối soát doanh thu hỏi
 * bốn câu khác nhau: "ai mới vào gói", "ai gia hạn", "ai đổi bậc từ kỳ sau", "ai đổi bậc ngay
 * (và bỏ lại phần kỳ đã trả)".
 */
export const SUBSCRIPTION_AUDIT_ACTION = {
  /** Kỳ mới bắt đầu ngay vì không còn kỳ trả phí nào đang chạy (kể cả thay dòng hoa hồng 0đ). */
  ASSIGN: 'subscription.assign',
  /** Nối đuôi kỳ trả phí còn hạn, CÙNG bậc gói. */
  RENEW: 'subscription.renew',
  /** Nối đuôi kỳ trả phí còn hạn, KHÁC bậc gói — đổi gói có hiệu lực từ kỳ sau. */
  SCHEDULE_CHANGE: 'subscription.schedule_change',
  /** Huỷ các kỳ còn hạn và bắt đầu kỳ mới ngay. Mỗi kỳ bị huỷ có một dòng `CANCEL` riêng. */
  CHANGE_NOW: 'subscription.change_now',
  CANCEL: 'subscription.cancel',
  /** Webhook SePay nhận đủ tiền hoá đơn gói ⇒ bật kỳ (ADR 0022 · 0040). Do HỆ THỐNG ghi. */
  ACTIVATE_FROM_PAYMENT: 'subscription.activate_from_payment',
  /** Admin sửa giá / ngày kết thúc / hạn mức xe / ghi chú của một kỳ (ADR 0080 điều 2). */
  UPDATE: 'subscription.update',
  /** Kỳ xếp sau bị dời theo vì kỳ trước nó đổi ngày kết thúc — một dòng mỗi kỳ bị dời. */
  SHIFT: 'subscription.shift',
} as const;

/** Vì sao một kỳ bị huỷ — ghi vào `after.reason` của dòng audit `subscription.cancel`. */
export const SUBSCRIPTION_CANCEL_REASON = {
  /** Admin bấm Huỷ trên chính kỳ đó. */
  MANUAL: 'manual',
  /** Bị thay bởi một lượt "đổi gói ngay". */
  REPLACED: 'replaced',
  /** Huỷ kèm vì kỳ đứng trước nó trong chuỗi bị huỷ (ADR 0080 điều 1). */
  CASCADE: 'cascade',
} as const;

export type SubscriptionCancelReason =
  (typeof SUBSCRIPTION_CANCEL_REASON)[keyof typeof SUBSCRIPTION_CANCEL_REASON];

/** Bốn đường một lượt gán đi qua — một bảng quyết định, hai nơi đọc (server ghi, web xem trước). */
export const SUBSCRIPTION_ASSIGN_KIND = {
  ASSIGN: 'assign',
  RENEW: 'renew',
  SCHEDULE_CHANGE: 'schedule_change',
  CHANGE_NOW: 'change_now',
} as const;

export type SubscriptionAssignKind =
  (typeof SUBSCRIPTION_ASSIGN_KIND)[keyof typeof SUBSCRIPTION_ASSIGN_KIND];

/** Đường gán → mã audit. Mã audit là dữ liệu đối soát; đổi nó là đổi kết quả một truy vấn cũ. */
export const SUBSCRIPTION_ASSIGN_KIND_ACTION: Readonly<Record<SubscriptionAssignKind, string>> = {
  [SUBSCRIPTION_ASSIGN_KIND.ASSIGN]: SUBSCRIPTION_AUDIT_ACTION.ASSIGN,
  [SUBSCRIPTION_ASSIGN_KIND.RENEW]: SUBSCRIPTION_AUDIT_ACTION.RENEW,
  [SUBSCRIPTION_ASSIGN_KIND.SCHEDULE_CHANGE]: SUBSCRIPTION_AUDIT_ACTION.SCHEDULE_CHANGE,
  [SUBSCRIPTION_ASSIGN_KIND.CHANGE_NOW]: SUBSCRIPTION_AUDIT_ACTION.CHANGE_NOW,
};

/** Mã audit → đường gán; `null` nếu không phải một lượt gán. */
export function subscriptionAssignKindOfAction(action: string): SubscriptionAssignKind | null {
  const entry = Object.entries(SUBSCRIPTION_ASSIGN_KIND_ACTION).find(([, code]) => code === action);
  return entry ? (entry[0] as SubscriptionAssignKind) : null;
}

/** Một kỳ trong chuỗi — đủ để quyết định nối đuôi / huỷ / thay. */
export interface SubscriptionChainTerm extends SubscriptionTermRow {
  id: string;
  planId: string;
  billingMode?: string | null;
  /** Phạm vi loại xe (ADR 0065). Thiếu ⇒ `all` — xung đột với mọi phạm vi, đúng hành vi cũ. */
  vehicleScope?: string | null;
}

/**
 * Chỉ giữ các kỳ ở phạm vi XUNG ĐỘT với `scope` (ADR 0065) — kỳ ô tô không nối đuôi, không huỷ,
 * không chặn huỷ một kỳ xe máy. Dòng hoa hồng (phạm vi `all`) xung đột với mọi phạm vi nên luôn ở
 * lại: nó vẫn nhường chỗ cho bất kỳ lượt gán gói nào.
 */
function termsConflictingWith<T extends SubscriptionChainTerm>(
  terms: readonly T[],
  scope: string | null | undefined,
): T[] {
  const target = planVehicleScopeOf(scope);
  return terms.filter((term) => planScopesConflict(planVehicleScopeOf(term.vehicleScope), target));
}

export interface SubscriptionChainPlan<T extends SubscriptionChainTerm> {
  /** Kỳ mới bắt đầu lúc này. */
  startsAt: Date;
  kind: SubscriptionAssignKind;
  /** Kỳ TRẢ PHÍ mà kỳ mới nối đuôi (gia hạn / đổi gói từ kỳ sau). */
  previous: T | null;
  /** Các kỳ còn hạn phải HUỶ trong cùng transaction với lượt gán. */
  cancel: T[];
}

const isLiveTerm = (term: SubscriptionChainTerm, at: number) =>
  term.status === SUBSCRIPTION_STATUS.ACTIVE && toMs(term.endsAt) > at;

/** Dòng hoa hồng 0đ là dòng HỆ THỐNG; mọi dòng khác (kể cả dòng cũ thiếu `billing_mode`) là kỳ trả phí. */
const isPaidTerm = (term: SubscriptionChainTerm) => term.billingMode !== BILLING_MODE.COMMISSION;

/**
 * Lượt gán MỚI đặt vào chuỗi kỳ ở đâu — MỘT phép cho cả ba đường tạo thuê bao (admin gán, webhook
 * kích hoạt khi tiền về) và cho phần xem trước ở web.
 *
 * | Thời điểm | Còn kỳ trả phí? | Bắt đầu | Huỷ | Đường |
 * | --- | --- | --- | --- | --- |
 * | `now` | có | `now` | MỌI kỳ còn hạn | `change_now` |
 * | `now` | không | `now` | mọi kỳ còn hạn (dòng hoa hồng) | `assign` |
 * | `next_term` | có | `ends_at` của kỳ TRẢ PHÍ muộn nhất | dòng hoa hồng còn hạn | `renew` / `schedule_change` |
 * | `next_term` | không | `now` | dòng hoa hồng còn hạn | `assign` |
 *
 * Đuôi chỉ chọn trong kỳ TRẢ PHÍ: một dòng hoa hồng đã xếp lịch sau kỳ gói (hạ về hoa hồng từ kỳ
 * sau) mà được chọn làm đuôi thì lượt gán kế tiếp sẽ huỷ nó rồi bắt đầu từ `now` — chồng lên kỳ
 * gói đang chạy. Dòng hoa hồng không phải kỳ ai trả tiền: nó luôn nhường chỗ, không bao giờ được nối.
 *
 * **Theo phạm vi loại xe (ADR 0065).** Bảng trên chỉ áp lên các kỳ XUNG ĐỘT với phạm vi của bậc
 * được gán (`planScopesConflict`): gán `car_5` không đụng tới kỳ `moto_1` đang chạy, còn gán bậc
 * `all` (doanh nghiệp) nối đuôi/huỷ mọi kỳ. Đó đúng là phép EXCLUDE ở DB, nên lượt gán mà hàm này
 * đề xuất không bao giờ bị ràng buộc từ chối.
 */
export function planSubscriptionChain<T extends SubscriptionChainTerm>(
  terms: readonly T[],
  input: { planId: string; timing?: string | null; vehicleScope?: string | null },
  now: Date,
): SubscriptionChainPlan<T> {
  const at = now.getTime();
  const live = termsConflictingWith(terms, input.vehicleScope).filter((term) =>
    isLiveTerm(term, at),
  );
  const paidLive = live.filter(isPaidTerm);

  if (input.timing === SUBSCRIPTION_CHANGE_TIMING.NOW) {
    return {
      startsAt: now,
      kind:
        paidLive.length > 0 ? SUBSCRIPTION_ASSIGN_KIND.CHANGE_NOW : SUBSCRIPTION_ASSIGN_KIND.ASSIGN,
      previous: null,
      cancel: live,
    };
  }

  const tail = paidLive.reduce<T | null>(
    (best, term) => (!best || toMs(term.endsAt) > toMs(best.endsAt) ? term : best),
    null,
  );
  const cancel = live.filter((term) => !isPaidTerm(term));
  if (!tail) {
    return { startsAt: now, kind: SUBSCRIPTION_ASSIGN_KIND.ASSIGN, previous: null, cancel };
  }
  return {
    startsAt: new Date(toMs(tail.endsAt)),
    kind:
      tail.planId === input.planId
        ? SUBSCRIPTION_ASSIGN_KIND.RENEW
        : SUBSCRIPTION_ASSIGN_KIND.SCHEDULE_CHANGE,
    previous: tail,
    cancel,
  };
}

/**
 * Các kỳ còn hạn XẾP SAU `term` trong chuỗi của nó — thứ đi cùng nó khi nó bị huỷ hoặc bị dời
 * ngày kết thúc (ADR 0080 điều 1–2).
 *
 * "Trong chuỗi" là BAO ĐÓNG xung đột phạm vi (ADR 0065), không chỉ cùng phạm vi với `term`: huỷ
 * kỳ xe máy kéo theo kỳ doanh nghiệp (`all`) xếp sau nó, và kỳ ô tô xếp sau kỳ doanh nghiệp đó
 * cũng đi theo — để nó lại là để một khoảng trống giữa kỳ ô tô đang chạy và kỳ ô tô tương lai.
 * Duyệt theo `startsAt` tăng dần nên một kỳ chỉ được kéo theo bởi kỳ bắt đầu TRƯỚC nó.
 *
 * Dòng hoa hồng đã xếp lịch (hạ về hoa hồng từ kỳ sau, phạm vi `all`) cũng thuộc chuỗi.
 */
export function laterChainTermsOf<T extends SubscriptionChainTerm>(
  term: SubscriptionChainTerm,
  terms: readonly T[],
  now: Date | number = Date.now(),
): T[] {
  const at = typeof now === 'number' ? now : now.getTime();
  const startsAt = toMs(term.startsAt);
  const candidates = terms
    .filter(
      (other) => other.id !== term.id && isLiveTerm(other, at) && toMs(other.startsAt) > startsAt,
    )
    .sort((a, b) => toMs(a.startsAt) - toMs(b.startsAt));
  const scopes = [planVehicleScopeOf(term.vehicleScope)];
  const chain: T[] = [];
  for (const other of candidates) {
    const scope = planVehicleScopeOf(other.vehicleScope);
    if (!scopes.some((included) => planScopesConflict(included, scope))) continue;
    chain.push(other);
    scopes.push(scope);
  }
  return chain;
}

/** Vì sao một kỳ KHÔNG huỷ được — `null` là huỷ được. */
export const SUBSCRIPTION_CANCEL_BLOCK = {
  /** Đã huỷ hoặc đã hết hạn — không còn gì để huỷ. */
  NOT_LIVE: 'not_live',
  /**
   * Dòng hoa hồng ĐANG CHẠY — huỷ nó chỉ để hệ thống gán lại đúng dòng đó; đổi tuyến bằng cách GÁN
   * gói. (Dòng hoa hồng đã XẾP LỊCH — hạ về hoa hồng từ kỳ sau — thì huỷ được: đó là huỷ lịch hạ.)
   */
  DEFAULT_TERM: 'default_term',
} as const;

export type SubscriptionCancelBlock =
  (typeof SUBSCRIPTION_CANCEL_BLOCK)[keyof typeof SUBSCRIPTION_CANCEL_BLOCK];

/**
 * Huỷ được một kỳ khi: còn hạn và không phải dòng hoa hồng đang chạy. Server
 * (`BillingService.cancel`) và nút "Huỷ" ở web đọc cùng một luật.
 *
 * Kỳ có kỳ xếp sau VẪN huỷ được (ADR 0080 điều 1, thay luật "chỉ huỷ ở đuôi" của ADR 0041 điều 6.4):
 * các kỳ trong `laterChainTermsOf` bị huỷ cùng nó, trong cùng transaction — chuỗi không bao giờ bị
 * hở một khoảng.
 */
export function subscriptionCancelBlockOf(
  term: SubscriptionChainTerm,
  now: Date | number = Date.now(),
): SubscriptionCancelBlock | null {
  const at = typeof now === 'number' ? now : now.getTime();
  if (!isLiveTerm(term, at)) return SUBSCRIPTION_CANCEL_BLOCK.NOT_LIVE;
  if (!isPaidTerm(term) && toMs(term.startsAt) <= at) return SUBSCRIPTION_CANCEL_BLOCK.DEFAULT_TERM;
  return null;
}

/** Vì sao một kỳ KHÔNG sửa được — `null` là sửa được (ADR 0080 điều 2). */
export const SUBSCRIPTION_EDIT_BLOCK = {
  /** Đã huỷ hoặc đã hết hạn. */
  NOT_LIVE: 'not_live',
  /** Dòng hoa hồng — không có giá, không có hạn mức mua; đổi tuyến bằng cách gán gói. */
  COMMISSION_TERM: 'commission_term',
} as const;

export type SubscriptionEditBlock =
  (typeof SUBSCRIPTION_EDIT_BLOCK)[keyof typeof SUBSCRIPTION_EDIT_BLOCK];

export function subscriptionEditBlockOf(
  term: SubscriptionChainTerm,
  now: Date | number = Date.now(),
): SubscriptionEditBlock | null {
  const at = typeof now === 'number' ? now : now.getTime();
  if (!isLiveTerm(term, at)) return SUBSCRIPTION_EDIT_BLOCK.NOT_LIVE;
  if (!isPaidTerm(term)) return SUBSCRIPTION_EDIT_BLOCK.COMMISSION_TERM;
  return null;
}

/**
 * Ngày kết thúc mới xa nhất admin được đặt, tính từ hôm nay — chặn một lỗi gõ năm (2062) biến
 * thành gói tặng vài chục năm. Kỳ hạn bán dài nhất là 12 tháng; ba năm là thừa cho mọi gia hạn tay.
 */
export const SUBSCRIPTION_EDIT_MAX_END_MONTHS = 36;

/**
 * Ngày kết thúc mới có hợp lệ không: sau ngày bắt đầu, sau BÂY GIỜ (rút về quá khứ là huỷ — dùng
 * nút Huỷ), và không xa quá `SUBSCRIPTION_EDIT_MAX_END_MONTHS`.
 */
export function subscriptionEndsAtValid(
  term: Pick<SubscriptionChainTerm, 'startsAt'>,
  endsAt: Date | string,
  now: Date | number = Date.now(),
): boolean {
  const at = typeof now === 'number' ? now : now.getTime();
  const end = toMs(endsAt);
  if (!Number.isFinite(end)) return false;
  const max = new Date(at);
  max.setUTCMonth(max.getUTCMonth() + SUBSCRIPTION_EDIT_MAX_END_MONTHS);
  return end > toMs(term.startsAt) && end > at && end <= max.getTime();
}

export interface SubscriptionShift<T> {
  term: T;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Dời ngày kết thúc của `term` thì các kỳ xếp sau nó (`laterChainTermsOf`) dời theo CÙNG một
 * khoảng, giữ nguyên độ dài (ADR 0080 điều 2): kéo dài không đè lên kỳ sau, rút ngắn không để hở.
 * Kỳ ngoài chuỗi không đụng tới; nếu dời làm một kỳ trong chuỗi chồng lên nó, EXCLUDE ở DB từ chối
 * (`SUBSCRIPTION_TERM_CONFLICT`).
 */
export function subscriptionShiftPlan<T extends SubscriptionChainTerm>(
  term: SubscriptionChainTerm,
  terms: readonly T[],
  endsAt: Date,
  now: Date | number = Date.now(),
): SubscriptionShift<T>[] {
  const delta = endsAt.getTime() - toMs(term.endsAt);
  if (delta === 0) return [];
  return laterChainTermsOf(term, terms, now).map((other) => ({
    term: other,
    startsAt: new Date(toMs(other.startsAt) + delta),
    endsAt: new Date(toMs(other.endsAt) + delta),
  }));
}

/**
 * Khoá tư vấn của CHUỖI KỲ một tenant — mọi đường GHI `tenant_subscriptions` (admin gán/huỷ,
 * webhook kích hoạt, job hết hạn) lấy cùng khoá này trước khi đọc "đuôi", nên hai lượt song song
 * không cùng nối sau một đuôi hay cùng thấy "chưa có gói". Dùng: `pg_advisory_xact_lock(hashtext(key))`.
 *
 * ⚠️ Khoá theo TENANT, không theo phạm vi loại xe (ADR 0065) — có chủ đích. Chồng lấn giữa hai kỳ
 * gói đã có EXCLUDE ở DB canh; thứ khoá này giữ là các quyết định NHÌN XUYÊN phạm vi: "huỷ kỳ CUỐI
 * CÙNG còn hạn thì gán lại dòng hoa hồng", "job chỉ hạ về hoa hồng khi không còn phạm vi nào giữ
 * gói". Hai lượt huỷ ô tô và xe máy song song dưới hai khoá riêng sẽ cùng thấy phạm vi kia "còn",
 * và gian hàng rơi vào pha `unconfigured`. Tranh chấp theo tenant thì rẻ: vài lượt ghi mỗi tháng.
 */
export function subscriptionChainLockKey(tenantId: string): string {
  return `subscription-chain:${tenantId}`;
}

/** Ai tạo ra một kỳ — để giao diện nói thay cho ghi chú hệ thống viết cứng trong DB. */
export const SUBSCRIPTION_ORIGIN = {
  /** Quản trị nền tảng gán tay. */
  ADMIN: 'admin',
  /** Kích hoạt tự động khi nhận đủ tiền hoá đơn gói. */
  PAYMENT: 'payment',
  /** Dòng hoa hồng mặc định hệ thống gán (mở gian hàng, hoặc gói hết hạn + ân hạn). */
  SYSTEM: 'system',
} as const;

export type SubscriptionOrigin = (typeof SUBSCRIPTION_ORIGIN)[keyof typeof SUBSCRIPTION_ORIGIN];

export const SUBSCRIPTION_ORIGIN_VALUES = Object.values(
  SUBSCRIPTION_ORIGIN,
) as SubscriptionOrigin[];

export function subscriptionOriginOf(row: {
  createdBy: string | null;
  billingMode?: string | null;
}): SubscriptionOrigin {
  if (row.createdBy) return SUBSCRIPTION_ORIGIN.ADMIN;
  return row.billingMode === BILLING_MODE.COMMISSION
    ? SUBSCRIPTION_ORIGIN.SYSTEM
    : SUBSCRIPTION_ORIGIN.PAYMENT;
}

/**
 * Bộ lọc "Hạn gói" ở danh sách gian hàng gói của admin nền tảng — ba câu người vận hành hỏi
 * mỗi tuần: ai đang chạy, ai sắp phải gia hạn, ai đã rớt/chưa từng kích hoạt.
 */
export const PLATFORM_TENANT_PLAN_FILTER = {
  /** Có một kỳ gói (`package`) đang chạy. */
  ACTIVE: 'active',
  /** Kỳ gói đang chạy hết trong `PLAN_EXPIRING_SOON_DAYS` ngày VÀ chưa có kỳ nào xếp sau. */
  EXPIRING: 'expiring',
  /** Không có kỳ gói nào đang chạy — đang ân hạn, đã hết, hoặc chưa kích hoạt. */
  NONE: 'none',
} as const;

export type PlatformTenantPlanFilter =
  (typeof PLATFORM_TENANT_PLAN_FILTER)[keyof typeof PLATFORM_TENANT_PLAN_FILTER];

export const PLATFORM_TENANT_PLAN_FILTER_VALUES = Object.values(
  PLATFORM_TENANT_PLAN_FILTER,
) as PlatformTenantPlanFilter[];

/** Cửa sổ "sắp hết hạn" — dùng chung cho bộ lọc server và nhãn cảnh báo ở web. */
export const PLAN_EXPIRING_SOON_DAYS = 14;

const MS_PER_DAY = 86_400_000;

/**
 * Số ngày còn lại tới một mốc (làm tròn LÊN, không âm) — "còn 3 ngày" cho một kỳ hết hạn sau
 * 2 ngày 1 giờ. Mốc đã qua ⇒ 0. Hiển thị thôi: luật tiền không bao giờ đọc con số này.
 */
export function daysLeftUntil(target: Date | string, now: Date | number = Date.now()): number {
  const at = typeof now === 'number' ? now : now.getTime();
  return Math.max(0, Math.ceil((toMs(target) - at) / MS_PER_DAY));
}
