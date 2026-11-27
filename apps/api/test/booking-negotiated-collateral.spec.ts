import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BOOKING_COLLATERAL_AUDIT_ACTION,
  BOOKING_COLLATERAL_MAX_ITEMS,
  BOOKING_COLLATERAL_TYPE,
  BOOKING_STATUS,
  MEMBERSHIP_STATUS,
  PRICE_ROW,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { createValidationPipe } from '../src/bootstrap';
import { AuditService } from '../src/modules/audit/audit.service';
import { BankAccountsService } from '../src/modules/bank-accounts/bank-accounts.service';
import { CreateBookingDto } from '../src/modules/bookings/dto/booking.dto';
import { ContractsService } from '../src/modules/contracts/contracts.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { relaxBookingLimits } from './helpers/booking-limits';
import {
  makeBookingCollateralsService,
  makeBookingsService,
  makeCustomersService,
  makeNotificationService,
} from './helpers/service-factory';

/**
 * Đơn gian hàng tự lập: GIÁ THOẢ THUẬN + TÀI SẢN THẾ CHẤP THEO ĐƠN (ADR 0109) — PostgreSQL THẬT.
 *
 *  1. Phụ phí theo dòng: cộng vào tổng, dòng `PRICE_ROW.EXTRAS` trong snapshot, cột phẳng, nhãn
 *     "giá thoả thuận"; giảm giá > tiền thuê ⇒ 422; sửa phí giao xe giữ phụ phí trong tổng.
 *  2. Sổ tài sản: ghi lúc tạo, thêm / gỡ / đã trả / hoàn tác; món đã trả không gỡ; đơn đã khép không
 *     thêm; trần 10 món; CHECK "khác" phải có mô tả.
 *  3. Hợp đồng chụp phụ phí + tài sản đang giữ.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const bookings = makeBookingsService(asService, {
  audit,
  notifications,
  customers: makeCustomersService(asService, audit),
});
const collaterals = makeBookingCollateralsService(asService, audit);
const contracts = new ContractsService(asService, audit, new BankAccountsService(asService));

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;

let day = 0;
function nextWindow(): { pickupAt: string; returnAt: string } {
  day += 3;
  const pickup = new Date(Date.UTC(2029, 8, 1 + day, 2));
  return {
    pickupAt: pickup.toISOString(),
    returnAt: new Date(pickup.getTime() + 2 * 86_400_000).toISOString(),
  };
}

let phone = 0;
function baseDto(extra: Partial<CreateBookingDto> = {}): CreateBookingDto {
  phone += 1;
  return {
    vehicleId,
    customerName: 'Khách thoả thuận',
    customerPhone: `0955${String(200000 + phone).slice(-6)}`,
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    ...nextWindow(),
    baseAmount: '1500000',
    discountAmount: '100000',
    deliveryFee: '50000',
    depositAmount: '3000000',
    ...extra,
  };
}

beforeAll(async () => {
  relaxBookingLimits();
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
  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: ownerId,
      displayName: 'Chủ thoả thuận',
      email: `negotiated-${ownerId}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop giá thoả thuận',
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
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `V-NEG-${vehicleId.slice(-6)}`,
      name: 'Vios thoả thuận',
      vehicleType: VEHICLE_TYPE.CAR,
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
      weekdayPrice: new Prisma.Decimal('700000'),
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.contract.deleteMany({ where: { tenantId } });
    await prisma.bookingCollateral.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
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

const code = (c: string) => ({ response: expect.objectContaining({ code: c }) });

describe('DTO', () => {
  const meta = { type: 'body' as const, metatype: CreateBookingDto };
  const base = {
    vehicleId: newId(),
    customerName: 'A',
    pickupAt: '2029-01-01T00:00:00.000Z',
    returnAt: '2029-01-02T00:00:00.000Z',
  };

  it('nhận phụ phí + tài sản; cắt khoảng trắng; loại "khác" bắt buộc mô tả', async () => {
    const pipe = createValidationPipe();
    const ok = (await pipe.transform(
      {
        ...base,
        extraCharges: [{ label: '  Ghế trẻ em ', amount: '100000' }],
        collaterals: [
          { collateralType: BOOKING_COLLATERAL_TYPE.CITIZEN_ID },
          { collateralType: BOOKING_COLLATERAL_TYPE.MOTORBIKE, description: ' 59A1-12345 ' },
        ],
        negotiatedPrice: true,
      },
      meta,
    )) as CreateBookingDto;
    expect(ok.extraCharges?.[0]?.label).toBe('Ghế trẻ em');
    expect(ok.collaterals?.[1]?.description).toBe('59A1-12345');
    await expect(
      pipe.transform(
        { ...base, collaterals: [{ collateralType: BOOKING_COLLATERAL_TYPE.OTHER }] },
        meta,
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform({ ...base, collaterals: [{ collateralType: 'nha_dat' }] }, meta),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        { ...base, extraCharges: Array.from({ length: 11 }, () => ({ label: 'x', amount: '1' })) },
        meta,
      ),
    ).rejects.toThrow();
  });
});

describe('Giá thoả thuận', () => {
  maybe('tổng = thuê − giảm + giao xe + phụ phí; snapshot có dòng phụ phí + nhãn', async () => {
    const detail = await bookings.create(
      tenantId,
      ownerId,
      baseDto({
        negotiatedPrice: true,
        extraCharges: [
          { label: 'Ghế trẻ em', amount: '100000' },
          { label: 'Bộ sạc', amount: '20000' },
        ],
      }),
    );
    // 1.500.000 − 100.000 + 50.000 + 120.000
    expect(Number(detail.totalAmount)).toBe(1_570_000);
    expect(Number(detail.extraChargesAmount)).toBe(120_000);
    expect(detail.priceSnapshot?.negotiated).toBe(true);
    const extras = detail.priceSnapshot?.rows.filter((r) => r.key === PRICE_ROW.EXTRAS) ?? [];
    expect(extras.map((r) => [r.label, r.amount])).toEqual([
      ['Ghế trẻ em', '100000'],
      ['Bộ sạc', '20000'],
    ]);

    // Sửa phí giao xe: phụ phí KHÔNG rơi khỏi tổng.
    const updated = await bookings.updateDeliveryFee(tenantId, detail.id, ownerId, {
      deliveryFee: '80000',
    });
    expect(Number(updated.totalAmount)).toBe(1_600_000);
  });

  maybe('không bật thì snapshot không mang nhãn; giảm giá > tiền thuê ⇒ 422', async () => {
    const plain = await bookings.create(tenantId, ownerId, baseDto());
    expect(plain.priceSnapshot?.negotiated).toBeUndefined();
    expect(Number(plain.extraChargesAmount)).toBe(0);
    await expect(
      bookings.create(
        tenantId,
        ownerId,
        baseDto({ baseAmount: '100000', discountAmount: '200000' }),
      ),
    ).rejects.toMatchObject(code(API_ERROR_CODE.BOOKING_DISCOUNT_EXCEEDS_BASE));
  });

  maybe('phụ phí 0đ ⇒ 400', async () => {
    await expect(
      bookings.create(
        tenantId,
        ownerId,
        baseDto({ extraCharges: [{ label: 'Không', amount: '0' }] }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('Tài sản thế chấp theo đơn', () => {
  maybe('ghi lúc tạo; thêm / đã trả / hoàn tác / gỡ; audit từng lượt', async () => {
    const detail = await bookings.create(
      tenantId,
      ownerId,
      baseDto({
        collaterals: [
          { collateralType: BOOKING_COLLATERAL_TYPE.CITIZEN_ID },
          { collateralType: BOOKING_COLLATERAL_TYPE.MOTORBIKE, description: '59A1-12345' },
        ],
      }),
    );
    expect(detail.collaterals.map((c) => c.collateralType)).toEqual([
      BOOKING_COLLATERAL_TYPE.CITIZEN_ID,
      BOOKING_COLLATERAL_TYPE.MOTORBIKE,
    ]);
    expect((await bookings.getOne(tenantId, detail.id)).collaterals).toHaveLength(2);

    const added = await collaterals.add(tenantId, detail.id, ownerId, {
      collateralType: BOOKING_COLLATERAL_TYPE.OTHER,
      description: 'Laptop Dell',
    });
    expect(added.data).toHaveLength(3);
    const cccd = added.data[0]!;

    // Sửa linh động một món đang giữ (26/11/2026): đổi loại + mô tả; giữ nguyên thì không audit.
    const bike = added.data[1]!;
    const edited = await collaterals.update(tenantId, detail.id, bike.id, ownerId, {
      collateralType: BOOKING_COLLATERAL_TYPE.OTHER,
      description: 'Xe máy Vision 59A1-99999',
    });
    expect(edited.data[1]).toMatchObject({
      id: bike.id,
      collateralType: BOOKING_COLLATERAL_TYPE.OTHER,
      description: 'Xe máy Vision 59A1-99999',
    });
    await collaterals.update(tenantId, detail.id, bike.id, ownerId, {
      collateralType: BOOKING_COLLATERAL_TYPE.OTHER,
      description: 'Xe máy Vision 59A1-99999',
    });
    expect(
      await prisma.auditLog.count({
        where: { targetId: detail.id, action: BOOKING_COLLATERAL_AUDIT_ACTION.UPDATE },
      }),
    ).toBe(1);

    const returned = await collaterals.setReturned(tenantId, detail.id, cccd.id, ownerId, true);
    expect(returned.data[0]).toMatchObject({ returnedByName: 'Chủ thoả thuận' });
    expect(returned.data[0]?.returnedAt).not.toBeNull();
    // Idempotent.
    await collaterals.setReturned(tenantId, detail.id, cccd.id, ownerId, true);
    // Món đã trả không gỡ, không sửa được.
    await expect(collaterals.remove(tenantId, detail.id, cccd.id, ownerId)).rejects.toMatchObject(
      code(API_ERROR_CODE.BOOKING_COLLATERAL_LOCKED),
    );
    await expect(
      collaterals.update(tenantId, detail.id, cccd.id, ownerId, {
        collateralType: BOOKING_COLLATERAL_TYPE.PASSPORT,
      }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.BOOKING_COLLATERAL_LOCKED));
    const undone = await collaterals.setReturned(tenantId, detail.id, cccd.id, ownerId, false);
    expect(undone.data[0]?.returnedAt).toBeNull();
    const afterRemove = await collaterals.remove(tenantId, detail.id, cccd.id, ownerId);
    expect(afterRemove.data).toHaveLength(2);

    const actions = await prisma.auditLog.findMany({
      where: { targetId: detail.id, action: { startsWith: 'booking.collateral_' } },
      select: { action: true },
    });
    const set = new Set(actions.map((a) => a.action));
    for (const a of Object.values(BOOKING_COLLATERAL_AUDIT_ACTION)) expect(set.has(a)).toBe(true);
    // setReturned lần hai không ghi thêm dòng.
    expect(actions.filter((a) => a.action === BOOKING_COLLATERAL_AUDIT_ACTION.RETURN)).toHaveLength(
      1,
    );
  });

  maybe(
    'đơn đã khép không thêm/gỡ nhưng vẫn đánh dấu đã trả; trần 10 món; id lạ ⇒ 404',
    async () => {
      const detail = await bookings.create(
        tenantId,
        ownerId,
        baseDto({ collaterals: [{ collateralType: BOOKING_COLLATERAL_TYPE.DRIVER_LICENCE }] }),
      );
      for (let i = 1; i < BOOKING_COLLATERAL_MAX_ITEMS; i++) {
        await collaterals.add(tenantId, detail.id, ownerId, {
          collateralType: BOOKING_COLLATERAL_TYPE.PASSPORT,
        });
      }
      await expect(
        collaterals.add(tenantId, detail.id, ownerId, {
          collateralType: BOOKING_COLLATERAL_TYPE.PASSPORT,
        }),
      ).rejects.toMatchObject(code(API_ERROR_CODE.BOOKING_COLLATERAL_LOCKED));

      await prisma.booking.update({
        where: { id: detail.id },
        data: { status: BOOKING_STATUS.COMPLETED },
      });
      const first = detail.collaterals[0]!;
      await expect(
        collaterals.remove(tenantId, detail.id, first.id, ownerId),
      ).rejects.toMatchObject(code(API_ERROR_CODE.BOOKING_COLLATERAL_LOCKED));
      await expect(
        collaterals.update(tenantId, detail.id, first.id, ownerId, {
          collateralType: BOOKING_COLLATERAL_TYPE.PASSPORT,
        }),
      ).rejects.toMatchObject(code(API_ERROR_CODE.BOOKING_COLLATERAL_LOCKED));
      await expect(
        collaterals.setReturned(tenantId, detail.id, first.id, ownerId, true),
      ).resolves.toBeDefined();
      await expect(
        collaterals.setReturned(tenantId, detail.id, newId(), ownerId, true),
      ).rejects.toMatchObject(code(API_ERROR_CODE.BOOKING_COLLATERAL_NOT_FOUND));
    },
  );

  maybe('CHECK DB: loại "khác" không mô tả, loại lạ ⇒ từ chối', async () => {
    const detail = await bookings.create(tenantId, ownerId, baseDto());
    const row = (collateralType: string, description: string | null) =>
      prisma.bookingCollateral.create({
        data: { id: newId(), tenantId, bookingId: detail.id, collateralType, description },
      });
    await expect(row(BOOKING_COLLATERAL_TYPE.OTHER, '   ')).rejects.toThrow(
      /booking_collaterals_other_description_check/,
    );
    await expect(row('nha_dat', null)).rejects.toThrow(/booking_collaterals_type_check/);
  });
});

describe('Hợp đồng', () => {
  maybe('chụp phụ phí theo dòng + tài sản ĐANG giữ', async () => {
    const detail = await bookings.create(
      tenantId,
      ownerId,
      baseDto({
        extraCharges: [{ label: 'Ghế trẻ em', amount: '100000' }],
        collaterals: [
          { collateralType: BOOKING_COLLATERAL_TYPE.CITIZEN_ID },
          { collateralType: BOOKING_COLLATERAL_TYPE.MOTORBIKE, description: '59A1-99999' },
        ],
      }),
    );
    await collaterals.setReturned(tenantId, detail.id, detail.collaterals[0]!.id, ownerId, true);
    const contract = await contracts.createFromBooking(tenantId, ownerId, detail.id);
    expect(contract.snapshot.pricing.extraCharges).toEqual([
      { label: 'Ghế trẻ em', amount: '100000' },
    ]);
    expect(contract.snapshot.collaterals).toEqual([
      { collateralType: BOOKING_COLLATERAL_TYPE.MOTORBIKE, description: '59A1-99999' },
    ]);
    // 1.500.000 − 100.000 + 50.000 + 100.000
    expect(Number(contract.snapshot.pricing.totalAmount)).toBe(1_550_000);
  });
});
