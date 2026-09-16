import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { AccountDeletionImpact } from '@/features/account/components/AccountDeletionImpact';
import { DeleteAccountView } from '@/features/account/components/DeleteAccountView';
import { LoginMethodsCard } from '@/features/account/components/LoginMethodsCard';
import { ChangePasswordForm } from '@/features/auth/components/ChangePasswordForm';

import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.manage');
  return { title: t('security'), robots: { index: false, follow: false } };
}

/**
 * BẢO MẬT TÀI KHOẢN của người đang đăng nhập (16/09/2026).
 *
 * ## Vì sao trang này KHÔNG có mục sidebar
 *
 * Mật khẩu và xoá tài khoản là việc của một CON NGƯỜI, không phải một bước vận hành gian hàng.
 * Một dòng thường trực trong sidebar đứng cạnh "Đơn thuê", "Chi nhánh", "Tài xế" là một dòng nói
 * về chủ đề khác hẳn các dòng còn lại — và nó bị mở đúng một lần mỗi vài tháng. Lối vào nằm ở
 * menu tài khoản trên thẻ người dùng (`ManageUserCard`), đúng nơi người ta đi tìm nó.
 *
 * Nhưng trang thì PHẢI có: trước 15/09/2026 màn đổi mật khẩu duy nhất là `/account/change-password`
 * ở khu khách — khu đã đóng với thành viên gian hàng tuyến gói. Nhân viên sống trong `/manage`
 * vì thế không có đường nào trong cổng để đổi mật khẩu của chính mình.
 *
 * ## Ba khối, và chỉ ba
 *
 *   1. Phương thức đăng nhập — email/SĐT, tình trạng xác minh, lối đổi qua OTP.
 *   2. Đổi mật khẩu.
 *   3. Vùng nguy hiểm — ảnh hưởng của việc đóng tài khoản, rồi form yêu cầu.
 *
 * KHÔNG có hồ sơ gian hàng, logo, gói, ví, hạn mức hay hoá đơn. Trang cũ (`/manage/account`) có
 * lẫn một thẻ lối vào gian hàng và ô sửa ảnh đại diện cá nhân; cả hai đã bỏ — hình đại diện của
 * cổng quản lý là LOGO GIAN HÀNG, và mọi thứ về gian hàng sống ở `/manage/shop`.
 *
 * Ba khối đều DÙNG LẠI component của khu `/account`, không clone: luật mật khẩu và luật xoá tài
 * khoản đổi thì chỉ có một chỗ phải sửa. Chúng nhận `headingLevel="h2"` vì `h1` của trang thuộc
 * về `ManagePageHeader` ở trên.
 *
 * Khối 3 đặt `AccountDeletionImpact` TRƯỚC form: người đứng trong `/manage` có ví, có thể có
 * lệnh rút đang chạy và một pháp nhân gắn vào tài khoản — form gốc (viết cho khách thuê) không
 * nói gì về chúng. Nó KHÔNG chặn nút gửi: yêu cầu vẫn vào hàng đợi support để người thật xử lý.
 */
export default async function ManageSecurityPage() {
  const t = await getTranslations('Account.security');

  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className={styles.stack}>
        <LoginMethodsCard headingLevel="h2" />
        <ChangePasswordForm headingLevel="h2" />
        <section className={styles.danger} aria-label={t('dangerZone')}>
          <AccountDeletionImpact />
          <DeleteAccountView headingLevel="h2" />
        </section>
      </div>
    </div>
  );
}
