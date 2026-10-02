import { APP_SCOPE } from '@/features/shell/app-scope';
import { SWITCHABLE_SCOPES, scopeHome } from './app-profile';

describe('XePrime Partner — bảng đổi khu', () => {
  it('không đưa ra khu khách: app này không có, chọn nó chỉ rơi vào /not-eligible', () => {
    expect(scopeHome(APP_SCOPE.CUSTOMER)).toBe('/not-eligible');
    expect(SWITCHABLE_SCOPES).toEqual([APP_SCOPE.MANAGE]);
  });
});
