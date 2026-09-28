import { describe, expect, it } from 'vitest';
import { PERMISSION } from './rbac';
import {
  SUPPORT_CAPABILITY,
  SUPPORT_CAPABILITY_VALUES,
  SUPPORT_REASON_REQUIRED_CAPABILITIES,
  SUPPORT_VEHICLE_CREATE_FIELDS,
  SUPPORT_WRITE_CAPABILITIES,
  isMeaningfulSupportReason,
  supportCapabilityNeedsReason,
  supportPermissionsFor,
} from './tenant-support';

/**
 * Bảng luật dùng chung web↔api của phiên hỗ trợ gian hàng (ADR 0050 §13).
 */
describe('isMeaningfulSupportReason — lý do phải nói VÌ SAO', () => {
  it.each([
    ['hỗ trợ'],
    ['admin sửa'],
    ['theo yêu cầu'],
    ['Hỗ trợ theo yêu cầu'],
    ['Admin sửa giúp chủ xe'],
    ['support request'],
    ['           '],
    ['ok'],
  ])('%s — quá chung chung: từ chối', (reason) => {
    expect(isMeaningfulSupportReason(reason)).toBe(false);
  });

  it.each([
    ['Chủ xe nhờ chuyển Vios sang chi nhánh Thủ Đức'],
    ['Owner gọi hotline 14h, xe đang bảo dưỡng tới thứ 6'],
    ['#4821'],
    ['SC-000123'],
    ['Theo ticket TK-42 của chủ xe'],
  ])('%s — đủ nghĩa', (reason) => {
    expect(isMeaningfulSupportReason(reason)).toBe(true);
  });

  it('quá 500 ký tự thì từ chối', () => {
    expect(isMeaningfulSupportReason(`Chuyển chi nhánh ${'x'.repeat(500)}`)).toBe(false);
  });
});

describe('capability 2B', () => {
  it('mọi capability ghi đều có trong tập giá trị (CHECK của DB lấy từ đây)', () => {
    for (const capability of SUPPORT_WRITE_CAPABILITIES) {
      expect(SUPPORT_CAPABILITY_VALUES).toContain(capability);
    }
  });

  it('không có capability "toàn quyền" nào', () => {
    for (const forbidden of ['act_as_owner', 'full_tenant_access', 'all_write', 'bypass_validation', 'shop_owner_mode']) {
      expect(SUPPORT_CAPABILITY_VALUES).not.toContain(forbidden);
    }
  });

  it('ba thao tác rủi ro thấp dùng lý do của phiên; phần còn lại đòi lý do riêng', () => {
    expect(supportCapabilityNeedsReason(SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT)).toBe(false);
    expect(supportCapabilityNeedsReason(SUPPORT_CAPABILITY.VEHICLE_MEDIA_MANAGE)).toBe(false);
    expect(supportCapabilityNeedsReason(SUPPORT_CAPABILITY.MAINTENANCE_MANAGE)).toBe(false);
    for (const capability of SUPPORT_REASON_REQUIRED_CAPABILITIES) {
      expect(SUPPORT_WRITE_CAPABILITIES).toContain(capability);
    }
    expect(supportCapabilityNeedsReason(SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN)).toBe(true);
    expect(supportCapabilityNeedsReason(SUPPORT_CAPABILITY.VEHICLE_SUBMIT_REVIEW)).toBe(true);
  });

  it('giấy tờ: xem trạng thái + quản lý, KHÔNG xem chi tiết/file', () => {
    const permissions = supportPermissionsFor([SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE]);
    expect(permissions).toContain(PERMISSION.VEHICLE_DOCUMENT_MANAGE);
    expect(permissions).not.toContain(PERMISSION.VEHICLE_DOCUMENT_DETAIL_VIEW);
    expect(permissions).not.toContain(PERMISSION.VEHICLE_DOCUMENT_FILE_VIEW);
  });

  it('tạo xe nháp: không trường giá, giảm giá, nguồn xe hay trạng thái vận hành', () => {
    for (const field of [
      'weekdayPrice',
      'weekendPrice',
      'hourlyPrice',
      'monthlyPrice',
      'withDriverDailyPrice',
      'discountPercent',
      'sourceType',
      'operationStatus',
    ]) {
      expect(SUPPORT_VEHICLE_CREATE_FIELDS).not.toContain(field);
    }
    expect(SUPPORT_VEHICLE_CREATE_FIELDS).toContain('name');
    expect(SUPPORT_VEHICLE_CREATE_FIELDS).toContain('branchId');
  });
});
