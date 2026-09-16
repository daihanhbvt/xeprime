import { describe, expect, it } from 'vitest';
import { BILLING_MODE, BILLING_PHASE, TENANT_ROLE } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import type { CurrentUser } from '@/hooks/use-current-user';

import { walletHrefFor, walletScopeFor } from './wallet-scope';

/**
 * MỘT người, MỘT ví (ADR 0038 điều 2) — và một nơi duy nhất quyết định ví đó thuộc về ai.
 *
 * Luật này từng nằm rải ở bốn chỗ. Bốn bản sao của một câu `if` về tiền là bốn cơ hội để một màn
 * chỉ vào sổ RỖNG trong khi tiền nằm ở sổ kia — và với người đang đi tìm tiền của mình, "0 điểm"
 * là câu trả lời tệ nhất có thể.
 */

type Tenant = NonNullable<CurrentUser['tenant']>;

function withTenant(over: Partial<Tenant> = {}): Pick<CurrentUser, 'tenant'> {
  return {
    tenant: {
      id: 'T1',
      name: 'Gara Minh',
      roleKey: TENANT_ROLE.SHOP_OWNER,
      billingMode: BILLING_MODE.COMMISSION,
      billingPhase: BILLING_PHASE.CURRENT,
      ...over,
    } as Tenant,
  };
}

describe('walletScopeFor', () => {
  /*
   * Ví của chủ xe thuộc TENANT ở CẢ HAI tuyến, và giữ nguyên khi nâng gói — đó chính là điều đợt
   * hợp nhất ví làm: re-parent một hàng, không chuyển tiền. Nên `billingMode` KHÔNG được xuất hiện
   * trong phép chọn này.
   */
  it('chủ xe đọc ví TENANT, bất kể tuyến', () => {
    for (const billingMode of [BILLING_MODE.COMMISSION, BILLING_MODE.PACKAGE]) {
      expect(walletScopeFor(withTenant({ billingMode }))).toBe('shop');
    }
  });

  /*
   * Thành viên KHÔNG phải chủ đọc ví của chính họ (`user`). Ví tenant là nghĩa vụ XePrime nợ CHỦ
   * gian hàng, không nợ nhân viên — API cũng gác bằng `@ShopOwnerOnly()`, nên trỏ họ sang scope
   * `shop` chỉ đổi một màn rỗng thành một lỗi 403.
   */
  it('nhân viên gian hàng đọc ví cá nhân của chính họ', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      expect(walletScopeFor(withTenant({ roleKey }))).toBe('account');
    }
  });

  it('khách thuê thuần đọc ví cá nhân', () => {
    expect(walletScopeFor({ tenant: null })).toBe('account');
    expect(walletScopeFor(undefined)).toBe('account');
  });
});

describe('walletHrefFor', () => {
  it('chủ xe đi tới sổ ví tenant, người khác đi tới sổ cá nhân', () => {
    expect(walletHrefFor(withTenant())).toBe(ROUTES.ACCOUNT.EARNINGS);
    expect(walletHrefFor({ tenant: null })).toBe(ROUTES.ACCOUNT.BALANCE);
  });

  /* Hai đích luôn đi cùng cặp với scope — lệch nhau là một liên kết dẫn tới sổ của người khác. */
  it('đích luôn khớp scope', () => {
    for (const user of [withTenant(), withTenant({ roleKey: TENANT_ROLE.SHOP_STAFF }), { tenant: null }]) {
      const expected =
        walletScopeFor(user) === 'shop' ? ROUTES.ACCOUNT.EARNINGS : ROUTES.ACCOUNT.BALANCE;
      expect(walletHrefFor(user)).toBe(expected);
    }
  });
});
