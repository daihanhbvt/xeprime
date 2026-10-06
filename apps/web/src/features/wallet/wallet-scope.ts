import { ACCOUNT_REALM, TENANT_ROLE } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import type { CurrentUser } from '@/hooks/use-current-user';

import type { WalletScope } from './types';

/**
 * MỘT TÀI KHOẢN, MỘT ví — và đây là chỗ duy nhất quyết định ví đó thuộc về ai (ADR 0053 điều 8,
 * thay "một người một ví" của ADR 0038 điều 2):
 *
 *  - tài khoản KHÁCH (site khách) → ví `user`: tiền hoàn khoản giữ chỗ chảy vào đây;
 *  - tài khoản ĐỐI TÁC là chủ gian hàng → ví `tenant` (khoản XePrime phải trả);
 *  - tài khoản đối tác KHÔNG phải chủ (nhân viên) → KHÔNG có ví (`null`): tiền của gian hàng là
 *    của chủ (`@ShopOwnerOnly`), và tài khoản partner không có ví `user`.
 *
 * Cùng một người có cả tài khoản khách lẫn tài khoản đối tác thì có HAI ví — hai tài khoản, hai sổ,
 * không bao giờ gộp. Hàm THUẦN, test được mà không dựng React.
 */
export function walletScopeFor(
  user: Pick<CurrentUser, 'tenant' | 'realm'> | null | undefined,
): WalletScope | null {
  if (user?.realm === ACCOUNT_REALM.PARTNER) {
    return user.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER ? 'shop' : null;
  }
  return 'account';
}

/**
 * Màn ví đầy đủ (sổ giao dịch + lệnh rút) của một scope ĐÃ chọn bằng `walletScopeFor`: ví gian hàng
 * ở site partner, ví cá nhân ở site khách. Nhận scope chứ không nhận người dùng: tài khoản không có
 * ví (`null`) không có màn ví nào để dẫn tới, và kiểu dữ liệu buộc nơi gọi xử lý trường hợp đó trước.
 */
export function walletHrefFor(scope: WalletScope): string {
  return scope === 'shop' ? ROUTES.MANAGE.BALANCE : ROUTES.ACCOUNT.BALANCE;
}
