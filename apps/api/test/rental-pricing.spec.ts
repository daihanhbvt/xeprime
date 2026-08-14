import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  BOOKING_REQUEST_STATUS,
  MEMBERSHIP_STATUS,
  POLICY_SOURCE,
  PRICE_ROW,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { BookingRequestsService } from '../src/modules/booking-requests/booking-requests.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
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
