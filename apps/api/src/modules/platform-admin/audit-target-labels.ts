import { AUDIT_TARGET_TYPE, type AuditTargetType } from '@xeprime/types';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Tên NGƯỜI ĐỌC ĐƯỢC của đối tượng một dòng nhật ký — "Gói nâng cao", "Mazda CX-3 · 43K12345",
 * "BK-2026-0012" — thay cho một ULID 26 ký tự không ai nhận ra.
 *
 * Tra theo LÔ: mỗi loại đối tượng xuất hiện trên trang là MỘT truy vấn `id IN (…)`, nên một trang
 * 20 dòng tốn tối đa vài truy vấn theo khoá chính, không phải 20 (không N+1).
 *
 * Cố ý KHÔNG tra:
 *  - `tenant_customer`, `tenant_customer_document`, `driver` — tên trong sổ khách / tài xế là dữ
 *    liệu cá nhân của gian hàng; nhật ký chỉ nói LOẠI đối tượng, chi tiết đi qua màn có quyền riêng.
 *  - Đối tượng đã bị xoá cứng: không tìm thấy thì không có nhãn, web rơi về loại + mã rút gọn.
 * Bản ghi xoá MỀM vẫn tra được — nhật ký kể lại quá khứ, kể cả thứ không còn hoạt động.
 */

type LabelRows = Promise<ReadonlyArray<readonly [id: string, label: string | null]>>;
type Resolver = (prisma: PrismaService, ids: string[]) => LabelRows;

const joinLabel = (...parts: (string | null | undefined)[]): string | null => {
  const text = parts.filter((part) => part && part.trim()).join(' · ');
  return text || null;
};

const RESOLVERS: Readonly<Partial<Record<AuditTargetType, Resolver>>> = {
  [AUDIT_TARGET_TYPE.TENANT]: async (prisma, ids) =>
    (
      await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    ).map((row) => [row.id, row.name] as const),
  [AUDIT_TARGET_TYPE.TENANT_SUBSCRIPTION]: async (prisma, ids) =>
    (
      await prisma.tenantSubscription.findMany({
        where: { id: { in: ids } },
        select: { id: true, plan: { select: { name: true } } },
      })
    ).map((row) => [row.id, row.plan.name] as const),
  [AUDIT_TARGET_TYPE.SUBSCRIPTION_INVOICE]: async (prisma, ids) =>
    (
      await prisma.subscriptionInvoice.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true },
      })
    ).map((row) => [row.id, row.code] as const),
  [AUDIT_TARGET_TYPE.PLAN]: async (prisma, ids) =>
    (
      await prisma.plan.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    ).map((row) => [row.id, row.name] as const),
  [AUDIT_TARGET_TYPE.VEHICLE]: async (prisma, ids) =>
    (
      await prisma.vehicle.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, plateNumber: true },
      })
    ).map((row) => [row.id, joinLabel(row.name, row.plateNumber)] as const),
  [AUDIT_TARGET_TYPE.BOOKING]: async (prisma, ids) =>
    (
      await prisma.booking.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } })
    ).map((row) => [row.id, row.code] as const),
  [AUDIT_TARGET_TYPE.BOOKING_REQUEST]: async (prisma, ids) =>
    (
      await prisma.bookingRequest.findMany({
        where: { id: { in: ids } },
        select: { id: true, vehicle: { select: { name: true } } },
      })
    ).map((row) => [row.id, row.vehicle.name] as const),
  [AUDIT_TARGET_TYPE.BOOKING_HOLD]: async (prisma, ids) =>
    (
      await prisma.bookingHold.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true },
      })
    ).map((row) => [row.id, row.code] as const),
  [AUDIT_TARGET_TYPE.CONTRACT]: async (prisma, ids) =>
    (
      await prisma.contract.findMany({
        where: { id: { in: ids } },
        select: { id: true, contractNo: true },
      })
    ).map((row) => [row.id, row.contractNo] as const),
  [AUDIT_TARGET_TYPE.RECEIPT]: async (prisma, ids) =>
    (
      await prisma.receipt.findMany({
        where: { id: { in: ids } },
        select: { id: true, receiptNo: true },
      })
    ).map((row) => [row.id, row.receiptNo] as const),
  [AUDIT_TARGET_TYPE.PROMO_CODE]: async (prisma, ids) =>
    (
      await prisma.promoCode.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true, name: true },
      })
    ).map((row) => [row.id, joinLabel(row.code, row.name)] as const),
  [AUDIT_TARGET_TYPE.FEE_POLICY]: async (prisma, ids) =>
    (
      await prisma.feePolicy.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    ).map((row) => [row.id, row.name] as const),
  [AUDIT_TARGET_TYPE.TENANT_BRANCH]: async (prisma, ids) =>
    (
      await prisma.tenantBranch.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    ).map((row) => [row.id, row.name] as const),
  [AUDIT_TARGET_TYPE.TENANT_MEMBERSHIP]: async (prisma, ids) =>
    (
      await prisma.tenantMembership.findMany({
        where: { id: { in: ids } },
        select: { id: true, user: { select: { displayName: true } } },
      })
    ).map((row) => [row.id, row.user.displayName] as const),
  [AUDIT_TARGET_TYPE.PLATFORM_MEMBERSHIP]: async (prisma, ids) =>
    (
      await prisma.platformMembership.findMany({
        where: { id: { in: ids } },
        select: { id: true, user: { select: { displayName: true } } },
      })
    ).map((row) => [row.id, row.user.displayName] as const),
  [AUDIT_TARGET_TYPE.SUPPORT_CASE]: async (prisma, ids) =>
    (
      await prisma.supportCase.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true },
      })
    ).map((row) => [row.id, row.code] as const),
  [AUDIT_TARGET_TYPE.WITHDRAWAL_REQUEST]: async (prisma, ids) =>
    (
      await prisma.withdrawalRequest.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true },
      })
    ).map((row) => [row.id, row.code] as const),
  [AUDIT_TARGET_TYPE.MARKETPLACE_BANNER]: async (prisma, ids) =>
    (
      await prisma.marketplaceBanner.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true },
      })
    ).map((row) => [row.id, row.title] as const),
  [AUDIT_TARGET_TYPE.VEHICLE_CATALOG_MODEL]: async (prisma, ids) =>
    (
      await prisma.vehicleCatalogModel.findMany({
        where: { id: { in: ids } },
        select: { id: true, label: true },
      })
    ).map((row) => [row.id, row.label] as const),
  [AUDIT_TARGET_TYPE.CATALOG_ITEM]: async (prisma, ids) =>
    (
      await prisma.catalogItem.findMany({
        where: { id: { in: ids } },
        select: { id: true, label: true },
      })
    ).map((row) => [row.id, row.label] as const),
};

/** `target_type` đọc từ DB là chuỗi — tra bằng hàm, không ép kiểu tại chỗ gọi. */
function resolverOf(targetType: string): Resolver | undefined {
  return RESOLVERS[targetType as AuditTargetType];
}

/** Các loại đối tượng có nhãn tra được — test đối chiếu với loại mà backend ghi. */
export const AUDIT_LABELLED_TARGET_TYPES = Object.keys(RESOLVERS);

export const auditTargetKey = (targetType: string, targetId: string): string =>
  `${targetType}:${targetId}`;

/** Nhãn của mọi đối tượng trên một trang nhật ký, khoá bằng `auditTargetKey`. */
export async function auditTargetLabels(
  prisma: PrismaService,
  refs: ReadonlyArray<{ targetType: string; targetId: string | null }>,
): Promise<Map<string, string>> {
  const idsByType = new Map<string, Set<string>>();
  for (const { targetType, targetId } of refs) {
    if (!targetId || !resolverOf(targetType)) continue;
    const ids = idsByType.get(targetType) ?? new Set<string>();
    ids.add(targetId);
    idsByType.set(targetType, ids);
  }
  const labels = new Map<string, string>();
  const batches = await Promise.all(
    [...idsByType].map(async ([targetType, ids]) => ({
      targetType,
      rows: await resolverOf(targetType)!(prisma, [...ids]),
    })),
  );
  for (const { targetType, rows } of batches) {
    for (const [id, label] of rows) {
      if (label) labels.set(auditTargetKey(targetType, id), label);
    }
  }
  return labels;
}
