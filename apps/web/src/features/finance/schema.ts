import { PAYMENT_METHOD_VALUES, RECEIPT_TYPE_VALUES } from '@xeprime/types';
import type { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { RECEIPT_LINK_MODE, RECEIPT_LINK_MODE_VALUES } from './constants';

/**
 * Chữ của form phiếu thu/chi — chính namespace mà `ReceiptFormDrawer` đang dùng.
 *
 * Xem `i18n/keys.ts`: phải khai với tên namespace CỤ THỂ, generic sẽ nổ `TS2590`.
 */
type FormTranslate = ReturnType<typeof useTranslations<'Finance.receipts.form'>>;

/**
 * Schema form tạo phiếu thu/chi (yup — báo lỗi sớm; validate thật ở BE). Tiền giữ number trong
 * form, hoá string lúc gửi (ADR 0007).
 *
 * **Là HÀM nhận `t`, không phải một object hằng.** Câu báo lỗi validation là chữ hiện cho người
 * dùng đọc như mọi chữ khác (ADR 0012), mà một hằng ở tầng module thì không đọc được ngôn ngữ
 * đang dùng — bản trước viết thẳng tiếng Việt vào đây, nên giao diện tiếng Anh báo lỗi bằng
 * tiếng Việt đúng lúc người dùng đang mắc kẹt. Nơi gọi bọc trong `useMemo([t])`.
 */
export function receiptFormSchema(t: FormTranslate) {
  return yup.object({
    type: yup.string().required(t('errors.type')).oneOf([...RECEIPT_TYPE_VALUES]),
    /** Ngày tiền phát sinh, `YYYY-MM-DD`. Mặc định hôm nay; nhập bù thì đặt đúng ngày đã chi. */
    occurredAt: yup.string().required(t('errors.occurredAt')),
    amount: yup
      .number()
      .typeError(t('errors.amountType'))
      .nullable()
      .defined()
      .min(0, t('errors.amountMin'))
      .test('required', t('errors.amountType'), (v) => v != null),
    paymentMethod: yup.string().required(t('errors.method')).oneOf([...PAYMENT_METHOD_VALUES]),
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
    /** Đơn thuê liên kết — chọn xong form tự điền khách, xe và số tiền còn nợ. */
    bookingId: yup
      .string()
      .nullable()
      .default(null)
      .when('linkMode', {
        is: RECEIPT_LINK_MODE.BOOKING,
        then: (schema) => schema.required(t('errors.bookingRequired')),
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
        then: (schema) => schema.required(t('errors.vehicleRequired')),
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
    description: yup.string().trim().required(t('errors.description')).max(500),
    /**
     * Giữ form mở và dọn sạch sau khi tạo — người giữ sổ hiếm khi nhập đúng một phiếu rồi đóng.
     * Trường CỦA FORM, không gửi lên API.
     */
    keepOpen: yup.boolean().required().default(false),
    /** URL ảnh minh chứng đã upload lên R2. Trần 10 khớp `ArrayMaxSize` ở DTO backend. */
    attachments: yup.array().of(yup.string().required()).max(10).default([]),
  });
}

export type ReceiptFormValues = yup.InferType<ReturnType<typeof receiptFormSchema>>;
