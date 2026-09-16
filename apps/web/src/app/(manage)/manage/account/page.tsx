import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AccountDeletionImpact } from '@/features/account/components/AccountDeletionImpact';
import { AccountView } from '@/features/account/components/AccountView';
import { DeleteAccountView } from '@/features/account/components/DeleteAccountView';
import { RenterTripsTransitionCard } from '@/features/account/components/RenterTripsTransitionCard';
import { ChangePasswordForm } from '@/features/auth/components/ChangePasswordForm';

import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.manage');
  return { title: t('account'), robots: { index: false, follow: false } };
}

/**
 * TÀI KHOẢN & BẢO MẬT của NGƯỜI ĐANG ĐĂNG NHẬP — trong cổng quản lý (15/09/2026).
 *
 * ## Vì sao màn này phải tồn tại
 *
 * Trước đây màn đổi mật khẩu duy nhất là `/account/change-password`, và KHÔNG mục nào trong
 * `SHOP_NAV` dẫn tới nó. Một `shop_staff` sống trong `/manage` vì thế không có đường nào trong
 * cổng để đổi mật khẩu hay sửa tên/email của chính mình — họ phải tự đoán ra một URL thuộc khu
 * khác.
 *
 * ## Hai HỒ SƠ khác nhau, và đây là chỗ tách chúng
 *
 *   `/manage/shop`     — hồ sơ GIAN HÀNG: pháp nhân, địa chỉ, mã số thuế, tài khoản thu.
 *                        Đổi nó là đổi thứ khách nhìn thấy và thứ in trên hợp đồng.
 *   `/manage/account`  — hồ sơ CON NGƯỜI: tên, email/SĐT, mật khẩu, thao tác bảo mật.
 *                        Đổi nó chỉ ảnh hưởng chính người đang đăng nhập.
 *
 * Gộp hai thứ vào một màn (như bản trước vô tình làm, bằng cách không có màn thứ hai) khiến một
 * nhân viên tưởng mình đang sửa hồ sơ cá nhân trong khi đang đứng trước hồ sơ pháp nhân.
 *
 * DÙNG LẠI `AccountView`, `ChangePasswordForm` và `DeleteAccountView` của khu `/account` — không
 * clone. Ba màn khác nhau ở VỎ điều hướng, không khác ở nghiệp vụ; một bản sao thứ hai là hai chỗ
 * phải sửa mỗi lần đổi luật mật khẩu hay luật xoá tài khoản.
 *
 * ## Bốn khối, theo thứ tự người dùng cần chúng
 *
 *   1. Hồ sơ con người — việc hằng ngày.
 *   2. Đổi mật khẩu — việc thỉnh thoảng.
 *   3. Chuyến ĐI THUÊ cũ — chỉ hiện với người còn chuyến chưa khép sau khi nâng tuyến. Đây là lối
 *      duy nhất tới `/manage/account/trips`; KHÔNG có mục menu nào dẫn tới đó (ADR 0038 điều 7).
 *   4. Yêu cầu xoá tài khoản — việc một lần, và không thể lùi lại được dễ dàng.
 *
 * Khối 4 đi kèm `AccountDeletionImpact` đặt TRƯỚC form: người đang đứng trong `/manage` có ví,
 * lệnh rút và một pháp nhân gắn vào tài khoản, và form gốc (viết cho khách thuê) không nói gì về
 * chúng. Nó KHÔNG chặn nút gửi — yêu cầu vẫn đi vào hàng đợi support để người thật xử lý.
 */
export default function ManageAccountPage() {
  return (
    <div className={styles.stack}>
      <AccountView />
      <ChangePasswordForm />
      <RenterTripsTransitionCard />
      <div className={styles.stack}>
        <AccountDeletionImpact />
        <DeleteAccountView />
      </div>
    </div>
  );
}
