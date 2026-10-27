import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItemInfo } from 'react-native';
import type { Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CUSTOMER_TRIP_FILTER,
  CUSTOMER_TRIP_FILTER_DEFAULT,
  CUSTOMER_TRIP_FILTER_VALUES,
  CUSTOMER_TRIP_FILTER_STAGES,
  TRIP_ROLE,
  type CustomerTripFilter,
  type CustomerTripStage,
} from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
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
import { UnpaidHoldsReminder } from './components/UnpaidHoldsReminder';
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
export const STAGE_FILTER_MIN_ROWS = 6;

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
/**
 * Chuyến đi thuê của TÀI KHOẢN KHÁCH — bản native của `TripsView` bên web.
 *
 * Từ ADR 0053 chuyến cho thuê (vai chủ xe) thuộc tài khoản đối tác ở app XePrime Partner, nên màn
 * này không còn chiều vai, không còn lối chuyển tiếp trong khu quản lý và không còn nút duyệt/từ
 * chối trên thẻ. Chiều vai vẫn là tham số `role` của server, khoá ở `renter`.
 */
export function TripsScreen({
  detailHref = ROUTES.booking.detail,
  heading = false,
  header,
}: {
  /** Đích của một thẻ chuyến. */
  detailHref?: (id: string) => Href;
  /**
   * Vẽ tiêu đề trang (`list.heading` + `list.sub`) như `TripsView` bên web. Ở tab "Chuyến" của khu
   * khách thanh trên + nhãn tab đã nói điều đó; lối chuyển tiếp trong khu quản lý thì không có gì
   * khác nói người dùng đang ở đâu.
   */
  heading?: boolean;
  /** Khối đứng trên cùng màn — bộ chuyển "thuê / lái" của app khách (ADR 0063). */
  header?: ReactNode;
} = {}) {
  const t = useTranslations('Trips');
  const domainLabel = useDomainLabel();

  const [filter, setFilter] = useState<CustomerTripFilter>(CUSTOMER_TRIP_FILTER_DEFAULT);
  /*
   * KHÔNG có bộ lọc chặng ở màn của KHÁCH — đúng web (design "Chuyến của tôi" chỉ có hai tab; nhãn
   * chặng trên từng thẻ đã nói đủ). Bộ lọc chặng chỉ còn ở màn chuyến của chủ xe (`OwnerTripsScreen`).
   */
  // App này chỉ phục vụ tài khoản KHÁCH (ADR 0053): chuyến luôn là chuyến mình ĐI THUÊ — web
  // `TripsView` khoá `TRIP_ROLE.RENTER` cùng lý do.
  const query = useTripsInfinite(filter, TRIP_ROLE.RENTER);

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
    (trip: CustomerTrip) => navigateOnce(detailHref(trip.id)),
    [detailHref, navigateOnce],
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
  const queryClient = useQueryClient();
  /*
   * Kéo để làm mới cũng nạp lại dải "chuyến chờ thanh toán" phía trên danh sách — nó là một truy
   * vấn RIÊNG, và khách kéo màn chính là để xem tiền đã về chưa.
   */
  const onRefresh = useCallback(() => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: queryKeys.trips.unpaidHolds() });
  }, [queryClient, refetch]);
  const refreshControl = useMemo(
    () => (
      <RefreshControl
        // `isRefetching` chứ không phải `isFetching`: `isFetching` cũng bật khi đang tải TRANG SAU,
        // và vòng xoay ở đầu danh sách lúc đó đọc như trang đang tự nạp lại.
        refreshing={isRefetching}
        onRefresh={onRefresh}
        tintColor={colors.primaryActive}
      />
    ),
    [isRefetching, onRefresh],
  );

  const changeFilter = useCallback((next: CustomerTripFilter) => setFilter(next), []);

  const renderTrip = useCallback(
    ({ item }: ListRenderItemInfo<CustomerTrip>) => <TripCard trip={item} onPress={openTrip} />,
    [openTrip],
  );

  /*
   * Có danh sách thì nhắc chuyến chưa trả cuộn CÙNG danh sách (ListHeaderComponent): ghim nó trên
   * một màn không cuộn là ăn mất nửa chiều cao điện thoại nhỏ khi có vài chuyến chờ tiền. Các
   * trạng thái khác (đang tải / lỗi / rỗng) còn chỗ thừa, nên nó đứng trên như web `TripsView`.
   */
  const rendersList = !query.isPending && !query.isError && items.length > 0;

  return (
    <>
      {/*
        KHÔNG có cạnh 'bottom'.

        Đây là màn GỐC của một tab, và thanh tab bên dưới đã cộng `insets.bottom` vào chiều cao
        của chính nó (xem `(tabs)/_layout.tsx`). Khai thêm cạnh đáy ở đây là đệm inset LẦN HAI:
        một dải trống đứng im ngay trên thanh tab, và danh sách không bao giờ chạm tới đáy.
      */}
      <Screen edges={['left', 'right']} scroll={false} padded={false}>
        {header}
        {heading ? <ManagePageTitle title={t('list.heading')} subtitle={t('list.sub')} /> : null}
        {/* Chuyến đang giữ chưa trả — việc phải làm NGAY, nên đứng trên mọi tab (web `TripsView`). */}
        {rendersList ? null : (
          <YStack px={layout.screenX}>
            <UnpaidHoldsReminder />
          </YStack>
        )}
        <TripFilterTabs
          value={filter}
          counts={counts}
          onChange={changeFilter}
          domainLabel={domainLabel}
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
            data={items}
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
            ListHeaderComponent={UnpaidHoldsReminder}
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
export const TripFilterTabs = memo(function FilterTabs({
  value,
  counts,
  onChange,
  domainLabel,
  stage = null,
  onStageChange,
}: {
  value: CustomerTripFilter;
  counts: CustomerTripCounts | undefined;
  onChange: (next: CustomerTripFilter) => void;
  domainLabel: (group: 'customerTripFilter' | 'customerTripStage', code: string) => string;
  /** Bộ lọc chặng — CHỈ màn chủ xe truyền; màn của khách không có (design "Chuyến của tôi"). */
  stage?: CustomerTripStage | null;
  onStageChange?: (next: CustomerTripStage | null) => void;
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
      MỘT hàng: dải tab chiếm phần co giãn, nút lọc chặng là một ICON gọn ghim ở mép phải.
      Icon 32dp ăn rất ít bề ngang; tên tab dài ra thì chính dải tab cuộn ngang, nút lọc đứng yên.
    */
    <YStack>
      <XStack ai="center" paddingRight={layout.screenX} py={space.sm} gap={space.xs}>
        <FlatList
          horizontal
          data={CUSTOMER_TRIP_FILTER_VALUES}
          keyExtractor={filterKey}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
          style={styles.tabsList}
          renderItem={renderChip}
        />
        {onStageChange ? (
          <StageFilter
            filter={value}
            value={stage}
            onChange={onStageChange}
            domainLabel={domainLabel}
          />
        ) : null}
      </XStack>
      {/* Icon thôi không nói đang lọc CÁI GÌ: danh sách rỗng mà không thấy bộ lọc thì người dùng
        tưởng mình không có chuyến. Viên này hiện tên chặng và chạm vào là xoá lọc. */}
      {stage !== null && onStageChange ? (
        <XStack paddingHorizontal={layout.screenX} pb={space.sm}>
          <Chip
            label={domainLabel('customerTripStage', stage)}
            accessibilityLabel={t('stageClear')}
            icon="close-circle"
            selected
            size="sm"
            role="button"
            onPress={() => onStageChange(null)}
          />
        </XStack>
      ) : null}
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
 * Hiện là một nút icon ở cuối hàng tab; đang lọc thì nút đổi sang tông nhấn.
 */
const StageFilter = memo(function StageFilter({
  filter,
  value,
  onChange,
  domainLabel,
}: {
  /** Tab đang mở — chỉ bày các chặng thuộc tab đó, đúng web (`CUSTOMER_TRIP_FILTER_STAGES`). */
  filter: CustomerTripFilter;
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
      {/* Đang lọc thì nút đổi sang tông nhấn — người dùng biết danh sách đã bị thu hẹp. */}
      <IconButton
        icon="options-outline"
        label={
          value === null
            ? t('stageFilterLabel')
            : `${t('stageFilterLabel')}: ${domainLabel('customerTripStage', value)}`
        }
        tone={value === null ? 'surface' : 'accent'}
        size={18}
        compact
        onPress={() => setOpen(true)}
      />

      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('stageFilterLabel')}>
        <MenuOptionList>
          {/* "Tất cả" là một dòng trong CÙNG danh sách, không phải nút xoá riêng: xoá lọc và đổi
              lọc là một cử chỉ, và dòng này cho thấy mình đang được chọn khi chưa lọc gì. */}
          <MenuOption
            label={t('stageAll')}
            selected={value === null}
            onPress={() => select(null)}
          />
          {CUSTOMER_TRIP_FILTER_STAGES[filter].map((item) => (
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
  // Trong hàng ngang: `flex: 1` để dải tab nhường đúng chỗ cho nút lọc ở mép phải.
  tabsList: {
    flex: 1,
  },
});
