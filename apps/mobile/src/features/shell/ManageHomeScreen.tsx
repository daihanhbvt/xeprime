import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ShopDashboardScreen } from '@/features/dashboard/ShopDashboardScreen';
import { ManageHeader } from './ManageHeader';

/**
 * Màn đầu của khu quản lý — cùng vai với `ManageHome` bên web: rẽ theo SCOPE.
 *
 * Có `platformRole` ⇒ tổng quan NỀN TẢNG; còn lại ⇒ tổng quan gian hàng (SHP-07). Cùng predicate
 * mà `manageNavForScope` dùng để chọn cây menu, nên màn và menu không thể nói hai khu khác nhau.
 *
 * Gian hàng chưa `active` vẫn VÀO ĐƯỢC: chặn ở cửa là giấu mất chính cái màn giải thích vì sao
 * họ bị chặn (doc 15 §4.4). Cái đổi theo trạng thái là NỘI DUNG dải trên cùng, không phải quyền vào.
 */
export function ManageHomeScreen() {
  const { data: user } = useCurrentUser();
  return user?.platformRole ? <PlatformHomeScreen /> : <ShopDashboardScreen />;
}

/**
 * Tổng quan của NHÂN SỰ NỀN TẢNG — chưa dựng ở app (toàn bộ module Admin là P3).
 *
 * Nói thẳng "đang phát triển" thay vì mượn tổng quan gian hàng: nhân sự nền tảng không thuộc gian
 * hàng nào, nên mọi con số ở đó sẽ là 403 hoặc rỗng — một màn trống không giải thích được còn tệ
 * hơn một câu nói đúng sự thật.
 */
function PlatformHomeScreen() {
  const tStates = useTranslations('Common.states');

  return (
    <>
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']} scroll={false}>
        <ScreenMessage icon="construct-outline" title={tStates('featureComingSoon')} />
      </Screen>
    </>
  );
}
