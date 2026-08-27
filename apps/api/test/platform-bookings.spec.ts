import { createPrismaClient, newId } from '@xeprime/prisma';
import { API_ERROR_CODE, BOOKING_STATUS, TENANT_STATUS, VEHICLE_TYPE } from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { PlatformBookingsService } from '../src/modules/platform-admin/platform-bookings.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase 7 — Đơn thuê toàn hệ thống, chạy trên PostgreSQL THẬT. Kiểm chứng: lọc/tra cứu, công nợ
 * tính động, và hai điểm bảo mật — SĐT khách LUÔN trả bản đã che ở list/detail, còn bản đầy đủ
 * chỉ ra qua `revealContact` và mỗi lần đều để lại một dòng audit.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = new PlatformBookingsService(asService, new AuditService(asService));

const FULL_PHONE = '0912345678';

let dbAvailable = false;
let adminId: string;
let tenantId: string;
let vehicleId: string;
let paidBooking: string;
let debtBooking: string;
let tag: string;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  adminId = newId();
  tenantId = newId();
  vehicleId = newId();
  paidBooking = newId();
  debtBooking = newId();
  tag = tenantId.slice(-6);

  await prisma.user.create({
    data: { id: adminId, displayName: 'Admin', email: `pb-${adminId}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `BookShop-${tag}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: adminId,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE-${vehicleId.slice(-6)}`,
      name: `Xe-${tag}`,
      vehicleType: VEHICLE_TYPE.CAR,
    },
  });

  const mkBooking = (
    id: string,
    code: string,
    status: string,
    total: string,
    paid: string,
    customerName: string,
    pickupOffsetDays: number,
  ) =>
    prisma.booking.create({
      data: {
        id,
        tenantId,
        vehicleId,
        code,
        customerName,
        customerPhone: FULL_PHONE,
        status,
        pickupAt: new Date(Date.UTC(2026, 7, 10 + pickupOffsetDays, 3)),
        returnAt: new Date(Date.UTC(2026, 7, 12 + pickupOffsetDays, 3)),
        totalAmount: total,
        paidAmount: paid,
      },
    });

  await mkBooking(paidBooking, `DP-${tag}`, BOOKING_STATUS.COMPLETED, '2000000', '2000000', `An-${tag}`, 0);
  await mkBooking(debtBooking, `DN-${tag}`, BOOKING_STATUS.ACTIVE, '3000000', '1000000', `Binh-${tag}`, 5);
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Platform bookings (Phase 7)', () => {
  maybe('list: SĐT khách LUÔN đã che, không lộ số đầy đủ', async () => {
    const res = await service.list({ tenantId });
    expect(res.data).toHaveLength(2);
    for (const row of res.data) {
      expect(row.customerPhoneMasked).toBe('091****678');
      expect(JSON.stringify(row)).not.toContain(FULL_PHONE);
    }
  });

  maybe('công nợ = max(0, total − paid); trả tiền dạng string (ADR 0007)', async () => {
    const res = await service.list({ tenantId });
    const paid = res.data.find((b) => b.id === paidBooking);
    const debt = res.data.find((b) => b.id === debtBooking);
    expect(String(paid?.debtAmount)).toBe('0');
    expect(String(debt?.debtAmount)).toBe('2000000');
    expect(typeof String(debt?.totalAmount)).toBe('string');
  });

  maybe('lọc trạng thái, tìm mã đơn/tên khách, tra đúng SĐT', async () => {
    const active = await service.list({ tenantId, status: BOOKING_STATUS.ACTIVE });
    expect(active.data.map((b) => b.id)).toEqual([debtBooking]);

    const byCode = await service.list({ q: `DN-${tag}` });
    expect(byCode.data.map((b) => b.id)).toEqual([debtBooking]);

    const byName = await service.list({ q: `An-${tag}` });
    expect(byName.data.map((b) => b.id)).toEqual([paidBooking]);

    const byPhone = await service.list({ tenantId, phone: FULL_PHONE });
    expect(byPhone.data).toHaveLength(2);
    // `bookings.customer_phone` lưu THÔ (`09…`) nhưng hỗ trợ có thể gõ dạng `84…`/`+84…` —
    // cả ba dạng phải ra cùng kết quả, nếu không ô tra cứu im lặng không tìm thấy gì.
    expect((await service.list({ tenantId, phone: '84912345678' })).data).toHaveLength(2);
    expect((await service.list({ tenantId, phone: '+84912345678' })).data).toHaveLength(2);
    // Khớp CHÍNH XÁC: một phần số không được ra kết quả.
    const partial = await service.list({ tenantId, phone: '0912' });
    expect(partial.data).toHaveLength(0);
  });

  maybe('lọc khoảng ngày theo createdAt (mặc định) và theo pickupAt', async () => {
    const byPickup = await service.list({
      tenantId,
      dateField: 'pickupAt',
      dateFrom: new Date(Date.UTC(2026, 7, 14)).toISOString(),
    });
    expect(byPickup.data.map((b) => b.id)).toEqual([debtBooking]);

    // Cùng khoảng đó áp lên createdAt (đơn vừa tạo hôm nay) thì không loại được gì.
    const byCreated = await service.list({
      tenantId,
      dateFrom: new Date(Date.UTC(2020, 0, 1)).toISOString(),
    });
    expect(byCreated.data).toHaveLength(2);
  });

  maybe('getOne: trả chi tiết tiền + cờ hợp đồng, vẫn che SĐT', async () => {
    const detail = await service.getOne(debtBooking);
    expect(detail.customerPhoneMasked).toBe('091****678');
    expect(detail.hasContract).toBe(false);
    expect(detail.receiptCount).toBe(0);
    expect(detail.paymentCount).toBe(0);
    expect(JSON.stringify(detail)).not.toContain(FULL_PHONE);
  });

  maybe('revealContact: trả số đầy đủ VÀ ghi audit', async () => {
    const before = await prisma.auditLog.count({
      where: { action: 'booking.contact_reveal', targetId: debtBooking },
    });

    const res = await service.revealContact(debtBooking, adminId);
    expect(res.customerPhone).toBe(FULL_PHONE);

    const log = await prisma.auditLog.findFirst({
      where: { action: 'booking.contact_reveal', targetId: debtBooking },
      orderBy: { createdAt: 'desc' },
    });
    expect(await prisma.auditLog.count({
      where: { action: 'booking.contact_reveal', targetId: debtBooking },
    })).toBe(before + 1);
    expect(log?.actorScope).toBe('platform');
    expect(log?.actorUserId).toBe(adminId);
    // Log KHÔNG được chép lại chính giá trị PII vừa xem.
    expect(JSON.stringify(log?.afterJson)).not.toContain(FULL_PHONE);
  });

  maybe('id lạ → NOT_FOUND (cả getOne lẫn revealContact)', async () => {
    await expect(service.getOne(newId())).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    await expect(service.revealContact(newId(), adminId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });
});
