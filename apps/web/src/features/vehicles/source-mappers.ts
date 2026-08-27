import { VEHICLE_SOURCE_TYPE } from '@xeprime/types';
import type { VehicleSourceFormValues } from '@xeprime/validators';
import type { SaveVehicleSourceInput, VehicleSourceDetail } from './types';

/** Mặc định form khi xe CHƯA có hồ sơ nguồn — `sourceType` lấy từ xe. */
export function emptySourceFormValues(sourceType: string): VehicleSourceFormValues {
  return {
    sourceType: sourceType as VehicleSourceFormValues['sourceType'],
    purchaseDate: null,
    purchasePrice: null,
    purchasePlace: '',
    bankName: '',
    contractNumber: '',
    originalPrincipal: null,
    monthlyPrincipal: null,
    monthlyInterest: null,
    interestRatePercent: null,
    termMonths: null,
    interestMethod: null,
    ownerName: '',
    ownerPhone: '',
    ownerEmail: '',
    monthlyRent: null,
    commissionPercent: null,
    paymentDay: null,
    startDate: null,
    endDate: null,
    contractFiles: [],
    notes: '',
  };
}

/** API (tiền là chuỗi) → form (NumberField giữ number). */
export function sourceDetailToFormValues(detail: VehicleSourceDetail): VehicleSourceFormValues {
  const money = (value: string | null | undefined) => (value == null ? null : Number(value));
  return {
    ...emptySourceFormValues(detail.sourceType),
    purchaseDate: detail.purchaseDate ?? null,
    purchasePrice: money(detail.purchasePrice),
    purchasePlace: detail.purchasePlace ?? '',
    bankName: detail.bankName ?? '',
    contractNumber: detail.contractNumber ?? '',
    originalPrincipal: money(detail.originalPrincipal),
    monthlyPrincipal: money(detail.monthlyPrincipal),
    monthlyInterest: money(detail.monthlyInterest),
    interestRatePercent:
      detail.interestRatePercent == null ? null : Number(detail.interestRatePercent),
    termMonths: detail.termMonths ?? null,
    interestMethod: (detail.interestMethod ?? null) as VehicleSourceFormValues['interestMethod'],
    ownerName: detail.ownerName ?? '',
    ownerPhone: detail.ownerPhone ?? '',
    ownerEmail: detail.ownerEmail ?? '',
    monthlyRent: money(detail.monthlyRent),
    commissionPercent:
      detail.commissionPercent == null ? null : Number(detail.commissionPercent),
    paymentDay: detail.paymentDay ?? null,
    startDate: detail.startDate ?? null,
    endDate: detail.endDate ?? null,
    contractFiles: (detail.contractFiles ?? []).map((file) => ({
      id: file.id ?? null,
      name: file.name,
      size: file.size ?? null,
      status: (file.status ?? 'ready') as 'ready' | 'legacy',
    })),
    notes: detail.notes ?? '',
  };
}

/**
 * Form → payload API: CHỈ gửi trường của biến thể đang chọn (backend từ chối trường lạc
 * biến thể), tiền/percent hoá CHUỖI (ADR 0007), chuỗi rỗng thành bỏ trống.
 */
export function sourceFormValuesToInput(values: VehicleSourceFormValues): SaveVehicleSourceInput {
  const text = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };
  const money = (value: number | null | undefined) => (value == null ? undefined : String(value));
  const date = (value: string | null | undefined) => (value ? value : undefined);

  const base: SaveVehicleSourceInput = {
    sourceType: values.sourceType,
    // CHỈ gửi ID file riêng tư đã `ready` — bản ghi legacy (id null) do server tự giữ lại
    // trong JSON, client không gửi và không gỡ được chúng (Wave 4.1).
    contractFileIds: (values.contractFiles ?? [])
      .map((file) => file.id)
      .filter((id): id is string => Boolean(id)),
    notes: text(values.notes),
  };

  switch (values.sourceType) {
    case VEHICLE_SOURCE_TYPE.OWNED:
      return {
        ...base,
        purchaseDate: date(values.purchaseDate),
        purchasePrice: money(values.purchasePrice),
        purchasePlace: text(values.purchasePlace),
      };
    case VEHICLE_SOURCE_TYPE.FINANCED:
      return {
        ...base,
        bankName: text(values.bankName),
        contractNumber: text(values.contractNumber),
        originalPrincipal: money(values.originalPrincipal),
        monthlyPrincipal: money(values.monthlyPrincipal),
        monthlyInterest: money(values.monthlyInterest),
        interestRatePercent:
          values.interestRatePercent == null ? undefined : String(values.interestRatePercent),
        termMonths: values.termMonths ?? undefined,
        interestMethod: values.interestMethod ?? undefined,
        paymentDay: values.paymentDay ?? undefined,
        startDate: date(values.startDate),
        endDate: date(values.endDate),
      };
    case VEHICLE_SOURCE_TYPE.RENTED:
      return {
        ...base,
        ownerName: text(values.ownerName),
        ownerPhone: text(values.ownerPhone),
        ownerEmail: text(values.ownerEmail),
        monthlyRent: money(values.monthlyRent),
        paymentDay: values.paymentDay ?? undefined,
        startDate: date(values.startDate),
        endDate: date(values.endDate),
      };
    default:
      return {
        ...base,
        ownerName: text(values.ownerName),
        ownerPhone: text(values.ownerPhone),
        ownerEmail: text(values.ownerEmail),
        commissionPercent:
          values.commissionPercent == null ? undefined : String(values.commissionPercent),
        startDate: date(values.startDate),
        endDate: date(values.endDate),
      };
  }
}
