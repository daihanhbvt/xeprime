import type { Prisma } from '@xeprime/prisma';
import {
  BILLING_MODE,
  BILLING_PHASE,
  PARTNER_QUOTA_KIND,
  PLAN_EXPIRING_SOON_DAYS,
  PLATFORM_TENANT_PLAN_FILTER,
  SUBSCRIPTION_STATUS,
  parsePlanLimits,
  parsePlanQuota,
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

/** Dòng hiệu lực gần nhất đã bắt đầu — đúng hình mà `listSelect` đọc. */
export interface EffectiveTermRow {
  billingMode: string | null;
  startsAt: Date;
  endsAt: Date;
  quotaJson: Prisma.JsonValue;
  plan: { code: string; name: string; limitsJson: Prisma.JsonValue };
}

/** Tóm tắt gói cho MỘT dòng danh sách — pha từ `resolveEffectiveBilling`, trần từ snapshot. */
export function tenantPlanSummary(
  row: EffectiveTermRow | null,
  nextTerm: PlanTermRefDto | null,
  now: Date,
): PlatformTenantPlanDto {
  const billing = resolveEffectiveBilling(row, now);
  const onPackageTerm =
    row !== null &&
    billing.billingMode === BILLING_MODE.PACKAGE &&
    (billing.phase === BILLING_PHASE.CURRENT || billing.phase === BILLING_PHASE.GRACE);

  let vehicleLimitKind: PartnerQuotaKind = PARTNER_QUOTA_KIND.NOT_APPLICABLE;
  let vehicleLimit: number | null = null;
  if (onPackageTerm) {
    // ADR 0041 điều 3: snapshot của dòng thuê bao trước, bằng biểu thức TƯỜNG MINH — `??` sẽ đọc
    // một `null` nghĩa "không giới hạn" thành "chưa khai".
    const quota = parsePlanQuota(row.quotaJson);
    const max = quota ? quota.maxVehicles : parsePlanLimits(row.plan.limitsJson).maxVehicles;
    vehicleLimitKind = max === null ? PARTNER_QUOTA_KIND.UNLIMITED : PARTNER_QUOTA_KIND.TOTAL;
    vehicleLimit = max;
  }

  return {
    phase: billing.phase,
    billingMode: billing.billingMode,
    planName: billing.planName,
    planCode: billing.planCode,
    termStartsAt: row?.startsAt.toISOString() ?? null,
    endsAt: billing.planEndsAt?.toISOString() ?? null,
    graceEndsAt: billing.graceEndsAt?.toISOString() ?? null,
    vehicleLimitKind,
    vehicleLimit,
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
