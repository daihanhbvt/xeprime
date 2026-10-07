import type { Prisma } from '@xeprime/prisma';
import {
  resolveEffectiveBilling,
  resolveStorefrontKind,
  storefrontIdentity,
  type BillingMode,
  type StorefrontIdentity,
  type StorefrontKind,
} from '@xeprime/types';

import { EFFECTIVE_SUBSCRIPTION_ARGS, effectiveSubscriptionWhere } from '../plan/feature-state';

/**
 * `select` trên `tenants` đủ để trả lời "khách thấy gian hàng này là ai" — tên, SĐT, email, ảnh,
 * và tuyến HIỆU LỰC quyết định đọc chúng từ đâu (ADR 0054).
 *
 * Một fragment cho mọi điểm đọc (chợ, chuyến của khách, hợp đồng, hộp thư…): thêm một cột vào
 * luật là sửa một chỗ, không phải đi tìm từng `select: { name: true }` rải trong mười module.
 *
 * `subscriptions` là `take: 1` — trong một `findMany` nó là MỘT truy vấn phụ cho cả trang, không N+1.
 */
export function storefrontTenantSelect(now: Date) {
  return {
    name: true,
    phone: true,
    email: true,
    profile: { select: { logoUrl: true } },
    owner: {
      select: {
        displayName: true,
        phone: true,
        phoneVerifiedAt: true,
        email: true,
        emailVerifiedAt: true,
        avatarUrl: true,
      },
    },
    subscriptions: { where: effectiveSubscriptionWhere(now), ...EFFECTIVE_SUBSCRIPTION_ARGS },
  } satisfies Prisma.TenantSelect;
}

export type StorefrontTenantRow = Prisma.TenantGetPayload<{
  select: ReturnType<typeof storefrontTenantSelect>;
}>;

export interface ResolvedStorefront extends StorefrontIdentity {
  kind: StorefrontKind;
  /** Tuyến hiệu lực — trả kèm để nơi gọi không chấm lại lần hai (dấu xác thực, kênh chat…). */
  billingMode: BillingMode | null;
}

/**
 * Hàng tenant (đọc bằng `storefrontTenantSelect`) → danh tính công khai theo tuyến hiệu lực.
 *
 * Mọi chỗ khách nhìn thấy gian hàng đi qua đây, không đọc thẳng `tenant.name`/`tenant.phone`: chủ
 * xe tuyến hoa hồng hiện bằng TÀI KHOẢN của họ (họ tên, SĐT đã xác thực), gian hàng tuyến gói bằng
 * bộ riêng của gian hàng — và đổi tuyến là đổi theo ngay, không job nào phải chép.
 */
export function resolveStorefront(tenant: StorefrontTenantRow, now: Date): ResolvedStorefront {
  const billingMode = resolveEffectiveBilling(tenant.subscriptions[0] ?? null, now).billingMode;
  const kind = resolveStorefrontKind(billingMode);
  const identity = storefrontIdentity(
    kind,
    {
      name: tenant.name,
      phone: tenant.phone,
      email: tenant.email,
      logoUrl: tenant.profile?.logoUrl ?? null,
    },
    {
      displayName: tenant.owner.displayName,
      phone: tenant.owner.phone,
      phoneVerified: tenant.owner.phoneVerifiedAt != null,
      email: tenant.owner.email,
      emailVerified: tenant.owner.emailVerifiedAt != null,
      avatarUrl: tenant.owner.avatarUrl,
    },
  );
  return { ...identity, kind, billingMode };
}
