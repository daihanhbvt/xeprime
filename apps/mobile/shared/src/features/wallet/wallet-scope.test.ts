import { TENANT_ROLE } from '@xeprime/types';
import { WALLET_SCOPE } from '@/api/wallet/api';
import type { CurrentUser } from '@/features/auth/api';
import { walletScopeFor } from './wallet-scope';

/**
 * MỘT người, MỘT ví (ADR 0038 điều 2).
 *
 * Bộ này khoá đúng cái bẫy khiến lỗi ở đây KHÔNG nhìn thấy được: từ 15/09/2026 `GET /account/wallet`
 * trả số 0 cho một chủ xe — đúng theo server, vì ví của họ đã đổi chủ sang tenant. Một màn hỏi sai
 * scope vì thế không báo lỗi gì cả: nó hiện "0 điểm" và trông hoàn toàn bình thường.
 */
function user(tenant: Partial<NonNullable<CurrentUser['tenant']>> | null): CurrentUser {
  return { tenant: tenant ? (tenant as NonNullable<CurrentUser['tenant']>) : null } as CurrentUser;
}

describe('walletScopeFor', () => {
  it('chưa đăng nhập / chưa là chủ xe: ví thuộc CON NGƯỜI', () => {
    expect(walletScopeFor(null)).toBe(WALLET_SCOPE.ACCOUNT);
    expect(walletScopeFor(undefined)).toBe(WALLET_SCOPE.ACCOUNT);
    expect(walletScopeFor(user(null))).toBe(WALLET_SCOPE.ACCOUNT);
  });

  /**
   * Hỏi VAI, không hỏi tuyến — khác có chủ đích với `resolveAccountNav`: ví đổi chủ ở mốc "thành
   * chủ xe", không ở mốc "mua gói". Nâng từ hoa hồng lên gói KHÔNG đụng ví.
   */
  it('chủ xe: ví thuộc TENANT ở CẢ HAI tuyến', () => {
    for (const billingMode of ['commission', 'package', null]) {
      expect(walletScopeFor(user({ roleKey: TENANT_ROLE.SHOP_OWNER, billingMode }))).toBe(
        WALLET_SCOPE.SHOP,
      );
    }
  });

  /**
   * Ví gian hàng là quyền SỞ HỮU, không phải permission (ADR 0038 điều 3): quản lý/nhân viên/người
   * xem không có ví tenant, nên sổ của họ là sổ cá nhân của chính họ.
   */
  it('quản lý/nhân viên/người xem giữ ví cá nhân, không đọc ví gian hàng', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      expect(walletScopeFor(user({ roleKey, billingMode: 'package' }))).toBe(WALLET_SCOPE.ACCOUNT);
    }
  });
});
