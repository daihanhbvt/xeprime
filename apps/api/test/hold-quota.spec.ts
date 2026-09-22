import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  BOOKING_REQUEST_STATUS,
  CANCELLATION_REASON_CATEGORY,
  HOLD_MAX_OPEN_PER_CUSTOMER,
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
import { releaseWalletObligations } from './helpers/wallet-cleanup';
import { makeBookingRequestsService, makeNotificationService } from './helpers/service-factory';

/**
 * TRẦN SỐ CHỖ CHƯA THANH TOÁN của một khách — trên PostgreSQL THẬT (ADR 0045 điều 6).
 *
 * ADR 0044 thu hẹp bề mặt phá hoại này rất nhiều: hold chỉ sinh ra SAU khi một con người ở gian
 * hàng (hoặc thiết lập "Đặt ngay" của chính họ) đã nhận chuyến, nên không ai khoá được ba chiếc
 * xe chỉ bằng ba lượt bấm. Nhưng cửa sổ nay dài **hai giờ** thay vì mười phút, nên một khách
 * được nhận nhiều chuyến rồi chỉ trả tiền cho một chuyến vẫn giữ những chiếc còn lại khỏi chợ
 * suốt hai giờ — và chi phí đó rơi vào chủ xe.
 *
 * Ba điều được khoá:
 *
 *  1. Trần áp Ở SERVER, trong chính transaction tạo hold — không phải một phép kiểm ở client.
 *  2. Nó **an toàn dưới đồng thời**: hai lượt duyệt song song cho cùng một khách không cùng đọc
 *     "đang có 2" rồi cùng ghi thành 3. Khoá là `pg_advisory_xact_lock`.
 *  3. Nó chặn việc MỞ thêm chỗ, KHÔNG chặn việc đóng chỗ đang có — quyền huỷ và quyền hoàn của
 *     khách không bị đụng tới.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test -- test/hold-quota.spec.ts
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const occupancy = new OccupancyService(asService);
const settings = new VehicleSettingsService(asService, audit, occupancy);

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
let customerUserId: string;
let tenantId: string;
/** Mỗi chuyến một CHIẾC XE riêng — trần là về KHÁCH, không phải về lịch của một chiếc xe. */
let vehicleIds: string[] = [];
let phoneCounter = 0;
const nextPhone = () => `0922${String(100000 + ++phoneCounter).slice(-6)}`;

function vnAt(offsetDays: number, hourVn: number): Date {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(hourVn - 7, 0, 0, 0);
  return base;
}

/** Gửi yêu cầu cho xe thứ `index` — KHÔNG duyệt. */
async function submit(index: number): Promise<string> {
  const res = await requests.submitPublic(
    {
      vehicleId: vehicleIds[index]!,
      customerName: 'Nguyễn Văn A',
      customerPhone: nextPhone(),
      pickupAt: vnAt(6 + index, 9).toISOString(),
      returnAt: vnAt(8 + index, 9).toISOString(),
    },
    customerUserId,
  );
  return res.receipt.id;
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

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ xe', email: `hq-own-${RUN}@xeprime.test` },
      { id: customerUserId, displayName: 'Khách', email: `hq-cus-${RUN}@xeprime.test` },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `QuotaShop-${RUN}`,
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

  // Một xe nhiều hơn trần — đủ để chứng minh chiếc thứ `limit + 1` bị chặn.
  vehicleIds = Array.from({ length: HOLD_MAX_OPEN_PER_CUSTOMER + 1 }, () => newId());
  await prisma.vehicle.createMany({
    data: vehicleIds.map((id, i) => ({
      id,
      tenantId,
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

describe('Trần chỗ chưa thanh toán (ADR 0045 điều 6)', () => {
  maybe('đúng trần thì còn nhận được; vượt trần thì HOLD_LIMIT_REACHED', async () => {
    for (let i = 0; i < HOLD_MAX_OPEN_PER_CUSTOMER; i += 1) {
      const id = await submit(i);
      await requests.approve(tenantId, ownerId, id, {});
    }
    expect(await prisma.bookingHold.count({ where: { customerUserId } })).toBe(
      HOLD_MAX_OPEN_PER_CUSTOMER,
    );

    const overflow = await submit(HOLD_MAX_OPEN_PER_CUSTOMER);
    await expect(requests.approve(tenantId, ownerId, overflow, {})).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.HOLD_LIMIT_REACHED,
        details: { openHolds: HOLD_MAX_OPEN_PER_CUSTOMER, limit: HOLD_MAX_OPEN_PER_CUSTOMER },
      },
    });

    /*
     * Lượt duyệt hỏng phải quay đầu TRỌN VẸN: không hold thứ tư, không vệt bận trên lịch, và
     * yêu cầu vẫn ở nguyên chỗ cũ để gian hàng quyết lại sau. Một phần việc sót lại ở đây là
     * một chiếc xe bị khoá bởi một lượt duyệt chưa bao giờ thành công.
     */
    expect(await prisma.bookingHold.count({ where: { customerUserId } })).toBe(
      HOLD_MAX_OPEN_PER_CUSTOMER,
    );
    expect(
      await prisma.vehicleOccupancy.count({
        where: { vehicleId: vehicleIds[HOLD_MAX_OPEN_PER_CUSTOMER] },
      }),
    ).toBe(0);
    const stillPending = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: overflow },
    });
    expect(stillPending.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
  });

  /*
   * Trần chặn việc MỞ thêm chỗ, không chặn việc ĐÓNG chỗ đang có. Nếu nó làm khách kẹt cứng —
   * không nhận thêm được, và cũng không thoát ra được — thì nó đã biến một biện pháp chống lạm
   * dụng thành một cái bẫy.
   */
  maybe('huỷ bớt một chỗ là mở lại được một suất — trần không khoá khách lại', async () => {
    const ids: string[] = [];
    for (let i = 0; i < HOLD_MAX_OPEN_PER_CUSTOMER; i += 1) {
      const id = await submit(i);
      await requests.approve(tenantId, ownerId, id, {});
      ids.push(id);
    }

    await requests.cancelByHost(tenantId, ownerId, ids[0]!, {
      reasonCategory: CANCELLATION_REASON_CATEGORY.VEHICLE_UNAVAILABLE,
      reason: 'Xe vừa hỏng.',
    });

    const again = await submit(HOLD_MAX_OPEN_PER_CUSTOMER);
    const accepted = await requests.approve(tenantId, ownerId, again, {});
    expect(accepted.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
  });

  /*
   * ĐỒNG THỜI. Không có `pg_advisory_xact_lock`, hai lượt duyệt song song cùng đọc "đang có
   * limit − 1" rồi cùng ghi — và khách kết thúc với `limit + 1` chỗ. Đây là lý do phép kiểm
   * phải nằm TRONG transaction sau một khoá, chứ không phải một câu `count` đọc trước.
   */
  maybe('hai lượt duyệt SONG SONG không vượt được trần', async () => {
    for (let i = 0; i < HOLD_MAX_OPEN_PER_CUSTOMER - 1; i += 1) {
      const id = await submit(i);
      await requests.approve(tenantId, ownerId, id, {});
    }

    const a = await submit(HOLD_MAX_OPEN_PER_CUSTOMER - 1);
    const b = await submit(HOLD_MAX_OPEN_PER_CUSTOMER);
    const results = await Promise.allSettled([
      requests.approve(tenantId, ownerId, a, {}),
      requests.approve(tenantId, ownerId, b, {}),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({
      response: { code: API_ERROR_CODE.HOLD_LIMIT_REACHED },
    });

    expect(await prisma.bookingHold.count({ where: { customerUserId } })).toBe(
      HOLD_MAX_OPEN_PER_CUSTOMER,
    );
  });

  /*
   * Một hold đã quá mốc nhưng worker chưa kịp lật vẫn là một chỗ CHẾT. Tính nó vào trần là chặn
   * một khách xui bằng chính những chỗ họ đã mất — và họ không có cách nào tự gỡ.
   */
  maybe('hold đã quá hạn (worker chưa kịp lật) KHÔNG tính vào trần', async () => {
    for (let i = 0; i < HOLD_MAX_OPEN_PER_CUSTOMER; i += 1) {
      const id = await submit(i);
      await requests.approve(tenantId, ownerId, id, {});
    }
    // Đẩy một hold về quá khứ mà KHÔNG đụng tới `status` — đúng hình dạng khi worker đang trễ.
    const stale = await prisma.bookingHold.findFirstOrThrow({ where: { customerUserId } });
    await prisma.bookingHold.update({
      where: { id: stale.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const again = await submit(HOLD_MAX_OPEN_PER_CUSTOMER);
    const accepted = await requests.approve(tenantId, ownerId, again, {});
    expect(accepted.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
  });
});
