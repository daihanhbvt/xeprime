import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItemInfo } from 'react-native';
import { useRouter } from 'expo-router';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CUSTOMER_TRIP_FILTER,
  CUSTOMER_TRIP_FILTER_VALUES,
  type CustomerTripFilter,
} from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { Chip } from '@/components/ui/Chip';
import { TripCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, space } from '@/theme/tokens';
import { TripCard } from './components/TripCard';
import { useTripsInfinite } from './hooks/use-trips';
import type { CustomerTrip, CustomerTripCounts } from './api';

/** Số khung chờ dựng sẵn — bằng số thẻ vừa một màn, để nội dung về không đẩy trang. */
const SKELETON_ROWS = 4;

/*
 * Hàm ở TẦM MODULE, không phải đóng gói lại mỗi lần render: đổi danh tính của `keyExtractor`
 * buộc `VirtualizedList` dựng lại toàn bộ ô đang gắn.
 */
const tripKey = (trip: CustomerTrip) => trip.id;
const filterKey = (filter: CustomerTripFilter) => filter;

/**
 * Tab "Chuyến" (BKG-15).
 *
 * Phân trang là **tải thêm khi cuộn** chứ không phải bộ số trang như web: trên điện thoại một
 * hàng nút trang chiếm chỗ của nguyên một thẻ, và ngón cái đang cuộn sẵn rồi. Việc CẮT TRANG
 * vẫn ở server — không có chỗ nào kéo cả kho về rồi lọc tại chỗ.
 *
 * Tab lọc giữ ở state màn hình, không ở Redux: mobile không có URL để chia sẻ, và bộ lọc này
 * chết theo màn (ADR 0004, mục "Screen filters").
 */
export function TripsScreen() {
  const t = useTranslations('Trips');
  const domainLabel = useDomainLabel();
  const router = useRouter();

  const [filter, setFilter] = useState<CustomerTripFilter>(CUSTOMER_TRIP_FILTER.ALL);
  const query = useTripsInfinite(filter);

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  // Số đếm giống nhau ở mọi trang (server tính trên toàn bộ), nên đọc trang đầu là đủ.
  const counts = query.data?.pages[0]?.counts;

  /*
   * `useNavigateOnce`, KHÔNG phải `router.push` trần: chạm nhanh ba lần vào cùng một thẻ thì ba
   * màn chi tiết chồng lên nhau và người dùng phải bấm lui ba lần mới thoát. Lỗi chỉ lộ ra khi
   * máy hoặc mạng chậm — đúng lúc màn đích chưa kịp vẽ nên người dùng tưởng chưa ăn và chạm thêm.
   * Trang chủ đã dùng hook này từ đầu; danh sách chuyến thì bị bỏ sót.
   */
  const navigateOnce = useNavigateOnce();
  const openTrip = useCallback(
    (trip: CustomerTrip) => navigateOnce(ROUTES.booking.detail(trip.id)),
    [navigateOnce],
  );

  /*
   * Phụ thuộc vào ĐÚNG ba thứ nó đọc, không phải cả object `query`: object đó là bản mới ở mọi
   * lần render của TanStack Query, nên `[query]` biến `useCallback` thành một phép gói vô nghĩa
   * và `onEndReached` đổi danh tính liên tục.
   */
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  /*
   * Phần tử `RefreshControl` cũng phải BỀN: dựng lại nó mỗi lần render là gắn lại một view native
   * ở đầu danh sách, và cử chỉ kéo-để-làm-mới đang dở bị huỷ giữa chừng.
   */
  const { isRefetching, refetch } = query;
  const refreshControl = useMemo(
    () => (
      <RefreshControl
        // `isRefetching` chứ không phải `isFetching`: `isFetching` cũng bật khi đang tải TRANG SAU,
        // và vòng xoay ở đầu danh sách lúc đó đọc như trang đang tự nạp lại.
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        tintColor={colors.primaryActive}
      />
    ),
    [isRefetching, refetch],
  );

  const renderTrip = useCallback(
    ({ item }: ListRenderItemInfo<CustomerTrip>) => <TripCard trip={item} onPress={openTrip} />,
    [openTrip],
  );

  return (
    <>
      {/*
        KHÔNG có cạnh 'bottom'.

        Đây là màn GỐC của một tab, và thanh tab bên dưới đã cộng `insets.bottom` vào chiều cao
        của chính nó (xem `(tabs)/_layout.tsx`). Khai thêm cạnh đáy ở đây là đệm inset LẦN HAI:
        một dải trống đứng im ngay trên thanh tab, và danh sách không bao giờ chạm tới đáy.
      */}
      <Screen edges={['left', 'right']} scroll={false} padded={false}>
        <FilterTabs value={filter} counts={counts} onChange={setFilter} domainLabel={domainLabel} />

        {query.isPending ? (
          <YStack p={layout.screenX} gap={layout.inline}>
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <TripCardSkeleton key={i} />
            ))}
          </YStack>
        ) : query.isError ? (
          <ScreenError
            error={query.error}
            title={t('list.errorTitle')}
            onRetry={() => void query.refetch()}
          />
        ) : items.length === 0 ? (
          <ScreenMessage
            icon="calendar-outline"
            title={t('list.emptyTitle')}
            description={
              filter === CUSTOMER_TRIP_FILTER.ALL
                ? t('list.emptyAllBody')
                : t('list.emptyFilteredBody')
            }
            {...(filter === CUSTOMER_TRIP_FILTER.ALL
              ? {
                  actionLabel: t('list.findVehicle'),
                  onAction: () => router.replace(ROUTES.explore.home()),
                }
              : {})}
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={tripKey}
            renderItem={renderTrip}
            contentContainerStyle={styles.listContent}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            refreshControl={refreshControl}
            /*
              Truyền KIỂU component, không phải một phần tử: `<TripCardSkeleton />` là object mới
              ở mỗi lần render, nên `VirtualizedList` coi chân danh sách là đã đổi và dựng lại nó
              suốt. Tham chiếu hàm thì bền.
            */
            ListFooterComponent={query.isFetchingNextPage ? TripCardSkeleton : null}
            /*
              Cửa sổ dựng của danh sách dài.

              Mặc định của `FlatList` là `initialNumToRender: 10` và `windowSize: 21` — tức nó giữ
              sống khoảng 10 màn hình thẻ quanh vùng đang xem. Thẻ chuyến có ảnh, huy hiệu trạng
              thái và bốn dòng chữ, nên con số đó là rất nhiều view cho thứ không ai nhìn.

              `initialNumToRender: 6` ≈ hai màn đầu (một trang là 10 mục), `windowSize: 7` giữ ba
              màn quanh vùng xem. `removeClippedSubviews` tháo view đã ra khỏi màn khỏi cây native.
            */
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={7}
            removeClippedSubviews
          />
        )}
      </Screen>
    </>
  );
}

/** Số trên tab đọc từ `counts` của server — trang đang mở chỉ có tối đa `limit` bản ghi. */
function countOf(counts: CustomerTripCounts | undefined, filter: CustomerTripFilter): number {
  return counts?.[filter] ?? 0;
}

/**
 * Dải tab lọc.
 *
 * `memo` ở đây KHÔNG phải trang trí: mọi nhịp trạng thái của `useTripsInfinite` (`isFetching`,
 * `isRefetching`, tải trang sau, refetch nền) đều render lại màn, và không có nó thì cả dải chip
 * dựng lại theo dù không có gì trong dải đổi. Ba prop đều BỀN nên phép so sánh nông ăn được:
 * `setFilter` là setState, `domainLabel` đã `useMemo` sẵn trong hook, `counts` chỉ đổi khi server
 * trả số mới.
 *
 * `renderItem` cũng phải `useCallback` — một hàm mới mỗi lần render buộc `VirtualizedList` dựng
 * lại toàn bộ ô đang gắn, tức đúng cái "bấm một tab thì render cả dải".
 */
const FilterTabs = memo(function FilterTabs({
  value,
  counts,
  onChange,
  domainLabel,
}: {
  value: CustomerTripFilter;
  counts: CustomerTripCounts | undefined;
  onChange: (next: CustomerTripFilter) => void;
  domainLabel: (group: 'customerTripFilter', code: string) => string;
}) {
  const t = useTranslations('Trips.list');

  const renderChip = useCallback(
    ({ item }: ListRenderItemInfo<CustomerTripFilter>) => (
      <Chip
        label={t('tabLabel', {
          label: domainLabel('customerTripFilter', item),
          count: countOf(counts, item),
        })}
        selected={value === item}
        size="sm"
        onPress={() => onChange(item)}
      />
    ),
    [counts, domainLabel, onChange, t, value],
  );

  return (
    <FlatList
      horizontal
      data={CUSTOMER_TRIP_FILTER_VALUES}
      keyExtractor={filterKey}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabsContent}
      style={styles.tabsList}
      renderItem={renderChip}
    />
  );
});

/*
 * Style ở TẦM MODULE: một object literal viết thẳng trong JSX là tham chiếu mới ở mỗi lần render,
 * và `VirtualizedList` coi đó là `contentContainerStyle` đã đổi nên tính lại bố cục của mọi ô.
 */
const styles = StyleSheet.create({
  listContent: {
    gap: layout.inline,
    padding: layout.screenX,
  },
  tabsContent: {
    gap: space.xs,
    paddingHorizontal: layout.screenX,
  },
  // `flexGrow: 0` bắt buộc: một `FlatList` ngang trong cột dọc sẽ nuốt hết chiều cao còn lại và
  // đẩy danh sách chuyến ra khỏi màn.
  tabsList: {
    flexGrow: 0,
    paddingVertical: space.sm,
  },
});
