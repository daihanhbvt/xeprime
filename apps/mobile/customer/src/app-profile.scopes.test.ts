import { APP_SCOPE } from '@/features/shell/app-scope';
import { SWITCHABLE_SCOPES, scopeHome } from './app-profile';

describe('XePrime — bảng đổi khu', () => {
  it('chỉ khu khách: tài khoản khách không có gian hàng (ADR 0053)', () => {
    expect(SWITCHABLE_SCOPES).toEqual([APP_SCOPE.CUSTOMER]);
  });

  it('khu MANAGE (nếu có lối cũ nào gọi tới) vẫn chỉ đổ về màn handoff /partner', () => {
    expect(scopeHome(APP_SCOPE.MANAGE)).toBe('/partner');
  });
});
