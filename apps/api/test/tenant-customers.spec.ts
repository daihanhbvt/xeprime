import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_STATUS,
  MEMBERSHIP_STATUS,
  PERMISSION,
  SERVICE_TYPE,
  TENANT_CUSTOMER_NOTE_TYPE,
  TENANT_CUSTOMER_RELATIONSHIP,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_CUSTOMER_SORT,
  TENANT_CUSTOMER_SOURCE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { PERMISSIONS_KEY } from '../src/common/decorators';
import { AuditService } from '../src/modules/audit/audit.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { CustomerDocumentsService } from '../src/modules/customers/customer-documents.service';
import { CustomersController } from '../src/modules/customers/customers.controller';
import { CustomerDocumentsController } from '../src/modules/customers/customer-documents.controller';
import { CustomersService } from '../src/modules/customers/customers.service';
import { DriversService } from '../src/modules/drivers/drivers.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import type { R2Service } from '../src/modules/storage/r2.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Sổ khách của GIAN HÀNG (gap S-01), chạy trên PostgreSQL THẬT:
 *
 *   1. Cách ly tenant — shop A không đọc/không sửa được khách của shop B, và cùng một SĐT ở hai
 *      shop là hai hồ sơ độc lập (đúng theo thiết kế, không phải trùng lặp).
 *   2. Định danh theo SĐT ĐÃ CHUẨN HOÁ — `09…`/`84…`/`+84…` hội tụ về một hồ sơ; unique index
 *      của DB là chốt chặn cuối, không phải câu SELECT ở tầng app.
 *   3. Đơn thuê & yêu cầu thuê tự gắn khách; duyệt yêu cầu COPY id sang đơn; sửa hồ sơ KHÔNG
 *      ghi đè snapshot tên/SĐT của đơn cũ.
 *   4. Số liệu tổng hợp tính động, đúng phép Decimal, loại đơn huỷ.
 *   5. Tiền là quyền riêng — thiếu `finance.view` thì trường tiền `null` và bộ lọc/sắp xếp theo
 *      tiền bị TỪ CHỐI (không âm thầm bỏ qua).
 *   6. `blocked` chặn đơn/yêu cầu mới; đường công khai chỉ nhận thông điệp TRUNG TÍNH.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const customers = new CustomersService(asService, audit);
const bookings = new BookingsService(
  asService,
  new OccupancyService(asService),
  audit,
  new NotificationService(asService),
  new DriversService(asService, audit),
  customers,
);

/** R2 giả: spec này kiểm SCOPE + QUYỀN của giấy tờ, không kiểm việc ký URL (r2-private.spec lo). */
const r2Stub = {
  privateEnabled: true,
  presignPrivateUpload: async () => ({ uploadUrl: 'https://r2.test/put', expiresIn: 300 }),
  headPrivateObject: async () => ({ size: 4, contentType: 'application/pdf' }),
  readPrivateObjectPrefix: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  presignPrivateDownload: async () => ({ downloadUrl: 'https://r2.test/get', expiresIn: 120 }),
} as unknown as R2Service;
const documents = new CustomerDocumentsService(asService, customers, r2Stub, audit);

const FULL_SCOPE = { canViewFinance: true, canViewBookings: true };
const NO_FINANCE = { canViewFinance: false, canViewBookings: true };

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let otherTenantId: string;
let vehicleId: string;
let otherVehicleId: string;

const BASE = new Date('2027-10-01T02:00:00.000Z');
const hours = (n: number) => new Date(BASE.getTime() + n * 3_600_000);

let seq = 0;

/** Đơn ghi THẲNG bằng Prisma — dựng tiền đề cho phép tính tổng hợp, không kiểm đường tạo đơn. */
async function seedBooking(opts: {
  tenantCustomerId: string | null;
  status?: string;
  total?: string;
  paid?: string;
  pickupAt?: Date;
  actualReturnAt?: Date | null;
  tenant?: string;
  vehicle?: string;
  customerPhone?: string | null;
}): Promise<string> {
  seq += 1;
  const id = newId();
  const pickupAt = opts.pickupAt ?? hours(seq * 48);
  await prisma.booking.create({
    data: {
      id,
      tenantId: opts.tenant ?? tenantId,
      vehicleId: opts.vehicle ?? vehicleId,
      tenantCustomerId: opts.tenantCustomerId,
      code: `DH-CUS-${seq}`,
      customerName: 'Khách Sổ',
      customerPhone: opts.customerPhone ?? '0901234567',
      status: opts.status ?? BOOKING_STATUS.COMPLETED,
      pickupAt,
      returnAt: new Date(pickupAt.getTime() + 24 * 3_600_000),
      actualReturnAt: opts.actualReturnAt ?? null,
      baseAmount: new Prisma.Decimal(opts.total ?? '1000000'),
      totalAmount: new Prisma.Decimal(opts.total ?? '1000000'),
      paidAmount: new Prisma.Decimal(opts.paid ?? '0'),
    },
  });
  return id;
}

/** Tìm-hoặc-tạo khách qua đúng đường mà đơn/yêu cầu dùng (có transaction như thật). */
function resolve(
  phone: string,
  opts: {
    tenant?: string;
    fullName?: string;
    email?: string | null;
    mode?: 'internal' | 'public';
  } = {},
): Promise<string | null> {
  return prisma.$transaction((tx) =>
    customers.resolveWithinTx(tx, opts.tenant ?? tenantId, {
      fullName: opts.fullName ?? 'Khách Sổ',
      phone,
      email: opts.email ?? null,
      source: TENANT_CUSTOMER_SOURCE.BOOKING,
      actorUserId: ownerId,
      mode: opts.mode ?? 'internal',
    }),
  );
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
  tenantId = newId();
  otherTenantId = newId();
  vehicleId = newId();
  otherVehicleId = newId();

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `cus-${ownerId}@xeprime.test` },
  });
  for (const [tid, name] of [
    [tenantId, 'Shop Sổ Khách'],
    [otherTenantId, 'Shop Khác'],
  ] as const) {
    await prisma.tenant.create({
      data: {
        id: tid,
        code: `T-${tid.slice(-8)}`,
        slug: `t-${tid.toLowerCase().slice(-10)}`,
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
  for (const [vid, tid, code] of [
    [vehicleId, tenantId, 'V-CUS-1'],
    [otherVehicleId, otherTenantId, 'V-CUS-2'],
  ] as const) {
    await prisma.vehicle.create({
      data: {
        id: vid,
        tenantId: tid,
        code,
        name: `Vios ${code}`,
        vehicleType: VEHICLE_TYPE.CAR,
        serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
        weekdayPrice: new Prisma.Decimal('700000'),
      },
    });
  }
});

afterAll(async () => {
  if (dbAvailable) {
    const tenantIds = [tenantId, otherTenantId];
    await prisma.booking.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantCustomerDocument.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantCustomerNote.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

/** Dọn sạch sổ khách + đơn giữa các nhóm test để mỗi nhóm tự dựng tiền đề của nó. */
async function resetBook(): Promise<void> {
  const tenantIds = [tenantId, otherTenantId];
  await prisma.booking.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenantCustomerDocument.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenantCustomerNote.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenantCustomer.deleteMany({ where: { tenantId: { in: tenantIds } } });
}

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Định danh khách theo SĐT đã chuẩn hoá', () => {
  maybe('`09…`, `84…`, `+84…` hội tụ về MỘT hồ sơ trong cùng gian hàng', async () => {
    await resetBook();
    const a = await resolve('0901234567');
    const b = await resolve('84901234567');
    const c = await resolve('+84901234567');

    expect(a).toBeTruthy();
    expect(b).toBe(a);
    expect(c).toBe(a);

    const rows = await prisma.tenantCustomer.findMany({ where: { tenantId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.normalizedPhone).toBe('84901234567');
    // Dạng hiển thị luôn là dạng nội địa, dù người nhập gõ kiểu gì.
    expect(rows[0]!.phone).toBe('0901234567');
  });

  maybe(
    'cùng SĐT ở HAI gian hàng = hai hồ sơ độc lập (đúng thiết kế, không phải trùng)',
    async () => {
      await resetBook();
      const mine = await resolve('0901234567');
      const theirs = await resolve('0901234567', {
        tenant: otherTenantId,
        fullName: 'Tên shop khác',
      });

      expect(mine).toBeTruthy();
      expect(theirs).toBeTruthy();
      expect(theirs).not.toBe(mine);

      // Sửa hồ sơ ở shop A không đụng gì tới hồ sơ cùng số ở shop B.
      await customers.update(tenantId, ownerId, mine!, { fullName: 'Tên shop A' }, FULL_SCOPE);
      const other = await prisma.tenantCustomer.findUniqueOrThrow({ where: { id: theirs! } });
      expect(other.fullName).toBe('Tên shop khác');
    },
  );

  maybe('SĐT không dùng được → KHÔNG đoán, không tạo hồ sơ nào', async () => {
    await resetBook();
    expect(await resolve('')).toBeNull();
    expect(await resolve('khong-phai-so')).toBeNull();
    expect(await prisma.tenantCustomer.count({ where: { tenantId } })).toBe(0);
  });

  maybe('unique index của DB là chốt chặn cuối cho hai lần ghi song song', async () => {
    await resetBook();
    const first = await resolve('0901234567');
    // INSERT thô lách qua service vẫn bị DB từ chối.
    await expect(
      prisma.tenantCustomer.create({
        data: {
          id: newId(),
          tenantId,
          fullName: 'Bản sao',
          phone: '0901234567',
          normalizedPhone: '84901234567',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(first).toBeTruthy();
  });
});

describe('Cách ly tenant', () => {
  maybe('id của gian hàng khác → NOT_FOUND, không lộ sự tồn tại', async () => {
    await resetBook();
    const theirs = await resolve('0912000111', { tenant: otherTenantId });

    await expect(customers.detail(tenantId, theirs!, FULL_SCOPE)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      customers.update(tenantId, ownerId, theirs!, { fullName: 'X' }, FULL_SCOPE),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      customers.updateRisk(
        tenantId,
        ownerId,
        theirs!,
        { riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED, reason: 'thử' },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(customers.bookings(tenantId, theirs!, {}, true)).rejects.toMatchObject({
      status: 404,
    });

    // Hồ sơ của shop kia vẫn nguyên vẹn.
    const row = await prisma.tenantCustomer.findUniqueOrThrow({ where: { id: theirs! } });
    expect(row.riskLevel).toBe(TENANT_CUSTOMER_RISK_LEVEL.NORMAL);
  });

  maybe('danh sách chỉ trả khách của chính gian hàng đang đăng nhập', async () => {
    await resetBook();
    await resolve('0901234567', { fullName: 'Khách của tôi' });
    await resolve('0988888888', { tenant: otherTenantId, fullName: 'Khách shop khác' });

    const page = await customers.list(tenantId, {}, true);
    expect(page.meta.total).toBe(1);
    expect(page.data.map((c) => c.fullName)).toEqual(['Khách của tôi']);
  });

  maybe('ghi chú của gian hàng khác → NOT_FOUND khi gỡ', async () => {
    await resetBook();
    const mine = await resolve('0901234567');
    const theirs = await resolve('0901234567', { tenant: otherTenantId });
    const note = await customers.addNote(otherTenantId, ownerId, theirs!, {
      noteType: TENANT_CUSTOMER_NOTE_TYPE.GENERAL,
      body: 'Ghi chú của shop khác',
    });

    await expect(customers.removeNote(tenantId, ownerId, mine!, note.id)).rejects.toMatchObject({
      status: 404,
    });
    const still = await customers.listNotes(otherTenantId, theirs!, {});
    expect(still.meta.total).toBe(1);
  });

  maybe('composite FK chặn gắn đơn của shop A vào khách của shop B ngay ở tầng DB', async () => {
    await resetBook();
    const theirs = await resolve('0901234567', { tenant: otherTenantId });
    await expect(
      seedBooking({ tenantCustomerId: theirs!, tenant: tenantId }),
    ).rejects.toBeDefined();
  });
});

describe('Nối với đơn thuê và yêu cầu thuê', () => {
  maybe('đơn shop lập tay tự gắn hồ sơ khách trong CÙNG transaction', async () => {
    await resetBook();
    const created = await bookings.create(tenantId, ownerId, {
      vehicleId,
      customerName: 'Nguyễn Văn An',
      customerPhone: '+84901234567',
      pickupAt: hours(200).toISOString(),
      returnAt: hours(224).toISOString(),
      baseAmount: '900000',
    });

    const row = await prisma.booking.findUniqueOrThrow({
      where: { id: created.id },
      select: { tenantCustomerId: true, customerPhone: true },
    });
    expect(row.tenantCustomerId).toBeTruthy();
    // Snapshot trên đơn giữ NGUYÊN dạng người nhập gõ — không bị chuẩn hoá ngược.
    expect(row.customerPhone).toBe('+84901234567');

    const customer = await prisma.tenantCustomer.findUniqueOrThrow({
      where: { id: row.tenantCustomerId! },
    });
    expect(customer.normalizedPhone).toBe('84901234567');
    expect(customer.source).toBe(TENANT_CUSTOMER_SOURCE.BOOKING);
  });

  maybe('đơn KHÔNG có SĐT vẫn tạo được, chỉ là không gắn khách nào', async () => {
    await resetBook();
    const created = await bookings.create(tenantId, ownerId, {
      vehicleId,
      customerName: 'Khách vãng lai',
      pickupAt: hours(400).toISOString(),
      returnAt: hours(424).toISOString(),
      baseAmount: '500000',
    });
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.tenantCustomerId).toBeNull();
    expect(await prisma.tenantCustomer.count({ where: { tenantId } })).toBe(0);
  });

  maybe('id khách đã xác định được COPY thẳng, không tra lại theo SĐT của đơn', async () => {
    await resetBook();
    const customerId = await resolve('0901234567', { fullName: 'Tên gốc' });
    // Đổi SĐT hồ sơ sau khi yêu cầu đã gửi — mô phỏng đúng cái bẫy của "tra lại lúc duyệt".
    await customers.update(tenantId, ownerId, customerId!, { phone: '0909999999' }, FULL_SCOPE);

    const created = await bookings.createWithinTx(
      await Promise.resolve(prisma as unknown as Prisma.TransactionClient),
      tenantId,
      ownerId,
      {
        vehicleId,
        customerName: 'Tên trên yêu cầu',
        customerPhone: '0901234567',
        pickupAt: hours(600).toISOString(),
        returnAt: hours(624).toISOString(),
        baseAmount: '800000',
      },
      'from_request',
      undefined,
      customerId,
    );

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.tenantCustomerId).toBe(customerId);
    // Không có hồ sơ thứ hai nào bị đẻ ra từ SĐT cũ trên snapshot.
    expect(await prisma.tenantCustomer.count({ where: { tenantId } })).toBe(1);
  });

  maybe('sửa hồ sơ KHÔNG ghi đè snapshot tên/SĐT của đơn đã tạo', async () => {
    await resetBook();
    const created = await bookings.create(tenantId, ownerId, {
      vehicleId,
      customerName: 'Nguyen Van An',
      customerPhone: '0901234567',
      pickupAt: hours(800).toISOString(),
      returnAt: hours(824).toISOString(),
      baseAmount: '700000',
    });
    const before = await prisma.booking.findUniqueOrThrow({ where: { id: created.id } });

    await customers.update(
      tenantId,
      ownerId,
      before.tenantCustomerId!,
      { fullName: 'Nguyễn Văn An (đã chuẩn hoá)', phone: '0912345678' },
      FULL_SCOPE,
    );

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.customerName).toBe('Nguyen Van An');
    expect(after.customerPhone).toBe('0901234567');
    // Liên kết vẫn giữ: hồ sơ đổi số nhưng lịch sử không rơi ra khỏi khách.
    expect(after.tenantCustomerId).toBe(before.tenantCustomerId);
  });

  maybe('hồ sơ ĐÃ LƯU TRỮ tự khôi phục khi khách phát sinh giao dịch mới', async () => {
    await resetBook();
    const customerId = await resolve('0901234567');
    await customers.setArchived(tenantId, ownerId, customerId!, true, FULL_SCOPE);
    expect(
      (await prisma.tenantCustomer.findUniqueOrThrow({ where: { id: customerId! } })).archivedAt,
    ).not.toBeNull();

    await resolve('0901234567');
    expect(
      (await prisma.tenantCustomer.findUniqueOrThrow({ where: { id: customerId! } })).archivedAt,
    ).toBeNull();
  });
});

describe('Số liệu tổng hợp (tính động, Decimal)', () => {
  maybe('đếm/cộng đúng và LOẠI đơn huỷ khỏi mọi con số tiền', async () => {
    await resetBook();
    const customerId = (await resolve('0901234567'))!;

    await seedBooking({ tenantCustomerId: customerId, total: '1000000', paid: '400000' });
    await seedBooking({ tenantCustomerId: customerId, total: '2000000.50', paid: '2000000.50' });
    // Đơn huỷ: không vào tổng, không vào công nợ.
    await seedBooking({
      tenantCustomerId: customerId,
      status: BOOKING_STATUS.CANCELLED,
      total: '9999999',
      paid: '0',
    });
    // Trả dư → công nợ của đơn đó là 0, không phải số âm kéo tụt tổng.
    await seedBooking({ tenantCustomerId: customerId, total: '500000', paid: '600000' });
    await seedBooking({ tenantCustomerId: customerId, status: BOOKING_STATUS.NO_SHOW, total: '0' });
    await seedBooking({
      tenantCustomerId: customerId,
      status: BOOKING_STATUS.ACTIVE,
      total: '300000',
      paid: '0',
    });

    const detail = await customers.detail(tenantId, customerId, FULL_SCOPE);
    expect(detail.completedRentalCount).toBe(3);
    expect(detail.activeBookingCount).toBe(1);
    expect(detail.noShowCount).toBe(1);
    expect(detail.totalBookingAmount).toBe('3800000.5');
    expect(detail.paidAmount).toBe('3000000.5');
    // 600000 + 0 + 0 + 300000 — đơn huỷ bị loại, trả dư kẹp sàn 0.
    expect(detail.debtAmount).toBe('900000');
  });

  maybe('trả muộn chỉ đếm khi có mốc trả THẬT, không suy từ đơn quên đóng', async () => {
    await resetBook();
    const customerId = (await resolve('0901234567'))!;
    const pickupAt = hours(0);
    // Quá hạn nhưng CHƯA có actual_return_at → không tính là trả muộn.
    await seedBooking({ tenantCustomerId: customerId, pickupAt, actualReturnAt: null });
    await seedBooking({
      tenantCustomerId: customerId,
      pickupAt: hours(100),
      actualReturnAt: new Date(hours(100).getTime() + 30 * 3_600_000),
    });

    const detail = await customers.detail(tenantId, customerId, FULL_SCOPE);
    expect(detail.lateReturnCount).toBe(1);
  });

  maybe('khách chưa thuê lần nào: mọi số là 0, không phải null/NaN', async () => {
    await resetBook();
    const customerId = (await resolve('0901234567'))!;
    const detail = await customers.detail(tenantId, customerId, FULL_SCOPE);
    expect(detail.completedRentalCount).toBe(0);
    expect(detail.totalBookingAmount).toBe('0');
    expect(detail.debtAmount).toBe('0');
    expect(detail.lastRentalAt).toBeNull();
  });
});

describe('Tiền là quyền riêng', () => {
  maybe('thiếu `finance.view` → trường tiền là `null`, KHÔNG phải "0"', async () => {
    await resetBook();
    const customerId = (await resolve('0901234567'))!;
    await seedBooking({ tenantCustomerId: customerId, total: '1000000', paid: '0' });

    const detail = await customers.detail(tenantId, customerId, NO_FINANCE);
    expect(detail.totalBookingAmount).toBeNull();
    expect(detail.paidAmount).toBeNull();
    expect(detail.debtAmount).toBeNull();
    // Số liệu KHÔNG phải tiền vẫn hiện bình thường.
    expect(detail.completedRentalCount).toBe(1);

    const page = await customers.list(tenantId, {}, false);
    expect(page.data[0]!.debtAmount).toBeNull();

    const history = await customers.bookings(tenantId, customerId, {}, false);
    expect(history.data[0]!.totalAmount).toBeNull();
    expect(history.data[0]!.debtAmount).toBeNull();
  });

  maybe('lọc/sắp xếp theo tiền bị TỪ CHỐI, không âm thầm bỏ qua', async () => {
    await resetBook();
    await expect(
      customers.list(tenantId, { relationship: TENANT_CUSTOMER_RELATIONSHIP.HAS_DEBT }, false),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      customers.list(tenantId, { sort: TENANT_CUSTOMER_SORT.DEBT }, false),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      customers.list(tenantId, { sort: TENANT_CUSTOMER_SORT.TOTAL_VALUE }, false),
    ).rejects.toMatchObject({ status: 403 });

    // Có quyền thì chạy bình thường.
    await expect(
      customers.list(tenantId, { sort: TENANT_CUSTOMER_SORT.DEBT }, true),
    ).resolves.toBeDefined();
  });

  maybe(
    'KPI: thiếu quyền tiền thì cả `totalDebt` lẫn `debtCustomers` là null (FE ẩn hẳn ô)',
    async () => {
      await resetBook();
      const customerId = (await resolve('0901234567'))!;
      await seedBooking({ tenantCustomerId: customerId, total: '1000000', paid: '250000' });

      const allowed = await customers.summary(tenantId, true);
      expect(allowed.totalDebt).toBe('750000');
      expect(allowed.debtCustomers).toBe(1);

      const denied = await customers.summary(tenantId, false);
      expect(denied.totalDebt).toBeNull();
      expect(denied.debtCustomers).toBeNull();
      expect(denied.activeCustomers).toBe(1);
    },
  );
});

describe('Danh sách: tìm kiếm, lọc, sắp xếp, phân trang', () => {
  interface SeededBook {
    an: string;
    binh: string;
    cuong: string;
  }

  async function seedBook(): Promise<SeededBook> {
    await resetBook();
    const an = (await resolve('0901111111', { fullName: 'Nguyễn Văn An', email: 'an@test.vn' }))!;
    const binh = (await resolve('0902222222', { fullName: 'Trần Thị Bình' }))!;
    const cuong = (await resolve('0903333333', { fullName: 'Lê Cường' }))!;

    // An: 2 chuyến xong (khách quen) + còn nợ nhiều nhất.
    await seedBooking({
      tenantCustomerId: an,
      total: '5000000',
      paid: '1000000',
      pickupAt: hours(10),
    });
    await seedBooking({
      tenantCustomerId: an,
      total: '1000000',
      paid: '1000000',
      pickupAt: hours(20),
    });
    // Bình: 1 chuyến, trả đủ, thuê gần đây nhất.
    await seedBooking({
      tenantCustomerId: binh,
      total: '2000000',
      paid: '2000000',
      pickupAt: hours(900),
    });
    // Cường: chưa thuê.
    return { an, binh, cuong };
  }

  maybe('tìm theo TÊN / EMAIL / SĐT ở mọi định dạng người dùng gõ', async () => {
    const { an } = await seedBook();

    // Tên (kể cả khúc giữa), email, và SĐT ở MỌI định dạng người dùng gõ ra — kể cả chỉ đuôi số.
    for (const q of [
      'Nguyễn',
      'Văn An',
      'nguyễn văn an',
      'an@test',
      '0901111111',
      '+84901111111',
      '84901111111',
      '1111111',
    ]) {
      const page = await customers.list(tenantId, { q }, true);
      expect(page.data.map((c) => c.id)).toContain(an);
    }

    /*
     * Giới hạn đã biết, có chủ đích: tìm kiếm PHÂN BIỆT DẤU — gõ "nguyen" không ra "Nguyễn".
     * Đây là hành vi của MỌI ô tìm kiếm trong repo (`users.display_name`, `vehicles.name`,
     * `bookings.customer_name` đều ILIKE thuần trên index trigram). Bỏ dấu bằng `unaccent()` sẽ
     * làm vị từ không dùng được index đó nữa; đổi thì phải đổi đồng loạt và kèm index riêng,
     * không phải một ngoại lệ lẻ ở màn này.
     */
    const withoutDiacritics = await customers.list(tenantId, { q: 'nguyen' }, true);
    expect(withoutDiacritics.meta.total).toBe(0);

    const miss = await customers.list(tenantId, { q: 'khong-ton-tai-xyz' }, true);
    expect(miss.meta.total).toBe(0);
  });

  maybe('nhóm quan hệ lọc đúng tập khách', async () => {
    const { an, binh, cuong } = await seedBook();

    const returning = await customers.list(
      tenantId,
      { relationship: TENANT_CUSTOMER_RELATIONSHIP.RETURNING },
      true,
    );
    expect(returning.data.map((c) => c.id)).toEqual([an]);

    const hasDebt = await customers.list(
      tenantId,
      { relationship: TENANT_CUSTOMER_RELATIONSHIP.HAS_DEBT },
      true,
    );
    expect(hasDebt.data.map((c) => c.id)).toEqual([an]);

    await customers.updateRisk(
      tenantId,
      ownerId,
      binh,
      { riskLevel: TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST, reason: 'trả xe muộn' },
      FULL_SCOPE,
    );
    const watch = await customers.list(
      tenantId,
      { relationship: TENANT_CUSTOMER_RELATIONSHIP.WATCHLIST },
      true,
    );
    expect(watch.data.map((c) => c.id)).toEqual([binh]);

    await customers.setArchived(tenantId, ownerId, cuong, true, FULL_SCOPE);
    const archived = await customers.list(
      tenantId,
      { relationship: TENANT_CUSTOMER_RELATIONSHIP.ARCHIVED },
      true,
    );
    expect(archived.data.map((c) => c.id)).toEqual([cuong]);

    // "Tất cả khách" = đang hoạt động; hồ sơ lưu trữ có nhóm riêng.
    const all = await customers.list(tenantId, {}, true);
    expect(all.data.map((c) => c.id)).not.toContain(cuong);
  });

  maybe('sắp xếp theo từng tiêu chí', async () => {
    const { an, binh, cuong } = await seedBook();

    const byDebt = await customers.list(tenantId, { sort: TENANT_CUSTOMER_SORT.DEBT }, true);
    expect(byDebt.data[0]!.id).toBe(an);

    const byLast = await customers.list(tenantId, { sort: TENANT_CUSTOMER_SORT.LAST_RENTAL }, true);
    expect(byLast.data[0]!.id).toBe(binh);
    // Khách chưa thuê lần nào xuống CUỐI, không lẫn lên đầu vì NULL.
    expect(byLast.data.at(-1)!.id).toBe(cuong);

    const byName = await customers.list(tenantId, { sort: TENANT_CUSTOMER_SORT.NAME }, true);
    expect(byName.data.map((c) => c.fullName)).toEqual([
      'Lê Cường',
      'Nguyễn Văn An',
      'Trần Thị Bình',
    ]);

    const byCount = await customers.list(
      tenantId,
      { sort: TENANT_CUSTOMER_SORT.RENTAL_COUNT },
      true,
    );
    expect(byCount.data[0]!.id).toBe(an);
  });

  maybe('phân trang: total đúng, `hasNext` đúng, không trùng dòng giữa hai trang', async () => {
    const ids = Object.values(await seedBook());

    const first = await customers.list(
      tenantId,
      { limit: 2, sort: TENANT_CUSTOMER_SORT.NAME },
      true,
    );
    expect(first.meta).toMatchObject({ page: 1, limit: 2, total: 3, hasNext: true });

    const second = await customers.list(
      tenantId,
      { page: 2, limit: 2, sort: TENANT_CUSTOMER_SORT.NAME },
      true,
    );
    expect(second.meta.hasNext).toBe(false);
    expect(second.data).toHaveLength(1);

    const seen = [...first.data, ...second.data].map((c) => c.id);
    expect(new Set(seen).size).toBe(3);
    expect(seen.sort()).toEqual(ids.sort());
  });

  maybe('`limit` bị kẹp trần, client không tự nâng để kéo cả bảng', async () => {
    await seedBook();
    const page = await customers.list(tenantId, { limit: 100000 }, true);
    expect(page.meta.limit).toBeLessThanOrEqual(100);
  });
});

describe('Mức rủi ro', () => {
  maybe('`watchlist` KHÔNG chặn gì — chỉ là lời nhắc', async () => {
    await resetBook();
    const customerId = (await resolve('0901234567'))!;
    await customers.updateRisk(
      tenantId,
      ownerId,
      customerId,
      { riskLevel: TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST, reason: 'từng trả xe muộn' },
      FULL_SCOPE,
    );

    await expect(
      bookings.create(tenantId, ownerId, {
        vehicleId,
        customerName: 'Khách Sổ',
        customerPhone: '0901234567',
        pickupAt: hours(1000).toISOString(),
        returnAt: hours(1024).toISOString(),
        baseAmount: '700000',
      }),
    ).resolves.toBeDefined();
    await expect(
      customers.assertNotBlocked(tenantId, '0901234567', 'public'),
    ).resolves.toBeUndefined();
  });

  maybe('`blocked` chặn đơn MỚI của nhân viên, kèm mã riêng và cách xử lý', async () => {
    await resetBook();
    const customerId = (await resolve('0901234567'))!;
    await customers.updateRisk(
      tenantId,
      ownerId,
      customerId,
      { riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED, reason: 'gây hư hỏng xe, không bồi thường' },
      FULL_SCOPE,
    );

    await expect(
      bookings.create(tenantId, ownerId, {
        vehicleId,
        customerName: 'Khách Sổ',
        customerPhone: '+84901234567',
        pickupAt: hours(1100).toISOString(),
        returnAt: hours(1124).toISOString(),
        baseAmount: '700000',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: API_ERROR_CODE.CUSTOMER_BLOCKED },
    });
  });

  maybe('đường CÔNG KHAI chỉ nhận thông điệp trung tính — không lộ danh sách nội bộ', async () => {
    await resetBook();
    const customerId = (await resolve('0901234567'))!;
    await customers.updateRisk(
      tenantId,
      ownerId,
      customerId,
      { riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED, reason: 'lý do nội bộ tuyệt mật' },
      FULL_SCOPE,
    );

    await expect(
      customers.assertNotBlocked(tenantId, '0901234567', 'public'),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: API_ERROR_CODE.CONFLICT },
    });

    const error = await customers
      .assertNotBlocked(tenantId, '0901234567', 'public')
      .catch((err: { response: { code: string; message: string } }) => err);
    const body = (error as { response: { code: string; message: string } }).response;
    // Không mã riêng, không lý do nội bộ, không chữ nào gợi ý có blocklist.
    expect(body.code).not.toBe(API_ERROR_CODE.CUSTOMER_BLOCKED);
    expect(body.message).not.toContain('tuyệt mật');
    expect(body.message.toLowerCase()).not.toContain('chặn');
    expect(body.message.toLowerCase()).not.toContain('từ chối phục vụ');
  });

  maybe('đơn và yêu cầu ĐANG CÓ không bị đụng khi khách bị chặn', async () => {
    await resetBook();
    const created = await bookings.create(tenantId, ownerId, {
      vehicleId,
      customerName: 'Khách Sổ',
      customerPhone: '0901234567',
      pickupAt: hours(1200).toISOString(),
      returnAt: hours(1224).toISOString(),
      baseAmount: '700000',
    });
    const customerId = (await prisma.booking.findUniqueOrThrow({ where: { id: created.id } }))
      .tenantCustomerId!;

    await customers.updateRisk(
      tenantId,
      ownerId,
      customerId,
      { riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED, reason: 'nợ quá hạn' },
      FULL_SCOPE,
    );

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.status).toBe(BOOKING_STATUS.RESERVED);
    expect(after.deletedAt).toBeNull();
  });

  maybe('bỏ chặn thì lập đơn được lại', async () => {
    await resetBook();
    const customerId = (await resolve('0901234567'))!;
    await customers.updateRisk(
      tenantId,
      ownerId,
      customerId,
      { riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED, reason: 'tạm thời' },
      FULL_SCOPE,
    );
    await customers.updateRisk(
      tenantId,
      ownerId,
      customerId,
      { riskLevel: TENANT_CUSTOMER_RISK_LEVEL.NORMAL },
      FULL_SCOPE,
    );

    const row = await prisma.tenantCustomer.findUniqueOrThrow({ where: { id: customerId } });
    expect(row.riskReason).toBeNull();
    await expect(
      bookings.create(tenantId, ownerId, {
        vehicleId,
        customerName: 'Khách Sổ',
        customerPhone: '0901234567',
        pickupAt: hours(1300).toISOString(),
        returnAt: hours(1324).toISOString(),
        baseAmount: '700000',
      }),
    ).resolves.toBeDefined();
  });

  maybe('đánh dấu rủi ro mà KHÔNG nêu lý do → từ chối (service và cả CHECK của DB)', async () => {
    await resetBook();
    const customerId = (await resolve('0901234567'))!;
    await expect(
      customers.updateRisk(
        tenantId,
        ownerId,
        customerId,
        { riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED, reason: '   ' },
        FULL_SCOPE,
      ),
    ).rejects.toMatchObject({ status: 400 });

    // Ghi thô lách qua service vẫn bị DB từ chối.
    await expect(
      prisma.tenantCustomer.update({
        where: { id: customerId },
        data: { riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED, riskReason: null },
      }),
    ).rejects.toBeDefined();
  });

  maybe('mọi lần đổi mức rủi ro đều ghi audit kèm giá trị cũ, mới và lý do', async () => {
    await resetBook();
    const customerId = (await resolve('0901234567'))!;
    await customers.updateRisk(
      tenantId,
      ownerId,
      customerId,
      { riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED, reason: 'không trả xe đúng hẹn 3 lần' },
      FULL_SCOPE,
    );

    const log = await prisma.auditLog.findFirst({
      where: { tenantId, action: 'tenant_customer.risk_change', targetId: customerId },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toBeTruthy();
    expect(log!.actorUserId).toBe(ownerId);
    expect(log!.beforeJson).toMatchObject({ riskLevel: TENANT_CUSTOMER_RISK_LEVEL.NORMAL });
    expect(log!.afterJson).toMatchObject({
      riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED,
      riskReason: 'không trả xe đúng hẹn 3 lần',
    });
  });
});

describe('Trùng SĐT', () => {
  maybe('tạo khách với SĐT đã có → 409 kèm id hồ sơ đang giữ số đó, KHÔNG gộp', async () => {
    await resetBook();
    const existing = await customers.create(
      tenantId,
      ownerId,
      { fullName: 'Nguyễn Văn An', phone: '0901234567' },
      true,
      true,
    );

    // Cùng số, gõ ở định dạng khác — vẫn phải bắt được.
    await expect(
      customers.create(tenantId, ownerId, { fullName: 'An NV', phone: '+84901234567' }, true, true),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: API_ERROR_CODE.CUSTOMER_PHONE_DUPLICATE,
        details: { customerId: existing.id },
      },
    });
    expect(await prisma.tenantCustomer.count({ where: { tenantId } })).toBe(1);
  });

  maybe('SỬA sang SĐT của khách khác → 409, hai hồ sơ giữ nguyên', async () => {
    await resetBook();
    const a = await customers.create(
      tenantId,
      ownerId,
      { fullName: 'Khách A', phone: '0901111111' },
      true,
      true,
    );
    const b = await customers.create(
      tenantId,
      ownerId,
      { fullName: 'Khách B', phone: '0902222222' },
      true,
      true,
    );

    await expect(
      customers.update(tenantId, ownerId, b.id, { phone: '0901111111' }, FULL_SCOPE),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: API_ERROR_CODE.CUSTOMER_PHONE_DUPLICATE, details: { customerId: a.id } },
    });

    const rows = await prisma.tenantCustomer.findMany({ where: { tenantId } });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === b.id)!.normalizedPhone).toBe('84902222222');
  });

  maybe('giữ nguyên SĐT của chính mình khi sửa các trường khác', async () => {
    await resetBook();
    const created = await customers.create(
      tenantId,
      ownerId,
      { fullName: 'Khách A', phone: '0901111111' },
      true,
      true,
    );
    await expect(
      customers.update(
        tenantId,
        ownerId,
        created.id,
        { fullName: 'Khách A đổi tên', phone: '0901111111' },
        FULL_SCOPE,
      ),
    ).resolves.toMatchObject({ fullName: 'Khách A đổi tên' });
  });
});

describe('Lưu trữ / ghi chú / giấy tờ', () => {
  maybe('lưu trữ là SOFT — lịch sử đơn còn nguyên và vẫn mở được hồ sơ', async () => {
    await resetBook();
    const customerId = (await resolve('0901234567'))!;
    await seedBooking({ tenantCustomerId: customerId, total: '1000000', paid: '0' });
    await customers.setArchived(tenantId, ownerId, customerId, true, FULL_SCOPE);

    const detail = await customers.detail(tenantId, customerId, FULL_SCOPE);
    expect(detail.archivedAt).not.toBeNull();
    expect(detail.completedRentalCount).toBe(1);

    const history = await customers.bookings(tenantId, customerId, {}, true);
    expect(history.meta.total).toBe(1);

    // Hồ sơ lưu trữ: đọc được, không ghi thêm được.
    await expect(
      customers.update(tenantId, ownerId, customerId, { fullName: 'X' }, FULL_SCOPE),
    ).rejects.toMatchObject({ status: 409, response: { code: API_ERROR_CODE.CUSTOMER_ARCHIVED } });
    await expect(
      customers.addNote(tenantId, ownerId, customerId, {
        noteType: TENANT_CUSTOMER_NOTE_TYPE.GENERAL,
        body: 'không được ghi',
      }),
    ).rejects.toMatchObject({ status: 409 });

    await customers.setArchived(tenantId, ownerId, customerId, false, FULL_SCOPE);
    await expect(
      customers.update(tenantId, ownerId, customerId, { fullName: 'X' }, FULL_SCOPE),
    ).resolves.toBeDefined();
  });

  maybe('ghi chú là bản ghi bất biến có tác giả; gỡ là soft-delete', async () => {
    await resetBook();
    const customerId = (await resolve('0901234567'))!;
    const note = await customers.addNote(tenantId, ownerId, customerId, {
      noteType: TENANT_CUSTOMER_NOTE_TYPE.RISK,
      body: 'Trả xe muộn 2 lần trong tháng 8',
    });
    expect(note.authorName).toBe('Chủ shop');

    const listed = await customers.listNotes(tenantId, customerId, {});
    expect(listed.meta.total).toBe(1);

    await customers.removeNote(tenantId, ownerId, customerId, note.id);
    const after = await customers.listNotes(tenantId, customerId, {});
    expect(after.meta.total).toBe(0);
    // Bản ghi vẫn nằm trong DB — chỉ đánh dấu đã gỡ.
    const row = await prisma.tenantCustomerNote.findUniqueOrThrow({ where: { id: note.id } });
    expect(row.deletedAt).not.toBeNull();
  });

  maybe('giấy tờ: tenant khác không presign/complete/tải/gỡ được (404, không lộ)', async () => {
    await resetBook();
    const mine = (await resolve('0901234567'))!;
    const ticket = await documents.presign(tenantId, mine, ownerId, {
      documentType: 'citizen_id',
      fileName: 'cccd.pdf',
      contentType: 'application/pdf',
      fileSize: 4,
    });
    await documents.complete(tenantId, mine, ownerId, ticket.documentId);

    const theirs = (await resolve('0901234567', { tenant: otherTenantId }))!;
    await expect(documents.list(otherTenantId, mine)).rejects.toMatchObject({ status: 404 });
    await expect(
      documents.download(otherTenantId, theirs, ownerId, ticket.documentId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      documents.remove(otherTenantId, theirs, ownerId, ticket.documentId),
    ).rejects.toMatchObject({ status: 404 });

    const listed = await documents.list(tenantId, mine);
    expect(listed).toHaveLength(1);
    // DTO thường KHÔNG mang đường dẫn lưu trữ.
    expect(Object.keys(listed[0]!)).not.toContain('objectKey');
  });

  maybe('mở giấy tờ ghi audit từng lần, không chép nội dung/đường dẫn vào log', async () => {
    await resetBook();
    const customerId = (await resolve('0901234567'))!;
    const ticket = await documents.presign(tenantId, customerId, ownerId, {
      documentType: 'driver_licence',
      fileName: 'gplx.pdf',
      contentType: 'application/pdf',
      fileSize: 4,
    });
    await documents.complete(tenantId, customerId, ownerId, ticket.documentId);
    await documents.download(tenantId, customerId, ownerId, ticket.documentId);

    const log = await prisma.auditLog.findFirst({
      where: { tenantId, action: 'tenant_customer.document_download', targetId: customerId },
    });
    expect(log).toBeTruthy();
    expect(JSON.stringify(log!.afterJson)).not.toContain('tenants/');
    expect(JSON.stringify(log!.afterJson)).not.toContain('http');
  });

  maybe(
    'giấy tờ chưa xác minh (`pending`) không tải về được và không nằm trong danh sách',
    async () => {
      await resetBook();
      const customerId = (await resolve('0901234567'))!;
      const ticket = await documents.presign(tenantId, customerId, ownerId, {
        documentType: 'other',
        customTypeName: 'Hộ chiếu',
        fileName: 'passport.pdf',
        contentType: 'application/pdf',
        fileSize: 4,
      });

      expect(await documents.list(tenantId, customerId)).toHaveLength(0);
      await expect(
        documents.download(tenantId, customerId, ownerId, ticket.documentId),
      ).rejects.toMatchObject({ status: 404 });
    },
  );
});

/**
 * Quyền là hợp đồng của ENDPOINT, không phải của service — kiểm ngay trên metadata decorator.
 *
 * Hai điều dễ mất mà không ai nhận ra: (a) lịch sử thuê phải đòi CẢ `customers.view` lẫn
 * `bookings.view` (nếu không, một vai trò chỉ được cấp quyền tra khách sẽ đọc được toàn bộ đơn
 * của gian hàng qua đường vòng); (b) mở FILE giấy tờ là quyền riêng, không đi kèm quyền xem.
 */
describe('Hợp đồng quyền của endpoint', () => {
  const permsOf = (target: object, method: string): string[] =>
    (Reflect.getMetadata(PERMISSIONS_KEY, (target as Record<string, object>)[method] as object) ??
      []) as string[];

  it('lịch sử thuê đòi CẢ quyền khách lẫn quyền đơn thuê', () => {
    expect(permsOf(CustomersController.prototype, 'bookings').sort()).toEqual(
      [PERMISSION.BOOKING_VIEW, PERMISSION.CUSTOMER_VIEW].sort(),
    );
  });

  it('sửa hồ sơ / đổi rủi ro / lưu trữ là ba quyền khác nhau', () => {
    expect(permsOf(CustomersController.prototype, 'update')).toEqual([PERMISSION.CUSTOMER_MANAGE]);
    expect(permsOf(CustomersController.prototype, 'updateRisk')).toEqual([
      PERMISSION.CUSTOMER_MANAGE_RISK,
    ]);
    expect(permsOf(CustomersController.prototype, 'archive')).toEqual([PERMISSION.CUSTOMER_MANAGE]);
  });

  it('mở tệp giấy tờ là quyền RIÊNG, không đi kèm quyền xem hay quyền tải lên', () => {
    expect(permsOf(CustomerDocumentsController.prototype, 'list')).toEqual([
      PERMISSION.CUSTOMER_VIEW,
    ]);
    expect(permsOf(CustomerDocumentsController.prototype, 'presign')).toEqual([
      PERMISSION.CUSTOMER_DOCUMENT_MANAGE,
    ]);
    expect(permsOf(CustomerDocumentsController.prototype, 'download')).toEqual([
      PERMISSION.CUSTOMER_DOCUMENT_FILE_VIEW,
    ]);
  });
});
