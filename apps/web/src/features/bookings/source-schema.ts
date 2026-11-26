import {
  BOOKING_DIRECT_SOURCE_VALUES,
  BOOKING_SOURCE_LABEL_MAX,
  bookingSourceTakesLabel,
  type BookingDirectSource,
} from '@xeprime/types';
import * as yup from 'yup';

/** Câu báo lỗi của hai ô nguồn đơn - nơi gọi dịch (ADR 0012) rồi truyền vào. */
export interface BookingSourceMessages {
  required: string;
  nameRequired: string;
  nameMax: string;
}

/**
 * Hai ô NGUỒN ĐƠN của một đơn tự lập (ADR 0110) - MỘT luật cho hộp lập đơn và hộp đổi nguồn, khớp
 * `CreateBookingDto` / `UpdateBookingSourceDto`: nguồn bắt buộc và không bao giờ là `xeprime`; tên
 * nguồn bắt buộc ở hai nguồn nhận nhãn (`other_platform`, `other`).
 */
export function bookingSourceShape(messages: BookingSourceMessages) {
  return {
    // `test` thay cho `oneOf`: ô chưa chọn giữ chuỗi rỗng, nên kiểu của field phải là `string`
    // thuần - `oneOf` thu hẹp kiểu về union và làm lệch kiểu vào/ra của resolver.
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

/** Body gửi API từ giá trị form: nhãn chỉ đi kèm nguồn nhận nhãn. */
export function bookingSourcePayload(values: { source: string; sourceLabel: string }): {
  source: BookingDirectSource;
  sourceLabel: string | null;
} {
  return {
    // Schema đã kiểm giá trị thuộc danh sách nguồn chủ xe chọn được.
    source: values.source as BookingDirectSource,
    sourceLabel: bookingSourceTakesLabel(values.source) ? values.sourceLabel.trim() || null : null,
  };
}
