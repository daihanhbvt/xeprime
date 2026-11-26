import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useAccumulatedPages } from '@/hooks/use-accumulated-pages';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { Redirect } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import {
  isBookingClosedWithoutTrip,
  BOOKING_STATUS_SELECTABLE_VALUES,
  DEBT_FILTER,
  DEBT_FILTER_VALUES,
  DEBT_SORT_VALUES,
  DEFAULT_DEBT_SORT,
  PERMISSION,
  PLAN_FEATURE,
  type DebtFilter,
} from '@xeprime/types';
import { useDomainLabel } from '@/i18n/domain';
import { space } from '@/theme/tokens';
import { Screen } from '@/components/layout/Screen';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { NoResults } from '@/components/state/NoResults';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ROUTES } from '@/navigation/routes';
import { RecordPaymentSheet } from '@/features/settlement/components/RecordPaymentSheet';
import { ChipTabs } from '@/components/ui/ChipTabs';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import {
  useBranchEmptyCopy,
} from '@/features/branches/components/BranchFilterField';
import { useScreenBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { scrollThrottle } from '@/theme/motion';
import { useColors } from '@/theme/ThemeProvider';
import { DebtCard } from './components/DebtCard';
import { DebtDetailSheet } from './components/DebtDetailSheet';
import { DebtSummaryCards } from './components/DebtSummaryCards';
import {
  TRANSACTION_HISTORY_VIEW,
  TransactionHistoryTabs,
} from './components/TransactionHistoryTabs';
import { FILTER_ALL } from './constants';
import { useDebtSummary, useDebts } from './hooks/use-finance';
import type { DebtItem, DebtSummary } from './api';

const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Trạng thái đơn chọn được ở bộ lọc — đơn huỷ / khách không đến không mang công nợ (chuyến không
 * diễn ra — `SQL_DEBT_SCOPE`), như web.
 */
const DEBT_STATUS_OPTIONS = BOOKING_STATUS_SELECTABLE_VALUES.filter(
  (status) => !isBookingClosedWithoutTrip(status),
);

/** Số đếm của một chip nhóm hạn — đọc từ dải thẻ, KHÔNG theo nhóm đang mở. */
function groupCount(summary: DebtSummary | undefined, group: DebtFilter): number | null {
  if (!summary) return null;
  switch (group) {
    case DEBT_FILTER.OVERDUE:
      return summary.overdueCount;
    case DEBT_FILTER.UPCOMING:
      return summary.upcomingCount;
    case DEBT_FILTER.UNPAID:
      return summary.unpaidCount;
    default:
      return summary.totalCount;
  }
}

const groupKeyOf = (group: DebtFilter) => group;

// Ở module scope, không inline: FlatList coi `keyExtractor` mới là prop đổi và dựng lại cả cây con.
const keyOf = (debt: DebtItem) => debt.bookingId;

/**
 * Công nợ (FIN-04) — bản native của `/manage/debts`.
 *
 * Danh sách các ĐƠN còn nợ, tính động từ `bookings` ở server; tìm kiếm, lọc nhóm hạn và cắt
 * trang đều ở SERVER. Bộ lọc sống ở state màn hình: mobile không có URL để chia sẻ (ADR 0004).
 *
 * Hai hành động của mỗi dòng gác bằng hai quyền KHÁC nhau — "Xem đơn" cần `bookings.view`,
 * "Thu tiền" cần `payments.record`. Thu tiền mở đúng tấm trượt FIN-05 đã có, không dựng form thứ
 * hai: hai đường ghi tiền là hai bộ luật sẽ trôi khỏi nhau.
 */
export function DebtListScreen() {
  const colors = useColors();
  const t = useTranslations('Finance.debts');
  const navigateOnce = useNavigateOnce();
  // Hai tab của "Lịch sử giao dịch" dùng CHUNG tiêu đề + mô tả của web (ledger 09 §3.11).
  const tHistory = useTranslations('Finance.history.page');
  const tCommon = useTranslations('Common.labels');
  /* Câu thiếu quyền là CHUNG cho cả tuyến tiền — dùng lại đúng chuỗi của màn Tổng quan. */
  const tForbidden = useTranslations('Finance.overview.forbidden');
  const permissions = usePermissions();
  const domainLabel = useDomainLabel();

  const canViewFinance = permissions.has(PERMISSION.FINANCE_VIEW);
  const canViewBooking = permissions.has(PERMISSION.BOOKING_VIEW);
  const canRecord = permissions.has(PERMISSION.PAYMENT_RECORD);
  /*
   * Tab Công nợ mang cờ gói RIÊNG (`PLAN_FEATURE.DEBTS`) — web: gói không có thì `?view=debts`
   * rơi về sổ Thu-Chi. `read_only` (gói hết hạn) VẪN mở, kèm băng gia hạn của vỏ trang.
   */
  const debtsFeature = useFeature(PLAN_FEATURE.DEBTS);

  const [group, setGroup] = useState<string>(DEBT_FILTER.ALL);
  const [status, setStatus] = useState<string>(FILTER_ALL);
  const [sort, setSort] = useState<string>(DEFAULT_DEBT_SORT);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(FIRST_PAGE);
  const [collecting, setCollecting] = useState<Pick<DebtItem, 'bookingId' | 'debtAmount'> | null>(
    null,
  );
  /* "Xem" mở tấm chi tiết khoản nợ (web `DebtDetailDialog`); tấm mới có lối mở hồ sơ đơn đầy đủ. */
  const [detailId, setDetailId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const trimmedSearch = debouncedSearch.trim();
  /* Ô "Chi nhánh" (ADR 0052) — công nợ gắn với đơn, đơn gắn với xe, xe thuộc một chi nhánh. */
  const { branchId, filter: branchFilter } = useScreenBranchFilter(() => setPage(FIRST_PAGE));
  const branchEmpty = useBranchEmptyCopy(branchFilter, branchId);

  /* Phạm vi chung của danh sách và dải thẻ — dải thẻ KHÔNG mang nhóm hạn, sort, trang. */
  const scope = {
    ...(branchId ? { branchId } : {}),
    ...(status !== FILTER_ALL ? { status } : {}),
    ...(trimmedSearch ? { q: trimmedSearch } : {}),
  };
  const query = useDebts(
    {
      ...scope,
      // `all` là sentinel của giao diện — web cũng gửi `filter=all` xuống, giữ nguyên hợp đồng đó.
      filter: group,
      sort,
      page,
    },
    canViewFinance && debtsFeature.isVisible,
  );
  const summary = useDebtSummary(scope, canViewFinance && debtsFeature.isVisible);

  // Cuộn vô hạn trên mobile: gộp các trang đã tải (`useAccumulatedPages`).
  const items = useAccumulatedPages(query.data?.items, query.data?.meta?.page, (row) => row.bookingId);
  const meta = query.data?.meta;

  /* Thu xong một đơn là nó rời danh sách — trang đang đứng có thể biến mất theo. */
  useClampedPage(meta, setPage);

  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);

  const changeFilter = useCallback((groupKey: string, value: string) => {
    if (groupKey === 'status') setStatus(value);
    else if (groupKey === 'sort') setSort(value);
    setPage(FIRST_PAGE);
  }, []);

  const changeGroup = useCallback((value: string) => {
    setGroup(value);
    setPage(FIRST_PAGE);
  }, []);

  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'status',
        label: t('filters.status'),
        value: status,
        resetValue: FILTER_ALL,
        options: [
          { value: FILTER_ALL, label: tCommon('all') },
          ...DEBT_STATUS_OPTIONS.map((value) => ({
            value,
            label: domainLabel('bookingStatus', value),
          })),
        ],
      },
      {
        key: 'sort',
        label: t('sort.label'),
        value: sort,
        resetValue: DEFAULT_DEBT_SORT,
        display: 'prefixed' as const,
        options: DEBT_SORT_VALUES.map((value) => ({ value, label: t(`sort.${value}`) })),
      },
    ],
    [t, tCommon, domainLabel, status, sort],
  );

  const openBooking = useCallback((debt: DebtItem) => setDetailId(debt.bookingId), []);

  const renderItem = useCallback<ListRenderItem<DebtItem>>(
    ({ item }) => (
      <DebtCard
        debt={item}
        canView={canViewBooking}
        canCollect={canRecord}
        onView={openBooking}
        onCollect={setCollecting}
      />
    ),
    [canViewBooking, canRecord, openBooking],
  );

  const filtered = group !== DEBT_FILTER.ALL || status !== FILTER_ALL || trimmedSearch.length > 0;

  if (!debtsFeature.isVisible) return <Redirect href={ROUTES.manage.receipts()} />;

  // Thiếu quyền là 403 của CHÍNH màn này — KHÔNG gọi API rồi mới nhận lỗi.
  if (!permissions.isLoading && !canViewFinance) {
    return (
      <>
        <ManagePageHeader title={tHistory('title')} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={tForbidden('title')}
            description={tForbidden('description')}
            actionLabel={tForbidden('home')}
            onAction={() => navigateOnce(ROUTES.manage.home())}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <ManagePageHeader title={tHistory('title')} />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          variant="page"
          title={tHistory('title')}
          subtitle={tHistory('subtitle')}
          {...(meta === undefined ? {} : { total: t('table.totalLabel', { count: meta.total }) })}
          searchValue={search}
          searchLabel={t('filters.searchLabel')}
          searchPlaceholder={t('filters.searchPlaceholder')}
          onSearchChange={changeSearch}
          branchFilter={{ filter: branchFilter, value: branchId }}
          summary={
            <>
              <TransactionHistoryTabs value={TRANSACTION_HISTORY_VIEW.DEBTS} />
              <YStack px={layout.screenX} pt={space.sm} pb={space.sm}>
                <DebtSummaryCards
                  data={summary.data}
                  loading={summary.isFetching}
                  error={summary.isError}
                />
              </YStack>
            </>
          }
          tabs={
            // Nhóm hạn: dải tab viên chung kèm số đếm (số đếm đọc từ dải thẻ nên không đổi theo tab).
            <ChipTabs
              label={t('filters.groupLabel')}
              value={group}
              onSelect={changeGroup}
              gutter={layout.screenX}
              items={DEBT_FILTER_VALUES.map((item) => {
                const count = groupCount(summary.data, item);
                return {
                  value: item as string,
                  label: item === DEBT_FILTER.ALL ? t('filters.all') : t(`filters.${item}`),
                  ...(count === null ? {} : { count }),
                };
              })}
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
                    <RecordCardSkeleton key={i} />
                  ))}
                </YStack>,
              )
            ) : /* Lỗi chỉ khi KHÔNG còn dữ liệu cũ — refetch nền hỏng thì giữ trang đang đọc. */
            query.isError && !query.data ? (
              inStateScroll(
                <ScreenError
                  error={query.error}
                  title={t('table.error.title')}
                  onRetry={() => void query.refetch()}
                />,
              )
            ) : items.length === 0 ? (
              /*
                Rỗng vì CHƯA CÓ NỢ là tin vui; rỗng vì lọc quá tay là chuyện khác hẳn — lối ra của
                cái này là gỡ bộ lọc, của cái kia thì không có gì phải làm cả.
              */
              inStateScroll(
                branchEmpty && !filtered ? (
                  <ScreenMessage
                    icon="location-outline"
                    title={branchEmpty.title}
                    description={branchEmpty.hint}
                  />
                ) : filtered ? (
                  <NoResults />
                ) : (
                  <ScreenMessage icon="checkmark-circle-outline" title={t('table.empty.title')} />
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

      {/*
        Thu tiền mở đúng tấm trượt của FIN-05 — cùng `PaymentsService`, cùng luật "cọc không cộng
        vào đã trả". Gắn/tháo theo cờ mở vì số điền sẵn chỉ đọc lúc dựng.
      */}
      <DebtDetailSheet
        bookingId={detailId}
        onClose={() => setDetailId(null)}
        onCollect={setCollecting}
      />

      {collecting ? (
        <RecordPaymentSheet
          open
          onClose={() => setCollecting(null)}
          bookingId={collecting.bookingId}
          debtAmount={collecting.debtAmount}
        />
      ) : null}
    </>
  );
}
