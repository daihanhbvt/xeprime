import { COLLATERAL_MODE, type LongTermPackageMonths } from '@xeprime/types';
import type { PolicyFormValues } from './schema';
import type { RentalPolicyValues, SaveRentalPolicyInput } from './api';

/**
 * Chuyển đổi hai chiều giữa API (tiền là STRING — ADR 0007) và form (số là `number | null`
 * theo quy ước `NumberField`). Sống một chỗ để trang shop và trang xe không tự chép mapping.
 */

const toNumber = (value: string | null | undefined): number | null =>
  value == null || value === '' ? null : Number(value);

const toMoneyString = (value: number | null | undefined): string => String(Math.round(value ?? 0));

/** Giá trị form khi CHƯA có chính sách (null-policy): mọi thứ tắt/trống, không bịa mặc định. */
export const EMPTY_POLICY_FORM: PolicyFormValues = {
  // Chưa cấu hình thì mặc định là "Cọc tiền" chưa nhập số — KHÔNG phải "Miễn thế chấp": đó là
  // một lời hứa với khách, phải do chủ gian hàng chọn tường minh.
  collateralMode: COLLATERAL_MODE.CASH,
  collateralAssetTypes: [],
  depositAmount: null,
  deliveryEnabled: false,
  deliveryMaxRadiusKm: null,
  deliveryTiers: [],
  overtimeFeePerHour: null,
  overtimeGraceMinutes: null,
  overtimeRoundingMinutes: null,
  discountEnabled: false,
  discountTiers: [],
};

export function policyToForm(policy: RentalPolicyValues | null | undefined): PolicyFormValues {
  if (!policy) return EMPTY_POLICY_FORM;
  return {
    collateralMode: policy.collateralMode,
    collateralAssetTypes: [...policy.collateralAssetTypes],
    depositAmount: toNumber(policy.depositAmount),
    deliveryEnabled: policy.deliveryEnabled,
    deliveryMaxRadiusKm: policy.deliveryMaxRadiusKm ?? null,
    deliveryTiers: policy.deliveryTiers.map((t) => ({ toKm: t.toKm, fee: toNumber(t.fee) })),
    overtimeFeePerHour: toNumber(policy.overtimeFeePerHour),
    overtimeGraceMinutes: policy.overtimeGraceMinutes ?? null,
    overtimeRoundingMinutes: policy.overtimeRoundingMinutes ?? null,
    discountEnabled: policy.discountEnabled,
    // Mốc ưu đãi đã canonical theo THÁNG ở cả API lẫn DB (ADR 0011) — form không quy đổi gì.
    // Mốc cũ theo ngày không khớp gói nào nằm ở `legacyDiscountTiers`, hiển thị riêng dạng
    // cảnh báo và biến mất khi lưu lại; đưa vào form là remap ngầm, không được phép.
    discountTiers: policy.discountTiers.map((t) => ({
      minMonths: t.minMonths,
      percent: t.percent,
      note: t.note ?? '',
    })),
  };
}

export function formToSaveInput(values: PolicyFormValues): SaveRentalPolicyInput {
  return {
    collateralMode: values.collateralMode,
    // Loại tài sản chỉ có nghĩa ở chế độ 'asset'; gửi kèm ở chế độ khác là vi phạm CHECK của DB.
    collateralAssetTypes:
      values.collateralMode === COLLATERAL_MODE.ASSET ? values.collateralAssetTypes : [],
    // Cọc tiền là số DUY NHẤT ở chế độ 'cash' — hai chế độ kia luôn 0, không giữ lại số cũ.
    depositAmount:
      values.collateralMode === COLLATERAL_MODE.CASH ? toMoneyString(values.depositAmount) : '0',
    deliveryEnabled: values.deliveryEnabled,
    deliveryMaxRadiusKm: values.deliveryEnabled ? (values.deliveryMaxRadiusKm ?? null) : null,
    deliveryTiers: (values.deliveryTiers ?? []).map((t) => ({
      toKm: t.toKm ?? 0,
      fee: toMoneyString(t.fee),
    })),
    overtimeFeePerHour:
      values.overtimeFeePerHour == null ? null : toMoneyString(values.overtimeFeePerHour),
    overtimeGraceMinutes: values.overtimeGraceMinutes ?? null,
    overtimeRoundingMinutes: values.overtimeRoundingMinutes ?? null,
    discountEnabled: values.discountEnabled,
    discountTiers: (values.discountTiers ?? []).map((t) => ({
      minMonths: (t.minMonths ?? 1) as LongTermPackageMonths,
      percent: t.percent ?? 1,
      ...(t.note?.trim() ? { note: t.note.trim() } : {}),
    })),
  };
}
