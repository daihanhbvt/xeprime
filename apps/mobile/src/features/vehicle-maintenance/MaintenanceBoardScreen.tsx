import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  MAINTENANCE_BOARD_FILTER,
  MAINTENANCE_DUE_STATUS_META,
  MAINTENANCE_STATUS_META,
  MAINTENANCE_TYPE_VALUES,
  PERMISSION,
  STATUS_COLOR,
  type MaintenanceDueStatus,
  type MaintenanceStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Chip';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
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
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { scrollThrottle } from '@/theme/motion';
import { BoardActionSheets, type BoardAction } from './components/BoardActionSheets';
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
  const queue = useMissingOdometerQueue({ page, ...(searchTerm ? { q: searchTerm } : {}) }, isQueue);

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
      <BoardRow
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
          {({ onScroll, headerHeight, contentContainerStyle }) => {
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
                data={items}
                keyExtractor={keyOf}
                {...LIST_TUNING}
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

/** Một thao tác trên dòng — dựng thành mảng để luật ẩn/hiện đọc thẳng ra được. */
interface RowAction {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
  readonly danger?: boolean;
  readonly onPress: () => void;
}

/**
 * `memo` như `VehicleCard`/`BookingCard`: dòng này nằm trong một danh sách dài, và không có nó thì
 * mỗi lần màn render (đổi trang, kéo-làm-mới, mở tấm tác vụ) là mọi dòng đang hiện vẽ lại dù dữ
 * liệu không đổi.
 */
const BoardRow = memo(function BoardRow({
  item,
  canManage,
  canCorrectOdometer,
  onPress,
  onAction,
}: {
  item: MaintenanceBoardItem;
  canManage: boolean;
  canCorrectOdometer: boolean;
  onPress: (item: MaintenanceBoardItem) => void;
  onAction: (action: BoardAction) => void;
}) {
  const tTable = useTranslations('Maintenance.table');
  const tActions = useTranslations('Maintenance.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const dueStatus = item.dueStatus as MaintenanceDueStatus;
  const open = useCallback(() => onPress(item), [onPress, item]);

  /*
   * ĐÚNG bốn thao tác của `MaintenanceBoardTable`, cùng thứ tự và cùng luật ẩn hiện:
   *
   * - "Cập nhật ODO" đọc `vehicles.odometer.correct` — quyền RIÊNG, không nằm trong quyền quản lý
   *   bảo dưỡng: người ghi số KM hằng ngày không phải người được đổi lịch xưởng.
   * - "Lên lịch" ↔ "Sửa lịch" cùng một nút, nhãn đổi theo phiếu đang mở.
   * - "Hoàn tất" và "Hủy lịch" chỉ có nghĩa khi CÓ phiếu đang mở.
   *
   * "Chi tiết" của web không nằm ở đây: cả thẻ đã bắt chạm và có mũi tên `>` — thêm một nút nữa là
   * lối vào thứ ba cho cùng một màn.
   */
  const actions: RowAction[] = [
    ...(canCorrectOdometer
      ? [
          {
            key: 'odometer',
            label: tActions('updateOdometer'),
            icon: 'speedometer-outline' as IconName,
            onPress: () => onAction({ kind: 'odometer', row: item }),
          },
        ]
      : []),
    ...(canManage
      ? [
          {
            key: 'schedule',
            label: item.activeRecord ? tActions('editSchedule') : tActions('schedule'),
            icon: 'calendar-outline' as IconName,
            onPress: () => onAction({ kind: 'schedule', row: item }),
          },
        ]
      : []),
    ...(canManage && item.activeRecord
      ? [
          {
            key: 'complete',
            label: tActions('complete'),
            icon: 'checkmark-outline' as IconName,
            onPress: () => onAction({ kind: 'complete', row: item }),
          },
          {
            key: 'cancel',
            label: tActions('cancelSchedule'),
            icon: 'stop-circle-outline' as IconName,
            danger: true,
            onPress: () => onAction({ kind: 'cancel', row: item }),
          },
        ]
      : []),
  ];

  return (
    <Card onPress={open} accessibilityLabel={item.vehicleName}>
      {/*
        Mũi tên `>` ở mép phải, canh giữa theo cả hàng — DẤU HIỆU thẻ mở ra được. Cả thẻ đã bắt
        chạm, nên một nút "Xem chi tiết" ở chân thẻ chỉ là lối vào thứ hai cho cùng một việc.
      */}
      <XStack ai="center" gap={space.sm}>
        <YStack f={1} gap={space.xs}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {item.vehicleName}
            </Text>
            <StatusBadge
              label={domainLabel(
                'maintenanceDueStatus',
                dueStatus,
                MAINTENANCE_DUE_STATUS_META[dueStatus].label,
              )}
              color={MAINTENANCE_DUE_STATUS_META[dueStatus].color}
              size="sm"
            />
          </XStack>

          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {[item.plateNumber, item.vehicleCode].filter(Boolean).join(LIST_SEPARATOR)}
          </Text>

          {item.remainingKm != null ? (
            /* Câu "còn / quá hạn bao nhiêu" dựng ở MỘT chỗ (`fmt.remainingKm`) — web dùng đúng
               hàm đó, nên bảng này và tab bảo dưỡng không thể nói khác nhau về cùng một chiếc xe. */
            <Text
              col={item.remainingKm <= 0 ? colors.danger : colors.textMuted}
              fos={fontSize.bodySm}
              fow={fontWeight.medium}
            >
              {fmt.remainingKm(item.remainingKm)}
              {/*
                Chu kỳ đi LIỀN sau số còn lại — "Còn 4.100 km" một mình không nói được nhiều
                hay ít; 4.100 trên chu kỳ 5.000 là vừa thay, trên chu kỳ 20.000 là sắp tới hạn.
                Cùng khoá `Maintenance.table.cycle` với web, kể cả khoảng trắng và dấu ngoặc.
              */}
              {item.oilChangeIntervalKm
                ? tTable('cycle', { value: fmt.km(item.oilChangeIntervalKm) })
                : ''}
            </Text>
          ) : null}

          {/*
            LỊCH ĐANG MỞ — cột `openSchedule` của web: nhãn trạng thái phiếu + hạng mục + ngày
            dự kiến. Thiếu nó thì hai xe cùng "Trong chu kỳ" trông y hệt nhau, dù một chiếc đã
            có thợ hẹn và một chiếc thì chưa ai đụng tới.
          */}
          {item.activeRecord ? (
            <XStack ai="center" flexWrap="wrap" gap={space.xs}>
              <StatusBadge
                label={domainLabel(
                  'maintenanceStatus',
                  item.activeRecord.status,
                  MAINTENANCE_STATUS_META[item.activeRecord.status as MaintenanceStatus]?.label,
                )}
                color={
                  MAINTENANCE_STATUS_META[item.activeRecord.status as MaintenanceStatus]?.color ??
                  STATUS_COLOR.NEUTRAL
                }
                size="sm"
              />
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {[
                  domainLabel('maintenanceType', item.activeRecord.type),
                  item.activeRecord.plannedStartAt
                    ? fmt.date(item.activeRecord.plannedStartAt)
                    : null,
                ]
                  .filter(Boolean)
                  .join(LIST_SEPARATOR)}
              </Text>
            </XStack>
          ) : null}
        </YStack>

        <DetailChevron />
      </XStack>

      {/*
        Hàng thao tác xếp HAI CỘT, không phải một hàng ngang bốn nút.

        Bốn nhãn ở đây dài ngắn rất khác nhau ("Cập nhật ODO" gấp đôi "Hoàn tất"); nhét cả bốn lên
        một hàng 390pt thì mỗi nút còn chưa tới 80pt và chữ dài nhất xuống dòng hoặc bị cắt. Hai
        cột giữ nguyên nhãn của web mà vẫn đọc được, và khi chỉ còn một thao tác thì `f={1}` cho
        nó chiếm trọn hàng — không để lại nửa hàng trống.
      */}
      {actions.length > 0 ? (
        <YStack gap={space.xs} mt={space.sm}>
          {actionRows(actions).map((row) => (
            <XStack key={row.map((action) => action.key).join('-')} gap={space.xs}>
              {row.map((action) => (
                <YStack key={action.key} f={1}>
                  <Button
                    label={action.label}
                    icon={action.icon}
                    variant={action.danger ? 'danger' : 'accent'}
                    size="sm"
                    shape="square"
                    onPress={action.onPress}
                  />
                </YStack>
              ))}
            </XStack>
          ))}
        </YStack>
      ) : null}
    </Card>
  );
});

/** Cắt danh sách thao tác thành từng cặp — hàng cuối lẻ thì nút của nó tự chiếm trọn bề ngang. */
function actionRows(actions: readonly RowAction[]): RowAction[][] {
  const rows: RowAction[][] = [];
  for (let index = 0; index < actions.length; index += 2) {
    rows.push(actions.slice(index, index + 2));
  }
  return rows;
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
