import {
  API_ERROR_CODE,
  SUPPORT_CAPABILITY,
  SUPPORT_VEHICLE_DOCUMENT_BLANK_ONLY_FIELDS,
  SUPPORT_VEHICLE_DOCUMENT_FIELDS,
  type SupportCapability,
} from '@xeprime/types';
import type { SupportActionDenial } from '../../../common/decorators';
import type { RequestContext } from '../../../common/types/request-context';

/**
 * Luật lệnh ghi giấy tờ xe trong PHIÊN HỖ TRỢ — ADR 0050 §13.
 *
 * Phiên có quyền quản lý giấy tờ nhưng KHÔNG có quyền xem chi tiết/file (bốn mức quyền của domain
 * giấy tờ). Nên các trường định danh (số giấy tờ, tên/địa chỉ chủ giấy tờ, số khung, số máy, biển
 * số) — thứ phiên không nhìn thấy — cũng không được ghi mù:
 *
 *  - Tạo hồ sơ: chúng có mặt với giá trị rỗng thì được (form để trống ô), có giá trị là từ chối.
 *  - Sửa hồ sơ: chúng KHÔNG được có mặt, kể cả `null` — `null` trên một lệnh sửa là XOÁ giá trị đang
 *    lưu mà phiên chưa từng thấy.
 *
 * Không có trường trạng thái xác minh nào trong lệnh ghi — phiên không đánh dấu "đã xác minh" được.
 */
const ALLOWED = new Set(SUPPORT_VEHICLE_DOCUMENT_FIELDS);
const BLANK_ONLY = new Set(SUPPORT_VEHICLE_DOCUMENT_BLANK_ONLY_FIELDS);

function denied(fields: string[]): SupportActionDenial {
  return {
    denied: true,
    code: API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED,
    message: 'Phiên hỗ trợ không ghi được dữ liệu định danh của giấy tờ',
    details: { fields },
  };
}

function bodyOf(req: RequestContext): Record<string, unknown> | null {
  const body: unknown = req.body;
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

const isBlank = (value: unknown) => value === null || value === undefined || value === '';

export function supportDocumentCreateCapabilities(
  req: RequestContext,
): readonly SupportCapability[] | SupportActionDenial {
  const body = bodyOf(req);
  if (!body) return denied([]);
  const rejected = Object.entries(body)
    .filter(([key, value]) => !ALLOWED.has(key) && !(BLANK_ONLY.has(key) && isBlank(value)))
    .map(([key]) => key);
  return rejected.length > 0 ? denied(rejected) : [SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE];
}

export function supportDocumentUpdateCapabilities(
  req: RequestContext,
): readonly SupportCapability[] | SupportActionDenial {
  const body = bodyOf(req);
  if (!body) return denied([]);
  const rejected = Object.keys(body).filter((key) => !ALLOWED.has(key));
  return rejected.length > 0 ? denied(rejected) : [SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE];
}
