import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import {
  BOOKING_HISTORY_KIND,
  BOOKING_HISTORY_OUTCOME,
  BOOKING_HISTORY_TAB,
  BOOKING_HISTORY_TAB_OUTCOMES,
  BOOKING_HISTORY_TAB_VALUES,
  PERMISSION,
  SERVICE_TYPE_VALUES,
  type BookingHistoryOutcome,
  type BookingHistoryTab,
} from '@xeprime/types';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { bookingRequestsApi } from '@/features/booking-requests/api';
import { BookingRequestDetailScreen } from '@/features/booking-requests/BookingRequestDetailScreen';
import { queryKeys } from '@/queries/query-keys';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { BranchFilterField } from '@/features/branches/components/BranchFilterField';
import { useScreenBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useListParam, useListParamChange } from '@/navigation/list-params';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { useColors } from '@/theme/ThemeProvider';
import { scrollThrottle } from '@/theme/motion';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { useBookingHistory } from './hooks/use-booking-history';
import type { BookingHistoryItem, BookingHistoryMeta } from './api';

const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 350;
/** Sentinel "tất cả" của giao diện — không gửi lên server. */
const ALL_FILTER = 'all';

const keyOf = (row: BookingHistoryItem) => `${row.kind}:${row.id}`;

/**
 * "Đơn đã kết thúc" (05/11/2026) — bản native của web `BookingHistoryView`.
 *
 * MỘT danh sách gộp đơn đã đóng + yêu cầu không thành đơn, xếp theo lúc kết thúc, lọc và cắt trang
 * ở SERVER (`GET /booking-history`). Kết cục do server suy; app chỉ dịch nhãn.
 */
export function BookingHistoryScreen() {
  const colors = useColors();
  const t = useTranslations('Bookings.history');
  const tActions = useTranslations('Common.actions');
  const tRequestDetail = useTranslations('BookingRequests.detail');
  const label = useDomainLabel();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();

  const routeTab = useListParam('tab', BOOKING_HISTORY_TAB_VALUES);
  const [tab, setTab] = useState<BookingHistoryTab>(routeTab ?? BOOKING_HISTORY_TAB.ALL);
  const [outcome, setOutcome] = useState<string>(ALL_FILTER);
  const [serviceType, setServiceType] = useState<string>(ALL_FILTER);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(FIRST_PAGE);
  useListParamChange('tab', routeTab, (next) => {
    setTab(next);
    setOutcome(ALL_FILTER);
    setPage(FIRST_PAGE);
  });
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const { branchId, filter: branchFilter } = useScreenBranchFilter(() => setPage(FIRST_PAGE));

  const query = useBookingHistory({
    tab,
    ...(outcome === ALL_FILTER ? {} : { outcome: outcome as BookingHistoryOutcome }),
    ...(serviceType === ALL_FILTER ? {} : { serviceType }),
    ...(branchId ? { branchId } : {}),
    ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
    page,
  });
  const items = query.data?.items ?? [];
  const meta = query.data?.meta;
  useClampedPage(meta, setPage);

  // Người thiếu quyền yêu cầu không thấy kết cục của yêu cầu — server báo qua `includesRequests`.
  const includesRequests =
    meta?.includesRequests ?? permissions.has(PERMISSION.BOOKING_REQUEST_VIEW);
  const outcomeOptions = BOOKING_HISTORY_TAB_OUTCOMES[tab].filter(
    (value) => includesRequests || !value.startsWith('request_'),
  );

  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'serviceType',
        label: t('serviceLabel'),
        value: serviceType,
        resetValue: ALL_FILTER,
        options: [
          { value: ALL_FILTER, label: t('serviceAll') },
          ...SERVICE_TYPE_VALUES.map((value) => ({ value, label: label('serviceType', value) })),
        ],
      },
      ...(outcomeOptions.length > 1
        ? [
            {
              key: 'outcome',
              label: t('outcomeLabel'),
              value: outcome,
              resetValue: ALL_FILTER,
              options: [
                { value: ALL_FILTER, label: t('outcomeAll') },
                ...outcomeOptions.map((value) => ({
                  value,
                  label: label('bookingHistoryOutcome', value),
                })),
              ],
            },
          ]
        : []),
    ],
    [t, label, serviceType, outcome, outcomeOptions],
  );

  const changeFilter = useCallback((groupKey: string, value: string) => {
    if (groupKey === 'outcome') setOutcome(value);
    else setServiceType(value);
    setPage(FIRST_PAGE);
  }, []);

  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);

  const selectTab = useCallback((next: BookingHistoryTab) => {
    setTab(next);
    // Kết cục của ngăn cũ có thể không thuộc ngăn mới — gỡ, như web `selectTab`.
    setOutcome(ALL_FILTER);
    setPage(FIRST_PAGE);
  }, []);

  const filtered =
    outcome !== ALL_FILTER || serviceType !== ALL_FILTER || debouncedSearch.trim().length > 0;
  const clearFilters = useCallback(() => {
    setOutcome(ALL_FILTER);
    setServiceType(ALL_FILTER);
    setSearch('');
    setPage(FIRST_PAGE);
  }, []);

  /*
   * Dòng YÊU CẦU không thành đơn mở chi tiết yêu cầu (web `setOpenRequestId` → hộp chi tiết) — THAY
   * nội dung màn như hộp thư, đóng lại là về đúng ngăn, bộ lọc và trang đang đứng.
   */
  const [requestId, setRequestId] = useState<string | null>(null);
  const request = useQuery({
    queryKey: queryKeys.bookingRequests.detail(requestId ?? ''),
    queryFn: () => bookingRequestsApi.detail(requestId ?? ''),
    enabled: requestId !== null,
  });

  const openRow = useCallback(
    (row: BookingHistoryItem) => {
      if (row.kind === BOOKING_HISTORY_KIND.BOOKING) {
        navigateOnce(ROUTES.manage.bookingDetail(row.id));
      } else {
        setRequestId(row.id);
      }
    },
    [navigateOnce],
  );

  const renderItem = useCallback<ListRenderItem<BookingHistoryItem>>(
    ({ item }) => <HistoryCard row={item} onPress={openRow} />,
    [openRow],
  );

  const canView =
    permissions.has(PERMISSION.BOOKING_VIEW) || permissions.has(PERMISSION.BOOKING_REQUEST_VIEW);
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

  if (requestId !== null) {
    const closeRequest = () => setRequestId(null);
    const detail = request.data?.id === requestId ? request.data : null;
    // Yêu cầu đã đóng: không còn quyết định nào — màn chi tiết tự ẩn nút theo trạng thái.
    const noop = () => undefined;
    return detail ? (
      <BookingRequestDetailScreen
        request={detail}
        onApprove={noop}
        onReject={noop}
        onCancel={noop}
        onClose={closeRequest}
      />
    ) : (
      <>
        <AppHeader title={tRequestDetail('title')} onBack={closeRequest} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          {request.isError ? (
            <ScreenError
              error={request.error}
              title={t('errorTitle')}
              onRetry={() => void request.refetch()}
            />
          ) : (
            <ScreenLoading />
          )}
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
          branch={<BranchFilterField filter={branchFilter} value={branchId} />}
          searchValue={search}
          searchLabel={t('searchLabel')}
          searchPlaceholder={t('searchPlaceholder')}
          onSearchChange={changeSearch}
          tabs={<HistoryTabs value={tab} meta={meta} onChange={selectTab} />}
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
              inStateScroll(
                filtered ? (
                  <ScreenMessage
                    icon="search-outline"
                    title={t('noResultsTitle')}
                    description={t('noResultsBody')}
                    actionLabel={tActions('clear')}
                    onAction={clearFilters}
                  />
                ) : (
                  <ScreenMessage
                    icon="archive-outline"
                    title={t(`empty.${tab}.title`)}
                    description={t(`empty.${tab}.body`)}
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
                  // Khối đầu trang đè lên danh sách — đẩy vòng xoay xuống dưới nó.
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

const tabKeyOf = (item: BookingHistoryTab) => item;

/** Bốn ngăn kèm số đếm server trả (`meta.tabCounts`). */
function HistoryTabs({
  value,
  meta,
  onChange,
}: {
  value: BookingHistoryTab;
  meta: BookingHistoryMeta | undefined;
  onChange: (next: BookingHistoryTab) => void;
}) {
  const t = useTranslations('Bookings.history');
  const counts = meta?.tabCounts;
  // Người không xem được yêu cầu thì không có ngăn "Không thành đơn" (như web).
  const tabs = BOOKING_HISTORY_TAB_VALUES.filter(
    (item) => item !== BOOKING_HISTORY_TAB.NOT_CONVERTED || meta?.includesRequests !== false,
  );
  const countOf = (item: BookingHistoryTab): number | null => {
    if (!counts) return null;
    switch (item) {
      case BOOKING_HISTORY_TAB.COMPLETED:
        return counts.completed;
      case BOOKING_HISTORY_TAB.CANCELLED:
        return counts.cancelled;
      case BOOKING_HISTORY_TAB.NOT_CONVERTED:
        return counts.notConverted;
      default:
        return counts.all;
    }
  };

  return (
    <FlatList
      horizontal
      data={tabs}
      keyExtractor={tabKeyOf}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={tabStyles.content}
      style={tabStyles.tabs}
      accessibilityLabel={t('tabsLabel')}
      renderItem={({ item }) => {
        const count = countOf(item);
        const text = t(`tabs.${item}`);
        return (
          <Chip
            label={count === null ? text : `${text}  ${count}`}
            selected={value === item}
            size="sm"
            onPress={() => onChange(item)}
          />
        );
      }}
    />
  );
}

const tabStyles = StyleSheet.create({
  tabs: { flexGrow: 0, paddingVertical: space.sm },
  content: { paddingHorizontal: layout.screenX, gap: space.xs },
});

/** Thẻ một dòng lịch sử — cùng thông tin với hàng bảng web (mã, xe, dịch vụ, khách, lịch, kết cục, lúc kết thúc). */
const HistoryCard = memo(function HistoryCard({
  row,
  onPress,
}: {
  row: BookingHistoryItem;
  onPress: (row: BookingHistoryItem) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.history');
  const label = useDomainLabel();
  const fmt = useAppFormat();
  const period =
    row.pickupAt && row.returnAt
      ? fmt.shortDateTimeRange(row.pickupAt, row.returnAt)
      : t('noSchedule');
  const outcome = row.outcome as BookingHistoryOutcome;

  return (
    <YStack px={layout.screenX} pb={layout.inline}>
      <Card
        onPress={() => onPress(row)}
        accessibilityLabel={`${t('open')} ${row.code ?? ''}`}
      >
        <YStack gap={space.xs}>
          <XStack justifyContent="space-between" alignItems="center" gap={space.sm}>
            <Text
              col={colors.text}
              fos={fontSize.bodyLg}
              fow={fontWeight.bold}
              numberOfLines={1}
              flexShrink={1}
            >
              {row.code ? `#${row.code}` : t('noCode')}
            </Text>
            <ToneBadge tone={outcome === BOOKING_HISTORY_OUTCOME.COMPLETED ? 'success' : 'danger'}>
              {label('bookingHistoryOutcome', outcome)}
            </ToneBadge>
          </XStack>
          <Text col={colors.text} fos={fontSize.body} numberOfLines={1}>
            {row.vehiclePlate ? `${row.vehicleName} · ${row.vehiclePlate}` : row.vehicleName}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
            {label('serviceType', row.serviceType)}
          </Text>
          <Field label={t('columns.customer')}>
            {row.customerPhone ? `${row.customerName} · ${row.customerPhone}` : row.customerName}
          </Field>
          <Field label={t('columns.period')}>{period}</Field>
          <Field label={t('columns.endedAt')}>{fmt.shortDateTime(row.endedAt)}</Field>
        </YStack>
      </Card>
    </YStack>
  );
});

function Field({ label, children }: { label: string; children: string }) {
  const colors = useColors();
  return (
    <XStack gap={space.sm} justifyContent="space-between">
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {label}
      </Text>
      <Text col={colors.text} fos={fontSize.bodySm} flexShrink={1} textAlign="right">
        {children}
      </Text>
    </XStack>
  );
}
