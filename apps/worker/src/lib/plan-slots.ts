import { type Prisma } from '@xeprime/prisma';
import {
  LISTING_STATUS,
  MARKETPLACE_PAUSE_REASON,
  SUBSCRIPTION_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  planSlotGroups,
  planSlotQuotaFor,
  resolveEffectiveBilling,
  slotScopeVehicleType,
  type PlanVehicleScope,
} from '@xeprime/types';

import { recordSystemAudit } from './notify';

/**
 * Suất trên chợ ở phía WORKER (ADR 0085 điều 5) — đầu kỳ hạ bậc và hết ân hạn. Cùng luật với api
 * (`BillingService.slotOverflowWithin` / `pauseVehiclesForPlanWithinTx`): chia nhóm bằng
 * `planSlotGroups` + `planSlotQuotaFor` của `@xeprime/types`, đếm xe chiếm suất bằng cùng điều kiện,
 * và tuần tự hoá bằng CÙNG khoá suất của gian hàng.
 */

/** Khoá suất của gian hàng — CÙNG khoá với api `BillingService.lockVehicleSlotsWithinTx`. */
export async function lockVehicleSlots(tx: Prisma.TransactionClient, tenantId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'vehicle-slots:' + tenantId}))`;
}

/** Xe đang CHIẾM SUẤT (ADR 0085 điều 4) — bản sao của api `MARKETPLACE_SLOT_WHERE`. */
function slotWhere(tenantId: string, scope: PlanVehicleScope | null): Prisma.VehicleWhereInput {
  const vehicleType = scope ? slotScopeVehicleType(scope) : null;
  return {
    tenantId,
    deletedAt: null,
    marketplaceEnabled: true,
    publicStatus: {
      in: [VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW, VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC],
    },
    ...(vehicleType ? { vehicleType } : {}),
  };
}

/** Một nhóm suất đang vượt, kèm id các xe đang chiếm suất của nhóm. */
export interface SlotOverflowGroup {
  countedScope: PlanVehicleScope;
  limit: number;
  vehicleIds: string[];
}

/**
 * Nhóm suất VƯỢT với dòng hiệu lực HIỆN TẠI của gian hàng (đọc trong transaction của nơi gọi, sau
 * khoá suất). Cùng cửa sổ dòng với api (`EFFECTIVE_SUBSCRIPTION_ARGS`: 12 dòng mới nhất đã bắt đầu).
 */
export async function slotOverflow(
  tx: Prisma.TransactionClient,
  tenantId: string,
  now: Date,
): Promise<SlotOverflowGroup[]> {
  const rows = await tx.tenantSubscription.findMany({
    where: { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE, startsAt: { lte: now } },
    orderBy: { endsAt: 'desc' },
    take: 12,
    select: {
      endsAt: true,
      billingMode: true,
      vehicleScope: true,
      quotaJson: true,
      plan: { select: { code: true, name: true, limitsJson: true } },
    },
  });
  const billing = resolveEffectiveBilling(rows, now);
  const groups = planSlotGroups({
    [VEHICLE_TYPE.CAR]: planSlotQuotaFor(rows, billing, VEHICLE_TYPE.CAR, now),
    [VEHICLE_TYPE.MOTORBIKE]: planSlotQuotaFor(rows, billing, VEHICLE_TYPE.MOTORBIKE, now),
  });
  const overflow: SlotOverflowGroup[] = [];
  for (const group of groups) {
    const vehicles = await tx.vehicle.findMany({
      where: slotWhere(tenantId, group.countedScope),
      select: { id: true },
    });
    if (vehicles.length > group.limit) {
      overflow.push({ ...group, vehicleIds: vehicles.map((vehicle) => vehicle.id) });
    }
  }
  return overflow;
}

/** Mọi xe đang chiếm suất của gian hàng — lượt về tuyến hoa hồng ẩn TOÀN BỘ (ADR 0085 điều 5). */
export async function occupyingVehicleIds(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<string[]> {
  const rows = await tx.vehicle.findMany({ where: slotWhere(tenantId, null), select: { id: true } });
  return rows.map((row) => row.id);
}

/**
 * Lượt HỆ THỐNG tạm ẩn xe vì suất gói — phía worker. Cùng hình dạng với api
 * `BillingService.pauseVehiclesForPlanWithinTx`: tắt công tắc kèm lý do `plan_limit`, một dòng audit.
 *
 * NGOẠI LỆ HẸP của ADR 0008 (ghi ở ADR 0085 điều 8): worker không gọi được `ListingsService`, mà tìm
 * kiếm chợ đọc `public_listings.status`. Nên ở đây hạ ĐÚNG cột `status` về `hidden` cho đúng các xe vừa
 * tắt — chính giá trị `ListingsService.syncFromVehicle` sẽ suy ra (`marketplace_enabled = false` ⇒
 * `hidden`) — và không chạm cột nào khác. Lượt đồng bộ đầy đủ kế tiếp của api cho ra cùng kết quả.
 */
export async function pauseVehiclesForPlan(
  tx: Prisma.TransactionClient,
  tenantId: string,
  vehicleIds: readonly string[],
  source: 'plan_term_start' | 'scope_lapsed' | 'track_lapsed',
): Promise<string[]> {
  if (vehicleIds.length === 0) return [];
  const targets = await tx.vehicle.findMany({
    where: { tenantId, id: { in: [...vehicleIds] }, deletedAt: null, marketplaceEnabled: true },
    select: { id: true },
  });
  if (targets.length === 0) return [];
  const ids = targets.map((vehicle) => vehicle.id);
  await tx.vehicle.updateMany({
    where: { tenantId, id: { in: ids }, marketplaceEnabled: true },
    data: { marketplaceEnabled: false, marketplacePausedReason: MARKETPLACE_PAUSE_REASON.PLAN_LIMIT },
  });
  await tx.publicListing.updateMany({
    where: { vehicleId: { in: ids } },
    data: { status: LISTING_STATUS.HIDDEN },
  });
  await recordSystemAudit(tx, {
    tenantId,
    action: 'vehicle.marketplace_paused_by_plan',
    targetType: 'tenant',
    targetId: tenantId,
    after: { vehicleIds: ids, reason: MARKETPLACE_PAUSE_REASON.PLAN_LIMIT, source },
  });
  return ids;
}
