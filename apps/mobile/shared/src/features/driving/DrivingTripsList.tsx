import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItemInfo } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DRIVER_TRIP_TAB, type DriverTripTab } from '@xeprime/types';
import { Chip } from '@/components/ui/Chip';
import { CountBadge } from '@/components/ui/CountBadge';
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
export function DrivingTripsList() {
  const colors = useColors();
  const t = useTranslations('Driving.trips');
  const [when, setWhen] = useState<DriverTripTab>(DRIVER_TRIP_TAB.UPCOMING);
  const query = useDriverTrips(when);
  const counts = useDriverPendingCounts();
  const pendingTrips = counts.data?.trips ?? 0;
  const navigateOnce = useNavigateOnce();

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
      <XStack
        px={layout.screenX}
        py={space.sm}
        gap={space.xs}
        accessibilityRole="tablist"
        accessibilityLabel={t('whenLabel')}
      >
        <Chip
          label={t('upcoming')}
          selected={upcoming}
          size="sm"
          onPress={() => setWhen(DRIVER_TRIP_TAB.UPCOMING)}
          {...(pendingTrips > 0
            ? { leading: <CountBadge count={pendingTrips} tone="danger" size="sm" /> }
            : {})}
          accessibilityLabel={
            pendingTrips > 0
              ? `${t('upcoming')} · ${t('pendingBadge', { count: pendingTrips })}`
              : t('upcoming')
          }
        />
        <Chip
          label={t('past')}
          selected={!upcoming}
          size="sm"
          onPress={() => setWhen(DRIVER_TRIP_TAB.PAST)}
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
