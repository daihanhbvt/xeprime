import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DRIVER_STATUS,
  DRIVER_STATUS_VALUES,
  PERMISSION,
  PLAN_FEATURE,
  type DriverStatus,
} from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { FeatureReadOnlyNotice } from '@/components/feedback/FeatureReadOnlyNotice';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { IconButton } from '@/components/ui/IconButton';
import { ActionCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { scrollThrottle } from '@/theme/motion';
import { colors } from '@/theme/tokens';
import type { Driver } from './api';
import { DriverCard } from './components/DriverCard';
import { DriverFormSheet } from './components/DriverFormSheet';
import { useDeleteDriver, useDriversPage, useUpdateDriver } from './hooks/use-drivers';

const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 300;

/** Sentinel "mọi trạng thái" — của giao diện, không xuống API. */
const STATUS_ALL = 'all';

// Ở module scope, không inline: FlatList coi `keyExtractor` mới là prop đổi và dựng lại cây con.
const keyOf = (driver: Driver) => driver.id;

/**
 * Tài xế của gian hàng (SHP-06) — bản native của `/manage/drivers`.
 *
 * Cùng nguồn dữ liệu với bộ chọn "gán tài xế" ở màn đơn thuê (`drivers.assignable`), nên mọi
 * thay đổi ở đây làm mới luôn bộ chọn đó: tài xế vừa tạo xuất hiện được ngay, còn người vừa bị
 * ngừng thì biến khỏi danh sách gán. Khả dụng theo khung giờ do SERVER chấm — client không tự
 * tính lịch bận.
 *
 * Tài xế là tính năng của GÓI (ADR 0027): hết hạn thì vẫn xem lại hồ sơ, không thêm/sửa được.
 * Lớp chặn thật là `@RequiresFeature(DRIVERS)` ở backend.
 */
export function DriverListScreen() {
  const t = useTranslations('Drivers');
  const tActions = useTranslations('Common.actions');
  const tLabels = useTranslations('Common.labels');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();
  const driversFeature = useFeature(PLAN_FEATURE.DRIVERS);

  const canView = permissions.has(PERMISSION.DRIVER_VIEW);
  /*
   * QUYỀN và GÓI là hai trục độc lập (ADR 0027 điều 2): `canManage` chỉ quyết định các thao tác
   * có HIỆN không; gói hết hạn không ẩn chúng, chỉ khoá lại kèm dòng lý do (điều 3 — read_only,
   * không phải hidden) — xem `FeatureReadOnlyNotice` + `DriverCard`'s prop `readOnly`.
   */
  const canManage = permissions.has(PERMISSION.DRIVER_MANAGE);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(STATUS_ALL);
  const [page, setPage] = useState(FIRST_PAGE);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [deleting, setDeleting] = useState<Driver | null>(null);
  const [deactivating, setDeactivating] = useState<Driver | null>(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const trimmedSearch = debouncedSearch.trim();

  const query = useDriversPage(
    {
      ...(trimmedSearch ? { q: trimmedSearch } : {}),
      ...(status === STATUS_ALL ? {} : { status }),
      page,
    },
    canView,
  );
  const update = useUpdateDriver();
  const remove = useDeleteDriver();

  const items = query.data?.items ?? [];
  const meta = query.data?.meta;

  useClampedPage(meta, setPage);

  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);

  const changeFilter = useCallback((_groupKey: string, value: string) => {
    setStatus(value);
    setPage(FIRST_PAGE);
  }, []);

  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'status',
        label: t('filters.status'),
        value: status,
        resetValue: STATUS_ALL,
        options: [
          { value: STATUS_ALL, label: t('filters.allStatuses') },
          ...DRIVER_STATUS_VALUES.map((value) => ({
            value,
            label: domainLabel('driverStatus', value),
          })),
        ],
      },
    ],
    [domainLabel, status, t],
  );

  const setStatusOf = useCallback(
    (driver: Driver, next: DriverStatus) => {
      update.mutate(
        { id: driver.id, body: { status: next } },
        {
          onSuccess: () =>
            toast.showSuccess(
              next === DRIVER_STATUS.ACTIVE ? t('toast.activated') : t('toast.deactivated'),
            ),
          onError: (err) => toast.showError(errorMessage(err)),
        },
      );
    },
    [errorMessage, t, toast, update],
  );

  /*
   * NGỪNG hoạt động cần xác nhận (tài xế sẽ không gán được vào đơn mới), BẬT LẠI thì không —
   * đúng cặp `confirm` mà web đặt cho hai nhánh của cùng một nút.
   */
  const toggleStatus = useCallback(
    (driver: Driver) => {
      if (driver.status === DRIVER_STATUS.ACTIVE) setDeactivating(driver);
      else setStatusOf(driver, DRIVER_STATUS.ACTIVE);
    },
    [setStatusOf],
  );

  const openEdit = useCallback((driver: Driver) => {
    setEditing(driver);
    setFormOpen(true);
  }, []);

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const pendingId = update.isPending
    ? update.variables?.id
    : remove.isPending
      ? remove.variables
      : null;

  const renderItem = useCallback<ListRenderItem<Driver>>(
    ({ item }) => (
      <DriverCard
        driver={item}
        canManage={canManage}
        readOnly={!driversFeature.canWrite}
        pending={pendingId === item.id}
        onEdit={openEdit}
        onToggleStatus={toggleStatus}
        onDelete={setDeleting}
      />
    ),
    [canManage, driversFeature.canWrite, openEdit, pendingId, toggleStatus],
  );

  const filtered = status !== STATUS_ALL || trimmedSearch.length > 0;

  if (!permissions.isLoading && !canView) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('page.forbidden.title')}
            description={t('page.forbidden.description')}
          />
        </Screen>
      </>
    );
  }

  const addButton = canManage ? (
    <IconButton
      icon="add"
      label={t('actions.add')}
      tone="primary"
      disabled={!driversFeature.canWrite}
      onPress={openCreate}
    />
  ) : null;

  return (
    <>
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          title={t('page.title')}
          {...(meta === undefined ? {} : { total: t('page.total', { count: meta.total }) })}
          action={addButton}
          summary={<FeatureReadOnlyNotice show={canManage && !driversFeature.canWrite} />}
          searchValue={search}
          searchLabel={t('filters.search')}
          searchPlaceholder={t('filters.searchPlaceholder')}
          onSearchChange={changeSearch}
          groups={groups}
          onFilterChange={changeFilter}
          {...(meta === undefined ? {} : { meta })}
          onPageChange={setPage}
        >
          {({ onScroll, headerHeight, contentContainerStyle, bindList }) => {
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
                    <ActionCardSkeleton key={i} />
                  ))}
                </YStack>,
              )
            ) : query.isError && !query.data ? (
              inStateScroll(
                <ScreenError
                  error={query.error}
                  title={t('page.loadError')}
                  onRetry={() => void query.refetch()}
                />,
              )
            ) : items.length === 0 ? (
              inStateScroll(
                filtered ? (
                  <ScreenMessage
                    icon="search-outline"
                    title={tLabels('none')}
                    actionLabel={tActions('clear')}
                    onAction={() => {
                      setStatus(STATUS_ALL);
                      setSearch('');
                      setPage(FIRST_PAGE);
                    }}
                  />
                ) : (
                  /*
                    KHÔNG có nút "thêm" ở đây: nó đã nằm ở hàng tiêu đề (`ManageListShell action`),
                    và danh sách rỗng thì không có gì để cuộn nên hàng đó đứng nguyên trên màn —
                    hai nút cùng một việc trong cùng một khung hình.
                  */
                  <ScreenMessage
                    icon="id-card-outline"
                    title={t('page.empty')}
                    description={t('page.emptyHint')}
                  />
                ),
              )
            ) : (
              <Animated.FlatList
                ref={bindList}
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

      <DriverFormSheet open={formOpen} driver={editing} onClose={() => setFormOpen(false)} />

      <AlertDialog
        open={deactivating !== null}
        title={t('actions.deactivateConfirm')}
        confirmLabel={t('actions.deactivateOk')}
        cancelLabel={tActions('close')}
        loading={update.isPending}
        onConfirm={() => {
          const driver = deactivating;
          setDeactivating(null);
          if (driver) setStatusOf(driver, DRIVER_STATUS.INACTIVE);
        }}
        onCancel={() => setDeactivating(null)}
      />

      <AlertDialog
        open={deleting !== null}
        title={t('actions.removeConfirm')}
        confirmLabel={tActions('delete')}
        cancelLabel={tActions('close')}
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          const driver = deleting;
          if (!driver) return;
          remove.mutate(driver.id, {
            onSuccess: () => {
              setDeleting(null);
              toast.showSuccess(t('toast.removed'));
            },
            onError: (err) => {
              setDeleting(null);
              toast.showError(errorMessage(err));
            },
          });
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
