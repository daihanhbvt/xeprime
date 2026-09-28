import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import {
  API_ERROR_CODE,
  SUPPORT_REASON_LIMITS,
  isMeaningfulSupportReason,
  supportCapabilityNeedsReason,
  type SupportCapability,
} from '@xeprime/types';
import { currentSupportState } from './support-request.store';

/**
 * Lý do RIÊNG của một thao tác mức trung bình/cao trong phiên hỗ trợ — ADR 0050 §13.
 *
 * 428 chứ không phải 403: chưa có gì bị ghi, và gửi lại kèm lý do là đủ để đi tiếp. Client bắt mã
 * này ở MỘT chỗ (lớp HTTP), hỏi người thao tác, rồi gửi lại — không form nào phải tự biết thao tác
 * nào đòi lý do.
 */
export function supportReasonRequired(
  capabilities: readonly SupportCapability[],
  invalid: boolean,
): HttpException {
  return new HttpException(
    {
      code: API_ERROR_CODE.SUPPORT_REASON_REQUIRED,
      message: invalid
        ? 'Lý do chưa đủ cụ thể — ghi rõ vì sao hoặc mã yêu cầu của chủ xe'
        : 'Thao tác này cần lý do riêng',
      details: { capabilities: [...capabilities], invalid },
    },
    HttpStatus.PRECONDITION_REQUIRED,
  );
}

/**
 * Đọc header lý do: `encodeURIComponent` ở client (header chỉ nhận ASCII). Vắng → `absent`; có mà
 * không giải mã được / quá chung chung → `invalid`.
 */
export function readSupportReason(
  raw: string | string[] | undefined,
): { kind: 'absent' } | { kind: 'invalid' } | { kind: 'ok'; reason: string } {
  if (raw === undefined || raw === '') return { kind: 'absent' };
  if (Array.isArray(raw)) return { kind: 'invalid' };
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw).trim();
  } catch {
    return { kind: 'invalid' };
  }
  if (decoded.length > SUPPORT_REASON_LIMITS.max || !isMeaningfulSupportReason(decoded)) {
    return { kind: 'invalid' };
  }
  return { kind: 'ok', reason: decoded };
}

/**
 * Đòi thêm một capability GIỮA CHỪNG — cho lệnh rộng mà capability chỉ lộ ra sau khi so với bản
 * đang lưu (vd. `PATCH /vehicles/:id` đổi chi nhánh THẬT). Ngoài phiên: không làm gì.
 *
 * Kiểm đúng hai điều guard kiểm ở cửa: capability nằm trong bộ còn hiệu lực của phiên, và lý do
 * riêng có mặt nếu capability đó đòi. Rồi GHI capability vào store để dòng audit mang nó.
 */
export function escalateSupportCapability(capability: SupportCapability): void {
  const state = currentSupportState();
  if (!state?.support) return;
  if (!state.support.capabilities.includes(capability)) {
    throw new ForbiddenException({
      code: API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED,
      message: 'Phiên hỗ trợ không được cấp quyền cho thao tác này',
      details: { capability },
    });
  }
  if (supportCapabilityNeedsReason(capability) && !state.reason) {
    throw supportReasonRequired([capability], false);
  }
  const current = state.capability ? state.capability.split(',') : [];
  if (!current.includes(capability)) state.capability = [...current, capability].join(',');
}
