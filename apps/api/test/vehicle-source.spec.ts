import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  PRIVATE_FILE_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_FINANCE_INTEREST_METHOD,
  VEHICLE_SOURCE_TYPE,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { BillingService } from '../src/modules/billing/billing.service';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { SaveVehicleSourceDto } from '../src/modules/vehicles/dto/vehicle-source.dto';
import type { R2Service } from '../src/modules/storage/r2.service';
import { VehicleContractsService } from '../src/modules/vehicles/vehicle-contracts.service';
import { VehicleSourceService } from '../src/modules/vehicles/vehicle-source.service';
import { VehiclesService } from '../src/modules/vehicles/vehicles.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Wave 4 + 4.1 — hồ sơ nguồn xe & tài chính + tài liệu hợp đồng riêng tư, chạy trên PostgreSQL
 * THẬT (CHECK/FK là một nửa hợp đồng). R2 là FAKE trong bộ nhớ — test không cần credential
 * Cloudflare; điều được kiểm là logic xác minh của server. Không có DB thì tự skip.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

/** %PDF đầu file — chữ ký hợp lệ cho MIME application/pdf. */
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0]);

/** R2 giả lập: object "tồn tại" khi test khai vào `objects`. */
const fakeR2 = {
  privateEnabled: true,
  objects: new Map<string, { size: number; contentType: string | null; prefix: Uint8Array }>(),
  async presignPrivateUpload() {
    return { uploadUrl: 'https://r2.local/put', expiresIn: 300 };
  },
  async headPrivateObject(key: string) {
    const object = fakeR2.objects.get(key);
    return object ? { size: object.size, contentType: object.contentType } : null;
  },
  async readPrivateObjectPrefix(key: string) {
    return fakeR2.objects.get(key)?.prefix ?? null;
  },
  async presignPrivateDownload() {
    return { downloadUrl: 'https://r2.local/signed-get', expiresIn: 120 };
  },
};

const audit = new AuditService(asService);
const vehicles = new VehiclesService(
  asService,
  audit,
  new ListingsService(asService),
  new BillingService(asService, audit),
  new CatalogService(asService, audit),
  new PricingService(asService, audit),
);
const contracts = new VehicleContractsService(asService, fakeR2 as unknown as R2Service, audit);
const source = new VehicleSourceService(asService, audit, contracts);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let otherTenantId: string;

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
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
  });
  for (const [id, name] of [
    [tenantId, 'Shop Nguồn Xe'],
    [otherTenantId, 'Shop Khác'],
  ] as const) {
    await prisma.tenant.create({
      data: {
        id,
        code: `T-${id.slice(-8)}`,
        slug: `t-${id.toLowerCase().slice(-10)}`,
        name,
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: ownerId,
      },
    });
    await prisma.tenantMembership.create({
      data: {
        id: newId(),
        tenantId: id,
        userId: ownerId,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    });
  }
});

afterAll(async () => {
  if (dbAvailable) {
    for (const id of [tenantId, otherTenantId]) {
      await prisma.vehicle.deleteMany({ where: { tenantId: id } });
      await prisma.auditLog.deleteMany({ where: { tenantId: id } });
      await prisma.tenantMembership.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

async function createVehicle(code: string, sourceType?: string) {
  return vehicles.create(tenantId, ownerId, {
    code,
    name: 'Toyota Vios',
    vehicleType: VEHICLE_TYPE.CAR,
    ...(sourceType ? { sourceType } : {}),
  });
}

describe('Vehicle source & finance (Wave 4)', () => {
  maybe('xe chưa khai báo → detail null, sourceType lấy từ vehicles', async () => {
    const v = await createVehicle('SRC-0', VEHICLE_SOURCE_TYPE.RENTED);
    const state = await source.getSource(tenantId, v.id);
    expect(state.sourceType).toBe(VEHICLE_SOURCE_TYPE.RENTED);
    expect(state.detail).toBeNull();
  });

  maybe('owned: hồ sơ mua xe tuỳ chọn, không đòi trường nào', async () => {
    const v = await createVehicle('SRC-OWN');
    const state = await source.saveSource(tenantId, v.id, ownerId, {
      sourceType: VEHICLE_SOURCE_TYPE.OWNED,
      purchaseDate: '2024-01-12',
      purchasePrice: '560000000',
      purchasePlace: 'Toyota Đông Sài Gòn',
    });
    expect(state.detail?.purchasePrice).toBe('560000000');
    expect(state.detail?.purchaseDate).toBe('2024-01-12');

    // Không có gì cũng lưu được — sở hữu không có nghĩa vụ tài chính định kỳ.
    const bare = await source.saveSource(tenantId, v.id, ownerId, {
      sourceType: VEHICLE_SOURCE_TYPE.OWNED,
    });
    expect(bare.detail?.purchasePrice).toBeNull();
  });

  maybe('financed: monthlyTotal = gốc + lãi (tính ra, không lưu) + đủ hồ sơ nghĩa vụ', async () => {
    const v = await createVehicle('SRC-FIN', VEHICLE_SOURCE_TYPE.FINANCED);
    const state = await source.saveSource(tenantId, v.id, ownerId, {
      sourceType: VEHICLE_SOURCE_TYPE.FINANCED,
      bankName: 'VPBank',
      contractNumber: 'VPBL-2024-00123',
      originalPrincipal: '450000000',
      monthlyPrincipal: '7500000',
      monthlyInterest: '3187500',
      interestRatePercent: '8.5',
      termMonths: 60,
      interestMethod: VEHICLE_FINANCE_INTEREST_METHOD.REDUCING_BALANCE,
      paymentDay: 15,
      startDate: '2024-01-15',
    });
    expect(state.detail?.monthlyTotal).toBe('10687500');
    expect(state.detail?.interestRatePercent).toBe('8.5');
    expect(state.detail?.obligationReady).toBe(true);

    // Thiếu paymentDay → vẫn lưu được nhưng CHƯA đủ cho theo dõi nghĩa vụ.
    const partial = await source.saveSource(tenantId, v.id, ownerId, {
      sourceType: VEHICLE_SOURCE_TYPE.FINANCED,
      bankName: 'VPBank',
      monthlyPrincipal: '7500000',
      monthlyInterest: '3187500',
    });
    expect(partial.detail?.obligationReady).toBe(false);
  });

  maybe('financed thiếu ngân hàng → 400 kèm danh sách thiếu', async () => {
    const v = await createVehicle('SRC-FIN-REQ');
    await expect(
      source.saveSource(tenantId, v.id, ownerId, {
        sourceType: VEHICLE_SOURCE_TYPE.FINANCED,
        monthlyPrincipal: '1000000',
      }),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.VALIDATION_FAILED, details: { missing: ['bankName'] } },
    });
  });

  maybe('rented: đủ hồ sơ bên cho thuê + tiền thuê tháng', async () => {
    const v = await createVehicle('SRC-RENT');
    const state = await source.saveSource(tenantId, v.id, ownerId, {
      sourceType: VEHICLE_SOURCE_TYPE.RENTED,
      ownerName: 'Nguyễn Văn A',
      ownerPhone: '0909123456',
      ownerEmail: 'nguyenvana@gmail.com',
      monthlyRent: '12000000',
      paymentDay: 5,
      startDate: '2024-03-15',
      endDate: '2025-03-15',
    });
    expect(state.sourceType).toBe(VEHICLE_SOURCE_TYPE.RENTED);
    expect(state.detail?.monthlyRent).toBe('12000000');
    expect(state.detail?.endDate).toBe('2025-03-15');
  });

  maybe('partnership: % chia cho chủ xe 0–100', async () => {
    const v = await createVehicle('SRC-PART');
    const state = await source.saveSource(tenantId, v.id, ownerId, {
      sourceType: VEHICLE_SOURCE_TYPE.PARTNERSHIP,
      ownerName: 'Trần Thị B',
      ownerPhone: '0912999888',
      commissionPercent: '30',
      startDate: '2024-01-01',
    });
    expect(state.detail?.commissionPercent).toBe('30');
  });

  maybe('trường lạc biến thể bị từ chối 400 (CHECK của DB không phải nổ)', async () => {
    const v = await createVehicle('SRC-STRAY');
    await expect(
      source.saveSource(tenantId, v.id, ownerId, {
        sourceType: VEHICLE_SOURCE_TYPE.PARTNERSHIP,
        ownerName: 'Trần Thị B',
        commissionPercent: '30',
        monthlyRent: '12000000', // của rented
      }),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.VALIDATION_FAILED, details: { stray: ['monthlyRent'] } },
    });
  });

  maybe('đổi hình thức: replace trọn hồ sơ + đồng bộ vehicles.source_type + audit', async () => {
    const v = await createVehicle('SRC-SWAP', VEHICLE_SOURCE_TYPE.FINANCED);
    await source.saveSource(tenantId, v.id, ownerId, {
      sourceType: VEHICLE_SOURCE_TYPE.FINANCED,
      bankName: 'VPBank',
      monthlyPrincipal: '7500000',
      monthlyInterest: '3187500',
    });

    const swapped = await source.saveSource(tenantId, v.id, ownerId, {
      sourceType: VEHICLE_SOURCE_TYPE.RENTED,
      ownerName: 'Nguyễn Văn A',
      monthlyRent: '9000000',
    });

    // Hồ sơ biến thể cũ phải sạch — không còn "trả góp còn sót" trong bản ghi thuê lại.
    expect(swapped.sourceType).toBe(VEHICLE_SOURCE_TYPE.RENTED);
    expect(swapped.detail?.bankName).toBeNull();
    expect(swapped.detail?.monthlyPrincipal).toBeNull();
    expect(swapped.detail?.monthlyTotal).toBeNull();
    expect(swapped.detail?.monthlyRent).toBe('9000000');

    const vehicleRow = await prisma.vehicle.findUnique({
      where: { id: v.id },
      select: { sourceType: true },
    });
    expect(vehicleRow?.sourceType).toBe(VEHICLE_SOURCE_TYPE.RENTED);

    const typeAudit = await prisma.auditLog.findFirst({
      where: { tenantId, targetId: v.id, action: 'vehicle.source_type.change' },
    });
    expect(typeAudit).not.toBeNull();
    const saveAudit = await prisma.auditLog.count({
      where: { tenantId, targetId: v.id, action: 'vehicle.source.update' },
    });
    expect(saveAudit).toBe(2);
  });

  maybe('tenant isolation: tenant khác không đọc/ghi được hồ sơ', async () => {
    const v = await createVehicle('SRC-ISO');
    await source.saveSource(tenantId, v.id, ownerId, {
      sourceType: VEHICLE_SOURCE_TYPE.OWNED,
    });
    await expect(source.getSource(otherTenantId, v.id)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    await expect(
      source.saveSource(otherTenantId, v.id, ownerId, {
        sourceType: VEHICLE_SOURCE_TYPE.OWNED,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
  });

  maybe('ngày kết thúc trước ngày bắt đầu → 400 có kiểm soát (không rơi vào CHECK 500)', async () => {
    const v = await createVehicle('SRC-DATE-REV');
    await expect(
      source.saveSource(tenantId, v.id, ownerId, {
        sourceType: VEHICLE_SOURCE_TYPE.RENTED,
        ownerName: 'Nguyễn Văn A',
        monthlyRent: '9000000',
        startDate: '2025-03-15',
        endDate: '2024-03-15',
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });

  maybe('lưu tab nguồn không đụng thông tin/media/giá của xe', async () => {
    const v = await vehicles.create(tenantId, ownerId, {
      code: 'SRC-SAFE',
      name: 'Xe giữ nguyên',
      vehicleType: VEHICLE_TYPE.CAR,
      mainImageUrl: 'https://img/main.jpg',
      weekdayPrice: '800000',
      description: 'Mô tả gốc',
    });
    await source.saveSource(tenantId, v.id, ownerId, {
      sourceType: VEHICLE_SOURCE_TYPE.OWNED,
      notes: 'Xe nhà',
    });
    const after = await vehicles.getOne(tenantId, v.id);
    expect(after.name).toBe('Xe giữ nguyên');
    expect(after.mainImageUrl).toBe('https://img/main.jpg');
    // Ở tầng service tiền còn là Decimal (interceptor HTTP mới hoá chuỗi) — so theo giá trị.
    expect(Number(after.weekdayPrice)).toBe(800000);
    expect(after.description).toBe('Mô tả gốc');
  });
});

describe('Hợp đồng riêng tư (Wave 4.1) — upload/hoàn tất/tải/đính', () => {
  /** presign + "PUT lên R2" (khai object vào fake) — trả fileId sẵn sàng cho complete. */
  async function presignAndPut(
    vehicleId: string,
    opts: { size?: number; mime?: string; prefix?: Uint8Array; headSize?: number } = {},
  ) {
    const size = opts.size ?? 12345;
    const mime = opts.mime ?? 'application/pdf';
    const presigned = await contracts.presign(tenantId, vehicleId, ownerId, {
      fileName: 'Hop_dong ky (bản cuối).pdf',
      contentType: mime,
      fileSize: size,
    });
    const row = await prisma.vehiclePrivateFile.findUnique({ where: { id: presigned.fileId } });
    fakeR2.objects.set(row!.objectKey, {
      size: opts.headSize ?? size,
      contentType: mime,
      prefix: opts.prefix ?? PDF_MAGIC,
    });
    return { presigned, objectKey: row!.objectKey };
  }

  maybe('presign: server sinh id + object key đúng cấu trúc, KHÔNG có publicUrl', async () => {
    const v = await createVehicle('CT-PRESIGN');
    const { presigned, objectKey } = await presignAndPut(v.id);
    // Key hoàn toàn từ dữ liệu server: tenant/xe/fileId + đuôi suy từ MIME — tên file gốc
    // (có dấu, có khoảng trắng) KHÔNG tham gia định danh.
    expect(objectKey).toBe(`tenants/${tenantId}/vehicles/${v.id}/contracts/${presigned.fileId}.pdf`);
    expect(presigned).not.toHaveProperty('publicUrl');
  });

  maybe('complete: object hợp lệ → ready + audit; metadata trả về không có URL/key', async () => {
    const v = await createVehicle('CT-OK');
    const { presigned } = await presignAndPut(v.id);
    const file = await contracts.complete(tenantId, v.id, ownerId, presigned.fileId);
    expect(file.status).toBe('ready');
    expect(JSON.stringify(file)).not.toMatch(/url|objectKey|tenants\//i);

    const auditRow = await prisma.auditLog.findFirst({
      where: { tenantId, action: 'vehicle.contract.upload', targetId: presigned.fileId },
    });
    expect(auditRow).not.toBeNull();
  });

  maybe('complete: object CHƯA tồn tại trên R2 → 400, file vẫn pending', async () => {
    const v = await createVehicle('CT-MISSING');
    const presigned = await contracts.presign(tenantId, v.id, ownerId, {
      fileName: 'hd.pdf',
      contentType: 'application/pdf',
      fileSize: 100,
    });
    await expect(contracts.complete(tenantId, v.id, ownerId, presigned.fileId)).rejects.toMatchObject(
      { response: { code: API_ERROR_CODE.VALIDATION_FAILED } },
    );
    const row = await prisma.vehiclePrivateFile.findUnique({ where: { id: presigned.fileId } });
    expect(row?.status).toBe(PRIVATE_FILE_STATUS.PENDING);
  });

  maybe('complete: size thật khác khai báo → 400', async () => {
    const v = await createVehicle('CT-SIZE');
    const { presigned } = await presignAndPut(v.id, { size: 100, headSize: 999999 });
    await expect(contracts.complete(tenantId, v.id, ownerId, presigned.fileId)).rejects.toMatchObject(
      { response: { code: API_ERROR_CODE.VALIDATION_FAILED } },
    );
  });

  maybe('complete: chữ ký byte đầu không khớp MIME (đội lốt PDF) → 400', async () => {
    const v = await createVehicle('CT-MAGIC');
    const { presigned } = await presignAndPut(v.id, {
      prefix: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]), // JPEG
    });
    await expect(contracts.complete(tenantId, v.id, ownerId, presigned.fileId)).rejects.toMatchObject(
      { response: { code: API_ERROR_CODE.VALIDATION_FAILED } },
    );
  });

  maybe('đính file ready vào hồ sơ → metadata an toàn; id pending bị 400', async () => {
    const v = await createVehicle('CT-ATTACH');
    const { presigned } = await presignAndPut(v.id);
    await contracts.complete(tenantId, v.id, ownerId, presigned.fileId);

    const state = await source.saveSource(tenantId, v.id, ownerId, {
      sourceType: VEHICLE_SOURCE_TYPE.OWNED,
      contractFileIds: [presigned.fileId],
    });
    expect(state.detail?.contractFiles).toEqual([
      {
        id: presigned.fileId,
        name: 'Hop_dong ky (bản cuối).pdf',
        mimeType: 'application/pdf',
        size: 12345,
        status: 'ready',
      },
    ]);

    // File pending (chưa complete) không đính được.
    const pending = await contracts.presign(tenantId, v.id, ownerId, {
      fileName: 'chua-xong.pdf',
      contentType: 'application/pdf',
      fileSize: 50,
    });
    await expect(
      source.saveSource(tenantId, v.id, ownerId, {
        sourceType: VEHICLE_SOURCE_TYPE.OWNED,
        contractFileIds: [pending.fileId],
      }),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.VALIDATION_FAILED, details: { invalid: [pending.fileId] } },
    });
  });

  maybe('id lạ / file của XE khác / file của TENANT khác đều không đính được', async () => {
    const vehicleA = await createVehicle('CT-IDOR-A');
    const vehicleB = await createVehicle('CT-IDOR-B');
    const { presigned: fileOfB } = await presignAndPut(vehicleB.id);
    await contracts.complete(tenantId, vehicleB.id, ownerId, fileOfB.fileId);

    // File ready của xe B không đính vào xe A được.
    await expect(
      source.saveSource(tenantId, vehicleA.id, ownerId, {
        sourceType: VEHICLE_SOURCE_TYPE.OWNED,
        contractFileIds: [fileOfB.fileId],
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });

    // Id bịa đúng hình dạng ULID cũng 400 — không lộ gì.
    await expect(
      source.saveSource(tenantId, vehicleA.id, ownerId, {
        sourceType: VEHICLE_SOURCE_TYPE.OWNED,
        contractFileIds: [newId()],
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });

    // Tenant khác không presign/complete/download được trên xe của tenant này (404 chống IDOR).
    await expect(
      contracts.presign(otherTenantId, vehicleA.id, ownerId, {
        fileName: 'x.pdf',
        contentType: 'application/pdf',
        fileSize: 10,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
    await expect(
      contracts.download(otherTenantId, vehicleB.id, fileOfB.fileId),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
  });

  maybe('download: ready → signed URL ngắn hạn; pending/deleted → 404', async () => {
    const v = await createVehicle('CT-DOWNLOAD');
    const { presigned } = await presignAndPut(v.id);

    // pending chưa tải được
    await expect(contracts.download(tenantId, v.id, presigned.fileId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });

    await contracts.complete(tenantId, v.id, ownerId, presigned.fileId);
    const ticket = await contracts.download(tenantId, v.id, presigned.fileId);
    expect(ticket.downloadUrl).toBe('https://r2.local/signed-get');
    expect(new Date(ticket.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // Đính rồi gỡ → file bị đánh dấu deleted → hết tải được.
    await source.saveSource(tenantId, v.id, ownerId, {
      sourceType: VEHICLE_SOURCE_TYPE.OWNED,
      contractFileIds: [presigned.fileId],
    });
    await source.saveSource(tenantId, v.id, ownerId, {
      sourceType: VEHICLE_SOURCE_TYPE.OWNED,
      contractFileIds: [],
    });
    const row = await prisma.vehiclePrivateFile.findUnique({ where: { id: presigned.fileId } });
    expect(row?.status).toBe(PRIVATE_FILE_STATUS.DELETED);
    await expect(contracts.download(tenantId, v.id, presigned.fileId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });

  maybe('bản ghi legacy Wave 4 ({url,...}): API trả trạng thái legacy, KHÔNG BAO GIỜ trả url', async () => {
    const v = await createVehicle('CT-LEGACY');
    await source.saveSource(tenantId, v.id, ownerId, { sourceType: VEHICLE_SOURCE_TYPE.OWNED });
    // Giả lập dữ liệu Wave 4 cũ còn nằm trong JSON.
    await prisma.vehicleSourceDetail.update({
      where: { vehicleId: v.id },
      data: {
        contractFiles: [
          { url: 'https://public.r2.dev/tenants/x/old.pdf', name: 'old.pdf', size: 111 },
        ],
      },
    });

    const state = await source.getSource(tenantId, v.id);
    expect(state.detail?.contractFiles).toEqual([
      { id: null, name: 'old.pdf', mimeType: null, size: 111, status: 'legacy' },
    ]);
    expect(JSON.stringify(state)).not.toContain('public.r2.dev');

    // Lưu lại hồ sơ: mục legacy được GIỮ trong DB (chờ di trú), vẫn không lộ url ra API.
    const saved = await source.saveSource(tenantId, v.id, ownerId, {
      sourceType: VEHICLE_SOURCE_TYPE.OWNED,
      notes: 'đổi ghi chú',
    });
    expect(saved.detail?.contractFiles?.[0]?.status).toBe('legacy');
    const row = await prisma.vehicleSourceDetail.findUnique({ where: { vehicleId: v.id } });
    expect(JSON.stringify(row?.contractFiles)).toContain('public.r2.dev');
  });

  maybe('thiếu R2_PRIVATE_BUCKET → 503 fail-closed, không rơi về bucket public', async () => {
    const v = await createVehicle('CT-503');
    const closedR2 = { ...fakeR2, privateEnabled: false };
    const closed = new VehicleContractsService(
      asService,
      closedR2 as unknown as R2Service,
      audit,
    );
    await expect(
      closed.presign(tenantId, v.id, ownerId, {
        fileName: 'x.pdf',
        contentType: 'application/pdf',
        fileSize: 10,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.UPLOADS_NOT_CONFIGURED } });
  });

  maybe('bất biến DB: file trỏ "tenant A + xe tenant B" bị composite FK từ chối', async () => {
    const v = await createVehicle('CT-FK');
    await expect(
      prisma.vehiclePrivateFile.create({
        data: {
          id: newId(),
          tenantId: otherTenantId, // tenant KHÁC chủ xe
          vehicleId: v.id,
          purpose: 'source_contract',
          objectKey: `tenants/${otherTenantId}/vehicles/${v.id}/contracts/${newId()}.pdf`,
          originalName: 'x.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 10,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});

describe('Ngày lịch (Wave 4.1) — validate ngữ nghĩa ở mép DTO', () => {
  async function dateErrors(startDate: string) {
    const dto = plainToInstance(SaveVehicleSourceDto, {
      sourceType: 'rented',
      ownerName: 'A',
      monthlyRent: '1000',
      startDate,
    });
    const errors = await validate(dto);
    return errors.filter((error) => error.property === 'startDate');
  }

  it('29/02 năm nhuận là hợp lệ', async () => {
    expect(await dateErrors('2028-02-29')).toHaveLength(0);
  });

  it('29/02 năm KHÔNG nhuận bị từ chối', async () => {
    expect(await dateErrors('2026-02-29')).not.toHaveLength(0);
  });

  it('ngày không tồn tại (30/02) bị từ chối', async () => {
    expect(await dateErrors('2026-02-30')).not.toHaveLength(0);
  });

  it('tháng/ngày vô nghĩa (99-99) bị từ chối', async () => {
    expect(await dateErrors('2026-99-99')).not.toHaveLength(0);
  });

  it('URL/object key tuỳ ý không lọt qua contractFileIds', async () => {
    const dto = plainToInstance(SaveVehicleSourceDto, {
      sourceType: 'owned',
      contractFileIds: ['https://evil.example/x.pdf', 'tenants/a/vehicles/b/contracts/c.pdf'],
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'contractFileIds')).toBe(true);
  });
});
