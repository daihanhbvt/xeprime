import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import { giveTenantPlan } from './helpers/billing-fixture';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  AUDIT_ACTOR_SCOPE,
  BOOKING_REQUEST_DECISION_SOURCE,
  BOOKING_REQUEST_REMINDER_MINUTES,
  BOOKING_REQUEST_RESPOND_WINDOW_MINUTES,
  BOOKING_REQUEST_STATUS,
  bookingRequestRespondBy,
  BOOKING_STATUS,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  OCCUPANCY_SOURCE_TYPE,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { sweepBookingHoldExpiry } from '../../worker/src/jobs/booking-hold-expiry';
import { sweepBookingRequestDeadlines } from '../../worker/src/jobs/booking-request-deadlines';
import { AuditService } from '../src/modules/audit/audit.service';
import type { AuthService } from '../src/modules/auth/auth.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import type { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBookingHoldsService,
  makeBookingRequestsService,
  makeBookingsService,
  makeCustomersService,
  makeNotificationService,
  makePricingService,
} from './helpers/service-factory';
import { payHoldForRequest } from './helpers/hold-payment';

/**
 * HẠN PHẢN HỒI 60 PHÚT của yêu cầu thuê — trên PostgreSQL THẬT.
 *
 * Luật nghiệp vụ đang được khoá ở đây:
 *
 *  1. Gửi yêu cầu → `respond_by = now + 60'`, do SERVER đặt, và **không chiếm lịch xe**
 *     (ADR 0006 — nhiều khách được phép cùng hỏi một chiếc xe; ai được duyệt trước thì được xe).
 *  2. `Duyệt & giữ xe` là hành động DUY NHẤT tạo đơn `reserved` và là lúc chỗ trên lịch bị giữ.
 *  3. Quá hạn thì không duyệt và không từ chối được nữa — kể cả khi worker chưa kịp chạy, tức
 *     là cột `status` vẫn còn `pending_host_approval`.
 *  4. Worker nhắc đúng MỘT lần mỗi mốc, và expire ghi audit `system` + báo cả hai phía.
 *  5. Đua giữa `Duyệt & giữ xe` và worker: đúng một bên thắng, không có kết cục lai.
 *
 * Job của worker được import THẲNG (`apps/worker/src/jobs/...`) chứ không dựng lại một bản sao
 * ở đây: thứ cần chứng minh là chính đoạn mã sẽ chạy trên production, không phải một mô hình
 * gần giống nó.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const occupancy = new OccupancyService(asService);
const customers = makeCustomersService(asService, audit);
const bookings = makeBookingsService(asService, {
  occupancy: occupancy,
  audit: audit,
  notifications: notifications,
  customers: customers,
});

const phoneVerification = {
  assertPhoneVerifiedForBooking: async () => {},
} as unknown as PhoneVerificationService;

let guestUserId: string;
const auth = {
  resolveOrCreateUserByPhone: async () => ({ userId: guestUserId }),
} as unknown as AuthService;

const holds = makeBookingHoldsService(asService);
const requests = makeBookingRequestsService(asService, {
  bookings: bookings,
  audit: audit,
  notifications: notifications,
  phoneVerification: phoneVerification,
  auth: auth,
  occupancy: occupancy,
  pricing: makePricingService(asService),
  customers: customers,
});

let dbAvailable = false;
let ownerId: string;
let tenantId: string;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

let phoneSeq = 0;
/** SĐT khác nhau cho từng ca — index chống trùng một phần chặn cùng (xe, SĐT, khung giờ). */
const nextPhone = () => `0908${String(700_000 + (phoneSeq += 1)).slice(-6)}`;

let vehicleSeq = 0;
/**
 * Một chiếc xe công khai mới cho mỗi ca.
 *
 * Xe riêng chứ không dùng chung: ca duyệt thật sự GIỮ CHỖ trên lịch, nên hai ca dùng chung một
 * chiếc xe sẽ đụng `EXCLUDE USING gist` và test đỏ vì lý do không liên quan tới thứ đang kiểm.
 */
async function seedVehicle(): Promise<string> {
  const id = newId();
  vehicleSeq += 1;
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      code: `V-DL-${vehicleSeq}`,
      name: `Mazda 3 (${vehicleSeq})`,
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
      weekdayPrice: new Prisma.Decimal('500000'),
      weekendPrice: new Prisma.Decimal('600000'),
    },
  });
  return id;
}

let dayOffset = 0;
/** Khung thuê tương lai, mỗi ca một khoảng riêng. */
function nextWindow(): { pickupAt: string; returnAt: string } {
  dayOffset += 3;
  const pickup = new Date(Date.now() + dayOffset * DAY);
  return {
    pickupAt: pickup.toISOString(),
    returnAt: new Date(pickup.getTime() + 2 * DAY).toISOString(),
  };
}

/** Gửi một yêu cầu thuê qua ĐÚNG đường công khai mà khách đi. */
async function submit(vehicleId: string): Promise<string> {
  const { receipt } = await requests.submitPublic(
    {
      vehicleId,
      customerName: 'Nguyễn Văn A',
      customerPhone: nextPhone(),
      ...nextWindow(),
    },
    null,
  );
  return receipt.id;
}

/**
 * Một yêu cầu dừng ở `pending_host_approval` — chặng mà worker nhắc hạn và cho hết hạn.
 *
 * Từ ADR 0044 đây lại là chặng MẶC ĐỊNH của mọi yêu cầu vừa gửi: chưa ai duyệt thì chưa thu
 * tiền và chưa giữ chỗ. `submit()` ở trên đi qua đúng đường đó; helper này dựng thẳng bản ghi
 * để gắn thêm một TÀI KHOẢN khách — thông báo phía khách là một phần của luật mà spec này kiểm,
 * và đường public tạo tài khoản theo SĐT thì không kiểm soát được id.
 */
async function submitPendingApproval(vehicleId: string): Promise<string> {
  const id = newId();
  const window = nextWindow();
  // Khách CÓ tài khoản: thông báo phía khách là một phần của luật mà spec này kiểm.
  const customerId = newId();
  await prisma.user.create({
    data: {
      id: customerId,
      displayName: 'Khách hạn',
      email: `dl-${customerId}@xeprime.test`,
    },
  });
  await prisma.bookingRequest.create({
    data: {
      id,
      tenantId,
      vehicleId,
      status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      customerName: 'Nguyễn Văn A',
      customerPhone: nextPhone(),
      customerUserId: customerId,
      pickupAt: new Date(window.pickupAt),
      returnAt: new Date(window.returnAt),
      respondBy: bookingRequestRespondBy(new Date()),
    },
  });
  return id;
}

/** Đẩy hạn phản hồi của một yêu cầu về quá khứ — mô phỏng thời gian trôi mà không phải chờ. */
const setRespondBy = (id: string, at: Date) =>
  prisma.bookingRequest.update({ where: { id }, data: { respondBy: at } });

const countOccupancyFor = (vehicleId: string) =>
  prisma.vehicleOccupancy.count({ where: { vehicleId } });

const notificationsOfType = (type: string, targetId: string) =>
  prisma.notification.count({ where: { type, targetId } });

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
  guestUserId = newId();
  tenantId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ shop', email: `owner-${ownerId}@xeprime.test` },
      { id: guestUserId, displayName: 'Khách vãng lai', email: `g-${guestUserId}@xeprime.test` },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEST-${tenantId.slice(-8)}`,
      slug: `test-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Shop hạn phản hồi',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await giveTenantPlan(prisma, tenantId, { billingMode: BILLING_MODE.PACKAGE });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.notification.deleteMany({ where: { userId: { in: [ownerId, guestUserId] } } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, guestUserId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Gửi yêu cầu: hạn 60 phút, CHƯA giữ chỗ (ADR 0044)', () => {
  maybe('respondBy = createdAt + 60 phút, do server đặt', async () => {
    const vehicleId = await seedVehicle();
    const id = await submit(vehicleId);

    const row = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id },
      select: { createdAt: true, respondBy: true, status: true },
    });

    expect(row.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    // So theo PHÚT: `created_at` do DB đặt còn `respond_by` do Node tính, hai đồng hồ lệch nhau
    // vài mili-giây là chuyện bình thường và không phải thứ test này nói về.
    const gapMinutes = (row.respondBy.getTime() - row.createdAt.getTime()) / MINUTE;
    expect(Math.round(gapMinutes)).toBe(BOOKING_REQUEST_RESPOND_WINDOW_MINUTES);
  });

  /**
   * ⚠️ BẤT BIẾN GỐC CỦA ADR 0006, được ADR 0044 trả lại sau một vòng qua ADR 0039.
   *
   * "Chờ chủ xe trả lời" KHÔNG phải "đã giữ xe": chưa ai nhận chuyến thì chưa có chỗ nào thuộc
   * về ai, và nhiều khách được phép cùng hỏi một chiếc xe. Chiếm lịch ở bước này là khoá xe cho
   * một người có thể đã đóng trình duyệt ngay sau khi bấm.
   */
  maybe('yêu cầu vừa gửi KHÔNG chiếm lịch và không sinh khoản tiền nào', async () => {
    const vehicleId = await seedVehicle();
    const id = await submit(vehicleId);

    expect(await countOccupancyFor(vehicleId)).toBe(0);
    expect(await prisma.bookingHold.count({ where: { bookingRequestId: id } })).toBe(0);
  });

  /**
   * ĐÚNG MỘT tin "có yêu cầu mới" mỗi lượt gửi.
   *
   * Hai nhánh cùng gửi tin này — nhánh trong transaction ghi yêu cầu, và nhánh sau khi một lượt
   * tự nhận hụt — nên chúng phải LOẠI TRỪ nhau. Trong thời gian ADR 0039 còn hiệu lực chúng
   * không loại trừ: đường "không tự nhận, không có hold" bắn cả hai, và nó hiếm nên không ai
   * thấy. ADR 0044 biến chính đường đó thành mặc định của cả sàn, nên hai tin trùng sẽ là hai
   * tin cho MỌI lượt đặt xe — cách nhanh nhất để người trực học cách bỏ qua thông báo.
   */
  maybe('gửi yêu cầu ⇒ ĐÚNG MỘT tin cho gian hàng, không phải hai', async () => {
    const vehicleId = await seedVehicle();
    const id = await submit(vehicleId);

    expect(await notificationsOfType(NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED, id)).toBe(1);
  });

  maybe('hai khách cùng hỏi một xe: cả hai đều vào hàng chờ, chưa ai mất gì', async () => {
    const vehicleId = await seedVehicle();
    const window = nextWindow();
    const send = (phone: string) =>
      requests.submitPublic(
        { vehicleId, customerName: 'Khách', customerPhone: phone, ...window },
        null,
      );

    const first = await send(nextPhone());
    const second = await send(nextPhone());

    // Không ai bị từ chối ở cửa, và không ai giữ được chỗ trước khi chủ xe quyết định.
    expect(first.receipt.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(second.receipt.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(await countOccupancyFor(vehicleId)).toBe(0);
  });

  /**
   * Chủ xe nhận MỘT trong hai ⇒ người kia được trả lời NGAY (ADR 0044 điều 6).
   *
   * Không có bước này, yêu cầu thua cuộc nằm im tới khi hết hạn phản hồi: khách chờ thêm tới một
   * giờ một câu trả lời đã có sẵn, và gian hàng bị tính một lượt "không phản hồi" cho việc họ
   * không gây ra.
   */
  maybe('nhận một yêu cầu ⇒ các yêu cầu trùng khung giờ được đóng bằng `slot_taken`', async () => {
    const vehicleId = await seedVehicle();
    const window = nextWindow();
    const send = (phone: string) =>
      requests.submitPublic(
        { vehicleId, customerName: 'Khách', customerPhone: phone, ...window },
        null,
      );

    const winner = await send(nextPhone());
    const loser = await send(nextPhone());

    await requests.approve(tenantId, ownerId, winner.receipt.id);

    const closed = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: loser.receipt.id },
      select: { status: true, rejectReason: true, decisionSource: true, decidedBy: true },
    });
    expect(closed.status).toBe(BOOKING_REQUEST_STATUS.SLOT_TAKEN);
    expect(closed.rejectReason).toBeTruthy();
    // Hệ thống đóng, KHÔNG phải một người trong gian hàng — audit và tỉ lệ phản hồi đọc cột này.
    expect(closed.decisionSource).toBe(BOOKING_REQUEST_DECISION_SOURCE.SYSTEM);
    expect(closed.decidedBy).toBeNull();

    // Và chỗ chỉ có MỘT: đúng một bản ghi chiếm lịch, của người thắng.
    expect(await countOccupancyFor(vehicleId)).toBe(1);
  });

  /**
   * Yêu cầu KHÁC KHUNG GIỜ trên cùng chiếc xe không liên quan gì tới lượt duyệt này — đóng nó
   * là cướp mất một chuyến mà gian hàng vẫn nhận được.
   */
  maybe('yêu cầu KHÔNG trùng khung giờ vẫn nằm nguyên trong hàng chờ', async () => {
    const vehicleId = await seedVehicle();
    const first = nextWindow();
    const later = nextWindow();

    const winner = await requests.submitPublic(
      { vehicleId, customerName: 'Khách', customerPhone: nextPhone(), ...first },
      null,
    );
    const other = await requests.submitPublic(
      { vehicleId, customerName: 'Khách', customerPhone: nextPhone(), ...later },
      null,
    );

    await requests.approve(tenantId, ownerId, winner.receipt.id);

    expect(
      (await prisma.bookingRequest.findUniqueOrThrow({ where: { id: other.receipt.id } })).status,
    ).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
  });

  /*
   * NGƯỜI THẮNG KHÔNG TRẢ TIỀN ⇒ chiếc xe rảnh lại. Câu hỏi là: những người thua nên nhận gì?
   *
   * KHÔNG hồi sinh yêu cầu cũ (ADR 0045 điều 6). Hồi sinh là tạo một chuyến mà cả hai bên đã
   * quên, ở một mức giá đã cũ, cho một khung giờ khách có thể đã lấp bằng xe khác — và không ai
   * bấm nút nào để nó xảy ra. Thay vào đó là một LỜI MỜI đặt lại, trỏ vào chiếc XE.
   */
  maybe('hold người thắng hết hạn ⇒ người thua nhận LỜI MỜI đặt lại, không bị hồi sinh', async () => {
    const vehicleId = await seedVehicle();
    const window = nextWindow();
    const winner = await requests.submitPublic(
      { vehicleId, customerName: 'Khách thắng', customerPhone: nextPhone(), ...window },
      null,
    );
    const loser = await requests.submitPublic(
      { vehicleId, customerName: 'Khách thua', customerPhone: nextPhone(), ...window },
      null,
    );
    await requests.approve(tenantId, ownerId, winner.receipt.id);

    const closed = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: loser.receipt.id },
      select: { status: true, customerUserId: true, slotReopenedNotifiedAt: true },
    });
    expect(closed.status).toBe(BOOKING_REQUEST_STATUS.SLOT_TAKEN);
    expect(closed.slotReopenedNotifiedAt).toBeNull();

    // Người thắng để hết hạn — worker nhả chỗ.
    await prisma.bookingHold.updateMany({
      where: { bookingRequestId: winner.receipt.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await sweepBookingHoldExpiry(prisma, new Date());

    expect(await countOccupancyFor(vehicleId)).toBe(0);

    // Yêu cầu thua cuộc VẪN đóng — không có đường nào biến nó thành đơn sau lưng hai bên.
    const after = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: loser.receipt.id },
      select: { status: true, bookingId: true, slotReopenedNotifiedAt: true },
    });
    expect(after.status).toBe(BOOKING_REQUEST_STATUS.SLOT_TAKEN);
    expect(after.bookingId).toBeNull();
    expect(after.slotReopenedNotifiedAt).not.toBeNull();

    // Lời mời trỏ vào CHIẾC XE, để khách gửi một yêu cầu mới ở giá và lịch hiện hành.
    const invite = await prisma.notification.findFirstOrThrow({
      where: {
        userId: closed.customerUserId!,
        type: NOTIFICATION_TYPE.BOOKING_REQUEST_SLOT_REOPENED,
      },
      select: { targetType: true, targetId: true },
    });
    expect(invite.targetType).toBe(NOTIFICATION_TARGET_TYPE.VEHICLE);
    expect(invite.targetId).toBe(vehicleId);
  });

  /*
   * Worker chạy theo nhịp, và một lượt quét có thể lặp lại trên cùng dữ liệu. Chống trùng bằng
   * cột claim `slot_reopened_notified_at` (`updateMany` có điều kiện `null`), không bằng một
   * phép so ở tầng app — hai lượt quét song song sẽ cùng đọc "chưa gửi".
   */
  maybe('lời mời chỉ gửi MỘT lần, dù worker quét lại', async () => {
    const vehicleId = await seedVehicle();
    const window = nextWindow();
    const winner = await requests.submitPublic(
      { vehicleId, customerName: 'Khách thắng', customerPhone: nextPhone(), ...window },
      null,
    );
    // Người thua không cần giữ id: bài test này đếm LỜI MỜI theo chiếc xe, không theo yêu cầu.
    await requests.submitPublic(
      { vehicleId, customerName: 'Khách thua', customerPhone: nextPhone(), ...window },
      null,
    );
    await requests.approve(tenantId, ownerId, winner.receipt.id);
    await prisma.bookingHold.updateMany({
      where: { bookingRequestId: winner.receipt.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await sweepBookingHoldExpiry(prisma, new Date());
    await sweepBookingHoldExpiry(prisma, new Date());

    /*
     * Đếm theo CHIẾC XE, không theo người nhận: cả spec dùng chung một tài khoản khách vãng lai
     * (`guestUserId`), nên đếm theo `userId` sẽ gộp cả lời mời của những bài test trước. Xe thì
     * mỗi bài một chiếc — và `targetId` của lời mời chính là chiếc xe đó.
     */
    expect(
      await prisma.notification.count({
        where: {
          type: NOTIFICATION_TYPE.BOOKING_REQUEST_SLOT_REOPENED,
          targetType: NOTIFICATION_TARGET_TYPE.VEHICLE,
          targetId: vehicleId,
        },
      }),
    ).toBe(1);
  });
});

describe('Duyệt & giữ xe', () => {
  maybe('duyệt rồi trả tiền → đơn reserved + occupancy, yêu cầu thành converted_to_booking', async () => {
    const vehicleId = await seedVehicle();
    const id = await submit(vehicleId);

    /*
     * Duyệt trước, tiền sau (ADR 0044 điều 2): lượt duyệt chốt lịch và phát QR, còn ĐƠN THUÊ chỉ
     * ra đời khi đối soát xác nhận đã nhận đủ tiền.
     */
    const accepted = await requests.approve(tenantId, ownerId, id);
    expect(accepted.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    expect(accepted.bookingId).toBeNull();

    await payHoldForRequest(asService, holds, id);
    const approved = await requests.getOne(tenantId, id);

    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    expect(approved.bookingId).toBeTruthy();

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: approved.bookingId! },
      select: { status: true },
    });
    // `reserved` = "Đã giữ xe" (ADR 0005) — và chỗ trên lịch chỉ xuất hiện Ở ĐÂY.
    expect(booking.status).toBe(BOOKING_STATUS.RESERVED);
    expect(await countOccupancyFor(vehicleId)).toBe(1);

    const occ = await prisma.vehicleOccupancy.findFirstOrThrow({
      where: { vehicleId },
      select: { sourceType: true, sourceId: true },
    });
    expect(occ.sourceType).toBe(OCCUPANCY_SOURCE_TYPE.BOOKING);
    expect(occ.sourceId).toBe(approved.bookingId);
  });

  /**
   * Cửa quá hạn phải đóng NGAY cả khi worker chưa chạy — đây chính là cửa sổ mà một endpoint
   * chỉ nhìn cột `status` sẽ để lọt.
   */
  maybe('quá hạn → 409 BOOKING_REQUEST_EXPIRED, không tạo đơn, không giữ lịch', async () => {
    const vehicleId = await seedVehicle();
    const id = await submitPendingApproval(vehicleId);
    await setRespondBy(id, new Date(Date.now() - MINUTE));

    await expect(requests.approve(tenantId, ownerId, id)).rejects.toMatchObject({
      status: 409,
      response: { code: API_ERROR_CODE.BOOKING_REQUEST_EXPIRED },
    });

    const after = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id },
      select: { status: true, bookingId: true },
    });
    // Vẫn `pending` vì worker chưa chạy — nhưng đã không duyệt được. Đó là điều đang khoá.
    expect(after.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(after.bookingId).toBeNull();
    expect(await countOccupancyFor(vehicleId)).toBe(0);
    expect(await prisma.booking.count({ where: { vehicleId } })).toBe(0);
  });

  maybe('quá hạn → cũng không TỪ CHỐI được nữa', async () => {
    const vehicleId = await seedVehicle();
    const id = await submitPendingApproval(vehicleId);
    await setRespondBy(id, new Date(Date.now() - MINUTE));

    await expect(requests.reject(tenantId, ownerId, id, 'Hết xe')).rejects.toMatchObject({
      status: 409,
      response: { code: API_ERROR_CODE.BOOKING_REQUEST_EXPIRED },
    });
  });
});

describe('Worker — nhắc và hết hạn', () => {
  maybe('nhắc lần 1 chỉ gửi MỘT lần dù quét bao nhiêu lượt', async () => {
    const vehicleId = await seedVehicle();
    const id = await submitPendingApproval(vehicleId);
    // Còn đúng 40 phút = đã qua mốc nhắc lần 1 (phút 20), chưa tới mốc lần 2 (phút 45).
    await setRespondBy(id, new Date(Date.now() + 40 * MINUTE));

    await sweepBookingRequestDeadlines(prisma);
    await sweepBookingRequestDeadlines(prisma);

    /*
     * Khẳng định trên CHÍNH yêu cầu này, không trên bộ đếm tổng của lượt quét: database dev
     * dùng chung với các spec khác và với seed, nên `result.firstReminders` là một con số của
     * cả hệ — bám vào nó là viết một test đỏ theo thứ tự chạy.
     */
    expect(await notificationsOfType(NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRING, id)).toBe(1);
    const reminded = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(reminded.firstRemindedAt).not.toBeNull();
    expect(reminded.finalRemindedAt).toBeNull();
  });

  maybe('nhắc lần 2 ở mốc còn 15 phút, và cũng chỉ một lần', async () => {
    const vehicleId = await seedVehicle();
    const id = await submitPendingApproval(vehicleId);
    const remaining =
      BOOKING_REQUEST_RESPOND_WINDOW_MINUTES - BOOKING_REQUEST_REMINDER_MINUTES.FINAL;
    await setRespondBy(id, new Date(Date.now() + (remaining - 1) * MINUTE));

    await sweepBookingRequestDeadlines(prisma);
    await sweepBookingRequestDeadlines(prisma);

    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    // Một lượt bắt CẢ HAI mốc (yêu cầu đã trôi qua cả hai), nhưng mỗi mốc đúng một tin.
    expect(row.firstRemindedAt).not.toBeNull();
    expect(row.finalRemindedAt).not.toBeNull();
    expect(await notificationsOfType(NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRING, id)).toBe(2);
  });

  maybe('hết hạn → expired + audit system + báo cả gian hàng lẫn khách', async () => {
    const vehicleId = await seedVehicle();
    const id = await submitPendingApproval(vehicleId);
    await setRespondBy(id, new Date(Date.now() - MINUTE));

    await sweepBookingRequestDeadlines(prisma);

    const row = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id },
      select: { status: true, customerUserId: true },
    });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.EXPIRED);
    // Không có gì để nhả: yêu cầu chờ duyệt chưa bao giờ chiếm lịch.
    expect(await countOccupancyFor(vehicleId)).toBe(0);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { targetType: 'booking_request', targetId: id, action: 'booking_request.expire' },
    });
    expect(log.actorScope).toBe(AUDIT_ACTOR_SCOPE.SYSTEM);
    expect(log.actorUserId).toBeNull();
    expect(log.afterJson).toMatchObject({ status: BOOKING_REQUEST_STATUS.EXPIRED });

    // Hai người nhận: chủ gian hàng (thành viên) và khách (tài khoản gắn với yêu cầu).
    expect(await notificationsOfType(NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRED, id)).toBe(2);
  });

  maybe('chạy lại không expire lần hai và không gửi thêm thông báo', async () => {
    const vehicleId = await seedVehicle();
    const id = await submitPendingApproval(vehicleId);
    await setRespondBy(id, new Date(Date.now() - MINUTE));

    await sweepBookingRequestDeadlines(prisma);
    await sweepBookingRequestDeadlines(prisma);

    // Vẫn đúng hai tin (một cho gian hàng, một cho khách) — lượt hai không sinh thêm gì.
    expect(await notificationsOfType(NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRED, id)).toBe(2);
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.EXPIRED);
  });

  maybe('yêu cầu còn hạn không bị đụng tới', async () => {
    const vehicleId = await seedVehicle();
    const id = await submitPendingApproval(vehicleId);

    await sweepBookingRequestDeadlines(prisma);

    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(row.firstRemindedAt).toBeNull();
  });
});

describe('Đua giữa Duyệt & giữ xe và worker', () => {
  /**
   * Hai bên cùng nhắm một yêu cầu đã quá hạn trong gang tấc. Cả hai đều ghi bằng `UPDATE` có
   * điều kiện `status = pending`, nên Postgres tuần tự hoá chúng và đúng MỘT bên khớp.
   *
   * Kết cục lai bị cấm: một yêu cầu `expired` mà vẫn có `booking_id`, hoặc một đơn `reserved`
   * đang giữ chỗ trong khi khách đã được báo là gian hàng không phản hồi.
   */
  maybe('chỉ một bên thắng, không có kết cục lai', async () => {
    const vehicleId = await seedVehicle();
    const id = await submitPendingApproval(vehicleId);
    // Còn đúng một khoảnh khắc — đủ để `approve` đọc thấy "còn hạn" rồi mới ghi.
    await setRespondBy(id, new Date(Date.now() + 40));

    const [approveResult] = await Promise.allSettled([
      requests.approve(tenantId, ownerId, id),
      (async () => {
        // Nhường một nhịp event loop rồi quét bằng mốc "sau hạn" — hai lệnh ghi thật sự đua nhau.
        await new Promise((resolve) => setTimeout(resolve, 20));
        return sweepBookingRequestDeadlines(prisma, new Date(Date.now() + 5 * MINUTE));
      })(),
    ]);

    const row = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id },
      select: { status: true, bookingId: true },
    });

    const approved = approveResult.status === 'fulfilled';

    /*
     * Kết cục đọc từ chính BẢN GHI, không từ bộ đếm của lượt quét (bộ đếm đó tính cả yêu cầu
     * của spec khác trên cùng database dev). Hai vế dưới đây loại trừ nhau tuyệt đối, nên chỉ
     * cần chúng khớp nhau là đủ để nói "đúng một bên thắng".
     */
    /*
     * Bên duyệt thắng ⇒ CHỜ TIỀN, chưa phải đơn thuê: cả sàn thu tiền giữ chỗ từ 16/09/2026, nên
     * lượt duyệt chốt lịch và phát QR chứ không mở đơn (ADR 0044 điều 2).
     */
    expect(row.status).toBe(
      approved ? BOOKING_REQUEST_STATUS.AWAITING_HOLD : BOOKING_REQUEST_STATUS.EXPIRED,
    );

    if (approved) {
      expect(row.bookingId).toBeNull();
      // Chỗ vẫn bị giữ — chỉ là giữ bởi YÊU CẦU đang chờ tiền, chưa phải bởi một đơn.
      expect(await countOccupancyFor(vehicleId)).toBe(1);
    } else {
      expect(row.status).toBe(BOOKING_REQUEST_STATUS.EXPIRED);
      expect(row.bookingId).toBeNull();
      // Đơn và chỗ giữ lịch của lần duyệt hỏng phải cùng biến mất (transaction quay đầu).
      expect(await countOccupancyFor(vehicleId)).toBe(0);
      expect(await prisma.booking.count({ where: { vehicleId } })).toBe(0);
    }
  });

  maybe('worker thắng rồi thì duyệt sau đó luôn bị từ chối', async () => {
    const vehicleId = await seedVehicle();
    const id = await submitPendingApproval(vehicleId);
    await setRespondBy(id, new Date(Date.now() - MINUTE));
    await sweepBookingRequestDeadlines(prisma);

    await expect(requests.approve(tenantId, ownerId, id)).rejects.toMatchObject({ status: 409 });
    expect(await countOccupancyFor(vehicleId)).toBe(0);
  });
});
