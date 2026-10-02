import { Redirect } from 'expo-router';
import { Screen } from '@/components/layout/Screen';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { useLandingScope } from '@/features/shell/use-landing-scope';

/**
 * CỬA VÀO XePrime Partner — app này không có khu công khai để rơi về.
 *
 *  - Chưa đăng nhập → màn đăng nhập.
 *  - Gian hàng trả phí chưa chuyển khoản → thẳng bước 2 của onboarding (ADR 0040).
 *  - Có gian hàng tuyến gói → dashboard `/manage`.
 *  - Tài khoản ngoài phạm vi app (đã lọt qua cổng đăng nhập từ trước) → `ScopeGuard` trong
 *    `/manage` xử lý bằng màn giải thích, không đá sang một "khu khách" không tồn tại ở đây.
 *
 * Bản landing này đọc `use-landing-scope` CỦA APP PARTNER (overlay `manage/src`), không phải
 * bản của app Customer.
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
