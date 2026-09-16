import * as yup from 'yup';
import { SELLER_ENTITY_TYPE_VALUES } from '@xeprime/types';

/** Câu báo lỗi đã dịch — truyền vào từ màn, vì `t()` của use-intl chỉ nhận khoá TĨNH. */
export interface SellerProfileMessages {
  readonly taxId: string;
  readonly idNumber: string;
}

/**
 * Định dạng khớp CHÍNH XÁC `SaveSellerProfileDto` ở backend — mọi trường ngoài `entityType` đều
 * optional ở tầng này (người bán lưu nháp dần). "Đủ để GỬI xác minh" là quy tắc khác, đến từ
 * `SellerProfileDto.missingFields` của server — form không tự đoán lại.
 *
 * Bản sao cơ học của `apps/web/src/features/seller-profile/schema.ts`: file đó nằm trong app web
 * nên Metro không đọc được. Luật phải GIỐNG HỆT — cùng regex, cùng độ dài, cùng
 * `excludeEmptyString`. Sửa một bên là sửa cả hai.
 *
 * Màn "Thông tin khai thuế" dùng `.pick(TAX_FIELDS)` của chính schema này, KHÔNG viết schema thứ
 * hai: hai bộ regex cho cùng một mã số thuế sẽ trôi khỏi nhau ngay lần sửa đầu tiên.
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
      .matches(/^[A-Za-z0-9]{6,20}$/, { excludeEmptyString: true, message: messages.idNumber })
      .default(''),
    idIssuedAt: yup.string().trim().nullable().default(null),
    idIssuedBy: yup.string().trim().max(160).default(''),
    /*
     * KHÔNG có ba ô ngân hàng (16/09/2026): tài khoản nhận tiền sống ở `bank_accounts`, nơi
     * lệnh rút thật sự đọc. Bản sao cơ học của `apps/web/src/features/seller-profile/schema.ts`
     * (ADR 0031) — sửa một bên là sửa cả hai.
     */
  });
}

export type SellerProfileFormValues = yup.InferType<ReturnType<typeof buildSellerProfileSchema>>;

/** Bốn trường mà bản COMPACT "Thông tin khai thuế" ở khu tài khoản sửa. */
export const TAX_FIELDS = ['entityType', 'legalName', 'taxId', 'idNumber'] as const;

export type TaxFormValues = Pick<SellerProfileFormValues, (typeof TAX_FIELDS)[number]>;
