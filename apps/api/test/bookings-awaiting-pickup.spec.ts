import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  BILLING_MODE,
  BOOKING_HANDOVER_PLACE,
  BOOKING_LIST_PRESET,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  CUSTOMER_DOCUMENT_STATUS,
  CUSTOMER_DOCUMENT_TYPE,
  HANDOVER_PREP_ITEM,
  HANDOVER_STATUS,
  HANDOVER_TYPE,
  IDENTITY_VERIFY_METHOD,
  MEMBERSHIP_STATUS,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { VehicleSettingsService } from '../src/modules/vehicle-settings/vehicle-settings.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { giveTenantPlan } from './helpers/billing-fixture';
import { customerAccountFor } from './helpers/customer-account';
import { payHoldForRequest } from './helpers/hold-payment';
import { releaseWalletObligations } from './helpers/wallet-cleanup';
import {
  makeBookingHoldsService,
  makeBookingRequestsService,
  makeBookingsService,
  makeNotificationService,
  makeDriversService,
} from './helpers/service-factory';

/**
 * Nhóm việc **"Chờ giao xe"** (`preset=awaiting_pickup`) — trên PostgreSQL THẬT.
 *
 * Nó là một LỐI TẮT tới danh sách đơn, không phải một trạng thái mới và không phải một nguồn dữ
 * liệu thứ hai. Cái đáng khoá vì vậy là ĐIỀU KIỆN của nó, và điều kiện đó phải đúng với cả ba
 * cách một đơn ra đời (đối soát đủ tiền giữ chỗ · gian hàng lập thẳng · nhân viên lập hộ), chứ
 * không chỉ với đường mà người viết nhớ tới lúc viết.
 *
 * Sáu điều được khoá:
 *
 *  1. Đơn có mặt bất kể nó ra đời bằng đường nào — webhook đối soát hay lập tay.
 *  2. YÊU CẦU chưa thành đơn (`pending_host_approval`, `awaiting_hold`) không lọt vào: chúng
 *     không phải đơn thuê, và trộn chúng vào đây là mời người trực đi giao một chiếc xe khách
 *     còn chưa trả tiền.
 *  3. Đơn đã bàn giao rời khỏi danh sách — theo CẢ HAI nguồn sự thật (`actual_pickup_at` và
 *     biên bản giao xe đã xác nhận), vì hai nguồn đó có thể lệch nhau ở dữ liệu nhập tay.
 *  4. Đơn QUÁ GIỜ hẹn vẫn ở lại. Quá giờ là lý do để nổi bật lên, không phải lý do để biến mất.
 *  5. Lọc/tìm/phân trang/tổng số vẫn là của server và vẫn áp cùng lúc với nhóm việc.
 *  6. `handoverPlaceKind` phân biệt được ba việc khác nhau: mang xe đi giao, đi đón khách, hay
 *     khách tự tới lấy.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test -- test/bookings-awaiting-pickup.spec.ts
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const occupancy = new OccupancyService(asService);
const settings = new VehicleSettingsService(asService, audit, occupancy, new ListingsService(asService), makeDriversService(asService));

const bookings = makeBookingsService(asService, { audit, notifications, occupancy, settings });
const holds = makeBookingHoldsService(asService);
const requests = makeBookingRequestsService(asService, {
  audit,
  notifications,
  occupancy,
  settings,
});

const RUN = newId().slice(-8).toLowerCase();
const AWAITING = { preset: BOOKING_LIST_PRESET.AWAITING_PICKUP } as const;

let dbAvailable = false;
let ownerId: string;
/**
 * Người gửi MỌI yêu cầu của spec — tài khoản KHÁCH đã xác minh SĐT (ADR 0060). Một người là đủ:
 * mỗi yêu cầu nhắm một chiếc xe riêng, nên chặn trùng (xe + SĐT + khung giờ) không đụng nhau.
 */
let customerUserId: string;
let tenantId: string;
let branchAId: string;
let branchBId: string;
/** Mỗi đơn một chiếc xe riêng: `vehicle_occupancies` không cho hai chuyến chồng giờ (ADR 0006). */
let vehicleIds: string[] = [];
let phoneCounter = 0;
const nextPhone = () => `0933${String(100000 + ++phoneCounter).slice(-6)}`;

/** Mốc giờ Việt Nam, lệch `offsetDays` so với hôm nay. Âm = đã qua. */
function vnAt(offsetDays: number, hourVn: number): Date {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(hourVn - 7, 0, 0, 0);
  return base;
}

/** Đơn do GIAN HÀNG lập thẳng — không đi qua yêu cầu, không đi qua khoản giữ chỗ. */
async function createDirect(
  vehicleIndex: number,
  opts: { dayOffset?: number; customerName?: string } = {},
) {
  return bookings.create(tenantId, ownerId, {
    vehicleId: vehicleIds[vehicleIndex]!,
    customerName: opts.customerName ?? 'Nguyễn Văn A',
    customerPhone: nextPhone(),
    pickupAt: vnAt(opts.dayOffset ?? 3, 9).toISOString(),
    returnAt: vnAt((opts.dayOffset ?? 3) + 2, 9).toISOString(),
    baseAmount: '1500000',
  });
}

/** Gửi yêu cầu → gian hàng duyệt → khách trả đủ → ĐƠN ra đời trong lượt đối soát (ADR 0044). */
async function createViaHoldPayment(vehicleIndex: number, dayOffset = 5): Promise<string> {
  const submitted = await requests.submitPublic(
    {
      vehicleId: vehicleIds[vehicleIndex]!,
      pickupAt: vnAt(dayOffset, 9).toISOString(),
      returnAt: vnAt(dayOffset + 2, 9).toISOString(),
    },
    customerUserId,
  );
  const requestId = submitted.id;
  await requests.approve(tenantId, ownerId, requestId, {});
  await payHoldForRequest(asService, holds, requestId);

  const row = await prisma.bookingRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: { status: true, bookingId: true },
  });
  expect(row.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
  return row.bookingId!;
}

const idsOf = async (query: Parameters<typeof bookings.list>[1]) =>
  (await bookings.list(tenantId, query, null)).data.map((b) => b.id);

/**
 * Đưa thẳng một đơn sang `active` — dựng bằng Prisma, KHÔNG qua luồng bàn giao thật.
 *
 * Các test ở đây quan tâm tới ĐIỀU KIỆN của nhóm việc (còn `reserved` hay không), không phải
 * bản thân luồng bàn giao — luồng đó đã có bộ test riêng, đầy đủ hơn nhiều, ở
 * `booking-handovers.spec.ts`. ADR 0047 xoá cạnh `reserved → confirmed` khỏi máy trạng thái,
 * nên gọi `bookings.transition()` để "đệm" qua `active` không còn hợp lệ nữa.
 */
async function markActive(bookingId: string) {
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: BOOKING_STATUS.ACTIVE, actualPickupAt: new Date() },
  });
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
  branchAId = newId();
  branchBId = newId();

  await prisma.user.createMany({
    data: [
      {
        realm: ACCOUNT_REALM.PARTNER,
        id: ownerId,
        displayName: 'Chủ xe',
        email: `ap-own-${RUN}@xeprime.test`,
      },
    ],
  });
  // Ngoài dải `nextPhone()` (0933100001…) mà đơn lập tay dùng — khách đặt online là người khác.
  customerUserId = await customerAccountFor(asService, '0933000001', 'Khách Đối Soát');
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `PickupShop-${RUN}`,
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
      joinedAt: new Date(),
    },
  });
  await prisma.tenantBranch.createMany({
    data: [
      { id: branchAId, tenantId, code: `CN1-${RUN}`, name: 'Chi nhánh Quận 1', isDefault: true },
      { id: branchBId, tenantId, code: `CN2-${RUN}`, name: 'Chi nhánh Thủ Đức' },
    ],
  });

  // Chín xe: đủ cho mọi kịch bản mà không có hai đơn nào phải chia nhau một chiếc.
  vehicleIds = Array.from({ length: 9 }, () => newId());
  await prisma.vehicle.createMany({
    data: vehicleIds.map((id, i) => ({
      id,
      tenantId,
      // Xe cuối cùng đứng ở chi nhánh B — bộ lọc chi nhánh cần hai phía để chứng minh nó lọc thật.
      branchId: i === vehicleIds.length - 1 ? branchBId : branchAId,
      code: `XE${id.slice(-5)}`,
      name: `Xe ${i + 1}`,
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
      weekdayPrice: new Prisma.Decimal('700000'),
      weekendPrice: new Prisma.Decimal('700000'),
      createdBy: ownerId,
    })),
  });
  await giveTenantPlan(prisma, tenantId, { billingMode: BILLING_MODE.COMMISSION });
});

afterEach(async () => {
  if (!dbAvailable) return;
  await prisma.tenantCustomerDocument.deleteMany({ where: { tenantId } });
  await prisma.bookingHandoverCheck.deleteMany({ where: { tenantId } });
  await prisma.vehicleHandover.deleteMany({ where: { tenantId } });
  await prisma.holdRefund.deleteMany({ where: { tenantId } });
  await prisma.bookingCancellation.deleteMany({ where: { tenantId } });
  await prisma.bookingHold.deleteMany({ where: { tenantId } });
  await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
  await prisma.bookingRequest.deleteMany({ where: { tenantId } });
  await prisma.booking.deleteMany({ where: { tenantId } });
  await prisma.notification.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  if (dbAvailable) {
    await releaseWalletObligations(prisma, {
      tenantIds: [tenantId],
      userIds: [customerUserId, ownerId],
    });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
    await prisma.vehicleServiceSetting.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, customerUserId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Chờ giao xe — đơn nào có mặt', () => {
  maybe('đơn sinh ra từ lượt đối soát ĐỦ TIỀN giữ chỗ có mặt', async () => {
    const bookingId = await createViaHoldPayment(0);

    const list = await bookings.list(tenantId, AWAITING, null);
    expect(list.data.map((b) => b.id)).toEqual([bookingId]);
    expect(list.meta.total).toBe(1);
    expect(list.data[0]!.status).toBe(BOOKING_STATUS.RESERVED);
    expect(list.data[0]!.pickupHandoverStatus).toBeNull();
  });

  maybe('đơn gian hàng lập thẳng (không thu giữ chỗ) có mặt', async () => {
    const direct = await createDirect(1);
    expect(await idsOf(AWAITING)).toEqual([direct.id]);
    // Không đi qua hold nào — đây chính là đường mà một bộ lọc dựng quanh `booking_holds` sẽ bỏ sót.
    expect(await prisma.bookingHold.count({ where: { bookingId: direct.id } })).toBe(0);
  });

  maybe('YÊU CẦU chưa thành đơn không lọt vào — chờ duyệt lẫn chờ thanh toán', async () => {
    const pending = await requests.submitPublic(
      {
        vehicleId: vehicleIds[4]!,
        pickupAt: vnAt(6, 9).toISOString(),
        returnAt: vnAt(8, 9).toISOString(),
      },
      customerUserId,
    );
    const awaitingHold = await requests.submitPublic(
      {
        vehicleId: vehicleIds[5]!,
        pickupAt: vnAt(6, 9).toISOString(),
        returnAt: vnAt(8, 9).toISOString(),
      },
      customerUserId,
    );
    // Duyệt xong nhưng KHÔNG trả tiền: yêu cầu đứng ở `awaiting_hold`, chưa có đơn nào.
    await requests.approve(tenantId, ownerId, awaitingHold.id, {});

    const statuses = await prisma.bookingRequest.findMany({
      where: { id: { in: [pending.id, awaitingHold.id] } },
      select: { status: true, bookingId: true },
    });
    expect(statuses.map((r) => r.status).sort()).toEqual(
      [BOOKING_REQUEST_STATUS.AWAITING_HOLD, BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL].sort(),
    );
    expect(statuses.every((r) => r.bookingId === null)).toBe(true);

    const list = await bookings.list(tenantId, AWAITING, null);
    expect(list.data).toEqual([]);
    expect(list.meta.total).toBe(0);
  });
});

describe('Chờ giao xe — đơn nào biến mất', () => {
  maybe('đã bàn giao (`active`) rời khỏi danh sách', async () => {
    const stays = await createDirect(0, { dayOffset: 2 });
    const handed = await createDirect(1, { dayOffset: 3 });
    await markActive(handed.id);

    expect(await idsOf(AWAITING)).toEqual([stays.id]);
  });

  maybe('huỷ và khách-không-đến rời khỏi danh sách', async () => {
    const stays = await createDirect(0, { dayOffset: 2 });
    const cancelled = await createDirect(1, { dayOffset: 3 });
    const noShow = await createDirect(2, { dayOffset: -1 });

    await bookings.transition(tenantId, cancelled.id, ownerId, {
      status: BOOKING_STATUS.CANCELLED,
      reason: 'Khách đổi kế hoạch',
      reasonCategory: 'customer_changed_plan',
    });
    // `no_show` chỉ được ghi sau ÂN HẠN kể từ giờ hẹn — nên đơn này hẹn từ hôm qua.
    await bookings.transition(tenantId, noShow.id, ownerId, {
      status: BOOKING_STATUS.NO_SHOW,
      reason: 'Khách không tới, không liên lạc được',
    });

    expect(await idsOf(AWAITING)).toEqual([stays.id]);
  });

  maybe(
    'biên bản GIAO XE đã xác nhận loại đơn ra, kể cả khi cột trạng thái còn sót lại',
    async () => {
      /*
       * Vế phòng thủ của `presetWhere`. Luồng thật luôn lật đơn sang `active` trong cùng transaction
       * với lượt xác nhận biên bản, nên trạng thái này KHÔNG sinh ra được qua service — dựng thẳng
       * bằng Prisma là cách duy nhất hỏi được câu "nếu hai nguồn sự thật lệch nhau thì ai thắng".
       * Câu trả lời phải là: bằng chứng bàn giao thắng một cột trạng thái.
       */
      const stays = await createDirect(0, { dayOffset: 2 });
      const handedOnPaper = await createDirect(1, { dayOffset: 3 });
      await prisma.vehicleHandover.create({
        data: {
          id: newId(),
          tenantId,
          bookingId: handedOnPaper.id,
          vehicleId: vehicleIds[1]!,
          type: HANDOVER_TYPE.PICKUP,
          status: HANDOVER_STATUS.CONFIRMED,
          // `vh_missing_km_consistent`: biên bản đã xác nhận phải nói thật về số KM — có số thì
          // `odometer_missing` là false, thiếu số thì phải khai là thiếu.
          odometerKm: 12_000,
          odometerMissing: false,
          confirmedAt: new Date(),
          confirmedBy: ownerId,
        },
      });

      expect(await idsOf(AWAITING)).toEqual([stays.id]);
    },
  );

  maybe('biên bản còn NHÁP/CHỜ XÁC NHẬN thì đơn vẫn ở lại, kèm trạng thái bàn giao', async () => {
    const booking = await createDirect(0, { dayOffset: 2 });
    await prisma.vehicleHandover.create({
      data: {
        id: newId(),
        tenantId,
        bookingId: booking.id,
        vehicleId: vehicleIds[0]!,
        type: HANDOVER_TYPE.PICKUP,
        status: HANDOVER_STATUS.READY,
      },
    });

    const list = await bookings.list(tenantId, AWAITING, null);
    expect(list.data.map((b) => b.id)).toEqual([booking.id]);
    expect(list.data[0]!.pickupHandoverStatus).toBe(HANDOVER_STATUS.READY);
  });

  maybe('biên bản ĐÃ HUỶ không được đọc thành bằng chứng bàn giao', async () => {
    const booking = await createDirect(0, { dayOffset: 2 });
    await prisma.vehicleHandover.create({
      data: {
        id: newId(),
        tenantId,
        bookingId: booking.id,
        vehicleId: vehicleIds[0]!,
        type: HANDOVER_TYPE.PICKUP,
        status: HANDOVER_STATUS.CANCELED,
        canceledAt: new Date(),
      },
    });

    const list = await bookings.list(tenantId, AWAITING, null);
    expect(list.data.map((b) => b.id)).toEqual([booking.id]);
    expect(list.data[0]!.pickupHandoverStatus).toBeNull();
  });
});

describe('Chờ giao xe — quá giờ hẹn', () => {
  maybe('đơn đã qua giờ nhận nhưng chưa xử lý vẫn còn trong danh sách, xếp lên đầu', async () => {
    const upcoming = await createDirect(0, { dayOffset: 4 });
    const overdue = await createDirect(1, { dayOffset: -2 });
    const today = await createDirect(2, { dayOffset: 0 });

    /*
     * Không truyền `sort`: thứ tự này là MẶC ĐỊNH của nhóm việc (`orderByOf`), không phải thứ
     * mà web phải nhớ gửi kèm. Quá giờ → hôm nay → sắp tới, đúng thứ tự một ca trực.
     */
    expect(await idsOf(AWAITING)).toEqual([overdue.id, today.id, upcoming.id]);

    // Và quá giờ KHÔNG bị hệ thống tự kết luận là khách không đến.
    const row = await prisma.booking.findUniqueOrThrow({
      where: { id: overdue.id },
      select: { status: true, actualPickupAt: true },
    });
    expect(row.status).toBe(BOOKING_STATUS.RESERVED);
    expect(row.actualPickupAt).toBeNull();
  });
});

describe('Chờ giao xe — lọc, tìm, phân trang vẫn của server', () => {
  maybe('tìm kiếm áp CÙNG LÚC với nhóm việc, không thay thế nó', async () => {
    const target = await createDirect(0, { dayOffset: 2, customerName: 'Lê Thị Mai' });
    await createDirect(1, { dayOffset: 3, customerName: 'Trần Văn Bình' });
    // Cùng tên nhưng đã bàn giao — phải bị nhóm việc loại, dù khớp từ khoá.
    const handed = await createDirect(2, { dayOffset: 4, customerName: 'Lê Thị Mai' });
    await markActive(handed.id);

    const list = await bookings.list(tenantId, { ...AWAITING, q: 'Lê Thị Mai' }, null);
    expect(list.data.map((b) => b.id)).toEqual([target.id]);
    expect(list.meta.total).toBe(1);
  });

  maybe('lọc chi nhánh đi qua XE của đơn', async () => {
    const atA = await createDirect(0, { dayOffset: 2 });
    const atB = await createDirect(vehicleIds.length - 1, { dayOffset: 3 });

    expect(await idsOf({ ...AWAITING, branchId: branchAId })).toEqual([atA.id]);
    expect(await idsOf({ ...AWAITING, branchId: branchBId })).toEqual([atB.id]);
  });

  maybe('`status` do người dùng chọn THU HẸP thêm chứ không bị nhóm việc ghi đè', async () => {
    /*
     * Sau ADR 0047, `HANDOVER_ELIGIBLE_BOOKING_STATUS[PICKUP]` chỉ còn đúng MỘT giá trị khả dĩ
     * (`reserved`) — nên điều đáng khoá không còn là "hai trạng thái cùng lọt qua nhóm việc" mà
     * là chính cái bẫy phép spread: `status` của khách chọn phải THẮNG, không bị object sau ghi
     * đè, và một trạng thái ngoài nhóm việc phải ra RỖNG chứ không phải ra "mọi đơn".
     */
    const reserved = await createDirect(0, { dayOffset: 2 });

    expect(await idsOf({ ...AWAITING, status: BOOKING_STATUS.RESERVED })).toEqual([reserved.id]);
    expect(await idsOf({ ...AWAITING, status: BOOKING_STATUS.ACTIVE })).toEqual([]);
  });

  maybe('phân trang và tổng số đếm trên chính tập đã lọc', async () => {
    const created = [];
    for (let i = 0; i < 3; i += 1) {
      created.push((await createDirect(i, { dayOffset: i + 1 })).id);
    }
    // Đơn thứ tư đã bàn giao: nó không được tính vào `total` của nhóm việc.
    const handed = await createDirect(3, { dayOffset: 5 });
    await markActive(handed.id);

    const page1 = await bookings.list(tenantId, { ...AWAITING, page: 1, limit: 2 }, null);
    expect(page1.meta.total).toBe(3);
    expect(page1.meta.hasNext).toBe(true);
    expect(page1.data).toHaveLength(2);

    const page2 = await bookings.list(tenantId, { ...AWAITING, page: 2, limit: 2 }, null);
    expect(page2.meta.hasNext).toBe(false);
    expect(page2.data).toHaveLength(1);

    // Không trang nào lặp lại đơn của trang kia, và hợp hai trang đúng bằng tập đã lọc.
    const seen = [...page1.data, ...page2.data].map((b) => b.id);
    expect(new Set(seen).size).toBe(3);
    expect(seen.sort()).toEqual(created.sort());
  });

  maybe('không có nhóm việc thì danh sách đơn giữ nguyên hành vi cũ', async () => {
    const stays = await createDirect(0, { dayOffset: 2 });
    const handed = await createDirect(1, { dayOffset: 3 });
    await markActive(handed.id);

    const all = await bookings.list(tenantId, {}, null);
    expect(all.meta.total).toBe(2);
    // Mặc định cũ là "mới tạo trước" — nhóm việc không được đổi thứ tự của danh sách chung.
    expect(all.data.map((b) => b.id)).toEqual([handed.id, stays.id]);
  });
});

describe('Chờ giao xe — nơi xe đổi tay', () => {
  maybe('khách tự tới lấy ⇒ `branch` kèm tên chi nhánh giữ xe', async () => {
    await createDirect(vehicleIds.length - 1, { dayOffset: 2 });

    const [row] = (await bookings.list(tenantId, AWAITING, null)).data;
    expect(row!.handoverPlaceKind).toBe(BOOKING_HANDOVER_PLACE.BRANCH);
    expect(row!.handoverPlace).toBe('Chi nhánh Thủ Đức');
  });

  maybe('có hẹn giao tận nơi ⇒ `delivery` kèm địa chỉ khách hẹn', async () => {
    const bookingId = await createViaHoldPayment(0);
    /*
     * Địa chỉ giao sống ở YÊU CẦU chứ không ở đơn (`bookings` chưa bao giờ có cột đó). Đặt
     * thẳng lên bản ghi yêu cầu đã sinh ra đơn này là cách ngắn nhất để kiểm đúng đường đọc
     * mà `handoverPlaceOf` dùng.
     */
    await prisma.bookingRequest.updateMany({
      where: { bookingId, tenantId },
      data: { deliveryRequested: true, deliveryAddress: '12 Nguyễn Huệ, Quận 1, TP.HCM' },
    });

    const [row] = (await bookings.list(tenantId, AWAITING, null)).data;
    expect(row!.id).toBe(bookingId);
    expect(row!.handoverPlaceKind).toBe(BOOKING_HANDOVER_PLACE.DELIVERY);
    expect(row!.handoverPlace).toBe('12 Nguyễn Huệ, Quận 1, TP.HCM');
  });

  maybe('server trả MÃ + chuỗi thô, không trả một câu đã dịch sẵn', async () => {
    await createDirect(0, { dayOffset: 2 });

    const [row] = (await bookings.list(tenantId, AWAITING, null)).data;
    // Nhãn ("Khách tự tới lấy tại…") là việc của client — ADR 0012. Server chỉ nói xe ở đâu.
    expect(row!.handoverPlaceKind).toBe(BOOKING_HANDOVER_PLACE.BRANCH);
    expect(row!.handoverPlace).toBe('Chi nhánh Quận 1');
  });
});

/**
 * Ba nhóm còn lại của cột trái "Quản lý đơn thuê xe" (02/11/2026) và số đếm của cả bốn nhóm.
 *
 * Khoá hai điều: bốn nhóm KHÔNG chồng nhau và phủ kín (cộng lại đúng bằng "Tất cả"), và số đếm
 * KHÔNG phụ thuộc nhóm đang chọn nhưng CÓ theo tìm kiếm/chi nhánh/dịch vụ.
 */
describe('Cột trái — bốn nhóm việc và số đếm', () => {
  maybe('mỗi đơn rơi vào đúng một nhóm; khách không đến nằm cùng nhóm huỷ', async () => {
    const waiting = await createDirect(0, { dayOffset: 2 });
    const renting = await createDirect(1, { dayOffset: 3 });
    await markActive(renting.id);
    const done = await createDirect(2, { dayOffset: 4 });
    const cancelled = await createDirect(3, { dayOffset: 5 });
    const noShow = await createDirect(4, { dayOffset: 6 });
    await prisma.booking.update({
      where: { id: done.id },
      data: {
        status: BOOKING_STATUS.COMPLETED,
        actualPickupAt: new Date(),
        actualReturnAt: new Date(),
      },
    });
    await prisma.booking.update({
      where: { id: cancelled.id },
      data: { status: BOOKING_STATUS.CANCELLED },
    });
    await prisma.booking.update({
      where: { id: noShow.id },
      data: { status: BOOKING_STATUS.NO_SHOW },
    });

    expect(await idsOf({ preset: BOOKING_LIST_PRESET.AWAITING_PICKUP })).toEqual([waiting.id]);
    expect(await idsOf({ preset: BOOKING_LIST_PRESET.RENTING })).toEqual([renting.id]);
    expect(await idsOf({ preset: BOOKING_LIST_PRESET.COMPLETED })).toEqual([done.id]);
    expect((await idsOf({ preset: BOOKING_LIST_PRESET.CANCELLED })).sort()).toEqual(
      [cancelled.id, noShow.id].sort(),
    );

    const page = await bookings.list(tenantId, { preset: BOOKING_LIST_PRESET.RENTING }, null);
    const counts = Object.fromEntries(page.meta.presetCounts.map((c) => [c.preset, c.count]));
    // Đứng ở ngăn "Đang thuê" vẫn thấy đủ bốn con số — số đếm không theo nhóm đang chọn.
    expect(counts).toEqual({
      [BOOKING_LIST_PRESET.AWAITING_PICKUP]: 1,
      [BOOKING_LIST_PRESET.RENTING]: 1,
      [BOOKING_LIST_PRESET.COMPLETED]: 1,
      [BOOKING_LIST_PRESET.CANCELLED]: 2,
    });
    const all = await bookings.list(tenantId, {}, null);
    expect(page.meta.presetCounts.reduce((sum, c) => sum + c.count, 0)).toBe(all.meta.total);
  });

  maybe('số đếm đi theo tìm kiếm của trang', async () => {
    await createDirect(0, { dayOffset: 2, customerName: 'Trần Thị Bé' });
    await createDirect(1, { dayOffset: 3, customerName: 'Lê Văn Cường' });

    const page = await bookings.list(tenantId, { q: 'Cường' }, null);
    const awaiting = page.meta.presetCounts.find(
      (c) => c.preset === BOOKING_LIST_PRESET.AWAITING_PICKUP,
    );
    expect(awaiting?.count).toBe(1);
  });

  maybe('thẻ đơn mang ảnh/thông số xe và đường nhắn tin của yêu cầu gốc', async () => {
    const direct = await createDirect(0, { dayOffset: 2 });
    const viaRequest = await createViaHoldPayment(1);

    const rows = (await bookings.list(tenantId, {}, null)).data;
    const directRow = rows.find((b) => b.id === direct.id)!;
    const requestRow = rows.find((b) => b.id === viaRequest)!;
    expect(directRow.vehicleType).toBe(VEHICLE_TYPE.CAR);
    // Đơn gian hàng tự lập không có tài khoản khách ⇒ không có ai để nhắn.
    expect(directRow.bookingRequestId).toBeNull();
    expect(directRow.canMessageOnPlatform).toBe(false);
    expect(requestRow.bookingRequestId).not.toBeNull();
    expect(requestRow.canMessageOnPlatform).toBe(true);
    expect(requestRow.cancellationParty).toBeNull();
  });
});

describe('Chi tiết đơn — chuẩn bị bàn giao (02/11/2026)', () => {
  maybe('đơn chờ giao: việc suy từ dữ liệu thật; đơn đã giao thì không còn khối này', async () => {
    const created = await createDirect(0);
    const detail = await bookings.getOne(tenantId, created.id);
    expect(detail.handoverPrep).toMatchObject({
      documentsReady: false,
      rentDueAmount: '1500000',
      depositReceived: '0',
      contractId: null,
      contractSigned: false,
      pickupPhotoCount: 0,
      pickupPhotoRequired: 5,
      // Tự lái — không có việc gán tài xế.
      driverReady: null,
    });

    await markActive(created.id);
    expect((await bookings.getOne(tenantId, created.id)).handoverPrep).toBeNull();
  });

  maybe(
    'giấy tờ đã đối chiếu nhưng HẾT HẠN trước ngày cuối chuyến thì chưa tính là xong',
    async () => {
      const created = await createDirect(0, { dayOffset: 5 });
      const detail = await bookings.getOne(tenantId, created.id);
      expect(detail.tenantCustomerId).not.toBeNull();
      const docId = newId();
      await prisma.tenantCustomerDocument.create({
        data: {
          id: docId,
          tenantId,
          tenantCustomerId: detail.tenantCustomerId!,
          documentType: CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID,
          objectKey: `test/prep/${docId}.jpg`,
          originalName: 'cccd.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 10,
          status: CUSTOMER_DOCUMENT_STATUS.READY,
          // Hết hạn ngay hôm nay — trước ngày trả xe.
          expiresAt: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z'),
          verifiedAt: new Date(),
          verifiedByUserId: ownerId,
          verifyMethod: IDENTITY_VERIFY_METHOD.IN_PERSON,
        },
      });
      expect((await bookings.getOne(tenantId, created.id)).handoverPrep?.documentsReady).toBe(
        false,
      );

      await prisma.tenantCustomerDocument.update({
        where: { id: docId },
        data: { expiresAt: null },
      });
      expect((await bookings.getOne(tenantId, created.id)).handoverPrep?.documentsReady).toBe(true);
    },
  );
});

describe('Chi tiết đơn — đánh dấu tay việc chuẩn bị bàn giao (03/11/2026)', () => {
  maybe('đánh dấu / bỏ dấu: idempotent, ghi người đánh dấu và audit mỗi lần ĐỔI', async () => {
    const created = await createDirect(0);
    const check = (checked: boolean) =>
      bookings.setHandoverPrepCheck(tenantId, created.id, ownerId, {
        item: HANDOVER_PREP_ITEM.CONTRACT,
        checked,
      });

    const first = await check(true);
    expect(first.manualChecks).toHaveLength(1);
    expect(first.manualChecks[0]).toMatchObject({ item: HANDOVER_PREP_ITEM.CONTRACT });
    expect(first.manualChecks[0]!.checkedByName).toBeTruthy();
    // Bấm lần hai (hai tab, mạng chập chờn) — vẫn MỘT dấu, không thêm audit.
    expect((await check(true)).manualChecks).toHaveLength(1);
    expect((await check(false)).manualChecks).toHaveLength(0);
    expect((await check(false)).manualChecks).toHaveLength(0);

    const actions = (
      await prisma.auditLog.findMany({
        where: { tenantId, targetId: created.id, action: { startsWith: 'booking.prep_' } },
        orderBy: { createdAt: 'asc' },
        select: { action: true },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(['booking.prep_check', 'booking.prep_uncheck']);
  });

  maybe('từ chối khi đơn đã giao, và việc tài xế ở đơn tự lái', async () => {
    const created = await createDirect(0);
    await expect(
      bookings.setHandoverPrepCheck(tenantId, created.id, ownerId, {
        item: HANDOVER_PREP_ITEM.DRIVER,
        checked: true,
      }),
    ).rejects.toMatchObject({ response: { code: 'HANDOVER_NOT_ELIGIBLE' } });

    await markActive(created.id);
    await expect(
      bookings.setHandoverPrepCheck(tenantId, created.id, ownerId, {
        item: HANDOVER_PREP_ITEM.PHOTOS,
        checked: true,
      }),
    ).rejects.toMatchObject({ response: { code: 'HANDOVER_NOT_ELIGIBLE' } });
  });
});

describe('Chi tiết đơn — tiền thu tay lúc nhận xe (03/11/2026)', () => {
  maybe('đơn qua giữ chỗ: không đòi lại phần D chủ xe đã có trong khoản online', async () => {
    const bookingId = await createViaHoldPayment(1);
    const detail = await bookings.getOne(tenantId, bookingId);
    const row = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { priceSnapshot: true },
    });
    const d = (row.priceSnapshot as { fees?: { depositAmount?: string } }).fees?.depositAmount;
    expect(d).toBeTruthy();
    expect(new Prisma.Decimal(d!).gt(0)).toBe(true);
    const expected = Prisma.Decimal.max(0, new Prisma.Decimal(detail.debtAmount).minus(d!));
    expect(detail.handoverPrep?.rentDueAmount).toBe(expected.toFixed(0));

    // Mốc của thanh tiến trình: xác nhận = lượt nhận yêu cầu, tiền giữ chỗ về ⇒ có `holdPaidAt`.
    expect(detail.holdPaidAt).not.toBeNull();
    expect(new Date(detail.confirmedAt).getTime()).toBeLessThanOrEqual(
      new Date(detail.holdPaidAt!).getTime(),
    );
  });

  maybe(
    'đơn tự lập: xác nhận = lúc lập đơn, không có mốc giữ chỗ; có số chuyến đã xong của khách',
    async () => {
      const created = await createDirect(0);
      const detail = await bookings.getOne(tenantId, created.id);
      expect(detail.holdPaidAt).toBeNull();
      expect(detail.confirmedAt).toBe(new Date(detail.createdAt).toISOString());
      expect(detail.customerCompletedRentals).toBe(0);
    },
  );
});
