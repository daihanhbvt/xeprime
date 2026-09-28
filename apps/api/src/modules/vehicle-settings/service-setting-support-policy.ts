import { ForbiddenException } from '@nestjs/common';
import {
  API_ERROR_CODE,
  SUPPORT_CAPABILITY,
  SUPPORT_SERVICE_SETTING_FIELDS,
  SUPPORT_SERVICE_SETTING_PINNED_FIELDS,
  type SupportCapability,
} from '@xeprime/types';
import type { SupportActionDenial } from '../../common/decorators';
import type { RequestContext } from '../../common/types/request-context';
import type { PatchVehicleServiceSettingDto } from './dto/vehicle-settings.dto';

/**
 * Thiết lập theo dịch vụ trong PHIÊN HỖ TRỢ — ADR 0050 §13 (`vehicle.operations.update`).
 *
 * Phiên đổi được ĐIỀU KIỆN VẬN HÀNH (thời lượng tối thiểu, tuyến ưu tiên, giấy tờ khách phải có,
 * cách xác minh danh tính). Không đổi được: tự động nhận chuyến (nó tự tạo cam kết với khách thay chủ
 * xe), điều khoản thuê (tác động pháp lý), chế độ cọc (tiền). Form gửi cả khối, nên ba nhóm đó có
 * mặt được nếu GIỐNG HỆT bản đang lưu — server so, không tin form đã khoá ô.
 */
const ALLOWED = new Set([...SUPPORT_SERVICE_SETTING_FIELDS, ...SUPPORT_SERVICE_SETTING_PINNED_FIELDS]);

export function supportServiceSettingCapabilities(
  req: RequestContext,
): readonly SupportCapability[] | SupportActionDenial {
  const body: unknown = req.body;
  const keys = body !== null && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : null;
  const rejected = keys ? keys.filter((key) => !ALLOWED.has(key)) : [];
  if (!keys || rejected.length > 0) {
    return {
      denied: true,
      code: API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED,
      message: 'Phiên hỗ trợ không được sửa các trường này',
      details: { fields: rejected },
    };
  }
  return [SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE];
}

export interface PinnedServiceSetting {
  autoAcceptEnabled: boolean;
  termsText: string | null;
  requireTermsAcceptance: boolean;
  depositMode: string;
}

/** Chạy SAU khi đọc thiết lập hiện hành: trường ghim khác bản đang lưu là từ chối cả lệnh. */
export function assertSupportServiceSettingPinned(
  current: PinnedServiceSetting,
  dto: PatchVehicleServiceSettingDto,
): void {
  const changed: string[] = [];
  if (dto.autoAcceptEnabled !== undefined && dto.autoAcceptEnabled !== current.autoAcceptEnabled) {
    changed.push('autoAcceptEnabled');
  }
  if (dto.termsText !== undefined && (dto.termsText?.trim() || null) !== current.termsText) {
    changed.push('termsText');
  }
  if (
    dto.requireTermsAcceptance !== undefined &&
    dto.requireTermsAcceptance !== current.requireTermsAcceptance
  ) {
    changed.push('requireTermsAcceptance');
  }
  if (dto.depositMode !== undefined && dto.depositMode !== current.depositMode) {
    changed.push('depositMode');
  }
  if (changed.length > 0) {
    throw new ForbiddenException({
      code: API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED,
      message: 'Phiên hỗ trợ không đổi tự động nhận chuyến, điều khoản hay chế độ cọc',
      details: { fields: changed },
    });
  }
}
