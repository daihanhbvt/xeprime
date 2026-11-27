import {
  COLLATERAL_COMBINATION,
  COLLATERAL_MODE,
  INSURANCE_MODE_DEFAULT,
  isPerKmDeliveryTier,
  POLICY_SECTION,
  POLICY_SECTION_FIELDS,
  type PolicySection,
  type LongTermPackageMonths,
} from '@xeprime/types';
import type { PolicyFormValues, VehiclePricingFormValues } from './schema';
import type { RentalPolicyValues, SaveRentalPolicyInput } from './types';

/**
 * Chuyển đổi hai chiều giữa API (tiền là STRING — ADR 0007) và form (số là `number | null`
 * theo quy ước `NumberField`). Sống một chỗ để trang shop và trang xe không tự chép mapping.
 */

const toNumber = (value: string | null | undefined): number | null =>
  value == null || value === '' ? null : Number(value);

const toMoneyString = (value: number | null | undefined): string => String(Math.round(value ?? 0));

/** Giá trị form khi CHƯA có chính sách (null-policy): mọi thứ tắt/trống, không bịa mặc định. */
export const EMPTY_POLICY_FORM: PolicyFormValues = {
  // Chưa cấu hình thì mặc định là "Có yêu cầu thế chấp" + cọc tiền chưa nhập số — KHÔNG phải "Miễn
  // thế chấp": đó là một lời hứa với khách, phải do chủ gian hàng chọn tường minh.
  collateralMode: COLLATERAL_MODE.REQUIRED,
  collateralCashEnabled: true,
  collateralAssetEnabled: false,
  collateralCombination: COLLATERAL_COMBINATION.ANY_ONE,
  collateralAssetTypes: [],
  depositAmount: null,
  deliveryEnabled: false,
  deliveryMaxRadiusKm: null,
  deliveryTiers: [],
  mileageLimitEnabled: false,
  includedDistanceKmPerDay: null,
  excessDistanceFeePerKm: null,
  overtimeFeePerHour: null,
  overtimeGraceMinutes: null,
  overtimeRoundingMinutes: null,
  overtimeEnabled: false,
  discountEnabled: false,
  discountTiers: [],
  // Gian hàng mới mặc định Tuỳ chọn (ADR 0091 điều 1) — Bắt buộc là lựa chọn chủ động của chủ xe.
  insuranceMode: INSURANCE_MODE_DEFAULT,
};

export function policyToForm(policy: RentalPolicyValues | null | undefined): PolicyFormValues {
  if (!policy) return EMPTY_POLICY_FORM;
  return {
    collateralMode: policy.collateralMode,
    collateralCashEnabled: policy.collateralCashEnabled,
    collateralAssetEnabled: policy.collateralAssetEnabled,
    collateralCombination: policy.collateralCombination,
    collateralAssetTypes: [...policy.collateralAssetTypes],
    depositAmount: toNumber(policy.depositAmount),
    deliveryEnabled: policy.deliveryEnabled,
    deliveryMaxRadiusKm: policy.deliveryMaxRadiusKm ?? null,
    /*
     * Mỗi bậc MỘT phí trọn gói — phí theo km đã gỡ (ADR 0078) và migration đã đổi mọi bậc theo km
     * thành trọn gói. Một bậc theo km còn sót (dữ liệu lạ) hiện ô phí TRỐNG để chủ xe tự nhập,
     * không đoán ra một con số.
     */
    deliveryTiers: policy.deliveryTiers.map((t) => ({
      toKm: t.toKm,
      fee: isPerKmDeliveryTier(t) ? null : toNumber(t.fee),
    })),
    /*
     * Công tắc suy ra từ DỮ LIỆU, không lưu riêng: API chỉ biết "cả hai null = không giới hạn".
     * Đủ một trong hai là đang có hạn mức — bật công tắc để chủ xe thấy ngay ô còn thiếu, thay
     * vì thấy một màn hình "tắt" trong khi chính sách hiệu lực thì không phải vậy.
     */
    mileageLimitEnabled:
      policy.includedDistanceKmPerDay != null || policy.excessDistanceFeePerKm != null,
    includedDistanceKmPerDay: policy.includedDistanceKmPerDay ?? null,
    excessDistanceFeePerKm: toNumber(policy.excessDistanceFeePerKm),
    overtimeFeePerHour: toNumber(policy.overtimeFeePerHour),
    overtimeGraceMinutes: policy.overtimeGraceMinutes ?? null,
    overtimeRoundingMinutes: policy.overtimeRoundingMinutes ?? null,
    // Công tắc quá giờ suy từ dữ liệu như hạn mức km: có phí hoặc thời gian miễn phí là đang bật.
    overtimeEnabled: policy.overtimeFeePerHour != null || policy.overtimeGraceMinutes != null,
    discountEnabled: policy.discountEnabled,
    // Mốc ưu đãi đã canonical theo THÁNG ở cả API lẫn DB (ADR 0011) — form không quy đổi gì.
    // Mốc cũ theo ngày không khớp gói nào nằm ở `legacyDiscountTiers`, hiển thị riêng dạng
    // cảnh báo và biến mất khi lưu lại; đưa vào form là remap ngầm, không được phép.
    discountTiers: policy.discountTiers.map((t) => ({
      minMonths: t.minMonths,
      percent: t.percent,
      note: t.note ?? '',
    })),
    insuranceMode: policy.insuranceMode ?? INSURANCE_MODE_DEFAULT,
  };
}

export function formToSaveInput(values: PolicyFormValues): SaveRentalPolicyInput {
  /*
   * Cọc kết hợp (ADR 0112 điều 2): chỉ phần của hình thức đang BẬT được gửi đi - tắt một hình thức
   * là gửi 0 / mảng rỗng (CHECK ở DB), và "Bắt buộc cả 2" chỉ có nghĩa khi cả hai cùng bật.
   */
  const required = values.collateralMode === COLLATERAL_MODE.REQUIRED;
  const cash = required && values.collateralCashEnabled === true;
  const asset = required && values.collateralAssetEnabled === true;
  return {
    collateralMode: values.collateralMode,
    collateralCashEnabled: cash,
    collateralAssetEnabled: asset,
    collateralCombination:
      cash && asset && values.collateralCombination === COLLATERAL_COMBINATION.ALL
        ? COLLATERAL_COMBINATION.ALL
        : COLLATERAL_COMBINATION.ANY_ONE,
    collateralAssetTypes: asset ? values.collateralAssetTypes : [],
    depositAmount: cash ? toMoneyString(values.depositAmount) : '0',
    deliveryEnabled: values.deliveryEnabled,
    deliveryMaxRadiusKm: values.deliveryEnabled ? (values.deliveryMaxRadiusKm ?? null) : null,
    deliveryTiers: (values.deliveryTiers ?? []).map((t) => ({
      toKm: t.toKm ?? 0,
      fee: toMoneyString(t.fee),
    })),
    /*
     * Tắt công tắc ⇒ gửi CẢ HAI về null, không giữ lại số cũ. Gửi nửa cặp là thứ
     * `PricingService.validatePolicy` và CHECK ở DB từ chối, và giữ lại số cũ là để một hạn mức
     * chủ xe vừa tắt vẫn còn hiệu lực với khách.
     */
    includedDistanceKmPerDay: values.mileageLimitEnabled
      ? (values.includedDistanceKmPerDay ?? null)
      : null,
    excessDistanceFeePerKm:
      values.mileageLimitEnabled && values.excessDistanceFeePerKm != null
        ? toMoneyString(values.excessDistanceFeePerKm)
        : null,
    /*
     * Công tắc quá giờ TẮT (chỉ form có công tắc mới đặt `false`) ⇒ gửi null cả hai, không giữ số cũ —
     * cùng lý do với hạn mức quãng đường.
     */
    overtimeFeePerHour:
      values.overtimeEnabled === false || values.overtimeFeePerHour == null
        ? null
        : toMoneyString(values.overtimeFeePerHour),
    overtimeGraceMinutes:
      values.overtimeEnabled === false ? null : (values.overtimeGraceMinutes ?? null),
    /*
     * Ô làm tròn đã gỡ khỏi web (06/11/2026): luôn null = làm tròn LÊN theo giờ, công thức mặc định
     * của quyết toán (`SettlementService`). Số cũ không còn ai thấy thì không được tiếp tục áp.
     */
    overtimeRoundingMinutes: null,
    discountEnabled: values.discountEnabled,
    discountTiers: (values.discountTiers ?? []).map((t) => ({
      minMonths: (t.minMonths ?? 1) as LongTermPackageMonths,
      percent: t.percent ?? 1,
      ...(t.note?.trim() ? { note: t.note.trim() } : {}),
    })),
    // Có ô chọn thì gửi; form không có ô này để trống ⇒ server giữ chế độ đang lưu (ADR 0091).
    ...(values.insuranceMode ? { insuranceMode: values.insuranceMode } : {}),
  };
}

/** Trích phần chính sách từ form giá theo xe (bỏ hai field giá). */
export function vehicleFormToPolicyInput(values: VehiclePricingFormValues): SaveRentalPolicyInput {
  return formToSaveInput(values);
}

/** Câu tóm tắt giao nhận nay ở `@xeprime/domain` — app native đọc ra đúng một câu với web. */
export { deliverySummaryText } from '@xeprime/domain';

/**
 * Ô của FORM thuộc từng mục chính sách (ADR 0112 điều 1) = cột của mục ở `POLICY_SECTION_FIELDS`
 * cộng các công tắc chỉ form mới có (hạn mức km, quá giờ). Dùng khi bật/tắt kế thừa một mục để đưa
 * đúng các ô của mục đó về giá trị đã lưu hoặc số của gian hàng.
 */
export const POLICY_SECTION_FORM_FIELDS: Readonly<
  Record<PolicySection, readonly (keyof PolicyFormValues)[]>
> = {
  [POLICY_SECTION.INSURANCE]: POLICY_SECTION_FIELDS[POLICY_SECTION.INSURANCE],
  [POLICY_SECTION.COLLATERAL]: POLICY_SECTION_FIELDS[POLICY_SECTION.COLLATERAL],
  [POLICY_SECTION.DELIVERY]: POLICY_SECTION_FIELDS[POLICY_SECTION.DELIVERY],
  [POLICY_SECTION.USAGE_LIMITS]: [
    ...POLICY_SECTION_FIELDS[POLICY_SECTION.USAGE_LIMITS],
    'mileageLimitEnabled',
    'overtimeEnabled',
  ],
  [POLICY_SECTION.LONG_TERM_DISCOUNT]: POLICY_SECTION_FIELDS[POLICY_SECTION.LONG_TERM_DISCOUNT],
};
