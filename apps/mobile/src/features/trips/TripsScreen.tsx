import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItemInfo } from 'react-native';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CUSTOMER_TRIP_FILTER,
  CUSTOMER_TRIP_FILTER_DEFAULT,
  CUSTOMER_TRIP_FILTER_VALUES,
  CUSTOMER_TRIP_STAGE_VALUES,
  type CustomerTripFilter,
  type CustomerTripStage,
} from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Chip } from '@/components/ui/Chip';
import { MenuOption, MenuOptionList } from '@/components/ui/MenuOption';
import { TripCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
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
 * Khi đang lọc theo chặng: số thẻ KHỚP tối thiểu phải gom được trước khi dừng tự tải thêm.
 *
 * Web lọc trong đúng một trang vì nó có bộ số trang để đi tiếp; ở đây danh sách chỉ dài ra khi
 * cuộn tới đáy, mà một trang 20 chuyến lọc còn 0 thẻ thì KHÔNG CÓ đáy để chạm — người dùng nhìn
 * thấy 'không có chuyến nào' trong khi trang sau đầy chuyến khớp. Nên bộ lọc tự kéo tiếp cho tới
 * khi đủ chừng này thẻ hoặc hết dữ liệu.
 */
const STAGE_FILTER_MIN_ROWS = 6;

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

  const [filter, setFilter] = useState<CustomerTripFilter>(CUSTOMER_TRIP_FILTER_DEFAULT);
  /*
   * Lọc theo CHẶNG chỉ ở client, đúng như web: hai tab đã chia sẵn 'còn chạy / đã khép' và server
   * chưa nhận tham số chặng. Nó thu hẹp thứ đang đọc chứ không mở một chiều truy vấn mới.
   */
  const [stage, setStage] = useState<CustomerTripStage | null>(null);
  const query = useTripsInfinite(filter);

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  // Số đếm giống nhau ở mọi trang (server tính trên toàn bộ), nên đọc trang đầu là đủ.
  const counts = query.data?.pages[0]?.counts;

  const visibleItems = useMemo(
    () => (stage === null ? items : items.filter((trip) => trip.stage === stage)),
    [items, stage],
  );

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

  /*
   * Tự kéo tiếp khi bộ lọc chặng gạt gần hết trang đang có — xem `STAGE_FILTER_MIN_ROWS`. Vòng
   * này DỪNG chắc chắn: mỗi nhịp chỉ chạy khi còn trang sau, và `hasNextPage` tắt ở trang cuối.
   */
  useEffect(() => {
    if (stage === null) return;
    if (!hasNextPage || isFetchingNextPage) return;
    if (visibleItems.length >= STAGE_FILTER_MIN_ROWS) return;
    void fetchNextPage();
  }, [stage, hasNextPage, isFetchingNextPage, fetchNextPage, visibleItems.length]);

  /* Đổi tab là đổi tập chuyến: một chặng chỉ có ở tab kia sẽ cho danh sách trống không ai giải
     thích được, nên bộ lọc chặng rơi lại cùng lúc. */
  const changeFilter = useCallback((next: CustomerTripFilter) => {
    setFilter(next);
    setStage(null);
  }, []);

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
        <FilterTabs
          value={filter}
          counts={counts}
          onChange={changeFilter}
          domainLabel={domainLabel}
          stage={stage}
          onStageChange={setStage}
        />

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
        ) : visibleItems.length === 0 && stage !== null && (hasNextPage || isFetchingNextPage) ? (
          /*
            Còn trang chưa kéo về: đây KHÔNG phải "không có chuyến nào ở trạng thái này" mà là
            chưa biết — hiệu ứng ở trên đang tự kéo tiếp. Kết luận sớm rồi đổi ý khi trang sau về
            là màn hình tự cãi chính mình.
          */
          <YStack p={layout.screenX} gap={layout.inline}>
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <TripCardSkeleton key={i} />
            ))}
          </YStack>
        ) : visibleItems.length === 0 && stage !== null ? (
          /*
            KHÔNG có nút xoá lọc ở đây: viên lọc ngay trên đầu màn vẫn hiện nguyên, đang nói rõ
            mình đang lọc gì và mở lại được bằng một cú chạm — thêm một nút thứ hai cho cùng
            việc đó chỉ làm màn rỗng nặng lên.
          */
          <ScreenMessage icon="filter-outline" title={t('list.stageEmptyTitle')} />
        ) : items.length === 0 ? (
          <ScreenMessage
            icon="calendar-outline"
            title={
              filter === CUSTOMER_TRIP_FILTER.HISTORY
                ? t('list.emptyHistoryTitle')
                : t('list.emptyCurrentTitle')
            }
            description={
              filter === CUSTOMER_TRIP_FILTER.HISTORY
                ? t('list.emptyHistoryBody')
                : t('list.emptyCurrentBody')
            }
          />
        ) : (
          <FlatList
            data={visibleItems}
            keyExtractor={tripKey}
            renderItem={renderTrip}
            contentContainerStyle={styles.listContent}
            onEndReached={loadMore}
            refreshControl={refreshControl}
            /*
              Truyền KIỂU component, không phải một phần tử: `<TripCardSkeleton />` là object mới
              ở mỗi lần render, nên `VirtualizedList` coi chân danh sách là đã đổi và dựng lại nó
              suốt. Tham chiếu hàm thì bền.
            */
            ListFooterComponent={query.isFetchingNextPage ? TripCardSkeleton : null}
            {...LIST_TUNING}
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
  stage,
  onStageChange,
}: {
  value: CustomerTripFilter;
  counts: CustomerTripCounts | undefined;
  onChange: (next: CustomerTripFilter) => void;
  domainLabel: (group: 'customerTripFilter' | 'customerTripStage', code: string) => string;
  stage: CustomerTripStage | null;
  onStageChange: (next: CustomerTripStage | null) => void;
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
    /*
      Hai tầng, không phải một hàng: dải tab ở trên, bộ lọc chặng ở HÀNG RIÊNG bên dưới.

      Web xếp ô trạng thái cạnh tab (`tabBarExtraContent`) vì nó có cả bề ngang màn hình; ở 360dp
      thì nút lọc ăn mất chỗ của dải tab, và khi tên tab dài ra vì số đếm thì dải tab phải cuộn
      ngang ngay từ lúc mở màn. Tách tầng trả lại toàn bộ bề ngang cho tab, và bộ lọc chặng — thứ
      chỉ tác động lên danh sách bên dưới — đứng sát ngay trên danh sách đó.
    */
    <YStack>
      <FlatList
        horizontal
        data={CUSTOMER_TRIP_FILTER_VALUES}
        keyExtractor={filterKey}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContent}
        style={styles.tabsList}
        renderItem={renderChip}
      />

      <XStack px={layout.screenX} pb={space.sm}>
        <StageFilter value={stage} onChange={onStageChange} domainLabel={domainLabel} />
      </XStack>
    </YStack>
  );
});

/**
 * Bộ lọc theo CHẶNG — một viên mở tấm trượt, không phải một dải chip thứ hai.
 *
 * Tám chặng xếp ngang là một dải cuộn dài hơn cả dải tab ngay trên nó, và hai dải cuộn ngang
 * chồng nhau thì không còn đọc ra cái nào là tab. Tấm trượt cũng là khuôn chung của mọi lựa chọn
 * từ hai giá trị trở lên trong app (`SelectControl`, `ManageFilterSheet`).
 *
 * Viên tự nói mình đang lọc gì: chưa lọc thì hiện "Tất cả trạng thái", đang lọc thì hiện đúng
 * nhãn chặng và bật trạng thái chọn — người dùng không phải mở tấm ra mới biết.
 */
const StageFilter = memo(function StageFilter({
  value,
  onChange,
  domainLabel,
}: {
  value: CustomerTripStage | null;
  onChange: (next: CustomerTripStage | null) => void;
  domainLabel: (group: 'customerTripStage', code: string) => string;
}) {
  const t = useTranslations('Trips.list');
  const [open, setOpen] = useState(false);

  const select = useCallback(
    (next: CustomerTripStage | null) => {
      onChange(next);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <>
      <Chip
        label={value === null ? t('stageAll') : domainLabel('customerTripStage', value)}
        accessibilityLabel={t('stageFilterLabel')}
        icon="options-outline"
        selected={value !== null}
        size="sm"
        role="button"
        variant="filled"
        onPress={() => setOpen(true)}
      />

      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('stageFilterLabel')}>
        <MenuOptionList>
          {/* "Tất cả" là một dòng trong CÙNG danh sách, không phải nút xoá riêng: xoá lọc và đổi
              lọc là một cử chỉ, và dòng này cho thấy mình đang được chọn khi chưa lọc gì. */}
          <MenuOption label={t('stageAll')} selected={value === null} onPress={() => select(null)} />
          {CUSTOMER_TRIP_STAGE_VALUES.map((item) => (
            <MenuOption
              key={item}
              label={domainLabel('customerTripStage', item)}
              selected={value === item}
              onPress={() => select(item)}
            />
          ))}
        </MenuOptionList>
      </BottomSheet>
    </>
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
  // `paddingBottom` nhỏ hơn `paddingTop`: hàng bộ lọc chặng ngay bên dưới đã tự mang khoảng thở
  // của nó, cộng cả hai lần thành một khoảng trống rộng bằng một thẻ chuyến.
  tabsList: {
    flexGrow: 0,
    paddingBottom: space.xs,
    paddingTop: space.sm,
  },
});
