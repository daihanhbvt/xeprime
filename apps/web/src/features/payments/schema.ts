import { PAYMENT_METHOD_VALUES } from '@xeprime/types';
import type { useTranslations } from 'next-intl';
import * as yup from 'yup';

/** Xem `i18n/keys.ts`: phải khai với tên namespace CỤ THỂ, generic sẽ nổ `TS2590`. */
type PaymentTranslate = ReturnType<typeof useTranslations<'Bookings.payments'>>;

/** Trần số tiền của một lần thu — `null` = không có trần (thu cọc). */
export interface RecordPaymentCap {
  amount: number;
  /** Số trần đã định dạng tiền, để câu báo lỗi nói đúng con số người dùng thấy ở dòng dẫn. */
  label: string;
}

/**
 * Form ghi nhận thu tiền (yup — BE validate lại). Số tiền number trong form, string khi gửi.
 *
 * Tiền THUÊ có trần = số khách còn phải đưa (18/11/2026): server từ chối phần vượt
 * (`PAYMENT_EXCEEDS_DUE`), form chặn trước để người dùng không phải điền xong mới biết. Khách đưa
 * dư ngoài đơn thì lập phiếu ở Sổ Thu-Chi, không ghi vào đơn.
 *
 * Là HÀM nhận `t` — câu báo lỗi đổi theo ngôn ngữ người dùng (ADR 0012); nơi gọi bọc `useMemo`.
 */
export function recordPaymentSchema(t: PaymentTranslate, cap: RecordPaymentCap | null) {
  let amount = yup
    .number()
    .typeError(t('validation.amountRequired'))
    .nullable()
    .defined()
    .moreThan(0, t('validation.amountPositive'))
    .test('required', t('validation.amountRequired'), (v) => v != null);
  if (cap) amount = amount.max(cap.amount, t('validation.amountOverDue', { amount: cap.label }));

  return yup.object({
    amount,
    method: yup
      .string()
      .required(t('validation.methodRequired'))
      .oneOf([...PAYMENT_METHOD_VALUES]),
    referenceCode: yup.string().trim().max(255).default(''),
    description: yup.string().trim().max(500).default(''),
  });
}

export type RecordPaymentValues = yup.InferType<ReturnType<typeof recordPaymentSchema>>;
