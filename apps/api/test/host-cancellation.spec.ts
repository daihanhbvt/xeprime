import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  CANCELLATION_PARTY,
  CANCELLATION_REASON_CATEGORY,
  CANCELLATION_STAGE,
  HOLD_REFUND_STATUS,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TYPE,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import type { AuthService } from '../src/modules/auth/auth.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { HostMetricsService } from '../src/modules/host-metrics/host-metrics.service';
import type { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import { VehicleSettingsService } from '../src/modules/vehicle-settings/vehicle-settings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { giveTenantPlan } from './helpers/billing-fixture';
import { releaseWalletObligations } from './helpers/wallet-cleanup';
import {
  makeBookingHoldsService,
  makeBookingRequestsService,
  makeNotificationService,
} from './helpers/service-factory';

/**
 * QUYỀN HUỶ CỦA CHỦ XE — trên PostgreSQL THẬT (ADR 0045 điều 1).
 *
 * ADR 0044 mở ra một cửa sổ mà thứ tự cũ không có: chủ xe ĐÃ đồng ý nhận một chuyến, rồi xe
 * hỏng. Trước đợt này họ không có nút nào — lịch vẫn bị giữ, khách vẫn nhìn đồng hồ đếm ngược
 * tới một chuyến sẽ không xảy ra, và đường duy nhất là gọi điện xin lỗi rồi chờ hết hai giờ.
 *
 * Spec khoá bốn thứ, tất cả đều là chỗ tiền hoặc sự thật có thể đi sai:
 *
 *  1. **Một transaction, năm việc** — lật trạng thái, đóng hold, nhả lịch, ghi trách nhiệm,
 *     báo hai phía. Thiếu một việc là một chiếc xe rảnh mà chợ không biết.
 *  2. **Đúng MỘT đường thắng** khi tiền về cùng lúc, và bấm huỷ hai lần không tạo hai lượt hoàn.
 *  3. **Trách nhiệm do SERVER suy** — nhân viên được uỷ quyền vẫn là phía gian hàng, và không
 *     đường nào của gian hàng gán được `force_majeure`.
 *  4. **Ba cột QUYẾT ĐỊNH không bị ghi đè** ở chặng `awaiting_hold` — chúng đang mang lượt NHẬN,
 *     và ghi đè chúng hỏng cả trung vị thời gian phản hồi lẫn cờ "Đặt ngay" (ADR 0045 điều 3).
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test -- test/host-cancellation.spec.ts
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const occupancy = new OccupancyService(asService);
const settings = new VehicleSettingsService(asService, audit, occupancy);
const holds = makeBookingHoldsService(asService);
const metrics = new HostMetricsService(asService);

const phoneVerification = {
  assertPhoneVerifiedForBooking: async () => {},
} as unknown as PhoneVerificationService;
const auth = {
  resolveOrCreateUserByPhone: async () => ({ userId: null }),
} as unknown as AuthService;

const requests = makeBookingRequestsService(asService, {
  phoneVerification,
  auth,
  audit,
  notifications,
  occupancy,
  settings,
});

const RUN = newId().slice(-8).toLowerCase();

let dbAvailable = false;
let ownerId: string;
let staffId: string;
let customerUserId: string;
let tenantId: string;
let vehicleId: string;
let phoneCounter = 0;
const nextPhone = () => `0933${String(100000 + ++phoneCounter).slice(-6)}`;

/** `offsetDays` ngày nữa lúc `hourVn` giờ VN — nằm trong khung giờ giao nhận mặc định 06–22. */
function vnAt(offsetDays: number, hourVn: number): Date {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(hourVn - 7, 0, 0, 0);
  return base;
}

/** Gửi yêu cầu rồi DUYỆT — kết thúc ở `awaiting_hold` với một hold `pending` đang giữ lịch. */
async function acceptedRequest(offsetDays = 6): Promise<string> {
  const submitted = await requests.submitPublic(
    {
      vehicleId,
      customerName: 'Nguyễn Văn A',
      customerPhone: nextPhone(),
      pickupAt: vnAt(offsetDays, 9).toISOString(),
      returnAt: vnAt(offsetDays + 2, 9).toISOString(),
    },
    customerUserId,
  );
  await requests.approve(tenantId, ownerId, submitted.receipt.id, {});
  return submitted.receipt.id;
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
  staffId = newId();
  customerUserId = newId();
  tenantId = newId();
  vehicleId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ xe', email: `hc-own-${RUN}@xeprime.test` },
      { id: staffId, displayName: 'Nhân viên', email: `hc-staff-${RUN}@xeprime.test` },
      { id: customerUserId, displayName: 'Khách', email: `hc-cus-${RUN}@xeprime.test` },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `CancelShop-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantMembership.createMany({
    data: [
      {
        id: newId(),
        tenantId,
        userId: ownerId,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
        joinedAt: new Date(),
      },
      {
        id: newId(),
        tenantId,
        userId: staffId,
        roleKey: TENANT_ROLE.SHOP_STAFF,
        status: MEMBERSHIP_STATUS.ACTIVE,
        joinedAt: new Date(),
      },
    ],
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE${vehicleId.slice(-5)}`,
      name: 'Xe huỷ chuyến',
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
      weekdayPrice: new Prisma.Decimal('700000'),
      weekendPrice: new Prisma.Decimal('700000'),
      createdBy: ownerId,
    },
  });
  /*
   * Tuyến HOA HỒNG: lượt duyệt sinh `booking_holds` và yêu cầu dừng ở `awaiting_hold` — đúng
   * chặng mà quyền huỷ của ADR 0045 tồn tại. Tuyến gói tạo đơn ngay lúc duyệt, nên nó không có
   * cửa sổ này để kiểm.
   */
  await giveTenantPlan(prisma, tenantId, { billingMode: BILLING_MODE.COMMISSION });
});

afterEach(async () => {
  if (!dbAvailable) return;
  await prisma.holdRefund.deleteMany({ where: { tenantId } });
  await prisma.bookingCancellation.deleteMany({ where: { tenantId } });
  await prisma.bookingHold.deleteMany({ where: { tenantId } });
  await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
  await prisma.booking.deleteMany({ where: { tenantId } });
  await prisma.bookingRequest.deleteMany({ where: { tenantId } });
  await prisma.notification.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  if (dbAvailable) {
    /*
     * `wallets.owner_*` là `RESTRICT` (CLAUDE.md §5): khách đã nhận một khoản hoàn vào ví điểm
     * nên tài khoản của họ KHÔNG xoá cứng được. Gỡ nghĩa vụ tường minh trước — đúng kỷ luật mà
     * production cũng phải theo.
     */
    await releaseWalletObligations(prisma, {
      tenantIds: [tenantId],
      userIds: [customerUserId, ownerId, staffId],
    });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
    await prisma.vehicleServiceSetting.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, staffId, customerUserId] } },
    });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const CANCEL = {
  reasonCategory: CANCELLATION_REASON_CATEGORY.VEHICLE_UNAVAILABLE,
  reason: 'Xe bị va chạm sáng nay, đang ở gara.',
};

describe('Huỷ ở `awaiting_hold` — một transaction, năm việc', () => {
  maybe('lật trạng thái, đóng hold, nhả lịch, ghi trách nhiệm, báo hai phía', async () => {
    const id = await acceptedRequest();

    // Trước khi huỷ: lịch ĐANG bị giữ và hold đang chờ tiền.
    expect(await prisma.vehicleOccupancy.count({ where: { vehicleId } })).toBe(1);

    const after = await requests.cancelByHost(tenantId, ownerId, id, CANCEL);
    expect(after.status).toBe(BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST);

    const hold = await prisma.bookingHold.findFirstOrThrow({ where: { bookingRequestId: id } });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.CANCELLED);

    // Chiếc xe phải quay lại chợ NGAY — đây là điểm của cả tính năng.
    expect(await prisma.vehicleOccupancy.count({ where: { vehicleId } })).toBe(0);

    const row = await prisma.bookingCancellation.findUniqueOrThrow({
      where: { bookingRequestId: id },
    });
    expect(row.responsibleParty).toBe(CANCELLATION_PARTY.HOST);
    expect(row.countsAgainstHost).toBe(true);
    expect(row.stage).toBe(CANCELLATION_STAGE.AWAITING_HOLD);
    expect(row.reasonCategory).toBe(CANCELLATION_REASON_CATEGORY.VEHICLE_UNAVAILABLE);
    expect(row.actorUserId).toBe(ownerId);

    // Khách được báo, và câu báo mang tên xe + lý do chủ xe ghi.
    const toCustomer = await prisma.notification.findFirst({
      where: { userId: customerUserId, type: NOTIFICATION_TYPE.BOOKING_CANCELLED_BY_HOST },
    });
    expect(toCustomer).not.toBeNull();
    expect(toCustomer!.body).toContain('gara');

    // Người trực KHÁC trong gian hàng cũng phải biết; người vừa bấm thì không.
    const toStaff = await prisma.notification.findFirst({ where: { userId: staffId } });
    expect(toStaff).not.toBeNull();
    expect(
      await prisma.notification.count({
        where: { userId: ownerId, type: NOTIFICATION_TYPE.BOOKING_REQUEST_CANCELLED },
      }),
    ).toBe(0);

    expect(
      await prisma.auditLog.count({
        where: { tenantId, action: 'booking_request.cancel_by_host', targetId: id },
      }),
    ).toBe(1);
  });

  /*
   * Đây là chỗ dễ hỏng nhất và khó thấy nhất. Ở `awaiting_hold`, ba cột quyết định đang mang
   * lượt NHẬN (ADR 0044 điều 2). Ghi đè chúng làm trung vị thời gian phản hồi đo "bao lâu thì
   * huỷ" thay vì "bao lâu thì trả lời" — một con số sai đứng cạnh tên một con người.
   */
  maybe('KHÔNG ghi đè ba cột quyết định — chúng đang mang lượt NHẬN', async () => {
    const id = await acceptedRequest();
    const before = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id },
      select: { decidedAt: true, decidedBy: true, decisionSource: true },
    });
    expect(before.decidedAt).not.toBeNull();

    await requests.cancelByHost(tenantId, staffId, id, CANCEL);

    const after = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id },
      select: { decidedAt: true, decidedBy: true, decisionSource: true },
    });
    expect(after.decidedAt?.getTime()).toBe(before.decidedAt?.getTime());
    expect(after.decidedBy).toBe(before.decidedBy);
    expect(after.decisionSource).toBe(before.decisionSource);
  });

  /** Uỷ quyền là chuyện nội bộ của người bán; với khách, xe bị rút lại vẫn là xe bị rút lại. */
  maybe('NHÂN VIÊN huỷ vẫn là phía gian hàng chịu trách nhiệm', async () => {
    const id = await acceptedRequest();
    await requests.cancelByHost(tenantId, staffId, id, CANCEL);

    const row = await prisma.bookingCancellation.findUniqueOrThrow({
      where: { bookingRequestId: id },
    });
    expect(row.actorUserId).toBe(staffId);
    expect(row.responsibleParty).toBe(CANCELLATION_PARTY.HOST);
    expect(row.countsAgainstHost).toBe(true);
  });

  /*
   * Khách chuyển dở (hold `underpaid`) rồi chủ xe huỷ: phần đã chuyển phải quay về. Đây là
   * đường tiền DUY NHẤT của lượt huỷ ở chặng này, và nó đi qua đúng đường hoàn thường.
   */
  maybe('khách đã chuyển DỞ ⇒ sinh một khoản hoàn cho phần đó', async () => {
    const id = await acceptedRequest();
    const hold = await prisma.bookingHold.findFirstOrThrow({
      where: { bookingRequestId: id },
      select: { id: true, code: true, amount: true },
    });

    // Chuyển thiếu một nửa — hold sang `underpaid`, chưa thành đơn.
    const partial = hold.amount.div(2).toDecimalPlaces(0);
    await prisma.$transaction((tx) =>
      holds.applyBankPaymentWithinTx(tx, {
        code: hold.code,
        amount: partial,
        providerTxId: `part-${newId()}`,
        transferredAt: new Date(),
      }),
    );
    const mid = await prisma.bookingHold.findUniqueOrThrow({ where: { id: hold.id } });
    expect(mid.status).toBe(BOOKING_HOLD_STATUS.UNDERPAID);

    await requests.cancelByHost(tenantId, ownerId, id, CANCEL);

    const refund = await prisma.holdRefund.findFirstOrThrow({ where: { holdId: hold.id } });
    expect(refund.amount.toString()).toBe(partial.toString());
    /*
     * `credited`, không phải `pending`: khách này CÓ tài khoản, nên khoản hoàn vào thẳng ví
     * điểm ngay trong transaction (ADR 0033 điều 5). Chỉ khách vãng lai mới dừng ở `pending`
     * chờ admin chuyển tay — và phân biệt đúng hai đường đó chính là điều đáng khoá ở đây.
     */
    expect(refund.status).toBe(HOLD_REFUND_STATUS.CREDITED);
    expect(await prisma.vehicleOccupancy.count({ where: { vehicleId } })).toBe(0);
  });

  maybe('bấm huỷ HAI lần: lần sau 409, và chỉ có MỘT dòng trách nhiệm', async () => {
    const id = await acceptedRequest();
    await requests.cancelByHost(tenantId, ownerId, id, CANCEL);

    await expect(requests.cancelByHost(tenantId, staffId, id, CANCEL)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.BOOKING_CANCEL_NOT_ALLOWED },
    });

    expect(await prisma.bookingCancellation.count({ where: { bookingRequestId: id } })).toBe(1);
    expect(await prisma.holdRefund.count({ where: { tenantId } })).toBe(0);
  });

  /*
   * CUỘC ĐUA VỚI ĐỒNG TIỀN. Khách chuyển đủ đúng lúc người trực đang mở hộp thoại: webhook
   * thắng và chuyến đã thành ĐƠN. Lệnh huỷ tới sau không được xoá một đơn thuê có thật, và
   * cũng không được hoàn một khoản tiền đã trở thành tiền của chuyến.
   */
  maybe('tiền về TRƯỚC ⇒ đã thành đơn, lệnh huỷ tới sau bị từ chối', async () => {
    const id = await acceptedRequest();
    const hold = await prisma.bookingHold.findFirstOrThrow({
      where: { bookingRequestId: id },
      select: { code: true, amount: true },
    });
    await prisma.$transaction((tx) =>
      holds.applyBankPaymentWithinTx(tx, {
        code: hold.code,
        amount: hold.amount,
        providerTxId: `full-${newId()}`,
        transferredAt: new Date(),
      }),
    );

    const paid = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(paid.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    expect(paid.bookingId).not.toBeNull();

    await expect(requests.cancelByHost(tenantId, ownerId, id, CANCEL)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.BOOKING_CANCEL_NOT_ALLOWED },
    });

    // Đơn còn nguyên, và không ai bịa ra một khoản hoàn.
    expect(await prisma.booking.count({ where: { id: paid.bookingId! } })).toBe(1);
    expect(await prisma.holdRefund.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.bookingCancellation.count({ where: { tenantId } })).toBe(0);
  });
});

describe('Chặng nào KHÔNG huỷ được, và câu trả lời phải có lối đi tiếp', () => {
  /*
   * Yêu cầu chưa được nhận thì đường đúng là TỪ CHỐI, không phải huỷ. Hai việc khác nhau về
   * tiền (từ chối không chạm tới đồng nào) và khác nhau về chỉ số (từ chối trong hạn không bị
   * trừ vào "nhận và giữ chuyến"). Lỗi vì thế nói thẳng đường đi tiếp.
   */
  maybe('`pending_host_approval` ⇒ BOOKING_CANCEL_NOT_ALLOWED, kèm chặng thật', async () => {
    const submitted = await requests.submitPublic(
      {
        vehicleId,
        customerName: 'Nguyễn Văn B',
        customerPhone: nextPhone(),
        pickupAt: vnAt(8, 9).toISOString(),
        returnAt: vnAt(10, 9).toISOString(),
      },
      customerUserId,
    );

    await expect(
      requests.cancelByHost(tenantId, ownerId, submitted.receipt.id, CANCEL),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.BOOKING_CANCEL_NOT_ALLOWED,
        details: { stage: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL },
      },
    });
    expect(await prisma.bookingCancellation.count({ where: { tenantId } })).toBe(0);
  });

  maybe('yêu cầu của gian hàng KHÁC ⇒ không tìm thấy, không rò tình trạng', async () => {
    const id = await acceptedRequest();
    await expect(requests.cancelByHost(newId(), ownerId, id, CANCEL)).rejects.toMatchObject({
      status: 404,
    });
  });

  /*
   * Nhóm "Lý do khác" mà bỏ trống ô chữ thì khách nhận được đúng một chữ "đã huỷ". Chặn ở
   * service, không chỉ ở DTO: `cancelByHost` là API công khai của service và có nơi gọi khác.
   */
  maybe('`other` mà không ghi lý do ⇒ từ chối trước khi chạm tới transaction', async () => {
    const id = await acceptedRequest();
    await expect(
      requests.cancelByHost(tenantId, ownerId, id, {
        reasonCategory: CANCELLATION_REASON_CATEGORY.OTHER,
        reason: '   ',
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });

    const untouched = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(untouched.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    expect(await prisma.vehicleOccupancy.count({ where: { vehicleId } })).toBe(1);
  });
});

describe('Lượt huỷ chạy thẳng vào chỉ số uy tín', () => {
  /*
   * Đây là vòng khép kín của ADR 0045: đường GHI (`booking_cancellations`) và đường ĐỌC
   * (`HostMetricsService`) phải nói cùng một điều về cùng một chuyến. Hai đường đó nằm ở hai
   * module khác nhau, nên nếu không có bài test này thì chúng lệch nhau trong im lặng.
   */
  maybe('một lượt huỷ ⇒ MỘT mẫu: vẫn đã phản hồi, nhưng không còn giữ chuyến', async () => {
    // Bốn chuyến sạch để qua ngưỡng "đủ dữ liệu", rồi một chuyến bị chủ xe huỷ.
    for (let i = 0; i < 4; i += 1) {
      const ok = await acceptedRequest(20 + i * 4);
      const hold = await prisma.bookingHold.findFirstOrThrow({
        where: { bookingRequestId: ok },
        select: { code: true, amount: true },
      });
      await prisma.$transaction((tx) =>
        holds.applyBankPaymentWithinTx(tx, {
          code: hold.code,
          amount: hold.amount,
          providerTxId: `m-${newId()}`,
          transferredAt: new Date(),
        }),
      );
    }
    const cancelled = await acceptedRequest(6);
    await requests.cancelByHost(tenantId, ownerId, cancelled, CANCEL);

    const m = await metrics.forTenant(tenantId);
    expect(m.sampleCount).toBe(5);
    // Họ ĐÃ trả lời cả năm — lượt huỷ không xoá điều đó.
    expect(m.responseRatePercent).toBe(100);
    // Nhưng một chuyến đã bị rút lại sau khi nhận.
    expect(m.acceptKeepRatePercent).toBe(80);
  });
});
