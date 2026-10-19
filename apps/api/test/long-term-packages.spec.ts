import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import { giveTenantPlan } from './helpers/billing-fixture';
import {
  ACCOUNT_REALM,
  BILLING_MODE,
  BOOKING_REQUEST_STATUS,
  bookingRequestRespondBy,
  longTermReturnAt,
  MEMBERSHIP_STATUS,
  PICKUP_PREFERENCE,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  vnDateKey,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBookingHoldsService,
  makeBookingRequestsService,
  makeBookingsService,
  makeCustomersService,
  makeNotificationService,
  makePricingService,
} from './helpers/service-factory';
import { customerAccountFor } from './helpers/customer-account';
import { settleIfAwaitingHold } from './helpers/hold-payment';

/**
 * Thuê dài hạn theo GÓI cố định (ADR 0011), trên PostgreSQL THẬT — vòng đời đầy đủ:
 *
 *   1. Khách gửi yêu cầu bằng GÓI + nguyện vọng nhận xe; KHÔNG có ngày trả, và ngày trả client
 *      cố tình gửi kèm phải bị bỏ qua.
 *   2. Khoảng "trong 7 ngày tới" do SERVER tính — client không giả mạo được.
 *   3. Yêu cầu còn chờ duyệt KHÔNG chiếm lịch (ADR 0006).
 *   4. Duyệt bắt gian hàng chốt giờ nhận, kiểm đúng nguyện vọng, rồi server suy ngày trả bằng
 *      THÁNG LỊCH; đơn + occupancy sinh ra trong cùng transaction.
 *   5. Trùng lịch → 409 và yêu cầu vẫn ở trạng thái chờ duyệt.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const pricing = makePricingService(asService);
const occupancy = new OccupancyService(asService);
const bookings = makeBookingsService(asService, {
  occupancy: occupancy,
  audit: audit,
  notifications: notifications,
  customers: makeCustomersService(asService, audit),
});

/**
 * Thuê dài hạn là NGOẠI LỆ của ADR 0039 điều 4: chưa chốt lịch thì chưa có giá, nên hold sinh
 * lúc gian hàng DUYỆT chứ không lúc khách gửi. Nhưng cọc thì vẫn thu (cả sàn thu từ
 * 16/09/2026), nên duyệt xong chuyến dừng ở `awaiting_hold` và chỉ thành ĐƠN khi tiền về.
 */
const holds = makeBookingHoldsService(asService);
const requests = makeBookingRequestsService(asService, {
  bookings: bookings,
  audit: audit,
  notifications: notifications,
  occupancy: occupancy,
  pricing: pricing,
  customers: makeCustomersService(asService, audit),
});

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;

/** Tài khoản khách đã gửi yêu cầu trong spec — dọn ở `afterAll`. */
const customerIds = new Set<string>();
/**
 * Người gửi yêu cầu: một tài khoản KHÁCH đã xác minh SĐT (ADR 0060) — họ tên và SĐT của yêu cầu
 * đọc từ tài khoản này. Mỗi số một người, nên các ca dùng số khác nhau vẫn là những khách khác nhau.
 */
async function customer(name: string, phone: string): Promise<string> {
  const id = await customerAccountFor(asService, phone, name);
  customerIds.add(id);
  return id;
}

/** Ngày lịch VN cách hôm nay `n` ngày — nguyện vọng nhận xe luôn nằm ở tương lai. */
const dayFromToday = (n: number): string => vnDateKey(new Date(Date.now() + n * 86_400_000));
/** `YYYY-MM-DD` + giờ VN → ISO. */
const atVn = (dateKey: string, hhmm: string) => `${dateKey}T${hhmm}:00.000+07:00`;

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
  vehicleId = newId();

  await prisma.user.createMany({
    data: [
      {
        realm: ACCOUNT_REALM.PARTNER,
        id: ownerId,
        displayName: 'Chủ shop',
        email: `owner-${ownerId}@xeprime.test`,
      },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `LT-${tenantId.slice(-8)}`,
      slug: `lt-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Shop Dài Hạn',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await giveTenantPlan(prisma, tenantId, { billingMode: BILLING_MODE.PACKAGE });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: 'V-LT',
      name: 'Kia Carnival 2025',
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.LONG_TERM],
      weekdayPrice: new Prisma.Decimal('900000'),
      monthlyPrice: new Prisma.Decimal('12000000'),
      // Khuyến mãi trực tiếp của TỰ LÁI — không được chạm vào giá gói dài hạn.
      discountPercent: 10,
    },
  });
  await prisma.rentalPolicy.create({
    data: {
      id: newId(),
      tenantId,
      depositAmount: new Prisma.Decimal('5000000'),
      discountEnabled: true,
      discountTiers: [
        { minMonths: 1, percent: 5 },
        { minMonths: 3, percent: 15 },
        { minMonths: 6, percent: 20 },
      ] as unknown as Prisma.InputJsonValue,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.bookingRequest.deleteMany({ where: { tenantId } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.rentalPolicy.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, ...customerIds] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('khách gửi yêu cầu thuê dài hạn bằng GÓI', () => {
  maybe(
    'specific_date: lưu đúng ngày mong muốn, KHÔNG có lịch chốt và không chiếm chỗ',
    async () => {
      const wanted = dayFromToday(3);
      const receipt = await requests.submitPublic(
        {
          vehicleId,
          serviceType: SERVICE_TYPE.LONG_TERM,
          longTermPackageMonths: 3,
          pickupPreference: PICKUP_PREFERENCE.SPECIFIC_DATE,
          requestedPickupDate: wanted,
          // Client cố tình gửi kèm lịch — server phải bỏ qua hoàn toàn.
          pickupAt: new Date().toISOString(),
          returnAt: new Date(Date.now() + 999 * 86_400_000).toISOString(),
        },
        await customer('Trần Thị B', '0943000001'),
      );

      const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
      expect(row.serviceType).toBe(SERVICE_TYPE.LONG_TERM);
      expect(row.longTermPackageMonths).toBe(3);
      expect(row.pickupPreference).toBe(PICKUP_PREFERENCE.SPECIFIC_DATE);
      expect(row.requestedPickupDate?.toISOString().slice(0, 10)).toBe(wanted);
      // Ngày trả client gửi lên không được ghi vào đâu cả.
      expect(row.pickupAt).toBeNull();
      expect(row.returnAt).toBeNull();
      expect(row.pickupWindowStartDate).toBeNull();

      // Yêu cầu chờ duyệt KHÔNG chiếm lịch (ADR 0006).
      expect(await prisma.vehicleOccupancy.count({ where: { vehicleId } })).toBe(0);
    },
  );

  maybe('within_7_days: SERVER tính khoảng, client không khai được', async () => {
    const receipt = await requests.submitPublic(
      {
        vehicleId,
        serviceType: SERVICE_TYPE.LONG_TERM,
        longTermPackageMonths: 6,
        pickupPreference: PICKUP_PREFERENCE.WITHIN_7_DAYS,
        // Ngày cụ thể gửi kèm phải bị bỏ, vì nguyện vọng là khoảng linh hoạt.
        requestedPickupDate: dayFromToday(40),
      },
      await customer('Lê Văn C', '0943000002'),
    );

    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(row.requestedPickupDate).toBeNull();
    expect(row.pickupWindowStartDate?.toISOString().slice(0, 10)).toBe(dayFromToday(1));
    expect(row.pickupWindowEndDate?.toISOString().slice(0, 10)).toBe(dayFromToday(7));
  });

  maybe('gói ngoài bộ cho phép và ngày nhận trong quá khứ đều bị chặn', async () => {
    await expect(
      requests.submitPublic(
        {
          vehicleId,
          serviceType: SERVICE_TYPE.LONG_TERM,
          longTermPackageMonths: 4,
          pickupPreference: PICKUP_PREFERENCE.WITHIN_7_DAYS,
        },
        await customer('X', '0943000003'),
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      requests.submitPublic(
        {
          vehicleId,
          serviceType: SERVICE_TYPE.LONG_TERM,
          longTermPackageMonths: 3,
          pickupPreference: PICKUP_PREFERENCE.SPECIFIC_DATE,
          requestedPickupDate: dayFromToday(-1),
        },
        await customer('X', '0943000004'),
      ),
    ).rejects.toMatchObject({
      response: { message: expect.stringContaining('từ ngày mai') },
    });
  });
});

describe('duyệt yêu cầu dài hạn — gian hàng chốt giờ nhận, server suy ngày trả', () => {
  let requestId: string;
  const wanted = dayFromToday(4);

  maybe('thiếu giờ nhận hoặc chốt lệch nguyện vọng đều bị từ chối', async () => {
    const receipt = await requests.submitPublic(
      {
        vehicleId,
        serviceType: SERVICE_TYPE.LONG_TERM,
        longTermPackageMonths: 3,
        pickupPreference: PICKUP_PREFERENCE.SPECIFIC_DATE,
        requestedPickupDate: wanted,
      },
      await customer('Phạm Thị D', '0943000005'),
    );
    requestId = receipt.id;

    await expect(requests.approve(tenantId, ownerId, requestId)).rejects.toMatchObject({
      response: { message: expect.stringContaining('Chọn ngày và giờ nhận xe') },
    });

    await expect(
      requests.approve(tenantId, ownerId, requestId, {
        scheduledPickupAt: atVn(dayFromToday(9), '09:00'),
      }),
    ).rejects.toMatchObject({
      response: { message: expect.stringContaining(wanted) },
    });

    // Vẫn chờ duyệt — hai lần từ chối trên không được đổi trạng thái yêu cầu.
    const still = await requests.getOne(tenantId, requestId);
    expect(still.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
  });

  maybe('chốt đúng ngày: đơn mang gói, ngày trả = nhận + 3 tháng lịch, giá theo GÓI', async () => {
    const approved = await requests.approve(tenantId, ownerId, requestId, {
      scheduledPickupAt: atVn(wanted, '08:30'),
    });
    // Duyệt xong là CHỜ TIỀN, chưa có đơn — gian hàng đã chốt lịch, khách chưa trả.
    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    expect(approved.bookingId).toBeNull();

    await settleIfAwaitingHold(asService, holds, requestId);

    /*
     * Tiền về ⇒ ĐƠN NGAY, không bắt duyệt lần hai: gian hàng đã nhận chuyến ở bước trên
     * (`decided_at` khác null), và đó chính là phép phân biệt hai đường sinh hold của ADR 0039
     * điều 4.
     */
    const settled = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(settled.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: settled.bookingId! },
    });
    expect(booking.longTermPackageMonths).toBe(3);
    expect(vnDateKey(booking.pickupAt)).toBe(wanted);
    // Cộng THÁNG LỊCH, giữ nguyên giờ nhận — qua `longTermReturnAt`, hàm DUY NHẤT được phép
    // suy ngày trả của một gói dài hạn (ADR 0011).
    //
    // KHÔNG tự dựng lại phép cộng bằng `Date.UTC(y, m + 3, d)`: JS cho tháng TRÀN, nên
    // 31/08 + 3 tháng ra 01/12. Còn tháng lịch thì KẸP về ngày cuối tháng đích — 30/11.
    // Hai cách chỉ khác nhau đúng vào những ngày cuối tháng, nên bản tự tính chạy xanh quanh
    // năm rồi đỏ vài ngày (đã đỏ thật ngày 27/08/2026, khi `dayFromToday(4)` rơi vào 31/08).
    expect(booking.returnAt.toISOString()).toBe(
      longTermReturnAt(new Date(atVn(wanted, '08:30')), 3).toISOString(),
    );

    // 12tr × 3 = 36tr, mốc 3 tháng giảm 15% → 30,6tr. Khuyến mãi tự lái 10% KHÔNG áp.
    expect(booking.totalAmount.toFixed(0)).toBe('30600000');
    const snapshot = booking.priceSnapshot as unknown as {
      longTerm?: { packageMonths: number; durationDiscountPercent: number | null };
      days?: number;
    };
    expect(snapshot.longTerm).toMatchObject({ packageMonths: 3, durationDiscountPercent: 15 });
    expect(snapshot.days).toBeUndefined();

    // Duyệt xong mới chiếm lịch, đúng khoảng của đơn.
    const occ = await prisma.vehicleOccupancy.findMany({ where: { vehicleId } });
    expect(occ).toHaveLength(1);

    // Yêu cầu giữ lại lịch đã chốt để inbox không phải join sang đơn.
    const req = await requests.getOne(tenantId, requestId);
    expect(req.pickupAt).toBeTruthy();
    expect(req.returnAt).toBeTruthy();
  });

  maybe('trùng lịch → 409 và yêu cầu thứ hai VẪN chờ duyệt', async () => {
    const receipt = await requests.submitPublic(
      {
        vehicleId,
        serviceType: SERVICE_TYPE.LONG_TERM,
        longTermPackageMonths: 1,
        pickupPreference: PICKUP_PREFERENCE.SPECIFIC_DATE,
        // Cùng ngày nhận với đơn vừa tạo → chắc chắn chồng lịch.
        requestedPickupDate: wanted,
      },
      await customer('Hoàng Văn E', '0943000006'),
    );

    // Constraint DB là thứ chặn thật (ADR 0006); AllExceptionsFilter đổi 23P01 thành 409 ở
    // tầng HTTP, còn ở tầng service ta thấy đúng tên constraint đã nổ.
    await expect(
      requests.approve(tenantId, ownerId, receipt.id, {
        scheduledPickupAt: atVn(wanted, '10:00'),
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('vehicle_occupancies_no_overlap'),
    });

    const after = await requests.getOne(tenantId, receipt.id);
    expect(after.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(after.bookingId).toBeNull();
    // Không có đơn/occupancy rác nào sinh ra từ lần duyệt hỏng.
    expect(await prisma.vehicleOccupancy.count({ where: { vehicleId } })).toBe(1);
  });
});

describe('yêu cầu dài hạn LEGACY (chưa có gói)', () => {
  maybe('duyệt phải chọn gói; không tự làm tròn từ khoảng ngày cũ', async () => {
    const legacyId = newId();
    const pickupAt = new Date(atVn(dayFromToday(400), '09:00'));
    await prisma.bookingRequest.create({
      data: {
        // Hạn phản hồi 60 phút (25/08) — cột NOT NULL, server luôn tự đặt.
        respondBy: bookingRequestRespondBy(new Date()),
        id: legacyId,
        tenantId,
        vehicleId,
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        customerName: 'Khách cũ',
        customerPhone: '0902000007',
        serviceType: SERVICE_TYPE.LONG_TERM,
        // Bản ghi đời cũ: có lịch tự chọn, không gói, không nguyện vọng.
        pickupAt,
        returnAt: new Date(pickupAt.getTime() + 45 * 86_400_000),
      },
    });

    await expect(requests.approve(tenantId, ownerId, legacyId)).rejects.toMatchObject({
      response: { message: expect.stringContaining('chưa có gói') },
    });

    await requests.approve(tenantId, ownerId, legacyId, { longTermPackageMonths: 2 });
    // Cùng đường với ca trên: duyệt chốt lịch, tiền về mới thành đơn (ADR 0039 điều 4).
    await settleIfAwaitingHold(asService, holds, legacyId);
    const settled = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: legacyId } });
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: settled.bookingId! },
    });
    // Giữ nguyên giờ nhận khách từng chọn (không đổi ngày ngầm), ngày trả theo gói đã chốt.
    expect(booking.pickupAt.toISOString()).toBe(pickupAt.toISOString());
    expect(booking.longTermPackageMonths).toBe(2);
    // 12tr × 2 = 24tr, mốc 1 tháng giảm 5% → 22,8tr.
    expect(booking.totalAmount.toFixed(0)).toBe('22800000');
  });
});

describe('đơn thuê dài hạn lập tay', () => {
  maybe('ngày trả do server tính; client gửi ngày trả riêng bị từ chối', async () => {
    const pickupAt = atVn(dayFromToday(600), '07:00');
    const booking = await bookings.create(tenantId, ownerId, {
      vehicleId,
      customerName: 'Khách shop nhập',
      customerPhone: '0902000008',
      serviceType: SERVICE_TYPE.LONG_TERM,
      longTermPackageMonths: 6,
      pickupAt,
      baseAmount: '57600000',
      depositAmount: '5000000',
    });

    expect(booking.longTermPackageMonths).toBe(6);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    const expected = new Date(pickupAt);
    expect(vnDateKey(row.returnAt)).toBe(
      vnDateKey(
        new Date(
          Date.UTC(
            expected.getUTCFullYear(),
            expected.getUTCMonth() + 6,
            expected.getUTCDate(),
            expected.getUTCHours(),
          ),
        ),
      ),
    );

    // Sửa đơn không đụng được lịch (19/10/2026): ngày trả gửi kèm bị bỏ qua, độ dài vẫn theo gói.
    const after = await bookings.update(tenantId, booking.id, {
      returnAt: new Date(Date.now() + 400 * 86_400_000).toISOString(),
    } as never);
    expect(new Date(after.returnAt).getTime()).toBe(new Date(booking.returnAt).getTime());
  });

  maybe('đơn dài hạn thiếu gói bị chặn', async () => {
    await expect(
      bookings.create(tenantId, ownerId, {
        vehicleId,
        customerName: 'Thiếu gói',
        serviceType: SERVICE_TYPE.LONG_TERM,
        pickupAt: atVn(dayFromToday(900), '07:00'),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
