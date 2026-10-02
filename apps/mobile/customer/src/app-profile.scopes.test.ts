import { APP_SCOPE } from '@/features/shell/app-scope';
import { SWITCHABLE_SCOPES, scopeHome } from './app-profile';

describe('XePrime — bảng đổi khu', () => {
  it('giữ lối sang khu quản lý vì nó dẫn tới màn handoff /partner, không phải ngõ cụt', () => {
    expect(scopeHome(APP_SCOPE.MANAGE)).toBe('/partner');
    expect(SWITCHABLE_SCOPES).toEqual([APP_SCOPE.MANAGE, APP_SCOPE.CUSTOMER]);
  });
});
