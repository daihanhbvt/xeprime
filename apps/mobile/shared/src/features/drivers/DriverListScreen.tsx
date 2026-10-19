import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DRIVER_LINK_STATUS,
  DRIVER_LINK_STATUS_FILTER_ANY,
  DRIVER_LINK_STATUS_VALUES,
  DRIVER_TYPE_VALUES,
  PERMISSION,
} from '@xeprime/types';
import type { InviteDriverValues } from '@xeprime/validators';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { IconButton } from '@/components/ui/IconButton';
import { ActionCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
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
import { DriverCard, type DriverCardIntent } from './components/DriverCard';
import { EditDriverSheet, InviteDriverSheet } from './components/DriverFormSheet';
import {
  useDriversPage,
  useEndDriver,
  useResumeDriver,
  useSuspendDriver,
} from './hooks/use-drivers';

const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Sentinel "không tham số" — của giao diện, không xuống API. Với trạng thái nó nghĩa là "các
 * liên kết CÒN MỞ" (mặc định của server), với loại tài xế là "mọi loại".
 */
const FILTER_ALL = 'all';

type ToastKey = 'toast.suspended' | 'toast.resumed' | 'toast.ended' | 'toast.revoked';

// Ở module scope, không inline: FlatList coi `keyExtractor` mới là prop đổi và dựng lại cây con.
const keyOf = (driver: Driver) => driver.id;

/**
 * Tài xế của bên thuê (ADR 0063) — bản native của `/manage/drivers` (`DriversPage` của web).
 *
 * Mỗi dòng là một LIÊN KẾT với một tài khoản khách: mời bằng SĐT, tài xế đồng ý ở app khách. Mở
 * cho CẢ gian hàng tuyến gói lẫn chủ xe tuyến hoa hồng, không sau cờ gói — chỉ gác bằng quyền.
 * Bên thuê chỉ thấy TRẠNG THÁI bằng lái của tài xế, không ảnh, không số bằng.
 */
export function DriverListScreen() {
  const t = useTranslations('Drivers');
  const tActions = useTranslations('Common.actions');
  const tLabels = useTranslations('Common.labels');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();

  const canView = permissions.has(PERMISSION.DRIVER_VIEW);
  const canManage = permissions.has(PERMISSION.DRIVER_MANAGE);

  const [search, setSearch] = useState('');
  const [linkStatus, setLinkStatus] = useState<string>(FILTER_ALL);
  const [driverType, setDriverType] = useState<string>(FILTER_ALL);
  const [page, setPage] = useState(FIRST_PAGE);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [reinviteFrom, setReinviteFrom] = useState<InviteDriverValues | null>(null);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [suspending, setSuspending] = useState<Driver | null>(null);
  const [ending, setEnding] = useState<Driver | null>(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const trimmedSearch = debouncedSearch.trim();

  const query = useDriversPage(
    {
      ...(trimmedSearch ? { q: trimmedSearch } : {}),
      ...(linkStatus === FILTER_ALL ? {} : { linkStatus }),
      ...(driverType === FILTER_ALL ? {} : { driverType }),
      page,
    },
    canView,
  );
  const suspend = useSuspendDriver();
  const resume = useResumeDriver();
  const end = useEndDriver();

  const items = query.data?.items ?? [];
  const meta = query.data?.meta;

  useClampedPage(meta, setPage);

  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);

  const changeFilter = useCallback((groupKey: string, value: string) => {
    if (groupKey === 'linkStatus') setLinkStatus(value);
    else setDriverType(value);
    setPage(FIRST_PAGE);
  }, []);

  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'linkStatus',
        label: t('filters.status'),
        value: linkStatus,
        resetValue: FILTER_ALL,
        options: [
          { value: FILTER_ALL, label: t('filters.openLinks') },
          { value: DRIVER_LINK_STATUS_FILTER_ANY, label: t('filters.allStatuses') },
          ...DRIVER_LINK_STATUS_VALUES.map((value) => ({
            value,
            label: domainLabel('driverLinkStatus', value),
          })),
        ],
      },
      {
        key: 'driverType',
        label: t('filters.type'),
        value: driverType,
        resetValue: FILTER_ALL,
        options: [
          { value: FILTER_ALL, label: t('filters.allTypes') },
          ...DRIVER_TYPE_VALUES.map((value) => ({
            value,
            label: domainLabel('driverType', value),
          })),
        ],
      },
    ],
    [domainLabel, driverType, linkStatus, t],
  );

  const feedback = useCallback(
    (successKey: ToastKey) => ({
      onSuccess: () => toast.showSuccess(t(successKey)),
      onError: (err: unknown) => toast.showError(errorMessage(err)),
    }),
    [errorMessage, t, toast],
  );

  /* Tạm khoá và kết thúc HỎI LẠI (đúng `confirm` của web); mở khoá thì không. */
  const onIntent = useCallback(
    (driver: Driver, intent: DriverCardIntent) => {
      switch (intent) {
        case 'reinvite':
          setReinviteFrom({
            phone: driver.phone,
            name: driver.name,
            driverType: driver.driverType,
            note: driver.note ?? '',
          });
          setInviteOpen(true);
          return;
        case 'edit':
          setEditing(driver);
          return;
        case 'suspend':
          setSuspending(driver);
          return;
        case 'resume':
          resume.mutate(driver.id, feedback('toast.resumed'));
          return;
        case 'end':
          setEnding(driver);
          return;
      }
    },
    [feedback, resume],
  );

  const pendingId = suspend.isPending
    ? suspend.variables
    : resume.isPending
      ? resume.variables
      : end.isPending
        ? end.variables
        : null;

  const renderItem = useCallback<ListRenderItem<Driver>>(
    ({ item }) => (
      <DriverCard
        driver={item}
        canManage={canManage}
        pending={pendingId === item.id}
        onIntent={onIntent}
      />
    ),
    [canManage, onIntent, pendingId],
  );

  const filtered =
    linkStatus !== FILTER_ALL || driverType !== FILTER_ALL || trimmedSearch.length > 0;
  const endingInvite = ending?.linkStatus === DRIVER_LINK_STATUS.INVITED;

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

  const inviteButton = canManage ? (
    <IconButton
      icon="person-add-outline"
      label={t('actions.invite')}
      tone="primary"
      onPress={() => {
        setReinviteFrom(null);
        setInviteOpen(true);
      }}
    />
  ) : null;

  return (
    <>
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          title={t('page.title')}
          {...(meta === undefined ? {} : { total: t('page.total', { count: meta.total }) })}
          action={inviteButton}
          searchValue={search}
          searchLabel={t('filters.search')}
          searchPlaceholder={t('filters.searchPlaceholder')}
          onSearchChange={changeSearch}
          hasRows={items.length > 0}
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
                      setLinkStatus(FILTER_ALL);
                      setDriverType(FILTER_ALL);
                      setSearch('');
                      setPage(FIRST_PAGE);
                    }}
                  />
                ) : (
                  /* Nút "mời" đã ở hàng tiêu đề — không lặp lại ở đây. */
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

      <InviteDriverSheet
        open={inviteOpen}
        prefill={reinviteFrom}
        onClose={() => {
          setInviteOpen(false);
          setReinviteFrom(null);
        }}
      />
      <EditDriverSheet driver={editing} onClose={() => setEditing(null)} />

      <AlertDialog
        open={suspending !== null}
        title={t('actions.suspendConfirm')}
        confirmLabel={t('actions.suspend')}
        cancelLabel={tActions('close')}
        loading={suspend.isPending}
        onConfirm={() => {
          const driver = suspending;
          setSuspending(null);
          if (driver) suspend.mutate(driver.id, feedback('toast.suspended'));
        }}
        onCancel={() => setSuspending(null)}
      />

      <AlertDialog
        open={ending !== null}
        title={
          endingInvite
            ? t('actions.revokeConfirm')
            : ending && ending.activeBookingCount > 0
              ? t('actions.endConfirmWithTrips', { count: ending.activeBookingCount })
              : t('actions.endConfirm')
        }
        confirmLabel={endingInvite ? t('actions.revoke') : t('actions.end')}
        cancelLabel={tActions('close')}
        destructive
        loading={end.isPending}
        onConfirm={() => {
          const driver = ending;
          setEnding(null);
          if (!driver) return;
          const invited = driver.linkStatus === DRIVER_LINK_STATUS.INVITED;
          end.mutate(driver.id, feedback(invited ? 'toast.revoked' : 'toast.ended'));
        }}
        onCancel={() => setEnding(null)}
      />
    </>
  );
}
