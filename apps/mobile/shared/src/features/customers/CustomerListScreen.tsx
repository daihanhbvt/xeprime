import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useAccumulatedPages } from '@/hooks/use-accumulated-pages';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DEFAULT_TENANT_CUSTOMER_SORT,
  PERMISSION,
  TENANT_CUSTOMER_RELATIONSHIP,
  TENANT_CUSTOMER_SORT,
  type TenantCustomerRelationship,
  type TenantCustomerSort,
} from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { NoResults } from '@/components/state/NoResults';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { layout } from '@/theme/layout';
import { useCardGrid, useResponsive } from '@/theme/use-responsive';
import { ChipTabs } from '@/components/ui/ChipTabs';
import { LIST_TUNING } from '@/theme/list-tuning';
import { scrollThrottle } from '@/theme/motion';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, typeScale } from '@/theme/tokens';
import { CustomerCard } from './components/CustomerCard';
import { CustomerSummaryBar } from './components/CustomerSummaryBar';
import { relationshipValues, sortValues } from './constants';
import {
  useCustomerListRefresh,
  useCustomerSummary,
  useCustomersPage,
} from './hooks/use-customers';
import type { TenantCustomer } from './api';

const SKELETON_ROWS = 3;

/** Thứ tự chip của Figma "_Tab MB": Tất cả · Còn nợ · Khách quen · Lưu ý, rồi hai nhóm Figma không vẽ. */
const CHIP_ORDER: readonly TenantCustomerRelationship[] = [
  TENANT_CUSTOMER_RELATIONSHIP.ALL,
  TENANT_CUSTOMER_RELATIONSHIP.HAS_DEBT,
  TENANT_CUSTOMER_RELATIONSHIP.RETURNING,
  TENANT_CUSTOMER_RELATIONSHIP.WATCHLIST,
  TENANT_CUSTOMER_RELATIONSHIP.BLOCKED,
  TENANT_CUSTOMER_RELATIONSHIP.ARCHIVED,
];

/** Figma: dải chỉ số cách dòng "Danh sách" 16; dòng đó cách thẻ đầu 16 (8 ở đây + khe 8 của danh sách). */
const LIST_HEAD_GAP = 16;

/**
 * 300 ms — ĐÚNG con số `searchDebounceMs` mà web truyền cho `FilterBar` ở màn sổ khách.
 * Gõ nhanh hơn thì mỗi ký tự là một request; chậm hơn thì ô tìm kiếm cảm giác lag.
 */
const SEARCH_DEBOUNCE_MS = 300;

// Ở module scope, không inline: FlatList coi `keyExtractor` mới là prop đổi và dựng lại cả cây con.
const keyOf = (customer: TenantCustomer) => customer.id;

/**
 * Sổ khách của GIAN HÀNG (CUS-01).
 *
 * KHÔNG phải màn giám sát khách toàn nền tảng của admin: chỉ thấy khách của chính gian hàng đang
 * đăng nhập, và backend quyết định điều đó (`tenantId` lấy từ membership — client không gửi).
 *
 * Tìm kiếm, lọc nhóm, sắp xếp và cắt trang đều ở SERVER. Bộ lọc sống ở state màn hình: mobile
 * không có URL để chia sẻ, và bộ lọc này chết theo màn (ADR 0004).
 */
export function CustomerListScreen() {
  const colors = useColors();
  const t = useTranslations('Customers');
  const tApp = useTranslations('Customers.app');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();
  const domainLabel = useDomainLabel();
  const { gutter } = useResponsive();

  const canView = permissions.has(PERMISSION.CUSTOMER_VIEW);
  const canViewFinance = permissions.has(PERMISSION.FINANCE_VIEW);

  const [relationship, setRelationship] = useState<TenantCustomerRelationship>(
    TENANT_CUSTOMER_RELATIONSHIP.ALL,
  );
  const [sort, setSort] = useState<TenantCustomerSort>(DEFAULT_TENANT_CUSTOMER_SORT);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(FIRST_PAGE);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const trimmedSearch = debouncedSearch.trim();

  const query = useCustomersPage(
    {
      // `all` là sentinel của giao diện — không endpoint nào nhận `relationship=all` như một bộ lọc.
      ...(relationship === TENANT_CUSTOMER_RELATIONSHIP.ALL ? {} : { relationship }),
      ...(trimmedSearch ? { q: trimmedSearch } : {}),
      sort,
      page,
    },
    canView,
  );

  // Kéo xuống làm mới CẢ dải chỉ số ở đầu trang, không riêng trang khách — xem hook.
  const refresh = useCustomerListRefresh();
  /*
   * Kéo làm mới = về TRANG 1 và nạp lại: danh sách đang gộp nhiều trang, mà chỉ trang đang đứng
   * được nạp lại - các trang trước vẫn nằm trong bản gộp với tên/số cũ (người dùng 25/11/2026: sửa tên
   * VP2 rồi kéo làm mới vẫn hiện tên cũ).
   */
  const pullRefresh = useCallback(() => {
    setPage(FIRST_PAGE);
    refresh.onRefresh();
  }, [refresh]);

  // Cuộn vô hạn trên mobile: gộp các trang đã tải (`useAccumulatedPages`).
  const items = useAccumulatedPages(query.data?.items, query.data?.meta?.page);
  const meta = query.data?.meta;

  /*
   * Lưu trữ một hồ sơ làm danh sách ngắn đi, và trang đang đứng có thể biến mất theo — xem
   * `useClampedPage`. Không có nó thì một thao tác THÀNH CÔNG lại kết thúc bằng màn rỗng.
   */
  useClampedPage(meta, setPage);

  /*
   * Mọi thay đổi bộ lọc đều VỀ TRANG 1: đứng ở trang 7 rồi lọc còn 12 bản ghi thì trang 7 không
   * tồn tại — server trả rỗng và màn hình trông như "không có kết quả".
   */
  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);

  const changeFilter = useCallback((groupKey: string, value: string) => {
    if (groupKey === 'relationship') setRelationship(value as TenantCustomerRelationship);
    else setSort(value as TenantCustomerSort);
    setPage(FIRST_PAGE);
  }, []);

  /**
   * Hai chiều: nhóm khách (LỌC) và sắp xếp. Gộp chung một tấm trượt vì với người dùng cả hai đều
   * là "chỉnh cách danh sách hiện ra", và tách làm hai nút là hai lối vào cho một ý định.
   *
   * `relationshipValues`/`sortValues` bỏ các lựa chọn TÀI CHÍNH khi thiếu `finance.view` —
   * backend từ chối chúng bằng 403, nên bày ra một lựa chọn chắc chắn lỗi là bẫy người dùng.
   */
  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'sort',
        label: t('filters.sort'),
        value: sort,
        resetValue: DEFAULT_TENANT_CUSTOMER_SORT,
        display: 'prefixed' as const,
        options: sortValues(canViewFinance).map((value) => ({
          value,
          label: domainLabel('tenantCustomerSort', value),
        })),
      },
    ],
    [t, domainLabel, canViewFinance, sort],
  );

  /*
   * Số đếm của CẢ sổ (cùng query với `CustomerSummaryBar`, dùng chung cache): tiêu đề trang và số
   * trên chip. `undefined` khi chưa tải - KHÔNG quy về 0.
   */
  const book = useCustomerSummary(canView).data;

  // Chữ chip theo Figma "_Tab MB" (Tất cả · Còn nợ · Khách quen · Lưu ý) - khoá riêng của app;
  // nhóm Từ chối phục vụ / Đã lưu trữ Figma không vẽ nên giữ nhãn dùng chung.
  const chipItems = useMemo(
    () =>
      [...relationshipValues(canViewFinance)]
        .sort((a, b) => CHIP_ORDER.indexOf(a) - CHIP_ORDER.indexOf(b))
        .map((value) => {
        switch (value) {
          case TENANT_CUSTOMER_RELATIONSHIP.ALL:
            return { value, label: tApp('chips.all'), count: book?.activeCustomers };
          case TENANT_CUSTOMER_RELATIONSHIP.HAS_DEBT:
            return { value, label: tApp('chips.has_debt'), count: book?.debtCustomers ?? undefined };
          case TENANT_CUSTOMER_RELATIONSHIP.RETURNING:
            return { value, label: tApp('chips.returning'), count: book?.returningCustomers };
          case TENANT_CUSTOMER_RELATIONSHIP.WATCHLIST:
            return { value, label: tApp('chips.watchlist'), count: book?.watchlistCustomers };
          case TENANT_CUSTOMER_RELATIONSHIP.BLOCKED:
            return {
              value,
              label: domainLabel('tenantCustomerRelationship', value),
              count: book?.blockedCustomers,
            };
          default:
            return {
              value,
              label: domainLabel('tenantCustomerRelationship', value),
              count: undefined,
            };
        }
      }),
    [canViewFinance, tApp, domainLabel, book],
  );

  // Figma "Users List" `24486:59054`: "Khách hàng (26)" - số của CẢ sổ; chưa tải xong thì chỉ có tên trang.
  const pageTitle = book
    ? tApp('titleWithCount', { count: fmt.count(book.activeCustomers) })
    : t('page.title');

  const sortLabel =
    sort === TENANT_CUSTOMER_SORT.LAST_RENTAL
      ? tApp('sortLastRental')
      : domainLabel('tenantCustomerSort', sort);

  const openCustomer = useCallback(
    (customer: TenantCustomer) => navigateOnce(ROUTES.manage.customerDetail(customer.id)),
    [navigateOnce],
  );

  const renderItem = useCallback<ListRenderItem<TenantCustomer>>(
    ({ item }) => (
      <CustomerCard customer={item} canViewFinance={canViewFinance} onPress={openCustomer} />
    ),
    [canViewFinance, openCustomer],
  );
  // iPad: thẻ xếp lưới 2 cột trong cột nội dung; điện thoại giữ 1 cột.
  const grid = useCardGrid(renderItem, { listKey: 'customers' });

  /*
   * Sắp xếp KHÔNG tính là "đang lọc": đổi thứ tự không làm mất dòng nào, nên trạng thái rỗng vẫn
   * phải là "chưa có khách" chứ không phải "không khớp bộ lọc". Cùng luật với `useCustomerFilters`
   * của web.
   */
  const filtered = relationship !== TENANT_CUSTOMER_RELATIONSHIP.ALL || trimmedSearch.length > 0;
  // Web `CustomerTable noResults.action`: gỡ nhóm + tìm kiếm, về trang đầu.

  // Thiếu quyền là 403 của CHÍNH màn này — hiện trạng thái thiếu quyền, KHÔNG giả thành rỗng.
  if (!permissions.isLoading && !canView) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('permission.title')}
            description={t('permission.description')}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      {/* Chuẩn UI màn Đơn thuê (người dùng 16/11/2026): thanh trang v2 + khung danh sách `page`. */}
      <ManagePageHeader title={pageTitle} />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          variant="page"
          title={pageTitle}
          searchValue={search}
          searchLabel={t('filters.search')}
          searchPlaceholder={tApp('searchPlaceholder')}
          onSearchChange={changeSearch}
          tabs={
            // Nhóm khách thành dải tab viên như Lịch sử đơn thuê (người dùng 16/11/2026); sắp xếp
            // vẫn ở tấm lọc. Bộ lựa chọn y như cũ (`relationshipValues` theo quyền tài chính).
            <ChipTabs
              label={t('filters.relationship')}
              items={chipItems}
              value={relationship}
              onSelect={(value) => changeFilter('relationship', value)}
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
                refreshing={refresh.refreshing}
                onRefresh={pullRefresh}
              >
                {children}
              </ManageStateScroll>
            );

            return query.isPending ? (
              inStateScroll(
                <YStack px={layout.screenX} gap={layout.inline}>
                  <CustomerSummaryBar enabled={canView} canViewFinance={canViewFinance} />
                  {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                    <RecordCardSkeleton key={i} />
                  ))}
                </YStack>,
              )
            ) : query.isError ? (
              inStateScroll(
                <ScreenError
                  error={query.error}
                  title={t('list.errorTitle')}
                  onRetry={() => void query.refetch()}
                />,
              )
            ) : items.length === 0 ? (
              /*
                "Đang lọc mà rỗng" và "sổ chưa có khách" là hai câu chuyện khác nhau: lối ra của
                cái này là gỡ bộ lọc, của cái kia là thêm khách đầu tiên.
              */
              inStateScroll(
                filtered ? (
                  <NoResults />
                ) : (
                  /*
                    Không có lối "Thêm khách hàng" (web 02/11/2026, ledger §3.4 #3): khách vào sổ
                    TỰ ĐỘNG khi đặt xe / lập đơn — form chỉ còn để sửa ở hồ sơ khách.
                  */
                  <ScreenMessage
                    icon="people-outline"
                    title={t('list.emptyTitle')}
                    description={t('list.emptyAutoBody')}
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
                ListHeaderComponent={
                  /*
                    Figma "Users List": dải chỉ số + dòng "Danh sách (N) · Sắp xếp: …" CUỘN CÙNG danh
                    sách (không còn dính ở đầu trang như trước); chip + ô tìm vẫn ở khối đầu.
                  */
                  <YStack gap={LIST_HEAD_GAP} pb={layout.inline}>
                    <CustomerSummaryBar enabled={canView} canViewFinance={canViewFinance} />
                    <XStack ai="center" jc="space-between" gap={layout.inline}>
                      <Text
                        col={colors.text}
                        fos={typeScale.body.fontSize}
                        lh={typeScale.body.lineHeight}
                        fow={fontWeight.semibold}
                      >
                        {tApp('listTitle', { count: fmt.count(meta?.total ?? items.length) })}
                      </Text>
                      <Text
                        flexShrink={1}
                        col={colors.placeholder}
                        fos={typeScale.label.fontSize}
                        lh={typeScale.label.lineHeight}
                        fow={fontWeight.medium}
                        numberOfLines={1}
                      >
                        {tApp('sortLine', { sort: sortLabel })}
                      </Text>
                    </XStack>
                  </YStack>
                }
                contentContainerStyle={contentContainerStyle}
                onScroll={onScroll}
                scrollEventThrottle={scrollThrottle.frame}
                refreshControl={
                  /*
                    `progressViewOffset` BẮT BUỘC: khối đầu trang nằm `position: absolute` ĐÈ lên
                    danh sách, nên không có offset thì vòng xoay vẽ nấp trọn sau nó — kéo xuống
                    vẫn gọi API thật nhưng người dùng không thấy gì.
                  */
                  <RefreshControl
                    refreshing={refresh.refreshing}
                    onRefresh={pullRefresh}
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
