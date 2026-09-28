import { ForbiddenException } from '@nestjs/common';
import {
  API_ERROR_CODE,
  PERMISSION,
  SUPPORT_CAPABILITY,
  type SupportCapability,
} from '@xeprime/types';
import type { SupportActionDenial } from '../../../common/decorators';
import type { RequestContext } from '../../../common/types/request-context';

/**
 * Ranh giới TRƯỜNG của phiếu bảo dưỡng — hai luật, cả hai ở backend.
 *
 * 1. CHI PHÍ (mọi người gọi): `cost` và `receiptCode` là dữ liệu tài chính, cùng một ranh giới với
 *    `vehicles.maintenance.view_cost`. Người không thấy chi phí thì cũng không GHI được nó: có mặt
 *    trong lệnh là 403, vắng mặt là giữ nguyên giá trị đang lưu. Trước đây form luôn gửi `cost:
 *    null` khi người sửa không thấy nó — mỗi lần một nhân viên thiếu quyền tiền sửa ghi chú là một
 *    lần xoá chi phí của phiếu.
 *
 * 2. PHIÊN HỖ TRỢ (ADR 0050): Đợt 1 chỉ sửa NỘI DUNG phiếu. Khung giờ (giữ chỗ lịch xe), số KM và
 *    chi phí không nằm trong phiên. Tạo phiếu: các trường đó phải vắng/null. Sửa phiếu: có mặt được
 *    nếu GIỐNG HỆT bản đang lưu rồi bị bỏ khỏi lệnh; khác là từ chối cả lệnh.
 */

/** Trường tài chính của phiếu — đi theo `vehicles.maintenance.view_cost`. */
export const MAINTENANCE_COST_FIELDS = ['cost', 'receiptCode'] as const;

/** Trường phiên hỗ trợ được GHI trên phiếu (tạo + sửa). */
const SUPPORT_WRITABLE = new Set([
  'type',
  'customTypeName',
  'title',
  'providerName',
  'notes',
  'expectedRowVersion',
  // Chứng từ đã đi qua presign → HEAD + magic bytes của CHÍNH gian hàng/xe/phiếu này.
  'attachmentFileIds',
]);

/** Trường phiên hỗ trợ KHÔNG đổi được: có mặt khi sửa thì phải bằng bản đang lưu. */
export const SUPPORT_MAINTENANCE_PINNED_FIELDS = ['plannedStartAt', 'plannedEndAt', 'odometerKm'] as const;

interface CostDto {
  cost?: string | null;
  receiptCode?: string | null;
}

/**
 * Luật 1 — người không thấy chi phí không ghi được chi phí.
 *
 * `null` từ người KHÔNG thấy chi phí được coi như VẮNG MẶT (bỏ khỏi lệnh, giữ nguyên bản đang lưu):
 * họ không thể có ý định "xoá một con số mình không nhìn thấy", và app native (ADR 0031 — bản
 * riêng, chưa đổi) vẫn luôn gửi `cost: null, receiptCode: null`. Từ chối `null` là khoá nhân viên
 * thiếu quyền tiền khỏi việc lưu phiếu trên app. Giá trị THẬT thì 403. Phiên hỗ trợ còn chặt hơn:
 * guard từ chối cả hai KHOÁ, kể cả `null` (`supportRecordFieldsCheck`).
 */
export function assertCostWritable(dto: CostDto, canViewCost: boolean): void {
  if (canViewCost) return;
  const record = dto as Record<string, unknown>;
  for (const field of MAINTENANCE_COST_FIELDS) if (record[field] === null) delete record[field];
  const touched = MAINTENANCE_COST_FIELDS.filter((field) => dto[field] !== undefined);
  if (touched.length === 0) return;
  throw new ForbiddenException({
    code: API_ERROR_CODE.MISSING_PERMISSION,
    message: 'Không có quyền xem chi phí bảo dưỡng nên không được ghi chi phí',
    details: { missing: [PERMISSION.VEHICLE_MAINTENANCE_COST_VIEW], fields: touched },
  });
}

function fieldDenied(fields: string[], message: string): SupportActionDenial {
  return {
    denied: true,
    code: API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED,
    message,
    details: { fields },
  };
}

function supportRecordFieldsCheck(
  req: RequestContext,
  { creating }: { creating: boolean },
): readonly SupportCapability[] | SupportActionDenial {
  const body: unknown = req.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return fieldDenied([], 'Thân lệnh không hợp lệ');
  const record = body as Record<string, unknown>;
  const pinned = new Set<string>(SUPPORT_MAINTENANCE_PINNED_FIELDS);

  const rejected = Object.keys(record).filter((key) => !SUPPORT_WRITABLE.has(key) && !pinned.has(key));
  if (rejected.length > 0) {
    return fieldDenied(rejected, 'Phiên hỗ trợ không được ghi chi phí, trạng thái hay chu kỳ của phiếu');
  }
  // Tạo phiếu: không có "bản đang lưu" để so — trường ghim phải vắng hoặc null. Một khung giờ ở
  // đây là giữ chỗ lịch xe, và lập lịch không thuộc Đợt 1.
  if (creating) {
    const withValue = [...pinned].filter((key) => record[key] !== undefined && record[key] !== null);
    if (withValue.length > 0) {
      return fieldDenied(withValue, 'Phiên hỗ trợ không lập lịch hay ghi KM cho phiếu bảo dưỡng');
    }
  }
  return [SUPPORT_CAPABILITY.MAINTENANCE_MANAGE];
}

/** `@SupportAction` của `POST …/maintenance/records`. */
export const supportMaintenanceCreate = (req: RequestContext) =>
  supportRecordFieldsCheck(req, { creating: true });

/** `@SupportAction` của `PUT …/maintenance/records/:recordId` — so trường ghim ở service. */
export const supportMaintenanceUpdate = (req: RequestContext) =>
  supportRecordFieldsCheck(req, { creating: false });

interface PinnedCurrent {
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  odometerKm: number | null;
}

interface PinnedDto {
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  odometerKm?: number | null;
}

function sameInstant(value: string | null, stored: Date | null): boolean {
  if (value === null || stored === null) return value === null && stored === null;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() === stored.getTime();
}

/**
 * Phiên hỗ trợ sửa phiếu: trường ghim có mặt thì phải bằng bản đang lưu, rồi bị BỎ khỏi lệnh —
 * để lệnh sửa không đi vào nhánh dời/nhả/giữ chỗ lịch nào.
 */
export function assertAndStripSupportPinned(current: PinnedCurrent, dto: PinnedDto): void {
  const changed: string[] = [];
  if (dto.plannedStartAt !== undefined && !sameInstant(dto.plannedStartAt, current.plannedStartAt)) {
    changed.push('plannedStartAt');
  }
  if (dto.plannedEndAt !== undefined && !sameInstant(dto.plannedEndAt, current.plannedEndAt)) {
    changed.push('plannedEndAt');
  }
  if (dto.odometerKm !== undefined && dto.odometerKm !== current.odometerKm) changed.push('odometerKm');
  if (changed.length > 0) {
    throw new ForbiddenException({
      code: API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED,
      message: 'Phiên hỗ trợ không đổi lịch hay KM của phiếu bảo dưỡng',
      details: { fields: changed },
    });
  }
  const record = dto as Record<string, unknown>;
  for (const field of SUPPORT_MAINTENANCE_PINNED_FIELDS) delete record[field];
}
