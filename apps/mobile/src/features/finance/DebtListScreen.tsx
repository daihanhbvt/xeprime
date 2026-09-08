import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION } from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { RecordPaymentSheet } from '@/features/settlement/components/RecordPaymentSheet';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { useRenderTrace, useTracedRenderItem } from '@/dev/list-trace';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { scrollThrottle } from '@/theme/motion';
import { colors } from '@/theme/tokens';
import { DebtCard } from './components/DebtCard';
import { FILTER_ALL } from './constants';
import { useDebts } from './hooks/use-finance';
import type { DebtItem } from './api';

const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 300;

/** Bốn nhóm hạn trả của web — mã đi thẳng xuống `?filter=`, chỉ nhãn mới dịch. */
const DEBT_GROUPS = [FILTER_ALL, 'overdue', 'upcoming', 'unpaid'] as const;

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
  // Dev-only: đếm số lần màn render lại. Xem `src/dev/list-trace.ts`.
  useRenderTrace('Debts');

  const t = useTranslations('Finance.debts');
  const tCommon = useTranslations('Common.labels');
  const tActions = useTranslations('Common.actions');
  /* Câu thiếu quyền là CHUNG cho cả tuyến tiền — dùng lại đúng chuỗi của màn Tổng quan. */
  const tForbidden = useTranslations('Finance.overview.forbidden');
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();

  const canViewFinance = permissions.has(PERMISSION.FINANCE_VIEW);
  const canViewBooking = permissions.has(PERMISSION.BOOKING_VIEW);
  const canRecord = permissions.has(PERMISSION.PAYMENT_RECORD);

  const [group, setGroup] = useState<string>(FILTER_ALL);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(FIRST_PAGE);
  const [collecting, setCollecting] = useState<DebtItem | null>(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const trimmedSearch = debouncedSearch.trim();

  const query = useDebts(
    {
      // `all` là sentinel của giao diện — web cũng gửi `filter=all` xuống, giữ nguyên hợp đồng đó.
      filter: group,
      ...(trimmedSearch ? { q: trimmedSearch } : {}),
      page,
    },
    canViewFinance,
  );

  const items = query.data?.items ?? [];
  const meta = query.data?.meta;

  /* Thu xong một đơn là nó rời danh sách — trang đang đứng có thể biến mất theo. */
  useClampedPage(meta, setPage);

  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);

  const changeFilter = useCallback((_groupKey: string, value: string) => {
    setGroup(value);
    setPage(FIRST_PAGE);
  }, []);

  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'filter',
        label: t('filters.groupLabel'),
        value: group,
        resetValue: FILTER_ALL,
        options: DEBT_GROUPS.map((value) => ({
          value,
          label: value === FILTER_ALL ? tCommon('all') : t(`filters.${value}`),
        })),
      },
    ],
    [t, tCommon, group],
  );

  const openBooking = useCallback(
    (debt: DebtItem) => navigateOnce(ROUTES.manage.bookingDetail(debt.bookingId)),
    [navigateOnce],
  );

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

  // Dev-only: đo thời gian dựng từng thẻ, in gộp mỗi giây.
  const tracedRenderItem = useTracedRenderItem('Debts', renderItem);

  const filtered = group !== FILTER_ALL || trimmedSearch.length > 0;

  // Thiếu quyền là 403 của CHÍNH màn này — KHÔNG gọi API rồi mới nhận lỗi.
  if (!permissions.isLoading && !canViewFinance) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={tForbidden('title')}
            description={tForbidden('description')}
          />
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
          {...(meta === undefined ? {} : { total: t('table.totalLabel', { count: meta.total }) })}
          searchValue={search}
          searchLabel={t('filters.searchLabel')}
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
                filtered ? (
                  <ScreenMessage
                    icon="search-outline"
                    title={t('table.noResults.title')}
                    actionLabel={tActions('clear')}
                    onAction={() => {
                      setGroup(FILTER_ALL);
                      setSearch('');
                      setPage(FIRST_PAGE);
                    }}
                  />
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
                renderItem={tracedRenderItem}
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
