import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAccumulatedPages } from '@/hooks/use-accumulated-pages';
import { FlatList, RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';
import {
  BOOKING_DIRECT_SOURCE_VALUES,
  BOOKING_SOURCE,
  BOOKING_SOURCE_FILTER_DIRECT,
  BOOKING_SOURCE_FILTER_VALUES,
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
import { ToneBadge } from '@/components/ui/ToneBadge';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { bookingRequestsApi } from '@/features/booking-requests/api';
import { BookingRequestDetailScreen } from '@/features/booking-requests/BookingRequestDetailScreen';
import { queryKeys } from '@/queries/query-keys';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { NoResults } from '@/components/state/NoResults';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { useRouter } from 'expo-router';
import { Pill } from '@/components/ui/Pill';
import { ServiceTypeChip } from '@/components/ui/ServiceTypeChip';
import { BookingSourceChip } from '@/components/ui/BookingSourceChip';
import { VehicleThumb } from '@/components/ui/VehicleThumb';
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
import { useCardGrid } from '@/theme/use-responsive';
import { LIST_TUNING } from '@/theme/list-tuning';
import { useColors } from '@/theme/ThemeProvider';
import { scrollThrottle } from '@/theme/motion';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { useBookingHistory } from './hooks/use-booking-history';
import type { BookingHistoryItem } from './api';

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
  const tSource = useTranslations('Bookings.source');
  const tRequestDetail = useTranslations('BookingRequests.detail');
  const label = useDomainLabel();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();

  const routeTab = useListParam('tab', BOOKING_HISTORY_TAB_VALUES);
  const [tab, setTab] = useState<BookingHistoryTab>(routeTab ?? BOOKING_HISTORY_TAB.ALL);
  const [outcome, setOutcome] = useState<string>(ALL_FILTER);
  // Bộ lọc chung mang sang từ "Đơn thuê xe" (web `endedHref`) - chỉ đọc làm giá trị đầu.
  const carried = useLocalSearchParams<{ q?: string; serviceType?: string; source?: string }>();
  // Nguồn đơn (ADR 0110) - yêu cầu không thành đơn luôn thuộc nguồn XePrime.
  const [source, setSource] = useState<string>(() =>
    carried.source && (BOOKING_SOURCE_FILTER_VALUES as readonly string[]).includes(carried.source)
      ? carried.source
      : ALL_FILTER,
  );
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
      ...(source === ALL_FILTER ? {} : { source }),
      ...(branchId ? { branchId } : {}),
      ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
    }),
    [outcome, serviceType, source, branchId, debouncedSearch],
  );
  const query = useBookingHistory({ tab, ...baseFilters, page });
  // Cuộn vô hạn trên mobile: gộp các trang đã tải (`useAccumulatedPages`).
  const items = useAccumulatedPages(query.data?.items, query.data?.meta?.page);
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

  /*
   * Figma "Order Done" không có dải tab - bốn nhóm (kèm số đếm server) vào tấm "Lọc" thành mục
   * đầu tiên (người dùng chốt 20/11/2026). Không xem được yêu cầu thì không có "Không thành đơn".
   */
  const tabGroup = useMemo<FilterGroup>(
    () => ({
      key: 'tab',
      label: t('partnerApp.groupLabel'),
      value: tab,
      resetValue: BOOKING_HISTORY_TAB.ALL,
      // Không kèm số đếm (người dùng 20/11/2026) - "Tất cả nhóm" / tên nhóm.
      display: 'option',
      options: BOOKING_HISTORY_TAB_VALUES.filter(
        (item) => item !== BOOKING_HISTORY_TAB.NOT_CONVERTED || includesRequests,
      ).map((item) => ({
        value: item,
        label: item === BOOKING_HISTORY_TAB.ALL ? t('partnerApp.groupAll') : t(`tabs.${item}`),
      })),
    }),
    [t, tab, includesRequests],
  );

  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      tabGroup,
      {
        key: 'serviceType',
        label: t('serviceLabel'),
        value: serviceType,
        resetValue: ALL_FILTER,
        display: 'option' as const,
        options: [
          { value: ALL_FILTER, label: t('serviceAll') },
          ...SERVICE_TYPE_VALUES.map((value) => ({ value, label: label('serviceType', value) })),
        ],
      },
      {
        key: 'source',
        label: tSource('filter.label'),
        value: source,
        resetValue: ALL_FILTER,
        display: 'option' as const,
        options: [
          { value: ALL_FILTER, label: tSource('filter.all') },
          { value: BOOKING_SOURCE.XEPRIME, label: label('bookingSource', BOOKING_SOURCE.XEPRIME) },
          { value: BOOKING_SOURCE_FILTER_DIRECT, label: tSource('filter.direct') },
          ...BOOKING_DIRECT_SOURCE_VALUES.map((value) => ({ value, label: label('bookingSource', value) })),
        ],
      },
      ...(outcomeOptions.length > 1
        ? [
            {
              key: 'outcome',
              label: t('outcomeLabel'),
              value: outcome,
              resetValue: ALL_FILTER,
              display: 'option' as const,
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
    [t, tSource, label, serviceType, source, outcome, outcomeOptions, tabGroup],
  );

  const selectTab = useCallback((next: BookingHistoryTab) => {
    setTab(next);
    // Kết cục của ngăn cũ có thể không thuộc ngăn mới — gỡ, như web `selectTab`.
    setOutcome(ALL_FILTER);
    setPage(FIRST_PAGE);
  }, []);

  const changeFilter = useCallback(
    (groupKey: string, value: string) => {
      if (groupKey === 'tab') {
        selectTab(value as BookingHistoryTab);
        return;
      }
      if (groupKey === 'outcome') setOutcome(value);
      else if (groupKey === 'source') setSource(value || ALL_FILTER);
      else setServiceType(value);
      setPage(FIRST_PAGE);
    },
    [selectTab],
  );

  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);


  const filtered =
    tab !== BOOKING_HISTORY_TAB.ALL ||
    outcome !== ALL_FILTER ||
    serviceType !== ALL_FILTER ||
    source !== ALL_FILTER ||
    Boolean(branchId) ||
    debouncedSearch.trim().length > 0;

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
        navigateOnce(ROUTES.manage.bookingDetail(row.id, { preview: { code: row.code ?? null } }));
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
          // Figma "Order Done" không có dòng mô tả dưới tiêu đề (gỡ 20/11/2026).
          {...(meta === undefined ? {} : { total: t('totalLabel', { count: meta.total }) })}
          branchFilter={{ filter: branchFilter, value: branchId }}
          searchValue={search}
          searchLabel={t('searchLabel')}
          // App: câu ngắn như Figma - ô tìm hẹp cạnh nút "Lọc".
          searchPlaceholder={t('partnerApp.searchPlaceholder')}
          onSearchChange={changeSearch}
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
                  <NoResults />
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



/** Figma thẻ: đệm 16, các hàng cách 8; chấm kết cục 6. */
const CARD_PAD = 16;
const CARD_GAP = 8;
const DOT = 6;

/**
 * Một đơn đã kết thúc - Figma "Rental Request - Order Done" `24145:100838` (người dùng chốt
 * 20/11/2026): ảnh xe 63×40 · tên xe + viên kết cục (chấm màu) / biển số + mã đơn; chip dịch vụ +
 * khoảng "09/11 22:00 → 10/11 22:00"; "Khách hàng" + tên + SĐT. Cả thẻ bấm được (không còn nút
 * "Xem chi tiết", không còn dòng "Kết thúc lúc").
 */
const HistoryCard = memo(function HistoryCard({
  row,
  onPress,
}: {
  row: BookingHistoryItem;
  onPress: (row: BookingHistoryItem) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.history');
  const fmt = useAppFormat();
  const outcome = row.outcome as BookingHistoryOutcome;
  const done = outcome === BOOKING_HISTORY_OUTCOME.COMPLETED;
  const point = (iso: string) => `${fmt.dayMonth(iso)} ${fmt.time(iso)}`;
  // Dài hạn chưa từng chốt lịch thì nói GÓI (web `PeriodCell`).
  const period =
    row.pickupAt && row.returnAt
      ? `${point(row.pickupAt)} → ${point(row.returnAt)}`
      : row.longTermPackageMonths
        ? (fmt.packageLabel(row.longTermPackageMonths) ?? t('noSchedule'))
        : t('noSchedule');
  // App: nhãn NGẮN trên thẻ (người dùng chốt 20/11/2026) - bấm thẻ mở chi tiết có bên huỷ + lý do.
  const outcomeLabel = t(`partnerApp.outcomeShort.${outcome}`);
  const body = { fos: typeScale.body.fontSize, lh: typeScale.body.lineHeight } as const;
  const dotColor = done ? colors.success : colors.danger;

  return (
    <YStack pb={layout.inline}>
      <Card padded={false} onPress={() => onPress(row)} accessibilityLabel={`${t('open')} ${row.code ?? ''}`}>
        <YStack p={CARD_PAD} gap={CARD_GAP}>
          <XStack gap={12} ai="flex-start">
            {/* Ảnh to hơn Figma 63 × 40 (người dùng chốt 16/11/2026) - cỡ `md` 85 × 54. */}
            <VehicleThumb uri={row.vehicleImageUrl ?? null} recyclingKey={row.id} size="md" />
            <YStack f={1} minWidth={0} gap={4}>
              <XStack ai="center" jc="space-between" gap={space.sm}>
                <Text col={colors.text} {...body} fow={fontWeight.semibold} numberOfLines={1} flexShrink={1}>
                  {row.vehicleName}
                </Text>
                <Pill
                  label={outcomeLabel}
                  tone={done ? 'success' : 'danger'}
                  leading={<YStack w={DOT} h={DOT} br={radius.pill} bg={dotColor} />}
                />
              </XStack>
              <XStack ai="center" jc="space-between" gap={space.sm}>
                <Text col={colors.textMuted} {...body} numberOfLines={1} flexShrink={1}>
                  {row.vehiclePlate ?? ''}
                </Text>
                <Text col={row.code ? colors.text : colors.textMuted} {...body} fow={fontWeight.medium} numberOfLines={1}>
                  {row.code ? `#${row.code}` : t('noCode')}
                </Text>
              </XStack>
            </YStack>
          </XStack>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <XStack ai="center" gap={space.xs} flexShrink={1} minWidth={0}>
              <ServiceTypeChip value={row.serviceType} />
              {/* Nguồn đơn (ADR 0110) - yêu cầu không thành đơn luôn thuộc nguồn XePrime (không viên). */}
              <BookingSourceChip source={row.source} sourceLabel={row.sourceLabel ?? null} />
            </XStack>
            <Text col={colors.text} {...body} numberOfLines={1} flexShrink={1} ta="right">
              {period}
            </Text>
          </XStack>
          <XStack ai="flex-start" gap={4}>
            <Text f={1} col={colors.textPlaceholder} {...body}>
              {t('columns.customer')}
            </Text>
            <Text col={colors.text} {...body} fow={fontWeight.medium} numberOfLines={1} flexShrink={1}>
              {row.customerName}
            </Text>
            {row.customerPhone ? (
              <Text col={colors.textMuted} {...body} numberOfLines={1}>
                {row.customerPhone}
              </Text>
            ) : null}
          </XStack>
        </YStack>
      </Card>
    </YStack>
  );
});

