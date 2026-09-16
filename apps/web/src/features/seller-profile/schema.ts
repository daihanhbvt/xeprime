import * as yup from 'yup';
import { SELLER_ENTITY_TYPE_VALUES } from '@xeprime/types';

/** Câu báo lỗi đã dịch — truyền vào từ component, vì `t()` của next-intl chỉ nhận khoá TĨNH. */
export interface SellerProfileMessages {
  readonly taxId: string;
  readonly idNumber: string;
}

/**
 * Định dạng khớp CHÍNH XÁC `SaveSellerProfileDto` ở backend — mọi trường ngoài `entityType` đều
 * optional ở tầng này (lưu nháp dần). "Đủ để GỬI xác minh" là quy tắc khác, đến từ
 * `SellerProfileDto.missingFields` của server — form không tự đoán lại.
 */
export function buildSellerProfileSchema(messages: SellerProfileMessages) {
  return yup.object({
    entityType: yup.string().oneOf(SELLER_ENTITY_TYPE_VALUES).required(),
    legalName: yup.string().trim().max(255).default(''),
    taxId: yup
      .string()
      .trim()
      .matches(/^[0-9-]{10,20}$/, { excludeEmptyString: true, message: messages.taxId })
      .default(''),
    idNumber: yup
      .string()
      .trim()
      .matches(/^[A-Za-z0-9]{6,20}$/, {
        excludeEmptyString: true,
        message: messages.idNumber,
      })
      .default(''),
    idIssuedAt: yup.string().trim().nullable().default(null),
    idIssuedBy: yup.string().trim().max(160).default(''),
    /*
     * KHÔNG có ba ô ngân hàng (16/09/2026): tài khoản nhận tiền sống ở `bank_accounts`, nơi
     * lệnh rút thật sự đọc — và nơi ngân hàng là một ô CHỌN từ danh mục VietQR chứ không phải
     * chữ tự do như ở đây.
     */
  });
}

export type SellerProfileFormValues = yup.InferType<ReturnType<typeof buildSellerProfileSchema>>;
