import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  FUEL_TYPE,
  MEMBERSHIP_STATUS,
  MOTORBIKE_CATEGORY,
  PRIVATE_FILE_STATUS,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  TRANSMISSION_TYPE,
  VEHICLE_DOCUMENT_TYPE,
  VEHICLE_IMAGE_TYPE,
  VEHICLE_REGISTRATION_UPLOAD_STATUS,
  VEHICLE_TYPE,
  type VehicleRegistrationReading,
} from '@xeprime/types';
import type { R2Service } from '../src/modules/storage/r2.service';
import type { VehicleRegistrationReader } from '../src/modules/vehicles/registration/registration-reader';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeVehicleRegistrationUploadsService,
  makeVehiclesService,
  seedBranch,
} from './helpers/service-factory';

/**
 * Cà vẹt lúc tạo ô tô (ADR 0089) — trên PostgreSQL THẬT, kho R2 và máy đọc giả.
 *
 *  1. Tải + đọc: lượt tải thuộc đúng gian hàng + người tải; đọc lại là idempotent; máy đọc hỏng
 *     vẫn cho tạo xe (chủ xe nhập tay).
 *  2. Gắn trong transaction tạo xe: giấy tờ `registration` + phiên bản 1 + tệp riêng tư trỏ CÙNG
 *     object; lượt tải đã dùng / hết hạn / của người khác ⇒ 400 và KHÔNG có xe nào được tạo.
 *  3. Dọn: lượt tải bỏ dở quá hạn bị xoá cả ảnh lẫn dòng; lượt đã gắn thì giữ.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const RUN = newId().slice(-8).toLowerCase();

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const deleted: string[] = [];
const r2 = {
  privateEnabled: true,
  presignPrivateUpload: async () => ({ uploadUrl: 'https://r2.test/put', expiresIn: 600 }),
  headPrivateObject: async () => ({ size: JPEG.length, contentType: 'image/jpeg' }),
  readPrivateObjectPrefix: async () => JPEG,
  readPrivateObject: async () => JPEG,
  deletePrivateObject: async (key: string) => {
    deleted.push(key);
    return true;
  },
} as unknown as R2Service;

const READING: VehicleRegistrationReading = {
  plateNumber: '51H-100.00',
  holderName: 'NGUYỄN VĂN AN',
  holderAddress: '123 Nguyễn Văn Cừ, Quận 5',
  chassisNumber: 'RL4B29F30K1234567',
  engineNumber: '2NRX123456',
};
let readerFails = false;
const reader: VehicleRegistrationReader = {
  name: 'fake',
  read: async () => {
    if (readerFails) throw new Error('quá tải');
    return READING;
  },
  dispose: async () => undefined,
};

const uploads = makeVehicleRegistrationUploadsService(asService, { r2, reader });
const vehicles = makeVehiclesService(asService, { registrations: uploads });

let dbAvailable = false;
let ownerId: string;
let otherUserId: string;
let tenantId: string;
let branchId: string;
let seq = 0;

const CAR_MEDIA = [
  VEHICLE_IMAGE_TYPE.FRONT,
  VEHICLE_IMAGE_TYPE.REAR,
  VEHICLE_IMAGE_TYPE.LEFT,
  VEHICLE_IMAGE_TYPE.RIGHT,
  VEHICLE_IMAGE_TYPE.INTERIOR,
].map((type, i) => ({ url: `https://img.example/${RUN}-${i}.jpg`, type }));

function carBody(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return {
    name: `Xe cà vẹt ${seq}`,
    branchId,
    vehicleType: VEHICLE_TYPE.CAR,
    serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
    plateNumber: '51H-100.00',
    brand: 'toyota',
    model: 'Vios',
    manufactureYear: 2022,
    seatCount: 5,
    fuelType: FUEL_TYPE.GASOLINE,
    transmission: TRANSMISSION_TYPE.AUTOMATIC,
    weekdayPrice: '700000',
    media: CAR_MEDIA,
    ...overrides,
  } as never;
}

async function readUpload(userId = ownerId): Promise<string> {
  const { uploadId } = await uploads.presign(tenantId, userId, {
    contentType: 'image/jpeg',
    fileSize: JPEG.length,
  });
  await uploads.read(tenantId, userId, uploadId);
  return uploadId;
}

const registrationOf = (uploadId: string) => ({
  uploadId,
  holderName: READING.holderName!,
  holderAddress: READING.holderAddress,
  chassisNumber: READING.chassisNumber!,
  engineNumber: READING.engineNumber!,
});

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ response: expect.objectContaining({ code }) });
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
  otherUserId = newId();
  tenantId = newId();
  for (const [id, label] of [
    [ownerId, 'owner'],
    [otherUserId, 'staff'],
  ] as const) {
    await prisma.user.create({
      data: {
        realm: ACCOUNT_REALM.PARTNER,
        id,
        displayName: `Cà vẹt ${label}`,
        email: `reg-${label}-${RUN}@xeprime.test`,
      },
    });
  }
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `RegShop-${RUN}`,
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
  branchId = await seedBranch(asService, { tenantId });
});

afterEach(async () => {
  if (!dbAvailable) return;
  readerFails = false;
  await prisma.vehicle.deleteMany({ where: { tenantId } });
  await prisma.vehicleRegistrationUpload.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenantBranch.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherUserId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Tải + đọc ảnh cà vẹt', () => {
  maybe(
    'presign sinh key trong kho của gian hàng; đọc trả trường máy đọc, gọi lại idempotent',
    async () => {
      const { uploadId } = await uploads.presign(tenantId, ownerId, {
        contentType: 'image/jpeg',
        fileSize: JPEG.length,
      });
      const row = await prisma.vehicleRegistrationUpload.findUniqueOrThrow({
        where: { id: uploadId },
      });
      expect(row.objectKey).toBe(`tenants/${tenantId}/registration-uploads/${uploadId}.jpg`);
      expect(row.status).toBe(VEHICLE_REGISTRATION_UPLOAD_STATUS.UPLOADING);

      const first = await uploads.read(tenantId, ownerId, uploadId);
      expect(first).toEqual({ uploadId, reading: READING, readerAvailable: true });
      readerFails = true; // lần hai không chạy lại máy đọc
      expect(await uploads.read(tenantId, ownerId, uploadId)).toEqual(first);
    },
  );

  maybe('lượt tải của người khác là 400, không lộ', async () => {
    const { uploadId } = await uploads.presign(tenantId, ownerId, {
      contentType: 'image/jpeg',
      fileSize: JPEG.length,
    });
    await expectCode(
      uploads.read(tenantId, otherUserId, uploadId),
      API_ERROR_CODE.VEHICLE_REGISTRATION_UPLOAD_INVALID,
    );
  });

  maybe('máy đọc hỏng: mọi trường trống, ảnh vẫn dùng được', async () => {
    readerFails = true;
    const { uploadId } = await uploads.presign(tenantId, ownerId, {
      contentType: 'image/jpeg',
      fileSize: JPEG.length,
    });
    const result = await uploads.read(tenantId, ownerId, uploadId);
    expect(result.readerAvailable).toBe(false);
    expect(result.reading.chassisNumber).toBeNull();
    const row = await prisma.vehicleRegistrationUpload.findUniqueOrThrow({
      where: { id: uploadId },
    });
    expect(row.status).toBe(VEHICLE_REGISTRATION_UPLOAD_STATUS.READ);
  });
});

describe('Gắn cà vẹt trong transaction tạo xe', () => {
  maybe('tạo ô tô kèm cà vẹt: giấy tờ + phiên bản 1 + tệp riêng tư trỏ cùng object', async () => {
    const uploadId = await readUpload();
    const created = await vehicles.create(
      tenantId,
      ownerId,
      carBody({ registration: registrationOf(uploadId) }),
      null,
    );

    const doc = await prisma.vehicleDocument.findFirstOrThrow({
      where: { vehicleId: created.id, type: VEHICLE_DOCUMENT_TYPE.REGISTRATION },
      include: { activeVersion: { include: { privateFile: true } } },
    });
    expect(doc).toMatchObject({
      holderName: READING.holderName,
      chassisNumber: READING.chassisNumber,
      engineNumber: READING.engineNumber,
      plateNumber: '51H-100.00',
      expiresAt: null,
    });
    expect(doc.activeVersion?.version).toBe(1);
    expect(doc.activeVersion?.privateFile.status).toBe(PRIVATE_FILE_STATUS.READY);
    expect(doc.activeVersion?.privateFile.objectKey).toBe(
      `tenants/${tenantId}/registration-uploads/${uploadId}.jpg`,
    );

    const upload = await prisma.vehicleRegistrationUpload.findUniqueOrThrow({
      where: { id: uploadId },
    });
    expect(upload.status).toBe(VEHICLE_REGISTRATION_UPLOAD_STATUS.CONSUMED);
    expect(upload.vehicleId).toBe(created.id);
  });

  maybe('lượt tải đã dùng: 400 và KHÔNG có xe thứ hai', async () => {
    const uploadId = await readUpload();
    await vehicles.create(
      tenantId,
      ownerId,
      carBody({ registration: registrationOf(uploadId) }),
      null,
    );
    const before = await prisma.vehicle.count({ where: { tenantId } });
    await expectCode(
      vehicles.create(tenantId, ownerId, carBody({ registration: registrationOf(uploadId) }), null),
      API_ERROR_CODE.VEHICLE_REGISTRATION_UPLOAD_INVALID,
    );
    expect(await prisma.vehicle.count({ where: { tenantId } })).toBe(before);
  });

  maybe('lượt tải của người khác hoặc đã quá hạn: 400', async () => {
    const othersUpload = await readUpload(otherUserId);
    await expectCode(
      vehicles.create(
        tenantId,
        ownerId,
        carBody({ registration: registrationOf(othersUpload) }),
        null,
      ),
      API_ERROR_CODE.VEHICLE_REGISTRATION_UPLOAD_INVALID,
    );

    const stale = await readUpload();
    await prisma.vehicleRegistrationUpload.update({
      where: { id: stale },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60_000) },
    });
    await expectCode(
      vehicles.create(tenantId, ownerId, carBody({ registration: registrationOf(stale) }), null),
      API_ERROR_CODE.VEHICLE_REGISTRATION_UPLOAD_INVALID,
    );
    expect(await prisma.vehicle.count({ where: { tenantId } })).toBe(0);
  });

  maybe('xe máy không nhận cà vẹt kèm lượt tạo', async () => {
    const uploadId = await readUpload();
    await expectCode(
      vehicles.create(
        tenantId,
        ownerId,
        carBody({
          vehicleType: VEHICLE_TYPE.MOTORBIKE,
          brand: 'honda',
          model: 'Vision',
          seatCount: undefined,
          motorbikeCategory: MOTORBIKE_CATEGORY.SCOOTER,
          transmission: undefined,
          media: CAR_MEDIA.slice(0, 2),
          registration: registrationOf(uploadId),
        }),
        null,
      ),
      API_ERROR_CODE.VALIDATION_FAILED,
    );
  });

  maybe('tạo ô tô KHÔNG kèm cà vẹt vẫn được (app native chưa có bước này)', async () => {
    const created = await vehicles.create(tenantId, ownerId, carBody(), null);
    expect(await prisma.vehicleDocument.count({ where: { vehicleId: created.id } })).toBe(0);
  });
});

describe('Dọn lượt tải bỏ dở', () => {
  maybe('quá hạn mà chưa gắn: xoá ảnh + dòng; đã gắn thì giữ', async () => {
    const abandoned = await readUpload();
    const used = await readUpload();
    await vehicles.create(tenantId, ownerId, carBody({ registration: registrationOf(used) }), null);
    const old = new Date(Date.now() - 25 * 60 * 60_000);
    await prisma.vehicleRegistrationUpload.updateMany({
      where: { id: { in: [abandoned, used] } },
      data: { createdAt: old },
    });

    deleted.length = 0;
    expect(await uploads.purgeStale()).toBe(1);
    expect(deleted).toEqual([`tenants/${tenantId}/registration-uploads/${abandoned}.jpg`]);
    expect(
      await prisma.vehicleRegistrationUpload.findUnique({ where: { id: abandoned } }),
    ).toBeNull();
    expect(
      await prisma.vehicleRegistrationUpload.findUnique({ where: { id: used } }),
    ).not.toBeNull();
  });
});
