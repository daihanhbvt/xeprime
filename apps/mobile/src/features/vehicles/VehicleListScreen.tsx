import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  SERVICE_TYPE_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { colors } from '@/theme/tokens';
import { scrollThrottle } from '@/theme/motion';
import { FleetSummaryBar } from './components/FleetSummaryBar';
import { VehicleCard } from './components/VehicleCard';
import { useInfiniteVehicles, useVehicleAlerts, useVehicleStats } from './hooks/use-vehicles';
import type { VehicleListItem, VehicleSort } from './api';

/** Khớp `VEHICLE_SORT` ở backend DTO — năm giá trị, không nhiều hơn. */
const VEHICLE_SORT_VALUES: readonly VehicleSort[] = [
  'newest',
  'name_asc',
  'code_asc',
  'price_asc',
  'price_desc',
];

const DEFAULT_SORT: VehicleSort = 'newest';

const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 350;

/** Sentinel "mọi giá trị" của giao diện — không endpoint nào nhận `vehicleType=all`. */
const ALL = 'all';

/*
 * Khai NGOÀI component, ở module scope: viết inline hay `useCallback` trong thân hàm vẫn tạo một
 * closure mới mỗi khi component MOUNT lại (ví dụ điều hướng rời rồi quay lại màn), còn hàm không
 * đóng gói biến nào của component thì không có lý do gì phải sống bên trong nó.
 */
function vehicleKeyExtractor(vehicle: VehicleListItem): string {
  return vehicle.id;
}

/**
 * Đội xe của gian hàng (VEH-01).
 *
 * Lọc, sắp xếp và cắt trang đều ở SERVER (`q`, `vehicleType`, `serviceType`, `operationStatus`,
 * `publicStatus`, `sort`, `page`) — không có chỗ nào kéo cả kho về rồi lọc tại chỗ. Bộ lọc sống
 * ở state màn hình: mobile không có URL để chia sẻ, và bộ lọc này chết theo màn (ADR 0004).
 *
 * Chỉ số và cảnh báo là HAI truy vấn riêng chạy sau danh sách — xem `use-vehicles.ts`.
 */
export function VehicleListScreen() {
  const t = useTranslations('Vehicles.list');
  const tLabels = useTranslations('Common.labels');
  const tStates = useTranslations('Common.states');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();
  const domainLabel = useDomainLabel();

  const [vehicleType, setVehicleType] = useState<string>(ALL);
  const [serviceType, setServiceType] = useState<string>(ALL);
  const [operationStatus, setOperationStatus] = useState<string>(ALL);
  const [publicStatus, setPublicStatus] = useState<string>(ALL);
  const [sort, setSort] = useState<VehicleSort>(DEFAULT_SORT);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const query = useInfiniteVehicles({
    ...(vehicleType === ALL ? {} : { vehicleType }),
    ...(serviceType === ALL ? {} : { serviceType }),
    ...(operationStatus === ALL ? {} : { operationStatus }),
    ...(publicStatus === ALL ? {} : { publicStatus }),
    ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
    sort,
  });

  const { items } = query;
  const ids = useMemo(() => items.map((item) => item.id), [items]);

  /*
   * Chỉ số và cảnh báo khoá theo TOÀN BỘ id đang hiện, nên mỗi lần nối trang là một khoá mới.
   *
   * Đánh đổi có ý thức: hai endpoint này nhận id theo LÔ, và giữ một khoá duy nhất cho cả danh
   * sách là cách duy nhất để thẻ ở trang 1 và trang 3 đọc từ cùng một map. Với 10 xe/lần và đội
   * xe cỡ vài chục, đó là vài request nhỏ; đổi lại nếu chia khoá theo từng trang thì mỗi thẻ
   * phải biết nó thuộc trang nào — một thứ danh sách phẳng cố tình không giữ.
   */
  const stats = useVehicleStats(ids);
  const alerts = useVehicleAlerts(ids);

  /*
   * Mọi thay đổi bộ lọc đều VỀ TRANG 1: đứng ở trang 7 rồi lọc còn 12 bản ghi thì trang 7 không
   * tồn tại — server trả rỗng và màn hình trông như "không có kết quả".
   */
  const changeSearch = useCallback((next: string) => {
    setSearch(next);
  }, []);

  const changeFilter = useCallback((groupKey: string, value: string) => {
    if (groupKey === 'vehicleType') setVehicleType(value);
    else if (groupKey === 'serviceType') setServiceType(value);
    else if (groupKey === 'operationStatus') setOperationStatus(value);
    else if (groupKey === 'publicStatus') setPublicStatus(value);
    else setSort(value as VehicleSort);
  }, []);

  /**
   * Năm chiều của màn này: bốn chiều LỌC (đúng bốn ô lọc của web) và một chiều SẮP XẾP.
   *
   * Gộp chung một tấm trượt dù khác ngữ nghĩa — với người dùng thì cả hai đều là "chỉnh cách
   * danh sách hiện ra", và tách làm hai nút là hai lối vào cho một ý định.
   */
  const groups = useMemo<readonly FilterGroup[]>(() => {
    /*
     * Lựa chọn "không lọc" đọc là **Tất cả**, không phải tên của chiều lọc.
     *
     * Web không có option này: ô `Select` để trống và tên chiều nằm ở placeholder. Bê nguyên
     * tên chiều xuống làm nhãn option thì trên native nó thành một chip "Loại xe" trông y hệt
     * một giá trị đã chọn — người dùng đọc ra là đang lọc, trong khi thật ra chưa lọc gì.
     */
    const all = (values: readonly string[], group: Parameters<typeof domainLabel>[0]) => [
      { value: ALL, label: tLabels('all') },
      ...values.map((value) => ({ value, label: domainLabel(group, value) })),
    ];

    return [
      {
        key: 'vehicleType',
        label: t('filters.vehicleType'),
        value: vehicleType,
        resetValue: ALL,
        options: all(VEHICLE_TYPE_VALUES, 'vehicleType'),
      },
      {
        key: 'serviceType',
        label: t('filters.serviceType'),
        value: serviceType,
        resetValue: ALL,
        options: all(SERVICE_TYPE_VALUES, 'serviceType'),
      },
      {
        key: 'operationStatus',
        label: t('filters.operationStatus'),
        value: operationStatus,
        resetValue: ALL,
        options: all(VEHICLE_OPERATION_STATUS_VALUES, 'vehicleOperationStatus'),
      },
      {
        key: 'publicStatus',
        label: t('filters.publicStatus'),
        value: publicStatus,
        resetValue: ALL,
        options: all(VEHICLE_PUBLIC_STATUS_VALUES, 'vehiclePublicStatus'),
      },
      {
        key: 'sort',
        label: t('sort.label'),
        value: sort,
        resetValue: DEFAULT_SORT,
        options: VEHICLE_SORT_VALUES.map((value) => ({ value, label: sortLabel(t, value) })),
      },
    ];
  }, [t, tLabels, domainLabel, vehicleType, serviceType, operationStatus, publicStatus, sort]);

  const openVehicle = useCallback(
    (vehicle: VehicleListItem) => navigateOnce(ROUTES.manage.vehicleDetail(vehicle.id)),
    [navigateOnce],
  );

  const editVehicle = useCallback(
    (vehicle: VehicleListItem) => navigateOnce(ROUTES.manage.vehicleEdit(vehicle.id)),
    [navigateOnce],
  );

  /*
   * "Lịch" là nút THỨ BA của web, nhưng màn lịch (CAL-01) chưa có ở app.
   *
   * Vẫn dựng nút và trả lời bằng một câu, không ẩn đi: ẩn thì người dùng đang quen web sẽ đi
   * tìm, còn hiện mà im lặng khi chạm thì họ tưởng máy treo và bấm tiếp.
   */
  const openSchedule = useCallback(() => toast.showInfo(tStates('featureComingSoon')), [
    toast,
    tStates,
  ]);

  const canEdit = permissions.has(PERMISSION.VEHICLE_UPDATE);

  /*
   * `renderItem` khai NGOÀI JSX, cùng lý do với `keyExtractor`: một hàm mới mỗi render là FlatList
   * dựng lại mọi ô đang hiện. Phụ thuộc là những thứ THẬT SỰ đổi nội dung thẻ — map chỉ số và
   * cảnh báo đã được `useMemo` ở hook nên chỉ đổi khi dữ liệu về.
   */
  const renderItem = useCallback<ListRenderItem<VehicleListItem>>(
    ({ item }) => (
      <VehicleCard
        vehicle={item}
        onPress={openVehicle}
        {...(canEdit ? { onEdit: editVehicle } : {})}
        onSchedule={openSchedule}
        stats={stats.byId.get(item.id)}
        statsLoading={stats.isLoading}
        statsFailed={stats.isError}
        alerts={alerts.byId.get(item.id)}
        alertsLoading={alerts.isLoading}
        alertsFailed={alerts.isError}
      />
    ),
    [
      openVehicle,
      canEdit,
      editVehicle,
      openSchedule,
      stats.byId,
      stats.isLoading,
      stats.isError,
      alerts.byId,
      alerts.isLoading,
      alerts.isError,
    ],
  );

  const filtered =
    vehicleType !== ALL ||
    serviceType !== ALL ||
    operationStatus !== ALL ||
    publicStatus !== ALL ||
    debouncedSearch.trim().length > 0;

  // Thiếu quyền là 403 của CHÍNH màn này — hiện trạng thái lỗi của nó, không đá về đăng nhập.
  if (!permissions.isLoading && !permissions.has(PERMISSION.VEHICLE_VIEW)) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={t('page.title')} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          title={t('page.title')}
          {...(query.total > 0 ? { total: t('summary.vehicleCount', { count: query.total }) } : {})}
          action={
            permissions.has(PERMISSION.VEHICLE_CREATE) ? (
              <IconButton
                icon="add"
                label={t('page.addVehicle')}
                tone="primary"
                onPress={() => navigateOnce(ROUTES.manage.vehicleNew())}
              />
            ) : null
          }
          summary={<FleetSummaryBar enabled={items.length > 0 || query.isInitialLoading} />}
          searchValue={search}
          searchLabel={t('filters.search')}
          searchPlaceholder={t('filters.searchPlaceholder')}
          onSearchChange={changeSearch}
          groups={groups}
          onFilterChange={changeFilter}
        >
          {({ onScroll, headerHeight, contentContainerStyle }) => {
            /*
              Khung xương, lỗi và rỗng đều đi qua MỘT vùng cuộn có kéo-làm-mới — đúng lúc cần làm
              mới nhất (danh sách rỗng, hoặc vừa mất sóng) mà không kéo được gì là tệ nhất.

              Là HÀM trả JSX, không phải component khai trong render: một component mới mỗi lần
              render là React tháo cả vùng cuộn ra gắn lại — vòng xoay kéo-làm-mới nháy đúng lúc
              `isRefreshing` đổi.
            */
            const inStateScroll = (children: ReactNode) => (
              <ManageStateScroll
                onScroll={onScroll}
                headerHeight={headerHeight}
                refreshing={query.isRefreshing}
                onRefresh={query.retry}
              >
                {children}
              </ManageStateScroll>
            );

            return query.isInitialLoading ? (
              inStateScroll(
                <YStack px={layout.screenX} gap={layout.inline}>
                  {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                    <RecordCardSkeleton key={i} />
                  ))}
                </YStack>,
              )
            ) : query.initialError ? (
              inStateScroll(
                <ScreenError
                  error={query.initialError}
                  title={t('grid.loadErrorTitle')}
                  onRetry={query.retry}
                />,
              )
            ) : items.length === 0 ? (
              /*
                "Đang lọc mà rỗng" và "chưa có xe nào" là hai câu chuyện khác nhau: một cái lối ra
                là gỡ bộ lọc, cái kia là thêm xe đầu tiên. Dùng chung một câu là bỏ rơi cả hai.
              */
              inStateScroll(
                filtered ? (
                  <ScreenMessage
                    icon="search-outline"
                    title={t('grid.noResultsTitle')}
                    description={t('grid.noResultsBody')}
                  />
                ) : (
                  <ScreenMessage
                    icon="car-outline"
                    title={t('grid.emptyTitle')}
                    description={t('grid.emptyBody')}
                    {...(permissions.has(PERMISSION.VEHICLE_CREATE)
                      ? {
                          actionLabel: t('page.addFirstVehicle'),
                          onAction: () => navigateOnce(ROUTES.manage.vehicleNew()),
                        }
                      : {})}
                  />
                ),
              )
            ) : (
              <Animated.FlatList
                data={items}
                keyExtractor={vehicleKeyExtractor}
                renderItem={renderItem}
                contentContainerStyle={contentContainerStyle}
                onScroll={onScroll}
                scrollEventThrottle={scrollThrottle.frame}
                {...LIST_TUNING}
                onEndReached={query.fetchNextPage}
                ListFooterComponent={
                  <ListFooter
                    loading={query.isFetchingNextPage}
                    error={query.appendError != null}
                    retryLabel={tActions('retry')}
                    onRetry={query.fetchNextPage}
                  />
                }
                refreshControl={
                  /*
                    `progressViewOffset` BẮT BUỘC: khối đầu trang nằm `position: absolute` ĐÈ lên
                    danh sách, nên không có offset thì vòng xoay vẽ nấp trọn sau nó — kéo xuống
                    vẫn gọi API thật nhưng người dùng không thấy gì.
                  */
                  <RefreshControl
                    refreshing={query.isRefreshing}
                    onRefresh={query.retry}
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

/**
 * Chân danh sách cuộn vô hạn — vòng xoay khi đang nối trang, nút thử lại khi trang kế hỏng.
 *
 * Lỗi TRANG KẾ không được dựng màn lỗi toàn vùng: người dùng đang có 20 xe trên màn, xoá hết
 * chúng đi vì trang 3 hỏng là phá mất thứ đang dùng được. Một dòng ở đáy là đủ.
 *
 * Không có gì để nối thì trả `null` — một khoảng trắng cố định ở đáy mọi danh sách ngắn đọc ra
 * như còn nội dung chưa tải xong.
 */
function ListFooter({
  loading,
  error,
  retryLabel,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  retryLabel: string;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <YStack py={layout.section} ai="center">
        <Button label={retryLabel} variant="secondary" size="sm" block={false} onPress={onRetry} />
      </YStack>
    );
  }
  if (!loading) return null;
  return (
    <YStack py={layout.section} ai="center">
      <ActivityIndicator color={colors.primary} />
    </YStack>
  );
}

/** Liệt kê tường minh — khoá i18n ghép động lọt qua typecheck của `use-intl`. */
function sortLabel(
  t: ReturnType<typeof useTranslations<'Vehicles.list'>>,
  sort: VehicleSort,
): string {
  switch (sort) {
    case 'name_asc':
      return t('sort.name_asc');
    case 'code_asc':
      return t('sort.code_asc');
    case 'price_asc':
      return t('sort.price_asc');
    case 'price_desc':
      return t('sort.price_desc');
    default:
      return t('sort.newest');
  }
}
