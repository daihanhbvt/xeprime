import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BOOKING_STATUS,
  COLLATERAL_MODE,
  FUEL_TYPE,
  HANDOVER_STATUS,
  HANDOVER_TYPE,
  MEMBERSHIP_STATUS,
  POLICY_SOURCE,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  TRANSMISSION_TYPE,
  VEHICLE_PUBLIC_MIN_IMAGES,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  type BookingPriceSnapshot,
} from '@xeprime/types';
import { SettlementService } from '../src/modules/bookings/settlement/settlement.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makePricingService, makeVehiclesService, seedBranch } from './helpers/service-factory';

/**
 * LUỒNG ĐĂNG XE NHANH — luật ở SERVER, trên PostgreSQL THẬT (09/09/2026).
 *
 * Wizard ba bước ngoài giao diện chỉ là vỏ; những gì spec này giữ là phần backend phải đúng dù
 * client nào gọi (web, app native, hay curl):
 *
 *  1. **Thông số theo nguồn năng lượng**: xe xăng khai lít/100km, xe điện khai km mỗi lần sạc.
 *     Đổi nguồn năng lượng thì thông số cũ bị XOÁ — server không tin việc form đã ẩn ô.
 *  2. **Điều kiện lên chợ**: đủ 4 ảnh KHÁC NHAU, danh tính xe, và thông số đúng loại năng lượng.
 *  3. **Không tự ẩn xe cũ**: luật siết chỉ chạy lúc submit/resubmit, xe đang `approved_public`
 *     vẫn nguyên trạng khi chủ xe sửa thứ khác.
 *  4. **Hạn mức quãng đường**: hai trường đi cặp, công bố ra chợ, và biến thành ĐỀ XUẤT phí vượt
 *     lúc quyết toán dựa trên đồng hồ km — không tự trừ tiền khách.
 *  5. **Phạm vi gian hàng**: xe không gắn được vào chi nhánh của gian hàng khác.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const vehicles = makeVehiclesService(asService);
const pricing = makePricingService(asService);
const audit = new AuditService(asService);
const notifications = new NotificationService(asService);
const settlement = new SettlementService(
  asService,
  audit,
  pricing,
  notifications,
  new ReceiptsService(asService, audit),
);

const RUN = newId().slice(-8).toLowerCase();

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let branchId: string;
/** Gian hàng thứ hai — dùng cho phạm vi chi nhánh và cho ca "gian hàng chưa duyệt". */
let otherOwnerId: string;
let otherTenantId: string;
let otherBranchId: string;
let draftTenantId: string;
let draftBranchId: string;
let seq = 0;

const img = (n: number) => `https://img.example/${RUN}-${n}.jpg`;

async function seedTenant(label: string, status: string) {
  const owner = newId();
  const tenant = newId();
  await prisma.user.create({
    data: { id: owner, displayName: `Chủ ${label}`, email: `flow-${label}-${RUN}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenant,
      code: `T-${tenant.slice(-8)}`,
      slug: `t-${tenant.toLowerCase().slice(-10)}`,
      name: `FlowShop-${label}-${RUN}`,
      status,
      ownerUserId: owner,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId: tenant,
      userId: owner,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
      joinedAt: new Date(),
    },
  });
  const branch = await seedBranch(asService, { tenantId: tenant });
  return { owner, tenant, branch };
}

/** Hồ sơ xe TỐI THIỂU đủ điều kiện lên chợ — từng test chỉ đổi đúng thứ nó kiểm. */
async function createListableVehicle(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return vehicles.create(tenantId, ownerId, {
    name: `Xe flow ${seq}`,
    branchId,
    vehicleType: VEHICLE_TYPE.CAR,
    serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
    plateNumber: `51H-${String(100 + seq)}.45`,
    brand: 'toyota',
    model: 'Vios',
    manufactureYear: 2022,
    seatCount: 5,
    fuelType: FUEL_TYPE.GASOLINE,
    transmission: TRANSMISSION_TYPE.AUTOMATIC,
    fuelConsumptionCombined: 7.5,
    weekdayPrice: '700000',
    mainImageUrl: img(1),
    images: [img(1), img(2), img(3), img(4)],
    ...overrides,
  } as never);
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
  const main = await seedTenant('main', TENANT_STATUS.ACTIVE);
  ownerId = main.owner;
  tenantId = main.tenant;
  branchId = main.branch;

  const other = await seedTenant('other', TENANT_STATUS.ACTIVE);
  otherOwnerId = other.owner;
  otherTenantId = other.tenant;
  otherBranchId = other.branch;

  const draft = await seedTenant('draft', TENANT_STATUS.DRAFT);
  draftTenantId = draft.tenant;
  draftBranchId = draft.branch;
});

afterEach(async () => {
  if (!dbAvailable) return;
  const tenants = { in: [tenantId, otherTenantId, draftTenantId] };
  await prisma.bookingSurcharge.deleteMany({ where: { tenantId: tenants } });
  await prisma.vehicleHandover.deleteMany({ where: { tenantId: tenants } });
  await prisma.vehicleOccupancy.deleteMany({ where: { tenantId: tenants } });
  await prisma.booking.deleteMany({ where: { tenantId: tenants } });
  await prisma.approvalTask.deleteMany({ where: { tenantId: tenants } });
  await prisma.publicListing.deleteMany({ where: { tenantId: tenants } });
  await prisma.rentalPolicy.deleteMany({ where: { tenantId: tenants } });
  await prisma.vehicle.deleteMany({ where: { tenantId: tenants } });
  await prisma.auditLog.deleteMany({ where: { tenantId: tenants } });
  await prisma.notification.deleteMany({ where: { tenantId: tenants } });
});

afterAll(async () => {
  if (dbAvailable) {
    const tenants = { in: [tenantId, otherTenantId, draftTenantId] };
    await prisma.tenantBranch.deleteMany({ where: { tenantId: tenants } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: tenants } });
    await prisma.tenant.deleteMany({ where: { id: tenants } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherOwnerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Thông số theo nguồn năng lượng', () => {
  maybe('xe xăng giữ lít/100km; đổi sang ĐIỆN thì thông số xăng bị xoá', async () => {
    const created = await createListableVehicle();
    expect(Number(created.fuelConsumptionCombined)).toBe(7.5);

    const electric = await vehicles.update(tenantId, created.id, ownerId, {
      fuelType: FUEL_TYPE.ELECTRIC,
      electricRangeKm: 420,
      batteryCapacityKwh: 60,
    });
    expect(electric.electricRangeKm).toBe(420);
    expect(Number(electric.batteryCapacityKwh)).toBe(60);
    // Lít/100km và dung tích động cơ không còn nghĩa với xe điện → server tự dọn.
    expect(electric.fuelConsumptionCombined).toBeNull();
    expect(electric.engineDisplacementCc).toBeNull();
  });

  maybe('đổi từ ĐIỆN về xăng thì thông số điện bị xoá', async () => {
    const created = await createListableVehicle({
      fuelType: FUEL_TYPE.ELECTRIC,
      fuelConsumptionCombined: undefined,
      electricRangeKm: 380,
      batteryCapacityKwh: 55,
      electricConsumptionKwhPer100Km: 15,
    });
    const gasoline = await vehicles.update(tenantId, created.id, ownerId, {
      fuelType: FUEL_TYPE.GASOLINE,
      fuelConsumptionCombined: 8,
    });
    expect(Number(gasoline.fuelConsumptionCombined)).toBe(8);
    expect(gasoline.electricRangeKm).toBeNull();
    expect(gasoline.batteryCapacityKwh).toBeNull();
    expect(gasoline.electricConsumptionKwhPer100Km).toBeNull();
  });

  maybe('client gửi metric SAI LOẠI: server dọn, không lưu số vô nghĩa', async () => {
    // Xe xăng mà gửi kèm quãng đường sạc — một client cũ vẫn làm được điều này.
    const created = await createListableVehicle({ electricRangeKm: 400 });
    const updated = await vehicles.update(tenantId, created.id, ownerId, {
      fuelType: FUEL_TYPE.GASOLINE,
      electricRangeKm: 400,
    });
    expect(updated.electricRangeKm).toBeNull();
  });

  maybe('hybrid giữ được CẢ hai nhóm thông số', async () => {
    const created = await createListableVehicle({
      fuelType: FUEL_TYPE.HYBRID,
      fuelConsumptionCombined: 4.6,
      electricRangeKm: 60,
    });
    expect(Number(created.fuelConsumptionCombined)).toBe(4.6);
    expect(created.electricRangeKm).toBe(60);
  });

  maybe('xe máy không có hộp số/dung tích của ô tô — server dọn khi đổi loại xe', async () => {
    const created = await createListableVehicle({ engineDisplacementCc: 1500 });
    const bike = await vehicles.update(tenantId, created.id, ownerId, {
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      fuelType: FUEL_TYPE.GASOLINE,
    });
    expect(bike.engineDisplacementCc).toBeNull();
  });
});

describe('Điều kiện lên chợ', () => {
  maybe('đủ điều kiện: gửi duyệt được và sinh phiếu duyệt', async () => {
    const created = await createListableVehicle();
    const submitted = await vehicles.submitForPublicReview(tenantId, created.id, ownerId);
    expect(submitted.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);
  });

  maybe('ba ảnh + ảnh đại diện TRÙNG một trong ba: vẫn thiếu ảnh', async () => {
    const created = await createListableVehicle({
      mainImageUrl: img(1),
      images: [img(1), img(2), img(3)],
    });
    await expect(
      vehicles.submitForPublicReview(tenantId, created.id, ownerId),
    ).rejects.toMatchObject({
      response: { details: { missing: expect.arrayContaining([expect.stringContaining('ảnh')]) } },
    });
  });

  maybe(`ảnh đại diện KHÁC ba ảnh thư viện: đủ ${VEHICLE_PUBLIC_MIN_IMAGES} ảnh`, async () => {
    const created = await createListableVehicle({
      mainImageUrl: img(9),
      images: [img(1), img(2), img(3)],
    });
    const submitted = await vehicles.submitForPublicReview(tenantId, created.id, ownerId);
    expect(submitted.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);
  });

  maybe('xe điện thiếu quãng đường mỗi lần sạc: chặn gửi duyệt', async () => {
    const created = await createListableVehicle({
      fuelType: FUEL_TYPE.ELECTRIC,
      fuelConsumptionCombined: undefined,
    });
    await expect(
      vehicles.submitForPublicReview(tenantId, created.id, ownerId),
    ).rejects.toThrow(/sạc/);
  });

  maybe('xe xăng thiếu mức tiêu thụ: chặn gửi duyệt', async () => {
    const created = await createListableVehicle({ fuelConsumptionCombined: undefined });
    await expect(
      vehicles.submitForPublicReview(tenantId, created.id, ownerId),
    ).rejects.toThrow(/tiêu thụ/);
  });

  maybe('hybrid KHÔNG bị đòi quãng đường chạy điện', async () => {
    const created = await createListableVehicle({
      fuelType: FUEL_TYPE.HYBRID,
      fuelConsumptionCombined: 4.6,
    });
    const submitted = await vehicles.submitForPublicReview(tenantId, created.id, ownerId);
    expect(submitted.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);
  });

  maybe('thiếu danh tính xe (hãng/mẫu/năm/số chỗ): chặn và nói rõ thiếu gì', async () => {
    const created = await createListableVehicle({ brand: undefined, seatCount: undefined });
    await expect(
      vehicles.submitForPublicReview(tenantId, created.id, ownerId),
    ).rejects.toMatchObject({
      response: {
        details: {
          missing: expect.arrayContaining(['hãng xe', 'số chỗ ngồi']),
        },
      },
    });
  });

  maybe('KHÔNG có mô tả vẫn gửi duyệt được', async () => {
    const created = await createListableVehicle({ description: undefined });
    const submitted = await vehicles.submitForPublicReview(tenantId, created.id, ownerId);
    expect(submitted.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);
  });

  maybe('gian hàng CHƯA duyệt hoạt động: chặn gửi xe lên chợ', async () => {
    seq += 1;
    const created = await vehicles.create(draftTenantId, ownerId, {
      name: 'Xe của gian hàng nháp',
      branchId: draftBranchId,
      vehicleType: VEHICLE_TYPE.CAR,
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
      plateNumber: `51K-${String(500 + seq)}.11`,
      brand: 'toyota',
      model: 'Vios',
      manufactureYear: 2022,
      seatCount: 5,
      fuelType: FUEL_TYPE.GASOLINE,
      transmission: TRANSMISSION_TYPE.AUTOMATIC,
      fuelConsumptionCombined: 7.5,
      weekdayPrice: '700000',
      mainImageUrl: img(1),
      images: [img(1), img(2), img(3), img(4)],
    } as never);
    await expect(
      vehicles.submitForPublicReview(draftTenantId, created.id, ownerId),
    ).rejects.toThrow(/hoạt động/);
  });

  maybe('xe ĐANG công khai thiếu ảnh theo luật mới KHÔNG bị tự ẩn', async () => {
    // Xe cũ: chỉ có ảnh đại diện, đã được duyệt từ trước khi luật siết.
    const created = await createListableVehicle({ mainImageUrl: img(1), images: [] });
    await prisma.vehicle.update({
      where: { id: created.id },
      data: { publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC },
    });

    const updated = await vehicles.update(tenantId, created.id, ownerId, {
      description: 'Chủ xe sửa mô tả.',
    });
    expect(updated.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);

    // Nhưng nếu chính chủ xe gỡ xuống rồi gửi lại thì luật mới có hiệu lực.
    await prisma.vehicle.update({
      where: { id: created.id },
      data: { publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT },
    });
    await expect(
      vehicles.submitForPublicReview(tenantId, created.id, ownerId),
    ).rejects.toThrow(/ảnh/);
  });
});

describe('Phạm vi gian hàng', () => {
  maybe('không gắn xe vào chi nhánh của gian hàng khác', async () => {
    seq += 1;
    await expect(
      vehicles.create(tenantId, ownerId, {
        name: 'Xe chi nhánh lạ',
        branchId: otherBranchId,
        vehicleType: VEHICLE_TYPE.CAR,
        serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
        plateNumber: `51L-${String(600 + seq)}.22`,
        weekdayPrice: '700000',
      } as never),
    ).rejects.toThrow();
  });

  maybe('gian hàng khác không đọc/sửa được xe của mình', async () => {
    const created = await createListableVehicle();
    await expect(vehicles.getOne(otherTenantId, created.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      vehicles.update(otherTenantId, created.id, otherOwnerId, { name: 'Đổi trộm' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('Hạn mức quãng đường', () => {
  const basePolicy = {
    collateralMode: COLLATERAL_MODE.NONE,
    collateralAssetTypes: [],
    depositAmount: '0',
    deliveryEnabled: false,
    deliveryTiers: [],
    overtimeFeePerHour: null,
    overtimeGraceMinutes: null,
    overtimeRoundingMinutes: null,
    discountEnabled: false,
    discountTiers: [],
  };

  maybe('hai trường đi CẶP — thiếu một nửa bị từ chối', async () => {
    const created = await createListableVehicle();
    await expect(
      vehicles.savePricing(tenantId, created.id, ownerId, {
        source: POLICY_SOURCE.VEHICLE,
        policy: { ...basePolicy, includedDistanceKmPerDay: 300 },
      } as never),
    ).rejects.toThrow(/mỗi km vượt/);

    await expect(
      vehicles.savePricing(tenantId, created.id, ownerId, {
        source: POLICY_SOURCE.VEHICLE,
        policy: { ...basePolicy, excessDistanceFeePerKm: '3000' },
      } as never),
    ).rejects.toThrow(/hạn mức/);
  });

  maybe('lưu đủ cặp: đọc lại đúng số, tiền là CHUỖI', async () => {
    const created = await createListableVehicle();
    await vehicles.savePricing(tenantId, created.id, ownerId, {
      source: POLICY_SOURCE.VEHICLE,
      policy: {
        ...basePolicy,
        includedDistanceKmPerDay: 300,
        excessDistanceFeePerKm: '3000',
      },
    } as never);

    const effective = await pricing.effectivePolicy(tenantId, created.id);
    expect(effective?.values.includedDistanceKmPerDay).toBe(300);
    expect(effective?.values.excessDistanceFeePerKm).toBe('3000');
    expect(typeof effective?.values.excessDistanceFeePerKm).toBe('string');
  });

  maybe('lưu chính sách qua wizard KHÔNG làm mất cọc/phí quá giờ đang có', async () => {
    const created = await createListableVehicle();
    // Gian hàng đã cấu hình cọc tiền + phí quá giờ ở bản ghi đè của xe.
    await vehicles.savePricing(tenantId, created.id, ownerId, {
      source: POLICY_SOURCE.VEHICLE,
      policy: {
        ...basePolicy,
        collateralMode: COLLATERAL_MODE.CASH,
        depositAmount: '5000000',
        overtimeFeePerHour: '100000',
      },
    } as never);

    // Lần lưu sau (wizard) mang theo NGUYÊN các khối nó không hỏi — đây là hợp đồng mà mapper
    // của wizard phải giữ; gửi thiếu là xoá cấu hình chủ xe chưa từng yêu cầu xoá.
    const before = await pricing.effectivePolicy(tenantId, created.id);
    await vehicles.savePricing(tenantId, created.id, ownerId, {
      source: POLICY_SOURCE.VEHICLE,
      policy: {
        ...basePolicy,
        collateralMode: before!.values.collateralMode,
        collateralAssetTypes: before!.values.collateralAssetTypes,
        depositAmount: before!.values.depositAmount,
        overtimeFeePerHour: before!.values.overtimeFeePerHour,
        includedDistanceKmPerDay: 250,
        excessDistanceFeePerKm: '2500',
      },
    } as never);

    const after = await pricing.effectivePolicy(tenantId, created.id);
    expect(after?.values.depositAmount).toBe('5000000');
    expect(after?.values.overtimeFeePerHour).toBe('100000');
    expect(after?.values.includedDistanceKmPerDay).toBe(250);
  });
});

describe('Đề xuất phí vượt km lúc quyết toán', () => {
  /** Đơn đã trả xe + hai lần bàn giao có chỉ số đồng hồ. */
  async function bookingWithOdometer(options: {
    includedKmPerDay: number | null;
    feePerKm: string | null;
    pickupKm: number;
    returnKm: number;
    days: number;
  }) {
    const vehicle = await createListableVehicle();
    const bookingId = newId();
    const pickupAt = new Date(Date.now() - 5 * 24 * 3600_000);
    const returnAt = new Date(pickupAt.getTime() + options.days * 24 * 3600_000);

    const snapshot: BookingPriceSnapshot = {
      calculatedAt: new Date().toISOString(),
      source: 'quote',
      currency: 'VND',
      days: options.days,
      rows: [{ key: 'base', label: 'Tiền thuê', amount: '700000' }],
      totalAmount: '700000',
      depositAmount: '0',
      policy: {
        source: POLICY_SOURCE.VEHICLE,
        updatedAt: new Date().toISOString(),
        depositAmount: '0',
        deliveryEnabled: false,
        deliveryMaxRadiusKm: null,
        deliveryTiers: [],
        overtimeFeePerHour: null,
        overtimeGraceMinutes: null,
        overtimeRoundingMinutes: null,
        discountEnabled: false,
        discountTiers: [],
        includedDistanceKmPerDay: options.includedKmPerDay,
        excessDistanceFeePerKm: options.feePerKm,
      },
    };

    seq += 1;
    await prisma.booking.create({
      data: {
        id: bookingId,
        tenantId,
        vehicleId: vehicle.id,
        code: `BK-KM-${RUN}-${seq}`,
        status: BOOKING_STATUS.COMPLETED,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        customerName: 'Khách km',
        customerPhone: `0955${String(100000 + seq).slice(-6)}`,
        pickupAt,
        returnAt,
        actualReturnAt: returnAt,
        baseAmount: new Prisma.Decimal('700000'),
        totalAmount: new Prisma.Decimal('700000'),
        priceSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    for (const [type, km] of [
      [HANDOVER_TYPE.PICKUP, options.pickupKm],
      [HANDOVER_TYPE.RETURN, options.returnKm],
    ] as const) {
      await prisma.vehicleHandover.create({
        data: {
          id: newId(),
          tenantId,
          bookingId,
          vehicleId: vehicle.id,
          type,
          status: HANDOVER_STATUS.COMPLETED,
          odometerKm: km,
        },
      });
    }
    return bookingId;
  }

  maybe('vượt hạn mức: đề xuất đúng số km và đúng tiền, KHÔNG tự ghi phụ phí', async () => {
    const bookingId = await bookingWithOdometer({
      includedKmPerDay: 300,
      feePerKm: '3000',
      pickupKm: 10_000,
      returnKm: 11_000,
      days: 2,
    });

    const result = await settlement.get(tenantId, bookingId);
    expect(result.excessMileage.available).toBe(true);
    expect(result.excessMileage.actualKm).toBe(1000);
    expect(result.excessMileage.allowedKm).toBe(600);
    expect(result.excessMileage.excessKm).toBe(400);
    expect(result.excessMileage.amount).toBe('1200000.00');
    // Đề xuất KHÔNG phải là khoản đã ghi — sổ phát sinh vẫn trống.
    expect(result.surcharges).toHaveLength(0);
    expect(result.surchargeTotal).toBe('0.00');
  });

  maybe('trong hạn mức: không có km vượt, tiền đề xuất bằng 0', async () => {
    const bookingId = await bookingWithOdometer({
      includedKmPerDay: 300,
      feePerKm: '3000',
      pickupKm: 10_000,
      returnKm: 10_400,
      days: 2,
    });
    const result = await settlement.get(tenantId, bookingId);
    expect(result.excessMileage.excessKm).toBe(0);
    expect(result.excessMileage.amount).toBe('0.00');
  });

  maybe('xe không đặt hạn mức: không đề xuất gì', async () => {
    const bookingId = await bookingWithOdometer({
      includedKmPerDay: null,
      feePerKm: null,
      pickupKm: 10_000,
      returnKm: 12_000,
      days: 2,
    });
    const result = await settlement.get(tenantId, bookingId);
    expect(result.excessMileage.available).toBe(false);
    expect(result.excessMileage.amount).toBeNull();
  });

  maybe('thiếu chỉ số đồng hồ: nói rõ chưa đủ dữ liệu thay vì dựng số 0', async () => {
    const vehicle = await createListableVehicle();
    const bookingId = newId();
    seq += 1;
    await prisma.booking.create({
      data: {
        id: bookingId,
        tenantId,
        vehicleId: vehicle.id,
        code: `BK-NOKM-${RUN}-${seq}`,
        status: BOOKING_STATUS.COMPLETED,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        customerName: 'Khách thiếu km',
        customerPhone: `0944${String(100000 + seq).slice(-6)}`,
        pickupAt: new Date(Date.now() - 3 * 24 * 3600_000),
        returnAt: new Date(),
        baseAmount: new Prisma.Decimal('700000'),
        priceSnapshot: {
          calculatedAt: new Date().toISOString(),
          source: 'quote',
          currency: 'VND',
          days: 2,
          rows: [],
          totalAmount: '700000',
          depositAmount: '0',
          policy: {
            source: POLICY_SOURCE.VEHICLE,
            updatedAt: new Date().toISOString(),
            depositAmount: '0',
            deliveryEnabled: false,
            deliveryMaxRadiusKm: null,
            deliveryTiers: [],
            overtimeFeePerHour: null,
            overtimeGraceMinutes: null,
            overtimeRoundingMinutes: null,
            discountEnabled: false,
            discountTiers: [],
            includedDistanceKmPerDay: 300,
            excessDistanceFeePerKm: '3000',
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });

    const result = await settlement.get(tenantId, bookingId);
    expect(result.excessMileage.available).toBe(false);
    expect(result.excessMileage.includedKmPerDay).toBe(300);
  });

  maybe('chủ xe siết hạn mức SAU chuyến: đề xuất vẫn theo mức đã công bố lúc đặt', async () => {
    const bookingId = await bookingWithOdometer({
      includedKmPerDay: 300,
      feePerKm: '3000',
      pickupKm: 10_000,
      returnKm: 10_800,
      days: 2,
    });
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { vehicleId: true },
    });
    await vehicles.savePricing(tenantId, booking.vehicleId, ownerId, {
      source: POLICY_SOURCE.VEHICLE,
      policy: {
        collateralMode: COLLATERAL_MODE.NONE,
        collateralAssetTypes: [],
        depositAmount: '0',
        deliveryEnabled: false,
        deliveryTiers: [],
        overtimeFeePerHour: null,
        overtimeGraceMinutes: null,
        overtimeRoundingMinutes: null,
        discountEnabled: false,
        discountTiers: [],
        includedDistanceKmPerDay: 100,
        excessDistanceFeePerKm: '9000',
      },
    } as never);

    const result = await settlement.get(tenantId, bookingId);
    // 2 ngày × 300 km theo SNAPSHOT, không phải 100 km của chính sách hiện tại.
    expect(result.excessMileage.allowedKm).toBe(600);
    expect(result.excessMileage.feePerKm).toBe('3000');
  });
});
