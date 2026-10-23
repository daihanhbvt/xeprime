import type { Prisma } from '@xeprime/prisma';
import {
  BILLING_MODE,
  PARTNER_QUOTA_KIND,
  PLAN_EXPIRING_SOON_DAYS,
  PLATFORM_TENANT_PLAN_FILTER,
  SUBSCRIPTION_STATUS,
  parsePlanLimits,
  parsePlanQuota,
  VEHICLE_TYPE,
  packageTermCovering,
  resolveActivePackageTerms,
  resolveEffectiveBilling,
  type PartnerQuotaKind,
  type PlatformTenantPlanFilter,
} from '@xeprime/types';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PlanTermRefDto } from '../billing/dto/billing.dto';
import type { PlatformTenantPlanDto } from './dto/platform-tenant.dto';

const DAY_MS = 86_400_000;

/**
 * Kỳ đã XẾP LỊCH kế tiếp (`starts_at > now`) của từng tenant — MỘT truy vấn cho cả trang.
 *
 * `effectiveSubscriptionWhere` cố ý loại dòng này (nó chưa có hiệu lực), nên ai muốn nói "kỳ sau là
 * gói gì" phải hỏi riêng. Đi theo chỉ mục `(tenant_id, ends_at)`; số dòng tương lai mỗi tenant
 * nhỏ (thường 0–1), nên lấy hết rồi chọn dòng sớm nhất ở Node.
 */
export async function scheduledTermsByTenant(
  prisma: PrismaService | Prisma.TransactionClient,
  tenantIds: readonly string[],
  now: Date,
): Promise<Map<string, PlanTermRefDto>> {
  const out = new Map<string, PlanTermRefDto>();
  if (tenantIds.length === 0) return out;
  const rows = await prisma.tenantSubscription.findMany({
    where: {
      tenantId: { in: [...tenantIds] },
      status: SUBSCRIPTION_STATUS.ACTIVE,
      startsAt: { gt: now },
    },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      tenantId: true,
      startsAt: true,
      endsAt: true,
      plan: { select: { code: true, name: true } },
    },
  });
  for (const row of rows) {
    if (out.has(row.tenantId)) continue;
    out.set(row.tenantId, {
      subscriptionId: row.id,
      planName: row.plan.name,
      planCode: row.plan.code,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
    });
  }
  return out;
}

/** Dòng hiệu lực đã bắt đầu — đúng hình mà `listSelect` đọc (cửa sổ `EFFECTIVE_SUBSCRIPTION_ARGS`). */
export interface EffectiveTermRow {
  id: string;
  billingMode: string | null;
  vehicleScope: string;
  startsAt: Date;
  endsAt: Date;
  quotaJson: Prisma.JsonValue;
  plan: { code: string; name: string; limitsJson: Prisma.JsonValue };
}

/**
 * Trần xe snapshot của MỘT kỳ — ADR 0041 điều 3, biểu thức TƯỜNG MINH: `??` sẽ đọc một `null`
 * nghĩa "không giới hạn" thành "chưa khai".
 */
function termVehicleLimit(row: EffectiveTermRow): number | null {
  const quota = parsePlanQuota(row.quotaJson);
  return quota ? quota.maxVehicles : parsePlanLimits(row.plan.limitsJson).maxVehicles;
}

/**
 * Tóm tắt gói cho MỘT dòng danh sách — pha từ `resolveEffectiveBilling` (gộp mọi phạm vi loại xe,
 * ADR 0065), trần từ snapshot của từng kỳ.
 *
 * `vehicleLimit` là TỔNG trần theo LOẠI xe được phủ (gói ô tô 5 + gói xe máy 1 = 6; một kỳ `all`
 * tính một lần); một kỳ không giới hạn thì cả dòng không giới hạn. Chi tiết theo loại ở `terms`.
 */
export function tenantPlanSummary(
  rows: readonly EffectiveTermRow[],
  nextTerm: PlanTermRefDto | null,
  now: Date,
): PlatformTenantPlanDto {
  const billing = resolveEffectiveBilling(rows, now);
  const active = resolveActivePackageTerms(rows, now);
  const terms = active.map((term) => {
    const limit = termVehicleLimit(term.row);
    return {
      vehicleScope: term.vehicleScope,
      subscriptionId: term.row.id,
      planCode: term.row.plan.code,
      planName: term.row.plan.name,
      phase: term.billing.phase,
      startsAt: term.row.startsAt.toISOString(),
      endsAt: term.row.endsAt.toISOString(),
      graceEndsAt: term.billing.graceEndsAt?.toISOString() ?? null,
      vehicleLimitKind: limit === null ? PARTNER_QUOTA_KIND.UNLIMITED : PARTNER_QUOTA_KIND.TOTAL,
      vehicleLimit: limit,
    };
  });

  let vehicleLimitKind: PartnerQuotaKind = PARTNER_QUOTA_KIND.NOT_APPLICABLE;
  let vehicleLimit: number | null = null;
  if (active.length > 0) {
    /*
     * Cộng theo LOẠI XE ĐƯỢC PHỦ, không theo kỳ: một kỳ `all` đang ân hạn cạnh một kỳ ô tô còn hạn
     * mà cộng cả hai là đếm ô tô hai lần. Mỗi loại lấy đúng kỳ gác nó (`packageTermCovering` —
     * cùng phép với cổng tạo xe); một kỳ `all` gác cả hai loại chỉ được tính MỘT lần.
     */
    const covering = [VEHICLE_TYPE.CAR, VEHICLE_TYPE.MOTORBIKE]
      .map((type) => packageTermCovering(active, type))
      .filter((term): term is NonNullable<typeof term> => term !== null);
    const distinct = [...new Set(covering)];
    const limits = distinct.map((term) => termVehicleLimit(term.row));
    const unlimited = limits.some((limit) => limit === null);
    vehicleLimitKind = unlimited ? PARTNER_QUOTA_KIND.UNLIMITED : PARTNER_QUOTA_KIND.TOTAL;
    vehicleLimit = unlimited ? null : limits.reduce<number>((sum, limit) => sum + (limit ?? 0), 0);
  }
  const primary =
    active[0]?.row ?? [...rows].sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0] ?? null;

  return {
    phase: billing.phase,
    billingMode: billing.billingMode,
    planName: billing.planName,
    planCode: billing.planCode,
    termStartsAt: primary?.startsAt.toISOString() ?? null,
    endsAt: billing.planEndsAt?.toISOString() ?? null,
    graceEndsAt: billing.graceEndsAt?.toISOString() ?? null,
    vehicleLimitKind,
    vehicleLimit,
    terms,
    nextTerm,
  };
}

/**
 * Bộ lọc "Hạn gói" viết thành điều kiện DB — chạy TRƯỚC đếm và phân trang.
 *
 * Chỉ xét kỳ `package`: một dòng hoa hồng 0đ không phải "gói" theo nghĩa người vận hành hỏi.
 * "Sắp hết hạn" loại gian hàng đã có kỳ xếp sau vượt cửa sổ — họ đã gia hạn, không cần gọi.
 */
export function planStateWhere(
  state: PlatformTenantPlanFilter,
  now: Date,
): Prisma.TenantWhereInput {
  const running: Prisma.TenantSubscriptionWhereInput = {
    status: SUBSCRIPTION_STATUS.ACTIVE,
    billingMode: BILLING_MODE.PACKAGE,
    startsAt: { lte: now },
    endsAt: { gt: now },
  };
  switch (state) {
    case PLATFORM_TENANT_PLAN_FILTER.ACTIVE:
      return { subscriptions: { some: running } };
    case PLATFORM_TENANT_PLAN_FILTER.EXPIRING: {
      const soon = new Date(now.getTime() + PLAN_EXPIRING_SOON_DAYS * DAY_MS);
      return {
        AND: [
          { subscriptions: { some: { ...running, endsAt: { gt: now, lte: soon } } } },
          { subscriptions: { none: { status: SUBSCRIPTION_STATUS.ACTIVE, endsAt: { gt: soon } } } },
        ],
      };
    }
    case PLATFORM_TENANT_PLAN_FILTER.NONE:
      return { subscriptions: { none: running } };
    default: {
      // DTO đã chặn giá trị lạ bằng `@IsIn`; nhánh này để TypeScript bắt khi thêm một giá trị mới.
      const unreachable: never = state;
      return unreachable;
    }
  }
}
