import * as yup from 'yup';
import {
  DEPOSIT_PERCENT_MAX,
  DEPOSIT_PERCENT_MIN,
  FEE_SCHEDULE_DEFAULTS,
  FREE_CANCEL_HOURS_MAX,
  HOLD_FREE_CANCEL_HOURS,
  HOLD_MIN_AMOUNT,
  HOLD_MIN_USABLE_WINDOW_MINUTES,
  HOLD_PAYMENT_WINDOW_MINUTES,
  HOLD_PAYMENT_WINDOW_MINUTES_MAX,
  MONEY_STEP_VND,
  OWNER_COMMISSION_PERCENT_MAX,
  OWNER_COMMISSION_FROM_DAY_MAX,
  OWNER_COMMISSION_TIERS_MAX,
  SERVICE_TYPE_VALUES,
  TAX_CATEGORY_BY_SERVICE_TYPE,
  TAX_CATEGORY_VALUES,
  TAX_LEGAL_BASIS_DEFAULT,
  TAX_LEGAL_BASIS_MAX_LENGTH,
  TAX_PIT_PERCENT_MAX,
  TAX_RATES_DEFAULTS,
  TAX_VAT_PERCENT_MAX,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  computeTieredOwnerCommission,
  feePolicyActivationBlockers,
  ownerCommissionPercentForDay,
  ownerCommissionTiersValid,
  parseTaxRates,
  taxRateTotalPercent,
  type FeePolicyValues,
  type OwnerCommissionTier,
  type PerVehicleTypeAmount,
  type ServiceType,
  type TaxRatesByServiceType,
  type VehicleType,
} from '@xeprime/types';
import type { FeePolicy, UpsertFeePolicyInput } from './types';

/**
 * Form chính sách phí — LUỒNG TIỀN v2 (phí sàn cố định `S`, hoa hồng lũy tiến `H`, bảo hiểm theo
 * ngày `IV`/`IP`). Hàm thuần, tách khỏi component để test được và để modal chỉ còn việc bày ô.
 *
 * Bốn trường % của mô hình cũ (`serviceFeePercent`, `tripInsurancePercent`,
 * `vehicleProtectionPercent`) KHÔNG còn trong form và không được gửi lên: `computeCustomerFees`
 * không đọc chúng, và DTO giữ nguyên số cũ của bản nháp khi chúng vắng mặt.
 */

/** Trần số nấc và trần `fromDay` — MỘT nguồn với DTO (`@xeprime/types`), không chép số. */
export { OWNER_COMMISSION_FROM_DAY_MAX, OWNER_COMMISSION_TIERS_MAX };
/** Trần một ô tiền cấu hình — hàng rào gõ nhầm, dưới trần của mẫu DTO (9 chữ số + `000`). */
export const FEE_POLICY_AMOUNT_MAX = 100_000_000;

/** Ví dụ minh hoạ cho hoa hồng lũy tiến: 5 ngày × 1.000.000đ. */
export const COMMISSION_PREVIEW_DAYS = 5;
export const COMMISSION_PREVIEW_DAILY_AMOUNT = 1_000_000;

type MoneyValue = number | null;

export interface PerVehicleTypeFormValue {
  car: MoneyValue;
  motorbike: MoneyValue;
}

export interface CommissionTierFormValue {
  fromDay: number | null;
  percent: number | null;
}

/** Một dòng của bảng mức thuế — GTGT % và TNCN % (ADR 0068 điều 1). */
export interface TaxRateFormValue {
  vatPercent: number | null;
  pitPercent: number | null;
}

/** Bảng mức thuế theo loại dịch vụ — đủ ba khoá `SERVICE_TYPE`. */
export type TaxRatesFormValue = Record<ServiceType, TaxRateFormValue>;

/**
 * Thứ tự các dòng của bảng mức thuế: MỌI `SERVICE_TYPE_VALUES`, gom theo NHÓM thuế
 * (`TAX_CATEGORY_VALUES` — dịch vụ trước, vận tải sau) ⇒ tự lái · dài hạn · có tài xế, đúng thứ tự
 * của ADR 0068. Suy ra chứ không liệt kê tay: thêm một loại dịch vụ là bảng có thêm dòng. Trần mỗi
 * sắc thuế export lại từ `@xeprime/types` — MỘT nguồn với DTO.
 */
export const TAX_SERVICE_TYPES: readonly ServiceType[] = TAX_CATEGORY_VALUES.flatMap((category) =>
  SERVICE_TYPE_VALUES.filter((type) => TAX_CATEGORY_BY_SERVICE_TYPE[type] === category),
);
export { TAX_PIT_PERCENT_MAX, TAX_VAT_PERCENT_MAX, TAX_LEGAL_BASIS_MAX_LENGTH };

export interface FeePolicyFormValues {
  name: string;
  note: string;
  customerPlatformFee: PerVehicleTypeFormValue;
  ownerCommissionTiers: CommissionTierFormValue[];
  depositPercent: number | null;
  depositMinAmount: MoneyValue;
  depositMaxPercent: number | null;
  holdMinAmount: MoneyValue;
  holdPaymentWindowMinutes: number | null;
  freeCancelHours: number | null;
  vehicleProtectionEnabled: boolean;
  vehicleProtectionDailyAmount: PerVehicleTypeFormValue;
  tripInsuranceEnabled: boolean;
  tripInsuranceDailyAmount: PerVehicleTypeFormValue;
  insurancePartnerName: string;
  taxEnabled: boolean;
  /** Căn cứ pháp lý — bắt buộc khi bật thuế. */
  taxLegalBasis: string;
  /** Bảng mức GTGT/TNCN theo loại dịch vụ (ADR 0068). */
  taxRates: TaxRatesFormValue;
}

/** Thông điệp lỗi — modal truyền `t()` vào, form.ts không biết ngôn ngữ. */
export interface FeePolicyFormMessages {
  nameRequired: string;
  required: string;
  range: string;
  nonNegative: string;
  integer: string;
  thousandStep: string;
  ratePositive: string;
  taxRateRequired: string;
  taxLegalBasisRequired: string;
  partnerRequired: string;
  /** Nhãn của một mã `feePolicyActivationBlockers` — `Domain.feePolicyActivationBlocker`. */
  blocker: (code: string) => string;
}

// ── Mặc định & chuyển đổi ────────────────────────────────────────────────────

function perVehicleToForm(amounts: PerVehicleTypeAmount): PerVehicleTypeFormValue {
  return {
    car: Number(amounts[VEHICLE_TYPE.CAR]),
    motorbike: Number(amounts[VEHICLE_TYPE.MOTORBIKE]),
  };
}

function taxRatesToForm(rates: TaxRatesByServiceType): TaxRatesFormValue {
  return Object.fromEntries(
    TAX_SERVICE_TYPES.map((type) => [
      type,
      { vatPercent: rates[type].vatPercent, pitPercent: rates[type].pitPercent },
    ]),
  ) as TaxRatesFormValue;
}

/** Bảng mức từ form ⇒ dạng dây. Ô trống thành NaN để `taxRatesValid` (cổng kích hoạt) bắt được. */
function taxRatesFromForm(rates: TaxRatesFormValue): TaxRatesByServiceType {
  return Object.fromEntries(
    TAX_SERVICE_TYPES.map((type) => [
      type,
      {
        vatPercent: rates[type].vatPercent ?? Number.NaN,
        pitPercent: rates[type].pitPercent ?? Number.NaN,
      },
    ]),
  ) as TaxRatesByServiceType;
}

/** Tổng hai sắc thuế của một dòng đang soạn — `null` khi còn ô trống (cột "Cộng" hiện gạch). */
export function taxRateRowTotal(row: TaxRateFormValue | undefined): number | null {
  if (row?.vatPercent == null || row.pitPercent == null) return null;
  return taxRateTotalPercent({ vatPercent: row.vatPercent, pitPercent: row.pitPercent });
}

function perVehicleToWire(value: PerVehicleTypeFormValue): PerVehicleTypeAmount {
  return {
    [VEHICLE_TYPE.CAR]: String(value.car ?? 0),
    [VEHICLE_TYPE.MOTORBIKE]: String(value.motorbike ?? 0),
  };
}

/**
 * Giá trị khởi tạo của form.
 *
 * - `source = null` (tạo mới): bộ số `FEE_SCHEDULE_DEFAULTS` của luồng tiền v2 cho các trường v2,
 *   hằng của `holds` cho hai cửa sổ.
 * - `source` có giá trị: sửa nháp đó, hoặc NHÂN BẢN một phiên bản đã có thành nháp mới — cùng bộ
 *   số, khác tên (nơi gọi quyết định tên).
 */
export function feePolicyFormDefaults(source: FeePolicy | null): FeePolicyFormValues {
  if (!source) {
    return {
      name: '',
      note: '',
      customerPlatformFee: perVehicleToForm(FEE_SCHEDULE_DEFAULTS.customerPlatformFee),
      ownerCommissionTiers: FEE_SCHEDULE_DEFAULTS.ownerCommissionTiers.map((tier) => ({ ...tier })),
      depositPercent: FEE_SCHEDULE_DEFAULTS.depositPercent,
      depositMinAmount: Number(FEE_SCHEDULE_DEFAULTS.depositMinAmount),
      // Trần không thấp hơn % giữ chỗ mặc định — cùng cách migration v8 nâng trần (`GREATEST(…, 15)`, ADR 0066).
      depositMaxPercent: FEE_SCHEDULE_DEFAULTS.depositPercent,
      holdMinAmount: HOLD_MIN_AMOUNT,
      holdPaymentWindowMinutes: HOLD_PAYMENT_WINDOW_MINUTES,
      freeCancelHours: HOLD_FREE_CANCEL_HOURS,
      vehicleProtectionEnabled: false,
      vehicleProtectionDailyAmount: perVehicleToForm(
        FEE_SCHEDULE_DEFAULTS.vehicleProtectionDailyAmount,
      ),
      tripInsuranceEnabled: false,
      tripInsuranceDailyAmount: perVehicleToForm(FEE_SCHEDULE_DEFAULTS.tripInsuranceDailyAmount),
      insurancePartnerName: '',
      taxEnabled: false,
      // Bật công tắc là có ngay bảng mức NĐ 117 + căn cứ mặc định — admin chỉ sửa khi khác.
      taxLegalBasis: TAX_LEGAL_BASIS_DEFAULT,
      taxRates: taxRatesToForm(TAX_RATES_DEFAULTS),
    };
  }
  return {
    name: source.name,
    note: source.note ?? '',
    customerPlatformFee: perVehicleToForm(source.customerPlatformFee),
    ownerCommissionTiers: source.ownerCommissionTiers.map((tier) => ({
      fromDay: tier.fromDay,
      percent: tier.percent,
    })),
    depositPercent: source.depositPercent,
    depositMinAmount: Number(source.depositMinAmount),
    depositMaxPercent: source.depositMaxPercent,
    holdMinAmount: Number(source.holdMinAmount),
    holdPaymentWindowMinutes: source.holdPaymentWindowMinutes,
    freeCancelHours: source.freeCancelHours,
    vehicleProtectionEnabled: source.vehicleProtectionEnabled,
    vehicleProtectionDailyAmount: perVehicleToForm(source.vehicleProtectionDailyAmount),
    tripInsuranceEnabled: source.tripInsuranceEnabled,
    tripInsuranceDailyAmount: perVehicleToForm(source.tripInsuranceDailyAmount),
    insurancePartnerName: source.insurancePartnerName ?? '',
    taxEnabled: source.taxEnabled,
    /*
     * Bản ≤ v8 (một mức) không có bảng mức: nhân bản nó thì điền sẵn mức NĐ 117 thay vì để trống —
     * mức một-mức cũ không tách được thành GTGT/TNCN.
     */
    taxLegalBasis: source.taxLegalBasis ?? (source.taxEnabled ? TAX_LEGAL_BASIS_DEFAULT : ''),
    taxRates: taxRatesToForm(parseTaxRates(source.taxRates) ?? TAX_RATES_DEFAULTS),
  };
}

/** Nấc từ form ⇒ nấc đúng hình dạng `OwnerCommissionTier` (ô trống thành 0/NaN để validator bắt). */
function tiersFromForm(tiers: readonly CommissionTierFormValue[]): OwnerCommissionTier[] {
  return tiers.map((tier) => ({
    fromDay: tier.fromDay ?? Number.NaN,
    percent: tier.percent ?? Number.NaN,
  }));
}

/** Payload gửi API — tiền là chuỗi số nguyên (ADR 0007), không gửi bốn trường % cũ. */
export function toUpsertFeePolicyBody(values: FeePolicyFormValues): UpsertFeePolicyInput {
  const insuranceOn = values.tripInsuranceEnabled || values.vehicleProtectionEnabled;
  return {
    name: values.name.trim(),
    note: values.note.trim() || null,
    customerPlatformFee: perVehicleToWire(values.customerPlatformFee),
    ownerCommissionTiers: values.ownerCommissionTiers.map((tier) => ({
      fromDay: tier.fromDay ?? 1,
      percent: tier.percent ?? 0,
    })),
    depositPercent: values.depositPercent ?? 0,
    depositMinAmount: String(values.depositMinAmount ?? 0),
    depositMaxPercent: values.depositMaxPercent ?? 0,
    holdMinAmount: String(values.holdMinAmount ?? 0),
    holdPaymentWindowMinutes: values.holdPaymentWindowMinutes ?? 0,
    freeCancelHours: values.freeCancelHours ?? 0,
    vehicleProtectionEnabled: values.vehicleProtectionEnabled,
    vehicleProtectionDailyAmount: perVehicleToWire(values.vehicleProtectionDailyAmount),
    tripInsuranceEnabled: values.tripInsuranceEnabled,
    tripInsuranceDailyAmount: perVehicleToWire(values.tripInsuranceDailyAmount),
    insurancePartnerName: insuranceOn ? values.insurancePartnerName.trim() || null : null,
    taxEnabled: values.taxEnabled,
    // Tắt thuế thì không gửi bảng mức — server lưu null, không để số mồ côi.
    taxRates: values.taxEnabled ? taxRatesFromForm(values.taxRates) : null,
    taxLegalBasis: values.taxEnabled ? values.taxLegalBasis.trim() || null : null,
  };
}

/**
 * Bộ số form dưới dạng `FeePolicyValues` — đầu vào của `feePolicyActivationBlockers`, để form báo
 * đúng những luật mà server sẽ chặn ở cổng kích hoạt, bằng CHÍNH hàm đó (không chép luật).
 */
export function formToPolicyValues(values: FeePolicyFormValues): FeePolicyValues {
  const body = toUpsertFeePolicyBody(values);
  return {
    // Trường cũ không còn trong form — 0 nằm trong biên, không sinh blocker giả.
    serviceFeePercent: 0,
    tripInsurancePercent: null,
    vehicleProtectionPercent: null,
    holdMinAmount: body.holdMinAmount,
    holdPaymentWindowMinutes: values.holdPaymentWindowMinutes ?? Number.NaN,
    freeCancelHours: values.freeCancelHours ?? Number.NaN,
    depositPercent: values.depositPercent ?? Number.NaN,
    depositMinAmount: body.depositMinAmount,
    depositMaxPercent: values.depositMaxPercent ?? Number.NaN,
    customerPlatformFee: perVehicleToWire(values.customerPlatformFee),
    ownerCommissionTiers: tiersFromForm(values.ownerCommissionTiers),
    taxEnabled: values.taxEnabled,
    taxRates: values.taxEnabled ? taxRatesFromForm(values.taxRates) : null,
    taxLegalBasis: values.taxEnabled ? values.taxLegalBasis : null,
    // Hai trường một-mức cũ (≤ v8) — form mới không bao giờ ghi.
    taxPercent: null,
    taxLabel: null,
    tripInsuranceEnabled: values.tripInsuranceEnabled,
    tripInsuranceDailyAmount: perVehicleToWire(values.tripInsuranceDailyAmount),
    vehicleProtectionEnabled: values.vehicleProtectionEnabled,
    vehicleProtectionDailyAmount: perVehicleToWire(values.vehicleProtectionDailyAmount),
    insurancePartnerName: values.insurancePartnerName || null,
  };
}

// ── Nấc hoa hồng: khoảng ngày & ví dụ ───────────────────────────────────────

export interface CommissionTierRange {
  fromDay: number;
  /** Ngày cuối của nấc — `null` = nấc cuối, kéo dài vô hạn. */
  toDay: number | null;
  percent: number;
}

/**
 * Khoảng ngày của từng nấc. Dữ liệu chỉ có mốc BẮT ĐẦU (`OwnerCommissionTier`); ngày cuối là ngày
 * liền trước mốc của nấc kế tiếp, nấc cuối không có ngày cuối.
 */
export function commissionTierRanges(
  tiers: readonly { fromDay: number | null; percent: number | null }[],
): (CommissionTierRange | null)[] {
  return tiers.map((tier, index) => {
    if (tier.fromDay == null || tier.percent == null) return null;
    const next = tiers[index + 1];
    const toDay = next ? (next.fromDay == null ? null : next.fromDay - 1) : null;
    return {
      fromDay: tier.fromDay,
      toDay: toDay != null && toDay < tier.fromDay ? tier.fromDay : toDay,
      percent: tier.percent,
    };
  });
}

/** Một đoạn ngày của ví dụ — các ngày liên tiếp cùng một %. */
export interface CommissionPreviewSegment {
  fromDay: number;
  toDay: number;
  percent: number;
}

/** Bộ nấc từ form có hợp lệ để tính không — CHÍNH luật cổng kích hoạt dùng (`@xeprime/types`). */
export function commissionTiersValid(tiers: readonly CommissionTierFormValue[]): boolean {
  return ownerCommissionTiersValid(tiersFromForm(tiers));
}

export interface CommissionPreview {
  days: number;
  dailyAmount: string;
  /** Tổng giá thuê của ví dụ — mẫu số của % hiệu dụng. */
  baseAmount: string;
  /** `H` — tính bằng `computeTieredOwnerCommission`, cùng phép tính server dùng lúc chốt giá. */
  commissionAmount: string;
  /** H / giá thuê, phần trăm làm tròn 1 chữ số thập phân — chỉ để đọc, không vào dòng tiền nào. */
  effectivePercent: number;
  segments: CommissionPreviewSegment[];
}

/**
 * Ví dụ "N ngày × đơn giá ⇒ H = …" cho bộ nấc đang soạn. `null` khi bộ nấc chưa hợp lệ — một ví dụ
 * tính trên bộ nấc server sẽ từ chối chỉ là một con số sai trông rất chắc chắn.
 */
export function commissionPreview(
  tiers: readonly CommissionTierFormValue[],
  days: number = COMMISSION_PREVIEW_DAYS,
  dailyAmount: number = COMMISSION_PREVIEW_DAILY_AMOUNT,
): CommissionPreview | null {
  if (!commissionTiersValid(tiers)) return null;
  const valid = tiersFromForm(tiers);
  const segments: CommissionPreviewSegment[] = [];
  for (let day = 1; day <= days; day += 1) {
    const percent = ownerCommissionPercentForDay(day, valid);
    const last = segments.at(-1);
    if (last && last.percent === percent) last.toDay = day;
    else segments.push({ fromDay: day, toDay: day, percent });
  }
  const baseAmount = days * dailyAmount;
  const commissionAmount = computeTieredOwnerCommission(
    Array.from({ length: days }, () => dailyAmount),
    valid,
  );
  return {
    days,
    dailyAmount: String(dailyAmount),
    baseAmount: String(baseAmount),
    commissionAmount,
    effectivePercent:
      baseAmount > 0 ? Math.round((Number(commissionAmount) / baseAmount) * 1000) / 10 : 0,
    segments,
  };
}

// ── Schema ──────────────────────────────────────────────────────────────────

/**
 * Mã blocker NHIỀU Ô của `feePolicyActivationBlockers` ⇒ ô hiện lỗi. Luật MỘT ô (bắt buộc, biên,
 * bội 1.000đ) nằm ở schema từng trường để lỗi hiện ngay dưới ô; luật nhiều ô thì gọi CHÍNH hàm
 * server dùng, để form không bao giờ nói "được" với một bộ số server sẽ chặn.
 */
const BLOCKER_FIELD: Readonly<Record<string, keyof FeePolicyFormValues>> = {
  owner_commission_tiers_invalid: 'ownerCommissionTiers',
  deposit_percent_out_of_range: 'depositPercent',
  deposit_percent_below_tax_percent: 'depositPercent',
  free_cancel_shorter_than_payment_window: 'freeCancelHours',
};

export function buildFeePolicySchema(m: FeePolicyFormMessages) {
  const money = () =>
    yup
      .number()
      .nullable()
      .defined()
      .test('required', m.required, (v) => v != null)
      .integer(m.integer)
      .min(0, m.nonNegative)
      .max(FEE_POLICY_AMOUNT_MAX, m.range)
      .test('thousand-step', m.thousandStep, (v) => v == null || v % MONEY_STEP_VND === 0);

  const perVehicle = () =>
    yup
      .object({ car: money(), motorbike: money() })
      .required() as yup.ObjectSchema<PerVehicleTypeFormValue>;

  /** Biểu phí bảo hiểm khi cổng mở: mọi loại xe phải > 0 (`*_requires_rate`). */
  const ratesWhenOn = (flag: 'vehicleProtectionEnabled' | 'tripInsuranceEnabled') =>
    perVehicle().when(flag, {
      is: true,
      then: () =>
        yup.object({
          car: money().test('positive', m.ratePositive, (v) => v == null || v > 0),
          motorbike: money().test('positive', m.ratePositive, (v) => v == null || v > 0),
        }),
    }) as yup.ObjectSchema<PerVehicleTypeFormValue>;

  /** Một sắc thuế: trống được (tắt thuế), có số thì trong `[0, trần NĐ 117]`, hai chữ số thập phân. */
  const taxRate = (max: number) =>
    yup
      .number()
      .nullable()
      .defined()
      .min(0, m.range)
      .max(max, m.range)
      .test('two-decimals', m.range, (v) => v == null || Math.abs(v * 100 - Math.round(v * 100)) < 1e-9);

  const percent = (min: number, max: number) =>
    yup
      .number()
      .nullable()
      .defined()
      .test('required', m.required, (v) => v != null)
      .min(min, m.range)
      .max(max, m.range);

  return yup
    .object({
      name: yup.string().trim().required(m.nameRequired).max(120).defined(),
      note: yup.string().trim().max(2000).defined(),
      customerPlatformFee: perVehicle(),
      ownerCommissionTiers: yup
        .array(
          yup.object({
            fromDay: yup
              .number()
              .nullable()
              .defined()
              .test('required', m.required, (v) => v != null)
              .integer(m.integer)
              .min(1, m.range)
              .max(OWNER_COMMISSION_FROM_DAY_MAX, m.range),
            percent: percent(0, OWNER_COMMISSION_PERCENT_MAX),
          }),
        )
        .min(1, m.blocker('owner_commission_tiers_invalid'))
        .max(OWNER_COMMISSION_TIERS_MAX, m.range)
        .defined(),
      depositPercent: percent(DEPOSIT_PERCENT_MIN, DEPOSIT_PERCENT_MAX),
      depositMinAmount: money(),
      depositMaxPercent: percent(DEPOSIT_PERCENT_MIN, DEPOSIT_PERCENT_MAX),
      holdMinAmount: money(),
      holdPaymentWindowMinutes: yup
        .number()
        .nullable()
        .defined()
        .test('required', m.required, (v) => v != null)
        .integer(m.integer)
        // Cùng sàn với `feePolicyActivationBlockers`: dưới ngưỡng này không hold nào phát được QR.
        .min(HOLD_MIN_USABLE_WINDOW_MINUTES, m.range)
        .max(HOLD_PAYMENT_WINDOW_MINUTES_MAX, m.range),
      freeCancelHours: yup
        .number()
        .nullable()
        .defined()
        .test('required', m.required, (v) => v != null)
        .integer(m.integer)
        .min(0, m.range)
        .max(FREE_CANCEL_HOURS_MAX, m.range),
      vehicleProtectionEnabled: yup.boolean().defined(),
      vehicleProtectionDailyAmount: ratesWhenOn('vehicleProtectionEnabled'),
      tripInsuranceEnabled: yup.boolean().defined(),
      tripInsuranceDailyAmount: ratesWhenOn('tripInsuranceEnabled'),
      insurancePartnerName: yup
        .string()
        .trim()
        .max(120)
        .defined()
        .when(['tripInsuranceEnabled', 'vehicleProtectionEnabled'], {
          is: (a: boolean, b: boolean) => a || b,
          then: (s) => s.test('required', m.partnerRequired, (v) => Boolean(v)),
        }),
      taxEnabled: yup.boolean().defined(),
      taxLegalBasis: yup
        .string()
        .trim()
        .max(TAX_LEGAL_BASIS_MAX_LENGTH, m.range)
        .defined()
        .when('taxEnabled', {
          is: true,
          then: (s) => s.test('required', m.taxLegalBasisRequired, (v) => Boolean(v)),
        }),
      taxRates: yup
        .object(
          Object.fromEntries(
            TAX_SERVICE_TYPES.map((type) => [
              type,
              yup.object({ vatPercent: taxRate(TAX_VAT_PERCENT_MAX), pitPercent: taxRate(TAX_PIT_PERCENT_MAX) }),
            ]),
          ),
        )
        .required() as unknown as yup.ObjectSchema<TaxRatesFormValue>,
    })
    /*
     * Bật thuế thì MỌI ô của bảng mức phải có số — kiểm ở gốc vì `.when` trong object lồng không
     * nhìn thấy `taxEnabled` ở cấp trên. Lỗi gắn đúng ô trống.
     */
    .test('tax-rates-required', function taxRatesRequired(raw) {
      const values = raw as unknown as FeePolicyFormValues | undefined;
      if (!values?.taxEnabled) return true;
      const errors = TAX_SERVICE_TYPES.flatMap((type) =>
        (['vatPercent', 'pitPercent'] as const)
          .filter((field) => values.taxRates?.[type]?.[field] == null)
          .map((field) =>
            this.createError({ path: `taxRates.${type}.${field}`, message: m.taxRateRequired }),
          ),
      );
      return errors.length > 0 ? new yup.ValidationError(errors) : true;
    })
    .test('activation-rules', function activationRules(raw) {
      if (!raw) return true;
      const values = raw as unknown as FeePolicyFormValues;
      const errors = feePolicyActivationBlockers(formToPolicyValues(values))
        .filter((code) => code in BLOCKER_FIELD)
        .map((code) => this.createError({ path: BLOCKER_FIELD[code], message: m.blocker(code) }));
      return errors.length > 0 ? new yup.ValidationError(errors) : true;
    });
}

/** Loại xe theo thứ tự hiển thị — ô tô trước. */
export const FEE_POLICY_VEHICLE_TYPES: readonly VehicleType[] = VEHICLE_TYPE_VALUES;
