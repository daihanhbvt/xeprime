import type { Href } from 'expo-router';
import { ACCOUNT_REALM, TENANT_ROLE } from '@xeprime/types';
import { WALLET_SCOPE, type WalletScope } from '@/api/wallet/api';
import { ROUTES } from '@/navigation/routes';
import type { CurrentUser } from '@/features/auth/api';

/**
 * MỘT TÀI KHOẢN, MỘT ví — và đây là chỗ duy nhất quyết định ví đó thuộc về ai (ADR 0053 điều 8,
 * thay "một người một ví" của ADR 0038 điều 2).
 *
 *  - tài khoản KHÁCH (app XePrime): ví `user` — tiền hoàn của chuyến họ đi thuê;
 *  - tài khoản ĐỐI TÁC là CHỦ gian hàng (app Partner): ví của TENANT — khoản XePrime phải trả;
 *  - nhân viên gian hàng: KHÔNG có ví (`null`) — ví và tài khoản nhận tiền của gian hàng là của
 *    chủ (`@ShopOwnerOnly`, ADR 0038 điều 3).
 *
 * Hỏi REALM rồi mới hỏi VAI, không hỏi tuyến: chủ xe tuyến hoa hồng và chủ gian hàng tuyến gói cùng
 * đọc sổ tenant. Cùng luật, cùng hàm với `apps/web/src/features/wallet/wallet-scope.ts` (ADR 0031:
 * hai bản, sửa contract dùng chung là sửa CẢ HAI).
 */
export function walletScopeFor(
  user: Pick<CurrentUser, 'tenant' | 'realm'> | null | undefined,
): WalletScope | null {
  if (user?.realm === ACCOUNT_REALM.PARTNER) {
    return user.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER ? WALLET_SCOPE.SHOP : null;
  }
  return WALLET_SCOPE.ACCOUNT;
}

/** ĐÍCH của sổ ví — sổ tenant ở khu quản lý (app Partner), sổ cá nhân ở khu tài khoản (app khách). */
export function walletHrefFor(scope: WalletScope): Href {
  return scope === WALLET_SCOPE.SHOP ? ROUTES.manage.balance() : ROUTES.account.balance();
}
