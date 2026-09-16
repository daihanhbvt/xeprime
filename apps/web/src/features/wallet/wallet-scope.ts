import { TENANT_ROLE } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import type { CurrentUser } from '@/hooks/use-current-user';

import type { WalletScope } from './types';

/**
 * MỘT người, MỘT ví — và đây là chỗ duy nhất quyết định ví đó thuộc về ai (ADR 0038 điều 2).
 *
 * Chủ xe có ví thuộc TENANT: cả tiền hoàn khi chính họ đi thuê lẫn khoản XePrime phải trả khi họ
 * cho thuê đều chảy vào đúng sổ ấy, và nó giữ nguyên khi họ nâng lên gói. Người chưa là chủ xe
 * có ví thuộc `user`.
 *
 * Luật này lặp lại ở BỐN nơi trước khi được gom về đây — màn ví, thẻ tiền trong hồ sơ, hộp khai
 * tài khoản nhận hoàn, và chuyển hướng `/account/balance`. Bốn bản sao của một câu `if` về tiền
 * là bốn cơ hội để một màn chỉ vào sổ rỗng trong khi tiền nằm ở sổ kia.
 *
 * Hàm THUẦN và nhận đúng phần dữ liệu nó cần, nên test được mà không dựng React.
 */
export function walletScopeFor(user: Pick<CurrentUser, 'tenant'> | null | undefined): WalletScope {
  return user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER ? 'shop' : 'account';
}

/**
 * Màn ví đầy đủ (sổ giao dịch + lệnh rút) của người này.
 *
 * Hai route vì hai sổ, không phải vì hai giao diện: cả hai đều dựng `WalletView`, chỉ khác
 * `scope`. Chủ xe tuyến hoa hồng không vào `/manage/balance` được, nên sổ tenant của họ có một
 * cửa trong khu user.
 */
export function walletHrefFor(user: Pick<CurrentUser, 'tenant'> | null | undefined): string {
  return walletScopeFor(user) === 'shop' ? ROUTES.ACCOUNT.EARNINGS : ROUTES.ACCOUNT.BALANCE;
}
