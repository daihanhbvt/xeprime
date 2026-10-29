import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItemInfo } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DRIVER_TRIP_TAB, type DriverTripTab } from '@xeprime/types';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { TripCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import type { DriverTrip } from './api';
import { DrivingTripCard } from './components/DrivingTripCard';
import { useDriverPendingCounts, useDriverTrips } from './hooks';

const SKELETON_ROWS = 4;
const TABS = [DRIVER_TRIP_TAB.UPCOMING, DRIVER_TRIP_TAB.PAST] as const;
const tripKey = (trip: DriverTrip) => trip.id;

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: layout.screenX,
    paddingBottom: layout.section,
    gap: layout.inline,
  },
});

/**
 * "Chuyến tôi lái" — một tab của tab Chuyến (ADR 0063), bản native của `DrivingTripsList` (web).
 *
 * Tab con (sắp tới / đã qua) giữ ở state màn hình — native không có URL (ADR 0004). Phân trang là
 * CUỘN VÔ HẠN thay cho bộ số trang; cắt trang vẫn ở server. Chuyến đang chờ tôi nhận nổi bật bằng
 * vạch cảnh báo và dẫn vào màn chi tiết để nhận / từ chối.
 */
export function DrivingTripsList({
  initialTab = DRIVER_TRIP_TAB.UPCOMING,
}: {
  /** Tab con mở đầu — từ `?tab=` của trung tâm tài xế (web `DriverCenterPage`). */
  initialTab?: DriverTripTab;
} = {}) {
  const colors = useColors();
  const t = useTranslations('Driving.trips');
  const [when, setWhen] = useState<DriverTripTab>(initialTab);
  const tCenter = useTranslations('Driving.center');
  const query = useDriverTrips(when);
  // Số của tab kia — chỉ đọc `meta.total` của trang đầu.
  const other = useDriverTrips(
    when === DRIVER_TRIP_TAB.UPCOMING ? DRIVER_TRIP_TAB.PAST : DRIVER_TRIP_TAB.UPCOMING,
  );
  const counts = useDriverPendingCounts();
  const navigateOnce = useNavigateOnce();
  const totalOf = (tab: DriverTripTab) =>
    (tab === when ? query.data : other.data)?.pages[0]?.meta.total;

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const upcoming = when === DRIVER_TRIP_TAB.UPCOMING;

  const openTrip = useCallback(
    (trip: DriverTrip) => navigateOnce(ROUTES.driving.tripDetail(trip.id)),
    [navigateOnce],
  );
  const renderTrip = useCallback(
    ({ item }: ListRenderItemInfo<DriverTrip>) => (
      <DrivingTripCard trip={item} onPress={openTrip} />
    ),
    [openTrip],
  );

  const { hasNextPage, isFetchingNextPage, fetchNextPage, isRefetching, refetch } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);
  const onRefresh = useCallback(() => {
    void refetch();
    void counts.refetch();
  }, [counts, refetch]);

  return (
    <YStack f={1}>
      {/*
        Hai tab con của khu "Chuyến xe của tôi" — `SegmentTabs size="tab"` của web `DriverCenterPage`:
        nhãn + số mục (`meta.total` của server; tab kia đọc trang 1 là đủ).
      */}
      <XStack px={layout.screenX} py={space.sm}>
        <SegmentedTabs
          items={TABS.map((tab) => {
          const label =
            tab === DRIVER_TRIP_TAB.UPCOMING
              ? tCenter('tabTripsCurrent')
              : tCenter('tabTripsEnded');
          const count = totalOf(tab);
            return {
              key: tab,
              label,
              ...(count !== undefined
                ? { count, accessibilityLabel: tCenter('tabLabel', { label, count }) }
                : {}),
            };
          })}
          value={when}
          onChange={setWhen}
        />
      </XStack>

      {query.isPending ? (
        <YStack px={layout.screenX} gap={layout.inline}>
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <TripCardSkeleton key={i} />
          ))}
        </YStack>
      ) : query.isError ? (
        <ScreenError error={query.error} title={t('loadError')} onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <ScreenMessage
          icon="car-outline"
          title={upcoming ? t('emptyUpcomingTitle') : t('emptyPastTitle')}
          {...(upcoming ? { description: t('emptyUpcomingBody') } : {})}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={tripKey}
          renderItem={renderTrip}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMore}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.primaryActive}
            />
          }
          ListFooterComponent={isFetchingNextPage ? TripCardSkeleton : null}
          {...LIST_TUNING}
        />
      )}
    </YStack>
  );
}
