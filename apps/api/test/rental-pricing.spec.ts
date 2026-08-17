import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BOOKING_REQUEST_STATUS,
  MEMBERSHIP_STATUS,
  POLICY_SOURCE,
  PRICE_ROW,
  ROUTE_TYPE,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { BookingRequestsService } from '../src/modules/booking-requests/booking-requests.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { DriversService } from '../src/modules/drivers/drivers.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import type { SaveRentalPolicyDto } from '../src/modules/pricing/dto/pricing.dto';
import type { AuthService } from '../src/modules/auth/auth.service';
import type { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeVehiclesService, vehicleCreator } from './helpers/service-factory';

/**
 * Wave 2 (B2 — Pricing & Rental Policies), chạy trên PostgreSQL THẬT.
 *
 * Kiểm chứng đúng các quy tắc đã chốt: chính sách shop là mặc định — override theo xe thắng —
 * đặt lại là XOÁ override; mốc biên bậc giao nhận (≤ toKm); giảm giá CHỈ áp lên tiền thuê
 * (không đụng cọc/phí giao nhận); đơn đã tạo giữ nguyên tiền + snapshot khi chính sách đổi về
 * sau. **Wave 9**: giao tận nơi duyệt được ngay với phí 0, chủ xe chốt phí sau và server tính
 * lại tổng kèm audit. Không có DB thì tự skip.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const pricing = new PricingService(asService, audit);
const vehicles = makeVehiclesService(asService);
const createVehicle = vehicleCreator(vehicles, asService);
const bookings = new BookingsService(
  asService,
  new OccupancyService(asService),
  audit,
  new NotificationService(asService),
  new DriversService(asService, audit),
);
// Nhánh test chỉ đi qua inbox shop (quote/approve) — không đụng OTP/đăng nhập khách, nên hai
// dependency đó stub rỗng thay vì dựng cả cây AuthService/Firebase.
const requests = new BookingRequestsService(
  asService,
  bookings,
  audit,
  new NotificationService(asService),
  undefined as unknown as PhoneVerificationService,
  undefined as unknown as AuthService,
  new OccupancyService(asService),
  pricing,
);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;

const HOUR = 60 * 60 * 1000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);

/** Chính sách demo đúng thiết kế: cọc 5tr; bậc 0–3 miễn phí, 3–5: 30k, 5–10: 50k; giảm 5% từ 3 ngày. */
function policyDto(over: Partial<SaveRentalPolicyDto> = {}): SaveRentalPolicyDto {
  return {
    depositAmount: '5000000',
    deliveryEnabled: true,
    deliveryMaxRadiusKm: 10,
    deliveryTiers: [
      { toKm: 3, fee: '0' },
      { toKm: 5, fee: '30000' },
      { toKm: 10, fee: '50000' },
    ],
    overtimeFeePerHour: '100000',
    overtimeGraceMinutes: null,
    overtimeRoundingMinutes: null,
    discountEnabled: true,
    discountTiers: [{ minDays: 3, percent: 5, note: 'Ưu đãi 3 ngày' }],
    ...over,
  };
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

  ownerId = newId();
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
  });
  tenantId = newId();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop Pricing',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });

  // weekendPrice bỏ trống CÓ CHỦ ĐÍCH: mọi ngày tính cùng đơn giá → số kỳ vọng xác định,
  // không phụ thuộc hôm chạy test rơi vào thứ mấy.
  const v = await createVehicle(tenantId, ownerId, {
    code: 'PRC-1',
    name: 'Toyota Vios Pricing',
    vehicleType: VEHICLE_TYPE.CAR,
    weekdayPrice: '800000',
  });
  vehicleId = v.id;
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId } });
    await prisma.rentalPolicy.deleteMany({ where: { tenantId } });
    await prisma.publicListing.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('chính sách shop — lưu, đọc, hợp lệ hoá', () => {
  maybe('lưu lần đầu tạo row, lưu lần hai cập nhật (upsert) + audit', async () => {
    await pricing.saveShopPolicy(tenantId, ownerId, policyDto());
    const first = await pricing.getShopPolicy(tenantId);
    expect(first.policy?.depositAmount).toBe('5000000');
    expect(first.policy?.deliveryTiers).toHaveLength(3);
    expect(first.inheritingVehicles).toBe(1);
    expect(first.overriddenVehicles).toBe(0);

    await pricing.saveShopPolicy(tenantId, ownerId, policyDto({ depositAmount: '4000000' }));
    const second = await pricing.getShopPolicy(tenantId);
    expect(second.policy?.depositAmount).toBe('4000000');
    // Vẫn đúng MỘT row mặc định (partial unique) — upsert không nhân bản.
    const rows = await prisma.rentalPolicy.count({ where: { tenantId, vehicleId: null } });
    expect(rows).toBe(1);
    // Đưa lại về giá trị chuẩn cho các test sau.
    await pricing.saveShopPolicy(tenantId, ownerId, policyDto());

    const auditRows = await prisma.auditLog.count({
      where: { tenantId, action: 'rental_policy.update' },
    });
    expect(auditRows).toBeGreaterThanOrEqual(2);
  });

  maybe('bán kính hở khoảng so với mốc cuối → lỗi nêu đích danh khoảng trống', async () => {
    await expect(
      pricing.saveShopPolicy(tenantId, ownerId, policyDto({ deliveryMaxRadiusKm: 12 })),
    ).rejects.toMatchObject({
      response: {
        message: expect.stringContaining('khoảng trống cấu hình giữa mốc 10 km và 12 km'),
      },
    });
  });

  maybe('bậc không tăng dần và mốc ưu đãi trùng đều bị chặn', async () => {
    await expect(
      pricing.saveShopPolicy(
        tenantId,
        ownerId,
        policyDto({
          deliveryTiers: [
            { toKm: 5, fee: '0' },
            { toKm: 3, fee: '30000' },
          ],
          deliveryMaxRadiusKm: 3,
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      pricing.saveShopPolicy(
        tenantId,
        ownerId,
        policyDto({
          discountTiers: [
            { minDays: 7, percent: 5 },
            { minDays: 7, percent: 10 },
          ],
        }),
      ),
    ).rejects.toMatchObject({
      response: { message: expect.stringContaining('Trùng mốc ưu đãi') },
    });
  });
});

describe('kế thừa / ghi đè / đặt lại theo xe', () => {
  maybe('chưa ghi đè → hiệu lực là chính sách shop', async () => {
    const p = await vehicles.getPricing(tenantId, vehicleId);
    expect(p.source).toBe(POLICY_SOURCE.SHOP);
    expect(p.policy?.depositAmount).toBe('5000000');
    expect(p.shopPolicy?.depositAmount).toBe('5000000');
  });

  maybe('ghi đè → hiệu lực là bản của xe; đặt lại → XOÁ override, quay về shop', async () => {
    await vehicles.savePricing(tenantId, vehicleId, ownerId, {
      source: POLICY_SOURCE.VEHICLE,
      weekdayPrice: '900000',
      policy: policyDto({ depositAmount: '3000000', discountEnabled: false, discountTiers: [] }),
    });

    const overridden = await vehicles.getPricing(tenantId, vehicleId);
    expect(overridden.source).toBe(POLICY_SOURCE.VEHICLE);
    expect(overridden.policy?.depositAmount).toBe('3000000');
    expect(overridden.weekdayPrice).toBe('900000');
    expect((await pricing.getShopPolicy(tenantId)).overriddenVehicles).toBe(1);

    await vehicles.savePricing(tenantId, vehicleId, ownerId, { source: POLICY_SOURCE.SHOP });
    const reset = await vehicles.getPricing(tenantId, vehicleId);
    expect(reset.source).toBe(POLICY_SOURCE.SHOP);
    expect(reset.policy?.depositAmount).toBe('5000000');
    expect(await prisma.rentalPolicy.count({ where: { vehicleId } })).toBe(0);
    // Giá của xe không bị "đặt lại" — nó là dữ liệu của xe, không phải của chính sách.
    expect(reset.weekdayPrice).toBe('900000');
  });
});

describe('mốc biên bậc giao nhận', () => {
  maybe('đúng biên ≤ toKm; ngoài bán kính → manual; tắt giao nhận → disabled', async () => {
    const { values } = (await pricing.effectivePolicy(tenantId, vehicleId))!;
    const fee = (km: number) => pricing.deliveryFeeFor(values, km);

    expect(fee(0)).toEqual({ kind: 'auto', fee: '0' });
    expect(fee(3)).toEqual({ kind: 'auto', fee: '0' });
    expect(fee(3.1)).toEqual({ kind: 'auto', fee: '30000' });
    expect(fee(5)).toEqual({ kind: 'auto', fee: '30000' });
    expect(fee(5.1)).toEqual({ kind: 'auto', fee: '50000' });
    expect(fee(10)).toEqual({ kind: 'auto', fee: '50000' });
    expect(fee(10.1)).toEqual({ kind: 'manual_required' });
    expect(pricing.deliveryFeeFor(null, 1)).toEqual({ kind: 'disabled' });
  });
});

describe('buildQuote — giảm giá chỉ áp lên tiền thuê', () => {
  maybe('3 ngày × 900k, giảm 5%, giao nhận 50k: giảm KHÔNG đụng phí giao nhận/cọc', async () => {
    const policy = await pricing.effectivePolicy(tenantId, vehicleId);
    const pickupAt = inHours(24);
    const quote = pricing.buildQuote({
      weekdayPrice: '900000',
      weekendPrice: null,
      pickupAt,
      returnAt: new Date(pickupAt.getTime() + 72 * HOUR),
      policy,
      delivery: { fee: '50000', label: 'Khoảng cách 8 km một chiều' },
    });

    expect(quote.days).toBe(3);
    const row = (key: string) => quote.rows.find((r) => r.key === key)?.amount;
    expect(row(PRICE_ROW.BASE)).toBe('2700000');
    // 5% của 2.700.000 = 135.000 — tính trên TIỀN THUÊ, không phải trên (thuê + giao nhận).
    expect(row(PRICE_ROW.DISCOUNT)).toBe('-135000');
    expect(row(PRICE_ROW.DELIVERY)).toBe('50000');
    expect(quote.totalAmount).toBe('2615000');
    // Cọc đứng ngoài tổng và không chịu giảm giá.
    expect(quote.depositAmount).toBe('5000000');
    expect(quote.policySource).toBe(POLICY_SOURCE.SHOP);
  });

  maybe('xe chưa có giá → từ chối báo giá thay vì ra số 0 giả', async () => {
    expect(() =>
      pricing.buildQuote({
        weekdayPrice: null,
        weekendPrice: null,
        pickupAt: inHours(24),
        returnAt: inHours(48),
        policy: null,
        delivery: null,
      }),
    ).toThrow();
  });
});

/**
 * Wave 9 — giao nhận KHÔNG còn là cửa chặn duyệt.
 *
 * Trước đây yêu cầu có giao tận nơi phải đi qua một vòng báo giá theo khoảng cách
 * (`DELIVERY_QUOTE_REQUIRED`) mới duyệt được. Vòng đó đã bị bỏ: duyệt được ngay, đơn sinh ra
 * với phí giao nhận 0, và chủ xe chốt phí sau bằng `BookingsService.updateDeliveryFee`.
 */
describe('giao nhận miễn phí lúc duyệt + cập nhật phí sau + snapshot bất biến', () => {
  let requestId: string;
  let bookingId: string;

  maybe('giao tận nơi: duyệt được NGAY, không cần báo giá', async () => {
    requestId = newId();
    await prisma.bookingRequest.create({
      data: {
        id: requestId,
        tenantId,
        vehicleId,
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        customerName: 'Khách Wave2',
        customerPhone: '0900000222',
        pickupAt: inHours(200),
        returnAt: inHours(200 + 72),
        deliveryRequested: true,
        deliveryAddress: '123 Nguyễn Huệ, Q.1, HCM',
      },
    });

    const approved = await requests.approve(tenantId, ownerId, requestId);
    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    // Địa chỉ giao và cờ yêu cầu giao vẫn còn — chủ xe cần biết giao ở đâu.
    expect(approved.deliveryRequested).toBe(true);
    expect(approved.deliveryAddress).toBe('123 Nguyễn Huệ, Q.1, HCM');
    bookingId = approved.bookingId!;
  });

  maybe('đơn tạo ra: phí giao nhận 0, tiền thuê từ PricingService + snapshot đầy đủ', async () => {
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: {
        baseAmount: true,
        discountAmount: true,
        deliveryFee: true,
        depositAmount: true,
        totalAmount: true,
        priceSnapshot: true,
      },
    });
    // 3 ngày × 900.000 = 2.700.000; giảm 5% = 135.000; giao nhận MIỄN PHÍ lúc duyệt.
    expect(booking.baseAmount.toFixed(0)).toBe('2700000');
    expect(booking.discountAmount.toFixed(0)).toBe('135000');
    expect(booking.deliveryFee.toFixed(0)).toBe('0');
    expect(booking.depositAmount.toFixed(0)).toBe('5000000');
    expect(booking.totalAmount.toFixed(0)).toBe('2565000');

    const snapshot = booking.priceSnapshot as {
      source: string;
      rows: unknown[];
      policy: { source: string };
    };
    expect(snapshot.source).toBe('quote');
    expect(snapshot.policy.source).toBe(POLICY_SOURCE.SHOP);
    expect(snapshot.rows.length).toBeGreaterThanOrEqual(3);
  });

  maybe('chủ xe cập nhật phí giao nhận: server tính lại tổng + ghi audit', async () => {
    const updated = await bookings.updateDeliveryFee(tenantId, bookingId, ownerId, {
      deliveryFee: '120000',
      note: 'Thoả thuận qua điện thoại',
    });

    // Gọi thẳng service nên tiền còn là Decimal (interceptor mới đổi sang string ở tầng response).
    expect(String(updated.deliveryFee)).toBe('120000');
    // Tổng do SERVER tính lại: 2.700.000 − 135.000 + 120.000.
    expect(String(updated.totalAmount)).toBe('2685000');

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId, targetType: 'booking', targetId: bookingId },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.action).toBe('booking.delivery_fee_update');
    expect(log.actorUserId).toBe(ownerId);
    expect(log.beforeJson).toMatchObject({ deliveryFee: '0.00' });
    expect(log.afterJson).toMatchObject({
      deliveryFee: '120000.00',
      totalAmount: '2685000.00',
      note: 'Thoả thuận qua điện thoại',
    });
  });

  maybe('đặt lại 0 để trả về Miễn phí — không phải trạng thái đặc biệt nào', async () => {
    const back = await bookings.updateDeliveryFee(tenantId, bookingId, ownerId, {
      deliveryFee: '0',
    });
    expect(String(back.deliveryFee)).toBe('0');
    expect(String(back.totalAmount)).toBe('2565000');

    // Trả lại 120k để phần kiểm snapshot bất biến bên dưới đọc một con số ổn định.
    await bookings.updateDeliveryFee(tenantId, bookingId, ownerId, { deliveryFee: '120000' });
  });

  maybe('đổi chính sách SAU khi duyệt: đơn cũ giữ nguyên tiền + snapshot', async () => {
    const before = await prisma.booking.findFirstOrThrow({
      where: { tenantId },
      select: { id: true, totalAmount: true, depositAmount: true, priceSnapshot: true },
    });

    await pricing.saveShopPolicy(
      tenantId,
      ownerId,
      policyDto({ depositAmount: '9000000', discountTiers: [{ minDays: 3, percent: 50 }] }),
    );

    const after = await prisma.booking.findUniqueOrThrow({
      where: { id: before.id },
      select: { totalAmount: true, depositAmount: true, priceSnapshot: true },
    });
    expect(after.totalAmount.toFixed(0)).toBe(before.totalAmount.toFixed(0));
    expect(after.depositAmount.toFixed(0)).toBe(before.depositAmount.toFixed(0));
    expect(after.priceSnapshot).toEqual(before.priceSnapshot);

    // Yêu cầu mới KHÔNG còn sinh báo giá — trường này chỉ còn để đọc dữ liệu cũ.
    const dto = await requests.getOne(tenantId, requestId);
    expect(dto.deliveryQuote).toBeNull();
  });
});

describe('policy mặc định theo LOẠI XE (17/08 — car/motorbike hai bộ riêng)', () => {
  maybe('precedence: override xe → mặc định theo loại → legacy toàn gian hàng', async () => {
    // Hai policy theo loại + một hàng legacy: cọc khác nhau để phân biệt được nguồn.
    await pricing.saveShopPolicy(tenantId, ownerId, policyDto({ depositAmount: '1000000' }));
    await pricing.saveShopPolicy(
      tenantId,
      ownerId,
      policyDto({ depositAmount: '5000000' }),
      VEHICLE_TYPE.CAR,
    );
    await pricing.saveShopPolicy(
      tenantId,
      ownerId,
      policyDto({ depositAmount: '500000' }),
      VEHICLE_TYPE.MOTORBIKE,
    );

    const car = await createVehicle(tenantId, ownerId, {
      code: 'POL-CAR',
      name: 'Xe hơi Policy',
      vehicleType: VEHICLE_TYPE.CAR,
      weekdayPrice: '800000',
    });
    const bike = await createVehicle(tenantId, ownerId, {
      code: 'POL-BIKE',
      name: 'Xe máy Policy',
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      weekdayPrice: '150000',
    });

    // Ô tô và xe máy nhận HAI policy khác nhau — quote đọc đúng cọc theo loại.
    const carPolicy = await pricing.effectivePolicy(tenantId, car.id);
    const bikePolicy = await pricing.effectivePolicy(tenantId, bike.id);
    expect(carPolicy?.values.depositAmount).toBe('5000000');
    expect(bikePolicy?.values.depositAmount).toBe('500000');
    expect(carPolicy?.source).toBe(POLICY_SOURCE.SHOP);

    // Override riêng của xe vẫn thắng mặc định theo loại.
    await vehicles.savePricing(tenantId, car.id, ownerId, {
      source: POLICY_SOURCE.VEHICLE,
      policy: policyDto({ depositAmount: '9000000' }),
    });
    const overridden = await pricing.effectivePolicy(tenantId, car.id);
    expect(overridden?.values.depositAmount).toBe('9000000');
    expect(overridden?.source).toBe(POLICY_SOURCE.VEHICLE);
  });

  maybe('tương thích legacy: chưa có hàng theo loại → rơi về hàng toàn gian hàng', async () => {
    // Tenant riêng chỉ có policy legacy (mô phỏng dữ liệu trước migration).
    const legacyTenantId = newId();
    await prisma.tenant.create({
      data: {
        id: legacyTenantId,
        code: `T-${legacyTenantId.slice(-8)}`,
        slug: `t-${legacyTenantId.toLowerCase().slice(-10)}`,
        name: 'Shop Legacy Policy',
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: ownerId,
      },
    });
    await prisma.rentalPolicy.create({
      data: {
        id: newId(),
        tenantId: legacyTenantId,
        vehicleId: null,
        vehicleType: null,
        depositAmount: '2000000',
        deliveryTiers: [],
        discountTiers: [],
      },
    });
    const v = await createVehicle(legacyTenantId, ownerId, {
      code: 'POL-LEG',
      name: 'Xe legacy',
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      weekdayPrice: '120000',
    });

    const policy = await pricing.effectivePolicy(legacyTenantId, v.id);
    expect(policy?.values.depositAmount).toBe('2000000');
    // getShopPolicy theo loại cũng đọc được hàng legacy làm giá trị đang áp.
    const shown = await pricing.getShopPolicy(legacyTenantId, VEHICLE_TYPE.MOTORBIKE);
    expect(shown.policy?.depositAmount).toBe('2000000');

    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId: legacyTenantId } });
    await prisma.rentalPolicy.deleteMany({ where: { tenantId: legacyTenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId: legacyTenantId } });
    await prisma.publicListing.deleteMany({ where: { tenantId: legacyTenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId: legacyTenantId } });
    await prisma.tenant.deleteMany({ where: { id: legacyTenantId } });
  });
});

describe('giá theo DỊCH VỤ (17/08 — dài hạn giá tháng / có tài xế giá riêng)', () => {
  // buildQuote là hàm thuần — kiểm số học trực tiếp, policy lấy từ DB thật cho đúng đường chạy.
  const PICKUP = new Date('2027-03-01T03:00:00.000Z');
  const day = (n: number) => new Date(PICKUP.getTime() + n * 24 * 60 * 60 * 1000);

  maybe('long_term có giá tháng: đơn giá = tháng ÷ 30, KHÔNG áp bậc giảm (tránh giảm kép)', async () => {
    await pricing.saveShopPolicy(tenantId, ownerId, policyDto());
    const policy = await pricing.effectivePolicy(tenantId, vehicleId);
    const breakdown = pricing.buildQuote({
      weekdayPrice: '800000',
      weekendPrice: null,
      pickupAt: PICKUP,
      returnAt: day(10),
      policy,
      delivery: null,
      serviceType: SERVICE_TYPE.LONG_TERM,
      monthlyPrice: '9000000',
    });
    expect(breakdown.days).toBe(10);
    // 9tr ÷ 30 = 300k/ngày × 10 ngày — policy có bậc 5% từ 3 ngày nhưng nhánh giá tháng bỏ qua.
    expect(breakdown.totalAmount).toBe('3000000');
    expect(breakdown.rows.find((r) => r.key === PRICE_ROW.DISCOUNT)).toBeUndefined();
  });

  maybe('long_term dưới sàn 7 ngày bị máy giá chặn (nguồn chặn thật, FE chỉ preview)', async () => {
    const policy = await pricing.effectivePolicy(tenantId, vehicleId);
    expect(() =>
      pricing.buildQuote({
        weekdayPrice: '800000',
        weekendPrice: null,
        pickupAt: PICKUP,
        returnAt: day(5),
        policy,
        delivery: null,
        serviceType: SERVICE_TYPE.LONG_TERM,
        monthlyPrice: '9000000',
      }),
    ).toThrow(/tối thiểu 7 ngày/);
  });

  maybe('long_term CHƯA khai giá tháng: rơi về máy giá ngày + bậc giảm như cũ', async () => {
    const policy = await pricing.effectivePolicy(tenantId, vehicleId);
    const breakdown = pricing.buildQuote({
      weekdayPrice: '800000',
      weekendPrice: null,
      pickupAt: PICKUP,
      returnAt: day(10),
      policy,
      delivery: null,
      serviceType: SERVICE_TYPE.LONG_TERM,
      monthlyPrice: null,
    });
    // 800k × 10 = 8tr, giảm 5% (mốc 3 ngày) = 7.6tr.
    expect(breakdown.totalAmount).toBe('7600000');
  });

  maybe('with_driver có giá riêng: đơn giá phẳng đã gồm tài xế, GIỮ bậc giảm', async () => {
    const policy = await pricing.effectivePolicy(tenantId, vehicleId);
    const breakdown = pricing.buildQuote({
      weekdayPrice: '800000',
      weekendPrice: null,
      pickupAt: PICKUP,
      returnAt: day(4),
      policy,
      delivery: null,
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      withDriverDailyPrice: '1500000',
    });
    // 1.5tr × 4 = 6tr, giảm 5% (mốc 3 ngày) = 5.7tr.
    expect(breakdown.totalAmount).toBe('5700000');
    expect(breakdown.rows[0]?.sublabel).toContain('đã gồm tài xế');
  });

  maybe('with_driver giá theo LỘ TRÌNH: nội thành/liên tỉnh/1 chiều ăn đúng cột giá', async () => {
    const policy = await pricing.effectivePolicy(tenantId, vehicleId);
    const quoteFor = (routeType: string) =>
      pricing.buildQuote({
        weekdayPrice: '800000',
        weekendPrice: null,
        pickupAt: PICKUP,
        returnAt: day(2),
        policy,
        delivery: null,
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        routeType,
        withDriverDailyPrice: '1300000',
        withDriverInterCityPrice: '1600000',
        withDriverOneWayPrice: '2100000',
      });

    // 2 ngày, không chạm mốc giảm giá nào (mốc từ 3 ngày).
    expect(quoteFor(ROUTE_TYPE.IN_CITY).totalAmount).toBe('2600000');
    expect(quoteFor(ROUTE_TYPE.INTER_CITY).totalAmount).toBe('3200000');
    expect(quoteFor(ROUTE_TYPE.INTER_CITY_ONE_WAY).totalAmount).toBe('4200000');
    // Đủ bảng giá route → KHÔNG có ghi chú tạm tính; sublabel ghi rõ lộ trình.
    expect(quoteFor(ROUTE_TYPE.INTER_CITY).estimateNote).toBeNull();
    expect(quoteFor(ROUTE_TYPE.INTER_CITY).rows[0]?.sublabel).toContain('Liên tỉnh');
  });

  maybe('with_driver THIẾU giá route: rơi về bậc gần nhất + estimateNote (tạm tính)', async () => {
    const policy = await pricing.effectivePolicy(tenantId, vehicleId);
    const breakdown = pricing.buildQuote({
      weekdayPrice: '800000',
      weekendPrice: null,
      pickupAt: PICKUP,
      returnAt: day(2),
      policy,
      delivery: null,
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: ROUTE_TYPE.INTER_CITY,
      withDriverDailyPrice: '1300000',
      withDriverInterCityPrice: null,
      withDriverOneWayPrice: null,
    });
    // Fallback về giá cơ bản 1.3tr × 2 — nhưng tổng bị đánh dấu TẠM TÍNH, không phải giá chốt.
    expect(breakdown.totalAmount).toBe('2600000');
    expect(breakdown.estimateNote).toMatch(/chưa niêm yết/);
  });

  maybe('public quote KHỚP số khi duyệt: yêu cầu with_driver liên tỉnh ra cùng một tổng', async () => {
    // Niêm yết bảng giá route cho xe rồi đi cả hai đường: quote công khai và duyệt yêu cầu.
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER],
        withDriverDailyPrice: new Prisma.Decimal('1300000'),
        withDriverInterCityPrice: new Prisma.Decimal('1600000'),
        withDriverOneWayPrice: new Prisma.Decimal('2100000'),
      },
    });

    const pickupAt = new Date('2027-05-10T02:00:00.000Z');
    const returnAt = new Date('2027-05-12T02:00:00.000Z');
    const publicQuote = await pricing.publicQuote(
      vehicleId,
      pickupAt.toISOString(),
      returnAt.toISOString(),
      SERVICE_TYPE.WITH_DRIVER,
      ROUTE_TYPE.INTER_CITY,
    );

    // Seed thẳng yêu cầu (spec này stub OTP/auth rỗng — không đi qua submitPublic).
    const requestId = newId();
    await prisma.bookingRequest.create({
      data: {
        id: requestId,
        tenantId,
        vehicleId,
        customerName: 'Khách Route',
        customerPhone: '0905556677',
        pickupAt,
        returnAt,
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        routeType: ROUTE_TYPE.INTER_CITY,
        pickupAddress: '1 Lê Duẩn, Đà Nẵng',
        destination: 'Huế',
      },
    });
    const approved = await requests.approve(tenantId, ownerId, requestId);
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: approved.bookingId! },
      select: { totalAmount: true, baseAmount: true },
    });

    // Khách ngoài chợ và shop lúc duyệt nhìn CÙNG một con số — một nguồn tính giá.
    expect(booking.totalAmount.toFixed(0)).toBe(publicQuote.breakdown.totalAmount);
  });
});
