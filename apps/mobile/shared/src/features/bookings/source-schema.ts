import * as yup from 'yup';
import {
  BOOKING_DIRECT_SOURCE_VALUES,
  BOOKING_SOURCE_LABEL_MAX,
  bookingSourceTakesLabel,
  type BookingDirectSource,
} from '@xeprime/types';

/** Câu báo lỗi của hai ô nguồn đơn - nơi gọi dịch (ADR 0012) rồi truyền vào. */
export interface BookingSourceMessages {
  required: string;
  nameRequired: string;
  nameMax: string;
}

/**
 * Hai ô NGUỒN ĐƠN của một đơn tự lập (ADR 0110) — native port of web `features/bookings/source-schema.ts`.
 * MỘT luật cho form lập đơn và tấm đổi nguồn, khớp `CreateBookingDto` / `UpdateBookingSourceDto`:
 * nguồn bắt buộc và không bao giờ là `xeprime`; tên nguồn bắt buộc ở hai nguồn nhận nhãn.
 */
export function bookingSourceShape(messages: BookingSourceMessages) {
  return {
    source: yup
      .string()
      .required(messages.required)
      .test('direct-source', messages.required, (value) =>
        (BOOKING_DIRECT_SOURCE_VALUES as readonly string[]).includes(value ?? ''),
      )
      .default(''),
    sourceLabel: yup
      .string()
      .trim()
      .max(BOOKING_SOURCE_LABEL_MAX, messages.nameMax)
      .default('')
      .when('source', {
        is: (source: string) => Boolean(source) && bookingSourceTakesLabel(source),
        then: (s) => s.required(messages.nameRequired),
      }),
  };
}

/** Body gửi API từ giá trị form: nhãn chỉ đi kèm nguồn nhận nhãn — web `bookingSourcePayload`. */
export function bookingSourcePayload(values: { source: string; sourceLabel: string }): {
  source: BookingDirectSource;
  sourceLabel: string | null;
} {
  return {
    source: values.source as BookingDirectSource,
    sourceLabel: bookingSourceTakesLabel(values.source) ? values.sourceLabel.trim() || null : null,
  };
}
