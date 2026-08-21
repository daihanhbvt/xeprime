/**
 * Dựng ĐỘI XE của một gian hàng: xe, ảnh, tiện ích, hồ sơ nguồn xe, giấy tờ, bảo dưỡng, KM,
 * khoá xe và giá theo ngày.
 *
 * Mỗi chiếc suy tất định từ (mẫu xe, chỉ số trong đội) — không random. Chạy lại seed ra đúng
 * đội xe cũ, nên id, biển số và mã xe đều ổn định và `upsert` được.
 */
import {
  MAINTENANCE_STATUS,
  MAINTENANCE_TYPE,
  ODOMETER_SOURCE,
  PRIVATE_FILE_PURPOSE,
  PRIVATE_FILE_STATUS,
  SERVICE_TYPE,
  VEHICLE_BLOCK_REASON,
  VEHICLE_DOCUMENT_TYPE,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_SOURCE_TYPE,
  VEHICLE_TYPE,
} from '@xeprime/types';
import {
  PLATE_PREFIX,
  VEHICLE_COLORS,
  VEHICLE_MODEL_BY_KEY,
  driverPricesOf,
  monthlyPriceOf,
  type VehicleModelSpec,
} from './catalog';
import { dateOnlyFromToday, daysFromToday, photo, pick, prisma, seedId } from './context';
import type { ShopSpec } from './shops';

/** Một CHIẾC xe cụ thể — mẫu xe cộng với những gì làm nó khác các chiếc cùng dòng. */
export interface VehicleUnit {
  id: string;
  index: number;
  code: string;
  spec: VehicleModelSpec;
  branchId: string;
  branchProvinceCode: string;
  plate: string;
  year: number;
  color: string;
  serviceTypes: readonly string[];
  weekday: number;
  approved: boolean;
}

/** Xe 16 chỗ không cho thuê tự lái — luật vận tải, và cũng là một ca dữ liệu cần có thật. */
const DRIVER_ONLY_SEAT_THRESHOLD = 16;

function buildPlate(spec: VehicleModelSpec, provinceCode: string, index: number): string {
  const pools = PLATE_PREFIX[provinceCode] ?? PLATE_PREFIX['79']!;
  const isBike = spec.vehicleType === VEHICLE_TYPE.MOTORBIKE;
  const prefix = pick(isBike ? pools.bike : pools.car, index);
  const head = String(100 + ((index * 37) % 900));
  const tail = String((index * 17) % 100).padStart(2, '0');
  return `${prefix}-${head}.${tail}`;
}

/**
 * Dịch vụ mà một chiếc đăng ký. Mảng phải là tập con của năng lực dòng xe và không rỗng
 * (CHECK ở DB), nên mọi nhánh dưới đây luôn để lại ít nhất một giá trị.
 */
function buildServiceTypes(spec: VehicleModelSpec, index: number): string[] {
  if (spec.seatCount >= DRIVER_ONLY_SEAT_THRESHOLD) return [SERVICE_TYPE.WITH_DRIVER];

  const services: string[] = [SERVICE_TYPE.SELF_DRIVE];
  if (spec.longTerm && index % 2 === 0) services.push(SERVICE_TYPE.LONG_TERM);
  if (spec.withDriver && index % 3 === 0) services.push(SERVICE_TYPE.WITH_DRIVER);
  // Canonicalize (sort + dedupe) đúng như `VehiclesService` làm trước khi ghi — snapshot
  // marketplace copy nguyên mảng nên seed phải giữ cùng dạng chuẩn.
  return [...new Set(services)].sort();
}

/** Trạng thái duyệt public: đa số đã duyệt, cứ N chiếc để lại một chiếc chưa duyệt. */
function buildPublicStatus(spec: ShopSpec, index: number): string {
  if (spec.unapprovedEvery <= 0) return VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  if ((index + 1) % spec.unapprovedEvery !== 0) return VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  return pick(
    [
      VEHICLE_PUBLIC_STATUS.DRAFT,
      VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
      VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
    ],
    Math.floor(index / spec.unapprovedEvery),
  );
}

/**
 * Hồ sơ nguồn xe theo biến thể. Mỗi biến thể chỉ được điền đúng nhóm cột của nó — các CHECK
 * `vsd_*_fields_scoped` ở DB từ chối bản ghi lai, và đó là điều đúng: một chiếc xe không thể
 * vừa "mua đứt" vừa có khoản vay ngân hàng.
 */
function buildSourceDetail(
  sourceType: string,
  index: number,
): Record<string, unknown> {
  switch (sourceType) {
    case VEHICLE_SOURCE_TYPE.FINANCED:
      return {
        bankName: pick(['VPBank', 'Techcombank', 'Shinhan Bank', 'VIB'], index),
        contractNumber: `HDV-2024-${String(1000 + index)}`,
        originalPrincipal: 500_000_000,
        monthlyPrincipal: 8_500_000,
        monthlyInterest: 3_200_000,
        interestRatePercent: 9.5,
        termMonths: 60,
        interestMethod: 'reducing_balance',
        paymentDay: 5 + (index % 20),
        startDate: dateOnlyFromToday(-540),
        endDate: dateOnlyFromToday(1260),
        notes: 'Xe mua trả góp, giấy tờ gốc do ngân hàng giữ.',
      };
    case VEHICLE_SOURCE_TYPE.RENTED:
      return {
        ownerName: pick(['Nguyễn Văn Hùng', 'Trần Thị Nga', 'Lê Quang Vinh'], index),
        ownerPhone: `09${String(11000000 + index * 137).slice(0, 8)}`,
        ownerEmail: null,
        monthlyRent: 9_000_000,
        paymentDay: 10,
        startDate: dateOnlyFromToday(-365),
        endDate: dateOnlyFromToday(365),
        notes: 'Thuê lại của chủ xe theo tháng, gian hàng chịu bảo dưỡng.',
      };
    case VEHICLE_SOURCE_TYPE.PARTNERSHIP:
      return {
        ownerName: pick(['Phạm Hoài Nam', 'Đặng Thu Trang', 'Bùi Anh Khoa'], index),
        ownerPhone: `09${String(22000000 + index * 211).slice(0, 8)}`,
        ownerEmail: null,
        commissionPercent: 70,
        startDate: dateOnlyFromToday(-200),
        endDate: null,
        notes: 'Xe ký gửi, chủ xe hưởng 70% tiền thuê sau giảm giá.',
      };
    default:
      return {
        purchaseDate: dateOnlyFromToday(-700 - index * 11),
        purchasePrice: 480_000_000 + index * 5_000_000,
        purchasePlace: pick(['Đại lý Toyota Đông Sài Gòn', 'Hyundai Ngọc An', 'Kia Bình Triệu'], index),
        notes: null,
      };
  }
}

interface FleetDeps {
  tenantId: string;
  ownerUserId: string;
  branchIds: ReadonlyArray<{ id: string; provinceCode: string }>;
  brandLabels: ReadonlyMap<string, string>;
  withDocuments: boolean;
  withMaintenance: boolean;
}

/**
 * Thứ tự luân phiên chi nhánh khi rải đội xe, có TRỌNG SỐ nghiêng về chi nhánh mặc định.
 *
 * Chia đều 40 xe cho 4 chi nhánh là thứ chỉ có trong dữ liệu bịa: trụ sở chính bao giờ cũng
 * giữ phần lớn đội xe, chi nhánh nhỏ giữ vài chiếc. Mẫu `[0,1,0,2,0,3,0]` cho chi nhánh mặc
 * định khoảng một nửa, phần còn lại chia đều.
 */
function buildBranchRotation(count: number): number[] {
  if (count <= 1) return [0];
  const pattern = [0];
  for (let i = 1; i < count; i += 1) pattern.push(i, 0);
  return pattern;
}

/** Trải bản khai đội xe (`{model, count}`) thành danh sách từng chiếc. */
function expandFleet(spec: ShopSpec): VehicleModelSpec[] {
  const units: VehicleModelSpec[] = [];
  for (const entry of spec.fleet) {
    const model = VEHICLE_MODEL_BY_KEY.get(entry.model);
    if (!model) throw new Error(`Mẫu xe không có trong catalog: ${entry.model}`);
    for (let i = 0; i < entry.count; i += 1) units.push(model);
  }
  return units;
}

export async function buildFleet(spec: ShopSpec, deps: FleetDeps): Promise<VehicleUnit[]> {
  const models = expandFleet(spec);
  const rotation = buildBranchRotation(deps.branchIds.length);
  const units: VehicleUnit[] = [];

  for (const [index, model] of models.entries()) {
    const branch = deps.branchIds[rotation[index % rotation.length]!]!;
    const code = `XE-${String(index + 1).padStart(3, '0')}`;
    const vehicleId = seedId(`${spec.key}:vehicle:${code}`);
    const year = 2019 + (index % 6);
    const color = pick(VEHICLE_COLORS, index);
    const serviceTypes = buildServiceTypes(model, index);
    const publicStatus = buildPublicStatus(spec, index);
    const brandLabel = deps.brandLabels.get(model.brand) ?? model.brand;
    const driverPrices = serviceTypes.includes(SERVICE_TYPE.WITH_DRIVER)
      ? driverPricesOf(model)
      : null;
    const sourceType = pick(
      [
        VEHICLE_SOURCE_TYPE.OWNED,
        VEHICLE_SOURCE_TYPE.OWNED,
        VEHICLE_SOURCE_TYPE.FINANCED,
        VEHICLE_SOURCE_TYPE.RENTED,
        VEHICLE_SOURCE_TYPE.PARTNERSHIP,
      ],
      index,
    );

    const fields = {
      branchId: branch.id,
      name: `${brandLabel} ${model.model} ${year}`,
      plateNumber: buildPlate(model, branch.provinceCode, index + spec.key.length),
      vehicleType: model.vehicleType,
      serviceTypes,
      brand: model.brand,
      model: model.model,
      manufactureYear: year,
      color,
      seatCount: model.seatCount,
      fuelType: model.fuelType,
      bodyType: model.bodyType,
      sourceType,
      lengthMm: model.size?.[0] ?? null,
      widthMm: model.size?.[1] ?? null,
      heightMm: model.size?.[2] ?? null,
      curbWeightKg: model.size?.[3] ?? null,
      engineDisplacementCc: model.engineCc,
      horsepowerHp: model.horsepower,
      transmission: model.transmission,
      fuelConsumptionCity: model.consumption?.[0] ?? null,
      fuelConsumptionHighway: model.consumption?.[1] ?? null,
      fuelConsumptionCombined: model.consumption?.[2] ?? null,
      description: model.description,
      mainImageUrl: photo(model.photos[0]!),
      weekdayPrice: model.weekday,
      weekendPrice: model.weekend,
      hourlyPrice: model.hourly,
      monthlyPrice: serviceTypes.includes(SERVICE_TYPE.LONG_TERM) ? monthlyPriceOf(model) : null,
      withDriverDailyPrice: driverPrices?.daily ?? null,
      withDriverInterCityPrice: driverPrices?.interCity ?? null,
      withDriverOneWayPrice: driverPrices?.oneWay ?? null,
      deliveryEnabled: index % 3 !== 2,
      // `noCollateral` KHÔNG ghi ở đây: từ 20/08 nhãn "miễn thế chấp" là hệ quả của chính sách
      // thuê, và `ListingsService` mới là bên suy ra nó (ADR 0008).
      discountPercent: index % 5 === 0 ? 10 : index % 7 === 0 ? 15 : null,
      publicStatus,
      operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
    };

    await prisma.vehicle.upsert({
      where: { tenantId_code: { tenantId: deps.tenantId, code } },
      update: fields,
      create: {
        id: vehicleId,
        tenantId: deps.tenantId,
        code,
        createdBy: deps.ownerUserId,
        ...fields,
      },
    });

    // Ảnh và tiện ích ghi theo kiểu THAY TẬP (giống `VehiclesService.replaceMedia`) — chạy lại
    // seed không nhân bản gallery.
    await prisma.vehicleImage.deleteMany({ where: { vehicleId } });
    await prisma.vehicleImage.createMany({
      data: model.photos.slice(1).map((id, i) => ({
        id: seedId(`${spec.key}:image:${code}:${i}`),
        vehicleId,
        tenantId: deps.tenantId,
        imageUrl: photo(id),
        sortOrder: i,
      })),
    });
    await prisma.vehicleFeature.deleteMany({ where: { vehicleId } });
    await prisma.vehicleFeature.createMany({
      data: model.features.map((featureKey) => ({
        id: seedId(`${spec.key}:feature:${code}:${featureKey}`),
        vehicleId,
        featureKey,
      })),
    });

    const sourceFields = { sourceType, ...buildSourceDetail(sourceType, index) };
    await prisma.vehicleSourceDetail.upsert({
      where: { vehicleId },
      update: sourceFields,
      create: {
        id: seedId(`${spec.key}:source:${code}`),
        tenantId: deps.tenantId,
        vehicleId,
        ...sourceFields,
      },
    });

    units.push({
      id: vehicleId,
      index,
      code,
      spec: model,
      branchId: branch.id,
      branchProvinceCode: branch.provinceCode,
      plate: fields.plateNumber,
      year,
      color,
      serviceTypes,
      weekday: model.weekday,
      approved: publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
    });
  }

  if (deps.withDocuments) await buildVehicleDocuments(spec, deps, units);
  if (deps.withMaintenance) await buildMaintenance(spec, deps, units);

  return units;
}

// ---------------------------------------------------------------------------
// Giấy tờ xe (Wave 5) — file riêng tư → phiên bản → giấy tờ
// ---------------------------------------------------------------------------

/**
 * Ba loại giấy tờ với ba tình trạng hạn khác nhau: còn hạn dài, SẮP hết hạn, ĐÃ hết hạn.
 * Bảng cảnh báo giấy tờ chỉ có nghĩa khi cả ba trạng thái đều có bản ghi thật để hiện ra.
 */
const DOCUMENT_PLAN = [
  { type: VEHICLE_DOCUMENT_TYPE.REGISTRATION, issued: -900, expires: null, label: 'Cà vẹt xe' },
  { type: VEHICLE_DOCUMENT_TYPE.INSPECTION, issued: -300, expires: 240, label: 'Sổ đăng kiểm' },
  { type: VEHICLE_DOCUMENT_TYPE.INSURANCE, issued: -340, expires: 20, label: 'Bảo hiểm TNDS' },
] as const;

/** Số xe đầu đội được làm hồ sơ giấy tờ đầy đủ — đủ để mọi màn có dữ liệu, không cần cả 40 xe. */
const DOCUMENTED_VEHICLES = 8;

async function buildVehicleDocuments(
  spec: ShopSpec,
  deps: FleetDeps,
  units: readonly VehicleUnit[],
): Promise<void> {
  for (const unit of units.slice(0, DOCUMENTED_VEHICLES)) {
    for (const [i, plan] of DOCUMENT_PLAN.entries()) {
      // Chiếc thứ 3 trở đi cố ý THIẾU bảo hiểm: "chưa có giấy tờ" cũng là một trạng thái
      // nghiệp vụ, và nó phải xuất hiện trong dữ liệu chứ không chỉ trong tài liệu.
      if (plan.type === VEHICLE_DOCUMENT_TYPE.INSURANCE && unit.index % 3 === 2) continue;

      const docId = seedId(`${spec.key}:doc:${unit.code}:${plan.type}`);
      const fileId = seedId(`${spec.key}:docfile:${unit.code}:${plan.type}`);
      const versionId = seedId(`${spec.key}:docver:${unit.code}:${plan.type}`);
      // Hạn lệch nhau theo từng xe, và cố ý trải qua CẢ MỐC HÔM NAY: vài chiếc đã hết hạn,
      // vài chiếc sắp hết, còn lại yên. Bảng cảnh báo giấy tờ chỉ chứng minh được là nó chạy
      // đúng khi có bản ghi thật ở cả ba phía của mốc đó.
      const expiresAt =
        plan.expires === null ? null : dateOnlyFromToday(plan.expires + unit.index * 9 - 40);

      const docFields = {
        type: plan.type,
        documentNumber: `${plan.type.slice(0, 3).toUpperCase()}-${unit.plate.replace(/[^0-9]/g, '')}`,
        holderName: spec.profile.ownerFullName,
        holderAddress: spec.profile.address,
        plateNumber: unit.plate,
        chassisNumber: `RL4${String(100000 + unit.index * 997).slice(0, 6)}VN${unit.index}`,
        engineNumber: `E${String(200000 + unit.index * 811).slice(0, 6)}`,
        issuedAt: dateOnlyFromToday(plan.issued),
        expiresAt,
        notes: null,
      };

      await prisma.vehicleDocument.upsert({
        where: { id: docId },
        update: docFields,
        create: {
          id: docId,
          tenantId: deps.tenantId,
          vehicleId: unit.id,
          createdBy: deps.ownerUserId,
          ...docFields,
        },
      });

      // Thứ tự bắt buộc: file riêng tư → phiên bản → trỏ `activeVersionId`. Khoá ngoại tổ hợp
      // ở DB đòi file cùng tenant + cùng xe với phiên bản, nên không thể tạo ngược lại.
      const fileFields = {
        purpose: PRIVATE_FILE_PURPOSE.VEHICLE_DOCUMENT,
        originalName: `${plan.label} - ${unit.plate}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 240_000 + i * 10_000,
        status: PRIVATE_FILE_STATUS.READY,
        completedAt: daysFromToday(plan.issued, 4),
      };
      await prisma.vehiclePrivateFile.upsert({
        where: { id: fileId },
        update: fileFields,
        create: {
          id: fileId,
          tenantId: deps.tenantId,
          vehicleId: unit.id,
          objectKey: `tenants/${deps.tenantId}/vehicles/${unit.id}/documents/${fileId}.pdf`,
          createdBy: deps.ownerUserId,
          ...fileFields,
        },
      });

      await prisma.vehicleDocumentVersion.upsert({
        where: { id: versionId },
        update: {},
        create: {
          id: versionId,
          tenantId: deps.tenantId,
          vehicleId: unit.id,
          documentId: docId,
          privateFileId: fileId,
          version: 1,
          uploadedBy: deps.ownerUserId,
        },
      });

      await prisma.vehicleDocument.update({
        where: { id: docId },
        data: { activeVersionId: versionId },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Bảo dưỡng & KM
// ---------------------------------------------------------------------------

/**
 * Hồ sơ KM + lịch sử đọc KM + phiếu bảo dưỡng.
 *
 * `current_odometer_km` là số DẪN XUẤT — ở đây nó được đặt từ chính lần đọc cuối cùng vừa ghi,
 * không phải một con số rời. Ghi lệch hai thứ đó là cách nhanh nhất để dựng ra dữ liệu demo mà
 * màn "truy vết nguồn KM" chỉ vào một bản ghi không tồn tại.
 */
async function buildMaintenance(
  spec: ShopSpec,
  deps: FleetDeps,
  units: readonly VehicleUnit[],
): Promise<void> {
  for (const unit of units) {
    const km = 18_000 + unit.index * 2_450;
    const readingId = seedId(`${spec.key}:odo:${unit.code}:import`);
    const recordedAt = daysFromToday(-45, 2);

    await prisma.vehicleOdometerReading.upsert({
      where: { id: readingId },
      update: { odometerKm: km, recordedAt },
      create: {
        id: readingId,
        tenantId: deps.tenantId,
        vehicleId: unit.id,
        odometerKm: km,
        previousKm: null,
        source: ODOMETER_SOURCE.IMPORT,
        recordedAt,
        recordedBy: deps.ownerUserId,
      },
    });

    const profileFields = {
      currentOdometerKm: km,
      currentOdometerSource: ODOMETER_SOURCE.IMPORT,
      currentOdometerAt: recordedAt,
      currentOdometerReadingId: readingId,
      oilChangeIntervalKm: unit.spec.vehicleType === VEHICLE_TYPE.MOTORBIKE ? 2_000 : 5_000,
      lastServiceKm: km - (unit.index % 5) * 900,
      lastServiceAt: dateOnlyFromToday(-60 - (unit.index % 20)),
    };
    await prisma.vehicleMaintenanceProfile.upsert({
      where: { vehicleId: unit.id },
      update: profileFields,
      create: { vehicleId: unit.id, tenantId: deps.tenantId, ...profileFields },
    });

    // Một phiếu bảo dưỡng ĐÃ HOÀN TẤT cho mọi xe — lịch sử chi phí của đội xe.
    const doneId = seedId(`${spec.key}:maint:${unit.code}:done`);
    const doneFields = {
      type: MAINTENANCE_TYPE.OIL_CHANGE,
      title: 'Thay nhớt và lọc gió định kỳ',
      status: MAINTENANCE_STATUS.COMPLETED,
      completedAt: daysFromToday(-60 - (unit.index % 20), 4),
      odometerKm: profileFields.lastServiceKm,
      providerName: pick(['Garage Thành Đạt', 'Toyota Đông Sài Gòn', 'Head Honda Quận 5'], unit.index),
      cost: unit.spec.vehicleType === VEHICLE_TYPE.MOTORBIKE ? 180_000 : 1_250_000,
      notes: null,
    };
    await prisma.vehicleMaintenanceRecord.upsert({
      where: { id: doneId },
      update: doneFields,
      create: {
        id: doneId,
        tenantId: deps.tenantId,
        vehicleId: unit.id,
        createdBy: deps.ownerUserId,
        ...doneFields,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Chiếm dụng lịch KHÔNG phải đơn thuê: khoá xe và bảo dưỡng có kế hoạch
// ---------------------------------------------------------------------------

/**
 * Khoá xe và lịch bảo dưỡng nằm ở CỬA SỔ THỜI GIAN RIÊNG (+19..+21 và +23..+26), tách khỏi
 * cửa sổ của đơn thuê. Không phải để cho đẹp: `vehicle_occupancies` có exclusion constraint,
 * nên hai nguồn chồng khoảng nhau là seed đổ ngay tại dòng INSERT thứ hai (ADR 0006).
 */
export async function buildNonBookingOccupancy(
  spec: ShopSpec,
  deps: { tenantId: string; ownerUserId: string },
  units: readonly VehicleUnit[],
  longTermHeld: ReadonlySet<string>,
): Promise<{ blocks: number; scheduledMaintenance: number }> {
  let blocks = 0;
  let scheduledMaintenance = 0;

  for (const unit of units) {
    // Xe đang bị giữ bởi hợp đồng dài hạn chạy xuyên nhiều tháng thì mọi cửa sổ khác đều nằm
    // trong khoảng đó — không khoá, không xếp bảo dưỡng.
    if (longTermHeld.has(unit.id)) continue;

    if (unit.index % 11 === 5) {
      const blockId = seedId(`${spec.key}:block:${unit.code}`);
      const startAt = daysFromToday(19, 1);
      const endAt = daysFromToday(21, 10);
      const blockFields = {
        startAt,
        endAt,
        reason: VEHICLE_BLOCK_REASON.INTERNAL_USE,
        note: 'Xe dùng cho việc nội bộ của gian hàng.',
      };
      await prisma.vehicleBlock.upsert({
        where: { id: blockId },
        update: blockFields,
        create: {
          id: blockId,
          tenantId: deps.tenantId,
          vehicleId: unit.id,
          createdBy: deps.ownerUserId,
          ...blockFields,
        },
      });
      await prisma.vehicleOccupancy.create({
        data: {
          id: seedId(`${spec.key}:occ:block:${unit.code}`),
          tenantId: deps.tenantId,
          vehicleId: unit.id,
          sourceType: 'blocked_range',
          sourceId: blockId,
          startAt,
          endAt,
        },
      });
      blocks += 1;
    }

    if (unit.index % 6 === 4) {
      const planId = seedId(`${spec.key}:maint:${unit.code}:planned`);
      const plannedStartAt = daysFromToday(23, 2);
      const plannedEndAt = daysFromToday(26, 10);
      const planFields = {
        type: MAINTENANCE_TYPE.PERIODIC_SERVICE,
        title: 'Bảo dưỡng định kỳ theo mốc KM',
        status: MAINTENANCE_STATUS.SCHEDULED,
        plannedStartAt,
        plannedEndAt,
        providerName: 'Garage Thành Đạt',
        notes: 'Đã đặt lịch với garage, xe không nhận đơn trong khoảng này.',
      };
      await prisma.vehicleMaintenanceRecord.upsert({
        where: { id: planId },
        update: planFields,
        create: {
          id: planId,
          tenantId: deps.tenantId,
          vehicleId: unit.id,
          createdBy: deps.ownerUserId,
          ...planFields,
        },
      });
      await prisma.vehicleOccupancy.create({
        data: {
          id: seedId(`${spec.key}:occ:maint:${unit.code}`),
          tenantId: deps.tenantId,
          vehicleId: unit.id,
          sourceType: 'maintenance',
          sourceId: planId,
          startAt: plannedStartAt,
          endAt: plannedEndAt,
        },
      });
      scheduledMaintenance += 1;
    }
  }

  return { blocks, scheduledMaintenance };
}

// ---------------------------------------------------------------------------
// Giá riêng theo ngày
// ---------------------------------------------------------------------------

/** Giá lễ/cao điểm cho vài xe — để màn lịch giá có dữ liệu ghi đè thật. */
export async function buildDailyPrices(
  spec: ShopSpec,
  tenantId: string,
  ownerUserId: string,
  units: readonly VehicleUnit[],
): Promise<number> {
  let count = 0;
  for (const unit of units) {
    if (unit.index % 8 !== 3) continue;
    for (const offset of [14, 15, 16]) {
      const date = dateOnlyFromToday(offset);
      const fields = {
        dailyPrice: Math.round((unit.weekday * 1.3) / 10_000) * 10_000,
        hourlyPrice: null,
        note: 'Giá cao điểm cuối tuần dài',
        updatedBy: ownerUserId,
      };
      await prisma.vehicleDailyPrice.upsert({
        where: { vehicleId_date: { vehicleId: unit.id, date } },
        update: fields,
        create: {
          id: seedId(`${spec.key}:price:${unit.code}:${offset}`),
          tenantId,
          vehicleId: unit.id,
          date,
          createdBy: ownerUserId,
          ...fields,
        },
      });
      count += 1;
    }
  }
  return count;
}
