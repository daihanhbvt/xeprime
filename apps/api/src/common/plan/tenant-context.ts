import type { Prisma } from '@xeprime/prisma';
import {
  SHOP_ONBOARDING_STATE,
  isPlanFeature,
  isShopOnboardingState,
  type Permission,
  type TenantRole,
} from '@xeprime/types';
import type { SupportScope, TenantContext } from '../types/request-context';
import {
  EFFECTIVE_SUBSCRIPTION_ARGS,
  effectiveSubscriptionWhere,
  resolveTenantFeatures,
} from './feature-state';

/**
 * Phần `tenants` mà `TenantContext` cần — MỘT định nghĩa cho cả hai đường vào scope:
 * membership của chính người dùng (`TenantScopeGuard`) và phiên hỗ trợ của nhân sự nền tảng
 * (ADR 0050). Hai đường mà mỗi đường tự chọn cột là hai đường sẽ lệch nhau ở lần thêm cột kế tiếp
 * — và bên lệch sẽ là bên cổng tuyến/cổng gói đọc sai.
 */
export function tenantContextSelect(now: Date) {
  return {
    id: true,
    name: true,
    status: true,
    // Trục ĐĂNG KÝ (ADR 0040) — hai cổng đọc nó ở mọi request tenant-scoped.
    onboardingState: true,
    deletedAt: true,
    usedFeatures: true,
    subscriptions: {
      where: effectiveSubscriptionWhere(now),
      ...EFFECTIVE_SUBSCRIPTION_ARGS,
    },
  } satisfies Prisma.TenantSelect;
}

export type TenantContextRow = Prisma.TenantGetPayload<{
  select: ReturnType<typeof tenantContextSelect>;
}>;

export function buildTenantContext(
  tenant: TenantContextRow,
  now: Date,
  roleKey: TenantRole,
  permissions: readonly Permission[],
  support?: SupportScope,
): TenantContext {
  const plan = resolveTenantFeatures(tenant.subscriptions[0] ?? null, tenant.usedFeatures, now);
  return {
    tenantId: tenant.id,
    tenantStatus: tenant.status,
    /*
     * Lọc qua `isShopOnboardingState`: CHECK ở DB đã canh, nhưng cột là `varchar` nên kiểu
     * Prisma vẫn là `string`. Giá trị lạ rơi về `commission` — mức KHÔNG cấp gì và không
     * chặn gì thêm, cùng kỷ luật mà `usedFeatures` ngay dưới dùng.
     */
    onboardingState: isShopOnboardingState(tenant.onboardingState)
      ? tenant.onboardingState
      : SHOP_ONBOARDING_STATE.COMMISSION,
    roleKey,
    permissions,
    features: plan.features,
    // Lọc qua `isPlanFeature`: CHECK ở DB đã canh, nhưng cột là `text[]` nên kiểu Prisma vẫn là
    // `string[]` — lọc ở đây để không có chuỗi lạ nào lọt vào union.
    usedFeatures: tenant.usedFeatures.filter(isPlanFeature),
    planCode: plan.planCode,
    planEndsAt: plan.planEndsAt?.toISOString() ?? null,
    billingMode: plan.billingMode,
    billingPhase: plan.phase,
    graceEndsAt: plan.graceEndsAt?.toISOString() ?? null,
    ...(support ? { support } : {}),
  };
}
