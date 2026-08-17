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
    depositAmount: toNumber(policy.depositAmount),
    deliveryEnabled: policy.deliveryEnabled,
    deliveryMaxRadiusKm: policy.deliveryMaxRadiusKm ?? null,
    deliveryTiers: policy.deliveryTiers.map((t) => ({ toKm: t.toKm, fee: toNumber(t.fee) })),
    overtimeFeePerHour: toNumber(policy.overtimeFeePerHour),
    overtimeGraceMinutes: policy.overtimeGraceMinutes ?? null,
    overtimeRoundingMinutes: policy.overtimeRoundingMinutes ?? null,
    discountEnabled: policy.discountEnabled,
    // Form nhập theo THÁNG, API lưu theo ngày (minDays = tháng × 30). Mốc cũ cấu hình theo
    // ngày (trước đợt 4) quy về tháng gần nhất, tối thiểu 1 — lưu lại là chuẩn hoá luôn.
    discountTiers: policy.discountTiers.map((t) => ({
      minMonths: Math.max(1, Math.round(t.minDays / 30)),
      percent: t.percent,
      note: t.note ?? '',
    })),
  };
}

export function formToSaveInput(values: PolicyFormValues): SaveRentalPolicyInput {
  return {
    depositAmount: toMoneyString(values.depositAmount),
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
      minDays: (t.minMonths ?? 1) * 30,
      percent: t.percent ?? 1,
      ...(t.note?.trim() ? { note: t.note.trim() } : {}),
    })),
  };
}

/** Trích phần chính sách từ form giá theo xe (bỏ hai field giá). */
export function vehicleFormToPolicyInput(values: VehiclePricingFormValues): SaveRentalPolicyInput {
  return formToSaveInput(values);
}

/** Tóm tắt cấu hình giao nhận hiển thị với khách đặt — đúng dòng preview của thiết kế. */
export function deliverySummaryText(values: {
  deliveryTiers: { toKm: number | null | undefined; fee: number | null | undefined }[];
  deliveryMaxRadiusKm: number | null | undefined;
}): string {
  const parts: string[] = [];
  let from = 0;
  for (const tier of values.deliveryTiers) {
    if (tier.toKm == null) continue;
    const fee =
      !tier.fee || tier.fee === 0
        ? 'Miễn phí'
        : `${new Intl.NumberFormat('vi-VN').format(tier.fee)}đ`;
    parts.push(`${from === 0 ? '0' : `>${from}`}–${tier.toKm} km: ${fee}`);
    from = tier.toKm;
  }
  if (values.deliveryMaxRadiusKm != null) {
    parts.push(`>${values.deliveryMaxRadiusKm} km: Báo giá thủ công theo thỏa thuận`);
  }
  return parts.join(' · ');
}
