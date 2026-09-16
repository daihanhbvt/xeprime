import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { WalletRedirectToShop } from '@/features/wallet/components/WalletRedirectToShop';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Wallet');
  return { title: t('title.user'), robots: { index: false, follow: false } };
}

/**
 * Ví điểm của MỘT CON NGƯỜI — ADR 0033, như đã sửa 15/09/2026 (ví hợp nhất).
 *
 * Người CHƯA là chủ xe (khách thuê thuần) có ví thuộc `user`, và đây là màn của họ: tiền hoàn
 * cọc chảy vào đó. Họ là phần lớn người dùng của trang này, nên không gắn `OwnerGate`.
 *
 * CHỦ XE thì khác: ví của họ đã đổi chủ sang tenant lúc mở gian hàng, và tiền hoàn khi chính họ
 * đi thuê cũng chảy về đó. Với họ, endpoint `/account/wallet` trả số 0 — đúng, nhưng một màn hiện
 * "0 điểm" trong khi tiền nằm ở một màn khác là cách chắc chắn nhất để một người tin rằng mình
 * đã mất tiền. Nên chuyển hướng sang đúng sổ của họ thay vì hiện một số 0 không giải thích được.
 *
 * Sau khi hợp nhất, menu chủ xe cũng không còn mục này (`resolveAccountNav`) — chuyển hướng ở
 * đây là để bắt các đường vào còn lại: bookmark, link cũ trong thông báo, và người gõ thẳng URL.
 */
export default function AccountBalancePage() {
  return <WalletRedirectToShop />;
}
