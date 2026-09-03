import { Redirect } from 'expo-router';
import { Screen } from '@/components/layout/Screen';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { useLandingScope } from '@/features/shell/use-landing-scope';
import { scopeHome } from '@/features/shell/use-shell-scope';

/**
 * CỬA VÀO APP — chạy mỗi lần mở app, mỗi lần refresh, mỗi lần deep link rơi vào gốc.
 *
 * Đích phụ thuộc VAI của phiên, không phải một hằng số:
 *  - có gian hàng, hoặc là nhân sự nền tảng → khu quản lý;
 *  - khách thuần, hoặc chưa đăng nhập → marketplace.
 *
 * Marketplace vẫn là khu CÔNG KHAI: khách chưa đăng nhập không bị chặn bằng màn đăng nhập, chỉ
 * là họ không phải người có chỗ nào khác để vào.
 *
 * Màn chờ ở đây là bắt buộc, không phải trang trí: `/auth/me` và Keychain đều bất đồng bộ, và
 * chọn đích trước khi chúng về là cú giật "vào marketplace rồi nhảy sang khu quản lý".
 */
export default function IndexRoute() {
  const scope = useLandingScope();

  if (!scope) {
    return (
      <Screen scroll={false}>
        <ScreenLoading />
      </Screen>
    );
  }

  // `scopeHome()` là cùng bản đồ "khu → màn đầu" mà `ScopeSwitcher` dùng — chép lại phép ánh xạ
  // ở đây là mở cửa cho hai lối vào cùng một khu hạ cánh ở hai chỗ khác nhau.
  return <Redirect href={scopeHome(scope)} />;
}
