import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BILLING_MODE,
  BOOKING_REQUEST_STATUS,
  CANCELLATION_REASON_CATEGORY,
  HOLD_HOST_REMINDER_COOLDOWN_MINUTES,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TYPE,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { normalizePhone } from '../src/common/phone';
import { AuditService } from '../src/modules/audit/audit.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { VehicleSettingsService } from '../src/modules/vehicle-settings/vehicle-settings.service';
import { TenantRentalTermsService } from '../src/modules/vehicle-settings/tenant-rental-terms.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { giveTenantPlan } from './helpers/billing-fixture';
import { releaseWalletObligations } from './helpers/wallet-cleanup';
import {
  makeBookingRequestsService,
  makeDriversService,
  makeNotificationService,
} from './helpers/service-factory';

/**
 * NÚT "NHẮC KHÁCH" — trên PostgreSQL THẬT (05/11/2026).
 *
 * Lời nhắc là một tin gửi tới điện thoại người thật, nên spec khoá đúng chỗ dễ thành spam: khoảng
 * lặng tính từ lời nhắc GẦN NHẤT khách nhận (lúc có khoản giữ chỗ, lượt nhắc của worker, lượt bấm
 * trước), hai lượt bấm song song chỉ ra MỘT tin, và chuyến không còn chờ thanh toán thì không nhắc.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test -- test/payment-reminder.spec.ts
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const occupancy = new OccupancyService(asService);
const settings = new VehicleSettingsService(
  asService,
  audit,
  occupancy,
  new ListingsService(asService),
  makeDriversService(asService),
    new TenantRentalTermsService(asService, audit),
);
const requests = makeBookingRequestsService(asService, { audit, notifications, occupancy, settings });

const RUN = newId().slice(-8).toLowerCase();
const CUSTOMER_PHONE = `0943${String(Date.now()).slice(-6)}`;
const COOLDOWN_MS = HOLD_HOST_REMINDER_COOLDOWN_MINUTES * 60_000;

let dbAvailable = false;
let ownerId: string;
let customerUserId: string;
let tenantId: string;
let vehicleId: string;

function vnAt(offsetDays: number, hourVn: number): Date {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(hourVn - 7, 0, 0, 0);
  return base;
}

/** Gửi + duyệt ⇒ `awaiting_hold` với một hold `pending`. */
async function acceptedRequest(offsetDays = 6): Promise<string> {
  const submitted = await requests.submitPublic(
    {
      vehicleId,
      pickupAt: vnAt(offsetDays, 9).toISOString(),
      returnAt: vnAt(offsetDays + 2, 9).toISOString(),
    },
    customerUserId,
  );
  await requests.approve(tenantId, ownerId, submitted.id, {});
  return submitted.id;
}

/** Dời mốc tạo của khoản giữ chỗ về quá khứ — như thể khách đã nhận QR từ lâu. */
async function ageHold(requestId: string, minutes: number) {
  await prisma.bookingHold.updateMany({
    where: { bookingRequestId: requestId },
    data: { createdAt: new Date(Date.now() - minutes * 60_000) },
  });
}

async function errorOf(promise: Promise<unknown>): Promise<{ code?: string; details?: unknown; status?: number }> {
  try {
    await promise;
  } catch (err) {
    const e = err as { getResponse?: () => { code?: string; details?: unknown }; getStatus?: () => number };
    return { ...(e.getResponse?.() ?? {}), status: e.getStatus?.() };
  }
  throw new Error('Mong một lỗi nhưng lời gọi thành công');
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
  vehicleId = newId();

  await prisma.user.createMany({
    data: [
      {
        realm: ACCOUNT_REALM.PARTNER,
        id: ownerId,
        displayName: 'Chủ xe',
        email: `pr-own-${RUN}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: customerUserId,
        displayName: 'Khách',
        email: `pr-cus-${RUN}@xeprime.test`,
        phone: normalizePhone(CUSTOMER_PHONE),
        phoneVerifiedAt: new Date(),
      },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `RemindShop-${RUN}`,
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
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XR${vehicleId.slice(-5)}`,
      name: 'Xe nhắc khách',
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
      weekdayPrice: new Prisma.Decimal('700000'),
      weekendPrice: new Prisma.Decimal('700000'),
      createdBy: ownerId,
    },
  });
  // Tuyến hoa hồng: lượt duyệt sinh `booking_holds` và dừng ở `awaiting_hold` (xem host-cancellation.spec).
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
    await releaseWalletObligations(prisma, {
      tenantIds: [tenantId],
      userIds: [customerUserId, ownerId],
    });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
    await prisma.vehicleServiceSetting.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
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

const reminders = () =>
  prisma.notification.count({
    where: { tenantId, userId: customerUserId, type: NOTIFICATION_TYPE.HOLD_EXPIRING },
  });

describe('POST /booking-requests/:id/remind-payment', () => {
  maybe('vừa duyệt xong ⇒ 429: khách VỪA nhận QR, mốc mở lại = lúc tạo khoản + khoảng lặng', async () => {
    const id = await acceptedRequest();
    const hold = await prisma.bookingHold.findFirstOrThrow({ where: { bookingRequestId: id } });

    const err = await errorOf(requests.remindPayment(tenantId, ownerId, id));
    expect(err.status).toBe(429);
    expect(err.code).toBe(API_ERROR_CODE.PAYMENT_REMINDER_TOO_SOON);
    expect((err.details as { availableAt: string }).availableAt).toBe(
      new Date(hold.createdAt.getTime() + COOLDOWN_MS).toISOString(),
    );

    // DTO hộp thư nói cùng mốc đó — nút biết lúc nào mở lại mà không phải hỏi.
    const dto = await requests.getOne(tenantId, id);
    expect(dto.paymentReminderAvailableAt).toBe(
      new Date(hold.createdAt.getTime() + COOLDOWN_MS).toISOString(),
    );
    expect(await reminders()).toBe(0);
  });

  maybe('qua khoảng lặng ⇒ gửi MỘT tin + ghi audit; bấm lại ngay ⇒ 429', async () => {
    const id = await acceptedRequest();
    await ageHold(id, HOLD_HOST_REMINDER_COOLDOWN_MINUTES + 5);

    const result = await requests.remindPayment(tenantId, ownerId, id);
    expect(new Date(result.nextAvailableAt).getTime() - new Date(result.remindedAt).getTime()).toBe(
      COOLDOWN_MS,
    );
    expect(await reminders()).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { tenantId, action: 'booking_request.remind_payment', targetId: id },
      }),
    ).toBe(1);
    const hold = await prisma.bookingHold.findFirstOrThrow({ where: { bookingRequestId: id } });
    expect(hold.hostRemindedAt?.toISOString()).toBe(result.remindedAt);

    const again = await errorOf(requests.remindPayment(tenantId, ownerId, id));
    expect(again.code).toBe(API_ERROR_CODE.PAYMENT_REMINDER_TOO_SOON);
    expect(await reminders()).toBe(1);
  });

  maybe('worker vừa nhắc ở mốc "còn 60 phút" ⇒ gian hàng chưa nhắc chồng được', async () => {
    const id = await acceptedRequest();
    await ageHold(id, 60);
    await prisma.bookingHold.updateMany({
      where: { bookingRequestId: id },
      data: { paymentRemindedAt: new Date(Date.now() - 5 * 60_000) },
    });

    const err = await errorOf(requests.remindPayment(tenantId, ownerId, id));
    expect(err.code).toBe(API_ERROR_CODE.PAYMENT_REMINDER_TOO_SOON);
  });

  maybe('hai lượt bấm ĐỒNG THỜI ⇒ đúng một tin đi, lượt kia 429', async () => {
    const id = await acceptedRequest();
    await ageHold(id, HOLD_HOST_REMINDER_COOLDOWN_MINUTES + 5);

    const outcomes = await Promise.allSettled([
      requests.remindPayment(tenantId, ownerId, id),
      requests.remindPayment(tenantId, ownerId, id),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult;
    expect(
      (rejected.reason as { getResponse: () => { code: string } }).getResponse().code,
    ).toBe(API_ERROR_CODE.PAYMENT_REMINDER_TOO_SOON);
    expect(await reminders()).toBe(1);
  });

  maybe('chuyến đã huỷ ⇒ 409 NOT_AVAILABLE, DTO không mời nhắc nữa', async () => {
    const id = await acceptedRequest();
    await ageHold(id, HOLD_HOST_REMINDER_COOLDOWN_MINUTES + 5);
    await requests.cancelByHost(tenantId, ownerId, id, {
      reasonCategory: CANCELLATION_REASON_CATEGORY.VEHICLE_UNAVAILABLE,
      reason: 'Xe hỏng.',
    });

    const err = await errorOf(requests.remindPayment(tenantId, ownerId, id));
    expect(err.status).toBe(409);
    expect(err.code).toBe(API_ERROR_CODE.PAYMENT_REMINDER_NOT_AVAILABLE);
    const dto = await requests.getOne(tenantId, id);
    expect(dto.status).toBe(BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST);
    expect(dto.paymentReminderAvailableAt).toBeNull();
  });

  maybe('yêu cầu của gian hàng KHÁC ⇒ 404 (tenant lấy từ scope, không từ client)', async () => {
    const id = await acceptedRequest();
    const err = await errorOf(requests.remindPayment(newId(), ownerId, id));
    expect(err.status).toBe(404);
  });
});
