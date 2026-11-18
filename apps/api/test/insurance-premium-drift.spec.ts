import { ConflictException } from '@nestjs/common';
import {
  MicMockInsurancePartner,
  createPrismaClient,
  type InsuranceProductRow,
} from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  INSURANCE_PREMIUM_BASIS,
  INSURANCE_PREMIUM_SYNC_STATUS,
  INSURANCE_PRODUCT_KIND,
  readInsurancePremiumTiers,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { InsuranceOfferService } from '../src/modules/insurance/insurance-offer.service';
import { InsuranceProductsService } from '../src/modules/insurance/insurance-products.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * ADR 0106 điều 2 — biểu phí đồng bộ được thì KHOÁ; lượt duyệt thấy hãng báo khác thì đánh dấu
 * `drifted` (mở sửa tay, nhắc đồng bộ lại) đúng MỘT lần.
 *
 * Spec chỉ đổi các cột trạng thái (`premium_sync_*`), không đổi % hay mốc bậc — spec báo giá chạy
 * song song đọc chung sản phẩm này. Trạng thái gốc được trả lại ở `afterAll`.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const service = new InsuranceProductsService(
  asService,
  audit,
  new InsuranceOfferService(new MicMockInsurancePartner(), asService),
);

let dbAvailable = false;
let product: InsuranceProductRow | null = null;
let actorUserId: string | null = null;

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable || !product) return;
    await fn();
  });

async function setStatus(status: string | null): Promise<void> {
  const now = new Date();
  await prisma.insuranceProduct.update({
    where: { id: product!.id },
    data: {
      premiumSyncStatus: status,
      premiumSyncStatusAt: status ? now : null,
      premiumSyncedAt: status === INSURANCE_PREMIUM_SYNC_STATUS.SYNCED ? now : null,
      premiumSyncError: status === INSURANCE_PREMIUM_SYNC_STATUS.FAILED ? 'lỗi cũ' : null,
    },
  });
}

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }
  product = await prisma.insuranceProduct.findFirst({
    where: {
      kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
      premiumBasis: INSURANCE_PREMIUM_BASIS.VALUE_TIER,
    },
    orderBy: [{ isActive: 'desc' }, { displayOrder: 'asc' }],
  });
  actorUserId = (await prisma.user.findFirst({ select: { id: true } }))?.id ?? null;
});

afterAll(async () => {
  if (dbAvailable && product) {
    await prisma.insuranceProduct.update({
      where: { id: product.id },
      data: {
        premiumSyncStatus: product.premiumSyncStatus,
        premiumSyncStatusAt: product.premiumSyncStatusAt,
        premiumSyncedAt: product.premiumSyncedAt,
        premiumSyncError: product.premiumSyncError,
      },
    });
  }
  await prisma.$disconnect();
});

describe('Biểu phí lệch với hãng (ADR 0106 điều 2)', () => {
  maybe(
    'đang khoá ⇒ đánh dấu lệch đúng một lần, giữ lý do đầu tiên, có audit hệ thống',
    async () => {
      await setStatus(INSURANCE_PREMIUM_SYNC_STATUS.SYNCED);
      const started = new Date();

      expect(await service.markPremiumDrift('lần một')).toBe(true);
      expect(await service.markPremiumDrift('lần hai')).toBe(false);

      const row = await prisma.insuranceProduct.findUniqueOrThrow({ where: { id: product!.id } });
      expect(row.premiumSyncStatus).toBe(INSURANCE_PREMIUM_SYNC_STATUS.DRIFTED);
      expect(row.premiumSyncError).toBe('lần một');
      expect(row.premiumSyncStatusAt!.getTime()).toBeGreaterThanOrEqual(started.getTime() - 1000);
      // Biểu phí không đổi — chỉ trạng thái.
      expect(row.premiumTiersJson).toEqual(product!.premiumTiersJson);
      const logs = await prisma.auditLog.count({
        where: {
          action: 'insurance_product.premium_drift',
          targetId: product!.id,
          createdAt: { gte: new Date(started.getTime() - 1000) },
        },
      });
      expect(logs).toBe(1);
    },
  );

  maybe('chưa từng đồng bộ ⇒ cũng đánh dấu (nhắc đồng bộ lần đầu)', async () => {
    await setStatus(null);
    expect(await service.markPremiumDrift('chưa đồng bộ')).toBe(true);
  });

  maybe('đang hỏng ⇒ không ghi đè lý do đồng bộ hỏng', async () => {
    await setStatus(INSURANCE_PREMIUM_SYNC_STATUS.FAILED);
    expect(await service.markPremiumDrift('lệch')).toBe(false);
    const row = await prisma.insuranceProduct.findUniqueOrThrow({ where: { id: product!.id } });
    expect(row.premiumSyncStatus).toBe(INSURANCE_PREMIUM_SYNC_STATUS.FAILED);
    expect(row.premiumSyncError).toBe('lỗi cũ');
  });

  maybe('đang khoá ⇒ sửa % bậc bị từ chối 409; gửi lại đúng số cũ thì được', async () => {
    if (!actorUserId) return;
    const tiers = readInsurancePremiumTiers(product!.premiumTiersJson)!;
    const changed = tiers.map((t, i) => (i === 0 ? { ...t, percent: '0.0999' } : t));

    await setStatus(INSURANCE_PREMIUM_SYNC_STATUS.SYNCED);
    const err = await service
      .update(product!.id, { premiumTiers: changed }, actorUserId)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      code: API_ERROR_CODE.INSURANCE_PREMIUM_SYNCED_LOCKED,
    });
    // Gửi lại đúng số đang có không phải là sửa.
    await expect(
      service.update(product!.id, { premiumTiers: tiers }, actorUserId),
    ).resolves.toMatchObject({ premiumSyncStatus: INSURANCE_PREMIUM_SYNC_STATUS.SYNCED });
  });
});
