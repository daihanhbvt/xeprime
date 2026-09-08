import * as yup from 'yup';
import { PAYMENT_METHOD_VALUES, RECEIPT_TYPE_VALUES } from '@xeprime/types';
import {
  RECEIPT_ATTACHMENTS_MAX,
  RECEIPT_DESCRIPTION_MAX,
  RECEIPT_LINK_MODE,
  RECEIPT_LINK_MODE_VALUES,
} from './constants';

/**
 * Schema form tạo phiếu thu/chi — **cùng luật, cùng KHOÁ message** với
 * `apps/web/src/features/finance/schema.ts`.
 *
 * Vì sao không dùng chung một file: bản web là một HÀM nhận `t` của `next-intl` — nó không sống
 * được trong `@xeprime/validators` (package framework-free, Metro đọc trực tiếp). Bản ở đây trả
 * MÃ (`errors.type`), và `useValidationResolver(schema, 'Finance.receipts.form')` đổi mã thành
 * chữ — cùng namespace, cùng khoá, nên hai client không thể báo lỗi khác nhau về cùng một ô.
 * Gộp thật sự chỉ làm được khi web đổi sang resolver dịch-theo-mã, và đó là việc của web.
 *
 * Tiền giữ `number` trong form, hoá `string` lúc gửi (ADR 0007).
 */
export const receiptFormSchema = yup.object({
  type: yup
    .string()
    .required('errors.type')
    .oneOf([...RECEIPT_TYPE_VALUES]),
  /** Ngày tiền phát sinh, `YYYY-MM-DD`. Mặc định hôm nay; nhập bù thì đặt đúng ngày đã chi. */
  occurredAt: yup.string().required('errors.occurredAt'),
  amount: yup
    .number()
    .typeError('errors.amountType')
    .nullable()
    .defined()
    .min(0, 'errors.amountMin')
    .test('required', 'errors.amountType', (v) => v != null),
  paymentMethod: yup
    .string()
    .required('errors.method')
    .oneOf([...PAYMENT_METHOD_VALUES]),
  categoryId: yup.string().nullable().default(null),
  /**
   * Phiếu này gắn vào cái gì — xem `RECEIPT_LINK_MODE`.
   *
   * Trường CỦA FORM, không gửi lên API: nó chỉ quyết định ô nào bắt buộc và ô nào bị xoá lúc
   * gửi. Không có nó thì "bỏ trống đơn thuê" và "cố tình không gắn vào đâu" là cùng một trạng
   * thái, và form không có cách nào bắt lỗi người dùng chọn chế độ rồi quên chọn đối tượng.
   */
  linkMode: yup
    .string()
    .required()
    .oneOf([...RECEIPT_LINK_MODE_VALUES])
    .default(RECEIPT_LINK_MODE.NONE),
  /** Đơn thuê liên kết — chọn xong form tự điền xe và số tiền còn nợ. */
  bookingId: yup
    .string()
    .nullable()
    .default(null)
    .when('linkMode', {
      is: RECEIPT_LINK_MODE.BOOKING,
      then: (schema) => schema.required('errors.bookingRequired'),
    }),
  /**
   * Xe liên kết. Bắt buộc ở chế độ "gắn xe"; ở chế độ "gắn đơn" nó được điền theo đơn nên
   * không tự bắt buộc — server vẫn suy lại từ đơn và từ chối nếu lệch.
   */
  vehicleId: yup
    .string()
    .nullable()
    .default(null)
    .when('linkMode', {
      is: RECEIPT_LINK_MODE.VEHICLE,
      then: (schema) => schema.required('errors.vehicleRequired'),
    }),
  referenceCode: yup.string().trim().max(255).default(''),
  /**
   * BẮT BUỘC, và trần 500 chứ không phải 2000 của DTO.
   *
   * Một dòng sổ không có diễn giải là một dòng sổ không ai đối chiếu được sau ba tháng —
   * "500.000 · Tiền mặt · chi" không nói được nó là xăng hay là phí gửi xe. Backend vẫn nhận
   * null (phiếu TỰ ĐỘNG sinh từ nghiệp vụ có nguồn gốc riêng để lần); ràng buộc này là của
   * phiếu NHẬP TAY, nên nó sống đúng ở form nhập tay.
   */
  description: yup.string().trim().required('errors.description').max(RECEIPT_DESCRIPTION_MAX),
  /**
   * Giữ form mở và dọn sạch sau khi tạo — người giữ sổ hiếm khi nhập đúng một phiếu rồi đóng.
   * Trường CỦA FORM, không gửi lên API.
   */
  keepOpen: yup.boolean().required().default(false),
  /** URL ảnh minh chứng đã upload lên R2. Trần 10 khớp `ArrayMaxSize` ở DTO backend. */
  attachments: yup.array().of(yup.string().required()).max(RECEIPT_ATTACHMENTS_MAX).default([]),
});

export type ReceiptFormValues = yup.InferType<typeof receiptFormSchema>;
