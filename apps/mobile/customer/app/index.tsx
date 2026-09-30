import { Redirect } from 'expo-router';
import { Screen } from '@/components/layout/Screen';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { useLandingScope } from '@/features/shell/use-landing-scope';

/**
 * CỬA VÀO APP — chạy mỗi lần mở app, mỗi lần refresh, mỗi lần deep link rơi vào gốc.
 *
 * Đích phụ thuộc VAI của phiên, không phải một hằng số:
 *  - có gian hàng tuyến gói, hoặc là nhân sự nền tảng → khu quản lý;
 *  - gian hàng trả phí chưa chuyển khoản → thẳng bước 2 của onboarding (ADR 0040);
 *  - khách thuần, chủ xe tuyến hoa hồng, hoặc chưa đăng nhập → marketplace.
 *
 * Marketplace vẫn là khu CÔNG KHAI: khách chưa đăng nhập không bị chặn bằng màn đăng nhập, chỉ
 * là họ không phải người có chỗ nào khác để vào.
 *
 * Màn chờ ở đây là bắt buộc, không phải trang trí: `/auth/me` và Keychain đều bất đồng bộ, và
 * chọn đích trước khi chúng về là cú giật "vào marketplace rồi nhảy sang khu quản lý".
 */
export default function IndexRoute() {
  const landing = useLandingScope();

  if (!landing) {
    return (
      <Screen scroll={false}>
        <ScreenLoading />
      </Screen>
    );
  }

  return <Redirect href={landing.href} />;
}
