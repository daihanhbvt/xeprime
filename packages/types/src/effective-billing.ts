/**
 * "Tenant này ĐANG ở tuyến nào, ngay lúc này" — MỘT phép giải cho mọi nơi cần biết.
 *
 * Trước file này, câu hỏi đó có ba câu trả lời khác nhau chạy song song:
 *
 *   `BillingService.billingModeFor`    không có gói hiện hành ⇒ `package` (0đ/chuyến)
 *   `ListingsService.resolveBilling`   không có gói hiện hành ⇒ `package`
 *   `isCommissionTrack` (web)          không có `billingMode` ⇒ **hoa hồng**
 *
 * Ba câu trả lời đó chỉ trùng nhau khi tenant LUÔN có một gói còn hạn — và đó chính là điều
 * không đúng trong hai khoảng thời gian có thật:
 *
 *  1. **Ân hạn.** `currentSubscriptionWhere` đòi `ends_at > now`, nên ngay giây gói hết hạn là
 *     tenant không còn "gói hiện hành" nào. Job vòng đời thì đợi hết `graceDays` mới nối dòng
 *     mới. Trong cửa sổ đó, tiền chạy theo nhánh `package` (miễn phí) còn giao diện chạy theo
 *     nhánh hoa hồng — hai thứ nói ngược nhau về cùng một tenant.
 *  2. **Kỳ hoa hồng 12 tháng.** Mọi tenant đều được gán một dòng thuê bao hoa hồng 0đ kỳ hạn
 *     `COMMISSION_TRACK_TERM_MONTHS`. Khi kỳ đó hết, cửa sổ ở trên lặp lại — và với gói seed
 *     `graceDays = 7`, đó là 7 ngày mỗi 12 tháng mà mọi chuyến đều không thu phí dịch vụ VÀ
 *     không thu cọc, cho MỌI chủ xe cùng lúc (migration backfill gán chúng trong cùng một ngày).
 *
 * Bốn PHA dưới đây thay ba phép suy đó. Chúng là hàm thuần, không đụng Prisma, nên api, worker,
 * web và app native dùng chung đúng một luật — kỷ luật ADR 0024 đặt ra cho `billingMode` nhưng
 * chưa có chỗ để thực thi.
 *
 * ⚠️ `UNCONFIGURED` **không** được coi là một tuyến. Nó là lỗi cấu hình (danh mục gói rỗng, hoặc
 * một dòng thuê bao thiếu `billing_mode`), và nơi gọi phải xử lý tường minh: đường ĐỌC hiển thị
 * trạng thái chưa xác định, đường GHI TIỀN từ chối tạo đơn. Mặc định nó thành `package` là cách
 * một lỗi vận hành biến thành một chuỗi booking không thu phí mà không ai biết.
 */

import { BILLING_MODE, type BillingMode, isBillingMode } from './status/billing';
import {
  PLAN_VEHICLE_SCOPE,
  parsePlanLimits,
  planScopeCoversVehicleType,
  planVehicleScopeOf,
  type PlanVehicleScope,
} from './plan-billing';

const MS_PER_DAY = 86_400_000;

/** Mốc hết ân hạn = `ends_at` + `graceDays` ngày — phép DUY NHẤT (luật tiền + email hướng dẫn gói). */
export function graceEndsAtFor(endsAt: Date, graceDays: number): Date {
  return new Date(endsAt.getTime() + graceDays * MS_PER_DAY);
}


/**
 * Tenant đang ở đâu trong vòng đời gói.
 *
 * Bốn giá trị, và ranh giới giữa chúng là MỐC THỜI GIAN có thật trên dòng thuê bao — không phải
 * một cột trạng thái ai đó phải nhớ cập nhật.
 */
export const BILLING_PHASE = {
  /** Gói còn hạn (`starts_at <= now < ends_at`). */
  CURRENT: 'current',
  /** Hết hạn nhưng còn trong `graceDays` — mọi thứ giữ nguyên, kể cả năng lực nâng cao. */
  GRACE: 'grace',
  /** Hết hạn và hết ân hạn — tenant đã rơi về tuyến hoa hồng (ADR 0020 điều 5). */
  LAPSED: 'lapsed',
  /** Chưa từng có dòng thuê bao nào, hoặc dòng gần nhất thiếu `billing_mode`. LỖI CẤU HÌNH. */
  UNCONFIGURED: 'unconfigured',
} as const;

export type BillingPhase = (typeof BILLING_PHASE)[keyof typeof BILLING_PHASE];

/**
 * Một dòng thuê bao ĐÃ BẮT ĐẦU của tenant — hình dạng tối thiểu để chấm pha.
 *
 * Nơi gọi đọc các dòng gần nhất bằng `effectiveSubscriptionWhere` + `orderBy: { endsAt: 'desc' }`
 * (`EFFECTIVE_SUBSCRIPTION_ARGS` ở api). Cố ý nhận `Date` chứ không nhận chuỗi: cả Prisma lẫn
 * `JSON.parse` với reviver đều cho ra `Date`, và một phép so sánh chuỗi ISO lẫn múi giờ là đúng
 * loại lỗi file này sinh ra để chặn.
 */
export interface EffectiveSubscriptionRow {
  billingMode?: string | null;
  endsAt: Date;
  /** Phạm vi loại xe (ADR 0065). Thiếu ⇒ `all` — đúng phạm vi của mọi dòng trước ADR 0065. */
  vehicleScope?: string | null;
  plan: { code: string; name?: string | null; limitsJson: unknown };
}

export interface EffectiveBilling {
  phase: BillingPhase;
  /**
   * Tuyến đang áp dụng. `null` **chỉ** khi `phase === UNCONFIGURED`.
   *
   * Ở pha `LAPSED` giá trị là `COMMISSION` ngay cả khi dòng thuê bao vừa hết hạn là gói:
   * hết ân hạn là hết quyền dùng tuyến gói, và luật tiền không được chờ job vòng đời chạy
   * (job chạy mỗi giờ) mới có hiệu lực.
   */
  billingMode: BillingMode | null;
  /** Mã gói của dòng đang xét — để log và để màn "Gói của tôi" nói đúng tên. */
  planCode: string | null;
  /** Tên hiển thị của gói đang xét — nhãn tài khoản đọc nó, không tự dịch từ `planCode`. */
  planName: string | null;
  /**
   * ⚠️ KHÔNG có `commissionPercent` ở đây, có chủ đích.
   *
   * `tenant_subscriptions.commission_percent` là ảnh chụp % của BẬC GÓI lúc gán, và nó KHÔNG
   * phải con số nhân ra tiền: phí dịch vụ tính từ `fee_policies.service_fee_percent` bản
   * `active` (ADR 0029 điều 2 · `computeCustomerFees`). Không ràng buộc nào giữ hai số đó
   * khớp nhau, nên trả % ở đây là mời mọi nhãn trên giao diện nói một con số khác với con số
   * khách thật sự bị thu. Nơi cần % để HIỂN THỊ đọc thẳng chính sách phí đang hiệu lực.
   */
  /** `ends_at` của dòng đang xét. */
  planEndsAt: Date | null;
  /** Thời điểm hết ân hạn. `null` khi không có dòng nào, hoặc gói chưa hết hạn. */
  graceEndsAt: Date | null;
  /** Cờ năng lực nâng cao (ADR 0027) còn hiệu lực không — đúng ở `CURRENT` và `GRACE`. */
  featuresActive: boolean;
  /**
   * Phạm vi loại xe đang có kỳ GÓI hiệu lực (`current`/`grace`) — ADR 0065. Rỗng khi tenant không
   * ở tuyến gói. Thứ tự `PLAN_VEHICLE_SCOPE_VALUES` (`all` trước).
   */
  packageScopes: PlanVehicleScope[];
}

const UNCONFIGURED: EffectiveBilling = {
  phase: BILLING_PHASE.UNCONFIGURED,
  billingMode: null,
  planCode: null,
  planName: null,
  planEndsAt: null,
  graceEndsAt: null,
  featuresActive: false,
  packageScopes: [],
};

/**
 * Một kỳ GÓI đang có hiệu lực của một phạm vi loại xe (ADR 0065) — `current` hoặc `grace`.
 *
 * Tenant tuyến gói có thể chạy song song một kỳ ô tô và một kỳ xe máy; mỗi kỳ có pha RIÊNG (kỳ xe
 * máy đang ân hạn trong khi kỳ ô tô còn hạn là chuyện thường). Hạn mức xe hỏi kỳ phủ ĐÚNG loại xe
 * (`packageTermCovering`), cờ năng lực lấy HỢP các kỳ, còn tuyến của cả gian hàng là `package`
 * khi còn ÍT NHẤT MỘT kỳ như thế.
 */
export interface ActivePackageTerm<T extends EffectiveSubscriptionRow = EffectiveSubscriptionRow> {
  vehicleScope: PlanVehicleScope;
  row: T;
  billing: EffectiveBilling;
}

function asRows<T extends EffectiveSubscriptionRow>(
  input: T | readonly T[] | null | undefined,
): readonly T[] {
  if (!input) return [];
  return Array.isArray(input) ? (input as readonly T[]) : [input as T];
}

const latestFirst = <T extends EffectiveSubscriptionRow>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());

const SCOPE_RANK: Readonly<Record<PlanVehicleScope, number>> = {
  [PLAN_VEHICLE_SCOPE.ALL]: 0,
  [PLAN_VEHICLE_SCOPE.CAR]: 1,
  [PLAN_VEHICLE_SCOPE.MOTORBIKE]: 2,
};

/**
 * Các kỳ GÓI còn hiệu lực — mỗi phạm vi tối đa MỘT kỳ (dòng có `ends_at` muộn nhất của phạm vi
 * đó), sắp `current` trước `grace`, rồi theo `PLAN_VEHICLE_SCOPE_VALUES`.
 *
 * Một luật thứ tự giữ đúng hành vi trước ADR 0065: kỳ gói ĐANG ÂN HẠN không còn được tính khi một
 * dòng HOA HỒNG đang chạy đã thay nó (job vòng đời nối, hoặc admin hạ tuyến) — ngày trước phép chọn
 * "một dòng `ends_at` muộn nhất" tự cho ra đúng điều đó. Kỳ gói CÒN HẠN thì luôn thắng: dòng hoa
 * hồng đã xếp lịch/còn sót chỉ là dòng hệ thống, gói là thứ khách đã trả tiền.
 */
export function resolveActivePackageTerms<T extends EffectiveSubscriptionRow>(
  input: T | readonly T[] | null | undefined,
  now: Date,
): ActivePackageTerm<T>[] {
  const rows = latestFirst(asRows(input));
  const commissionRunning = rows.some(
    (row) =>
      row.billingMode === BILLING_MODE.COMMISSION &&
      resolveSingle(row, now).phase === BILLING_PHASE.CURRENT,
  );
  const seen = new Set<PlanVehicleScope>();
  const terms: ActivePackageTerm<T>[] = [];
  for (const row of rows) {
    if (row.billingMode !== BILLING_MODE.PACKAGE) continue;
    const scope = planVehicleScopeOf(row.vehicleScope);
    if (seen.has(scope)) continue;
    seen.add(scope);
    const billing = resolveSingle(row, now);
    if (billing.phase === BILLING_PHASE.CURRENT) {
      terms.push({ vehicleScope: scope, row, billing });
    } else if (billing.phase === BILLING_PHASE.GRACE && !commissionRunning) {
      terms.push({ vehicleScope: scope, row, billing });
    }
  }
  return terms.sort((a, b) => {
    const phase =
      Number(a.billing.phase !== BILLING_PHASE.CURRENT) -
      Number(b.billing.phase !== BILLING_PHASE.CURRENT);
    return phase !== 0 ? phase : SCOPE_RANK[a.vehicleScope] - SCOPE_RANK[b.vehicleScope];
  });
}

/**
 * Kỳ gói phủ loại xe `vehicleType` — `null` khi gian hàng không có kỳ gói hiệu lực nào cho loại
 * đó (cổng `PLAN_SCOPE_REQUIRED` của ADR 0065). Kỳ `current` thắng kỳ `grace`; cùng pha thì kỳ
 * `all` (bậc doanh nghiệp) thắng kỳ theo loại — đúng thứ tự của `resolveActivePackageTerms`.
 */
export function packageTermCovering<T extends EffectiveSubscriptionRow>(
  terms: readonly ActivePackageTerm<T>[],
  vehicleType: string,
): ActivePackageTerm<T> | null {
  return terms.find((term) => planScopeCoversVehicleType(term.vehicleScope, vehicleType)) ?? null;
}

/**
 * Chấm pha TUYẾN của cả gian hàng từ các dòng thuê bao gần nhất đã bắt đầu (ADR 0038 điều 1 ·
 * ADR 0065).
 *
 * Nhận MỘT dòng (cách gọi trước ADR 0065, vẫn đúng) hoặc một DANH SÁCH dòng:
 *  - còn ít nhất một kỳ GÓI hiệu lực ở bất kỳ phạm vi nào (`resolveActivePackageTerms`) ⇒ cả gian
 *    hàng ở tuyến `package`; pha `current` nếu có một kỳ còn hạn, ngược lại `grace` với mốc hết
 *    ân hạn MUỘN NHẤT — gian hàng chỉ rơi về hoa hồng khi KHÔNG còn phạm vi nào giữ được gói;
 *  - không còn kỳ gói nào ⇒ chấm dòng có `ends_at` muộn nhất, đúng phép một-dòng như cũ (dòng
 *    hoa hồng đang chạy ⇒ `commission`; gói đã qua ân hạn ⇒ `lapsed`).
 *
 * Rỗng nghĩa là tenant chưa có dòng nào đã bắt đầu — `UNCONFIGURED`, không phải "tuyến gói". Nơi
 * gọi quyết định hệ quả; xem docblock đầu file.
 */
export function resolveEffectiveBilling(
  input: EffectiveSubscriptionRow | readonly EffectiveSubscriptionRow[] | null | undefined,
  now: Date,
): EffectiveBilling {
  const rows = asRows(input);
  if (rows.length === 0) return UNCONFIGURED;

  const terms = resolveActivePackageTerms(rows, now);
  if (terms.length > 0) {
    const packageScopes = [...terms]
      .map((term) => term.vehicleScope)
      .sort((a, b) => SCOPE_RANK[a] - SCOPE_RANK[b]);
    const named = [...terms].sort((a, b) => SCOPE_RANK[a.vehicleScope] - SCOPE_RANK[b.vehicleScope]);
    const primary = terms[0]!;
    const current = primary.billing.phase === BILLING_PHASE.CURRENT;
    const latestGrace = terms.reduce<Date | null>(
      (max, term) =>
        term.billing.graceEndsAt && (!max || term.billing.graceEndsAt > max)
          ? term.billing.graceEndsAt
          : max,
      null,
    );
    const latestEnd = terms.reduce<Date>(
      (max, term) => (term.row.endsAt > max ? term.row.endsAt : max),
      primary.row.endsAt,
    );
    return {
      phase: current ? BILLING_PHASE.CURRENT : BILLING_PHASE.GRACE,
      billingMode: BILLING_MODE.PACKAGE,
      planCode: primary.billing.planCode,
      // Hai gói song song ⇒ nhãn tài khoản nói cả hai ("Ô tô 5 xe + Xe máy 1 xe").
      planName:
        named
          .map((term) => term.billing.planName)
          .filter((name): name is string => !!name)
          .join(' + ') || null,
      planEndsAt: current ? primary.row.endsAt : latestEnd,
      graceEndsAt: current ? null : latestGrace,
      featuresActive: true,
      packageScopes,
    };
  }

  return resolveSingle(latestFirst(rows)[0]!, now);
}

/** Phép chấm pha MỘT dòng — lõi của cả hai đường ở trên. */
function resolveSingle(row: EffectiveSubscriptionRow, now: Date): EffectiveBilling {
  const ownScopes: PlanVehicleScope[] =
    row.billingMode === BILLING_MODE.PACKAGE ? [planVehicleScopeOf(row.vehicleScope)] : [];

  /*
   * `billing_mode` là cột nullable (nó được THÊM vào sau, ở migration mở rộng gói theo chỗ) và
   * migration đó đã chép giá trị từ `plans` cho mọi dòng cũ. Một dòng còn NULL đến hôm nay là
   * dữ liệu lệch, không phải một tuyến thứ ba — nên nó đi cùng đường với "chưa cấu hình" thay
   * vì được đoán thành một bên nào đó.
   */
  if (!isBillingMode(row.billingMode)) return UNCONFIGURED;

  const planCode = row.plan.code;
  const planName = row.plan.name ?? null;
  const planEndsAt = row.endsAt;

  if (planEndsAt.getTime() > now.getTime()) {
    return {
      phase: BILLING_PHASE.CURRENT,
      billingMode: row.billingMode,
      planCode,
      planName,
      planEndsAt,
      graceEndsAt: null,
      featuresActive: true,
      packageScopes: ownScopes,
    };
  }

  const graceDays = parsePlanLimits(row.plan.limitsJson).graceDays;
  const graceEndsAt = graceEndsAtFor(planEndsAt, graceDays);

  if (graceEndsAt.getTime() > now.getTime()) {
    /*
     * Ân hạn = KHÔNG CÓ GÌ ĐỔI. Đây là điều tin nhắn vòng đời hứa với người dùng ("còn N ngày ân
     * hạn — gia hạn ngay để không chuyển sang tính hoa hồng"), nên nó phải đúng ở cả ba trục:
     * tuyến tiền giữ nguyên, năng lực nâng cao giữ nguyên, cổng vào Manage giữ nguyên.
     */
    return {
      phase: BILLING_PHASE.GRACE,
      billingMode: row.billingMode,
      planCode,
      planName,
      planEndsAt,
      graceEndsAt,
      featuresActive: true,
      packageScopes: ownScopes,
    };
  }

  return {
    phase: BILLING_PHASE.LAPSED,
    billingMode: BILLING_MODE.COMMISSION,
    planCode,
    planName,
    planEndsAt,
    graceEndsAt,
    featuresActive: false,
    packageScopes: [],
  };
}

/**
 * Tenant có đang ở TUYẾN GÓI không — câu hỏi mà cổng `/manage` và menu hỏi.
 *
 * `LAPSED` và `UNCONFIGURED` đều trả `false`: cả hai đều là "không có thuê bao hiệu lực", và
 * ADR 0027 điều 3 (như đã sửa 15/09/2026) nói lúc đó chủ xe về Owner Lite.
 */
export function isSubscriptionTrack(billing: EffectiveBilling): boolean {
  return billing.billingMode === BILLING_MODE.PACKAGE;
}

/**
 * Khoản HOÀN của một chuyến chảy vào ví nào — LUÔN ví của TÀI KHOẢN KHÁCH đã đặt chuyến đó
 * (ADR 0053 điều 8, bỏ ADR 0038 điều 2).
 *
 * Người đặt xe luôn là tài khoản realm `customer`, và tài khoản khách KHÔNG BAO GIỜ sở hữu tenant
 * (trigger `tenant_memberships_user_realm_check` ở DB). Chủ xe đi thuê xe dùng một tài khoản khách
 * riêng, nên tiền hoàn của họ vào ví của tài khoản khách ấy — không vào ví gian hàng. Hai tài
 * khoản, hai ví, không trộn: đó là ý nghĩa của "tách biệt về tiền" (ADR 0053).
 *
 * Giữ thành một hàm (thay vì gõ `{ type: 'user' }` tại chỗ) để ví và sổ tài khoản ngân hàng của
 * khoản hoàn vẫn đi qua CÙNG một câu trả lời — hai nơi tự quyết là hai nơi có thể lệch nhau.
 */
export function resolveRefundWalletOwner(customerUserId: string): {
  type: 'user';
  userId: string;
} {
  return { type: 'user', userId: customerUserId };
}

/**
 * Tuyến để TÍNH TIỀN, hoặc `null` khi chưa xác định được.
 *
 * Tách khỏi `billing.billingMode` bằng một cái tên riêng vì nơi gọi phải xử lý `null`: đường
 * ghi tiền từ chối, đường đọc hiển thị trạng thái chưa xác định. Trả thẳng `billingMode` thì
 * `?? PACKAGE` mọc lại ở nơi gọi, và đó chính là lỗi file này sinh ra để chặn.
 */
export function billingModeForMoney(billing: EffectiveBilling): BillingMode | null {
  return billing.billingMode;
}
