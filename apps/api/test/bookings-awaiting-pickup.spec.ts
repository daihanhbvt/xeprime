import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BILLING_MODE,
  BOOKING_HANDOVER_PLACE,
  BOOKING_LIST_PRESET,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  HANDOVER_STATUS,
  HANDOVER_TYPE,
  MEMBERSHIP_STATUS,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import type { AuthService } from '../src/modules/auth/auth.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import type { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import { VehicleSettingsService } from '../src/modules/vehicle-settings/vehicle-settings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { giveTenantPlan } from './helpers/billing-fixture';
import { payHoldForRequest } from './helpers/hold-payment';
import { releaseWalletObligations } from './helpers/wallet-cleanup';
import {
  makeBookingHoldsService,
  makeBookingRequestsService,
  makeBookingsService,
  makeNotificationService,
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
const settings = new VehicleSettingsService(asService, audit, occupancy);

const bookings = makeBookingsService(asService, { audit, notifications, occupancy, settings });
const holds = makeBookingHoldsService(asService);
const requests = makeBookingRequestsService(asService, {
  phoneVerification: {
    assertPhoneVerifiedForBooking: async () => {},
  } as unknown as PhoneVerificationService,
  auth: {
    resolveOrCreateUserByPhone: async () => ({ userId: null }),
  } as unknown as AuthService,
  audit,
  notifications,
  occupancy,
  settings,
});

const RUN = newId().slice(-8).toLowerCase();
const AWAITING = { preset: BOOKING_LIST_PRESET.AWAITING_PICKUP } as const;

let dbAvailable = false;
let ownerId: string;
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
      customerName: 'Khách Đối Soát',
      customerPhone: nextPhone(),
      pickupAt: vnAt(dayOffset, 9).toISOString(),
      returnAt: vnAt(dayOffset + 2, 9).toISOString(),
    },
    customerUserId,
  );
  const requestId = submitted.receipt.id;
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
  (await bookings.list(tenantId, query)).data.map((b) => b.id);

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
  customerUserId = newId();
  tenantId = newId();
  branchAId = newId();
  branchBId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ xe', email: `ap-own-${RUN}@xeprime.test` },
      { id: customerUserId, displayName: 'Khách', email: `ap-cus-${RUN}@xeprime.test` },
    ],
  });
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

    const list = await bookings.list(tenantId, AWAITING);
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
        customerName: 'Khách Chờ Duyệt',
        customerPhone: nextPhone(),
        pickupAt: vnAt(6, 9).toISOString(),
        returnAt: vnAt(8, 9).toISOString(),
      },
      customerUserId,
    );
    const awaitingHold = await requests.submitPublic(
      {
        vehicleId: vehicleIds[5]!,
        customerName: 'Khách Chờ Trả Tiền',
        customerPhone: nextPhone(),
        pickupAt: vnAt(6, 9).toISOString(),
        returnAt: vnAt(8, 9).toISOString(),
      },
      customerUserId,
    );
    // Duyệt xong nhưng KHÔNG trả tiền: yêu cầu đứng ở `awaiting_hold`, chưa có đơn nào.
    await requests.approve(tenantId, ownerId, awaitingHold.receipt.id, {});

    const statuses = await prisma.bookingRequest.findMany({
      where: { id: { in: [pending.receipt.id, awaitingHold.receipt.id] } },
      select: { status: true, bookingId: true },
    });
    expect(statuses.map((r) => r.status).sort()).toEqual(
      [BOOKING_REQUEST_STATUS.AWAITING_HOLD, BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL].sort(),
    );
    expect(statuses.every((r) => r.bookingId === null)).toBe(true);

    const list = await bookings.list(tenantId, AWAITING);
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

    const list = await bookings.list(tenantId, AWAITING);
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

    const list = await bookings.list(tenantId, AWAITING);
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

    const list = await bookings.list(tenantId, { ...AWAITING, q: 'Lê Thị Mai' });
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

    const page1 = await bookings.list(tenantId, { ...AWAITING, page: 1, limit: 2 });
    expect(page1.meta.total).toBe(3);
    expect(page1.meta.hasNext).toBe(true);
    expect(page1.data).toHaveLength(2);

    const page2 = await bookings.list(tenantId, { ...AWAITING, page: 2, limit: 2 });
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

    const all = await bookings.list(tenantId, {});
    expect(all.meta.total).toBe(2);
    // Mặc định cũ là "mới tạo trước" — nhóm việc không được đổi thứ tự của danh sách chung.
    expect(all.data.map((b) => b.id)).toEqual([handed.id, stays.id]);
  });
});

describe('Chờ giao xe — nơi xe đổi tay', () => {
  maybe('khách tự tới lấy ⇒ `branch` kèm tên chi nhánh giữ xe', async () => {
    await createDirect(vehicleIds.length - 1, { dayOffset: 2 });

    const [row] = (await bookings.list(tenantId, AWAITING)).data;
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

    const [row] = (await bookings.list(tenantId, AWAITING)).data;
    expect(row!.id).toBe(bookingId);
    expect(row!.handoverPlaceKind).toBe(BOOKING_HANDOVER_PLACE.DELIVERY);
    expect(row!.handoverPlace).toBe('12 Nguyễn Huệ, Quận 1, TP.HCM');
  });

  maybe('server trả MÃ + chuỗi thô, không trả một câu đã dịch sẵn', async () => {
    await createDirect(0, { dayOffset: 2 });

    const [row] = (await bookings.list(tenantId, AWAITING)).data;
    // Nhãn ("Khách tự tới lấy tại…") là việc của client — ADR 0012. Server chỉ nói xe ở đâu.
    expect(row!.handoverPlaceKind).toBe(BOOKING_HANDOVER_PLACE.BRANCH);
    expect(row!.handoverPlace).toBe('Chi nhánh Quận 1');
  });
});
