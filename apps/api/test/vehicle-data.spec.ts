import { BadRequestException, HttpException } from '@nestjs/common';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  CATALOG_REVIEW_STATUS,
  MEMBERSHIP_STATUS,
  POLICY_SOURCE,
  RENT_REFERENCE_BASIS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_DATA_ROW_ACTION,
  VEHICLE_DATA_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { Workbook } from 'exceljs';
import { AuditService } from '../src/modules/audit/audit.service';
import { CatalogModelService } from '../src/modules/catalog/catalog-model.service';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import { VehicleDataImportService } from '../src/modules/vehicle-data/vehicle-data-import.service';
import { VehicleDataQueryService } from '../src/modules/vehicle-data/vehicle-data-query.service';
import { VehicleDataSuggestionService } from '../src/modules/vehicle-data/vehicle-data-suggestion.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeVehicleDataService,
  makeVehiclesService,
  vehicleCreator,
} from './helpers/service-factory';

/**
 * Dữ liệu xe chuẩn (ADR 0090) trên PostgreSQL THẬT:
 *
 *   1. admin tạo/sửa xe chuẩn; trùng (dòng · phiên bản · năm từ) bị chặn;
 *   2. chủ xe gõ phiên bản / dòng xe mới ⇒ hệ thống TỰ GHI NHẬN một dòng chờ duyệt từ chính xe đó,
 *      cập nhật theo xe tới khi duyệt; xe thứ hai cùng tên gắn vào chính dòng đó;
 *   3. duyệt / gộp / từ chối đổi liên kết xe trong một transaction;
 *   4. nhập file: xem trước không ghi gì, áp dụng tạo + cập nhật, xuất ra rồi nhập lại là không đổi;
 *   5. gợi ý cho chủ xe: thông số, giá trị xe, giá thuê tham khảo.
 */
const prisma = createPrismaClient();
const db = prisma as unknown as PrismaService;
const audit = new AuditService(db);
const catalog = new CatalogService(db, audit);
const models = new CatalogModelService(db, audit);
const vehicleData = makeVehicleDataService(db);
const query = new VehicleDataQueryService(db);
const suggestions = new VehicleDataSuggestionService(db);
const imports = new VehicleDataImportService(db, audit, catalog, vehicleData, query);
const vehicles = makeVehiclesService(db);
const createVehicle = vehicleCreator(vehicles, db);

let dbAvailable = false;
let adminId: string;
let ownerId: string;
/** Một tài khoản đối tác thuộc tối đa MỘT gian hàng (ADR 0053) ⇒ gian hàng thứ hai có chủ riêng. */
let otherOwnerId: string;
let tenantId: string;
let otherTenantId: string;
const TAG = newId().slice(-6).toLowerCase();
/** Hãng riêng cho lần chạy này — mọi dòng xe / xe chuẩn của spec nằm dưới nó. */
const BRAND = `zz-brand-${TAG}`;
const BRAND_LABEL = `ZZ Hãng ${TAG}`;

async function expectCode(promise: Promise<unknown>, code: string) {
  let caught: unknown = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(HttpException);
  expect(((caught as HttpException).getResponse() as { code?: string }).code).toBe(code);
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
  adminId = newId();
  ownerId = newId();
  otherOwnerId = newId();
  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PLATFORM,
      id: adminId,
      displayName: 'Admin dữ liệu xe',
      email: `vd-adm-${adminId}@xeprime.test`,
    },
  });
  for (const id of [ownerId, otherOwnerId]) {
    await prisma.user.create({
      data: {
        realm: ACCOUNT_REALM.PARTNER,
        id,
        displayName: 'Chủ xe dữ liệu',
        email: `vd-own-${id}@xeprime.test`,
      },
    });
  }
  tenantId = newId();
  otherTenantId = newId();
  for (const [id, name, owner] of [
    [tenantId, 'Shop Dữ Liệu', ownerId],
    [otherTenantId, 'Shop Dữ Liệu 2', otherOwnerId],
  ] as const) {
    await prisma.tenant.create({
      data: {
        id,
        code: `T-${id.slice(-8)}`,
        slug: `t-${id.toLowerCase().slice(-10)}`,
        name,
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: owner,
      },
    });
    await prisma.tenantMembership.create({
      data: {
        id: newId(),
        tenantId: id,
        userId: owner,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    });
  }
  await prisma.catalogItem.create({
    data: {
      id: newId(),
      type: 'vehicle_brand',
      key: BRAND,
      label: BRAND_LABEL,
      vehicleTypes: [VEHICLE_TYPE.CAR, VEHICLE_TYPE.MOTORBIKE],
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.vehicleCatalogVariant.deleteMany({ where: { model: { brandKey: BRAND } } });
    await prisma.vehicleCatalogModel.deleteMany({ where: { brandKey: BRAND } });
    await prisma.vehicleCatalogImport.deleteMany({ where: { createdBy: adminId } });
    await prisma.catalogItem.deleteMany({ where: { type: 'vehicle_brand', key: BRAND } });
    await prisma.auditLog.deleteMany({
      where: { actorUserId: { in: [adminId, ownerId, otherOwnerId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, ownerId, otherOwnerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('admin quản lý xe chuẩn', () => {
  maybe(
    'tạo kèm dòng xe mới, trùng nhận dạng ⇒ 409, sửa giá, chi tiết + danh sách lọc',
    async () => {
      const id = await vehicleData.create(adminId, {
        vehicleType: VEHICLE_TYPE.CAR,
        brandKey: BRAND,
        newModelLabel: 'Sedan A',
        variantLabel: '1.5 CVT',
        yearFrom: 2023,
        seatCount: 5,
        bodyType: 'sedan',
        fuelType: 'gasoline',
        transmission: 'cvt',
        featureKeys: ['bluetooth'],
        listPrice: '545000000',
        weekdayPrice: '800000',
      });
      const detail = await query.detail(id);
      expect(detail).toMatchObject({
        brandLabel: BRAND_LABEL,
        modelLabel: 'Sedan A',
        modelPending: false,
        variantLabel: '1.5 CVT',
        status: VEHICLE_DATA_STATUS.ACTIVE,
        listPrice: '545000000',
        gaps: [],
      });
      // Giá trị theo năm: năm hiện tại 100%, lùi dần.
      expect(detail.valueByYear[0]).toMatchObject({ residualPercent: 100, amount: '545000000' });

      await expectCode(
        vehicleData.create(adminId, {
          modelId: detail.modelId,
          variantLabel: '1.5  cvt',
          yearFrom: 2023,
        }),
        API_ERROR_CODE.CATALOG_VARIANT_DUPLICATE,
      );
      // Cùng phiên bản, đời khác (năm bắt đầu khác) là một xe khác.
      await vehicleData.create(adminId, {
        modelId: detail.modelId,
        variantLabel: '1.5 CVT',
        yearFrom: 2018,
        yearTo: 2022,
      });

      await vehicleData.update(adminId, id, { weekdayPrice: '850000', active: false });
      const page = await query.list({ brandKey: BRAND, status: VEHICLE_DATA_STATUS.HIDDEN });
      expect(page.data.map((r) => r.id)).toEqual([id]);
      expect(page.data[0]).toMatchObject({
        weekdayPrice: '850000',
        status: VEHICLE_DATA_STATUS.HIDDEN,
      });
      const missing = await query.list({ brandKey: BRAND, gap: 'rent' });
      expect(missing.data.every((r) => r.gaps.includes('rent'))).toBe(true);
      expect(missing.data.length).toBeGreaterThan(0);
    },
  );

  maybe('xe máy không nhận số chỗ; xoá xe chuẩn đang có xe dùng ⇒ 409', async () => {
    await expect(
      vehicleData.create(adminId, {
        vehicleType: VEHICLE_TYPE.MOTORBIKE,
        brandKey: BRAND,
        newModelLabel: 'Scooter A',
        seatCount: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const id = await vehicleData.create(adminId, {
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      brandKey: BRAND,
      newModelLabel: 'Scooter A',
      variantLabel: 'Tiêu chuẩn',
      fuelType: 'gasoline',
      transmission: 'automatic_cvt',
      weekdayPrice: '150000',
    });
    const detail = await query.detail(id);
    const v = await createVehicle(otherTenantId, otherOwnerId, {
      code: `VD-S-${TAG}`,
      name: 'Xe máy A',
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      vehicleCatalogModelId: detail.modelId,
      vehicleCatalogVariantId: id,
    });
    expect(v.vehicleCatalogVariantId).toBe(id);
    await expectCode(vehicleData.remove(adminId, id), API_ERROR_CODE.CATALOG_VARIANT_IN_USE);
  });

  maybe('xoá dòng xe còn xe chuẩn sống ⇒ 409, không để xe chuẩn mồ côi (ADR 0096)', async () => {
    const id = await vehicleData.create(adminId, {
      vehicleType: VEHICLE_TYPE.CAR,
      brandKey: BRAND,
      newModelLabel: 'Dòng Còn Xe',
      variantLabel: 'Bản A',
    });
    const { modelId } = await query.detail(id);
    await expectCode(
      models.remove(adminId, modelId),
      API_ERROR_CODE.CATALOG_MODEL_HAS_VEHICLE_DATA,
    );
    // Xoá xe chuẩn rồi thì xoá được dòng.
    await vehicleData.remove(adminId, id);
    await models.remove(adminId, modelId);
    const row = await prisma.vehicleCatalogModel.findUniqueOrThrow({ where: { id: modelId } });
    expect(row.deletedAt).not.toBeNull();
  });
});

describe('tự ghi nhận từ xe của chủ xe + duyệt', () => {
  maybe(
    'gõ dòng xe + phiên bản mới ⇒ dòng chờ duyệt lấy dữ liệu xe; sửa giá ⇒ cập nhật; duyệt kéo theo dòng xe',
    async () => {
      const model = await models.createOwnerModel(tenantId, ownerId, {
        vehicleType: VEHICLE_TYPE.CAR,
        brandKey: BRAND,
        label: 'Mới Toanh',
      });
      expect(model.reviewStatus).toBe(CATALOG_REVIEW_STATUS.PENDING);
      // Dòng xe chờ duyệt không vào danh sách chung.
      const listed = await models.list({ vehicleType: VEHICLE_TYPE.CAR, brandKey: BRAND });
      expect(listed.some((m) => m.id === model.id)).toBe(false);

      const v = await createVehicle(tenantId, ownerId, {
        code: `VD-C-${TAG}`,
        name: 'Xe mới toanh',
        vehicleType: VEHICLE_TYPE.CAR,
        vehicleCatalogModelId: model.id,
        catalogVariantLabel: 'Bản Cao',
        manufactureYear: 2024,
        seatCount: 7,
        bodyType: 'sedan',
        fuelType: 'gasoline',
        transmission: 'automatic',
        weekdayPrice: '900000',
        features: ['bluetooth'],
      });
      expect(v.vehicleCatalogVariantId).toBeTruthy();
      const pending = await query.detail(v.vehicleCatalogVariantId!);
      expect(pending).toMatchObject({
        status: VEHICLE_DATA_STATUS.PENDING,
        modelPending: true,
        variantLabel: 'Bản Cao',
        yearFrom: 2024,
        seatCount: 7,
        weekdayPrice: '900000',
        featureKeys: ['bluetooth'],
        proposedByTenantName: 'Shop Dữ Liệu',
      });
      expect(pending.sourceVehicle?.id).toBe(v.id);

      // ADR 0096: cột hãng của tab Mẫu xe nói hãng nào có xe chờ duyệt (kể cả khi dòng xe của nó
      // còn chờ), và dải số liệu chỉ đếm trong phạm vi loại xe + hãng đang xem.
      const brandRow = (await models.brandSummary(VEHICLE_TYPE.CAR)).find(
        (b) => b.brandKey === BRAND,
      );
      expect(brandRow?.vehicleDataPending).toBe(1);
      expect(brandRow?.vehicleDataTotal).toBeGreaterThanOrEqual(1);
      expect(
        (await query.summary({ vehicleType: VEHICLE_TYPE.CAR, brandKey: BRAND })).pending,
      ).toBe(1);
      expect(
        (await query.summary({ vehicleType: VEHICLE_TYPE.MOTORBIKE, brandKey: BRAND })).pending,
      ).toBe(0);
      // Số đếm theo DÒNG: dòng mới do chủ xe gõ cũng có mặt (kèm `modelPending`) để tab Mẫu xe
      // hiện được nó; `matched` theo bộ lọc xe đang bật.
      const counts = await query.modelCounts({ vehicleType: VEHICLE_TYPE.CAR, brandKey: BRAND });
      expect(counts.find((c) => c.modelId === model.id)).toMatchObject({
        modelLabel: 'Mới Toanh',
        modelPending: true,
        total: 1,
        pending: 1,
        active: 0,
        matched: 1,
      });
      const hiddenOnly = await query.modelCounts({
        vehicleType: VEHICLE_TYPE.CAR,
        brandKey: BRAND,
        status: VEHICLE_DATA_STATUS.HIDDEN,
      });
      expect(hiddenOnly.find((c) => c.modelId === model.id)).toMatchObject({
        total: 1,
        matched: 0,
      });

      // Sửa giá xe ⇒ dòng chờ duyệt đi theo.
      await vehicles.savePricing(tenantId, v.id, ownerId, {
        source: POLICY_SOURCE.SHOP,
        weekdayPrice: '950000',
      });
      expect((await query.detail(pending.id)).weekdayPrice).toBe('950000');

      // Chờ duyệt: không gợi ý gì cho ai (kể cả xe đã tạo ra nó).
      const before = await suggestions.suggest({ modelId: model.id, variantId: pending.id });
      expect(before.record).toBeNull();

      // Xe thứ hai gõ cùng tên ⇒ gắn vào chính dòng chờ đó, không tạo thêm.
      const v2 = await createVehicle(tenantId, ownerId, {
        code: `VD-C2-${TAG}`,
        name: 'Xe mới toanh 2',
        vehicleType: VEHICLE_TYPE.CAR,
        vehicleCatalogModelId: model.id,
        catalogVariantLabel: 'bản cao',
      });
      expect(v2.vehicleCatalogVariantId).toBe(pending.id);

      // Admin sửa rồi duyệt ⇒ dòng xe mới duyệt theo, gợi ý mở.
      await vehicleData.update(adminId, pending.id, { listPrice: '700000000', yearFrom: 2023 });
      const result = await vehicleData.approve(adminId, pending.id, {});
      expect(result).toMatchObject({
        reviewStatus: CATALOG_REVIEW_STATUS.APPROVED,
        vehiclesAffected: 2,
      });
      const modelRow = await prisma.vehicleCatalogModel.findUniqueOrThrow({
        where: { id: model.id },
      });
      expect(modelRow.reviewStatus).toBe(CATALOG_REVIEW_STATUS.APPROVED);

      const after = await suggestions.suggest({
        modelId: model.id,
        variantId: pending.id,
        year: 2024,
      });
      expect(after.record?.seatCount).toBe(7);
      expect(after.value).toMatchObject({ residualPercent: expect.any(Number) });
      expect(after.rent.find((r) => r.field === 'weekdayPrice')).toMatchObject({
        reference: '950000',
        referenceBasis: RENT_REFERENCE_BASIS.RECORD,
      });
      await expectCode(
        vehicleData.approve(adminId, pending.id, {}),
        API_ERROR_CODE.CATALOG_REVIEW_INVALID,
      );
    },
  );

  maybe(
    'gộp: xe trỏ sang xe chuẩn đích, dòng xe mới bị gỡ; từ chối: xe bỏ liên kết, giữ tên',
    async () => {
      const targetId = await vehicleData.create(adminId, {
        vehicleType: VEHICLE_TYPE.CAR,
        brandKey: BRAND,
        newModelLabel: 'Đích Gộp',
        variantLabel: 'G',
        seatCount: 5,
      });
      const target = await query.detail(targetId);

      const typo = await models.createOwnerModel(tenantId, ownerId, {
        vehicleType: VEHICLE_TYPE.CAR,
        brandKey: BRAND,
        label: 'Dich Gop G',
      });
      const v = await createVehicle(otherTenantId, otherOwnerId, {
        code: `VD-M-${TAG}`,
        name: 'Xe gõ sai',
        vehicleType: VEHICLE_TYPE.CAR,
        vehicleCatalogModelId: typo.id,
      });
      // Không gõ phiên bản, nhưng dòng xe còn mới ⇒ ghi nhận dòng "không phân biệt phiên bản".
      const captured = await query.detail(v.vehicleCatalogVariantId!);
      expect(captured).toMatchObject({ variantLabel: '', status: VEHICLE_DATA_STATUS.PENDING });

      const merged = await vehicleData.merge(adminId, captured.id, { targetId });
      expect(merged.vehiclesAffected).toBe(1);
      const moved = await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } });
      expect(moved).toMatchObject({
        vehicleCatalogVariantId: targetId,
        vehicleCatalogModelId: target.modelId,
        model: 'Đích Gộp',
      });
      const typoRow = await prisma.vehicleCatalogModel.findUniqueOrThrow({
        where: { id: typo.id },
      });
      expect(typoRow.deletedAt).not.toBeNull();

      // Từ chối: chủ xe gõ phiên bản lạ cho một dòng đã duyệt.
      const v2 = await createVehicle(otherTenantId, otherOwnerId, {
        code: `VD-R-${TAG}`,
        name: 'Xe phiên bản lạ',
        vehicleType: VEHICLE_TYPE.CAR,
        vehicleCatalogModelId: target.modelId,
        catalogVariantLabel: 'asdf',
      });
      const junk = v2.vehicleCatalogVariantId!;
      expect(junk).not.toBe(targetId);
      await vehicleData.reject(adminId, junk, { reason: 'Không phải phiên bản thật' });
      const after = await prisma.vehicle.findUniqueOrThrow({ where: { id: v2.id } });
      expect(after.vehicleCatalogVariantId).toBeNull();
      expect(after.vehicleCatalogModelId).toBe(target.modelId);
      await expectCode(
        vehicleData.merge(adminId, targetId, { targetId: junk }),
        API_ERROR_CODE.CATALOG_REVIEW_INVALID,
      );
    },
  );

  maybe('gửi cả phiên bản có sẵn lẫn tên mới ⇒ 400', async () => {
    await expect(
      createVehicle(tenantId, ownerId, {
        code: `VD-X-${TAG}`,
        name: 'Xe hai lựa chọn',
        vehicleType: VEHICLE_TYPE.CAR,
        vehicleCatalogVariantId: newId(),
        catalogVariantLabel: 'X',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('nhập / xuất file', () => {
  async function upload(rows: Array<Array<string | number>>) {
    const wb = new Workbook();
    const ws = wb.addWorksheet('Dữ liệu xe');
    ws.addRow([
      'Mã',
      'Loại xe',
      'Hãng',
      'Dòng xe',
      'Phiên bản',
      'Năm từ',
      'Số chỗ',
      'Kiểu dáng',
      'Nhiên liệu',
      'Hộp số',
      'Giá bán mới (VNĐ)',
      'Giá thuê ngày thường (VNĐ)',
      'Trạng thái',
    ]);
    rows.forEach((r) => ws.addRow(r));
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return imports.preview(adminId, { buffer, originalname: 'du-lieu.xlsx', size: buffer.length });
  }

  maybe(
    'xem trước không ghi; áp dụng tạo; xuất rồi nhập lại = không đổi; sửa một ô = cập nhật',
    async () => {
      const preview = await upload([
        [
          '',
          'Ô tô',
          BRAND_LABEL,
          'Nhập Một',
          'Plus',
          2024,
          5,
          'Sedan',
          'Xăng',
          'CVT',
          600000000,
          700000,
          'Đang gợi ý',
        ],
        [
          '',
          'Ô tô',
          BRAND_LABEL,
          'Nhập Một',
          'Plus',
          2024,
          5,
          'Sedan',
          'Xăng',
          'CVT',
          600000000,
          700000,
          '',
        ],
      ]);
      expect(preview.summary).toMatchObject({
        rowsTotal: 2,
        rowsCreate: 1,
        rowsError: 1,
        newModels: 1,
      });
      expect(
        await prisma.vehicleCatalogModel.count({ where: { brandKey: BRAND, label: 'Nhập Một' } }),
      ).toBe(0);

      const applied = await imports.apply(adminId, preview.id);
      expect(applied.status).toBe('applied');
      const created = await query.list({ brandKey: BRAND, search: 'Nhập Một' });
      expect(created.data).toHaveLength(1);
      expect(created.data[0]).toMatchObject({
        variantLabel: 'Plus',
        listPrice: '600000000',
        origin: 'import',
      });
      await expectCode(
        imports.apply(adminId, preview.id),
        API_ERROR_CODE.CATALOG_IMPORT_NOT_PENDING,
      );

      // Xuất theo bộ lọc rồi tải lại nguyên file ⇒ mọi dòng "không đổi".
      const exported = await imports.exportData({ brandKey: BRAND, search: 'Nhập Một' });
      const again = await imports.preview(adminId, {
        buffer: exported.file,
        originalname: exported.fileName,
        size: exported.file.length,
      });
      expect(again.summary).toMatchObject({ rowsTotal: 1, rowsUnchanged: 1, rowsError: 0 });

      // Sửa một ô theo Mã ⇒ cập nhật đúng xe đó, liệt kê cũ → mới.
      const update = await upload([
        [created.data[0]!.id, '', '', '', '', '', '', '', '', '', '', 750000, ''],
      ]);
      expect(update.summary).toMatchObject({ rowsUpdate: 1 });
      const rows = await imports.rows(update.id, { action: VEHICLE_DATA_ROW_ACTION.UPDATE });
      expect(rows.data[0]!.changes).toEqual([
        { field: 'weekdayPrice', before: '700000', after: '750000' },
      ]);
      await imports.apply(adminId, update.id);
      expect((await query.detail(created.data[0]!.id)).weekdayPrice).toBe('750000');
    },
  );

  maybe('file không có bảng ⇒ CATALOG_IMPORT_FILE_INVALID', async () => {
    const buffer = Buffer.from('foo,bar\n1,2\n', 'utf8');
    await expectCode(
      imports.preview(adminId, { buffer, originalname: 'x.csv', size: buffer.length }),
      API_ERROR_CODE.CATALOG_IMPORT_FILE_INVALID,
    );
  });

  maybe('file mẫu đọc lại được: hai dòng ví dụ hợp lệ', async () => {
    const template = await imports.template();
    const preview = await imports.preview(adminId, {
      buffer: template.file,
      originalname: template.fileName,
      size: template.file.length,
    });
    expect(preview.summary.rowsError).toBe(0);
    expect(preview.summary.rowsTotal).toBe(2);
    await imports.discard(adminId, preview.id);
  });
});

describe('ô "Mẫu xe" gộp + tên xe tự ghép (ADR 0102)', () => {
  maybe(
    'theo hãng: mọi xe chuẩn đã duyệt đang bật, theo dòng rồi phiên bản; includeId luôn có',
    async () => {
      const a = await vehicleData.create(adminId, {
        vehicleType: VEHICLE_TYPE.CAR,
        brandKey: BRAND,
        newModelLabel: 'Gộp Một',
        variantLabel: 'Bản B',
        yearFrom: 2020,
        seatCount: 5,
      });
      const { modelId } = await query.detail(a);
      const b = await vehicleData.create(adminId, {
        modelId,
        variantLabel: 'Bản A',
        yearFrom: 2021,
      });
      const hidden = await vehicleData.create(adminId, {
        modelId,
        variantLabel: 'Bản Ẩn',
        yearFrom: 2019,
      });
      await vehicleData.update(adminId, hidden, { active: false });

      const rows = await vehicleData.listOptions({
        brandKey: BRAND,
        vehicleType: VEHICLE_TYPE.CAR,
      });
      const mine = rows.filter((r) => r.modelId === modelId).map((r) => r.id);
      expect(mine).toEqual([b, a]);

      const withAttached = await vehicleData.listOptions({
        brandKey: BRAND,
        vehicleType: VEHICLE_TYPE.CAR,
        includeId: hidden,
      });
      expect(withAttached[0]?.id).toBe(hidden);

      await expect(vehicleData.listOptions({ brandKey: BRAND })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  maybe(
    'tạo xe không gửi tên ⇒ server ghép "Hãng Dòng Phiên bản Năm"; không có dòng xe ⇒ 400',
    async () => {
      const variant = await vehicleData.create(adminId, {
        vehicleType: VEHICLE_TYPE.CAR,
        brandKey: BRAND,
        newModelLabel: 'Ghép Tên',
        variantLabel: '1.5G CVT',
        yearFrom: 2018,
      });
      const { modelId } = await query.detail(variant);

      const picked = await createVehicle(tenantId, ownerId, {
        code: `VD-N1-${TAG}`,
        vehicleType: VEHICLE_TYPE.CAR,
        vehicleCatalogModelId: modelId,
        vehicleCatalogVariantId: variant,
        manufactureYear: 2019,
      });
      expect(picked.name).toBe(`${BRAND_LABEL} Ghép Tên 1.5G CVT 2019`);
      // Gian hàng test chỉ giữ được 3 xe (chưa có gói) — gỡ xe vừa kiểm để lượt sau còn chỗ.
      const drop = (id: string) => prisma.vehicle.delete({ where: { id } });
      await drop(picked.id);

      const typed = await createVehicle(tenantId, ownerId, {
        code: `VD-N2-${TAG}`,
        vehicleType: VEHICLE_TYPE.CAR,
        vehicleCatalogModelId: modelId,
        catalogVariantLabel: 'Bản Tự Gõ',
      });
      expect(typed.name).toBe(`${BRAND_LABEL} Ghép Tên Bản Tự Gõ`);
      await drop(typed.id);

      const named = await createVehicle(tenantId, ownerId, {
        code: `VD-N3-${TAG}`,
        name: '  Xe Của Tôi ',
        vehicleType: VEHICLE_TYPE.CAR,
        vehicleCatalogModelId: modelId,
      });
      expect(named.name).toBe('Xe Của Tôi');
      await drop(named.id);

      await expectCode(
        createVehicle(tenantId, ownerId, { code: `VD-N4-${TAG}`, vehicleType: VEHICLE_TYPE.CAR }),
        API_ERROR_CODE.VEHICLE_NAME_REQUIRED,
      );
    },
  );
});
