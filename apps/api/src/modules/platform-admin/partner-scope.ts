import { NotFoundException } from '@nestjs/common';
import {
  API_ERROR_CODE,
  PERMISSION,
  platformPartnerKindOf,
  resolveEffectiveBilling,
  VEHICLE_ALERT_KIND,
  type Permission,
  type PlatformPartnerKind,
} from '@xeprime/types';
import {
  EFFECTIVE_SUBSCRIPTION_ARGS,
  effectiveSubscriptionWhere,
} from '../../common/plan/feature-state';
import type { PlatformContext } from '../../common/types/request-context';
import type { PrismaService } from '../../prisma/prisma.service';
import type { VehicleAlertScope } from '../vehicles/vehicle-alerts.service';

/**
 * Phạm vi dùng chung của drawer chi tiết đối tác (Platform Admin, CHỈ ĐỌC).
 *
 * `tenantId` đến từ URL — đây là màn nền tảng, không có membership để suy tenant. Nó được XÁC THỰC
 * bằng một lượt đọc (`loadPartner`): tenant không tồn tại hay đã xoá mềm ⇒ 404, và mọi truy vấn sau
 * đó đều lọc theo đúng id đã xác thực, nên không có đường nào đọc chéo sang tenant khác.
 */
export interface PartnerRef {
  tenantId: string;
  partnerKind: PlatformPartnerKind;
  tenantStatus: string;
}

export async function loadPartner(
  prisma: PrismaService,
  tenantId: string,
  now: Date,
): Promise<PartnerRef> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
    select: {
      id: true,
      status: true,
      onboardingState: true,
      subscriptions: { where: effectiveSubscriptionWhere(now), ...EFFECTIVE_SUBSCRIPTION_ARGS },
    },
  });
  if (!tenant) {
    throw new NotFoundException({
      code: API_ERROR_CODE.NOT_FOUND,
      message: 'Không tìm thấy đối tác',
    });
  }
  const billing = resolveEffectiveBilling(tenant.subscriptions[0] ?? null, now);
  return {
    tenantId: tenant.id,
    tenantStatus: tenant.status,
    partnerKind: platformPartnerKindOf({
      onboardingState: tenant.onboardingState,
      billingMode: billing.billingMode,
    }),
  };
}

/** Người gọi có quyền nền tảng này không — đọc từ scope đã nạp ở `PlatformScopeGuard`. */
export function hasPlatformPermission(platform: PlatformContext, permission: Permission): boolean {
  return platform.permissions.includes(permission);
}

/** Số tiền chỉ ra khỏi server khi người gọi có quyền vận hành tiền của nền tảng. */
export function canViewPartnerMoney(platform: PlatformContext): boolean {
  return hasPlatformPermission(platform, PERMISSION.PLATFORM_MONEY_MANAGE);
}

/**
 * Scope cảnh báo xe khi NHÂN SỰ NỀN TẢNG xem (không phải membership của gian hàng).
 *
 * Giấy tờ / bảo dưỡng / bàn giao: chỉ loại việc và số lượng — không số giấy tờ, không tên file
 * (docblock `VehicleAlertsService`), nên người đã có `platform.vehicles.view` được thấy. Nghĩa vụ
 * tiền của nguồn xe (`SOURCE_OBLIGATION_DUE`) là dữ liệu tài chính của gian hàng: không mở.
 * `canViewBookings = false` vì drawer không dẫn link mang id đơn của gian hàng.
 */
export const PLATFORM_PARTNER_ALERT_SCOPE: VehicleAlertScope = {
  canViewFinance: false,
  canViewDocuments: true,
  canViewMaintenance: true,
  canViewHandovers: true,
  canViewBookings: false,
};

/** Loại cảnh báo không bao giờ ra khỏi drawer, kể cả khi scope đổi về sau. */
export const PARTNER_HIDDEN_ALERT_KINDS: readonly string[] = [
  VEHICLE_ALERT_KIND.SOURCE_OBLIGATION_DUE,
];
