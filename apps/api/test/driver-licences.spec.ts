import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BILLING_MODE,
  BOOKING_REQUEST_STATUS,
  DRIVER_LICENCE_DECISION_SOURCE,
  DRIVER_LICENCE_KIND,
  DRIVER_LICENCE_REJECT_REASON,
  DRIVER_LICENCE_STATUS,
  MEMBERSHIP_STATUS,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import type { DriverLicencesService } from '../src/modules/driver-licences/driver-licences.service';
import {
  DriverLicenceReaderError,
  READER_FAILURE,
  type DriverLicenceReader,
  type DriverLicenceReading,
} from '../src/modules/driver-licences/reader/driver-licence-reader';
import type { R2Service } from '../src/modules/storage/r2.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { giveTenantPlan } from './helpers/billing-fixture';
import { customerAccountFor } from './helpers/customer-account';
import { makeBookingRequestsService, makeDriverLicencesService } from './helpers/service-factory';

/**
 * Bằng lái của tài khoản khách (ADR 0057) — trên PostgreSQL THẬT.
 *
 * Kho R2 và bộ đọc ảnh là hai thứ DUY NHẤT được giả (không gọi mạng). Mọi thứ còn lại — partial
 * unique "một bằng đang dùng / một lượt đang dở", CHECK liên cột, FK tổ hợp realm, transaction
 * thay bằng cũ — là của thật, vì chính chúng là bảo đảm của tính năng.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 7, 7]);
const NOT_AN_IMAGE = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0, 1, 1,
]);

/** R2 giả có trạng thái: "PUT" là ghi thẳng vào map. */
const r2Failure = { read: false };
const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
const r2 = {
  privateEnabled: true,
  presignPrivateUpload: async ({ key }: { key: string }) => ({
    uploadUrl: `https://r2.test/${key}`,
    expiresIn: 300,
  }),
  headPrivateObject: async (key: string) => {
    const o = objects.get(key);
    return o ? { size: o.bytes.length, contentType: o.contentType } : null;
  },
  readPrivateObjectPrefix: async (key: string, n: number) =>
    objects.get(key)?.bytes.slice(0, n) ?? null,
  readPrivateObject: async (key: string) => {
    if (r2Failure.read) throw new Error('R2 sập');
    return objects.get(key)?.bytes ?? null;
  },
  deletePrivateObject: async (key: string) => {
    objects.delete(key);
    return true;
  },
  presignPrivateDownload: async (key: string) => ({
    downloadUrl: `https://r2.test/get/${key}`,
    expiresIn: 120,
  }),
} as unknown as R2Service;

/** Bộ đọc giả: lần đọc tiếp theo trả `next` (hoặc ném lỗi). */
let next: DriverLicenceReading | Error = vnB2();
const reader: DriverLicenceReader = {
  name: 'fake',
  model: 'fake-1',
  enabled: true,
  read: async () => {
    if (next instanceof Error) throw next;
    return next;
  },
};

const service = makeDriverLicencesService(asService, { enforcement: 'on', r2, reader, audit });
const serviceNoReader = makeDriverLicencesService(asService, { enforcement: 'on', r2, audit });
const serviceOff = makeDriverLicencesService(asService, { enforcement: 'off', r2, reader, audit });

function vnB2(overrides: Partial<DriverLicenceReading> = {}): DriverLicenceReading {
  return {
    isDriverLicence: true,
    documentKind: 'vn',
    side: 'front',
    readable: true,
    qualityIssues: [],
    confidence: 'high',
    licenceNumber: '790123456789',
    fullName: 'NGUYỄN VĂN AN',
    dateOfBirth: '1990-04-12',
    classes: ['B2'],
    issuedOn: '2021-03-15',
    expiresOn: '2031-03-15',
    noExpiry: false,
    issuingCountry: 'VN',
    coversCar: true,
    coversMotorbike: false,
    notes: null,
    ...overrides,
  };
}

let dbAvailable = false;
const userIds: string[] = [];
let reviewerId: string;
let partnerId: string;

async function newCustomer(phone?: string): Promise<string> {
  const id = newId();
  await prisma.user.create({
    data: {
      id,
      realm: ACCOUNT_REALM.CUSTOMER,
      displayName: 'Khách bằng lái',
      email: `dl-${id}@xeprime.test`,
      ...(phone ? { phone, phoneVerifiedAt: new Date() } : {}),
    },
  });
  userIds.push(id);
  return id;
}

/** Nộp một ảnh qua ĐÚNG đường khách đi: presign → PUT → complete → đọc nền. */
async function submit(
  svc: DriverLicencesService,
  userId: string,
  bytes: Uint8Array = JPEG,
): Promise<string> {
  const ticket = await svc.presign(userId, {
    contentType: 'image/jpeg',
    fileSize: bytes.length,
    consent: true,
  });
  const row = await prisma.customerDriverLicence.findUniqueOrThrow({
    where: { id: ticket.licenceId },
  });
  objects.set(row.objectKey, { bytes, contentType: 'image/jpeg' });
  await svc.complete(userId, ticket.licenceId);
  await svc.drainReadings();
  return ticket.licenceId;
}

const statusOf = async (id: string) =>
  (await prisma.customerDriverLicence.findUniqueOrThrow({ where: { id } })).status;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }
  reviewerId = newId();
  partnerId = newId();
  await prisma.user.createMany({
    data: [
      {
        id: reviewerId,
        realm: ACCOUNT_REALM.PLATFORM,
        displayName: 'Người duyệt',
        email: `rv-${reviewerId}@xeprime.test`,
      },
      {
        id: partnerId,
        realm: ACCOUNT_REALM.PARTNER,
        displayName: 'Chủ xe',
        email: `pt-${partnerId}@xeprime.test`,
      },
    ],
  });
  userIds.push(reviewerId, partnerId);
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.customerDriverLicence.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    next = vnB2();
    r2Failure.read = false;
    await fn();
  });

const expectCode = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toMatchObject({ response: expect.objectContaining({ code }) });
};

describe('Nộp ảnh và tự xác thực', () => {
  maybe('ảnh rõ, còn hạn ⇒ verified tự động, ghi audit, cổng đặt xe mở', async () => {
    const userId = await newCustomer();
    const id = await submit(service, userId);

    const row = await prisma.customerDriverLicence.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      status: DRIVER_LICENCE_STATUS.VERIFIED,
      decisionSource: DRIVER_LICENCE_DECISION_SOURCE.AUTO,
      kind: DRIVER_LICENCE_KIND.VN,
      licenceClasses: ['B2'],
      coversCar: true,
      ocrProvider: 'fake',
    });
    expect(row.uploadedAt).not.toBeNull();
    expect(
      await prisma.auditLog.count({ where: { targetId: id, action: 'driver_licence.submit' } }),
    ).toBe(1);

    const overview = await service.getOverview(userId);
    expect(overview.verified?.id).toBe(id);
    expect(overview.latest?.id).toBe(id);

    await expect(
      service.assertCanDriveForTrip({
        userId,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        vehicleType: VEHICLE_TYPE.CAR,
        lastDayKey: '2030-01-01',
      }),
    ).resolves.toBeUndefined();
  });

  maybe('tệp không phải ảnh ⇒ 400, lượt nộp không sang đọc', async () => {
    const userId = await newCustomer();
    const ticket = await service.presign(userId, {
      contentType: 'image/jpeg',
      fileSize: NOT_AN_IMAGE.length,
      consent: true,
    });
    const row = await prisma.customerDriverLicence.findUniqueOrThrow({
      where: { id: ticket.licenceId },
    });
    objects.set(row.objectKey, { bytes: NOT_AN_IMAGE, contentType: 'image/jpeg' });
    await expectCode(
      service.complete(userId, ticket.licenceId),
      API_ERROR_CODE.DRIVER_LICENCE_IMAGE_INVALID,
    );
    expect(await statusOf(ticket.licenceId)).toBe(DRIVER_LICENCE_STATUS.UPLOADING);
  });

  maybe('lượt nộp của người khác là 404, không lộ', async () => {
    const owner = await newCustomer();
    const stranger = await newCustomer();
    const id = await submit(service, owner);
    await expect(service.imageForOwner(stranger, id)).rejects.toMatchObject({ status: 404 });
    await expect(service.complete(stranger, id)).rejects.toMatchObject({ status: 404 });
  });

  maybe('bằng hết hạn ⇒ máy từ chối, khách nộp bằng còn hạn', async () => {
    const userId = await newCustomer();
    next = vnB2({ issuedOn: '2010-01-01', expiresOn: '2020-01-01' });
    await submit(service, userId);
    expect((await service.getOverview(userId)).latest).toMatchObject({
      status: DRIVER_LICENCE_STATUS.REJECTED,
      rejectionReason: DRIVER_LICENCE_REJECT_REASON.EXPIRED,
      decisionSource: DRIVER_LICENCE_DECISION_SOURCE.AUTO,
    });
  });

  maybe('ảnh mờ ⇒ từ chối kèm gợi ý chụp lại', async () => {
    const userId = await newCustomer();
    next = vnB2({ readable: false, qualityIssues: ['blurry'] });
    await submit(service, userId);
    expect((await service.getOverview(userId)).latest).toMatchObject({
      status: DRIVER_LICENCE_STATUS.REJECTED,
      rejectionReason: DRIVER_LICENCE_REJECT_REASON.UNREADABLE,
      qualityIssues: ['blurry'],
    });
  });

  maybe('độ tin cậy thấp nhưng đủ trường ⇒ tự xác thực (ADR 0070)', async () => {
    const userId = await newCustomer();
    next = vnB2({ confidence: 'low' });
    const id = await submit(service, userId);
    expect(await statusOf(id)).toBe(DRIVER_LICENCE_STATUS.VERIFIED);
  });

  maybe('bộ đọc hỏng ⇒ từ chối reader_unavailable, KHÔNG BAO GIỜ tự xác thực', async () => {
    const userId = await newCustomer();
    next = new DriverLicenceReaderError(READER_FAILURE.TIMEOUT, 'timeout');
    const id = await submit(service, userId);
    const row = await prisma.customerDriverLicence.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      status: DRIVER_LICENCE_STATUS.REJECTED,
      rejectionReason: DRIVER_LICENCE_REJECT_REASON.READER_UNAVAILABLE,
      decisionSource: DRIVER_LICENCE_DECISION_SOURCE.AUTO,
      ocrErrorCode: READER_FAILURE.TIMEOUT,
    });
    await expectCode(
      service.assertCanDriveForTrip({
        userId,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        vehicleType: VEHICLE_TYPE.CAR,
        lastDayKey: '2027-01-01',
      }),
      API_ERROR_CODE.DRIVER_LICENCE_REQUIRED,
    );
  });

  maybe('chưa cấu hình bộ đọc ⇒ reader_unavailable; bằng cũ vẫn dùng được', async () => {
    const userId = await newCustomer();
    const oldId = await submit(service, userId);
    const id = await submit(serviceNoReader, userId);
    expect(await prisma.customerDriverLicence.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: DRIVER_LICENCE_STATUS.REJECTED,
      rejectionReason: DRIVER_LICENCE_REJECT_REASON.READER_UNAVAILABLE,
      ocrErrorCode: READER_FAILURE.NOT_CONFIGURED,
    });
    expect((await service.getOverview(userId)).verified?.id).toBe(oldId);
  });

  maybe('lượt đọc kẹt ở processing quá 5 phút ⇒ reader_unavailable khi đọc lại', async () => {
    const userId = await newCustomer();
    const ticket = await service.presign(userId, {
      contentType: 'image/jpeg',
      fileSize: JPEG.length,
      consent: true,
    });
    await prisma.customerDriverLicence.update({
      where: { id: ticket.licenceId },
      data: { status: DRIVER_LICENCE_STATUS.PROCESSING, uploadedAt: new Date() },
    });
    await prisma.$executeRaw`UPDATE customer_driver_licences SET updated_at = now() - interval '10 minutes' WHERE id = ${ticket.licenceId}`;
    const overview = await service.getOverview(userId);
    expect(overview.latest).toMatchObject({
      status: DRIVER_LICENCE_STATUS.REJECTED,
      rejectionReason: DRIVER_LICENCE_REJECT_REASON.READER_UNAVAILABLE,
    });
  });
});

describe('Hồ sơ khách thuê — bằng lái chỉ đọc (ADR 0070)', () => {
  maybe('lịch sử nộp của MỘT khách, mới nhất trước, che SĐT', async () => {
    const userId = await newCustomer('84901234567');
    const other = await newCustomer();
    next = vnB2({ readable: false });
    const first = await submit(service, userId);
    next = vnB2();
    const second = await submit(service, userId);
    await submit(service, other);
    const page = await service.listForPlatform({ userId });
    expect(page.data.map((d) => d.id)).toEqual([second, first]);
    expect(page.data[0]!.owner.phone).toBe('090****567');
    expect((await service.getForPlatform(second)).owner).toMatchObject({
      phone: '090****567',
      email: expect.not.stringContaining(`dl-${userId}@`),
    });
  });

  maybe(
    'bằng nước ngoài máy nhận ra ⇒ tự xác thực, DB nhận dù thiếu hạng/hạn; cổng đặt xe cho qua',
    async () => {
      const userId = await newCustomer();
      next = vnB2({
        documentKind: 'foreign',
        licenceNumber: null,
        fullName: null,
        classes: [],
        issuedOn: null,
        expiresOn: null,
        issuingCountry: null,
        confidence: 'low',
      });
      const id = await submit(service, userId);
      expect(await prisma.customerDriverLicence.findUniqueOrThrow({ where: { id } })).toMatchObject(
        {
          status: DRIVER_LICENCE_STATUS.VERIFIED,
          kind: DRIVER_LICENCE_KIND.FOREIGN,
          licenceClasses: [],
          expiresOn: null,
          coversCar: true,
          coversMotorbike: true,
        },
      );
      // "Hạn chưa đọc được" không phải "hết hạn": chủ xe đối chiếu bằng gốc lúc giao xe.
      await expect(
        service.assertCanDriveForTrip({
          userId,
          serviceType: 'self_drive',
          vehicleType: 'motorbike',
          lastDayKey: '2027-01-10',
        }),
      ).resolves.toBeUndefined();
    },
  );
});

describe('Vệ sinh dữ liệu và ca hỏng', () => {
  maybe('có bằng hợp lệ ⇒ ảnh của lượt bị huỷ / bị thay / bị từ chối trước đó bị xoá', async () => {
    const userId = await newCustomer();
    const first = await submit(service, userId); // verified
    next = vnB2({ readable: false, qualityIssues: ['blurry'] });
    const rejected = await submit(service, userId); // rejected
    const cancelled = (
      await service.presign(userId, {
        contentType: 'image/jpeg',
        fileSize: JPEG.length,
        consent: true,
      })
    ).licenceId; // uploading
    next = vnB2({ licenceNumber: '790999888777' });
    const latest = await submit(service, userId); // huỷ lượt dở + verified mới, thay bằng cũ

    const rows = await prisma.customerDriverLicence.findMany({
      where: { id: { in: [first, rejected, cancelled, latest] } },
      select: { id: true, status: true, imageDeletedAt: true, objectKey: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(first)).toMatchObject({ status: DRIVER_LICENCE_STATUS.SUPERSEDED });
    expect(byId.get(cancelled)).toMatchObject({ status: DRIVER_LICENCE_STATUS.CANCELLED });
    for (const id of [first, rejected, cancelled]) {
      expect(byId.get(id)!.imageDeletedAt).not.toBeNull();
      expect(objects.has(byId.get(id)!.objectKey)).toBe(false);
    }
    expect(byId.get(latest)!.imageDeletedAt).toBeNull();
    await expect(service.imageForOwner(userId, first)).rejects.toMatchObject({ status: 404 });
  });

  maybe(
    'lỗi ngoài dự kiến lúc đọc (R2 sập) ⇒ reader_unavailable, không kẹt processing',
    async () => {
      const userId = await newCustomer();
      r2Failure.read = true;
      const id = await submit(service, userId);
      expect(await prisma.customerDriverLicence.findUniqueOrThrow({ where: { id } })).toMatchObject(
        {
          status: DRIVER_LICENCE_STATUS.REJECTED,
          rejectionReason: DRIVER_LICENCE_REJECT_REASON.READER_UNAVAILABLE,
          ocrErrorCode: READER_FAILURE.PROVIDER_ERROR,
        },
      );
    },
  );

  maybe('trần lượt nộp trong 24 giờ ⇒ mã riêng, không phải RATE_LIMITED chung', async () => {
    const userId = await newCustomer();
    await prisma.customerDriverLicence.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        id: newId(),
        userId,
        status: DRIVER_LICENCE_STATUS.CANCELLED,
        objectKey: `test/limit-${userId}-${i}.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        uploadedAt: new Date(),
        imageDeletedAt: new Date(),
        consentedAt: new Date(),
      })),
    });
    await expectCode(
      service.presign(userId, { contentType: 'image/jpeg', fileSize: JPEG.length, consent: true }),
      API_ERROR_CODE.DRIVER_LICENCE_SUBMISSION_LIMIT,
    );
  });
});

describe('Cổng đặt xe', () => {
  const trip = {
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    vehicleType: VEHICLE_TYPE.CAR,
    lastDayKey: '2027-01-10',
  };

  maybe('chưa có bằng / khách chưa có tài khoản ⇒ DRIVER_LICENCE_REQUIRED', async () => {
    await expectCode(
      service.assertCanDriveForTrip({ ...trip, userId: null }),
      API_ERROR_CODE.DRIVER_LICENCE_REQUIRED,
    );
    const userId = await newCustomer();
    await expectCode(
      service.assertCanDriveForTrip({ ...trip, userId }),
      API_ERROR_CODE.DRIVER_LICENCE_REQUIRED,
    );
  });

  maybe('bằng ô tô đặt xe máy ⇒ CLASS_MISMATCH; hết hạn giữa chuyến ⇒ EXPIRED', async () => {
    const userId = await newCustomer();
    next = vnB2({ expiresOn: '2027-01-05' });
    await submit(service, userId);
    await expectCode(
      service.assertCanDriveForTrip({
        ...trip,
        userId,
        vehicleType: VEHICLE_TYPE.MOTORBIKE,
        lastDayKey: '2027-01-01',
      }),
      API_ERROR_CODE.DRIVER_LICENCE_CLASS_MISMATCH,
    );
    await expectCode(
      service.assertCanDriveForTrip({ ...trip, userId }),
      API_ERROR_CODE.DRIVER_LICENCE_EXPIRED,
    );
  });

  maybe('thuê có tài xế không cần bằng; công tắc off bỏ qua cổng', async () => {
    const userId = await newCustomer();
    await expect(
      service.assertCanDriveForTrip({ ...trip, userId, serviceType: SERVICE_TYPE.WITH_DRIVER }),
    ).resolves.toBeUndefined();
    await expect(serviceOff.assertCanDriveForTrip({ ...trip, userId })).resolves.toBeUndefined();
  });

  /*
   * Cổng ở ĐƯỜNG GỬI YÊU CẦU. Từ ADR 0060 người gửi luôn là một tài khoản khách đã đăng nhập, nên
   * cổng soát bằng lái của CHÍNH tài khoản đó — không còn lượt soát trước cho khách vãng lai.
   */
  maybe('tài khoản chưa có bằng bị chặn ở đường gửi yêu cầu; có bằng hợp lệ thì qua', async () => {
    const ownerId = newId();
    const tenantId = newId();
    const vehicleId = newId();
    userIds.push(ownerId);
    await prisma.user.create({
      data: {
        id: ownerId,
        realm: ACCOUNT_REALM.PARTNER,
        displayName: 'Chủ shop',
        email: `o-${ownerId}@xeprime.test`,
      },
    });
    await prisma.tenant.create({
      data: {
        id: tenantId,
        code: `TEST-${tenantId.slice(-8)}`,
        slug: `test-${tenantId.toLowerCase().slice(-8)}`,
        name: 'Shop bằng lái',
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
    await prisma.vehicle.create({
      data: {
        id: vehicleId,
        tenantId,
        code: 'V-DLG-1',
        name: 'Kia Morning',
        vehicleType: VEHICLE_TYPE.CAR,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
        weekdayPrice: new Prisma.Decimal('500000'),
        weekendPrice: new Prisma.Decimal('600000'),
      },
    });

    const requests = makeBookingRequestsService(asService, { driverLicences: service });
    // SĐT riêng theo lượt chạy — `(realm, phone)` là khoá tìm-hoặc-tạo của tài khoản khách.
    const customerId = await customerAccountFor(
      asService,
      `0947${String(Date.now()).slice(-6)}`,
      'Khách bằng lái',
    );
    userIds.push(customerId);
    // 09:00 giờ VN — trong khung giao nhận mặc định, để thứ duy nhất chặn lượt gửi là bằng lái.
    const pickup = new Date(Date.now() + 5 * 86_400_000);
    pickup.setUTCHours(2, 0, 0, 0);
    const dto = {
      vehicleId,
      pickupAt: pickup.toISOString(),
      returnAt: new Date(pickup.getTime() + 2 * 86_400_000).toISOString(),
    };
    try {
      await expectCode(
        requests.submitPublic(dto, customerId),
        API_ERROR_CODE.DRIVER_LICENCE_REQUIRED,
      );
      expect(await prisma.bookingRequest.count({ where: { vehicleId } })).toBe(0);

      // Cùng tài khoản nộp bằng (máy tự xác thực) ⇒ đúng lượt gửi đó đi qua.
      await submit(service, customerId);
      const receipt = await requests.submitPublic(dto, customerId);
      expect(receipt.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    } finally {
      await prisma.bookingRequest.deleteMany({ where: { tenantId } });
      await prisma.notification.deleteMany({ where: { tenantId } });
      await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
      await prisma.vehicle.deleteMany({ where: { tenantId } });
      await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
      await prisma.tenantMembership.deleteMany({ where: { tenantId } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
  });
});

describe('Bất biến ở DB', () => {
  const baseRow = (userId: string) => ({
    id: newId(),
    userId,
    status: DRIVER_LICENCE_STATUS.UPLOADING,
    objectKey: `test/${newId()}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 100,
    consentedAt: new Date(),
  });

  maybe('tài khoản đối tác không mang được bằng lái (FK tổ hợp realm)', async () => {
    await expect(
      prisma.customerDriverLicence.create({ data: baseRow(partnerId) }),
    ).rejects.toThrow();
  });

  maybe('hai bằng ĐANG DÙNG cho một tài khoản bị DB chặn', async () => {
    const userId = await newCustomer();
    const verified = (id = newId()) => ({
      ...baseRow(userId),
      id,
      status: DRIVER_LICENCE_STATUS.VERIFIED,
      kind: DRIVER_LICENCE_KIND.VN,
      licenceNumber: '111122223333',
      fullName: 'Lê C',
      licenceClasses: ['B2'],
      expiresOn: new Date('2031-01-01T00:00:00Z'),
      decisionSource: DRIVER_LICENCE_DECISION_SOURCE.AUTO,
      decidedAt: new Date(),
      uploadedAt: new Date(),
    });
    await prisma.customerDriverLicence.create({ data: verified() });
    await expect(prisma.customerDriverLicence.create({ data: verified() })).rejects.toThrow();
  });

  maybe('verified thiếu trường / rejected thiếu lý do bị CHECK chặn', async () => {
    const userId = await newCustomer();
    await expect(
      prisma.customerDriverLicence.create({
        data: {
          ...baseRow(userId),
          status: DRIVER_LICENCE_STATUS.VERIFIED,
          decisionSource: 'auto',
          decidedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.customerDriverLicence.create({
        data: { ...baseRow(userId), status: DRIVER_LICENCE_STATUS.REJECTED },
      }),
    ).rejects.toThrow();
  });
});
