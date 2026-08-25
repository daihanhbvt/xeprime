import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  PERMISSION,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_DOCUMENT_OCR_STATUS,
  VEHICLE_DOCUMENT_PRESENTATION,
  VEHICLE_DOCUMENT_TYPE,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  vehicleDocumentPresentation,
} from '@xeprime/types';
import 'reflect-metadata';
import { PERMISSIONS_KEY } from '../src/common/decorators';
import { AuditService } from '../src/modules/audit/audit.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { R2Service } from '../src/modules/storage/r2.service';
import { VehicleDocumentsController } from '../src/modules/vehicles/documents/vehicle-documents.controller';
import { VehicleDocumentsService } from '../src/modules/vehicles/documents/vehicle-documents.service';
import type {
  OcrExtractionResult,
  VehicleDocumentOcrProvider,
} from '../src/modules/vehicles/documents/ocr-provider';
import { OcrNotConfiguredProvider } from '../src/modules/vehicles/documents/ocr-provider';
import { VehicleContractsService } from '../src/modules/vehicles/vehicle-contracts.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeVehiclesService, vehicleCreator } from './helpers/service-factory';

/**
 * Wave 5 + 5.1 — Giấy tờ xe & OCR trên PostgreSQL THẬT; R2 và OCR đều là FAKE trong bộ nhớ
 * (test không cần credential Cloudflare hay provider OCR). Điều được khoá:
 * isolation tenant/xe, DTO summary KHÔNG PII, vòng đời file riêng tư, "hết hạn chỉ cảnh báo",
 * OCR không tự ghi đè + áp đúng trường đã chọn + biển số đi qua luật duyệt lại (ADR 0008)
 * TRONG MỘT transaction, chống race gắn file/đối soát đôi, và các bất biến DB Wave 5.1
 * (unique file-per-version, composite FK sở hữu file, partial unique OCR processing,
 * chặn xoá version đang active). Không có DB thì tự skip.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0]);

/**
 * Ngày `YYYY-MM-DD` cách hôm nay `days` ngày (âm = quá khứ), tính trên UTC — CÙNG cơ sở với
 * `vehicle-documents.service.ts` (`new Date().toISOString().slice(0, 10)`).
 *
 * Ngưỡng "hết hạn" / "sắp hết hạn" là nghiệp vụ theo QUÃNG. Ngày tuyệt đối trong test chỉ đúng
 * tới ngày đó rồi đỏ mãi mãi — bản trước dùng `'2026-08-20'` kèm chú thích "còn 8 ngày" (viết
 * khi hôm nay là 12/08) và đã đỏ từ 21/08. Chỉ dùng ngày tuyệt đối cho những assert KHÔNG so
 * với hôm nay (thứ tự issuedAt ↔ expiresAt, ngày không tồn tại, giá trị OCR echo lại).
 */
function dayFromToday(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

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

/** Provider OCR GIẢ — chỉ tồn tại trong test (production mặc định là NotConfigured). */
const fakeOcr: VehicleDocumentOcrProvider & { result: OcrExtractionResult | Error } = {
  name: 'fake-test-provider',
  enabled: true,
  result: { status: 'needs_review', confidence: 87, fields: {} },
  async extract() {
    if (fakeOcr.result instanceof Error) throw fakeOcr.result;
    return fakeOcr.result;
  },
};

const audit = new AuditService(asService);
const listings = new ListingsService(asService);
// Dùng CHUNG instance `listings` với service xe: test dưới `spyOn` nó để mô phỏng lỗi giữa
// transaction, nên spy phải gắn đúng đối tượng mà VehiclesService thật sự gọi.
const vehicles = makeVehiclesService(asService, { listings });
const createVehicleWithBranch = vehicleCreator(vehicles, asService);
const files = new VehicleContractsService(asService, fakeR2 as unknown as R2Service, audit);
const documents = new VehicleDocumentsService(asService, files, vehicles, audit, fakeOcr);

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
    [tenantId, 'Shop Giấy Tờ'],
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

async function createVehicle(code: string) {
  return createVehicleWithBranch(tenantId, ownerId, {
    code,
    name: 'Toyota Vios',
    vehicleType: VEHICLE_TYPE.CAR,
    plateNumber: '51A-123.45',
  });
}

async function createDocument(vehicleId: string, type: string = VEHICLE_DOCUMENT_TYPE.REGISTRATION) {
  return documents.create(tenantId, vehicleId, ownerId, { type });
}

/** presign + "PUT lên R2" → file `ready`, trả fileId (chưa gắn). */
async function readyFile(vehicleId: string, documentId: string, name = 'ca-vet.pdf') {
  const presigned = await documents.presignVersion(tenantId, vehicleId, ownerId, documentId, {
    fileName: name,
    contentType: 'application/pdf',
    fileSize: 4321,
  });
  const row = await prisma.vehiclePrivateFile.findUnique({ where: { id: presigned.fileId } });
  fakeR2.objects.set(row!.objectKey, {
    size: 4321,
    contentType: 'application/pdf',
    prefix: PDF_MAGIC,
  });
  return presigned.fileId;
}

/** presign + "PUT lên R2" + gắn thành phiên bản active. */
async function attachFile(vehicleId: string, documentId: string, name = 'ca-vet.pdf') {
  const fileId = await readyFile(vehicleId, documentId, name);
  return documents.attachVersion(tenantId, vehicleId, ownerId, documentId, { fileId });
}

describe('Giấy tờ xe (Wave 5) — vòng đời & isolation', () => {
  maybe('tạo + gắn file: key server-side theo documentId, version 1 thành active', async () => {
    const v = await createVehicle('DOC-CREATE');
    const doc = await createDocument(v.id);
    const attached = await attachFile(v.id, doc.id);

    expect(attached.activeVersion?.version).toBe(1);
    expect(attached.presentation).toBe(VEHICLE_DOCUMENT_PRESENTATION.VALID);
    const file = await prisma.vehiclePrivateFile.findUnique({
      where: { id: attached.activeVersion!.file.id },
    });
    expect(file?.objectKey).toBe(
      `tenants/${tenantId}/vehicles/${v.id}/documents/${doc.id}/${file!.id}.pdf`,
    );
    // Metadata trả về không có URL/object key.
    expect(JSON.stringify(attached)).not.toMatch(/tenants\/|https?:/);
  });

  maybe('DTO summary (quyền view) KHÔNG mang PII/tên file/OCR — DTO detail mới có metadata', async () => {
    const v = await createVehicle('DOC-PII');
    const doc = await documents.create(tenantId, v.id, ownerId, {
      type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
      holderName: 'Nguyễn Văn A',
      holderAddress: '123 Lê Lợi, Q.1',
      documentNumber: 'SO-123456',
      chassisNumber: 'KHUNG-777',
      engineNumber: 'MAY-888',
    });
    await attachFile(v.id, doc.id, 'ten-file-nhay-cam.pdf');
    fakeOcr.result = {
      status: 'needs_review',
      fields: { holderName: { value: 'Nguyễn Văn A OCR', evidence: 'dòng 2 trang 1' } },
    };
    await documents.requestOcr(tenantId, v.id, ownerId, doc.id);

    const summaries = await documents.list(tenantId, v.id);
    const summary = summaries.find((d) => d.id === doc.id)!;
    // Đủ để hiển thị trạng thái…
    expect(summary.presentation).toBe(VEHICLE_DOCUMENT_PRESENTATION.NEEDS_REVIEW);
    expect(summary.hasFile).toBe(true);
    expect(summary.activeVersionId).not.toBeNull();
    // …nhưng KHÔNG một mảnh dữ liệu nhạy cảm nào: giá trị, tên trường lẫn tên file/OCR.
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toMatch(
      /Nguyễn Văn A|123 Lê Lợi|SO-123456|KHUNG-777|MAY-888|ten-file-nhay-cam|OCR|evidence/,
    );
    expect(Object.keys(summary)).not.toEqual(
      expect.arrayContaining(['holderName', 'documentNumber', 'notes', 'latestOcr', 'rowVersion']),
    );

    // Detail (quyền view_details) có metadata nhạy cảm nhưng KHÔNG dữ liệu OCR
    // (presentation="needs_review" chỉ là TRẠNG THÁI suy ra — không phải giá trị nhận dạng).
    const detail = await documents.getOne(tenantId, v.id, doc.id);
    expect(detail.holderName).toBe('Nguyễn Văn A');
    expect(JSON.stringify(detail)).not.toMatch(/evidence|Nguyễn Văn A OCR/);
  });

  maybe('loại chuẩn: xe đã có thì tạo thêm là 409; loại `other` thêm được nhiều', async () => {
    const v = await createVehicle('DOC-DUP');
    await createDocument(v.id, VEHICLE_DOCUMENT_TYPE.INSPECTION);
    await expect(createDocument(v.id, VEHICLE_DOCUMENT_TYPE.INSPECTION)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.CONFLICT },
    });
    await documents.create(tenantId, v.id, ownerId, {
      type: VEHICLE_DOCUMENT_TYPE.OTHER,
      customTypeName: 'Phù hiệu xe hợp đồng',
    });
    await documents.create(tenantId, v.id, ownerId, {
      type: VEHICLE_DOCUMENT_TYPE.OTHER,
      customTypeName: 'Giấy uỷ quyền',
    });
    const list = await documents.list(tenantId, v.id);
    expect(list.filter((d) => d.type === VEHICLE_DOCUMENT_TYPE.OTHER)).toHaveLength(2);
  });

  maybe('tenant khác không đọc/sửa/tải được giấy tờ (404 chống IDOR, cả lịch sử phiên bản)', async () => {
    const v = await createVehicle('DOC-ISO');
    const doc = await createDocument(v.id);
    await attachFile(v.id, doc.id);

    await expect(documents.list(otherTenantId, v.id)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    await expect(documents.getOne(otherTenantId, v.id, doc.id)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    await expect(documents.listVersions(otherTenantId, v.id, doc.id)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    const versions = await documents.listVersions(tenantId, v.id, doc.id);
    await expect(
      documents.downloadVersion(otherTenantId, v.id, doc.id, versions[0]!.id),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
  });

  maybe('id giấy tờ của xe khác không dùng chéo được qua path xe này (404)', async () => {
    const vehicleA = await createVehicle('DOC-CROSS-A');
    const vehicleB = await createVehicle('DOC-CROSS-B');
    const docB = await createDocument(vehicleB.id);
    await expect(documents.getOne(tenantId, vehicleA.id, docB.id)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    await expect(
      documents.update(tenantId, vehicleA.id, ownerId, docB.id, {
        type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
        expectedRowVersion: 1,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
  });

  maybe('file của xe A không gắn được vào giấy tờ xe B; file pending không gắn được', async () => {
    const vehicleA = await createVehicle('DOC-XA');
    const vehicleB = await createVehicle('DOC-XB');
    const docA = await createDocument(vehicleA.id);
    const docB = await createDocument(vehicleB.id);

    // File presign cho xe A (đã PUT + hợp lệ)
    const fileA = await readyFile(vehicleA.id, docA.id, 'a.pdf');

    // Gắn file của xe A vào giấy tờ xe B → 400/404, không lộ gì.
    await expect(
      documents.attachVersion(tenantId, vehicleB.id, ownerId, docB.id, { fileId: fileA }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });

    // File pending (chưa PUT) không gắn được vào chính giấy tờ của nó.
    const pending = await documents.presignVersion(tenantId, vehicleA.id, ownerId, docA.id, {
      fileName: 'chua-put.pdf',
      contentType: 'application/pdf',
      fileSize: 10,
    });
    await expect(
      documents.attachVersion(tenantId, vehicleA.id, ownerId, docA.id, {
        fileId: pending.fileId,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });

  maybe('thay file: version tăng, bản cũ vào lịch sử và vẫn tải được (archive/history)', async () => {
    const v = await createVehicle('DOC-VER');
    const doc = await createDocument(v.id);
    await attachFile(v.id, doc.id, 'ban-1.pdf');
    const second = await attachFile(v.id, doc.id, 'ban-2.pdf');

    expect(second.activeVersion?.version).toBe(2);
    const versions = await documents.listVersions(tenantId, v.id, doc.id);
    expect(versions).toHaveLength(2);
    const archived = versions.find((version) => version.version === 1)!;
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.file.name).toBe('ban-1.pdf');
    // Bản lịch sử vẫn tải được cho người có quyền mở file.
    const ticket = await documents.downloadVersion(tenantId, v.id, doc.id, archived.id);
    expect(ticket.downloadUrl).toBe('https://r2.local/signed-get');
  });

  maybe('hết hạn CHỈ cảnh báo: presentation=expired nhưng xe không đổi trạng thái nào', async () => {
    const v = await createVehicle('DOC-EXP');
    const doc = await documents.create(tenantId, v.id, ownerId, {
      type: VEHICLE_DOCUMENT_TYPE.INSURANCE,
      issuedAt: dayFromToday(-400),
      expiresAt: dayFromToday(-30), // đã qua
    });
    await attachFile(v.id, doc.id, 'bhtnds.pdf');

    const list = await documents.list(tenantId, v.id);
    const insurance = list.find((d) => d.type === VEHICLE_DOCUMENT_TYPE.INSURANCE)!;
    expect(insurance.presentation).toBe(VEHICLE_DOCUMENT_PRESENTATION.EXPIRED);

    const vehicleRow = await prisma.vehicle.findUnique({
      where: { id: v.id },
      select: { operationStatus: true, publicStatus: true, deletedAt: true },
    });
    expect(vehicleRow).toEqual({
      operationStatus: v.operationStatus,
      publicStatus: v.publicStatus,
      deletedAt: null,
    });
  });

  maybe('ngưỡng "sắp hết hạn" theo cấu hình tenant; CHƯA cấu hình thì không suy expiring_soon', async () => {
    // Chưa cấu hình → chỉ valid/expired.
    expect(
      vehicleDocumentPresentation({
        hasActiveVersion: true,
        expiresAt: '2026-08-20',
        warningDays: null,
        today: '2026-08-12',
      }),
    ).toBe(VEHICLE_DOCUMENT_PRESENTATION.VALID);

    const v = await createVehicle('DOC-WARN');
    const doc = await documents.create(tenantId, v.id, ownerId, {
      type: VEHICLE_DOCUMENT_TYPE.INSPECTION,
      expiresAt: dayFromToday(8), // còn 8 ngày → dưới ngưỡng 10 ngày đặt bên dưới
    });
    await attachFile(v.id, doc.id, 'dang-kiem.pdf');

    // Cấu hình ngưỡng 10 ngày ở tenant → suy được "sắp hết hạn".
    await prisma.tenantProfile.upsert({
      where: { tenantId },
      create: { tenantId, settings: { documentExpiryWarningDays: 10 } },
      update: { settings: { documentExpiryWarningDays: 10 } },
    });
    const list = await documents.list(tenantId, v.id);
    const inspection = list.find((d) => d.type === VEHICLE_DOCUMENT_TYPE.INSPECTION)!;
    expect(inspection.presentation).toBe(VEHICLE_DOCUMENT_PRESENTATION.EXPIRING_SOON);
    expect(inspection.warningDays).toBe(10);
  });

  maybe('sửa đè: expectedRowVersion lệch → 409, dữ liệu không đổi', async () => {
    const v = await createVehicle('DOC-CONFLICT');
    const doc = await documents.create(tenantId, v.id, ownerId, {
      type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
      holderName: 'Nguyễn Văn A',
    });

    // Người B sửa trước → rowVersion tăng.
    await documents.update(tenantId, v.id, ownerId, doc.id, {
      type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
      holderName: 'Nguyễn Văn B',
      expectedRowVersion: doc.rowVersion,
    });

    // Người A lưu bằng version cũ → 409 và giá trị của B còn nguyên.
    await expect(
      documents.update(tenantId, v.id, ownerId, doc.id, {
        type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
        holderName: 'Nguyễn Văn A sửa đè',
        expectedRowVersion: doc.rowVersion,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.CONFLICT } });
    const after = await documents.getOne(tenantId, v.id, doc.id);
    expect(after.holderName).toBe('Nguyễn Văn B');
  });
});

describe('Validation metadata (Wave 5.1) — trạng thái gộp, không phá dữ liệu', () => {
  maybe('ngày không hợp lệ / hết hạn trước ngày cấp → 400 có kiểm soát', async () => {
    const v = await createVehicle('DOC-DATE');
    await expect(
      documents.create(tenantId, v.id, ownerId, {
        type: VEHICLE_DOCUMENT_TYPE.INSURANCE,
        issuedAt: '2026-07-01',
        expiresAt: '2026-01-01',
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });

  maybe('patch một phần validate TRẠNG THÁI GỘP: chỉ sửa expiresAt vẫn bị chặn nếu trước issuedAt cũ', async () => {
    const v = await createVehicle('DOC-MERGE');
    const doc = await documents.create(tenantId, v.id, ownerId, {
      type: VEHICLE_DOCUMENT_TYPE.INSURANCE,
      issuedAt: '2026-06-01',
    });
    await expect(
      documents.update(tenantId, v.id, ownerId, doc.id, {
        type: VEHICLE_DOCUMENT_TYPE.INSURANCE,
        expiresAt: '2026-01-01', // trước issuedAt đang có trong DB
        expectedRowVersion: doc.rowVersion,
      }),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.VALIDATION_FAILED,
        details: { fields: [{ field: 'expiresAt', message: expect.any(String) }] },
      },
    });
  });

  maybe('trường KHÔNG gửi (undefined) giữ nguyên giá trị — không bị null hoá', async () => {
    const v = await createVehicle('DOC-UNDEF');
    const doc = await documents.create(tenantId, v.id, ownerId, {
      type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
      holderName: 'Nguyễn Văn A',
      notes: 'ghi chú quan trọng',
    });
    // Patch chỉ đổi holderAddress — holderName/notes không xuất hiện trong body.
    const updated = await documents.update(tenantId, v.id, ownerId, doc.id, {
      type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
      holderAddress: '123 Lê Lợi',
      expectedRowVersion: doc.rowVersion,
    });
    expect(updated.holderName).toBe('Nguyễn Văn A');
    expect(updated.notes).toBe('ghi chú quan trọng');
    expect(updated.holderAddress).toBe('123 Lê Lợi');
    // Gửi null tường minh thì mới xoá.
    const cleared = await documents.update(tenantId, v.id, ownerId, doc.id, {
      type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
      holderName: null,
      expectedRowVersion: updated.rowVersion,
    });
    expect(cleared.holderName).toBeNull();
    expect(cleared.notes).toBe('ghi chú quan trọng');
  });

  maybe('giá trị quá dài / ký tự điều khiển → 400 field-level, không rơi tới Prisma thành 500', async () => {
    const v = await createVehicle('DOC-LEN');
    const doc = await createDocument(v.id);
    await expect(
      documents.update(tenantId, v.id, ownerId, doc.id, {
        type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
        holderName: 'A'.repeat(161), // cột DB varchar(160)
        expectedRowVersion: doc.rowVersion,
      }),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.VALIDATION_FAILED,
        details: { fields: [{ field: 'holderName', message: expect.stringContaining('160') }] },
      },
    });
    await expect(
      documents.update(tenantId, v.id, ownerId, doc.id, {
        type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
        documentNumber: 'SO- 123',
        expectedRowVersion: doc.rowVersion,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });
});

describe('OCR (Wave 5) — provider giả trong test, mặc định production là NOT_CONFIGURED', () => {
  maybe('chưa cấu hình provider → 503 OCR_NOT_CONFIGURED, không job rác', async () => {
    const v = await createVehicle('OCR-503');
    const doc = await createDocument(v.id);
    await attachFile(v.id, doc.id);
    const notConfigured = new VehicleDocumentsService(
      asService,
      files,
      vehicles,
      audit,
      new OcrNotConfiguredProvider(),
    );
    await expect(notConfigured.requestOcr(tenantId, v.id, ownerId, doc.id)).rejects.toMatchObject(
      { response: { code: API_ERROR_CODE.OCR_NOT_CONFIGURED } },
    );
    expect(await prisma.vehicleDocumentOcrJob.count({ where: { documentId: doc.id } })).toBe(0);
  });

  maybe('trích xuất → needs_review; KHÔNG trường nào của giấy tờ/xe tự đổi', async () => {
    const v = await createVehicle('OCR-DRAFT');
    const doc = await createDocument(v.id);
    await attachFile(v.id, doc.id);
    fakeOcr.result = {
      status: 'needs_review',
      confidence: 87,
      fields: {
        holderName: { value: 'Nguyễn Văn An', confidence: 91 },
        plateNumber: { value: '51A-999.99', confidence: 96 },
        expiresAt: { value: '2029-01-15', confidence: 88 },
      },
    };

    const job = await documents.requestOcr(tenantId, v.id, ownerId, doc.id);
    expect(job.status).toBe(VEHICLE_DOCUMENT_OCR_STATUS.NEEDS_REVIEW);
    expect(job.fields).toHaveLength(3);

    // BẢN NHÁP: metadata giấy tờ và biển số xe chưa hề đổi.
    const detail = await documents.getOne(tenantId, v.id, doc.id);
    expect(detail.holderName).toBeNull();
    expect(detail.presentation).toBe(VEHICLE_DOCUMENT_PRESENTATION.NEEDS_REVIEW);
    const vehicleRow = await prisma.vehicle.findUnique({
      where: { id: v.id },
      select: { plateNumber: true },
    });
    expect(vehicleRow?.plateNumber).toBe('51A-123.45');
  });

  maybe('áp CHỌN LỌC: chỉ trường đã chọn đổi; trường không có bằng chứng bị 400', async () => {
    const v = await createVehicle('OCR-APPLY');
    const doc = await createDocument(v.id);
    await attachFile(v.id, doc.id);
    fakeOcr.result = {
      status: 'needs_review',
      fields: {
        holderName: { value: 'Nguyễn Văn An' },
        holderAddress: { value: '123 Lê Lợi, Quận 1' },
        expiresAt: { value: '2029-01-15' },
      },
    };
    const job = await documents.requestOcr(tenantId, v.id, ownerId, doc.id);

    // Chọn 2/3 trường — trường thứ ba không được đụng.
    const applied = await documents.applyOcr(tenantId, v.id, ownerId, doc.id, job.id, {
      fields: ['holderName', 'expiresAt'],
    });
    expect(applied.holderName).toBe('Nguyễn Văn An');
    expect(applied.expiresAt).toBe('2029-01-15');
    expect(applied.holderAddress).toBeNull();
    const jobRow = await prisma.vehicleDocumentOcrJob.findUnique({ where: { id: job.id } });
    expect(jobRow?.status).toBe(VEHICLE_DOCUMENT_OCR_STATUS.REVIEWED);

    // Trường không có trong kết quả job → 400 (client không bịa được giá trị).
    fakeOcr.result = { status: 'needs_review', fields: { holderName: { value: 'X' } } };
    const job2 = await documents.requestOcr(tenantId, v.id, ownerId, doc.id);
    await expect(
      documents.applyOcr(tenantId, v.id, ownerId, doc.id, job2.id, { fields: ['engineNumber'] }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });

  maybe('áp biển số vào XE public: đi qua luật sửa nhạy cảm → về chờ duyệt lại (ADR 0008)', async () => {
    const v = await createVehicle('OCR-PLATE');
    const doc = await createDocument(v.id);
    await attachFile(v.id, doc.id);
    // Giả lập xe đã duyệt công khai (chỉ test mới set thẳng — client không bao giờ).
    await prisma.vehicle.update({
      where: { id: v.id },
      data: { publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC },
    });

    fakeOcr.result = {
      status: 'needs_review',
      fields: { plateNumber: { value: '51A-999.99' } },
    };
    const job = await documents.requestOcr(tenantId, v.id, ownerId, doc.id);
    await documents.applyOcr(tenantId, v.id, ownerId, doc.id, job.id, {
      fields: ['plateNumber'],
      applyPlateToVehicle: true,
    });

    const vehicleRow = await prisma.vehicle.findUnique({
      where: { id: v.id },
      select: { plateNumber: true, publicStatus: true },
    });
    expect(vehicleRow?.plateNumber).toBe('51A-999.99');
    // Sửa trường nhạy cảm của xe public → knockback chờ duyệt lại, không ở lại approved.
    expect(vehicleRow?.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);
  });

  maybe('không đọc được → unreadable + mã lỗi; ngày OCR không hợp lệ khi áp → 400', async () => {
    const v = await createVehicle('OCR-BAD');
    const doc = await createDocument(v.id);
    await attachFile(v.id, doc.id);

    fakeOcr.result = { status: 'unreadable', fields: {} };
    const job = await documents.requestOcr(tenantId, v.id, ownerId, doc.id);
    expect(job.status).toBe(VEHICLE_DOCUMENT_OCR_STATUS.UNREADABLE);
    expect(job.errorCode).toBe(API_ERROR_CODE.OCR_UNREADABLE);

    fakeOcr.result = {
      status: 'needs_review',
      fields: { expiresAt: { value: '2026-02-30' } }, // ngày không tồn tại
    };
    const job2 = await documents.requestOcr(tenantId, v.id, ownerId, doc.id);
    await expect(
      documents.applyOcr(tenantId, v.id, ownerId, doc.id, job2.id, { fields: ['expiresAt'] }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });
});

describe('Transaction & concurrency (Wave 5.1)', () => {
  maybe('giá trị OCR quá dài → 400, job VẪN needs_review (rollback claim — đối soát lại được)', async () => {
    const v = await createVehicle('OCR-LONG');
    const doc = await createDocument(v.id);
    await attachFile(v.id, doc.id);
    fakeOcr.result = {
      status: 'needs_review',
      fields: { holderName: { value: 'B'.repeat(200) } }, // vượt varchar(160)
    };
    const job = await documents.requestOcr(tenantId, v.id, ownerId, doc.id);
    await expect(
      documents.applyOcr(tenantId, v.id, ownerId, doc.id, job.id, { fields: ['holderName'] }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
    const jobRow = await prisma.vehicleDocumentOcrJob.findUnique({ where: { id: job.id } });
    expect(jobRow?.status).toBe(VEHICLE_DOCUMENT_OCR_STATUS.NEEDS_REVIEW);
  });

  maybe('hai người đối soát cùng một job: người sau nhận 409, không áp đôi', async () => {
    const v = await createVehicle('OCR-TWICE');
    const doc = await createDocument(v.id);
    await attachFile(v.id, doc.id);
    fakeOcr.result = {
      status: 'needs_review',
      fields: { holderName: { value: 'Nguyễn Văn An' } },
    };
    const job = await documents.requestOcr(tenantId, v.id, ownerId, doc.id);
    await documents.applyOcr(tenantId, v.id, ownerId, doc.id, job.id, { fields: ['holderName'] });
    await expect(
      documents.applyOcr(tenantId, v.id, ownerId, doc.id, job.id, { fields: ['holderName'] }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.CONFLICT } });
  });

  maybe('áp OCR + biển số là MỘT transaction: bước xe fail → giấy tờ + job rollback hết', async () => {
    const v = await createVehicle('OCR-ATOMIC');
    const doc = await createDocument(v.id);
    await attachFile(v.id, doc.id);
    fakeOcr.result = {
      status: 'needs_review',
      fields: {
        holderName: { value: 'Nguyễn Văn An' },
        plateNumber: { value: '51A-777.77' },
      },
    };
    const job = await documents.requestOcr(tenantId, v.id, ownerId, doc.id);

    // Ép bước đồng bộ listing (nằm trong applyUpdate của xe) nổ — mô phỏng fail giữa chừng.
    const sync = jest
      .spyOn(listings, 'syncFromVehicle')
      .mockRejectedValueOnce(new Error('listing sync boom'));
    try {
      await expect(
        documents.applyOcr(tenantId, v.id, ownerId, doc.id, job.id, {
          fields: ['holderName', 'plateNumber'],
          applyPlateToVehicle: true,
        }),
      ).rejects.toThrow('listing sync boom');
    } finally {
      sync.mockRestore();
    }

    // KHÔNG có nửa vời: metadata giấy tờ chưa áp, job vẫn chờ đối soát, biển số xe nguyên.
    const detail = await documents.getOne(tenantId, v.id, doc.id);
    expect(detail.holderName).toBeNull();
    const jobRow = await prisma.vehicleDocumentOcrJob.findUnique({ where: { id: job.id } });
    expect(jobRow?.status).toBe(VEHICLE_DOCUMENT_OCR_STATUS.NEEDS_REVIEW);
    const vehicleRow = await prisma.vehicle.findUnique({
      where: { id: v.id },
      select: { plateNumber: true },
    });
    expect(vehicleRow?.plateNumber).toBe('51A-123.45');

    // Job còn needs_review nên đối soát lại được sau khi lỗi hạ tầng qua đi.
    const retried = await documents.applyOcr(tenantId, v.id, ownerId, doc.id, job.id, {
      fields: ['holderName'],
    });
    expect(retried.holderName).toBe('Nguyễn Văn An');
  });

  maybe('hai lượt gắn file ĐỒNG THỜI: khoá dòng serialize — version 1 & 2, không P2002 → 500', async () => {
    const v = await createVehicle('DOC-RACE');
    const doc = await createDocument(v.id);
    const [fileA, fileB] = await Promise.all([
      readyFile(v.id, doc.id, 'a.pdf'),
      readyFile(v.id, doc.id, 'b.pdf'),
    ]);

    const results = await Promise.allSettled([
      documents.attachVersion(tenantId, v.id, ownerId, doc.id, { fileId: fileA }),
      documents.attachVersion(tenantId, v.id, ownerId, doc.id, { fileId: fileB }),
    ]);
    // Cả hai thành công (xếp hàng qua FOR UPDATE) — hoặc tệ nhất một bên 409 ổn định.
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toMatchObject({ response: { code: API_ERROR_CODE.CONFLICT } });
      }
    }
    const versions = await prisma.vehicleDocumentVersion.findMany({
      where: { documentId: doc.id },
      select: { version: true },
      orderBy: { version: 'asc' },
    });
    // Số version không trùng nhau.
    expect(new Set(versions.map((row) => row.version)).size).toBe(versions.length);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    if (fulfilled.length === 2) {
      expect(versions.map((row) => row.version)).toEqual([1, 2]);
    }
  });

  maybe('một file không gắn được vào hai phiên bản (service 400 + unique DB là chốt cuối)', async () => {
    const v = await createVehicle('DOC-ONEFILE');
    const doc = await createDocument(v.id);
    const attached = await attachFile(v.id, doc.id);
    const fileId = attached.activeVersion!.file.id;

    // Service từ chối tường minh.
    await expect(
      documents.attachVersion(tenantId, v.id, ownerId, doc.id, { fileId }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });

    // Lách qua service, ghi thẳng DB → unique private_file_id chặn (P2002).
    await expect(
      prisma.vehicleDocumentVersion.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId: v.id,
          documentId: doc.id,
          privateFileId: fileId,
          version: 99,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  maybe('DB chặn version trỏ tới file của xe khác (composite FK — không dựa kỷ luật service)', async () => {
    const vehicleA = await createVehicle('DOC-FKA');
    const vehicleB = await createVehicle('DOC-FKB');
    const docA = await createDocument(vehicleA.id);
    const docB = await createDocument(vehicleB.id);
    const fileA = await readyFile(vehicleA.id, docA.id, 'a.pdf');
    // Đánh dấu ready cho chắc (readyFile chỉ presign + PUT giả; attach mới complete).
    await prisma.vehiclePrivateFile.update({
      where: { id: fileA },
      data: { status: 'ready' },
    });

    await expect(
      prisma.vehicleDocumentVersion.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId: vehicleB.id, // xe B nhưng file của xe A
          documentId: docB.id,
          privateFileId: fileA,
          version: 1,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  maybe('DB chặn hai job OCR processing trên cùng giấy tờ (partial unique)', async () => {
    const v = await createVehicle('OCR-UNIQ');
    const doc = await createDocument(v.id);
    const attached = await attachFile(v.id, doc.id);
    const versionId = attached.activeVersion!.id;

    const makeJob = (id: string) =>
      prisma.vehicleDocumentOcrJob.create({
        data: {
          id,
          tenantId,
          vehicleId: v.id,
          documentId: doc.id,
          documentVersionId: versionId,
          status: VEHICLE_DOCUMENT_OCR_STATUS.PROCESSING,
          provider: 'raw-test',
        },
      });
    await makeJob(newId());
    await expect(makeJob(newId())).rejects.toMatchObject({ code: 'P2002' });
  });

  maybe('xoá thẳng version đang active bị DB chặn (không còn SET NULL vào cột PK)', async () => {
    const v = await createVehicle('DOC-DELACT');
    const doc = await createDocument(v.id);
    const attached = await attachFile(v.id, doc.id);
    await expect(
      prisma.vehicleDocumentVersion.delete({ where: { id: attached.activeVersion!.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});

describe('API public không lộ giấy tờ; quyền endpoint đúng BỐN mức', () => {
  it('mọi path /public* trong OpenAPI không tham chiếu schema giấy tờ', () => {
    const spec = JSON.parse(
      readFileSync(join(__dirname, '../../../packages/types/openapi.json'), 'utf8'),
    ) as { paths: Record<string, unknown> };
    const publicPaths = Object.entries(spec.paths).filter(([path]) => path.startsWith('/public'));
    expect(publicPaths.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(publicPaths);
    expect(serialized).not.toMatch(/VehicleDocument|contract|privateFile/i);
  });

  function permissionsOf(method: keyof VehicleDocumentsController): string[] {
    const handler = VehicleDocumentsController.prototype[method] as unknown as object;
    return (Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[]) ?? [];
  }

  it('trạng thái = view; chi tiết = view_details; file/lịch sử = view_files; ghi = manage', () => {
    expect(permissionsOf('list')).toEqual([PERMISSION.VEHICLE_DOCUMENT_VIEW]);
    // Chi tiết nhạy cảm KHÔNG mở được bằng quyền view thường, và cũng KHÔNG kèm quyền file.
    expect(permissionsOf('getOne')).toEqual([PERMISSION.VEHICLE_DOCUMENT_DETAIL_VIEW]);
    expect(permissionsOf('listVersions')).toEqual([PERMISSION.VEHICLE_DOCUMENT_FILE_VIEW]);
    expect(permissionsOf('download')).toEqual([PERMISSION.VEHICLE_DOCUMENT_FILE_VIEW]);
    for (const method of ['create', 'update', 'archive', 'presign', 'attach', 'requestOcr'] as const) {
      expect(permissionsOf(method)).toEqual([PERMISSION.VEHICLE_DOCUMENT_MANAGE]);
    }
    // Áp OCR có thể ghi biển số vào xe → đòi thêm vehicles.update.
    expect(permissionsOf('applyOcr')).toEqual(
      expect.arrayContaining([PERMISSION.VEHICLE_DOCUMENT_MANAGE, PERMISSION.VEHICLE_UPDATE]),
    );
  });
});
