import {
  COLLATERAL_MODE,
  SERVICE_TYPE,
  vehicleFieldPolicy,
  type VehicleFieldApplicability,
} from '@xeprime/types';
import { deliveryTierRanges, freeDeliveryWithinKm, type DeliveryTierRange } from '@xeprime/domain';
import type { DomainGroup } from '@/i18n/domain';
import type { VehicleApprovalDetail } from './types';

/**
 * "Dòng nào hiện trên hồ sơ duyệt xe" — quyết định ở đây, định dạng ở component.
 *
 * Tách khỏi component vì đây là LUẬT, không phải trình bày: xe máy không có số chỗ, xe điện không
 * có lít/100km, xe chỉ chạy có tài xế không có giá ngày tự lái. Luật áp dụng trường đọc thẳng
 * `vehicleFieldPolicy` (@xeprime/types) — cùng ma trận mà form đăng xe dùng để hỏi và cổng gửi
 * duyệt dùng để chặn — nên hồ sơ duyệt không thể hiện một trường mà form chưa bao giờ hỏi.
 *
 * Hai quy tắc chung:
 *  - Trường KHÔNG ÁP DỤNG với loại xe/nguồn năng lượng thì không có dòng, dù dữ liệu cũ có giá trị.
 *  - Trường áp dụng nhưng TRỐNG thì cũng không có dòng — không có dòng "—" nào để quét qua.
 *    Ngoại lệ có chủ đích: công tắc (tự nhận chuyến, giao xe) luôn hiện, vì "Tắt" là thông tin.
 */

/** Giá trị một dòng — component chọn cách định dạng theo `kind`. */
export type ReviewValue =
  | { kind: 'text'; text: string }
  | { kind: 'domain'; group: DomainGroup; code: string }
  | { kind: 'domainList'; group: DomainGroup; codes: readonly string[] }
  /** Khoá danh mục hãng — tên hãng là dữ liệu danh mục, không dịch. */
  | { kind: 'brand'; code: string }
  | { kind: 'money'; amount: string; per?: 'day' | 'hour' | 'month' | 'km' }
  | { kind: 'percent'; value: number }
  | { kind: 'toggle'; on: boolean }
  | { kind: 'measure'; value: string | number; unit: MeasureUnit }
  | { kind: 'deliveryTiers'; tiers: readonly DeliveryTierRange[] }
  | { kind: 'longTermTiers'; tiers: readonly { minMonths: number; percent: number }[] }
  | { kind: 'unlimited' };

export type MeasureUnit =
  'seats' | 'cc' | 'litrePer100km' | 'km' | 'kwh' | 'kwhPer100km' | 'kmPerDay' | 'withinKm';

/** Khoá nhãn dưới `Approvals.fields` — union đóng, gõ sai là lỗi biên dịch. */
export type ReviewFieldLabel =
  | 'vehicleType'
  | 'name'
  | 'code'
  | 'plateNumber'
  | 'brand'
  | 'model'
  | 'manufactureYear'
  | 'color'
  | 'fuelType'
  | 'transmission'
  | 'services'
  | 'seatCount'
  | 'bodyType'
  | 'motorbikeCategory'
  | 'engineDisplacement'
  | 'fuelConsumption'
  | 'electricRange'
  | 'batteryCapacity'
  | 'electricConsumption'
  | 'weekdayPrice'
  | 'weekendPrice'
  | 'hourlyPrice'
  | 'discountPercent'
  | 'monthlyPrice'
  | 'longTermDiscount'
  | 'withDriverDailyPrice'
  | 'withDriverInterCityPrice'
  | 'withDriverOneWayPrice'
  | 'autoAccept'
  | 'delivery'
  | 'deliveryRadius'
  | 'deliveryFree'
  | 'deliveryFees'
  | 'mileageLimit'
  | 'excessFee'
  | 'collateral'
  | 'deposit'
  | 'collateralAssets'
  | 'overtimeFee'
  | 'terms';

export interface ReviewRow {
  /** Khoá React — duy nhất trong một khối. */
  id: string;
  label: ReviewFieldLabel;
  /**
   * Dịch vụ mà dòng này thuộc về, khi xe đăng NHIỀU dịch vụ và dòng lặp theo dịch vụ (tự nhận
   * chuyến, điều khoản). `null` = dòng chung.
   */
  service: string | null;
  value: ReviewValue;
  /** Dòng chữ dài (điều khoản) chiếm trọn bề ngang lưới. */
  wide?: boolean;
}

type ReviewVehicle = VehicleApprovalDetail['vehicle'];

function applies(applicability: VehicleFieldApplicability): boolean {
  return applicability !== 'hidden';
}

function present<T>(value: T | null | undefined): value is T {
  return (
    value !== null && value !== undefined && (typeof value !== 'string' || value.trim() !== '')
  );
}

/**
 * Khối "Thông tin xe" — trường chung trước, trường theo loại xe/nguồn năng lượng sau.
 */
export function vehicleInfoRows(vehicle: ReviewVehicle): ReviewRow[] {
  const policy = vehicleFieldPolicy(vehicle.vehicleType, vehicle.fuelType);
  const rows: ReviewRow[] = [];
  const push = (label: ReviewFieldLabel, value: ReviewValue) =>
    rows.push({ id: label, label, service: null, value });

  push('vehicleType', { kind: 'domain', group: 'vehicleType', code: vehicle.vehicleType });
  push('name', { kind: 'text', text: vehicle.name });
  push('code', { kind: 'text', text: vehicle.code });
  if (present(vehicle.plateNumber))
    push('plateNumber', { kind: 'text', text: vehicle.plateNumber });
  if (present(vehicle.brand)) push('brand', { kind: 'brand', code: vehicle.brand });
  if (present(vehicle.model)) push('model', { kind: 'text', text: vehicle.model });
  if (present(vehicle.manufactureYear)) {
    push('manufactureYear', { kind: 'text', text: String(vehicle.manufactureYear) });
  }
  if (present(vehicle.color)) push('color', { kind: 'text', text: vehicle.color });

  // Theo LOẠI xe: số chỗ + kiểu dáng với ô tô, phân khúc với xe máy.
  if (applies(policy.seatCount) && present(vehicle.seatCount)) {
    push('seatCount', { kind: 'measure', value: vehicle.seatCount, unit: 'seats' });
  }
  if (applies(policy.bodyType) && present(vehicle.bodyType)) {
    push('bodyType', { kind: 'domain', group: 'bodyType', code: vehicle.bodyType });
  }
  if (applies(policy.motorbikeCategory) && present(vehicle.motorbikeCategory)) {
    push('motorbikeCategory', {
      kind: 'domain',
      group: 'motorbikeCategory',
      code: vehicle.motorbikeCategory,
    });
  }

  // Theo NGUỒN NĂNG LƯỢNG.
  if (present(vehicle.fuelType)) {
    push('fuelType', { kind: 'domain', group: 'fuelType', code: vehicle.fuelType });
  }
  if (applies(policy.transmission) && present(vehicle.transmission)) {
    push('transmission', { kind: 'domain', group: 'transmissionType', code: vehicle.transmission });
  }
  if (applies(policy.engineDisplacementCc) && present(vehicle.engineDisplacementCc)) {
    push('engineDisplacement', {
      kind: 'measure',
      value: vehicle.engineDisplacementCc,
      unit: 'cc',
    });
  }
  if (applies(policy.fuelConsumption) && present(vehicle.fuelConsumptionCombined)) {
    push('fuelConsumption', {
      kind: 'measure',
      value: vehicle.fuelConsumptionCombined,
      unit: 'litrePer100km',
    });
  }
  if (applies(policy.electricRangeKm) && present(vehicle.electricRangeKm)) {
    push('electricRange', { kind: 'measure', value: vehicle.electricRangeKm, unit: 'km' });
  }
  if (applies(policy.batteryCapacityKwh) && present(vehicle.batteryCapacityKwh)) {
    push('batteryCapacity', { kind: 'measure', value: vehicle.batteryCapacityKwh, unit: 'kwh' });
  }
  if (applies(policy.electricConsumption) && present(vehicle.electricConsumptionKwhPer100Km)) {
    push('electricConsumption', {
      kind: 'measure',
      value: vehicle.electricConsumptionKwhPer100Km,
      unit: 'kwhPer100km',
    });
  }

  if (vehicle.serviceTypes.length > 0) {
    push('services', { kind: 'domainList', group: 'serviceType', codes: vehicle.serviceTypes });
  }
  return rows;
}

/**
 * Bậc phí giao xe → vùng miễn phí đứng đầu (nếu có) + các khoảng `từ–đến` còn lại.
 *
 * Khoảng, "miễn phí" và vùng miễn phí đầu do `deliveryTierRanges`/`freeDeliveryWithinKm`
 * (@xeprime/domain) quyết — cùng luật với dòng tóm tắt giao nhận khách thấy, với form chính sách
 * và với màn giao xe của chủ xe.
 */
export function splitDeliveryTiers(tiers: readonly { toKm: number; fee: string }[]): {
  freeWithinKm: number | null;
  paid: DeliveryTierRange[];
} {
  const ranges = deliveryTierRanges(tiers);
  const freeWithinKm = freeDeliveryWithinKm(tiers);
  return {
    freeWithinKm,
    paid: freeWithinKm === null ? ranges : ranges.slice(1),
  };
}

/**
 * Khối "Giá & chính sách cho thuê" — chỉ giá của DỊCH VỤ xe đăng, chỉ chính sách áp dụng.
 *
 * Giảm giá (`discountPercent`) là của TỰ LÁI; ưu đãi dài hạn là mốc theo THÁNG — hai thứ không
 * bao giờ đứng chung một dòng (ADR 0011).
 */
export function pricingPolicyRows(detail: VehicleApprovalDetail): ReviewRow[] {
  const { pricing, policy, services } = detail;
  const serviceTypes = detail.vehicle.serviceTypes;
  const selfDrive = serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE);
  const longTerm = serviceTypes.includes(SERVICE_TYPE.LONG_TERM);
  const withDriver = serviceTypes.includes(SERVICE_TYPE.WITH_DRIVER);
  const perService = services.length > 1;

  const rows: ReviewRow[] = [];
  const push = (label: ReviewFieldLabel, value: ReviewValue, extra: Partial<ReviewRow> = {}) =>
    rows.push({ id: extra.id ?? label, label, service: null, value, ...extra });
  const money = (
    label: ReviewFieldLabel,
    amount: string | null | undefined,
    per?: 'day' | 'hour' | 'month',
  ) => {
    if (present(amount)) push(label, { kind: 'money', amount, per });
  };

  if (selfDrive) {
    money('weekdayPrice', pricing.weekdayPrice, 'day');
    money('weekendPrice', pricing.weekendPrice, 'day');
    money('hourlyPrice', pricing.hourlyPrice, 'hour');
    if (present(pricing.discountPercent) && pricing.discountPercent > 0) {
      push('discountPercent', { kind: 'percent', value: pricing.discountPercent });
    }
  }
  if (longTerm) {
    money('monthlyPrice', pricing.monthlyPrice, 'month');
    if (policy?.discountEnabled && policy.discountTiers.length > 0) {
      push('longTermDiscount', { kind: 'longTermTiers', tiers: policy.discountTiers });
    }
  }
  if (withDriver) {
    money('withDriverDailyPrice', pricing.withDriverDailyPrice, 'day');
    money('withDriverInterCityPrice', pricing.withDriverInterCityPrice, 'day');
    money('withDriverOneWayPrice', pricing.withDriverOneWayPrice, 'day');
  }

  for (const service of services) {
    push(
      'autoAccept',
      { kind: 'toggle', on: service.autoAcceptEnabled },
      { id: `autoAccept-${service.serviceType}`, service: perService ? service.serviceType : null },
    );
  }

  if (policy) {
    push('delivery', { kind: 'toggle', on: policy.deliveryEnabled });
    if (policy.deliveryEnabled) {
      if (present(policy.deliveryMaxRadiusKm)) {
        push('deliveryRadius', { kind: 'measure', value: policy.deliveryMaxRadiusKm, unit: 'km' });
      }
      const { freeWithinKm, paid } = splitDeliveryTiers(policy.deliveryTiers);
      if (freeWithinKm !== null) {
        push('deliveryFree', { kind: 'measure', value: freeWithinKm, unit: 'withinKm' });
      }
      if (paid.length > 0) push('deliveryFees', { kind: 'deliveryTiers', tiers: paid });
    }

    // Giới hạn km là luật của chuyến TỰ LÁI (có tài xế thì tài xế lái, không đếm km khách).
    if (selfDrive) {
      push(
        'mileageLimit',
        present(policy.includedDistanceKmPerDay)
          ? { kind: 'measure', value: policy.includedDistanceKmPerDay, unit: 'kmPerDay' }
          : { kind: 'unlimited' },
      );
      if (present(policy.includedDistanceKmPerDay) && present(policy.excessDistanceFeePerKm)) {
        push('excessFee', { kind: 'money', amount: policy.excessDistanceFeePerKm, per: 'km' });
      }
    }

    push('collateral', { kind: 'domain', group: 'collateralMode', code: policy.collateralMode });
    if (policy.collateralMode === COLLATERAL_MODE.CASH) {
      push('deposit', { kind: 'money', amount: policy.depositAmount });
    }
    if (policy.collateralMode === COLLATERAL_MODE.ASSET && policy.collateralAssetTypes.length > 0) {
      push('collateralAssets', {
        kind: 'domainList',
        group: 'collateralAssetType',
        codes: policy.collateralAssetTypes,
      });
    }
    if (present(policy.overtimeFeePerHour)) {
      push('overtimeFee', { kind: 'money', amount: policy.overtimeFeePerHour, per: 'hour' });
    }
  }

  for (const service of services) {
    if (!present(service.termsText)) continue;
    push(
      'terms',
      { kind: 'text', text: service.termsText },
      {
        id: `terms-${service.serviceType}`,
        service: perService ? service.serviceType : null,
        wide: true,
      },
    );
  }
  return rows;
}

/**
 * Xe SỐNG còn khớp hồ sơ gửi duyệt không — server đã so (`approvalBlockers`), web chỉ đọc kết quả.
 * Có bất kỳ trường căn cước bị sửa hay điều kiện lên chợ bị rớt nào là chưa phê duyệt được.
 */
export function hasApprovalBlockers(blockers: VehicleApprovalDetail['approvalBlockers']): boolean {
  return blockers.changedLockedFields.length > 0 || blockers.missingRequirements.length > 0;
}

/**
 * Địa chỉ nhận xe ĐẦY ĐỦ một dòng: số nhà/đường · phường/xã · tỉnh/thành.
 *
 * Ưu tiên ghép từ ba mảnh đã tách; chỉ rơi về chuỗi `address` server ghép sẵn khi thiếu mảnh
 * chi tiết (dữ liệu chi nhánh cũ). Không bao giờ chỉ in mỗi tên tỉnh khi có nhiều hơn thế.
 */
export function pickupAddress(pickup: VehicleApprovalDetail['pickup']): string | null {
  if (!pickup) return null;
  const parts = [pickup.addressLine, pickup.wardName, pickup.provinceName].filter(present);
  if (present(pickup.addressLine) || !present(pickup.address)) {
    return parts.length > 0 ? parts.join(', ') : null;
  }
  return pickup.address;
}
