import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useDriverPendingCounts } from './hooks';
import {
  DRIVER_CENTER_VIEW,
  DRIVER_CENTER_VIEW_PARAM,
  DRIVER_LINK_SCOPE,
  DRIVER_TRIP_TAB,
  type DriverCenterView,
} from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { space } from '@/theme/tokens';
import { DriverPartnersSection } from './DriverPartnersSection';
import { DrivingTripsList } from './DrivingTripsList';

const VIEWS = [DRIVER_CENTER_VIEW.TRIPS, DRIVER_CENTER_VIEW.PARTNERS] as const;

/**
 * "Trung tâm Tài xế" (`/account/driving`, ADR 0063) — bản native của `DriverCenterPage` web (Figma
 * `21768:51021`): tiêu đề + câu phụ, bộ chuyển hai khu "Chuyến xe của tôi | Chủ xe đối tác", mỗi khu
 * hai tab con kèm số mục.
 *
 * Khu đang mở đọc từ tham số `?view=` (`DRIVER_CENTER_VIEW_PARAM`) — cùng chuỗi với web và đích
 * thông báo, nên thông báo lời mời mở thẳng khu đối tác. Đổi khu bằng `setParams` (không push): đây
 * là cùng một màn, nút lui không được dừng ở khu kia. Tab con sống trong từng khu; đổi khu thì tab
 * về mặc định, như web.
 */
export function DriverCenterScreen() {
  const t = useTranslations('Driving.center');
  const router = useRouter();
  const params = useLocalSearchParams<{ [DRIVER_CENTER_VIEW_PARAM]?: string; tab?: string }>();
  /*
   * `?tab=` như web: tab con của khu đang mở (sắp tới/đã qua · đang hợp tác/đã kết thúc) — đích
   * thông báo trỏ thẳng vào đúng tab. `?page=` của web là phân trang số; app cuộn vô hạn nên bỏ qua.
   */
  const rawTab = params.tab ?? null;
  const view: DriverCenterView =
    params[DRIVER_CENTER_VIEW_PARAM] === DRIVER_CENTER_VIEW.PARTNERS
      ? DRIVER_CENTER_VIEW.PARTNERS
      : DRIVER_CENTER_VIEW.TRIPS;

  const pendingCounts = useDriverPendingCounts();
  const change = useCallback(
    (next: DriverCenterView) =>
      router.setParams({
        [DRIVER_CENTER_VIEW_PARAM]: next === DRIVER_CENTER_VIEW.TRIPS ? undefined : next,
        // Đổi khu ⇒ tab con về mặc định (web bỏ `tab` khi đổi `view`).
        tab: undefined,
      }),
    [router],
  );

  return (
    <>
      <AppHeader
        title={t('title')}
        subtitle={t('subtitle')}
        onBack={() => goBackOr(router, ROUTES.account.home())}
      />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        {/* Khuôn dải tab chung của app (`SegmentedTabs`, người dùng chốt 28/10/2026). */}
        <XStack px={layout.screenX} pt={space.sm}>
          <SegmentedTabs
            items={VIEWS.map((item) => {
              // Số việc CHỜ MÌNH xác nhận (chuyến được gán / lời mời hợp tác) — vào màn là thấy ngay
              // tab nào cần làm (người dùng chốt 28/10/2026). 0 thì không vẽ viên.
              const waiting =
                item === DRIVER_CENTER_VIEW.TRIPS
                  ? (pendingCounts.data?.trips ?? 0)
                  : (pendingCounts.data?.invites ?? 0);
              return {
                key: item,
                label: item === DRIVER_CENTER_VIEW.TRIPS ? t('viewTrips') : t('viewPartners'),
                ...(waiting > 0 ? { count: waiting } : {}),
              };
            })}
            value={view}
            onChange={change}
          />
        </XStack>

        {/* `key` theo khu: đổi khu thì tab con của khu kia không mang sang (về mặc định như web). */}
        {view === DRIVER_CENTER_VIEW.TRIPS ? (
          <DrivingTripsList
            key={view}
            initialTab={
              rawTab === DRIVER_TRIP_TAB.PAST ? DRIVER_TRIP_TAB.PAST : DRIVER_TRIP_TAB.UPCOMING
            }
          />
        ) : (
          <DriverPartnersSection
            key={view}
            onViewTrips={() => change(DRIVER_CENTER_VIEW.TRIPS)}
            initialScope={
              rawTab === DRIVER_LINK_SCOPE.CLOSED
                ? DRIVER_LINK_SCOPE.CLOSED
                : DRIVER_LINK_SCOPE.OPEN
            }
          />
        )}
      </Screen>
    </>
  );
}
