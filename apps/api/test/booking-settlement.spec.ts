import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BOOKING_STATUS,
  DEPOSIT_STATUS,
  MEMBERSHIP_STATUS,
  PAYMENT_KIND,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PERMISSION,
  REFUND_METHOD,
  SURCHARGE_CATEGORY,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import 'reflect-metadata';
import { PERMISSIONS_KEY } from '../src/common/decorators';
import { AuditService } from '../src/modules/audit/audit.service';
import { BookingSettlementController } from '../src/modules/bookings/settlement/booking-settlement.controller';
import { SettlementService } from '../src/modules/bookings/settlement/settlement.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Wave 10 — Phát sinh cuối chuyến & hoàn cọc thủ công, trên PostgreSQL THẬT.
 *
 * Điều được khoá:
 *  - `depositRequired` (số cấu hình) KHÔNG bao giờ bị đọc thành `depositReceived` (tiền đã thu);
 *  - hai công thức đề xuất hoàn / cần thu thêm đúng ở mọi mốc biên;
 *  - KHÔNG có danh mục nhiên liệu, và DB từ chối nếu ai đó lách qua service;
 *  - hoàn cọc là GHI NHẬN thủ công, không tự xảy ra, không vượt quá tiền đã thu;
 *  - sửa bản ghi đã hoàn cần quyền cao hơn + lý do + audit giữ cả giá trị cũ.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const pricing = new PricingService(asService, audit);
const settlement = new SettlementService(asService, audit, pricing);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let otherTenantId: string;
let vehicleId: string;

const BASE = new Date('2026-11-10T02:00:00.000Z');
const hours = (n: number) => new Date(BASE.getTime() + n * 3_600_000);

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  ownerId = newId();
  tenantId = newId();
  otherTenantId = newId();
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop W10', email: `own-${ownerId}@xeprime.test` },
  });
  for (const [id, name] of [
    [tenantId, 'Shop Wave 10'],
    [otherTenantId, 'Shop Khác'],
  ] as const) {
    await prisma.tenant.create({
      data: {
        id,
        code: `T-${id.slice(-8)}`,
        slug: `t-${id.toLowerCase().slice(-10)}`,
        name,
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: ownerId,
      },
    });
    await prisma.tenantMembership.create({
      data: {
        id: newId(),
        tenantId: id,
        userId: ownerId,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    });
  }

  vehicleId = newId();
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `V-${vehicleId.slice(-6)}`,
      name: 'Toyota Vios W10',
      vehicleType: VEHICLE_TYPE.CAR,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    for (const id of [tenantId, otherTenantId]) {
      await prisma.bookingDepositSettlement.deleteMany({ where: { tenantId: id } });
      await prisma.bookingSurcharge.deleteMany({ where: { tenantId: id } });
      await prisma.payment.deleteMany({ where: { tenantId: id } });
      await prisma.booking.deleteMany({ where: { tenantId: id } });
      await prisma.vehicle.deleteMany({ where: { tenantId: id } });
      await prisma.auditLog.deleteMany({ where: { tenantId: id } });
      await prisma.tenantMembership.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

let seq = 0;

async function createBooking(opts: { deposit?: string; status?: string } = {}) {
  seq += 1;
  const id = newId();
  await prisma.booking.create({
    data: {
      id,
      tenantId,
      vehicleId,
      code: `DH-W10-${seq}`,
      customerName: 'Nguyễn Văn A',
      pickupAt: hours(seq * 100),
      returnAt: hours(seq * 100 + 48),
      status: opts.status ?? BOOKING_STATUS.COMPLETED,
      baseAmount: new Prisma.Decimal('2000000'),
      totalAmount: new Prisma.Decimal('2000000'),
      depositAmount: new Prisma.Decimal(opts.deposit ?? '5000000'),
    },
  });
  return id;
}

/** Ghi nhận đã THU cọc — đường duy nhất tạo ra việc hoàn cọc. */
async function receiveDeposit(bookingId: string, amount: string) {
  await prisma.payment.create({
    data: {
      id: newId(),
      tenantId,
      bookingId,
      amount: new Prisma.Decimal(amount),
      method: PAYMENT_METHOD.CASH,
      kind: PAYMENT_KIND.DEPOSIT,
      status: PAYMENT_STATUS.SUCCEEDED,
      paidAt: new Date(),
    },
  });
}

describe('Cọc đã CẤU HÌNH khác cọc đã THU', () => {
  maybe('có depositAmount nhưng chưa thu: KHÔNG tạo việc hoàn cọc', async () => {
    const bookingId = await createBooking({ deposit: '5000000' });
    const result = await settlement.get(tenantId, bookingId);

    expect(result.depositRequired).toBe('5000000.00');
    expect(result.depositReceived).toBe('0.00');
    expect(result.depositStatus).toBe(DEPOSIT_STATUS.NOT_RECEIVED);
    // Không có tiền trong tay thì không có gì để đề xuất hoàn.
    expect(result.proposedRefund).toBe('0.00');
  });

  maybe('đơn không yêu cầu cọc: trạng thái là "không có cọc"', async () => {
    const bookingId = await createBooking({ deposit: '0' });
    const result = await settlement.get(tenantId, bookingId);
    expect(result.depositStatus).toBe(DEPOSIT_STATUS.NONE);
  });

  maybe('khoản thanh toán TIỀN THUÊ không được tính thành cọc đã thu', async () => {
    const bookingId = await createBooking({ deposit: '5000000' });
    await prisma.payment.create({
      data: {
        id: newId(),
        tenantId,
        bookingId,
        amount: new Prisma.Decimal('2000000'),
        method: PAYMENT_METHOD.CASH,
        // kind mặc định = 'rental'
        status: PAYMENT_STATUS.SUCCEEDED,
      },
    });

    const result = await settlement.get(tenantId, bookingId);
    expect(result.depositReceived).toBe('0.00');
    expect(result.depositStatus).toBe(DEPOSIT_STATUS.NOT_RECEIVED);
  });

  maybe('đã thu cọc + chuyến hoàn tất → Chờ hoàn cọc, đề xuất hoàn ĐỦ', async () => {
    const bookingId = await createBooking({ deposit: '5000000' });
    await receiveDeposit(bookingId, '5000000');

    const result = await settlement.get(tenantId, bookingId);
    expect(result.depositReceived).toBe('5000000.00');
    expect(result.depositStatus).toBe(DEPOSIT_STATUS.AWAITING_REFUND);
    expect(result.proposedRefund).toBe('5000000.00');
    expect(result.additionalDue).toBe('0.00');
  });
});

describe('Phát sinh và hai công thức đề xuất', () => {
  maybe('thêm phát sinh → đề xuất hoàn giảm đúng phần khấu trừ', async () => {
    const bookingId = await createBooking({ deposit: '5000000' });
    await receiveDeposit(bookingId, '5000000');

    await settlement.addSurcharge(tenantId, bookingId, ownerId, {
      category: SURCHARGE_CATEGORY.OVERTIME,
      amount: '600000',
      reason: 'Trả muộn 6 tiếng',
    });
    const result = await settlement.addSurcharge(tenantId, bookingId, ownerId, {
      category: SURCHARGE_CATEGORY.CLEANING,
      amount: '150000',
      reason: 'Ghế sau bẩn',
    });

    expect(result.surchargeTotal).toBe('750000.00');
    expect(result.proposedRefund).toBe('4250000.00');
    expect(result.additionalDue).toBe('0.00');
    expect(result.surcharges).toHaveLength(2);
  });

  maybe('phát sinh VƯỢT cọc → đề xuất hoàn 0 và hiện "cần thu thêm"', async () => {
    const bookingId = await createBooking({ deposit: '1000000' });
    await receiveDeposit(bookingId, '1000000');

    const result = await settlement.addSurcharge(tenantId, bookingId, ownerId, {
      category: SURCHARGE_CATEGORY.DAMAGE,
      amount: '2200000',
      reason: 'Xước sườn xe',
    });

    // Hai công thức kẹp sàn 0 ở CẢ hai chiều — không có số âm nào lọt ra màn hình.
    expect(result.proposedRefund).toBe('0.00');
    expect(result.additionalDue).toBe('1200000.00');
  });

  maybe('gỡ một khoản: huỷ MỀM, biến mất khỏi phép tính nhưng còn dấu vết', async () => {
    const bookingId = await createBooking({ deposit: '3000000' });
    await receiveDeposit(bookingId, '3000000');
    const added = await settlement.addSurcharge(tenantId, bookingId, ownerId, {
      category: SURCHARGE_CATEGORY.OTHER,
      amount: '500000',
      reason: 'Ghi nhầm',
    });

    const result = await settlement.voidSurcharge(
      tenantId,
      bookingId,
      added.surcharges[0]!.id,
      ownerId,
      { reason: 'Nhập nhầm đơn' },
    );

    expect(result.surcharges).toHaveLength(0);
    expect(result.proposedRefund).toBe('3000000.00');
    // Bản ghi vẫn còn trong DB — bằng chứng "đã từng trừ tiền rồi rút lại".
    const row = await prisma.bookingSurcharge.findUniqueOrThrow({
      where: { id: added.surcharges[0]!.id },
    });
    expect(row.voidedAt).not.toBeNull();
    expect(row.voidReason).toBe('Nhập nhầm đơn');
  });

  maybe('sửa một khoản ghi audit CẢ giá trị cũ lẫn mới', async () => {
    const bookingId = await createBooking({ deposit: '3000000' });
    const added = await settlement.addSurcharge(tenantId, bookingId, ownerId, {
      category: SURCHARGE_CATEGORY.OVERTIME,
      amount: '300000',
      reason: 'Trễ 3 tiếng',
    });

    await settlement.updateSurcharge(tenantId, bookingId, added.surcharges[0]!.id, ownerId, {
      category: SURCHARGE_CATEGORY.OVERTIME,
      amount: '450000',
      reason: 'Trễ 4.5 tiếng (đọc lại đồng hồ)',
    });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId, action: 'booking.surcharge.update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.beforeJson).toMatchObject({ amount: '300000.00' });
    expect(log.afterJson).toMatchObject({ amount: '450000' });
  });

  maybe('KHÔNG có danh mục nhiên liệu — DB chặn kể cả khi lách qua service', async () => {
    const bookingId = await createBooking();
    await expect(
      prisma.bookingSurcharge.create({
        data: {
          id: newId(),
          tenantId,
          bookingId,
          category: 'fuel',
          amount: new Prisma.Decimal('200000'),
          reason: 'Thiếu xăng',
        },
      }),
    ).rejects.toThrow(/booking_surcharges_category_check/);
  });

  maybe('số tiền âm bị DB từ chối', async () => {
    const bookingId = await createBooking();
    await expect(
      prisma.bookingSurcharge.create({
        data: {
          id: newId(),
          tenantId,
          bookingId,
          category: SURCHARGE_CATEGORY.OTHER,
          amount: new Prisma.Decimal('-1'),
          reason: 'x',
        },
      }),
    ).rejects.toThrow(/booking_surcharges_amount_check/);
  });

  maybe('tenant khác không đụng được phát sinh của gian hàng này (404)', async () => {
    const bookingId = await createBooking({ deposit: '1000000' });
    const added = await settlement.addSurcharge(tenantId, bookingId, ownerId, {
      category: SURCHARGE_CATEGORY.OTHER,
      amount: '100000',
      reason: 'x',
    });

    await expect(
      settlement.voidSurcharge(otherTenantId, bookingId, added.surcharges[0]!.id, ownerId, {
        reason: 'y',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('Hoàn cọc thủ công', () => {
  maybe('ghi nhận hoàn: lưu số + phương thức + mốc, trạng thái sang Đã hoàn cọc', async () => {
    const bookingId = await createBooking({ deposit: '5000000' });
    await receiveDeposit(bookingId, '5000000');

    const result = await settlement.recordRefund(tenantId, bookingId, ownerId, {
      refundAmount: '5000000',
      refundMethod: REFUND_METHOD.BANK_TRANSFER,
      reference: 'TK-20260813-001',
    });

    expect(result.depositStatus).toBe(DEPOSIT_STATUS.REFUNDED);
    expect(result.refund).toMatchObject({
      refundAmount: '5000000.00',
      refundMethod: REFUND_METHOD.BANK_TRANSFER,
      reference: 'TK-20260813-001',
    });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId, action: 'booking.deposit_refund.record', targetId: bookingId },
    });
    expect(log.afterJson).toMatchObject({ refundAmount: '5000000.00' });
  });

  maybe('hoàn ÍT hơn đề xuất → Hoàn một phần, không tự nâng lên Đã hoàn đủ', async () => {
    const bookingId = await createBooking({ deposit: '4000000' });
    await receiveDeposit(bookingId, '4000000');

    const result = await settlement.recordRefund(tenantId, bookingId, ownerId, {
      refundAmount: '3000000',
      refundMethod: REFUND_METHOD.CASH,
    });

    expect(result.depositStatus).toBe(DEPOSIT_STATUS.PARTIALLY_REFUNDED);
  });

  maybe('không hoàn quá tiền ĐÃ THU', async () => {
    const bookingId = await createBooking({ deposit: '5000000' });
    await receiveDeposit(bookingId, '2000000');

    await expect(
      settlement.recordRefund(tenantId, bookingId, ownerId, {
        refundAmount: '5000000',
        refundMethod: REFUND_METHOD.CASH,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  maybe('chưa thu cọc thì không ghi nhận hoàn được', async () => {
    const bookingId = await createBooking({ deposit: '5000000' });
    await expect(
      settlement.recordRefund(tenantId, bookingId, ownerId, {
        refundAmount: '1000000',
        refundMethod: REFUND_METHOD.CASH,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  maybe('mốc hoàn ở TƯƠNG LAI bị từ chối', async () => {
    const bookingId = await createBooking({ deposit: '1000000' });
    await receiveDeposit(bookingId, '1000000');
    await expect(
      settlement.recordRefund(tenantId, bookingId, ownerId, {
        refundAmount: '1000000',
        refundMethod: REFUND_METHOD.CASH,
        refundedAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  maybe('ghi nhận hai lần: lần sau bị chặn, phải đi đường điều chỉnh', async () => {
    const bookingId = await createBooking({ deposit: '2000000' });
    await receiveDeposit(bookingId, '2000000');
    await settlement.recordRefund(tenantId, bookingId, ownerId, {
      refundAmount: '2000000',
      refundMethod: REFUND_METHOD.CASH,
    });

    await expect(
      settlement.recordRefund(tenantId, bookingId, ownerId, {
        refundAmount: '2000000',
        refundMethod: REFUND_METHOD.CASH,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  maybe(
    'điều chỉnh: lý do bắt buộc, audit giữ CẢ giá trị cũ, rowVersion chống sửa đè',
    async () => {
      const bookingId = await createBooking({ deposit: '3000000' });
      await receiveDeposit(bookingId, '3000000');
      const first = await settlement.recordRefund(tenantId, bookingId, ownerId, {
        refundAmount: '3000000',
        refundMethod: REFUND_METHOD.CASH,
      });

      const corrected = await settlement.correctRefund(tenantId, bookingId, ownerId, {
        refundAmount: '2500000',
        refundMethod: REFUND_METHOD.BANK_TRANSFER,
        correctionReason: 'Ghi nhầm số, đã đối chiếu sao kê',
        expectedRowVersion: first.refund!.rowVersion,
      });
      expect(corrected.refund?.refundAmount).toBe('2500000.00');

      const log = await prisma.auditLog.findFirstOrThrow({
        where: { tenantId, action: 'booking.deposit_refund.correct', targetId: bookingId },
      });
      expect(log.beforeJson).toMatchObject({ refundAmount: '3000000.00' });
      expect(log.afterJson).toMatchObject({
        refundAmount: '2500000.00',
        reason: 'Ghi nhầm số, đã đối chiếu sao kê',
      });

      // Nộp lại rowVersion cũ → 409, không ghi đè âm thầm.
      await expect(
        settlement.correctRefund(tenantId, bookingId, ownerId, {
          refundAmount: '1000000',
          refundMethod: REFUND_METHOD.CASH,
          correctionReason: 'x',
          expectedRowVersion: first.refund!.rowVersion,
        }),
      ).rejects.toMatchObject({ status: 409 });
    },
  );

  maybe('DB chặn hoàn nhiều hơn số đã thu kể cả khi lách qua service', async () => {
    const bookingId = await createBooking({ deposit: '1000000' });
    await expect(
      prisma.bookingDepositSettlement.create({
        data: {
          id: newId(),
          tenantId,
          bookingId,
          depositReceived: new Prisma.Decimal('1000000'),
          surchargeTotal: new Prisma.Decimal('0'),
          refundAmount: new Prisma.Decimal('2000000'),
          refundMethod: REFUND_METHOD.CASH,
          refundedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/not_over_refund/);
  });
});

describe('Quyền trên các endpoint quyết toán', () => {
  const permsOf = (method: keyof BookingSettlementController) =>
    Reflect.getMetadata(PERMISSIONS_KEY, BookingSettlementController.prototype[method]) as
      string[] | undefined;

  it('đọc đi cùng quyền xem đơn; ghi cần quyền tài chính; SỬA bản ghi cần quyền cao hơn', () => {
    expect(permsOf('get')).toEqual([PERMISSION.BOOKING_VIEW]);
    expect(permsOf('addSurcharge')).toEqual([PERMISSION.PAYMENT_RECORD]);
    expect(permsOf('recordRefund')).toEqual([PERMISSION.PAYMENT_RECORD]);
    // `payments.void` chỉ quản lý trở lên mới có — sửa một bằng chứng đã chốt là việc khác hẳn.
    expect(permsOf('correctRefund')).toEqual([PERMISSION.PAYMENT_VOID]);
  });
});
