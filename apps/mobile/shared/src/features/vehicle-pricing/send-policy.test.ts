import { POLICY_BLOCK } from '@/features/rental-policies/components/PolicySections';
import { OWNER_POLICY_BLOCKS, shouldSendPolicy } from './VehiclePricingScreen';

const base = {
  overriding: false,
  showPolicy: true,
  direct: false,
  policyDirty: false,
  editMode: false,
};

/**
 * Luật "có ghi bộ chính sách riêng không" — chép nguyên `sendPolicy` của web
 * `VehiclePricingWorkspace`: `overriding || (showPolicy && (direct ? policyDirty : editMode))`.
 */
describe('shouldSendPolicy — đúng luật của web', () => {
  it('direct (khu tài khoản): sửa MỖI giá ⇒ không ghi chính sách', () => {
    expect(shouldSendPolicy({ ...base, direct: true })).toBe(false);
  });

  it('direct: một ô chính sách đổi ⇒ ghi chính sách riêng', () => {
    expect(shouldSendPolicy({ ...base, direct: true, policyDirty: true })).toBe(true);
  });

  it('direct: editMode không có nghĩa — chỉ ô bẩn mới quyết', () => {
    expect(shouldSendPolicy({ ...base, direct: true, editMode: true })).toBe(false);
  });

  it('xe ĐANG ghi đè ⇒ luôn gửi lại bộ chính sách đang có', () => {
    expect(shouldSendPolicy({ ...base, direct: true, overriding: true })).toBe(true);
    expect(shouldSendPolicy({ ...base, overriding: true, showPolicy: false })).toBe(true);
  });

  it('switch (cổng quản lý): theo công tắc tuỳ chỉnh', () => {
    expect(shouldSendPolicy({ ...base, editMode: true })).toBe(true);
    expect(shouldSendPolicy({ ...base, policyDirty: true })).toBe(false);
  });

  it('chính sách ẩn (`policyMode=hidden`) ⇒ không ghi khi chưa ghi đè', () => {
    expect(shouldSendPolicy({ ...base, showPolicy: false, editMode: true })).toBe(false);
    expect(shouldSendPolicy({ ...base, showPolicy: false, direct: true, policyDirty: true })).toBe(
      false,
    );
  });
});

it('khu tài khoản bày đúng ba khối của web: cọc · giao xe · km', () => {
  expect(OWNER_POLICY_BLOCKS).toEqual([
    POLICY_BLOCK.COLLATERAL,
    POLICY_BLOCK.DELIVERY,
    POLICY_BLOCK.MILEAGE,
  ]);
});
