import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAccumulatedPages } from '@/hooks/use-accumulated-pages';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR, toAppTz } from '@xeprime/domain';
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
import { Button } from '@/components/ui/Button';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { useRouter } from 'expo-router';
import { Pill } from '@/components/ui/Pill';
import { FactRow } from '@/components/ui/FactRow';
import { ChipTabs } from '@/components/ui/ChipTabs';
import { typeScale } from '@/theme/tokens';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { useScreenBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useListParam, useListParamChange } from '@/navigation/list-params';
import { layout } from '@/theme/layout';
import { useCardGrid, useResponsive } from '@/theme/use-responsive';
import { LIST_TUNING } from '@/theme/list-tuning';
import { useColors } from '@/theme/ThemeProvider';
import { scrollThrottle } from '@/theme/motion';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { Ionicons } from '@/components/icons/Ionicons';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { useBookingHistory } from './hooks/use-booking-history';
import { bookingsApi, historyFiltersToParams } from './api';
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
  const router = useRouter();
  // Màn này nằm TRONG tab Vận hành: `router.back()` của bộ tab nhảy về tab trước (Tổng quan) - về thẳng danh sách đơn (16/11/2026).
  const goBack = useCallback(() => router.navigate(ROUTES.manage.bookings()), [router]);
  // `<Screen>` dựng cột giữa màn trên iPad, nên nội dung bên trong giữ lề điện thoại.
  const gutter = layout.screenX;
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
  // Bộ lọc chung mang sang từ "Đơn thuê xe" (web `endedHref`) - chỉ đọc làm giá trị đầu.
  const carried = useLocalSearchParams<{ q?: string; serviceType?: string }>();
  const [serviceType, setServiceType] = useState<string>(() =>
    carried.serviceType && (SERVICE_TYPE_VALUES as readonly string[]).includes(carried.serviceType)
      ? carried.serviceType
      : ALL_FILTER,
  );
  const [search, setSearch] = useState(() => carried.q ?? '');
  const [page, setPage] = useState(FIRST_PAGE);
  useListParamChange('tab', routeTab, (next) => {
    setTab(next);
    setOutcome(ALL_FILTER);
    setPage(FIRST_PAGE);
  });
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const { branchId, filter: branchFilter } = useScreenBranchFilter(() => setPage(FIRST_PAGE));

  const baseFilters = useMemo(
    () => ({
      ...(outcome === ALL_FILTER ? {} : { outcome: outcome as BookingHistoryOutcome }),
      ...(serviceType === ALL_FILTER ? {} : { serviceType }),
      ...(branchId ? { branchId } : {}),
      ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
    }),
    [outcome, serviceType, branchId, debouncedSearch],
  );
  const query = useBookingHistory({ tab, ...baseFilters, page });
  // Cuộn vô hạn trên mobile: gộp các trang đã tải (`useAccumulatedPages`).
  const items = useAccumulatedPages(query.data?.items, query.data?.meta?.page);
  /*
   * Tải TRƯỚC trang đầu của các tab còn lại (cùng bộ lọc) - bấm sang tab là có danh sách ngay
   * từ cache, không chờ một lượt gọi (người dùng 16/11/2026).
   */
  const queryClient = useQueryClient();
  useEffect(() => {
    for (const other of BOOKING_HISTORY_TAB_VALUES) {
      if (other === tab) continue;
      const filters = { tab: other, ...baseFilters, page: FIRST_PAGE };
      void queryClient.prefetchQuery({
        queryKey: queryKeys.bookings.history(historyFiltersToParams(filters)),
        queryFn: () => bookingsApi.history(filters),
      });
    }
  }, [queryClient, tab, baseFilters]);
  /* Số đếm tab giữ bản đã biết trong lúc tab mới tải - không chớp về trống. */
  const lastMeta = useRef(query.data?.meta);
  if (query.data?.meta) lastMeta.current = query.data.meta;
  const meta = query.data?.meta ?? lastMeta.current;
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
    outcome !== ALL_FILTER ||
    serviceType !== ALL_FILTER ||
    Boolean(branchId) ||
    debouncedSearch.trim().length > 0;
  const clearFilters = useCallback(() => {
    setOutcome(ALL_FILTER);
    setServiceType(ALL_FILTER);
    setSearch('');
    // Web `BookingHistoryView` xoá cả chi nhánh.
    branchFilter.select(undefined);
    setPage(FIRST_PAGE);
  }, [branchFilter]);

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
  // iPad: thẻ xếp lưới 2 cột trong cột nội dung; điện thoại giữ 1 cột.
  const grid = useCardGrid(renderItem, { listKey: 'history' });

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
      {/* Thanh trang v2 có nút lùi (Figma "Rental Request - Order Done" `24175:68159`). */}
      <ManagePageHeader title={t('title')} onBack={goBack} />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          variant="page"
          title={t('title')}
          subtitle={t('subtitle')}
          {...(meta === undefined ? {} : { total: t('totalLabel', { count: meta.total }) })}
          branchFilter={{ filter: branchFilter, value: branchId }}
          searchValue={search}
          searchLabel={t('searchLabel')}
          searchPlaceholder={t('searchPlaceholder')}
          onSearchChange={changeSearch}
          tabs={
            <HistoryTabs
              value={tab}
              meta={meta}
              includesRequests={includesRequests}
              onChange={selectTab}
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
                <YStack px={gutter} gap={layout.inline}>
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
  includesRequests,
  onChange,
}: {
  value: BookingHistoryTab;
  meta: BookingHistoryMeta | undefined;
  /** Server `meta.includesRequests`, chưa có meta thì suy từ quyền (web `BookingHistoryView`). */
  includesRequests: boolean;
  onChange: (next: BookingHistoryTab) => void;
}) {
  const { gutter } = useResponsive();
  const t = useTranslations('Bookings.history');
  const counts = meta?.tabCounts;
  // Người không xem được yêu cầu thì không có ngăn "Không thành đơn" (như web).
  const tabs = BOOKING_HISTORY_TAB_VALUES.filter(
    (item) => item !== BOOKING_HISTORY_TAB.NOT_CONVERTED || includesRequests,
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

  const items = tabs.map((item) => {
    const count = countOf(item);
    return { value: item, label: t(`tabs.${item}`), ...(count === null ? {} : { count }) };
  });
  // Cùng dải tab viên của màn Đơn thuê xe (`ChipTabs`, Figma "Horizontal tabs").
  return <ChipTabs label={t('tabsLabel')} items={items} value={value} onSelect={onChange} gutter={gutter} />;
}

const tabStyles = StyleSheet.create({
  tabs: { flexGrow: 0, paddingVertical: space.sm },
  content: { paddingHorizontal: layout.screenX, gap: space.xs },
});

/** Thẻ một dòng lịch sử — cùng thông tin với hàng bảng web (mã, xe, dịch vụ, khách, lịch, kết cục, lúc kết thúc). */
/** Ảnh xe ở thẻ dòng - cỡ ô ảnh của bộ chọn xe. */
/** Ảnh xe 80 × 52 (người dùng 16/11: to hơn bản Figma 63 × 40). */
const THUMB_W = 80;
const THUMB_H = 52;
/** Cùng nhịp `RentalCard`: đệm thẻ 16, các khối cách 12. */
const CARD_PAD = 16;
const BLOCK_GAP = 12;

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
  // Web `PeriodCell`: mốc nhận → trả + thời lượng; dài hạn chưa từng chốt lịch thì nói GÓI.
  // Web `PeriodCell`: "nhận → trả" rồi thời lượng ở dòng dưới; dài hạn chưa chốt lịch thì nói GÓI.
  const hasPeriod = Boolean(row.pickupAt && row.returnAt);
  const periodMain = hasPeriod
    ? `${fmt.rentalPoint(toAppTz(row.pickupAt as string))} → ${fmt.rentalPoint(toAppTz(row.returnAt as string))}`
    : row.longTermPackageMonths
      ? (fmt.packageLabel(row.longTermPackageMonths) ?? t('noSchedule'))
      : t('noSchedule');
  const periodSub = hasPeriod
    ? fmt.rentalDuration(toAppTz(row.pickupAt as string), toAppTz(row.returnAt as string))
    : null;
  const outcome = row.outcome as BookingHistoryOutcome;

  const body = { fos: typeScale.body.fontSize, lh: typeScale.body.lineHeight } as const;
  return (
    <YStack pb={layout.inline}>
      {/* Cùng thẻ web `BookingHistoryView.renderCard`: mã · kết cục / xe / khách · thời gian · kết thúc / Xem chi tiết. */}
      <Card onPress={() => onPress(row)} accessibilityLabel={`${t('open')} ${row.code ?? ''}`}>
        <YStack gap={space.sm}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text col={row.code ? colors.text : colors.textMuted} {...body} fow={fontWeight.medium} numberOfLines={1} flexShrink={1}>
              {row.code ? `#${row.code}` : t('noCode')}
            </Text>
            <Pill
              label={label('bookingHistoryOutcome', outcome)}
              tone={outcome === BOOKING_HISTORY_OUTCOME.COMPLETED ? 'success' : 'danger'}
            />
          </XStack>
          <XStack gap={12} ai="center">
            <YStack w={THUMB_W} h={THUMB_H} br={radius.sm} ov="hidden" bg={colors.surfaceMuted} flexShrink={0}>
              <RemoteImage
                uri={row.vehicleImageUrl}
                recyclingKey={row.id}
                radius={radius.sm}
                fallback={<Ionicons name="car-outline" size={iconSize.md} color={colors.placeholder} />}
              />
            </YStack>
            <YStack f={1} minWidth={0} gap={2}>
              <Text col={colors.text} {...body} fow={fontWeight.semibold} numberOfLines={1}>
                {row.vehicleName}
              </Text>
              {row.vehiclePlate ? (
                <Text col={colors.textMuted} {...body} numberOfLines={1}>
                  {row.vehiclePlate}
                </Text>
              ) : null}
            </YStack>
          </XStack>
          <FactRow label={t('columns.customer')}>
            {row.customerPhone ? `${row.customerName} - ${row.customerPhone}` : row.customerName}
          </FactRow>
          <FactRow label={t('columns.period')} sub={periodSub}>
            {periodMain}
          </FactRow>
          <FactRow label={t('columns.endedAt')}>{fmt.dateTime(row.endedAt)}</FactRow>
          {/* Nút vàng dùng chung (gradient + hiệu ứng như app khách), trải hết bề ngang thẻ. */}
          <YStack pt={space.xs}>
            <Button label={t('open')} variant="gradient" size="compact" onPress={() => onPress(row)} />
          </YStack>
        </YStack>
      </Card>
    </YStack>
  );
});

