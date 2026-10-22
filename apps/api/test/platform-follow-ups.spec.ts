import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  CANCELLATION_PARTY,
  CANCELLATION_REASON_CATEGORY,
  CANCELLATION_STAGE,
  MEMBERSHIP_STATUS,
  PLATFORM_ROLE,
  FOLLOW_UP_LOST_REASON,
  FOLLOW_UP_STATUS,
  TENANT_STATUS,
  USER_STATUS,
  VEHICLE_TYPE,
  bookingRequestRespondBy,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { PlatformFollowUpsService } from '../src/modules/platform-admin/platform-follow-ups.service';
import { RbacService } from '../src/modules/rbac/rbac.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tab "Cần chăm sóc" (ADR 0070), chạy trên PostgreSQL THẬT: phân loại lý do mất đơn, lọc trạng
 * thái chăm sóc, ghi kết quả + audit, và không bao giờ trả yêu cầu còn sống.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = new PlatformFollowUpsService(
  asService,
  new AuditService(asService),
  new RbacService(asService),
);

let dbAvailable = false;
let tag: string;
let tenantId: string;
let vehicleId: string;
let ownerId: string;
let customerId: string;
let saleId: string;
let partnerId: string;
let reviewerId: string;
const req: Record<string, string> = {};

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }
  tenantId = newId();
  vehicleId = newId();
  ownerId = newId();
  customerId = newId();
  saleId = newId();
  partnerId = newId();
  reviewerId = newId();
  tag = tenantId.slice(-6);

  await prisma.user.createMany({
    data: [
      {
        id: ownerId,
        realm: ACCOUNT_REALM.PARTNER,
        displayName: `Owner-${tag}`,
        email: `o-${tag}@xeprime.test`,
      },
      { id: customerId, realm: ACCOUNT_REALM.CUSTOMER, displayName: `Khach-${tag}` },
      {
        id: saleId,
        realm: ACCOUNT_REALM.PLATFORM,
        displayName: `Sale-${tag}`,
        email: `s-${tag}@xeprime.test`,
        status: USER_STATUS.ACTIVE,
      },
      {
        id: reviewerId,
        realm: ACCOUNT_REALM.PLATFORM,
        displayName: `Rv-${tag}`,
        email: `rv-${tag}@xeprime.test`,
        status: USER_STATUS.ACTIVE,
      },
      {
        id: partnerId,
        realm: ACCOUNT_REALM.PARTNER,
        displayName: `P-${tag}`,
        email: `p-${tag}@xeprime.test`,
      },
    ],
  });
  // Sale có vai `support` (có quyền chăm sóc khách); reviewer thì không.
  await prisma.platformMembership.createMany({
    data: [
      {
        id: newId(),
        userId: saleId,
        roleKey: PLATFORM_ROLE.SUPPORT,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      {
        id: newId(),
        userId: reviewerId,
        roleKey: PLATFORM_ROLE.REVIEWER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `FuShop-${tag}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE-${tag}`,
      name: `Xe-${tag}`,
      vehicleType: VEHICLE_TYPE.CAR,
    },
  });

  const mkRequest = async (
    key: string,
    status: string,
    extra: { bookingStatus?: string; party?: string; createdAt?: Date } = {},
  ) => {
    const id = newId();
    let bookingId: string | undefined;
    if (extra.bookingStatus) {
      bookingId = newId();
      await prisma.booking.create({
        data: {
          id: bookingId,
          tenantId,
          vehicleId,
          code: `FU-${key}-${tag}`.toUpperCase(),
          customerName: `Khach-${tag}`,
          status: extra.bookingStatus,
          pickupAt: new Date(Date.UTC(2026, 10, 1, 3)),
          returnAt: new Date(Date.UTC(2026, 10, 3, 3)),
        },
      });
    }
    await prisma.bookingRequest.create({
      data: {
        id,
        tenantId,
        vehicleId,
        respondBy: bookingRequestRespondBy(new Date()),
        customerUserId: customerId,
        customerName: `Khach-${tag}`,
        customerPhone: '0912345678',
        status,
        bookingId,
        ...(status === BOOKING_REQUEST_STATUS.HOLD_EXPIRED ||
        status === BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING
          ? { decidedAt: new Date() }
          : {}),
        ...(extra.createdAt ? { createdAt: extra.createdAt } : {}),
        pickupAt: new Date(Date.UTC(2026, 10, 1, 3)),
        returnAt: new Date(Date.UTC(2026, 10, 3, 3)),
      },
    });
    if (extra.party) {
      await prisma.bookingCancellation.create({
        data: {
          id: newId(),
          tenantId,
          bookingRequestId: id,
          bookingId,
          responsibleParty: extra.party,
          reasonCategory: CANCELLATION_REASON_CATEGORY.SCHEDULE_CONFLICT,
          stage: CANCELLATION_STAGE.BOOKING_BEFORE_PICKUP,
          actorScope: AUDIT_ACTOR_SCOPE.SYSTEM,
          countsAgainstHost: extra.party === CANCELLATION_PARTY.HOST,
        },
      });
    }
    req[key] = id;
  };

  const old = new Date(Date.now() - 10 * 86_400_000);
  await mkRequest('customerCancel', BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER, {
    createdAt: old,
  });
  await mkRequest('unpaid', BOOKING_REQUEST_STATUS.HOLD_EXPIRED, { createdAt: old });
  await mkRequest('noResponse', BOOKING_REQUEST_STATUS.EXPIRED, { createdAt: old });
  await mkRequest('hostBookingCancel', BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING, {
    bookingStatus: BOOKING_STATUS.CANCELLED,
    party: CANCELLATION_PARTY.HOST,
    createdAt: old,
  });
  await mkRequest('pending', BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
  // Đơn đặt lại SAU — khách đã quay lại.
  await mkRequest('rebook', BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING, {
    bookingStatus: BOOKING_STATUS.RESERVED,
  });
});

afterAll(async () => {
  if (dbAvailable) {
    const ids = Object.values(req);
    await prisma.auditLog.deleteMany({ where: { targetId: { in: ids } } });
    await prisma.salesFollowUp.deleteMany({ where: { bookingRequestId: { in: ids } } });
    await prisma.bookingCancellation.deleteMany({ where: { tenantId } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.platformMembership.deleteMany({ where: { userId: { in: [saleId, reviewerId] } } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, customerId, saleId, partnerId, reviewerId] } },
    });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const listMine = async (extra: Record<string, unknown> = {}) =>
  (await service.list({ q: `Khach-${tag}`, limit: 100, ...extra }, saleId)).data;

describe('Cần chăm sóc (ADR 0070)', () => {
  maybe('chỉ yêu cầu đã mất; đúng lý do; SĐT đã che; biết khách đã đặt lại', async () => {
    const rows = await listMine();
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.has(req.pending!)).toBe(false);
    expect(byId.has(req.rebook!)).toBe(false);
    expect(byId.get(req.customerCancel!)?.lostReason).toBe(
      FOLLOW_UP_LOST_REASON.CUSTOMER_CANCELLED,
    );
    expect(byId.get(req.unpaid!)?.lostReason).toBe(FOLLOW_UP_LOST_REASON.UNPAID);
    expect(byId.get(req.noResponse!)?.lostReason).toBe(FOLLOW_UP_LOST_REASON.NO_RESPONSE);
    expect(byId.get(req.hostBookingCancel!)).toMatchObject({
      lostReason: FOLLOW_UP_LOST_REASON.HOST_DECLINED,
      cancellation: { responsibleParty: CANCELLATION_PARTY.HOST },
    });
    expect(byId.get(req.unpaid!)).toMatchObject({
      customerPhoneMasked: '091****678',
      rebookedLater: true,
      followUpStatus: FOLLOW_UP_STATUS.NEW,
    });
    expect(JSON.stringify(rows)).not.toContain('0912345678');
  });

  maybe('lọc theo lý do — gồm cả đơn đã có rồi bị huỷ', async () => {
    const host = await listMine({ reason: FOLLOW_UP_LOST_REASON.HOST_DECLINED });
    expect(host.map((r) => r.id)).toEqual([req.hostBookingCancel]);
    const unpaid = await listMine({ reason: FOLLOW_UP_LOST_REASON.UNPAID });
    expect(unpaid.map((r) => r.id)).toEqual([req.unpaid]);
  });

  maybe('ghi chăm sóc ⇒ một dòng, audit mỗi lần, lọc theo trạng thái và "của tôi"', async () => {
    const updated = await service.update(req.unpaid!, saleId, {
      status: FOLLOW_UP_STATUS.CONTACTED,
      note: 'Khách hẹn mai chuyển',
      assigneeUserId: saleId,
      markContacted: true,
    });
    expect(updated).toMatchObject({
      followUpStatus: FOLLOW_UP_STATUS.CONTACTED,
      note: 'Khách hẹn mai chuyển',
      assigneeName: `Sale-${tag}`,
      followUpUpdatedByName: `Sale-${tag}`,
    });
    expect(updated.lastContactedAt).not.toBeNull();

    // "Đã gọi" là trạng thái: tích lại giữ NGUYÊN mốc cũ, bỏ tích thì xoá, bỏ trống thì không đổi.
    const again = await service.update(req.unpaid!, saleId, {
      status: FOLLOW_UP_STATUS.CONTACTED,
      markContacted: true,
    });
    expect(again.lastContactedAt).toBe(updated.lastContactedAt);
    const cleared = await service.update(req.unpaid!, saleId, {
      status: FOLLOW_UP_STATUS.CONTACTED,
      markContacted: false,
    });
    expect(cleared.lastContactedAt).toBeNull();

    await service.update(req.unpaid!, saleId, { status: FOLLOW_UP_STATUS.REBOOKED });
    expect(await prisma.salesFollowUp.count({ where: { bookingRequestId: req.unpaid } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { targetId: req.unpaid, action: 'booking_request.follow_up' },
      }),
    ).toBe(4);

    const rebooked = await listMine({ followUpStatus: FOLLOW_UP_STATUS.REBOOKED });
    expect(rebooked.map((r) => r.id)).toEqual([req.unpaid]);
    const fresh = await listMine({ followUpStatus: FOLLOW_UP_STATUS.NEW });
    expect(fresh.map((r) => r.id)).not.toContain(req.unpaid);
    const mine = await listMine({ mine: true });
    expect(mine.map((r) => r.id)).toEqual([req.unpaid]);
  });

  maybe('không ghi lên yêu cầu còn sống; người phụ trách phải là nhân sự nền tảng', async () => {
    await expect(
      service.update(req.pending!, saleId, { status: FOLLOW_UP_STATUS.CONTACTED }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.update(req.noResponse!, saleId, {
        status: FOLLOW_UP_STATUS.CONTACTED,
        assigneeUserId: partnerId,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.VALIDATION_FAILED }),
    });
  });

  maybe('phụ trách: chỉ nhân sự có quyền chăm sóc khách — reviewer bị loại', async () => {
    const ids = (await service.listAssignees()).map((a) => a.id);
    expect(ids).toContain(saleId);
    expect(ids).not.toContain(reviewerId);
    expect(ids).not.toContain(partnerId);
    await expect(
      service.update(req.noResponse!, saleId, {
        status: FOLLOW_UP_STATUS.CONTACTED,
        assigneeUserId: reviewerId,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.VALIDATION_FAILED }),
    });
  });

  maybe('xem SĐT đầy đủ ⇒ ghi audit, không chép PII vào log', async () => {
    const contact = await service.revealContact(req.customerCancel!, saleId);
    expect(contact.customerPhone).toBe('0912345678');
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { targetId: req.customerCancel, action: 'booking_request.contact_reveal' },
    });
    expect(JSON.stringify(log)).not.toContain('0912345678');
  });
});
