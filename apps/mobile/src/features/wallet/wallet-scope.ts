import { TENANT_ROLE } from '@xeprime/types';
import { WALLET_SCOPE, type WalletScope } from '@/api/wallet/api';
import type { CurrentUser } from '@/features/auth/api';

/**
 * MỘT người, MỘT ví — và đây là chỗ duy nhất quyết định ví đó thuộc về ai (ADR 0038 điều 2).
 *
 * Chủ xe có ví thuộc TENANT: cả tiền hoàn khi chính họ đi thuê lẫn khoản XePrime phải trả khi họ
 * cho thuê đều chảy vào đúng sổ ấy, và nó giữ nguyên khi họ nâng lên gói. Người chưa là chủ xe
 * có ví thuộc `user`.
 *
 * Hỏi VAI, không hỏi tuyến — khác hẳn `resolveAccountNav` ngay bên cạnh, và khác có chủ đích:
 * ví đổi chủ ở mốc "thành chủ xe", không ở mốc "mua gói". Hỏi `billingMode` ở đây sẽ chỉ chủ xe
 * tuyến hoa hồng vào ví `user` — một sổ RỖNG, trong khi tiền của họ nằm ở sổ tenant.
 *
 * Từ 15/09/2026 `GET /account/wallet` trả số 0 cho một chủ xe. Đó là hành vi ĐÚNG của server,
 * nên một màn hỏi sai scope không báo lỗi gì cả: nó hiện "0 điểm" và trông hoàn toàn bình thường.
 *
 * Cùng luật, cùng hàm với `apps/web/src/features/wallet/wallet-scope.ts` (ADR 0031: hai bản,
 * sửa contract dùng chung là sửa CẢ HAI).
 */
export function walletScopeFor(
  user: Pick<CurrentUser, 'tenant'> | null | undefined,
): WalletScope {
  return user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER
    ? WALLET_SCOPE.SHOP
    : WALLET_SCOPE.ACCOUNT;
}
