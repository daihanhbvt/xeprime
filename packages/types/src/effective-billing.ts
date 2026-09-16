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
import { parsePlanLimits } from './plan-billing';

const MS_PER_DAY = 86_400_000;


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
 * Dòng thuê bao gần nhất ĐÃ BẮT ĐẦU của tenant — hình dạng tối thiểu để chấm pha.
 *
 * Nơi gọi chọn nó bằng `effectiveSubscriptionWhere` + `orderBy: { endsAt: 'desc' }, take: 1`.
 * Cố ý nhận `Date` chứ không nhận chuỗi: cả Prisma lẫn `JSON.parse` với reviver đều cho ra
 * `Date`, và một phép so sánh chuỗi ISO lẫn múi giờ là đúng loại lỗi file này sinh ra để chặn.
 */
export interface EffectiveSubscriptionRow {
  billingMode?: string | null;
  endsAt: Date;
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
}

const UNCONFIGURED: EffectiveBilling = {
  phase: BILLING_PHASE.UNCONFIGURED,
  billingMode: null,
  planCode: null,
  planName: null,
  planEndsAt: null,
  graceEndsAt: null,
  featuresActive: false,
};

/**
 * Chấm pha từ dòng thuê bao gần nhất đã bắt đầu.
 *
 * `row = null` nghĩa là tenant chưa có dòng nào đã bắt đầu — `UNCONFIGURED`, không phải "tuyến
 * gói". Nơi gọi quyết định hệ quả; xem docblock đầu file.
 */
export function resolveEffectiveBilling(
  row: EffectiveSubscriptionRow | null | undefined,
  now: Date,
): EffectiveBilling {
  if (!row) return UNCONFIGURED;

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
    };
  }

  const graceDays = parsePlanLimits(row.plan.limitsJson).graceDays;
  const graceEndsAt = new Date(planEndsAt.getTime() + graceDays * MS_PER_DAY);

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
 * Khoản HOÀN của một người chảy vào ví nào — `tenant` nếu họ là chủ xe, `user` nếu không.
 *
 * Từ 15/09/2026 một chủ xe có ĐÚNG MỘT ví, và nó thuộc tenant: tiền hoàn khi chính họ đi thuê và
 * khoản XePrime phải trả cho chuyến họ cho thuê nằm chung một sổ. Trước đó là hai ví không bao
 * giờ gặp nhau — hai số dư, hai ngưỡng rút tối thiểu, hai lệnh chuyển tay cho cùng một người.
 *
 * ⚠️ Câu hỏi là "người này có SỞ HỮU một tenant không", KHÔNG phải "tenant đó thuộc tuyến nào".
 * Quyền sở hữu ví không phụ thuộc tuyến: chủ xe hoa hồng nâng lên gói thì vẫn đúng cái ví đó, và
 * đó chính là lý do nâng cấp không phải chuyển một đồng nào.
 *
 * Tra ở thời điểm CHỐT (không đóng băng lên hold) là an toàn, vì sau khi đổi chủ ví thì người đó
 * KHÔNG CÒN ví `user` nào: nếu nơi gọi hỏi sai, `ensureWalletWithinTx` sẽ tạo một ví thứ hai —
 * và đó là cách duy nhất mô hình này hỏng. Hàm này và bước đổi chủ dùng chung một câu hỏi, nên
 * hai bên luôn cho cùng một đáp án.
 *
 * `ownedTenantId` do nơi gọi tra: membership `active` với `roleKey = shop_owner`. Nhiều tenant
 * thì lấy membership CŨ NHẤT — cùng thứ tự mà `/auth/me` và `TenantScopeGuard` dùng, nếu không
 * tiền sẽ nằm ở một tenant mà phiên của họ không bao giờ scope tới.
 */
export function resolveRefundWalletOwner(
  customerUserId: string,
  ownedTenantId: string | null | undefined,
):
  | { type: 'tenant'; tenantId: string }
  | { type: 'user'; userId: string } {
  return ownedTenantId
    ? { type: 'tenant', tenantId: ownedTenantId }
    : { type: 'user', userId: customerUserId };
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
