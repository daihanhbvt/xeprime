import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AccountTrackNotice } from '@/features/account/components/AccountTrackNotice';
import { AccountView } from '@/features/account/components/AccountView';
import { AccountDocumentsCard } from '@/features/driver-licence/components/AccountDocumentsCard';

import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.public');
  return {
    title: t('accountMine'),
    // Hồ sơ cá nhân — không có gì để index, và không nên xuất hiện trên công cụ tìm kiếm.
    robots: { index: false, follow: false },
  };
}

/**
 * "Quản lý tài khoản" — hồ sơ CON NGƯỜI và các thao tác trên chính danh tính đó (design Account /
 * Profile, 22/10/2026).
 *
 * Chủ xe, chủ gian hàng và khách thuê dùng CHUNG trang này (ADR 0014). Vỏ (menu, cổng đăng nhập)
 * nằm ở `layout.tsx`; thành viên gian hàng tuyến gói được `AccountShell` đưa sang `/manage/account`
 * trước khi tới đây.
 *
 *   1. `AccountView`          — "Thông tin tài khoản" (tên, ảnh, email/SĐT, lối tắt số dư) + thẻ
 *                               "Đăng xe cho thuê".
 *   2. `AccountDocumentsCard` — Giấy tờ & Xác minh (bằng lái).
 *
 * TIỀN không còn ở đây: số dư, tài khoản nhận tiền và lịch sử thanh toán gộp thành mục "Quản lý
 * thanh toán" của menu (`/account/balance`) — viên "Số dư" ở đầu thẻ hồ sơ là lối tắt tới đó.
 *
 * YÊU CẦU xoá tài khoản cũng không còn ở đây: nó là một hộp của mục "Bảo mật tài khoản"
 * (`/account/change-password`, design Account / Security) — một nơi duy nhất, không lặp ở hai trang.
 */
export default function AccountPage() {
  return (
    <div className={styles.stack}>
      <AccountTrackNotice />
      <AccountView />
      <AccountDocumentsCard />
    </div>
  );
}
