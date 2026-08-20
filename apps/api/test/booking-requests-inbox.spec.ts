import type { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  BRANCH_STATUS,
  MEMBERSHIP_STATUS,
  SERVICE_TYPE,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import type { AuthService } from '../src/modules/auth/auth.service';
import { BookingRequestsService } from '../src/modules/booking-requests/booking-requests.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { ChatService } from '../src/modules/chat/chat.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { DriversService } from '../src/modules/drivers/drivers.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import type { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Hộp thư yêu cầu thuê của gian hàng, trên PostgreSQL THẬT.
 *
 * Ba nhóm bảo đảm:
 *   1. DTO đủ thứ inbox cần (ảnh/mã/loại xe, hồ sơ khách, mức rủi ro, có nhắn tin được không),
 *      và `customerUserId` KHÔNG bao giờ rò ra ngoài.
 *   2. Đếm theo trạng thái đúng phạm vi gian hàng + chi nhánh, và KHÔNG bị bộ lọc trạng thái
 *      đang bật làm hẹp lại — nếu không thì con số trên tab chỉ đúng ở đúng tab đang mở.
 *   3. Không rò dữ liệu chéo gian hàng ở cả ba đường: list, chi tiết, và mở hội thoại.
 *
 * Cộng thêm: duyệt phải kiểm LẠI danh sách từ chối phục vụ, và chỗ trên lịch vẫn do constraint
 * DB giữ (ADR 0006) chứ không do một phép kiểm ở tầng app.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = new NotificationService(asService);
const pricing = new PricingService(asService, audit, new ListingsService(asService));
const occupancy = new OccupancyService(asService);
const customers = new CustomersService(asService, audit);
const bookings = new BookingsService(
  asService,
  occupancy,
  audit,
  notifications,
  new DriversService(asService, audit),
  customers,
);

const phoneVerification = {
  assertPhoneVerifiedForBooking: async () => {},
} as unknown as PhoneVerificationService;
const auth = {
  resolveOrCreateUserByPhone: async () => ({ userId: null }),
} as unknown as AuthService;

const requests = new BookingRequestsService(
  asService,
  bookings,
  audit,
  notifications,
  phoneVerification,
  auth,
  occupancy,
  pricing,
  customers,
);

// ChatService chỉ đụng ConfigService cho R2 (đính kèm) — spec này không gửi tin nào.
const chat = new ChatService(asService, { get: () => undefined } as unknown as ConfigService);

let dbAvailable = false;
let ownerId: string;
let customerUserId: string;
let tenantId: string;
let otherTenantId: string;
let otherOwnerId: string;
let branchAId: string;
let branchBId: string;
let vehicleAId: string;
let vehicleBId: string;
let otherVehicleId: string;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Mốc tương lai — tránh đụng dữ liệu của spec khác trên cùng database. */
const at = (dayOffset: number) => new Date(Date.now() + dayOffset * DAY);

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
  otherOwnerId = newId();
  customerUserId = newId();
  tenantId = newId();
  otherTenantId = newId();
  branchAId = newId();
  branchBId = newId();
  vehicleAId = newId();
  vehicleBId = newId();
  otherVehicleId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
      {
        id: otherOwnerId,
        displayName: 'Chủ shop khác',
        email: `own2-${otherOwnerId}@xeprime.test`,
      },
      {
        id: customerUserId,
        displayName: 'Khách có tài khoản',
        email: `cus-${customerUserId}@xeprime.test`,
        avatarUrl: 'https://cdn.test/avatar.png',
      },
    ],
  });

  for (const [id, owner, code] of [
    [tenantId, ownerId, 'INBOX'],
    [otherTenantId, otherOwnerId, 'OTHER'],
  ] as const) {
    await prisma.tenant.create({
      data: {
        id,
        code: `${code}-${id.slice(-8)}`,
        slug: `${code.toLowerCase()}-${id.toLowerCase().slice(-8)}`,
        name: `Shop ${code}`,
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: owner,
      },
    });
    await prisma.tenantMembership.create({
      data: {
        id: newId(),
        tenantId: id,
        userId: owner,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    });
  }

  await prisma.tenantBranch.createMany({
    data: [
      { id: branchAId, tenantId, code: 'CN01', name: 'Chi nhánh A', status: BRANCH_STATUS.ACTIVE },
      { id: branchBId, tenantId, code: 'CN02', name: 'Chi nhánh B', status: BRANCH_STATUS.ACTIVE },
    ],
  });

  await prisma.vehicle.createMany({
    data: [
      {
        id: vehicleAId,
        tenantId,
        branchId: branchAId,
        code: 'XE-A1',
        name: 'Kia Carnival 2025',
        plateNumber: '51A-123.45',
        vehicleType: VEHICLE_TYPE.CAR,
        mainImageUrl: 'https://cdn.test/kia.jpg',
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
        weekdayPrice: new Prisma.Decimal('900000'),
        weekendPrice: new Prisma.Decimal('1100000'),
      },
      {
        id: vehicleBId,
        tenantId,
        branchId: branchBId,
        code: 'XE-B1',
        name: 'Honda SH 150i',
        vehicleType: VEHICLE_TYPE.MOTORBIKE,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
        weekdayPrice: new Prisma.Decimal('200000'),
      },
      {
        id: otherVehicleId,
        tenantId: otherTenantId,
        code: 'XE-X1',
        name: 'Xe của shop khác',
        vehicleType: VEHICLE_TYPE.CAR,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
        weekdayPrice: new Prisma.Decimal('500000'),
      },
    ],
  });
});

afterAll(async () => {
  if (dbAvailable) {
    for (const id of [tenantId, otherTenantId]) {
      await prisma.messageOutbox.deleteMany({
        where: { message: { conversation: { tenantId: id } } },
      });
      await prisma.conversationParticipant.deleteMany({
        where: { conversation: { tenantId: id } },
      });
      await prisma.conversation.deleteMany({ where: { tenantId: id } });
      await prisma.bookingRequest.deleteMany({ where: { tenantId: id } });
      await prisma.vehicleOccupancy.deleteMany({ where: { tenantId: id } });
      await prisma.booking.deleteMany({ where: { tenantId: id } });
      await prisma.auditLog.deleteMany({ where: { tenantId: id } });
      await prisma.notification.deleteMany({ where: { tenantId: id } });
      await prisma.tenantCustomer.deleteMany({ where: { tenantId: id } });
      await prisma.vehicle.deleteMany({ where: { tenantId: id } });
      await prisma.tenantBranch.deleteMany({ where: { tenantId: id } });
      await prisma.tenantMembership.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, otherOwnerId, customerUserId] } },
    });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/** Ghi thẳng một yêu cầu — spec này kiểm ĐỌC và DUYỆT, không kiểm lại luồng gửi công khai. */
async function seedRequest(overrides: {
  tenantId: string;
  vehicleId: string;
  status?: string;
  customerName?: string;
  serviceType?: string;
  customerPhone?: string;
  customerUserId?: string | null;
  tenantCustomerId?: string | null;
  pickupAt?: Date;
  returnAt?: Date;
}): Promise<string> {
  const id = newId();
  const pickupAt = overrides.pickupAt ?? at(3);
  await prisma.bookingRequest.create({
    data: {
      id,
      tenantId: overrides.tenantId,
      vehicleId: overrides.vehicleId,
      status: overrides.status ?? BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      customerName: overrides.customerName ?? 'Nguyễn Văn An',
      customerPhone: overrides.customerPhone ?? '0901234567',
      customerEmail: 'an@test.vn',
      customerUserId: overrides.customerUserId ?? null,
      tenantCustomerId: overrides.tenantCustomerId ?? null,
      serviceType: overrides.serviceType ?? SERVICE_TYPE.SELF_DRIVE,
      pickupAt,
      returnAt: overrides.returnAt ?? new Date(pickupAt.getTime() + 2 * DAY),
    },
  });
  return id;
}

describe('BookingRequestsService.list — DTO của hộp thư', () => {
  maybe('mang đủ ảnh/mã/loại xe, hồ sơ khách, avatar và mức rủi ro', async () => {
    const tenantCustomerId = newId();
    await prisma.tenantCustomer.create({
      data: {
        id: tenantCustomerId,
        tenantId,
        fullName: 'Nguyễn Văn An',
        phone: '0901234567',
        normalizedPhone: '84901234567',
        riskLevel: TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST,
        riskReason: 'Từng trả xe muộn',
        customerUserId,
      },
    });
    const id = await seedRequest({
      tenantId,
      vehicleId: vehicleAId,
      customerUserId,
      tenantCustomerId,
    });

    const page = await requests.list(tenantId, {});
    const row = page.data.find((r) => r.id === id)!;

    expect(row.vehicleCode).toBe('XE-A1');
    expect(row.vehiclePlate).toBe('51A-123.45');
    expect(row.vehicleImageUrl).toBe('https://cdn.test/kia.jpg');
    expect(row.vehicleType).toBe(VEHICLE_TYPE.CAR);
    expect(row.tenantCustomerId).toBe(tenantCustomerId);
    expect(row.customerAvatarUrl).toBe('https://cdn.test/avatar.png');
    expect(row.customerRiskLevel).toBe(TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST);
    expect(row.canMessageOnPlatform).toBe(true);
    expect(row.decidedAt).toBeNull();
  });

  maybe('khách vãng lai: không có tài khoản ⇒ không nhắn tin trong ứng dụng được', async () => {
    const id = await seedRequest({
      tenantId,
      vehicleId: vehicleAId,
      customerPhone: '0902222222',
      customerUserId: null,
    });
    const page = await requests.list(tenantId, {});
    const row = page.data.find((r) => r.id === id)!;
    expect(row.canMessageOnPlatform).toBe(false);
    expect(row.customerAvatarUrl).toBeNull();
    expect(row.customerRiskLevel).toBeNull();
  });

  maybe('KHÔNG bao giờ trả `customerUserId` ra ngoài', async () => {
    const page = await requests.list(tenantId, {});
    for (const row of page.data) {
      expect(Object.keys(row)).not.toContain('customerUserId');
    }
  });

  maybe('chỉ thấy yêu cầu của gian hàng mình', async () => {
    const foreign = await seedRequest({ tenantId: otherTenantId, vehicleId: otherVehicleId });

    const mine = await requests.list(tenantId, {});
    expect(mine.data.some((r) => r.id === foreign)).toBe(false);

    // Chi tiết cũng vậy: id của gian hàng khác là 404, không phải 403 (không lộ sự tồn tại).
    await expect(requests.getOne(tenantId, foreign)).rejects.toMatchObject({
      status: 404,
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });
});

describe('BookingRequestsService.list — tìm kiếm và lọc dịch vụ', () => {
  maybe('ô tìm kiếm chạm tên khách, SĐT, tên xe và biển số', async () => {
    const id = await seedRequest({
      tenantId,
      vehicleId: vehicleAId,
      customerName: 'Trần Thị Bích Ngọc',
      customerPhone: '0917775555',
    });

    for (const term of ['Bích Ngọc', '0917775555', 'Carnival', '51A-123.45']) {
      const page = await requests.list(tenantId, { q: term, status: undefined });
      expect(page.data.map((r) => r.id)).toContain(id);
    }

    const none = await requests.list(tenantId, { q: 'khong-ton-tai-xyz' });
    expect(none.data).toHaveLength(0);
    expect(none.meta.total).toBe(0);
  });

  maybe('con số trên TAB đi theo ô tìm kiếm, không phải tổng cũ', async () => {
    // Nếu `q` chỉ vào `where` mà không vào `scope`, tab vẫn khoe con số của cả hộp thư trong
    // khi danh sách đã hẹp lại — người trực đọc hai con số mâu thuẫn nhau trên cùng một màn.
    const all = await requests.list(tenantId, {});
    const searched = await requests.list(tenantId, { q: 'khong-ton-tai-xyz' });

    expect(searched.meta.statusCounts.every((entry) => entry.count === 0)).toBe(true);
    expect(all.meta.statusCounts.some((entry) => entry.count > 0)).toBe(true);
  });

  maybe('lọc theo dịch vụ trả đúng nhánh, và cũng kéo theo con số của tab', async () => {
    const longTermId = await seedRequest({
      tenantId,
      vehicleId: vehicleAId,
      serviceType: SERVICE_TYPE.LONG_TERM,
      customerPhone: '0918886666',
    });

    const longTerm = await requests.list(tenantId, { serviceType: SERVICE_TYPE.LONG_TERM });
    expect(longTerm.data.map((r) => r.id)).toContain(longTermId);
    expect(longTerm.data.every((r) => r.serviceType === SERVICE_TYPE.LONG_TERM)).toBe(true);
    expect(longTerm.meta.total).toBe(longTerm.data.length);

    const selfDrive = await requests.list(tenantId, { serviceType: SERVICE_TYPE.SELF_DRIVE });
    expect(selfDrive.data.map((r) => r.id)).not.toContain(longTermId);
  });

  maybe('tìm kiếm KHÔNG vượt ra khỏi gian hàng của mình', async () => {
    const id = await seedRequest({
      tenantId,
      vehicleId: vehicleAId,
      customerName: 'Khách Chỉ Của Shop Này',
      customerPhone: '0919997777',
    });

    const mine = await requests.list(tenantId, { q: 'Chỉ Của Shop Này' });
    expect(mine.data.map((r) => r.id)).toContain(id);

    const theirs = await requests.list(otherTenantId, { q: 'Chỉ Của Shop Này' });
    expect(theirs.data).toHaveLength(0);
  });
});

describe('BookingRequestsService.list — đếm theo trạng thái', () => {
  maybe('đếm BỎ QUA bộ lọc trạng thái đang bật (mỗi tab một con số đúng)', async () => {
    await seedRequest({
      tenantId,
      vehicleId: vehicleAId,
      status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
      customerPhone: '0903333333',
    });

    const all = await requests.list(tenantId, {});
    const filtered = await requests.list(tenantId, {
      status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
    });

    // Trang dữ liệu hẹp lại theo bộ lọc…
    expect(filtered.data.every((r) => r.status === BOOKING_REQUEST_STATUS.REJECTED_BY_HOST)).toBe(
      true,
    );
    // …nhưng con số của các tab thì KHÔNG.
    expect(filtered.meta.statusCounts).toEqual(all.meta.statusCounts);
    expect(countOf(filtered, BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL)).toBeGreaterThan(0);
  });

  maybe('liệt kê ĐỦ bộ trạng thái, kể cả trạng thái chưa có yêu cầu nào', async () => {
    const page = await requests.list(tenantId, {});
    expect(page.meta.statusCounts.map((entry) => entry.status).sort()).toEqual(
      [...new Set(page.meta.statusCounts.map((e) => e.status))].sort(),
    );
    expect(countOf(page, BOOKING_REQUEST_STATUS.APPROVED_BY_HOST)).toBe(0);
  });

  maybe('scope theo CHI NHÁNH của xe, và không bao giờ ra khỏi gian hàng', async () => {
    await seedRequest({ tenantId, vehicleId: vehicleBId, customerPhone: '0904444444' });

    const branchA = await requests.list(tenantId, { branchId: branchAId });
    const branchB = await requests.list(tenantId, { branchId: branchBId });
    const both = await requests.list(tenantId, {});

    expect(branchA.data.every((r) => r.vehicleId === vehicleAId)).toBe(true);
    expect(branchB.data.every((r) => r.vehicleId === vehicleBId)).toBe(true);
    expect(total(branchA) + total(branchB)).toBe(total(both));
  });

  maybe('gian hàng khác đếm bằng dữ liệu của chính nó', async () => {
    const mine = await requests.list(tenantId, {});
    const theirs = await requests.list(otherTenantId, {});
    expect(total(theirs)).toBe(1);
    expect(total(mine)).toBeGreaterThan(total(theirs));
  });
});

describe('BookingRequestsService.approve — chặn ở tầng dữ liệu', () => {
  maybe('khách bị đánh dấu "từ chối phục vụ" SAU khi gửi ⇒ không duyệt được nữa', async () => {
    const phone = '0905555555';
    const id = await seedRequest({ tenantId, vehicleId: vehicleAId, customerPhone: phone });
    await prisma.tenantCustomer.create({
      data: {
        id: newId(),
        tenantId,
        fullName: 'Khách bị chặn',
        phone,
        normalizedPhone: '84905555555',
        riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED,
        riskReason: 'Gây tai nạn và không bồi thường',
      },
    });

    await expect(requests.approve(tenantId, ownerId, id)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.CUSTOMER_BLOCKED },
    });

    // Yêu cầu vẫn nguyên trạng — không có đơn nào và không có chỗ nào bị giữ trên lịch.
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(row.bookingId).toBeNull();
  });

  maybe('duyệt xong: đơn + occupancy trong một transaction, và ghi `decidedAt`', async () => {
    const pickupAt = at(30);
    const id = await seedRequest({
      tenantId,
      vehicleId: vehicleBId,
      customerPhone: '0906666666',
      pickupAt,
    });

    const dto = await requests.approve(tenantId, ownerId, id);
    expect(dto.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    expect(dto.bookingId).not.toBeNull();
    expect(dto.decidedAt).not.toBeNull();

    const held = await prisma.vehicleOccupancy.count({
      where: { vehicleId: vehicleBId, sourceId: dto.bookingId! },
    });
    expect(held).toBe(1);
  });

  maybe('CHÍNH constraint DB giữ chỗ: yêu cầu thứ hai trùng khung giờ nhận 409', async () => {
    const pickupAt = at(60);
    const first = await seedRequest({
      tenantId,
      vehicleId: vehicleAId,
      customerPhone: '0907777771',
      pickupAt,
    });
    const second = await seedRequest({
      tenantId,
      vehicleId: vehicleAId,
      customerPhone: '0907777772',
      // Chồng lên nhau NỬA khoảng — kiểu trùng mà một phép kiểm "cùng ngày" ở tầng app hay bỏ sót.
      pickupAt: new Date(pickupAt.getTime() + DAY),
    });

    await requests.approve(tenantId, ownerId, first);
    /*
     * Ở tầng service ta thấy ĐÚNG tên constraint đã nổ — bằng chứng rằng thứ chặn là ràng buộc
     * DB chứ không phải một phép kiểm ở tầng app (ADR 0006). `AllExceptionsFilter` mới là chỗ
     * đổi `23P01` thành 409 + `BOOKING_SCHEDULE_CONFLICT` ở tầng HTTP.
     */
    await expect(requests.approve(tenantId, ownerId, second)).rejects.toMatchObject({
      message: expect.stringContaining('vehicle_occupancies_no_overlap'),
    });

    // Yêu cầu thua cuộc VẪN chờ duyệt — gian hàng chọn giờ khác hoặc từ chối (ADR 0006).
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: second } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
  });

  maybe('yêu cầu của gian hàng khác: 404, không duyệt hộ được', async () => {
    const foreign = await seedRequest({ tenantId: otherTenantId, vehicleId: otherVehicleId });
    await expect(requests.approve(tenantId, ownerId, foreign)).rejects.toMatchObject({
      status: 404,
    });
  });

  maybe('dịch vụ theo NGÀY không nhận `scheduledPickupAt` (đó là luật của dài hạn)', async () => {
    const id = await seedRequest({ tenantId, vehicleId: vehicleAId, customerPhone: '0908888888' });
    await expect(
      requests.approve(tenantId, ownerId, id, { scheduledPickupAt: at(90).toISOString() }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: API_ERROR_CODE.VALIDATION_FAILED },
    });
  });
});

describe('ChatService.getOrCreateConversationForBookingRequest — đường của GIAN HÀNG', () => {
  maybe('mở hội thoại với khách của yêu cầu, phía người xem là `shop`', async () => {
    const id = await seedRequest({
      tenantId,
      vehicleId: vehicleAId,
      customerPhone: '0909111111',
      customerUserId,
    });

    const conversation = await chat.getOrCreateConversationForBookingRequest(tenantId, id);
    expect(conversation.side).toBe('shop');
    expect(conversation.vehicleId).toBe(vehicleAId);
    // Shop nhìn thấy tên KHÁCH (khách nhìn thấy tên shop) — hai phía, một thread.
    expect(conversation.partyName).toBe('Khách có tài khoản');

    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(row.tenantId).toBe(tenantId);
    expect(row.customerUserId).toBe(customerUserId);
  });

  maybe('idempotent: gọi lại và cả đường của KHÁCH đều rơi vào đúng một thread', async () => {
    const id = await seedRequest({
      tenantId,
      vehicleId: vehicleAId,
      customerPhone: '0909222222',
      customerUserId,
    });

    const first = await chat.getOrCreateConversationForBookingRequest(tenantId, id);
    const second = await chat.getOrCreateConversationForBookingRequest(tenantId, id);
    expect(second.id).toBe(first.id);

    // Khách bấm "Nhắn shop" trên chính chiếc xe đó phải mở lại thread này, không đẻ thread mới.
    const fromCustomer = await chat.getOrCreateConversation(customerUserId, {
      vehicleId: vehicleAId,
    });
    expect(fromCustomer.id).toBe(first.id);
    expect(fromCustomer.side).toBe('customer');

    expect(
      await prisma.conversation.count({ where: { customerUserId, vehicleId: vehicleAId } }),
    ).toBe(1);
  });

  maybe('khách vãng lai chưa có tài khoản ⇒ CHAT_CUSTOMER_UNAVAILABLE', async () => {
    const id = await seedRequest({
      tenantId,
      vehicleId: vehicleAId,
      customerPhone: '0909333333',
      customerUserId: null,
    });

    await expect(chat.getOrCreateConversationForBookingRequest(tenantId, id)).rejects.toMatchObject(
      {
        status: 400,
        response: { code: API_ERROR_CODE.CHAT_CUSTOMER_UNAVAILABLE },
      },
    );
  });

  maybe('yêu cầu của gian hàng khác ⇒ 404, và KHÔNG tạo hội thoại nào', async () => {
    const foreign = await seedRequest({
      tenantId: otherTenantId,
      vehicleId: otherVehicleId,
      customerUserId,
    });

    await expect(
      chat.getOrCreateConversationForBookingRequest(tenantId, foreign),
    ).rejects.toMatchObject({ status: 404, response: { code: API_ERROR_CODE.NOT_FOUND } });

    expect(
      await prisma.conversation.count({ where: { customerUserId, vehicleId: otherVehicleId } }),
    ).toBe(0);
  });
});

function countOf(
  page: { meta: { statusCounts: { status: string; count: number }[] } },
  status: string,
) {
  return page.meta.statusCounts.find((entry) => entry.status === status)?.count ?? 0;
}

function total(page: { meta: { total: number } }) {
  return page.meta.total;
}
