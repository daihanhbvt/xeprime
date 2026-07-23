import { createPrismaClient, newId } from '@xeprime/prisma';
import { OCCUPANCY_SOURCE_TYPE, TENANT_STATUS, VEHICLE_TYPE } from '@xeprime/types';

/**
 * ADR 0006 — test bắt buộc, không phải "nên có".
 *
 * Test này chạy trên PostgreSQL THẬT, không mock Prisma. Mock sẽ luôn pass và chứng minh
 * đúng con số 0 về ràng buộc mà chúng ta phụ thuộc: `EXCLUDE USING gist` là một tính năng
 * của database, mock không có nó.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test
 * Không có DB thì test tự skip kèm thông báo — CI phải bật DB để chúng thật sự chạy.
 */
const prisma = createPrismaClient();

let dbAvailable = false;
let tenantId: string;
let vehicleId: string;
let otherVehicleId: string;
let ownerId: string;

const BASE = new Date('2026-09-10T02:00:00.000Z');
const hours = (n: number) => new Date(BASE.getTime() + n * 3600_000);

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
  otherVehicleId = newId();

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Test owner', email: `test-${ownerId}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEST-${tenantId.slice(-8)}`,
      slug: `test-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Tenant test',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  for (const [id, code] of [
    [vehicleId, 'V1'],
    [otherVehicleId, 'V2'],
  ] as const) {
    await prisma.vehicle.create({
      data: { id, tenantId, code, name: `Xe ${code}`, vehicleType: VEHICLE_TYPE.CAR },
    });
  }
});

afterAll(async () => {
  if (dbAvailable) {
    // Cascade từ tenant xoá luôn vehicles + occupancies.
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

beforeEach(async () => {
  if (dbAvailable) await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
});

function occupancy(start: Date, end: Date, overrides: Partial<{ vehicleId: string; sourceType: string; bufferMinutes: number }> = {}) {
  return {
    id: newId(),
    tenantId,
    vehicleId: overrides.vehicleId ?? vehicleId,
    sourceType: overrides.sourceType ?? OCCUPANCY_SOURCE_TYPE.BOOKING,
    sourceId: newId(),
    startAt: start,
    endAt: end,
    bufferMinutes: overrides.bufferMinutes ?? 0,
  };
}

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('ADR 0006 — exclusion constraint chống trùng lịch', () => {
  maybe('hai khoảng chồng nhau trên cùng xe bị DB từ chối', async () => {
    await prisma.vehicleOccupancy.create({ data: occupancy(hours(0), hours(48)) });

    await expect(
      prisma.vehicleOccupancy.create({ data: occupancy(hours(24), hours(72)) }),
    ).rejects.toMatchObject({ message: expect.stringContaining('vehicle_occupancies_no_overlap') });
  });

  maybe('nửa mở: trả 10:00 và nhận 10:00 KHÔNG tính là đụng', async () => {
    await prisma.vehicleOccupancy.create({ data: occupancy(hours(0), hours(24)) });
    await expect(
      prisma.vehicleOccupancy.create({ data: occupancy(hours(24), hours(48)) }),
    ).resolves.toBeDefined();
  });

  maybe('lệch 1 phút vẫn bị chặn', async () => {
    await prisma.vehicleOccupancy.create({ data: occupancy(hours(0), hours(24)) });
    const oneMinuteEarlier = new Date(hours(24).getTime() - 60_000);
    await expect(
      prisma.vehicleOccupancy.create({ data: occupancy(oneMinuteEarlier, hours(48)) }),
    ).rejects.toBeDefined();
  });

  maybe('buffer time được constraint enforce, không chỉ là số hiển thị', async () => {
    // Đơn 1 trả lúc +24h, buffer 60 phút → thực tế chiếm tới +25h.
    await prisma.vehicleOccupancy.create({
      data: occupancy(hours(0), hours(24), { bufferMinutes: 60 }),
    });

    // Nhận sau 30 phút → vẫn nằm trong buffer → phải bị chặn.
    const within = new Date(hours(24).getTime() + 30 * 60_000);
    await expect(
      prisma.vehicleOccupancy.create({ data: occupancy(within, hours(48)) }),
    ).rejects.toBeDefined();

    // Nhận sau 90 phút → ngoài buffer → hợp lệ.
    const after = new Date(hours(24).getTime() + 90 * 60_000);
    await expect(
      prisma.vehicleOccupancy.create({ data: occupancy(after, hours(48)) }),
    ).resolves.toBeDefined();
  });

  maybe('xe khác nhau thì không ảnh hưởng nhau', async () => {
    await prisma.vehicleOccupancy.create({ data: occupancy(hours(0), hours(48)) });
    await expect(
      prisma.vehicleOccupancy.create({
        data: occupancy(hours(0), hours(48), { vehicleId: otherVehicleId }),
      }),
    ).resolves.toBeDefined();
  });

  maybe('xung đột GIỮA các nguồn khác nhau cũng bị chặn — đơn thuê vs bảo dưỡng', async () => {
    // Đây là lý do gộp mọi nguồn vào một bảng. Nếu bookings và blocked_ranges là hai bảng
    // riêng, constraint của từng bảng sẽ không thấy nhau và cặp này lọt.
    await prisma.vehicleOccupancy.create({
      data: occupancy(hours(0), hours(48), { sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING }),
    });
    await expect(
      prisma.vehicleOccupancy.create({
        data: occupancy(hours(24), hours(72), { sourceType: OCCUPANCY_SOURCE_TYPE.MAINTENANCE }),
      }),
    ).rejects.toBeDefined();
  });

  maybe('giải phóng lịch thì đặt lại được ngay', async () => {
    const first = occupancy(hours(0), hours(48));
    await prisma.vehicleOccupancy.create({ data: first });
    await prisma.vehicleOccupancy.delete({ where: { id: first.id } });

    await expect(
      prisma.vehicleOccupancy.create({ data: occupancy(hours(0), hours(48)) }),
    ).resolves.toBeDefined();
  });

  /**
   * Test then chốt: đây là kịch bản mà kiểm tra bằng SELECT-rồi-INSERT ở tầng app sẽ
   * thất bại. Cả 8 request cùng thấy lịch trống, cả 8 cùng ghi.
   */
  maybe('8 request đồng thời cho cùng xe/khung giờ: đúng 1 thành công', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        prisma.vehicleOccupancy.create({ data: occupancy(hours(0), hours(48)) }),
      ),
    );

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(7);

    const rows = await prisma.vehicleOccupancy.count({ where: { vehicleId } });
    expect(rows).toBe(1);
  });

  maybe('CHECK constraint chặn khoảng thời gian âm', async () => {
    await expect(
      prisma.vehicleOccupancy.create({ data: occupancy(hours(48), hours(24)) }),
    ).rejects.toBeDefined();
  });
});
