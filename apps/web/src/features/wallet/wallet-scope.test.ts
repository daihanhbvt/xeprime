import { describe, expect, it } from 'vitest';
import { ACCOUNT_REALM, BILLING_MODE, BILLING_PHASE, TENANT_ROLE } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import type { CurrentUser } from '@/hooks/use-current-user';

import { walletHrefFor, walletScopeFor } from './wallet-scope';

/**
 * MỘT TÀI KHOẢN, MỘT ví (ADR 0053 điều 8) — và một nơi duy nhất quyết định ví đó thuộc về ai.
 *
 * Luật này từng nằm rải ở bốn chỗ. Bốn bản sao của một câu `if` về tiền là bốn cơ hội để một màn
 * chỉ vào sổ RỖNG trong khi tiền nằm ở sổ kia — và với người đang đi tìm tiền của mình, "0 điểm"
 * là câu trả lời tệ nhất có thể.
 */

type Tenant = NonNullable<CurrentUser['tenant']>;

function withTenant(over: Partial<Tenant> = {}): Pick<CurrentUser, 'tenant' | 'realm'> {
  return {
    realm: ACCOUNT_REALM.PARTNER,
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
   * Thành viên KHÔNG phải chủ KHÔNG có ví nào: ví tenant là nghĩa vụ XePrime nợ CHỦ gian hàng (API
   * gác bằng `@ShopOwnerOnly()`), và tài khoản partner không có ví `user` — tiền hoàn của chuyến đi
   * thuê chảy vào ví của tài khoản KHÁCH, một tài khoản khác (ADR 0053).
   */
  it('nhân viên gian hàng: không có ví (null), không gọi API ví', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      expect(walletScopeFor(withTenant({ roleKey }))).toBeNull();
    }
    expect(walletScopeFor({ realm: ACCOUNT_REALM.PARTNER, tenant: null })).toBeNull();
  });

  it('tài khoản khách đọc ví của chính tài khoản đó', () => {
    expect(walletScopeFor({ realm: ACCOUNT_REALM.CUSTOMER, tenant: null })).toBe('account');
    expect(walletScopeFor(undefined)).toBe('account');
  });
});

describe('walletHrefFor', () => {
  it('ví gian hàng ở site partner, ví cá nhân ở site khách', () => {
    expect(walletHrefFor('shop')).toBe(ROUTES.MANAGE.BALANCE);
    expect(walletHrefFor('account')).toBe(ROUTES.ACCOUNT.BALANCE);
  });
});
