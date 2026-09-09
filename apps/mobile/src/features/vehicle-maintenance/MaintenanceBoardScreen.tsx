import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { MAINTENANCE_BOARD_FILTER, MAINTENANCE_TYPE_VALUES, PERMISSION } from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { MissingOdometerCard } from '@/features/handovers/components/MissingOdometerCard';
import { ResolveQueueSheet } from '@/features/handovers/components/ResolveQueueSheet';
import { useMissingOdometerQueue } from '@/features/handovers/hooks/use-handovers';
import type { MissingOdometerItem } from '@/features/handovers/api';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { LIST_TUNING, MEDIA_LIST_TUNING } from '@/theme/list-tuning';
import { colors } from '@/theme/tokens';
import { scrollThrottle } from '@/theme/motion';
import { BoardActionSheets, type BoardAction } from './components/BoardActionSheets';
import { MaintenanceBoardCard } from './components/MaintenanceBoardCard';
import { useMaintenanceBoard } from './hooks/use-maintenance';
import type { MaintenanceBoardItem } from './api';

/** Khớp `MAINTENANCE_BOARD_SORT` ở backend DTO. */
const SORT_VALUES = ['remaining_asc', 'remaining_desc', 'name_asc', 'updated_desc'] as const;
type BoardSort = (typeof SORT_VALUES)[number];

/**
 * Nhóm việc hiện ra cho người dùng — chép ĐÚNG dải tab của `MaintenanceBoardTabs`, không phải
 * `Object.values(MAINTENANCE_BOARD_FILTER)`.
 *
 * Enum là hợp đồng với BACKEND, không phải thực đơn: nó còn `history` (xe đã từng bảo dưỡng) mà
 * web cố ý không mở ra, và duyệt enum thì mọi giá trị thêm sau này cũng tự mọc lên màn hình app
 * trước khi có ai quyết định là nên hiện.
 *
 * `MISSING_RETURN_KM` nối vào cuối khi có `handovers.view` — đúng như `visibleTabs` bên web.
 */
const BOARD_FILTER_VALUES = [
  MAINTENANCE_BOARD_FILTER.ALL,
  MAINTENANCE_BOARD_FILTER.OVERDUE,
  MAINTENANCE_BOARD_FILTER.DUE_SOON,
  MAINTENANCE_BOARD_FILTER.IN_PROGRESS,
  MAINTENANCE_BOARD_FILTER.MISSING_ODOMETER,
  MAINTENANCE_BOARD_FILTER.UPCOMING,
] as const;

/** Nhóm việc đọc bảng KHÁC (biên bản bàn giao), chỉ mở cho người có quyền xem bàn giao. */
const QUEUE_FILTER = MAINTENANCE_BOARD_FILTER.MISSING_RETURN_KM;

const DEFAULT_SORT: BoardSort = 'remaining_asc';
const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 350;
const ALL = 'all';

// Ở module scope, không inline: FlatList coi `keyExtractor` mới là prop đổi và dựng lại cả cây con.
const keyOf = (item: MaintenanceBoardItem) => item.vehicleId;
const queueKeyOf = (item: MissingOdometerItem) => item.handoverId;

/**
 * Trung tâm bảo dưỡng toàn đội xe (VEH-09).
 *
 * Ưu tiên VIỆC CẦN LÀM: nhóm việc (quá hạn / sắp đến hạn / đang bảo dưỡng) là một chiều lọc,
 * đứng cùng hạng mục và sắp xếp trong tấm trượt. Lọc, sắp xếp và phân trang chạy ở SERVER.
 *
 * Nhóm việc "Thiếu KM trả" đổi HẲN danh sách: dòng của nó là biên bản bàn giao chứ không phải
 * xe, nên nó đọc endpoint khác và vẽ thẻ khác — giống hệt cách web thay bảng trong cùng trang.
 * Vẫn chung tiêu đề, chung ô tìm kiếm, chung phân trang.
 */
export function MaintenanceBoardScreen() {
  const t = useTranslations('Vehicles.maintenance.board');
  const tFilters = useTranslations('Maintenance.filters');
  const tMissing = useTranslations('Bookings.missingKm');
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();
  const domainLabel = useDomainLabel();

  const [filter, setFilter] = useState<string>(ALL);
  const [type, setType] = useState<string>(ALL);
  const [sort, setSort] = useState<BoardSort>(DEFAULT_SORT);
  const [search, setSearch] = useState('');
  /** Khoảng LỊCH DỰ KIẾN, `YYYY-MM-DD` — hai tham số độc lập đúng như API nhận. */
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(FIRST_PAGE);
  const [action, setAction] = useState<BoardAction | null>(null);
  const [resolving, setResolving] = useState<MissingOdometerItem | null>(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const canView = permissions.has(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
  const canManage = permissions.has(PERMISSION.VEHICLE_MAINTENANCE_MANAGE);
  const canCorrectOdometer = permissions.has(PERMISSION.VEHICLE_ODOMETER_CORRECT);
  const canViewHandovers = permissions.has(PERMISSION.HANDOVER_VIEW);

  /*
   * Mất quyền xem bàn giao thì nhóm việc đó về "Tất cả" thay vì mở một bảng rỗng khó hiểu —
   * quyền có thể bị gỡ trong lúc màn đang mở. Dù có lọt qua đây thì guard của
   * `GET /handovers/missing-odometer` vẫn chặn.
   */
  const isQueue = filter === QUEUE_FILTER && canViewHandovers;
  const boardFilter = filter === QUEUE_FILTER && !canViewHandovers ? ALL : filter;
  const searchTerm = debouncedSearch.trim();

  const query = useMaintenanceBoard(
    {
      filter: boardFilter,
      type,
      sort,
      ...(searchTerm ? { q: searchTerm } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      page,
    },
    canView && !isQueue,
  );
  const queue = useMissingOdometerQueue(
    { page, ...(searchTerm ? { q: searchTerm } : {}) },
    isQueue,
  );

  /** Truy vấn ĐANG cầm lái màn hình — hai nhóm việc, hai endpoint, chung một khung trạng thái. */
  const active = isQueue ? queue : query;
  const items = query.data?.items ?? [];
  const queueItems = queue.data?.items ?? [];
  const meta = active.data?.meta;

  useClampedPage(meta, setPage);

  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);

  const changeFilter = useCallback((groupKey: string, value: string) => {
    if (groupKey === 'filter') setFilter(value);
    else if (groupKey === 'type') setType(value);
    else if (groupKey === 'from') setFrom(value);
    else if (groupKey === 'to') setTo(value);
    else setSort(value as BoardSort);
    setPage(FIRST_PAGE);
  }, []);

  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'filter',
        label: t('title'),
        value: filter,
        resetValue: ALL,
        options: [...BOARD_FILTER_VALUES, ...(canViewHandovers ? [QUEUE_FILTER] : [])].map(
          (value) => ({ value, label: domainLabel('maintenanceBoardFilter', value) }),
        ),
      },
      /*
       * Hàng đợi chỉ nhận TÌM KIẾM: hạng mục, lịch dự kiến và "còn bao nhiêu KM" đều vô nghĩa với
       * một biên bản bàn giao — web cũng rút bộ lọc xuống đúng một ô tìm kiếm ở nhóm việc này.
       * Hiện ô lọc không tác dụng là mời người dùng bấm nhầm.
       */
      ...(isQueue
        ? []
        : ([
            {
              key: 'type',
              label: t('typeLabel'),
              value: type,
              resetValue: ALL,
              options: [
                { value: ALL, label: t('typeAll') },
                ...MAINTENANCE_TYPE_VALUES.map((value) => ({
                  value,
                  label: domainLabel('maintenanceType', value),
                })),
              ],
            },
            /*
             * Khoảng LỊCH DỰ KIẾN — cùng cặp tham số `from`/`to` và cùng nhãn với web.
             *
             * Nó đứng TRƯỚC sắp xếp như bên web: lọc thu hẹp tập kết quả, sắp xếp chỉ đổi thứ
             * tự, nên hai loại không xen kẽ nhau trong tấm trượt.
             */
            {
              kind: 'dateRange',
              label: tFilters('schedule'),
              fromKey: 'from',
              toKey: 'to',
              from,
              to,
            },
            {
              key: 'sort',
              label: t('sortLabel'),
              value: sort,
              resetValue: DEFAULT_SORT,
              options: SORT_VALUES.map((value) => ({ value, label: sortLabel(t, value) })),
            },
          ] as const)),
    ],
    [t, tFilters, domainLabel, canViewHandovers, isQueue, filter, type, sort, from, to],
  );

  const openVehicle = useCallback(
    (item: MaintenanceBoardItem) => navigateOnce(ROUTES.manage.vehicleDetail(item.vehicleId)),
    [navigateOnce],
  );

  const renderItem = useCallback<ListRenderItem<MaintenanceBoardItem>>(
    ({ item }) => (
      <MaintenanceBoardCard
        item={item}
        canManage={canManage}
        canCorrectOdometer={canCorrectOdometer}
        onPress={openVehicle}
        onAction={setAction}
      />
    ),
    [canManage, canCorrectOdometer, openVehicle],
  );

  const renderQueueItem = useCallback<ListRenderItem<MissingOdometerItem>>(
    ({ item }) => <MissingOdometerCard item={item} onFix={() => setResolving(item)} />,
    [],
  );

  /*
   * Ở hàng đợi chỉ TÌM KIẾM mới tính là đang lọc.
   *
   * Hạng mục / lịch dự kiến / sắp xếp có thể còn giá trị cũ từ trước lúc chuyển nhóm việc, nhưng
   * chúng không đụng tới truy vấn này — coi chúng là "đang lọc" thì một hàng đợi rỗng sẽ báo
   * "không tìm thấy kết quả" trong khi sự thật là không còn việc nào phải làm.
   */
  const filtered = isQueue
    ? searchTerm.length > 0
    : filter !== ALL || type !== ALL || Boolean(from) || Boolean(to) || searchTerm.length > 0;

  if (!permissions.isLoading && !canView) {
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
          {...(meta === undefined ? {} : { total: t('total', { count: meta.total }) })}
          searchValue={search}
          searchLabel={isQueue ? tFilters('queueSearch') : t('searchLabel')}
          searchPlaceholder={isQueue ? tFilters('queueSearchPlaceholder') : t('searchPlaceholder')}
          onSearchChange={changeSearch}
          groups={groups}
          onFilterChange={changeFilter}
          {...(meta === undefined ? {} : { meta })}
          onPageChange={setPage}
        >
          {({ onScroll, headerHeight, contentContainerStyle, bindList }) => {
            // Là HÀM trả JSX chứ không phải component khai trong render — component mới mỗi lần
            // render là React tháo vùng cuộn ra gắn lại đúng lúc `isRefetching` đổi.
            const inStateScroll = (children: ReactNode) => (
              <ManageStateScroll
                onScroll={onScroll}
                headerHeight={headerHeight}
                refreshing={active.isRefetching}
                onRefresh={() => void active.refetch()}
              >
                {children}
              </ManageStateScroll>
            );

            const rows = isQueue ? queueItems : items;

            return active.isPending ? (
              inStateScroll(
                <YStack px={layout.screenX} gap={layout.inline}>
                  {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                    <RecordCardSkeleton key={i} />
                  ))}
                </YStack>,
              )
            ) : active.isError ? (
              inStateScroll(
                <ScreenError
                  error={active.error}
                  title={isQueue ? tMissing('errorTitle') : t('errorTitle')}
                  onRetry={() => void active.refetch()}
                />,
              )
            ) : rows.length === 0 ? (
              inStateScroll(
                filtered ? (
                  <ScreenMessage
                    icon="search-outline"
                    title={t('emptyFilteredTitle')}
                    description={t('emptyFilteredBody')}
                  />
                ) : isQueue ? (
                  /* Hàng đợi rỗng là TIN VUI, không phải "chưa có dữ liệu" — nói đúng như vậy. */
                  <ScreenMessage
                    icon="checkmark-circle-outline"
                    title={tMissing('empty')}
                    description={tMissing('emptyBody')}
                  />
                ) : (
                  <ScreenMessage
                    icon="construct-outline"
                    title={t('emptyTitle')}
                    description={t('emptyBody')}
                  />
                ),
              )
            ) : isQueue ? (
              <Animated.FlatList
                ref={bindList}
                data={queueItems}
                keyExtractor={queueKeyOf}
                {...LIST_TUNING}
                renderItem={renderQueueItem}
                contentContainerStyle={contentContainerStyle}
                onScroll={onScroll}
                scrollEventThrottle={scrollThrottle.frame}
                refreshControl={
                  <RefreshControl
                    refreshing={queue.isRefetching}
                    onRefresh={() => void queue.refetch()}
                    tintColor={colors.primaryActive}
                    progressViewOffset={headerHeight}
                  />
                }
              />
            ) : (
              <Animated.FlatList
                ref={bindList}
                data={items}
                keyExtractor={keyOf}
                {...MEDIA_LIST_TUNING}
                renderItem={renderItem}
                contentContainerStyle={contentContainerStyle}
                onScroll={onScroll}
                scrollEventThrottle={scrollThrottle.frame}
                refreshControl={
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

      {/*
        Tấm tác vụ nằm NGOÀI danh sách, chỉ một bản cho cả trang: mỗi dòng dựng riêng một bộ
        tấm trượt là hai chục `Modal` sống song song cho một thứ mở được từng cái một.
      */}
      <BoardActionSheets action={action} onClose={() => setAction(null)} />

      {/*
        Bổ sung KM mở NGAY tại đây như web, không đẩy sang màn biên bản — và vẫn đúng một đường
        ghi: tấm mở ra là `ResolveOdometerSheet` của chính màn biên bản, kèm mã lý do và diễn
        giải bắt buộc vào `audit_logs`.
      */}
      {resolving ? (
        <ResolveQueueSheet
          item={resolving}
          onClose={() => setResolving(null)}
          onResolved={() => void queue.refetch()}
        />
      ) : null}
    </>
  );
}

/** Liệt kê tường minh — khoá i18n ghép động lọt qua typecheck của `use-intl`. */
function sortLabel(
  t: ReturnType<typeof useTranslations<'Vehicles.maintenance.board'>>,
  sort: BoardSort,
): string {
  switch (sort) {
    case 'remaining_desc':
      return t('sort.remaining_desc');
    case 'name_asc':
      return t('sort.name_asc');
    case 'updated_desc':
      return t('sort.updated_desc');
    default:
      return t('sort.remaining_asc');
  }
}
