import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeVehiclesService, vehicleCreator } from './helpers/service-factory';

/**
 * Giá riêng theo ngày (Wave lịch) trên PostgreSQL THẬT.
 *
 * Điều được khoá: upsert TẤT ĐỊNH theo (xe, ngày) — lưu lần hai thay trọn giá trị; ít nhất một
 * giá; CHECK của DB chặn bản ghi không giá; báo giá công khai áp ĐÚNG giá ghi đè cho đúng ngày
 * local (Asia/Ho_Chi_Minh) và trở về giá thường ngay khi xoá; tenant khác không ghi được.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const pricing = new PricingService(asService, audit);
const vehicles = makeVehiclesService(asService);
const createVehicle = vehicleCreator(vehicles, asService);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let otherTenantId: string;
let vehicleId: string;

/** 01:00 UTC = 08:00 giờ VN — 20/10/2026 là thứ Ba, cả 3 ngày thuê đều là ngày thường. */
const PICKUP = new Date('2026-10-20T01:00:00.000Z');
const RETURN = new Date('2026-10-23T01:00:00.000Z');

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
    data: { id: ownerId, displayName: 'Chủ shop giá', email: `dp-${ownerId}@xeprime.test` },
  });
  tenantId = newId();
  otherTenantId = newId();
  for (const [id, name] of [
    [tenantId, 'Shop Giá Ngày'],
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
  }
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });

  // weekendPrice bỏ trống có chủ đích — mọi ngày một đơn giá, số kỳ vọng xác định.
  const v = await createVehicle(tenantId, ownerId, {
    code: 'DP-1',
    name: 'Xe Giá Ngày',
    vehicleType: VEHICLE_TYPE.CAR,
    weekdayPrice: '800000',
  });
  vehicleId = v.id;
  // Public quote yêu cầu xe đã duyệt công khai — dựng thẳng trạng thái (spec sắp đặt tiền đề,
  // đường duyệt thật đã có vehicle-approval.spec).
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

beforeEach(async () => {
  if (dbAvailable) await prisma.vehicleDailyPrice.deleteMany({ where: { tenantId } });
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Giá riêng theo ngày — PricingService là writer duy nhất', () => {
  maybe('upsert tất định: lưu lần hai THAY trọn giá trị của ngày đó', async () => {
    await pricing.saveDailyPrices(tenantId, vehicleId, ownerId, {
      dates: ['2026-10-21'],
      dailyPrice: '1200000',
      hourlyPrice: '150000',
      note: 'Giá lễ',
    });
    const second = await pricing.saveDailyPrices(tenantId, vehicleId, ownerId, {
      dates: ['2026-10-21'],
      dailyPrice: '1000000',
    });

    // hourlyPrice/ghi chú của lần trước KHÔNG rơi rớt lại — thay trọn, không merge âm thầm.
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      date: '2026-10-21',
      dailyPrice: '1000000',
      hourlyPrice: null,
    });
    expect(await prisma.vehicleDailyPrice.count({ where: { vehicleId } })).toBe(1);
  });

  maybe('không giá nào → 400; CHECK của DB là chốt chặn cuối', async () => {
    await expect(
      pricing.saveDailyPrices(tenantId, vehicleId, ownerId, { dates: ['2026-10-21'] }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });

    // Chọc thẳng DB cũng không tạo nổi bản ghi không giá — vdp_at_least_one_price.
    await expect(
      prisma.vehicleDailyPrice.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId,
          date: new Date('2026-10-25T00:00:00.000Z'),
          dailyPrice: null,
          hourlyPrice: null,
        },
      }),
    ).rejects.toBeDefined();
  });

  maybe(
    'báo giá công khai áp giá riêng cho ĐÚNG ngày local, xoá là trở về giá thường',
    async () => {
      // 3 ngày 20–22/10 giá thường 800k → 2.4tr.
      const before = await pricing.publicQuote(
        vehicleId,
        PICKUP.toISOString(),
        RETURN.toISOString(),
      );
      expect(before.breakdown.totalAmount).toBe('2400000');

      // Ngày giữa (21/10) giá riêng 1.2tr → 800k + 1.2tr + 800k = 2.8tr.
      await pricing.saveDailyPrices(tenantId, vehicleId, ownerId, {
        dates: ['2026-10-21'],
        dailyPrice: '1200000',
      });
      const withOverride = await pricing.publicQuote(
        vehicleId,
        PICKUP.toISOString(),
        RETURN.toISOString(),
      );
      expect(withOverride.breakdown.totalAmount).toBe('2800000');
      expect(withOverride.breakdown.rows[0]!.sublabel).toContain('1 ngày áp giá riêng');

      // Khôi phục giá mặc định = xoá bản ghi đè — giá thường áp lại NGAY.
      const deleted = await pricing.deleteDailyPrices(
        tenantId,
        vehicleId,
        ownerId,
        '2026-10-01',
        '2026-10-31',
      );
      expect(deleted).toBe(1);
      const after = await pricing.publicQuote(
        vehicleId,
        PICKUP.toISOString(),
        RETURN.toISOString(),
      );
      expect(after.breakdown.totalAmount).toBe('2400000');
    },
  );

  maybe('giá riêng ngoài khoảng thuê KHÔNG ảnh hưởng báo giá', async () => {
    await pricing.saveDailyPrices(tenantId, vehicleId, ownerId, {
      dates: ['2026-10-25'],
      dailyPrice: '9900000',
    });
    const quote = await pricing.publicQuote(vehicleId, PICKUP.toISOString(), RETURN.toISOString());
    expect(quote.breakdown.totalAmount).toBe('2400000');
  });

  maybe('tenant khác không ghi/xoá được giá của xe không thuộc mình', async () => {
    await expect(
      pricing.saveDailyPrices(otherTenantId, vehicleId, ownerId, {
        dates: ['2026-10-21'],
        dailyPrice: '1',
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
    await expect(
      pricing.deleteDailyPrices(otherTenantId, vehicleId, ownerId, '2026-10-01', '2026-10-31'),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
  });

  maybe('listDailyPrices trả đúng khoảng [from, to] bao gồm hai đầu', async () => {
    await pricing.saveDailyPrices(tenantId, vehicleId, ownerId, {
      dates: ['2026-10-20', '2026-10-21', '2026-10-22'],
      dailyPrice: '900000',
    });
    const rows = await pricing.listDailyPrices(tenantId, vehicleId, '2026-10-21', '2026-10-22');
    expect(rows.map((r) => r.date)).toEqual(['2026-10-21', '2026-10-22']);
  });
});
