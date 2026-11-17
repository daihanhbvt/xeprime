import { SERVICE_TYPE } from '@xeprime/types';
import { ownerEditMenuGroups, ownerOptimizationService } from './owner-edit-nav';

const NONE = { documents: false, maintenance: false, source: false };
const ALL = { documents: true, maintenance: true, source: true };

/** Menu sửa xe Owner Lite — web `EDIT_MENU_GROUPS` + `menuEnabled` khi `isManage === false`. */
describe('ownerEditMenuGroups', () => {
  it('đủ năng lực: hai nhóm đúng thứ tự web; "Vận hành nâng cao" luôn ẩn ở Owner Lite', () => {
    // Đích của Bảo dưỡng / Nguồn xe là route sửa xe của GIAN HÀNG - khu Owner Lite không cho vào.
    expect(ownerEditMenuGroups(ALL).map((g) => [g.key, g.items.map((i) => i.key)])).toEqual([
      ['profile', ['information', 'media', 'documents', 'trip-history']],
      ['rental', ['services', 'policy']],
    ]);
  });

  it('tuyến hoa hồng không có gói: không nhóm "Vận hành nâng cao"; thiếu quyền giấy tờ thì ẩn mục đó', () => {
    expect(ownerEditMenuGroups(NONE).map((g) => [g.key, g.items.map((i) => i.key)])).toEqual([
      ['profile', ['information', 'media', 'trip-history']],
      ['rental', ['services', 'policy']],
    ]);
  });
});

describe('ownerOptimizationService', () => {
  it('xe chỉ có tài xế mở tab có tài xế, còn lại tự lái', () => {
    expect(ownerOptimizationService([SERVICE_TYPE.WITH_DRIVER])).toBe(SERVICE_TYPE.WITH_DRIVER);
    expect(ownerOptimizationService([SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER])).toBe(
      SERVICE_TYPE.SELF_DRIVE,
    );
    expect(ownerOptimizationService([])).toBe(SERVICE_TYPE.SELF_DRIVE);
  });
});
