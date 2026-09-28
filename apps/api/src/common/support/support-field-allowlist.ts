import { API_ERROR_CODE, type SupportCapability } from '@xeprime/types';
import type { SupportActionDenial, SupportActionResolver } from '../decorators';

/**
 * `@SupportAction` cho một lệnh ghi có DANH SÁCH TRƯỜNG cho phép (ADR 0050 §13): thân request chỉ
 * được mang những trường này, trường lạ là từ chối cả lệnh TRƯỚC khi chạm DB. Danh sách nằm ở
 * `@xeprime/types` (web cùng đọc để khoá ô), phép kiểm nằm ở đây — lớp bảo vệ thật là backend.
 *
 * `pinned`: trường có mặt được (form gửi cả khối) nhưng service phải so với bản đang lưu và từ chối
 * nếu khác — resolver chỉ cho chúng qua cửa, không cho chúng đổi.
 */
export function supportFieldAllowlist(
  capability: SupportCapability,
  fields: readonly string[],
  pinned: readonly string[] = [],
): SupportActionResolver {
  const allowed = new Set([...fields, ...pinned]);
  return (req): readonly SupportCapability[] | SupportActionDenial => {
    const body: unknown = req.body;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return denied([]);
    }
    const rejected = Object.keys(body).filter((key) => !allowed.has(key));
    return rejected.length > 0 ? denied(rejected) : [capability];
  };
}

function denied(fields: string[]): SupportActionDenial {
  return {
    denied: true,
    code: API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED,
    message: 'Phiên hỗ trợ không được sửa các trường này',
    details: { fields },
  };
}
