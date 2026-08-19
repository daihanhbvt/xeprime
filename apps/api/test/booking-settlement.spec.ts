import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BOOKING_STATUS,
  DEPOSIT_STATUS,
  MEMBERSHIP_STATUS,
  PAYMENT_KIND,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PERMISSION,
  RECEIPT_SOURCE,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  REFUND_METHOD,
  SYSTEM_FINANCE_CATEGORY,
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
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import { NotificationService } from '../src/modules/notification/notification.service';
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
const notifications = new NotificationService(asService);
const receipts = new ReceiptsService(asService, audit);
const settlement = new SettlementService(asService, audit, pricing, notifications, receipts);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let otherTenantId: string;
let vehicleId: string;
/** Khách tạo trong lúc chạy — dọn ở `afterAll` để không để lại user mồ côi. */
const customerIds: string[] = [];

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
      await prisma.bookingRequest.deleteMany({ where: { tenantId: id } });
      await prisma.booking.deleteMany({ where: { tenantId: id } });
      await prisma.vehicle.deleteMany({ where: { tenantId: id } });
      await prisma.auditLog.deleteMany({ where: { tenantId: id } });
      await prisma.tenantMembership.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, ...customerIds] } } });
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

/**
 * Đơn kèm một tài khoản khách thật — cần cho các kiểm tra thông báo: khách vãng lai không có
 * `customerUserId` nên mọi thứ đều "không gửi", và test sẽ xanh một cách vô nghĩa.
 */
async function createBookingWithCustomer(
  opts: { deposit?: string; status?: string } = {},
): Promise<{ bookingId: string; customerUserId: string }> {
  const bookingId = await createBooking(opts);
  const customerUserId = newId();
  await prisma.user.create({
    data: {
      id: customerUserId,
      displayName: 'Khách W11',
      email: `cus-${customerUserId}@xeprime.test`,
    },
  });
  customerIds.push(customerUserId);

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { pickupAt: true, returnAt: true },
  });
  await prisma.bookingRequest.create({
    data: {
      id: newId(),
      tenantId,
      vehicleId,
      status: 'converted_to_booking',
      customerName: 'Khách W11',
      // SĐT riêng từng đơn: unique (vehicle, phone, pickup, return) chặn trùng yêu cầu.
      customerPhone: `09${customerUserId.slice(-8)}`,
      customerUserId,
      bookingId,
      pickupAt: booking.pickupAt,
      returnAt: booking.returnAt,
    },
  });
  return { bookingId, customerUserId };
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

  /**
   * Wave 11.1 — hai chặng từng bị nuốt vào `NONE`/`AWAITING_REFUND` và nói sai về tiền thật.
   */
  maybe('đã thu cọc nhưng chuyến CHƯA xong → Đã nhận cọc, không phải "không có cọc"', async () => {
    for (const status of [
      BOOKING_STATUS.RESERVED,
      BOOKING_STATUS.CONFIRMED,
      BOOKING_STATUS.ACTIVE,
    ]) {
      const bookingId = await createBooking({ deposit: '5000000', status });
      await receiveDeposit(bookingId, '5000000');

      const result = await settlement.get(tenantId, bookingId);
      // Đơn đang cầm 5 triệu của khách — nhãn `Không có cọc` ở đây là nói sai về tiền thật.
      expect(result.depositStatus).toBe(DEPOSIT_STATUS.RECEIVED);
      expect(result.depositReceived).toBe('5000000.00');
    }
  });

  maybe('phát sinh ăn hết cọc → Đã quyết toán cọc, không mời hoàn 0 đồng', async () => {
    const bookingId = await createBooking({ deposit: '1000000' });
    await receiveDeposit(bookingId, '1000000');
    await settlement.addSurcharge(tenantId, bookingId, ownerId, {
      category: SURCHARGE_CATEGORY.DAMAGE,
      amount: '1000000',
      reason: 'Hư hại đúng bằng tiền cọc',
    });

    const result = await settlement.get(tenantId, bookingId);
    expect(result.depositStatus).toBe(DEPOSIT_STATUS.SETTLED);
    expect(result.proposedRefund).toBe('0.00');
    expect(result.additionalDue).toBe('0.00');
  });

  maybe('phát sinh vượt cọc cũng là Đã quyết toán — phần dư thu trực tiếp', async () => {
    const bookingId = await createBooking({ deposit: '500000' });
    await receiveDeposit(bookingId, '500000');
    await settlement.addSurcharge(tenantId, bookingId, ownerId, {
      category: SURCHARGE_CATEGORY.DAMAGE,
      amount: '900000',
      reason: 'Hư hại vượt cọc',
    });

    const result = await settlement.get(tenantId, bookingId);
    expect(result.depositStatus).toBe(DEPOSIT_STATUS.SETTLED);
    expect(result.additionalDue).toBe('400000.00');
  });
});

/**
 * Wave 11.1 — ghi phát sinh là thao tác NỘI BỘ của chủ xe trong lúc quyết toán. Nó lặp đi lặp
 * lại (thêm, sửa số, gỡ đi) và khách không duyệt gì, nên không được bắn thông báo. Hoàn cọc thì
 * ngược lại: tiền rời tay chủ xe, khách phải đi đối chiếu.
 */
describe('Thông báo: phát sinh im lặng, hoàn cọc thì không', () => {
  maybe('thêm / sửa / gỡ phát sinh KHÔNG tạo thông báo nào cho khách', async () => {
    const { bookingId, customerUserId } = await createBookingWithCustomer({ deposit: '1000000' });

    const added = await settlement.addSurcharge(tenantId, bookingId, ownerId, {
      category: SURCHARGE_CATEGORY.CLEANING,
      amount: '100000',
      reason: 'Vệ sinh xe',
    });
    const surchargeId = added.surcharges[0]!.id;
    await settlement.updateSurcharge(tenantId, bookingId, surchargeId, ownerId, {
      category: SURCHARGE_CATEGORY.CLEANING,
      amount: '150000',
      reason: 'Vệ sinh xe (tính lại)',
    });
    await settlement.voidSurcharge(tenantId, bookingId, surchargeId, ownerId, {
      reason: 'Ghi nhầm',
    });

    const sent = await prisma.notification.count({ where: { userId: customerUserId } });
    expect(sent).toBe(0);

    // Nhưng vẫn để lại vết đầy đủ ở audit — truy vết là việc của audit, không phải thông báo.
    const trail = await prisma.auditLog.count({
      where: { tenantId, action: { startsWith: 'booking.surcharge.' }, targetId: surchargeId },
    });
    expect(trail).toBe(3);
  });

  maybe('ghi nhận hoàn cọc VẪN báo cho khách', async () => {
    const { bookingId, customerUserId } = await createBookingWithCustomer({ deposit: '1000000' });
    await receiveDeposit(bookingId, '1000000');
    await settlement.recordRefund(tenantId, bookingId, ownerId, {
      refundAmount: '1000000',
      refundMethod: REFUND_METHOD.BANK_TRANSFER,
    });

    const sent = await prisma.notification.findMany({
      where: { userId: customerUserId },
      select: { targetType: true, targetId: true },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ targetType: 'booking', targetId: bookingId });
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

/**
 * Hoàn cọc LÊN SỔ (epic nối tiền).
 *
 * Trước đây tiền rời tay chủ xe mà sổ Thu-Chi không thấy, nên `/finance/summary` báo lãi cao hơn
 * thực tế. Nhóm này khoá cả ba chuyển tiếp — sinh, sửa tại chỗ, và rút về 0.
 */
describe('Hoàn cọc → phiếu chi trong sổ', () => {
  const refundReceipts = (bookingId: string) =>
    prisma.receipt.findMany({
      where: { tenantId, bookingId, source: RECEIPT_SOURCE.DEPOSIT_REFUND },
      select: { id: true, amount: true, type: true, status: true, occurredAt: true,
                category: { select: { systemKey: true } } },
    });

  maybe('ghi nhận hoàn sinh đúng MỘT phiếu chi, danh mục "Hoàn cọc"', async () => {
    const bookingId = await createBooking({ deposit: '5000000' });
    await receiveDeposit(bookingId, '5000000');
    await settlement.recordRefund(tenantId, bookingId, ownerId, {
      refundAmount: '5000000',
      refundMethod: REFUND_METHOD.BANK_TRANSFER,
    });

    const rows = await refundReceipts(bookingId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe(RECEIPT_TYPE.EXPENSE);
    expect(rows[0]!.status).toBe(RECEIPT_STATUS.APPROVED);
    expect(rows[0]!.amount.toString()).toBe('5000000');
    expect(rows[0]!.category?.systemKey).toBe(SYSTEM_FINANCE_CATEGORY.DEPOSIT_REFUND);
  });

  maybe('phụ phí KHÔNG có phiếu riêng — phiếu hoàn cọc đã là số RÒNG', async () => {
    const bookingId = await createBooking({ deposit: '5000000' });
    await receiveDeposit(bookingId, '5000000');
    await settlement.addSurcharge(tenantId, bookingId, ownerId, {
      category: SURCHARGE_CATEGORY.CLEANING,
      amount: '1000000',
      reason: 'Vệ sinh nội thất',
    });
    await settlement.recordRefund(tenantId, bookingId, ownerId, {
      refundAmount: '4000000',
      refundMethod: REFUND_METHOD.CASH,
    });

    const all = await prisma.receipt.findMany({ where: { tenantId, bookingId }, select: { source: true, amount: true } });
    // Đúng hai dòng: thu cọc (do helper tạo tay nên KHÔNG có phiếu) → chỉ còn phiếu hoàn.
    const refunds = all.filter((r) => r.source === RECEIPT_SOURCE.DEPOSIT_REFUND);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amount.toString()).toBe('4000000');
    // Không dòng nào mang số của riêng khoản phát sinh.
    expect(all.some((r) => r.amount.toString() === '1000000')).toBe(false);
  });

  maybe('sửa bản ghi hoàn: phiếu đổi số TẠI CHỖ, vẫn đúng một dòng', async () => {
    const bookingId = await createBooking({ deposit: '5000000' });
    await receiveDeposit(bookingId, '5000000');
    const first = await settlement.recordRefund(tenantId, bookingId, ownerId, {
      refundAmount: '5000000',
      refundMethod: REFUND_METHOD.CASH,
    });

    await settlement.correctRefund(tenantId, bookingId, ownerId, {
      refundAmount: '3000000',
      refundMethod: REFUND_METHOD.CASH,
      correctionReason: 'Ghi nhầm số',
      expectedRowVersion: first.refund!.rowVersion,
    });

    const rows = await refundReceipts(bookingId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount.toString()).toBe('3000000');
    expect(rows[0]!.status).toBe(RECEIPT_STATUS.APPROVED);
  });

  maybe('hoàn 0đ không sinh phiếu; sửa từ có tiền về 0đ thì HUỶ phiếu', async () => {
    const bookingId = await createBooking({ deposit: '2000000' });
    await receiveDeposit(bookingId, '2000000');
    const first = await settlement.recordRefund(tenantId, bookingId, ownerId, {
      refundAmount: '2000000',
      refundMethod: REFUND_METHOD.CASH,
    });
    await settlement.correctRefund(tenantId, bookingId, ownerId, {
      refundAmount: '0',
      refundMethod: REFUND_METHOD.CASH,
      correctionReason: 'Thực tế không hoàn đồng nào',
      expectedRowVersion: first.refund!.rowVersion,
    });

    const rows = await refundReceipts(bookingId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe(RECEIPT_STATUS.CANCELLED);
  });
});

/**
 * Vòng 0đ → có tiền lại — chuyển tiếp THỨ TƯ mà bản đầu bỏ sót.
 *
 * Unique index `(tenant_id, source, source_ref_id)` phủ CẢ dòng đã huỷ, nên nếu đường sửa bỏ qua
 * phiếu cancelled rồi tạo mới, người dùng sửa hoàn cọc về 0 rồi sửa lại thành số dương sẽ ăn 409
 * vĩnh viễn cho đơn đó. `updateAmountWithinTx` phải HỒI SINH phiếu, không tạo phiếu thứ hai.
 */
describe('Hoàn cọc → sửa về 0 rồi sửa lại thành số dương', () => {
  maybe('phiếu sống lại, vẫn đúng MỘT dòng, không 409', async () => {
    const bookingId = await createBooking({ deposit: '4000000' });
    await receiveDeposit(bookingId, '4000000');

    const first = await settlement.recordRefund(tenantId, bookingId, ownerId, {
      refundAmount: '4000000',
      refundMethod: REFUND_METHOD.CASH,
    });
    const zeroed = await settlement.correctRefund(tenantId, bookingId, ownerId, {
      refundAmount: '0',
      refundMethod: REFUND_METHOD.CASH,
      correctionReason: 'Ghi nhầm, chưa hoàn đồng nào',
      expectedRowVersion: first.refund!.rowVersion,
    });

    // Đây là bước từng vỡ: tạo lại đụng unique index.
    await settlement.correctRefund(tenantId, bookingId, ownerId, {
      refundAmount: '3000000',
      refundMethod: REFUND_METHOD.CASH,
      correctionReason: 'Thực tế đã hoàn 3 triệu',
      expectedRowVersion: zeroed.refund!.rowVersion,
    });

    const rows = await prisma.receipt.findMany({
      where: { tenantId, bookingId, source: RECEIPT_SOURCE.DEPOSIT_REFUND },
      select: { amount: true, status: true, cancelledAt: true, cancelledBy: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount.toString()).toBe('3000000');
    expect(rows[0]!.status).toBe(RECEIPT_STATUS.APPROVED);
    // Phiếu đã duyệt mà vẫn mang dấu vết huỷ là một trạng thái tự mâu thuẫn.
    expect(rows[0]!.cancelledAt).toBeNull();
    expect(rows[0]!.cancelledBy).toBeNull();
  });
});
