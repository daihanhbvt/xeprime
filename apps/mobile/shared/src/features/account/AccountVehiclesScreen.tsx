import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION, SERVICE_TYPE_VALUES, VEHICLE_OPERATION_STATUS_VALUES } from '@xeprime/types';
import { FILTER_ALL } from '@/constants/filters';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import { IconButton } from '@/components/ui/IconButton';
import { scrollThrottle } from '@/theme/motion';
import { AccountTrackNotice } from './components/AccountTrackNotice';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { SheetActionRow } from '@/features/calendar/components/SheetActionRow';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { FleetSummaryBar } from '@/features/vehicles/components/FleetSummaryBar';
import { FleetVehicleCardSkeleton } from '@/components/ui/Skeleton';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { Callout } from '@/components/ui/Callout';
import type { CardAction } from '@/components/ui/CardActionBar';
import { VehicleCard } from '@/features/vehicles/components/VehicleCard';
import {
  useInfiniteVehicles,
  useVehicleAlerts,
  useVehicleStats,
} from '@/features/vehicles/hooks/use-vehicles';
import type { VehicleListItem, VehicleSort } from '@/features/vehicles/api';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_REGISTRATION_SOURCE } from '@/navigation/vehicle-registration-source';
import { layout } from '@/theme/layout';
import { MEDIA_LIST_TUNING } from '@/theme/list-tuning';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import {
  DEFAULT_VEHICLE_SORT,
  VEHICLE_SORT_VALUES,
  useVehicleSortLabel,
} from '@/features/vehicles/vehicle-sort';

/** Sentinel "mọi giá trị" của giao diện — không endpoint nào nhận `operationStatus=all`. */
const ALL = FILTER_ALL;

const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 350;

function vehicleKeyExtractor(vehicle: VehicleListItem): string {
  return vehicle.id;
}

/**
 * Danh sách xe của CHỦ XE trong khu tài khoản — bản native của `AccountVehiclesView`.
 *
 * Cùng API, cùng hook và cùng thẻ xe với đội xe ở cổng quản lý (`VehicleListScreen`); khác đúng
 * những gì web khác:
 *  - **bộ lọc ít hơn** — tìm kiếm + trạng thái vận hành (thanh lọc), dịch vụ (dải chip riêng),
 *    sắp xếp (mặc định "Mới nhất"); chip bộ lọc đang bật + "Xoá bộ lọc"; dải chỉ số đội xe
 *    (`GET /vehicles/fleet-summary`) — đúng `AccountVehiclesView` (29/09/2026);
 *  - **hai thẻ dẫn đường** tới Cẩm nang và Hợp đồng & Chứng từ, ngay trên bộ lọc;
 *  - **vỏ của khu TÀI KHOẢN** — thanh trên có nút lui về menu tài khoản, không phải `ManageHeader`
 *    với nút mở drawer quản lý.
 *
 * Chi tiết xe và hub sửa xe KHÔNG được nhân bản: chúng là màn chen ngang nằm ngoài bộ tab quản lý
 * (`app/manage/vehicles/[id]/…`), nên mở từ đây vẫn lui về đúng danh sách này. Dựng bản thứ hai
 * của chúng là hai bộ luật giá/giấy tờ/bảo dưỡng sẽ trôi khỏi nhau.
 *
 * Được `OwnerGate` bọc ở route: người không phải chủ gian hàng không tới được đây, nên không có
 * request tenant nào bay đi vô ích.
 */
export function AccountVehiclesScreen({
  // Giữ chữ ký cũ cho nơi gọi; màn này chỉ còn sống trong khu quản lý của app Partner (ADR 0053).
  shell: _shell = 'manage',
}: {
  shell?: 'account' | 'manage';
} = {}) {
  const colors = useColors();
  const t = useTranslations('Account.vehicles');
  const tVehicles = useTranslations('Vehicles.list');
  const tLabels = useTranslations('Common.labels');
  const tActions = useTranslations('Common.actions');
  const tPermission = useTranslations('ManageCommon.permission');
  const tSort = useTranslations('Vehicles.list.sort');
  const sortLabel = useVehicleSortLabel();
  const router = useRouter();
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();

  const [serviceType, setServiceType] = useState<string>(ALL);
  const [operationStatus, setOperationStatus] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [sort, setSort] = useState<VehicleSort>(DEFAULT_VEHICLE_SORT);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const q = debouncedSearch.trim();

  const query = useInfiniteVehicles({
    ...(serviceType === ALL ? {} : { serviceType }),
    ...(operationStatus === ALL ? {} : { operationStatus }),
    ...(q ? { q } : {}),
    sort,
  });

  const { items } = query;
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const stats = useVehicleStats(ids);
  const alerts = useVehicleAlerts(ids);

  const canCreate = permissions.has(PERMISSION.VEHICLE_CREATE);
  /* Sắp xếp KHÔNG phải bộ lọc — web để nó ở slot `actions`, ngoài phép đếm bộ lọc. */
  const filtered = serviceType !== ALL || operationStatus !== ALL || search.trim() !== '';

  const openVehicle = useCallback(
    (vehicle: VehicleListItem) => router.push(ROUTES.account.vehicleDetail(vehicle.id)),
    [router],
  );

  // MỘT đích cho cả nút đầu danh sách lẫn nút của trạng thái rỗng — hai bản riêng là hai chỗ có
  // thể trôi khỏi nhau khi nguồn đăng ký đổi.
  const openRegister = useCallback(() => {
    router.push(ROUTES.listYourVehicle.register(VEHICLE_REGISTRATION_SOURCE.ACCOUNT));
  }, [router]);

  const clearFilters = useCallback(() => {
    setServiceType(ALL);
    setOperationStatus(ALL);
    setSearch('');
  }, []);

  /**
   * ĐÚNG HAI thao tác, đúng thứ tự web đặt ở màn này (`AccountVehiclesView.rowActions`):
   * **Quản lý xe** trước, rồi **Xem chi tiết**.
   *
   * Đây là bộ RIÊNG của khu tài khoản, không phải bộ Xem · Sửa · Lịch của cổng quản lý. Web tách
   * hai bộ vì hai màn trả lời hai câu hỏi khác nhau: ở cổng quản lý người ta đang vận hành đội
   * xe, còn ở đây chủ xe vào để mở KHÔNG GIAN QUẢN LÝ của một chiếc — 13 mục cấu hình dịch vụ,
   * bàn giao, phụ phí. Nhãn "Sửa" dẫn tới cùng đường đó là nói sai việc nó làm.
   *
   * Không gác theo `VEHICLE_UPDATE`: web không gác, và bên trong không gian quản lý mỗi mục đã
   * tự kiểm quyền của chính nó.
   */
  const rowActions = useCallback(
    (vehicle: VehicleListItem): readonly CardAction[] => [
      {
        key: 'manage',
        label: t('manage'),
        icon: 'construct-outline',
        onPress: () => router.push(ROUTES.account.vehicleManage(vehicle.id)),
      },
      {
        key: 'view',
        label: t('viewDetail'),
        icon: 'eye-outline',
        onPress: () => openVehicle(vehicle),
      },
    ],
    [t, router, openVehicle],
  );

  const renderItem = useCallback<ListRenderItem<VehicleListItem>>(
    ({ item }) => (
      <VehicleCard
        vehicle={item}
        onPress={openVehicle}
        actions={rowActions}
        stats={stats.byId.get(item.id)}
        statsLoading={stats.pendingIds.has(item.id)}
        statsFailed={stats.isError}
        alerts={alerts.byId.get(item.id)}
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
      alerts.byId,
      alerts.pendingIds,
      alerts.isError,
    ],
  );

  const serviceOptions = useMemo(
    () => [
      { value: ALL, label: tLabels('all') },
      ...SERVICE_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('serviceType', value),
      })),
    ],
    [tLabels, domainLabel],
  );

  const statusOptions = useMemo(
    () => [
      { value: ALL, label: t('statusAll') },
      ...VEHICLE_OPERATION_STATUS_VALUES.map((value) => ({
        value,
        label: domainLabel('vehicleOperationStatus', value),
      })),
    ],
    [t, domainLabel],
  );

  const sortOptions = useMemo(
    () => VEHICLE_SORT_VALUES.map((value) => ({ value, label: sortLabel(value) })),
    [sortLabel],
  );

  /**
   * Bộ lọc dùng CHUNG khung của mọi danh sách khu quản lý (`ManageListShell` + tấm trượt lọc):
   * ô tìm kiếm, nút "Bộ lọc" có đếm số bộ lọc đang bật, và tấm trượt gom các chiều lọc + sắp xếp —
   * cùng cách danh sách xe của gian hàng tuyến gói làm. Ba chiều theo đúng web
   * `AccountVehiclesView`: dịch vụ, trạng thái vận hành, sắp xếp.
   */
  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'serviceType',
        label: t('serviceFilterLabel'),
        value: serviceType,
        resetValue: ALL,
        options: serviceOptions,
      },
      {
        key: 'operationStatus',
        label: t('statusFilterLabel'),
        value: operationStatus,
        resetValue: ALL,
        options: statusOptions,
      },
      {
        key: 'sort',
        label: tSort('label'),
        value: sort,
        resetValue: DEFAULT_VEHICLE_SORT,
        options: sortOptions,
      },
    ],
    [t, tSort, serviceType, operationStatus, sort, serviceOptions, statusOptions, sortOptions],
  );

  const changeFilter = useCallback((groupKey: string, value: string) => {
    if (groupKey === 'serviceType') setServiceType(value);
    else if (groupKey === 'operationStatus') setOperationStatus(value);
    else setSort(value as VehicleSort);
  }, []);

  // Thiếu quyền là 403 của CHÍNH màn này — hiện trạng thái của nó, không đá về đăng nhập.
  if (!permissions.isLoading && !permissions.has(PERMISSION.VEHICLE_VIEW)) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          {/*
            Cùng nội dung `PermissionState` của web: nói KHÔNG CÓ QUYỀN, nêu đích danh quyền còn
            thiếu, và một lối về.
          */}
          <ScreenMessage
            icon="lock-closed-outline"
            title={tPermission('deniedTitle')}
            description={`${tPermission('deniedBody')}\n${tPermission('requires')} ${PERMISSION.VEHICLE_VIEW}`}
            actionLabel={tPermission('backHome')}
            onAction={() => router.replace(ROUTES.account.home())}
          />
        </Screen>
      </>
    );
  }

  /**
   * Đầu danh sách (cuộn cùng các thẻ): dải tuyến, hai thẻ dẫn đường, cảnh báo tải hỏng một phần
   * và dòng đếm. Tìm kiếm + bộ lọc + chỉ số đội xe nằm ở khối đầu của `ManageListShell`.
   */
  const listHeader = (
    <YStack gap={space.md} pb={space.xs}>
      {/* Trang chủ Owner Lite mở đầu bằng dải tuyến như web `OwnerLiteHome`. */}
      <AccountTrackNotice />

      {/* Cảnh báo/KM tải hỏng là hỏng MỘT PHẦN — web nói ra ở đầu lưới. */}
      {alerts.isError ? (
        <Callout tone="warning" title={tVehicles('grid.alertsErrorTitle')}>
          <YStack gap={space.sm}>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {tVehicles('grid.alertsErrorBody')}
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

      {items.length > 0 ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {tVehicles('grid.showing', { from: 1, to: items.length, total: query.total })}
        </Text>
      ) : null}
    </YStack>
  );

  /**
   * Khung xương, lỗi và rỗng nằm DƯỚI phần đầu danh sách. "Đang lọc mà rỗng" và "chưa có xe nào"
   * là hai câu chuyện: một cái lối ra là gỡ bộ lọc, cái kia là thêm xe đầu tiên.
   */
  const stateBody: ReactNode = query.isInitialLoading ? (
    <YStack gap={layout.inline}>
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <FleetVehicleCardSkeleton key={i} />
      ))}
    </YStack>
  ) : query.initialError ? (
    <ScreenError
      error={query.initialError}
      title={tVehicles('grid.loadErrorTitle')}
      onRetry={query.retry}
    />
  ) : (
    <ScreenMessage
      icon={filtered ? 'search-outline' : 'car-outline'}
      title={filtered ? tVehicles('grid.noResultsTitle') : tVehicles('grid.emptyTitle')}
      description={filtered ? tVehicles('grid.noResultsBody') : tVehicles('grid.emptyBody')}
      {...(filtered
        ? {
            actionLabel: tActions('clear'),
            actionIcon: 'close-outline' as const,
            onAction: clearFilters,
          }
        : canCreate
          ? { actionLabel: t('addVehicle'), actionIcon: 'add' as const, onAction: openRegister }
          : {})}
    />
  );

  return (
    <>
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          title={t('title')}
          {...(query.total > 0
            ? { total: tVehicles('summary.vehicleCount', { count: query.total }) }
            : {})}
          action={
            <XStack gap={space.xs}>
              {canCreate ? (
                <IconButton
                  icon="add"
                  label={t('addVehicle')}
                  tone="primary"
                  onPress={openRegister}
                />
              ) : null}
              {/* Cẩm nang + Hợp đồng gom vào một nút — trước là hai thẻ chiếm đầu danh sách. */}
              <IconButton
                icon="book-outline"
                label={t('tips.menuLabel')}
                onPress={() => setResourcesOpen(true)}
              />
            </XStack>
          }
          summary={<FleetSummaryBar enabled />}
          searchValue={search}
          searchLabel={t('searchLabel')}
          searchPlaceholder={t('searchPlaceholder')}
          onSearchChange={setSearch}
          groups={groups}
          onFilterChange={changeFilter}
          hasRows={items.length > 0}
        >
          {({ onScroll, headerHeight, contentContainerStyle }) =>
            items.length === 0 ? (
              <ManageStateScroll
                onScroll={onScroll}
                headerHeight={headerHeight}
                refreshing={query.isRefreshing}
                onRefresh={query.retry}
              >
                <YStack px={layout.screenX} gap={space.md}>
                  {listHeader}
                  {stateBody}
                </YStack>
              </ManageStateScroll>
            ) : (
              <Animated.FlatList
                data={items}
                keyExtractor={vehicleKeyExtractor}
                renderItem={renderItem}
                contentContainerStyle={contentContainerStyle}
                ListHeaderComponent={listHeader}
                onScroll={onScroll}
                scrollEventThrottle={scrollThrottle.frame}
                {...MEDIA_LIST_TUNING}
                onEndReached={query.fetchNextPage}
                ListFooterComponent={
                  query.appendError != null ? (
                    <Button
                      label={tActions('retry')}
                      icon="refresh-outline"
                      variant="ghost"
                      size="sm"
                      onPress={query.fetchNextPage}
                    />
                  ) : null
                }
                refreshControl={
                  <RefreshControl
                    refreshing={query.isRefreshing}
                    onRefresh={query.retry}
                    tintColor={colors.primaryActive}
                    progressViewOffset={headerHeight}
                  />
                }
              />
            )
          }
        </ManageListShell>
      </Screen>

      <BottomSheet
        open={resourcesOpen}
        onClose={() => setResourcesOpen(false)}
        title={t('tips.menuLabel')}
      >
        <YStack gap={space.xs}>
          <SheetActionRow
            tone="primary"
            icon="book-outline"
            label={t('tips.guideTitle')}
            hint={t('tips.guideBody')}
            onPress={() => {
              setResourcesOpen(false);
              router.push(ROUTES.account.hostGuide());
            }}
          />
          <SheetActionRow
            tone="primary"
            icon="documents-outline"
            label={t('tips.documentsTitle')}
            hint={t('tips.documentsBody')}
            onPress={() => {
              setResourcesOpen(false);
              router.push(ROUTES.account.contractsDocuments());
            }}
          />
        </YStack>
      </BottomSheet>
    </>
  );
}
