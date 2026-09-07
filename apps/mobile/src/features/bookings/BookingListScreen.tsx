import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_STATUS_VALUES, PERMISSION } from '@xeprime/types';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/layout/Screen';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { colors } from '@/theme/tokens';
import { scrollThrottle } from '@/theme/motion';
import { BookingCard } from './components/BookingCard';
import { useBookingsPage } from './hooks/use-bookings';
import type { BookingListItem, BookingSort } from './api';

/** Khớp `BOOKING_SORT` ở DTO backend — bốn giá trị, không nhiều hơn. */
const BOOKING_SORT_VALUES: readonly BookingSort[] = [
  'newest',
  'pickup_asc',
  'pickup_desc',
  'return_asc',
];

const DEFAULT_SORT: BookingSort = 'newest';

const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 350;

/** Sentinel "mọi trạng thái" của giao diện — không endpoint nào nhận `status=all`. */
const STATUS_ALL = 'all';

// Ở module scope, không inline: FlatList coi `keyExtractor` mới là prop đổi và dựng lại cả cây con.
const keyOf = (booking: BookingListItem) => booking.id;

/**
 * Danh sách đơn thuê (BKG-07).
 *
 * Lọc, sắp xếp và cắt trang đều ở SERVER (`q`, `status`, `sort`, `page`) — không có chỗ nào kéo
 * cả kho về rồi lọc tại chỗ. Bộ lọc sống ở state màn hình: mobile không có URL để chia sẻ, và bộ
 * lọc này chết theo màn (ADR 0004).
 */
export function BookingListScreen({ vehicleId }: { vehicleId?: string }) {
  const t = useTranslations('Bookings.list');
  const tCreate = useTranslations('Bookings.create');
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();
  const domainLabel = useDomainLabel();

  const [status, setStatus] = useState<string>(STATUS_ALL);
  const [sort, setSort] = useState<BookingSort>(DEFAULT_SORT);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(FIRST_PAGE);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const query = useBookingsPage({
    ...(status === STATUS_ALL ? {} : { status }),
    // Lọc theo xe đến từ ĐƯỜNG DẪN, không phải tấm lọc: nó là ngữ cảnh của lối đi từ hồ sơ xe,
    // giống hệt `?vehicleId=` bên web.
    ...(vehicleId ? { vehicleId } : {}),
    ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
    sort,
    page,
  });

  const items = query.data?.items ?? [];
  const meta = query.data?.meta;

  /*
   * Duyệt / từ chối / huỷ làm danh sách ngắn đi, và trang đang đứng có thể biến mất theo —
   * xem `useClampedPage`. Không có nó thì một thao tác THÀNH CÔNG lại kết thúc bằng màn rỗng.
   */
  useClampedPage(meta, setPage);

  /*
   * Mọi thay đổi bộ lọc đều VỀ TRANG 1.
   *
   * Đứng ở trang 7 rồi lọc còn 12 bản ghi thì trang 7 không tồn tại — server trả rỗng và màn
   * hình trông như "không có kết quả", trong khi thật ra có 12 cái ở trang 1.
   */
  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);

  const changeFilter = useCallback((groupKey: string, value: string) => {
    if (groupKey === 'status') setStatus(value);
    else setSort(value as BookingSort);
    setPage(FIRST_PAGE);
  }, []);

  /**
   * Hai chiều của màn này: LỌC theo trạng thái và SẮP XẾP.
   *
   * Gộp chung một tấm trượt dù khác ngữ nghĩa — vì với người dùng thì cả hai đều là "chỉnh cách
   * danh sách hiện ra", và tách làm hai nút là hai lối vào cho một ý định. Nhãn khối bên trong
   * giữ hai thứ không lẫn nhau.
   */
  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'status',
        label: t('statusAll'),
        value: status,
        resetValue: STATUS_ALL,
        options: [
          { value: STATUS_ALL, label: t('statusAll') },
          ...BOOKING_STATUS_VALUES.map((value) => ({
            value,
            label: domainLabel('bookingStatus', value),
          })),
        ],
      },
      {
        key: 'sort',
        label: t('sortLabel'),
        value: sort,
        resetValue: DEFAULT_SORT,
        options: BOOKING_SORT_VALUES.map((value) => ({ value, label: sortLabel(t, value) })),
      },
    ],
    [t, domainLabel, status, sort],
  );

  const openBooking = useCallback(
    (booking: BookingListItem) => navigateOnce(ROUTES.manage.bookingDetail(booking.id)),
    [navigateOnce],
  );

  const renderItem = useCallback<ListRenderItem<BookingListItem>>(
    ({ item }) => <BookingCard booking={item} onPress={openBooking} />,
    [openBooking],
  );

  const filtered = status !== STATUS_ALL || debouncedSearch.trim().length > 0;

  // Thiếu quyền là 403 của CHÍNH màn này — hiện trạng thái lỗi của nó, không đá về đăng nhập.
  if (!permissions.isLoading && !permissions.has(PERMISSION.BOOKING_VIEW)) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={t('title')} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          title={t('title')}
          {...(meta === undefined ? {} : { total: t('totalLabel', { count: meta.total }) })}
          action={
            permissions.has(PERMISSION.BOOKING_CREATE) ? (
              <IconButton
                icon="add"
                label={tCreate('open')}
                tone="primary"
                onPress={() => navigateOnce(ROUTES.manage.bookingCreate())}
              />
            ) : null
          }
          searchValue={search}
          searchLabel={t('searchLabel')}
          searchPlaceholder={t('searchPlaceholder')}
          onSearchChange={changeSearch}
          groups={groups}
          onFilterChange={changeFilter}
          {...(meta === undefined ? {} : { meta })}
          onPageChange={setPage}
        >
          {({ onScroll, headerHeight, contentContainerStyle }) => {
            /*
              Khung xương, lỗi và rỗng đều đi qua MỘT vùng cuộn có kéo-làm-mới. Trước đây chúng
              là khối tĩnh, nên đúng lúc cần làm mới nhất — danh sách rỗng, hoặc vừa mất sóng —
              lại là lúc không kéo được gì.

              Là HÀM trả JSX chứ không phải component khai trong render — component mới mỗi lần
              render là React tháo vùng cuộn ra gắn lại đúng lúc `isRefetching` đổi.
            */
            const inStateScroll = (children: ReactNode) => (
              <ManageStateScroll
                onScroll={onScroll}
                headerHeight={headerHeight}
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
              >
                {children}
              </ManageStateScroll>
            );

            return query.isPending ? (
              inStateScroll(
                <YStack px={layout.screenX} gap={layout.inline}>
                  {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                    <RecordCardSkeleton key={i} />
                  ))}
                </YStack>,
              )
            ) : query.isError ? (
              inStateScroll(
                <ScreenError
                  error={query.error}
                  title={t('errorTitle')}
                  onRetry={() => void query.refetch()}
                />,
              )
            ) : items.length === 0 ? (
              /*
                Đang lọc mà rỗng thì lối ra là GỠ bộ lọc — nút phải nằm ngay đó. Không có nút,
                người dùng đứng trước một màn trắng và cách duy nhất là tự nhớ mình đã lọc gì.
              */
              inStateScroll(
                filtered ? (
                  <ScreenMessage
                    icon="search-outline"
                    title={t('emptyFilteredTitle')}
                    description={t('emptyFilteredBody')}
                  />
                ) : (
                  <ScreenMessage
                    icon="document-text-outline"
                    title={t('emptyTitle')}
                    description={t('emptyBody')}
                  />
                ),
              )
            ) : (
              <Animated.FlatList
                data={items}
                keyExtractor={keyOf}
                {...LIST_TUNING}
                renderItem={renderItem}
                contentContainerStyle={contentContainerStyle}
                onScroll={onScroll}
                scrollEventThrottle={scrollThrottle.frame}
                refreshControl={
                  /*
                    `progressViewOffset` BẮT BUỘC ở đây.

                    Khối đầu trang (tiêu đề, chỉ số, dải tab, ô tìm kiếm) nằm `position: absolute`
                    ĐÈ lên danh sách. Không có offset thì vòng xoay vẽ ở mép trên của vùng cuộn —
                    tức là NẤP TRỌN sau khối đó. Kéo xuống vẫn gọi API thật, nhưng người dùng
                    không thấy gì nên kết luận là màn này không có kéo-làm-mới.

                    Đẩy xuống đúng chiều cao khối là vòng xoay rơi vào khoảng trống ngay dưới nó.
                    `ManageStateScroll` đã làm vậy từ đầu; hai danh sách này thì bị sót.
                  */
                  <RefreshControl
                    refreshing={query.isRefetching}
                    onRefresh={() => void query.refetch()}
                    tintColor={colors.primaryActive}
                    progressViewOffset={headerHeight}
                  />
                }
              />
            );
          }}
        </ManageListShell>
      </Screen>
    </>
  );
}

/** Liệt kê tường minh — khoá i18n ghép động lọt qua typecheck của `use-intl`. */
function sortLabel(
  t: ReturnType<typeof useTranslations<'Bookings.list'>>,
  sort: BookingSort,
): string {
  switch (sort) {
    case 'pickup_asc':
      return t('sort.pickup_asc');
    case 'pickup_desc':
      return t('sort.pickup_desc');
    case 'return_asc':
      return t('sort.return_asc');
    default:
      return t('sort.newest');
  }
}
