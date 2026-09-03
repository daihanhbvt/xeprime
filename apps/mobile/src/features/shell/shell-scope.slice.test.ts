import { APP_SCOPE } from './app-scope';
import {
  deepLinkConsumed,
  deepLinkPended,
  lastRouteChanged,
  scopeChanged,
  shellScopeReducer,
  shellScopeReset,
} from './shell-scope.slice';

const initial = shellScopeReducer(undefined, { type: '@@init' });

describe('shellScope', () => {
  it('mở app ở khu khách khi chưa ai chọn gì', () => {
    expect(initial).toEqual({
      scope: APP_SCOPE.CUSTOMER,
      lastRoute: {},
      pendingDeepLink: null,
    });
  });

  it('nhớ đích của TỪNG khu độc lập nhau', () => {
    let state = shellScopeReducer(
      initial,
      lastRouteChanged({ scope: APP_SCOPE.MANAGE, route: '/manage/bookings/01J' }),
    );
    state = shellScopeReducer(
      state,
      lastRouteChanged({ scope: APP_SCOPE.CUSTOMER, route: '/listings/01K' }),
    );

    expect(state.lastRoute).toEqual({
      manage: '/manage/bookings/01J',
      customer: '/listings/01K',
    });
  });

  /**
   * Bất biến quan trọng nhất của slice này: người kế tiếp đăng nhập trên cùng máy không được
   * mở thẳng vào khu quản lý của một gian hàng họ không thuộc về, rồi bị `ScopeGuard` đá ra —
   * đó là một cú nháy không giải thích được.
   */
  it('kết thúc phiên xoá SẠCH khu, đích đã nhớ và deep link đang chờ', () => {
    let state = shellScopeReducer(initial, scopeChanged(APP_SCOPE.MANAGE));
    state = shellScopeReducer(
      state,
      lastRouteChanged({ scope: APP_SCOPE.MANAGE, route: '/manage/bookings' }),
    );
    state = shellScopeReducer(state, deepLinkPended('/manage/requests'));

    expect(shellScopeReducer(state, shellScopeReset())).toEqual(initial);
  });

  it('deep link tiêu thụ đúng một lần', () => {
    const pended = shellScopeReducer(initial, deepLinkPended('/manage/bookings/01J'));
    expect(pended.pendingDeepLink).toBe('/manage/bookings/01J');
    expect(shellScopeReducer(pended, deepLinkConsumed()).pendingDeepLink).toBeNull();
  });
});
