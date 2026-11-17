import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  SERVICE_TYPE_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { ChipTabs, type ChipTabItem } from '@/components/ui/ChipTabs';
import { Callout } from '@/components/ui/Callout';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { LineIcon } from '@/components/icons/LineIcon';
import type { CardAction } from '@/components/ui/CardActionBar';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { withBranchReturn } from '@/features/branches/branch-link';
import { useBranchEmptyCopy } from '@/features/branches/components/BranchFilterField';
import { useScreenBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDomainLabel } from '@/i18n/domain';
import { useListParam, useListParamChange } from '@/navigation/list-params';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_REGISTRATION_SOURCE } from '@/navigation/vehicle-registration-source';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { useCardGrid, useResponsive } from '@/theme/use-responsive';
import { MEDIA_LIST_TUNING } from '@/theme/list-tuning';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, iconSize, space } from '@/theme/tokens';
import { scrollThrottle } from '@/theme/motion';
import { AccountTrackNotice } from '@/features/account/components/AccountTrackNotice';
import { VehicleCard } from './components/VehicleCard';
import { useFleetSummary, useInfiniteVehicles, useVehicleAlerts, useVehicleStats } from './hooks/use-vehicles';
import { useVehicleAlertView } from './hooks/use-vehicle-alert-view';
import type { VehicleAlertGroup, VehicleListItem, VehicleSort } from './api';
import { DEFAULT_VEHICLE_SORT, VEHICLE_SORT_VALUES, useVehicleSortLabel } from './vehicle-sort';

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
/**
 * `shop` = gian hàng tuyến gói (đủ năm ô lọc, chi nhánh, hai lối thêm xe, Xem · Sửa · Lịch).
 * `owner` = chủ xe tuyến hoa hồng — Owner Lite: lọc dịch vụ + vận hành + sắp xếp, "Thêm xe" mở luồng
 * đăng xe của chủ xe, "Quản lý xe" mở không gian riêng của xe (`account.*`). Một màn cho hai
 * tuyến, đúng web `VehiclesListView scope` (Figma Partner 03/11/2026).
 */
export type VehicleListScope = 'shop' | 'owner';

export function VehicleListScreen({ scope = 'shop' }: { scope?: VehicleListScope } = {}) {
  const isOwner = scope === 'owner';
  const tAccount = useTranslations('Account.vehicles');
  const tPermission = useTranslations('ManageCommon.permission');
  const colors = useColors();
  const t = useTranslations('Vehicles.list');
  const sortLabel = useVehicleSortLabel();
  const tLabels = useTranslations('Common.labels');
  const tActions = useTranslations('Common.actions');
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();
  const domainLabel = useDomainLabel();

  const [vehicleType, setVehicleType] = useState<string>(ALL);
  const [serviceType, setServiceType] = useState<string>(ALL);
  // Bộ lọc KHỞI TẠO từ tham số route — thẻ Tổng quan / panel Chợ, như URL web.
  const routeOperation = useListParam('operationStatus', VEHICLE_OPERATION_STATUS_VALUES);
  const routePublic = useListParam('publicStatus', VEHICLE_PUBLIC_STATUS_VALUES);
  const [operationStatus, setOperationStatus] = useState<string>(routeOperation ?? ALL);
  const [publicStatus, setPublicStatus] = useState<string>(routePublic ?? ALL);
  useListParamChange('operationStatus', routeOperation, setOperationStatus);
  useListParamChange('publicStatus', routePublic, setPublicStatus);
  const [sort, setSort] = useState<VehicleSort>(DEFAULT_VEHICLE_SORT);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  /* Ô "Chi nhánh" của màn, sống trên tham số route (ADR 0052) — dải chỉ số đi CÙNG chi nhánh. */
  const { branchId, filter: branchFilter } = useScreenBranchFilter(undefined, !isOwner);
  const branchEmpty = useBranchEmptyCopy(branchFilter, branchId);

  /** Lối thêm xe — gian hàng: wizard đầy đủ; chủ xe tuyến hoa hồng: luồng đăng xe (web `goCreate`). */
  const goCreate = useCallback(() => {
    if (isOwner) {
      navigateOnce(ROUTES.listYourVehicle.register(VEHICLE_REGISTRATION_SOURCE.ACCOUNT));
      return;
    }
    // Chi nhánh đang lọc là GỢI Ý cho form (ADR 0052 điều 6) — form điền sẵn, đổi được.
    navigateOnce(withBranchReturn(ROUTES.manage.vehicleNew(), branchId));
  }, [branchId, isOwner, navigateOnce]);

  const { gutter } = useResponsive();
  const fleet = useFleetSummary(!isOwner, branchId);
  /* Figma/Đơn thuê: dải tab trạng thái (Tất cả · Sẵn sàng · Đang thuê…) - số đếm lấy từ tổng hợp đội xe. */
  const statusTabs = useMemo<ChipTabItem<string>[]>(
    () => [
      { value: ALL, label: tLabels('all'), count: fleet.data?.total },
      ...VEHICLE_OPERATION_STATUS_VALUES.map((value) => ({
        value,
        label: domainLabel('vehicleOperationStatus', value),
        count:
          value === 'available'
            ? fleet.data?.available
            : value === 'renting'
              ? fleet.data?.renting
              : undefined,
      })),
    ],
    [domainLabel, fleet.data, tLabels],
  );
  const serviceTabs = useMemo<ChipTabItem<string>[]>(
    () => [
      { value: ALL, label: tLabels('all') },
      ...SERVICE_TYPE_VALUES.map((value) => ({ value, label: domainLabel('serviceType', value) })),
    ],
    [domainLabel, tLabels],
  );

  const query = useInfiniteVehicles({
    ...(branchId && !isOwner ? { branchId } : {}),
    ...(vehicleType === ALL || isOwner ? {} : { vehicleType }),
    ...(serviceType === ALL ? {} : { serviceType }),
    ...(operationStatus === ALL ? {} : { operationStatus }),
    // Chủ xe tuyến hoa hồng không có ô này, nhưng tham số đến từ route vẫn lọc (web: chip gỡ được).
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
   * Cảnh báo đã LỌC theo năng lực — đúng `alertsOf` của `VehicleCardGrid` web: cảnh báo bảo
   * dưỡng chỉ hiện khi người đọc có module bảo dưỡng (quyền ∧ cờ gói). Màn này là cổng quản lý.
   */
  const alertView = useVehicleAlertView(false);
  const alertsById = useMemo(() => {
    const map = new Map<string, VehicleAlertGroup>();
    alerts.byId.forEach((group, id) =>
      map.set(id, { ...group, alerts: alertView(id, group.alerts) }),
    );
    return map;
  }, [alertView, alerts.byId]);

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

    // Đang lọc trạng thái duyệt (từ route) thì chủ xe vẫn thấy ô đó để gỡ - web hiện chip gỡ được.
    const ownerHidden = new Set(
      publicStatus === ALL ? ['vehicleType', 'publicStatus'] : ['vehicleType'],
    );
    const list: FilterGroup[] = [
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
        resetValue: DEFAULT_VEHICLE_SORT,
        // Figma "_Filter Modal": "Sắp xếp: Mới nhất" - chiều luôn có giá trị.
        display: 'prefixed',
        options: VEHICLE_SORT_VALUES.map((value) => ({ value, label: sortLabel(value) })),
      },
    ];
    // Tuyến hoa hồng: dịch vụ + vận hành + sắp xếp — như web `VehicleFiltersBar scope="owner"`.
    return isOwner ? list.filter((group) => !('key' in group) || !ownerHidden.has(group.key)) : list;
  }, [
    isOwner,
    t,
    tLabels,
    domainLabel,
    sortLabel,
    vehicleType,
    serviceType,
    operationStatus,
    publicStatus,
    sort,
  ]);

  const openVehicle = useCallback(
    (vehicle: VehicleListItem) =>
      navigateOnce(
        isOwner
          ? ROUTES.account.vehicleDetail(vehicle.id)
          : withBranchReturn(ROUTES.manage.vehicleDetail(vehicle.id), branchId),
      ),
    [navigateOnce, branchId, isOwner],
  );

  /* Tuyến hoa hồng "Quản lý xe" mở KHÔNG GIAN của xe; gian hàng "Sửa" mở trang sửa xe — như web. */
  const editVehicle = useCallback(
    (vehicle: VehicleListItem) =>
      navigateOnce(
        isOwner
          ? ROUTES.account.vehicleManage(vehicle.id)
          : ROUTES.manage.vehicleEdit(vehicle.id),
      ),
    [navigateOnce, isOwner],
  );

  /*
   * "Lịch" là nút THỨ BA của web, và nó dẫn tới màn lịch ĐÃ LỌC SẴN theo chiếc xe vừa chạm —
   * cùng cách `vehicleSchedulePath` bên web dựng đường đi (`?q=<biển số || tên>`).
   *
   * Ưu tiên biển số vì nó phân biệt tốt hơn tên xe trùng lặp; không có biển thì rơi về tên.
   */
  const openSchedule = useCallback(
    (vehicle: VehicleListItem) =>
      navigateOnce(
        vehicleSchedulePath(vehicle, { back: true, ...(isOwner ? {} : { branchId }) }),
      ),
    [navigateOnce, isOwner, branchId],
  );

  const canEdit = permissions.has(PERMISSION.VEHICLE_UPDATE);

  /*
   * Ba thao tác của web ở CỔNG QUẢN LÝ (`useVehicleRowActions`): Lịch · Sửa · Xem — cùng thứ
   * tự, cùng luật ẩn. Khu tài khoản dựng bộ KHÁC (`AccountVehiclesScreen`), đúng như web cho hai
   * màn đó hai hàm `rowActions` riêng.
   *
   * "Xem" thay luôn vai mũi tên `>`: giữ cả hai là ba lối vào cùng một màn (thân thẻ, mũi tên,
   * nút) trên một bề mặt chỉ rộng 390pt.
   */
  const rowActions = useCallback(
    (vehicle: VehicleListItem): readonly CardAction[] => [
      {
        key: 'schedule',
        label: t('actions.schedule'),
        icon: 'calendar-outline',
        onPress: () => openSchedule(vehicle),
      },
      /*
        Cả hai tuyến cùng gác `VEHICLE_UPDATE` như web `useVehicleRowActions` (`hidden: !canEdit`);
        chỉ khác NHÃN: chủ xe tuyến hoa hồng "Quản lý xe", gian hàng "Chỉnh sửa".
      */
      ...(canEdit
        ? [
            isOwner
              ? {
                  key: 'manage',
                  label: tAccount('manage'),
                  icon: 'construct-outline' as const,
                  onPress: () => editVehicle(vehicle),
                }
              : {
                  key: 'edit',
                  label: t('actions.editFull'),
                  icon: 'create-outline' as const,
                  onPress: () => editVehicle(vehicle),
                },
          ]
        : []),
      {
        key: 'view',
        label: t('actions.detail'),
        icon: 'eye-outline',
        onPress: () => openVehicle(vehicle),
      },
    ],
    [t, tAccount, isOwner, canEdit, openVehicle, editVehicle, openSchedule],
  );

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
        actions={rowActions}
        stats={stats.byId.get(item.id)}
        statsLoading={stats.pendingIds.has(item.id)}
        statsFailed={stats.isError}
        alerts={alertsById.get(item.id)}
        alertsLoading={alerts.pendingIds.has(item.id)}
        alertsFailed={alerts.isError}
      />
    ),
    [
      openVehicle,
      rowActions,
      stats.byId,
      stats.pendingIds,
      stats.isError,
      alertsById,
      alerts.pendingIds,
      alerts.isError,
    ],
  );
  // iPad: thẻ xếp lưới 2 cột trong cột nội dung; điện thoại giữ 1 cột.
  const grid = useCardGrid(renderItem, { listKey: 'vehicles' });

  const filtered =
    (!isOwner && vehicleType !== ALL) ||
    serviceType !== ALL ||
    operationStatus !== ALL ||
    publicStatus !== ALL ||
    debouncedSearch.trim().length > 0;
  // Web `VehicleCardGrid` rỗng-do-lọc: "Xoá bộ lọc" gỡ mọi ô lọc + tìm kiếm (giữ sắp xếp).
  const clearFilters = () => {
    setVehicleType(ALL);
    setServiceType(ALL);
    setOperationStatus(ALL);
    setPublicStatus(ALL);
    setSearch('');
  };

  // Thiếu quyền là 403 của CHÍNH màn này — hiện trạng thái lỗi của nó, không đá về đăng nhập.
  if (!permissions.isLoading && !permissions.has(PERMISSION.VEHICLE_VIEW)) {
    return (
      <>
        <ManagePageHeader title={t('page.title')} />
        <Screen scrollReveal edges={['left', 'right', 'bottom']} scroll={false}>
          {isOwner ? (
            <ScreenMessage
              icon="lock-closed-outline"
              title={tPermission('deniedTitle')}
              description={`${tPermission('deniedBody')}\n${tPermission('requires')} ${PERMISSION.VEHICLE_VIEW}`}
              actionLabel={tPermission('backHome')}
              onAction={() => navigateOnce(ROUTES.account.home())}
            />
          ) : (
            <ScreenMessage icon="lock-closed-outline" title={t('page.title')} />
          )}
        </Screen>
      </>
    );
  }

  return (
    <>
      {/*
        Thanh trang v2 (Figma "Header MB" `24175:60019`): tiêu đề + nút "+" Thêm xe (cổng
        `vehicles.create`). Nút tài liệu của Figma bỏ - web không có (người dùng chốt 16/11/2026).
      */}
      <ManagePageHeader
        title={t('page.title')}
        actions={
          permissions.has(PERMISSION.VEHICLE_CREATE) ? (
            /*
              MỘT lối thêm xe (web 03/11/2026, ledger §3.5 #9): gian hàng → wizard đầy đủ, chủ xe
              tuyến hoa hồng → luồng đăng xe của chủ xe.
            */
            <IconSquareButton label={t('page.addNewVehicle')} tone="brand" onPress={goCreate}>
              <LineIcon name="plus" size={iconSize.lg} color={colors.onPrimary} />
            </IconSquareButton>
          ) : null
        }
      />
      <Screen scrollReveal edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        {/*
          Figma "Vehice / List" MB: chỉ ô tìm + nút "Lọc" - dải chỉ số đội xe, chip vận hành và dòng
          "Hiển thị x-y" đã bỏ (người dùng chốt 16/11/2026); mọi chiều lọc nằm trong tấm Lọc dạng lưới.
        */}
        <ManageListShell
          variant="page"
          filterLayout="grid"
          tabs={
            <ChipTabs
              label={t('page.title')}
              items={isOwner ? serviceTabs : statusTabs}
              value={isOwner ? serviceType : operationStatus}
              onSelect={isOwner ? setServiceType : setOperationStatus}
              gutter={gutter}
            />
          }
          title={t('page.title')}
          {...(isOwner ? {} : { branchFilter: { filter: branchFilter, value: branchId } })}
          searchValue={search}
          searchLabel={t('filters.search')}
          searchPlaceholder={t('filters.searchPlaceholder')}
          onSearchChange={changeSearch}
          hasRows={items.length > 0}
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
                branchEmpty && !filtered ? (
                  <ScreenMessage
                    icon="location-outline"
                    title={branchEmpty.title}
                    description={branchEmpty.hint}
                  />
                ) : filtered ? (
                  <ScreenMessage
                    icon="search-outline"
                    title={t('grid.noResultsTitle')}
                    description={t('grid.noResultsBody')}
                    actionLabel={tActions('clear')}
                    onAction={clearFilters}
                  />
                ) : (
                  /*
                    Màn rỗng giữ nút "Thêm xe đầu tiên" như web (ledger §3.5 #1): nút ở tiêu đề
                    chỉ là biểu tượng, còn lời mời ở đây nói đúng hoàn cảnh.
                  */
                  <ScreenMessage
                    icon="car-outline"
                    title={t('grid.emptyTitle')}
                    description={t('grid.emptyBody')}
                    {...(permissions.has(PERMISSION.VEHICLE_CREATE)
                      ? { actionLabel: t('page.addFirstVehicle'), actionIcon: 'add', onAction: goCreate }
                      : {})}
                  />
                ),
              )
            ) : (
              <Animated.FlatList
                key={grid.key}
                data={items}
                keyExtractor={vehicleKeyExtractor}
                {...grid.listProps}
                /*
                  Đầu danh sách, cả hai tuyến — như `VehicleCardGrid` web: cảnh báo khi tải cảnh báo/KM
                  hỏng MỘT PHẦN (kèm thử lại). Tuyến hoa hồng mở đầu bằng dải tuyến Owner Lite.
                */
                ListHeaderComponent={
                  isOwner || alerts.isError ? (
                  <YStack gap={space.sm} pb={space.sm}>
                    {isOwner ? <AccountTrackNotice /> : null}
                    {alerts.isError ? (
                      <Callout tone="warning" title={t('grid.alertsErrorTitle')}>
                        <YStack gap={space.sm}>
                          <Text col={colors.textMuted} fos={fontSize.bodySm}>
                            {t('grid.alertsErrorBody')}
                          </Text>
                          <Button
                            label={tActions('retry')}
                            icon="refresh-outline"
                            variant="ghost"
                            size="sm"
                            onPress={() => void alerts.refetch()}
                          />
                        </YStack>
                      </Callout>
                    ) : null}
                  </YStack>
                  ) : null
                }
                contentContainerStyle={contentContainerStyle}
                onScroll={onScroll}
                scrollEventThrottle={scrollThrottle.frame}
                {...MEDIA_LIST_TUNING}
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
  const colors = useColors();
  if (error) {
    return (
      <YStack py={layout.section} ai="center">
        <Button
          label={retryLabel}
          icon="refresh-outline"
          variant="outline"
          size="sm"
          block={false}
          align="center"
          onPress={onRetry}
        />
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
