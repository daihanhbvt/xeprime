import { Redirect } from 'expo-router';
import { Screen } from '@/components/layout/Screen';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { useLandingScope } from '@/features/shell/use-landing-scope';

/**
 * CỬA VÀO XePrime Partner — app này không có khu công khai để rơi về.
 *
 *  - Chưa đăng nhập → màn đăng nhập.
 *  - Gian hàng trả phí chưa chuyển khoản → thẳng bước 2 của onboarding (ADR 0040).
 *  - Có gian hàng (tuyến gói hoặc hoa hồng) → `/manage` — Tổng quan hoặc trang chủ Owner Lite.
 *  - Tài khoản đối tác CHƯA có gian hàng → `ScopeGuard` trong `/manage` đưa tới màn chọn cách cho
 *    thuê (ADR 0053).
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
