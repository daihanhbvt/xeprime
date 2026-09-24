import type { Prisma } from '@xeprime/prisma';
import {
  changedLockedVehicleFields,
  resolveEffectiveBilling,
  resolveStorefrontKind,
  SERVICE_TYPE,
  STOREFRONT_KIND_VALUES,
  VEHICLE_REVIEW_SNAPSHOT_VERSION,
  vehicleReviewAutoChecks,
  type PublishRequirement,
  type VehicleLockedField,
  type VehicleReviewPolicySnapshot,
  type VehicleReviewServiceSnapshot,
  type VehicleReviewSnapshot,
} from '@xeprime/types';
import {
  EFFECTIVE_SUBSCRIPTION_ARGS,
  effectiveSubscriptionWhere,
} from '../../common/plan/feature-state';
import type { EffectivePolicy } from '../pricing/pricing.service';

/**
 * ẢNH CHỤP HỒ SƠ XE lúc gửi duyệt — thứ người duyệt NHÌN và quyết định trên đó (24/09/2026).
 *
 * ## Vì sao phải chụp đủ, không chỉ các cột của `vehicles`
 *
 * Snapshot cũ (v1) chỉ mang các cột phẳng của bảng xe. Nhưng thứ khách nhìn thấy ngoài chợ còn
 * đến từ ba bảng khác: chính sách thuê hiệu lực (giao xe, giới hạn km, cọc), thiết lập theo dịch
 * vụ (tự nhận chuyến, điều khoản riêng) và tiện nghi. Duyệt thiếu ba thứ đó là duyệt một chiếc
 * xe mà người duyệt không thấy nửa lời hứa của nó với khách — và vì chúng đổi được bất cứ lúc
 * nào, đọc bản SỐNG lúc duyệt cũng không phải thứ đã được gửi.
 *
 * ## Một nơi dựng, hai nơi dùng
 *
 *  - `VehiclesService.createVehicleApprovalTask` — ghi vào `approval_tasks.snapshot_json` trong
 *    CÙNG transaction với phiếu, nên snapshot và phiếu không lệch nhau.
 *  - `PlatformVehicleApprovalService` — phiếu CŨ (v1/không có snapshot) được đọc bằng chính hàm
 *    này trên dữ liệu SỐNG, và DTO nói rõ `basis = live` để giao diện không trình bày nó như
 *    thứ đã gửi.
 *
 * Chính sách hiệu lực nhận từ nơi gọi (`PricingService.effectivePolicy`), không tự dựng lại
 * precedence ở đây: bản sao thứ hai của "ghi đè xe → mặc định theo loại → mặc định gian hàng" là
 * đúng loại luật lặp mà `ListingsService.resolveNoCollateral` đã phải giải thích vì sao nó tồn tại.
 *
 * Trả `null` khi xe không tồn tại — nơi gọi quyết định đó là 404 hay một phiếu mồ côi.
 */
export async function buildVehicleReviewSnapshot(
  db: Prisma.TransactionClient,
  args: { vehicleId: string; policy: EffectivePolicy | null; now: Date },
): Promise<VehicleReviewSnapshot | null> {
  const [vehicle, images, features, settings] = await Promise.all([
    db.vehicle.findUnique({
      where: { id: args.vehicleId },
      select: snapshotVehicleSelect(args.now),
    }),
    db.vehicleImage.findMany({
      where: { vehicleId: args.vehicleId },
      orderBy: { sortOrder: 'asc' },
      select: { imageUrl: true },
    }),
    db.vehicleFeature.findMany({
      where: { vehicleId: args.vehicleId },
      orderBy: { featureKey: 'asc' },
      select: { featureKey: true },
    }),
    db.vehicleServiceSetting.findMany({
      where: { vehicleId: args.vehicleId },
      select: { serviceType: true, autoAcceptEnabled: true, termsText: true },
    }),
  ]);
  if (!vehicle) return null;

  const billing = resolveEffectiveBilling(vehicle.tenant.subscriptions[0] ?? null, args.now);
  const branch = vehicle.branch;

  return {
    schemaVersion: VEHICLE_REVIEW_SNAPSHOT_VERSION,
    capturedAt: args.now.toISOString(),
    vehicle: {
      id: vehicle.id,
      code: vehicle.code,
      name: vehicle.name,
      plateNumber: vehicle.plateNumber,
      vehicleType: vehicle.vehicleType,
      serviceTypes: [...vehicle.serviceTypes],
      brand: vehicle.brand,
      model: vehicle.model,
      manufactureYear: vehicle.manufactureYear,
      color: vehicle.color,
      seatCount: vehicle.seatCount,
      bodyType: vehicle.bodyType,
      motorbikeCategory: vehicle.motorbikeCategory,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      fuelConsumptionCombined: decimalText(vehicle.fuelConsumptionCombined),
      engineDisplacementCc: vehicle.engineDisplacementCc,
      electricRangeKm: vehicle.electricRangeKm,
      batteryCapacityKwh: decimalText(vehicle.batteryCapacityKwh),
      electricConsumptionKwhPer100Km: decimalText(vehicle.electricConsumptionKwhPer100Km),
      description: vehicle.description,
      mainImageUrl: vehicle.mainImageUrl,
      // Ảnh đại diện ĐỨNG ĐẦU rồi mới tới thư viện, khử trùng theo URL — đúng tập mà cổng gửi
      // duyệt đếm (`countDistinctImages`), nên "đủ 4 ảnh" ở đây và ở đó là một con số.
      images: [
        ...new Set(
          [vehicle.mainImageUrl, ...images.map((image) => image.imageUrl)].filter(
            (url): url is string => typeof url === 'string' && url !== '',
          ),
        ),
      ],
      features: features.map((f) => f.featureKey),
    },
    pricing: {
      weekdayPrice: moneyText(vehicle.weekdayPrice),
      weekendPrice: moneyText(vehicle.weekendPrice),
      hourlyPrice: moneyText(vehicle.hourlyPrice),
      monthlyPrice: moneyText(vehicle.monthlyPrice),
      withDriverDailyPrice: moneyText(vehicle.withDriverDailyPrice),
      withDriverInterCityPrice: moneyText(vehicle.withDriverInterCityPrice),
      withDriverOneWayPrice: moneyText(vehicle.withDriverOneWayPrice),
      discountPercent: vehicle.discountPercent,
    },
    services: serviceSnapshots(vehicle.serviceTypes, settings),
    policy: args.policy ? policySnapshot(args.policy) : null,
    pickup: branch
      ? {
          branchId: branch.id,
          branchName: branch.name,
          address: branch.address,
          addressLine: branch.addressLine,
          wardName: branch.ward?.name ?? null,
          provinceCode: branch.provinceCode,
          provinceName: branch.province?.name ?? null,
        }
      : null,
    source: {
      /*
       * NGUỒN ĐĂNG = mặt tiền của tuyến thu phí hiệu lực (`resolveStorefrontKind`): gói ⇒ gian
       * hàng, mọi thứ khác (hoa hồng, chưa cấu hình) ⇒ cá nhân. KHÔNG đọc `tenant_type` — đó là
       * nhãn tự khai lúc mở hồ sơ, không phải năng lực (ADR 0014 điều 2).
       */
      storefrontKind: resolveStorefrontKind(billing.billingMode),
      tenantId: vehicle.tenant.id,
      name: vehicle.tenant.name,
    },
  };
}

/**
 * Đọc lại `snapshot_json` của một phiếu xe — `null` nếu không phải v2.
 *
 * jsonb không có kiểu, nên đây là biên phải kiểm: chỉ nhận đúng phiên bản và đủ các khối bắt
 * buộc. Phiếu v1 (hình dạng phẳng, không có `schemaVersion`) và phiếu không có snapshot đều trả
 * `null` để nơi gọi đi đường dữ liệu sống và NÓI RÕ điều đó — không vá nửa vời v1 thành một hồ sơ
 * trông như đầy đủ.
 */
export function readVehicleReviewSnapshot(raw: unknown): VehicleReviewSnapshot | null {
  if (!isRecord(raw) || raw.schemaVersion !== VEHICLE_REVIEW_SNAPSHOT_VERSION) return null;
  const { vehicle, pricing, source, services } = raw;
  if (!isRecord(vehicle) || !isRecord(pricing) || !isRecord(source) || !Array.isArray(services)) {
    return null;
  }
  if (typeof vehicle.id !== 'string' || typeof vehicle.vehicleType !== 'string') return null;
  if (!(STOREFRONT_KIND_VALUES as string[]).includes(String(source.storefrontKind))) return null;
  return raw as unknown as VehicleReviewSnapshot;
}

/** Vì sao chiếc xe HIỆN TẠI chưa phê duyệt được — rỗng cả hai ⇒ được. */
export interface VehicleApprovalBlockers {
  /** Điều kiện lên chợ xe hiện tại không còn đạt (chủ xe gỡ ảnh, xoá biển số… sau khi gửi). */
  missingRequirements: PublishRequirement[];
  /** Trường căn cước đã bị sửa sau khi gửi — duyệt sẽ khoá một giá trị chưa ai duyệt. */
  changedLockedFields: VehicleLockedField[];
}

/**
 * So xe SỐNG với ảnh chụp lúc gửi, ở đúng hai điểm mà một lời duyệt không được bỏ qua.
 *
 * Người duyệt quyết định trên ảnh chụp, nhưng Phê duyệt đưa XE SỐNG lên chợ và khoá căn cước của
 * nó. Trong lúc phiếu chờ, chủ xe vẫn sửa xe được, nên hai thứ có thể lệch:
 *
 *  1. xe sống không còn qua cổng lên chợ ⇒ duyệt là đưa lên chợ một chiếc xe thiếu điều kiện;
 *  2. căn cước đã đổi ⇒ duyệt là khoá biển số/loại xe/nhiên liệu mà không ai nhìn thấy, và danh mục
 *     "biển số hiển thị rõ", "không trùng xe" thành bằng chứng về một chiếc xe khác.
 *
 * Giá, ảnh, mô tả, chính sách đổi trong lúc chờ KHÔNG chặn: chúng vẫn sửa tự do sau khi duyệt.
 * Dùng chung cho cổng thật (`PlatformApprovalService.decide`, dưới khoá dòng) và cảnh báo trước ở
 * chi tiết phiếu — một phép so, hai nơi đọc.
 */
export function vehicleApprovalBlockers(
  live: VehicleReviewSnapshot,
  submitted: VehicleReviewSnapshot | null,
): VehicleApprovalBlockers {
  return {
    missingRequirements: vehicleReviewAutoChecks(live)
      .filter((check) => !check.passed)
      .map((check) => check.key),
    changedLockedFields: submitted
      ? changedLockedVehicleFields(submitted.vehicle, live.vehicle)
      : [],
  };
}

/**
 * `select` dựng THEO LẦN GỌI, không phải hằng module: điều kiện "dòng thuê bao đã bắt đầu" so
 * với `now`, và một hằng module scope sẽ đóng băng mốc đó ở lúc tiến trình khởi động — gói mua
 * sau đó không bao giờ được thấy, và nguồn đăng của mọi phiếu mới sẽ sai im lặng.
 */
function snapshotVehicleSelect(now: Date) {
  return {
    id: true,
    code: true,
    name: true,
    plateNumber: true,
    vehicleType: true,
    serviceTypes: true,
    brand: true,
    model: true,
    manufactureYear: true,
    color: true,
    seatCount: true,
    bodyType: true,
    motorbikeCategory: true,
    fuelType: true,
    transmission: true,
    fuelConsumptionCombined: true,
    engineDisplacementCc: true,
    electricRangeKm: true,
    batteryCapacityKwh: true,
    electricConsumptionKwhPer100Km: true,
    description: true,
    mainImageUrl: true,
    weekdayPrice: true,
    weekendPrice: true,
    hourlyPrice: true,
    monthlyPrice: true,
    withDriverDailyPrice: true,
    withDriverInterCityPrice: true,
    withDriverOneWayPrice: true,
    discountPercent: true,
    branch: {
      select: {
        id: true,
        name: true,
        address: true,
        addressLine: true,
        provinceCode: true,
        ward: { select: { name: true } },
        province: { select: { name: true } },
      },
    },
    tenant: {
      select: {
        id: true,
        name: true,
        subscriptions: {
          where: effectiveSubscriptionWhere(now),
          ...EFFECTIVE_SUBSCRIPTION_ARGS,
        },
      },
    },
  } satisfies Prisma.VehicleSelect;
}

/**
 * Dịch vụ có bảng thiết lập riêng (`vehicle_service_settings` — CHECK chỉ nhận hai mã này).
 * Thuê dài hạn không có tự nhận chuyến: gian hàng luôn chốt lịch bằng tay (ADR 0011).
 */
const SETTINGS_SERVICE_TYPES: readonly string[] = [
  SERVICE_TYPE.SELF_DRIVE,
  SERVICE_TYPE.WITH_DRIVER,
];

/**
 * Thiết lập theo dịch vụ, CHỈ cho dịch vụ xe đang đăng. Chưa có dòng thiết lập = mặc định của
 * server (tắt tự nhận, không điều khoản) — viết ra tường minh để người duyệt thấy "Tắt" chứ không
 * phải một ô trống khiến họ tự hỏi dữ liệu có bị mất không.
 */
function serviceSnapshots(
  serviceTypes: readonly string[],
  settings: ReadonlyArray<{
    serviceType: string;
    autoAcceptEnabled: boolean;
    termsText: string | null;
  }>,
): VehicleReviewServiceSnapshot[] {
  return serviceTypes
    .filter((type) => SETTINGS_SERVICE_TYPES.includes(type))
    .map((serviceType) => {
      const row = settings.find((s) => s.serviceType === serviceType);
      return {
        serviceType,
        autoAcceptEnabled: row?.autoAcceptEnabled ?? false,
        termsText: row?.termsText?.trim() ? row.termsText : null,
      };
    });
}

function policySnapshot(policy: EffectivePolicy): VehicleReviewPolicySnapshot {
  const v = policy.values;
  return {
    source: policy.source,
    collateralMode: v.collateralMode,
    collateralAssetTypes: [...v.collateralAssetTypes],
    depositAmount: v.depositAmount,
    deliveryEnabled: v.deliveryEnabled,
    deliveryMaxRadiusKm: v.deliveryEnabled ? v.deliveryMaxRadiusKm : null,
    deliveryTiers: v.deliveryEnabled
      ? v.deliveryTiers.map((tier) => ({ toKm: tier.toKm, fee: tier.fee }))
      : [],
    includedDistanceKmPerDay: v.includedDistanceKmPerDay,
    excessDistanceFeePerKm: v.excessDistanceFeePerKm,
    overtimeFeePerHour: v.overtimeFeePerHour,
    discountEnabled: v.discountEnabled,
    discountTiers: v.discountTiers.map((tier) => ({
      minMonths: tier.minMonths,
      percent: tier.percent,
    })),
  };
}

/** Tiền: Decimal → chuỗi số nguyên VND, cùng quy ước với DTO giá (`toFixed(0)`). */
function moneyText(value: Prisma.Decimal | null): string | null {
  return value == null ? null : value.toFixed(0);
}

/** Số đo (lít/100km, kWh): giữ phần thập phân, không đi qua float. */
function decimalText(value: Prisma.Decimal | null): string | null {
  return value == null ? null : value.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
