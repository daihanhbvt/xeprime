import { APP_SCOPE } from '@/features/shell/app-scope';
import { SWITCHABLE_SCOPES, scopeHome } from './app-profile';

describe('XePrime Partner — bảng đổi khu', () => {
  it('chỉ khu quản lý; mọi khu đều về khu quản lý (không còn /not-eligible — ADR 0053)', () => {
    expect(SWITCHABLE_SCOPES).toEqual([APP_SCOPE.MANAGE]);
    expect(scopeHome(APP_SCOPE.CUSTOMER)).toBe('/manage');
  });
});
