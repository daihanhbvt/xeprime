import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useAccumulatedPages } from '@/hooks/use-accumulated-pages';
import { nowInAppTz } from '@xeprime/domain';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DRIVER_LICENCE_CHECK_FILTER,
  DRIVER_LINK_STATUS,
  DRIVER_LINK_STATUS_FILTER_ANY,
  DRIVER_LINK_STATUS_FILTER_CLOSED,
  DRIVER_LINK_STATUS_VALUES,
  DRIVER_LIST_SORT,
  DRIVER_OPERATION_FILTER,
  DRIVER_OPERATION_FILTER_VALUES,
  DRIVER_TYPE_VALUES,
  PERMISSION,
} from '@xeprime/types';
import type { InviteDriverValues } from '@xeprime/validators';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { ChipTabs, type ChipTabItem } from '@/components/ui/ChipTabs';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { LineIcon } from '@/components/icons/LineIcon';
import { ActionCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { NoResults } from '@/components/state/NoResults';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { MONTH_PERIOD_FORMAT } from '@/components/ui/MonthPeriodField';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { useErrorMessage } from '@/i18n/use-error-message';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { layout } from '@/theme/layout';
import { useCardGrid, useResponsive } from '@/theme/use-responsive';
import { LIST_TUNING } from '@/theme/list-tuning';
import { scrollThrottle } from '@/theme/motion';
import { useColors } from '@/theme/ThemeProvider';
import { iconSize } from '@/theme/tokens';
import type { Driver } from './api';
import { DriverCard, type DriverCardIntent } from './components/DriverCard';
import { EditDriverSheet, InviteDriverSheet } from './components/DriverFormSheet';
import { DriverWageSettingsButton } from './components/DriverWageSettingsButton';
import { DRIVER_DETAIL_TAB } from './DriverDetailScreen';
import {
  useDriverSummary,
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

/**
 * Dải số đếm đầu màn — lối lọc nhanh của CÙNG tham số `linkStatus` / `licenceCheck` với ô
 * "Trạng thái" (web `DriversPage`). Mỗi ô bằng tổng danh sách khi bấm vào nó.
 */
const SUMMARY_CHIPS = [
  { key: 'open', label: 'chips.all', linkStatus: FILTER_ALL, licenceCheck: false },
  {
    key: 'active',
    label: 'chips.active',
    linkStatus: DRIVER_LINK_STATUS.ACTIVE,
    licenceCheck: false,
  },
  {
    key: 'invited',
    label: 'chips.invited',
    linkStatus: DRIVER_LINK_STATUS.INVITED,
    licenceCheck: false,
  },
  {
    key: 'licenceCheck',
    label: 'chips.licenceCheck',
    linkStatus: FILTER_ALL,
    licenceCheck: true,
  },
  {
    key: 'suspended',
    label: 'chips.suspended',
    linkStatus: DRIVER_LINK_STATUS.SUSPENDED,
    licenceCheck: false,
  },
  {
    key: 'closed',
    label: 'chips.closed',
    linkStatus: DRIVER_LINK_STATUS_FILTER_CLOSED,
    licenceCheck: false,
  },
] as const;

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
  const colors = useColors();
  const t = useTranslations('Drivers');
  const tActions = useTranslations('Common.actions');
  const tApp = useTranslations('Drivers.app');
  const { gutter } = useResponsive();
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();

  const canView = permissions.has(PERMISSION.DRIVER_VIEW);
  const canManage = permissions.has(PERMISSION.DRIVER_MANAGE);

  const [search, setSearch] = useState('');
  const [linkStatus, setLinkStatus] = useState<string>(FILTER_ALL);
  const [driverType, setDriverType] = useState<string>(FILTER_ALL);
  const [operation, setOperation] = useState<string>(FILTER_ALL);
  const [licenceCheck, setLicenceCheck] = useState(false);
  // Mặc định của MÀN là mới nhất (khác mặc định server) — như web.
  const [sort, setSort] = useState<string>(DRIVER_LIST_SORT.NEWEST);
  const [page, setPage] = useState(FIRST_PAGE);
  // Tháng thống kê tiền công (ADR 0075) — `YYYY-MM` giờ VN, mặc định tháng hiện tại (như web).
  // Thẻ không còn số tiền công tháng (Figma mới) - màn gửi tháng hiện tại sang chi tiết, nơi có bộ chọn tháng.
  const month = nowInAppTz().format(MONTH_PERIOD_FORMAT);
  const navigateOnce = useNavigateOnce();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [reinviteFrom, setReinviteFrom] = useState<InviteDriverValues | null>(null);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [suspending, setSuspending] = useState<Driver | null>(null);
  const [ending, setEnding] = useState<Driver | null>(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const trimmedSearch = debouncedSearch.trim();

  const sharedFilters = {
    ...(trimmedSearch ? { q: trimmedSearch } : {}),
    ...(driverType === FILTER_ALL ? {} : { driverType }),
    ...(operation === FILTER_ALL ? {} : { operation }),
  };
  const summary = useDriverSummary(sharedFilters, canView);
  const query = useDriversPage(
    {
      ...sharedFilters,
      ...(linkStatus === FILTER_ALL ? {} : { linkStatus }),
      ...(licenceCheck ? { licenceCheck: DRIVER_LICENCE_CHECK_FILTER } : {}),
      sort,
      page,
    },
    canView,
  );
  /*
   * Dải trạng thái = `ChipTabs` của v2 (khuôn Đơn thuê): mỗi ô là lối lọc ghi CÙNG tham số với ô
   * "Trạng thái" (web `SummaryStrip`), kèm SỐ ĐẾM từ `GET /drivers/summary`.
   */
  const summaryTabs = useMemo<ChipTabItem<string>[]>(
    () =>
      SUMMARY_CHIPS.map((chip) => ({
        value: chip.key,
        label: tApp(chip.label),
        count: summary.data?.[chip.key] ?? 0,
      })),
    [summary.data, tApp],
  );
  const summaryValue = licenceCheck
    ? 'licenceCheck'
    : (SUMMARY_CHIPS.find((chip) => !chip.licenceCheck && chip.linkStatus === linkStatus)?.key ??
      'open');
  const selectSummary = useCallback((key: string) => {
    const chip = SUMMARY_CHIPS.find((entry) => entry.key === key);
    if (!chip) return;
    setLinkStatus(chip.linkStatus);
    setLicenceCheck(chip.licenceCheck);
    setPage(FIRST_PAGE);
  }, [setPage]);
  const suspend = useSuspendDriver();
  const resume = useResumeDriver();
  const end = useEndDriver();

  // Cuộn vô hạn trên mobile: gộp các trang đã tải (`useAccumulatedPages`).
  const items = useAccumulatedPages(query.data?.items, query.data?.meta?.page);
  const meta = query.data?.meta;

  useClampedPage(meta, setPage);

  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);

  const changeFilter = useCallback((groupKey: string, value: string) => {
    if (groupKey === 'linkStatus') {
      setLinkStatus(value);
      setLicenceCheck(false);
    } else if (groupKey === 'operation') setOperation(value);
    else if (groupKey === 'sort') setSort(value);
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
        display: 'option' as const,
        options: [
          { value: FILTER_ALL, label: t('filters.openLinks') },
          { value: DRIVER_LINK_STATUS_FILTER_ANY, label: t('filters.allStatuses') },
          ...DRIVER_LINK_STATUS_VALUES.map((value) => ({
            value,
            label: domainLabel('driverLinkStatus', value),
          })),
          { value: DRIVER_LINK_STATUS_FILTER_CLOSED, label: t('filters.closed') },
        ],
      },
      {
        key: 'operation',
        label: t('filters.operation'),
        value: operation,
        resetValue: FILTER_ALL,
        options: [
          { value: FILTER_ALL, label: t('filters.allOperations') },
          ...DRIVER_OPERATION_FILTER_VALUES.map((value) => ({
            value,
            label: t(value === DRIVER_OPERATION_FILTER.ON_TRIP ? 'filters.onTrip' : 'filters.idle'),
          })),
        ],
      },
      {
        key: 'sort',
        label: t('filters.sort.label'),
        value: sort,
        resetValue: DRIVER_LIST_SORT.NEWEST,
        // Figma "_Filter Modal": "Sắp xếp: Mới nhất".
        display: 'prefixed' as const,
        // Thứ tự như web `DriversPage`: Mới nhất · Tên · Trạng thái.
        options: [DRIVER_LIST_SORT.NEWEST, DRIVER_LIST_SORT.NAME_ASC, DRIVER_LIST_SORT.STATUS].map((value) => ({
          value,
          label: t(`filters.sort.${value}`),
        })),
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
    [domainLabel, driverType, linkStatus, operation, sort, t],
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
        case 'view':
          navigateOnce(ROUTES.manage.driverDetail(driver.id, { month }));
          return;
        case 'trips':
          navigateOnce(
            ROUTES.manage.driverDetail(driver.id, { month, tab: DRIVER_DETAIL_TAB.TRIPS }),
          );
          return;
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
    [feedback, resume, navigateOnce, month],
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
  // iPad: thẻ xếp lưới 2 cột trong cột nội dung; điện thoại giữ 1 cột.
  const grid = useCardGrid(renderItem, { listKey: 'drivers' });

  const filtered =
    linkStatus !== FILTER_ALL ||
    driverType !== FILTER_ALL ||
    operation !== FILTER_ALL ||
    licenceCheck ||
    trimmedSearch.length > 0;
  const endingInvite = ending?.linkStatus === DRIVER_LINK_STATUS.INVITED;

  if (!permissions.isLoading && !canView) {
    return (
      <>
        <ManagePageHeader title={t('page.title')} />
        <Screen scrollReveal edges={['left', 'right', 'bottom']} scroll={false}>
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
    <IconSquareButton
      label={t('actions.invite')}
      tone="brand"
      onPress={() => {
        setReinviteFrom(null);
        setInviteOpen(true);
      }}
    >
      <LineIcon name="plus" size={iconSize.lg} color={colors.onPrimary} />
    </IconSquareButton>
  ) : null;

  return (
    <>
      {/* Thanh trang v2 (khuôn Đơn thuê / Danh sách xe): tiêu đề + nút "+" Mời tài xế. */}
      <ManagePageHeader
        title={t('page.heading')}
        actions={
          <>
            {/* Tiền công/ngày chung: nút biểu tượng cạnh "+" (người dùng 16/11/2026). */}
            <DriverWageSettingsButton iconOnly />
            {inviteButton}
          </>
        }
      />
      <Screen scrollReveal edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          variant="page"
          filterLayout="grid"
          title={t('page.title')}
          subtitle={t('page.subtitle')}
          searchValue={search}
          searchLabel={t('filters.search')}
          searchPlaceholder={tApp('searchPlaceholder')}
          onSearchChange={changeSearch}
          tabs={
            /* Dải chip (Figma "Filter Tabs" `24486:56891`): lối tắt của CÙNG tham số "Trạng thái". */
            <ChipTabs
              label={t('filters.summary')}
              items={summaryTabs}
              value={summaryValue}
              onSelect={selectSummary}
              gutter={gutter}
            />
          }
          hasRows={items.length > 0}
          groups={groups}
          onFilterChange={changeFilter}
          {...(meta === undefined ? {} : { meta })}
          onPageChange={setPage}
          loadingMore={query.isFetching && page > 1}
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
                  /* Xoá đủ năm bộ lọc như `clearFilters` của web (q · loại · vận hành · trạng
                     thái · cần đối chiếu); sắp xếp và tháng giữ nguyên. */
                  <NoResults />
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
                key={grid.key}
                ref={bindList}
                data={items}
                keyExtractor={keyOf}
                {...LIST_TUNING}
                {...grid.listProps}
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
