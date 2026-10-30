import {
  DRIVER_DROP_NOTE_LENGTH,
  DRIVER_DROP_REASON,
  DRIVER_DROP_REASON_VALUES,
  type DriverDropReason,
} from '@xeprime/types';
import * as yup from 'yup';

/**
 * Form RÚT khỏi chuyến đã nhận (ADR 0074) — nhóm lý do bắt buộc; ghi chú bắt buộc
 * `DRIVER_DROP_NOTE_LENGTH.MIN`–`MAX` ký tự khi chọn `other` (server kiểm lại:
 * `DRIVER_DROP_NOTE_REQUIRED`). Nhận hàm dịch để không đóng băng ngôn ngữ ở module scope.
 */
export function makeDropTripSchema(t: (key: string, values?: Record<string, number>) => string) {
  return yup.object({
    reasonCategory: yup
      .mixed<DriverDropReason>()
      .oneOf(DRIVER_DROP_REASON_VALUES, t('errors.reasonRequired'))
      .required(t('errors.reasonRequired')),
    reason: yup
      .string()
      .trim()
      .max(DRIVER_DROP_NOTE_LENGTH.MAX, t('errors.noteTooLong', { max: DRIVER_DROP_NOTE_LENGTH.MAX }))
      .default('')
      .when('reasonCategory', {
        is: DRIVER_DROP_REASON.OTHER,
        then: (s) =>
          s.min(
            DRIVER_DROP_NOTE_LENGTH.MIN,
            t('errors.noteRequired', { min: DRIVER_DROP_NOTE_LENGTH.MIN }),
          ),
      }),
  });
}

export type DropTripFormValues = yup.InferType<ReturnType<typeof makeDropTripSchema>>;
