import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AccountDeletionImpact } from '@/features/account/components/AccountDeletionImpact';
import { AccountMoneyPanel } from '@/features/account/components/AccountMoneyPanel';
import { AccountTrackNotice } from '@/features/account/components/AccountTrackNotice';
import { AccountView } from '@/features/account/components/AccountView';
import { DeleteAccountView } from '@/features/account/components/DeleteAccountView';

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
 * "Tài khoản của tôi" — hồ sơ CON NGƯỜI, TIỀN của họ, và các thao tác trên chính danh tính đó.
 *
 * Chủ xe, chủ gian hàng và khách thuê dùng CHUNG trang này (ADR 0014). Vỏ (menu, cổng đăng nhập)
 * nằm ở `layout.tsx`; thành viên gian hàng tuyến gói được `AccountShell` đưa sang `/manage/account`
 * trước khi tới đây.
 *
 * ## Ba khối, theo thứ tự người dùng cần chúng (16/09/2026)
 *
 *   1. `AccountView`        — tên, ảnh, email/SĐT, và thẻ "Gian hàng của tôi" (lối nâng cấp gói).
 *   2. `AccountMoneyPanel`  — số dư MỘT ví duy nhất + tài khoản ngân hàng nhận tiền. Sổ giao dịch
 *                             và lệnh rút nằm sau một cú bấm vào số điểm.
 *   3. `DeleteAccountView`  — yêu cầu xoá tài khoản: một support case, KHÔNG phải nút xoá.
 *
 * Vì sao cả ba ở đây thay vì ba mục menu riêng: chúng đều thao tác trên MỘT danh tính. Tách ra
 * thì "Tài khoản nhận tiền" và "Ví điểm" thành hai cửa mà người dùng phải đoán xem tiền nằm sau
 * cửa nào — và trước đợt này họ phải đoán giữa BA cửa.
 *
 * Khối 3 đứng cuối và có cảnh báo riêng: nó là việc một lần và khó lùi lại. Đặt nó giữa trang,
 * cạnh ô sửa tên, là mời bấm nhầm.
 */
export default function AccountPage() {
  return (
    <div className={styles.stack}>
      <AccountTrackNotice />
      <AccountView />
      <AccountMoneyPanel />
      <div className={styles.stack}>
        <AccountDeletionImpact />
        <DeleteAccountView />
      </div>
    </div>
  );
}
