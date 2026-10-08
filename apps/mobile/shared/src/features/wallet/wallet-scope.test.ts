import { ACCOUNT_REALM, BILLING_MODE, TENANT_ROLE } from '@xeprime/types';
import { WALLET_SCOPE } from '@/api/wallet/api';
import type { CurrentUser } from '@/features/auth/api';
import { ROUTES } from '@/navigation/routes';
import { walletHrefFor, walletScopeFor } from './wallet-scope';

/**
 * MỘT TÀI KHOẢN, MỘT ví (ADR 0053 điều 8) — gương của `wallet-scope.test.ts` bên web.
 */
type Me = Pick<CurrentUser, 'tenant' | 'realm'>;

function partner(roleKey: string | null, billingMode: string = BILLING_MODE.COMMISSION): Me {
  return {
    realm: ACCOUNT_REALM.PARTNER,
    tenant: roleKey ? ({ roleKey, billingMode } as NonNullable<CurrentUser['tenant']>) : null,
  };
}

describe('walletScopeFor', () => {
  it('tài khoản khách: ví thuộc CON NGƯỜI (tiền hoàn chuyến đi thuê)', () => {
    expect(walletScopeFor({ realm: ACCOUNT_REALM.CUSTOMER, tenant: null })).toBe(
      WALLET_SCOPE.ACCOUNT,
    );
    // Chưa đăng nhập — màn khách vẫn hỏi sổ cá nhân, server tự từ chối.
    expect(walletScopeFor(null)).toBe(WALLET_SCOPE.ACCOUNT);
  });

  it('chủ gian hàng (tài khoản đối tác): ví thuộc TENANT ở CẢ HAI tuyến', () => {
    expect(walletScopeFor(partner(TENANT_ROLE.SHOP_OWNER))).toBe(WALLET_SCOPE.SHOP);
    expect(walletScopeFor(partner(TENANT_ROLE.SHOP_OWNER, BILLING_MODE.PACKAGE))).toBe(
      WALLET_SCOPE.SHOP,
    );
  });

  it('nhân viên gian hàng và tài khoản đối tác chưa có gian hàng: KHÔNG có ví', () => {
    for (const role of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      expect(walletScopeFor(partner(role))).toBeNull();
    }
    expect(walletScopeFor(partner(null))).toBeNull();
  });
});

describe('walletHrefFor', () => {
  it('sổ tenant ở khu quản lý, sổ cá nhân ở khu tài khoản', () => {
    expect(walletHrefFor(WALLET_SCOPE.SHOP)).toEqual(ROUTES.manage.balance());
    expect(walletHrefFor(WALLET_SCOPE.ACCOUNT)).toEqual(ROUTES.account.balance());
  });
});
