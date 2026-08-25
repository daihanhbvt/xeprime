import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  bookingRequestRespondBy,
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  MEMBERSHIP_STATUS,
  PLATFORM_ROLE,
  TENANT_ROLE,
  TENANT_STATUS,
  USER_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { normalizePhone } from '../src/common/phone';
import { AuditService } from '../src/modules/audit/audit.service';
import { PlatformCustomersService } from '../src/modules/platform-admin/platform-customers.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase 7 — Tra cứu khách thuê, chạy trên PostgreSQL THẬT.
 *
 * Hai điều dễ sai nhất được kiểm chứng ở đây:
 *  1. "Khách" phải LOẠI chủ shop và nhân sự nền tảng — nếu không, màn tra cứu khách sẽ liệt kê
 *     cả nhân viên của chính mình.
 *  2. SĐT/email trả ra phải đã che ở mọi đường đọc; bản đầy đủ chỉ qua revealContact + audit.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = new PlatformCustomersService(asService, new AuditService(asService));

let dbAvailable = false;
let tag: string;
let customerId: string;
let quietCustomerId: string;
let shopMemberId: string;
let platformStaffId: string;
let exMemberId: string;
let tenantId: string;
let vehicleId: string;
let requestId: string;
let bookingId: string;
/** Dạng khách/hỗ trợ gõ (`09…`) — KHÁC dạng lưu trong `users.phone`. */
let localPhone: string;
/** Dạng thật sự nằm trong DB (`84…`). */
let storedPhone: string;
let fullEmail: string;

const userIds = (): string[] => [
  customerId,
  quietCustomerId,
  shopMemberId,
  platformStaffId,
  exMemberId,
];

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  customerId = newId();
  quietCustomerId = newId();
  shopMemberId = newId();
  platformStaffId = newId();
  exMemberId = newId();
  tenantId = newId();
  vehicleId = newId();
  requestId = newId();
  bookingId = newId();
  tag = customerId.slice(-6);
  // SĐT/email duy nhất theo run: cả hai cột đều @unique.
  // Seed SĐT ở dạng `84…` — ĐÚNG như production ghi (`AuthService.resolveOrCreateUserByPhone`
  // và OTP đều đi qua `normalizePhone`). Seed dạng `09…` sẽ làm test xanh trong khi màn tra cứu
  // thật không tìm ra ai.
  localPhone = `09${customerId.slice(-8).replace(/\D/g, '0').padEnd(8, '7')}`;
  storedPhone = normalizePhone(localPhone);
  fullEmail = `khach.${tag.toLowerCase()}@xeprime.test`;

  const mkUser = (id: string, name: string, extra: Record<string, unknown> = {}) =>
    prisma.user.create({ data: { id, displayName: name, ...extra } });

  await mkUser(customerId, `KhachA-${tag}`, {
    phone: storedPhone,
    email: fullEmail,
    phoneVerifiedAt: new Date(),
    status: USER_STATUS.ACTIVE,
  });
  await mkUser(quietCustomerId, `KhachB-${tag}`, { status: USER_STATUS.LOCKED });
  await mkUser(shopMemberId, `NhanVienShop-${tag}`, { email: `nv-${tag}@xeprime.test` });
  await mkUser(platformStaffId, `NhanSuNenTang-${tag}`, { email: `nt-${tag}@xeprime.test` });
  await mkUser(exMemberId, `NhanVienCu-${tag}`, { email: `nvc-${tag}@xeprime.test` });

  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `CustShop-${tag}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: shopMemberId,
    },
  });
  await prisma.tenantMembership.createMany({
    data: [
      {
        id: newId(),
        tenantId,
        userId: shopMemberId,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      // Nhân viên đã nghỉ: membership `removed` → vẫn được tính là khách.
      {
        id: newId(),
        tenantId,
        userId: exMemberId,
        roleKey: TENANT_ROLE.SHOP_STAFF,
        status: MEMBERSHIP_STATUS.REMOVED,
      },
    ],
  });
  await prisma.platformMembership.create({
    data: {
      id: newId(),
      userId: platformStaffId,
      roleKey: PLATFORM_ROLE.PLATFORM_STAFF,
      status: MEMBERSHIP_STATUS.ACTIVE,
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
  await prisma.booking.create({
    data: {
      id: bookingId,
      tenantId,
      vehicleId,
      code: `DC-${tag}`,
      customerName: `KhachA-${tag}`,
      pickupAt: new Date(Date.UTC(2026, 7, 20, 3)),
      returnAt: new Date(Date.UTC(2026, 7, 22, 3)),
    },
  });
  await prisma.bookingRequest.create({
    data: {
      // Hạn phản hồi 60 phút (25/08) — cột NOT NULL, server luôn tự đặt.
      respondBy: bookingRequestRespondBy(new Date()),
      id: requestId,
      tenantId,
      vehicleId,
      customerUserId: customerId,
      customerName: `KhachA-${tag}`,
      // Yêu cầu thuê giữ SĐT THÔ như khách gõ — khác dạng lưu của `users.phone`.
      customerPhone: localPhone,
      status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      bookingId,
      pickupAt: new Date(Date.UTC(2026, 7, 20, 3)),
      returnAt: new Date(Date.UTC(2026, 7, 22, 3)),
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.auditLog.deleteMany({ where: { targetId: { in: userIds() } } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.platformMembership.deleteMany({ where: { userId: platformStaffId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds() } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Platform customers (Phase 7)', () => {
  maybe('chỉ liệt kê khách: loại chủ shop và nhân sự nền tảng, giữ nhân viên đã nghỉ', async () => {
    const res = await service.list({ q: tag, limit: 100 });
    const ids = res.data.map((c) => c.id);
    expect(ids).toContain(customerId);
    expect(ids).toContain(quietCustomerId);
    expect(ids).toContain(exMemberId);
    expect(ids).not.toContain(shopMemberId);
    expect(ids).not.toContain(platformStaffId);
  });

  maybe('SĐT/email trả ra ĐÃ che, không lộ giá trị đầy đủ', async () => {
    const res = await service.list({ phone: localPhone });
    const row = res.data.find((c) => c.id === customerId);
    expect(row).toBeDefined();
    // Che trên dạng nội địa: 3 ký tự lộ ra là đầu số thật, không phải mã quốc gia `84`.
    expect(row?.phoneMasked).toBe(
      `${localPhone.slice(0, 3)}${'*'.repeat(localPhone.length - 6)}${localPhone.slice(-3)}`,
    );
    expect(row?.emailMasked).toBe(`kh${'*'.repeat(fullEmail.indexOf('@') - 2)}@xeprime.test`);
    expect(JSON.stringify(res.data)).not.toContain(storedPhone);
    expect(JSON.stringify(res.data)).not.toContain(localPhone);
    expect(JSON.stringify(res.data)).not.toContain(fullEmail);
  });

  maybe('tra SĐT tìm được dù hỗ trợ gõ `09…` còn DB lưu `84…`', async () => {
    // Đây là chỗ dễ hỏng nhất của màn này: khách đọc số kiểu `09…`, `users.phone` lưu `84…`.
    expect((await service.list({ phone: localPhone })).data.map((c) => c.id)).toEqual([customerId]);
    expect((await service.list({ phone: storedPhone })).data.map((c) => c.id)).toEqual([
      customerId,
    ]);
    expect(
      (await service.list({ phone: `+84${localPhone.slice(1)}` })).data.map((c) => c.id),
    ).toEqual([customerId]);
  });

  maybe('tra SĐT/email khớp CHÍNH XÁC, không cho dò tiền tố', async () => {
    expect((await service.list({ phone: localPhone.slice(0, 5) })).data).toHaveLength(0);
    expect((await service.list({ email: fullEmail.toUpperCase() })).data).toHaveLength(1);
    expect((await service.list({ email: fullEmail.slice(0, 6) })).data).toHaveLength(0);
  });

  maybe('lọc trạng thái + chỉ khách đã từng đặt xe; đếm yêu cầu/thành đơn', async () => {
    const locked = await service.list({ q: tag, status: USER_STATUS.LOCKED, limit: 100 });
    expect(locked.data.map((c) => c.id)).toEqual([quietCustomerId]);

    const active = await service.list({ q: tag, hasRequests: true, limit: 100 });
    expect(active.data.map((c) => c.id)).toEqual([customerId]);
    expect(active.data[0]?.requestCount).toBe(1);
    expect(active.data[0]?.bookedCount).toBe(1);
    expect(active.data[0]?.phoneVerified).toBe(true);
  });

  maybe('getOne: kèm yêu cầu gần nhất và mã đơn đã tạo', async () => {
    const detail = await service.getOne(customerId);
    expect(detail.recentRequests).toHaveLength(1);
    expect(detail.recentRequests[0]).toMatchObject({
      id: requestId,
      bookingId,
      bookingCode: `DC-${tag}`,
      tenantName: `CustShop-${tag}`,
    });
    expect(detail.conversationCount).toBe(0);
    expect(JSON.stringify(detail)).not.toContain(storedPhone);
    expect(JSON.stringify(detail)).not.toContain(localPhone);
  });

  maybe('getOne với user KHÔNG phải khách → NOT_FOUND', async () => {
    await expect(service.getOne(shopMemberId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    await expect(service.getOne(platformStaffId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });

  maybe('revealContact: trả đầy đủ VÀ ghi audit không chứa PII', async () => {
    const res = await service.revealContact(customerId, shopMemberId);
    expect(res.phone).toBe(storedPhone);
    expect(res.email).toBe(fullEmail);

    const log = await prisma.auditLog.findFirst({
      where: { action: 'customer.contact_reveal', targetId: customerId },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.actorScope).toBe('platform');
    expect(log?.actorUserId).toBe(shopMemberId);
    expect(JSON.stringify(log?.afterJson)).not.toContain(storedPhone);
    expect(JSON.stringify(log?.afterJson)).not.toContain(fullEmail);
  });

  maybe('id lạ → NOT_FOUND', async () => {
    await expect(service.revealContact(newId(), shopMemberId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });
});
