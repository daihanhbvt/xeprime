import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DEFAULT_TENANT_CUSTOMER_SORT,
  PERMISSION,
  TENANT_CUSTOMER_RELATIONSHIP,
  type TenantCustomerRelationship,
  type TenantCustomerSort,
} from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { IconButton } from '@/components/ui/IconButton';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { scrollThrottle } from '@/theme/motion';
import { colors, fontSize, space } from '@/theme/tokens';
import { CustomerCard } from './components/CustomerCard';
import { CustomerFormSheet } from './components/CustomerFormSheet';
import { CustomerSummaryBar } from './components/CustomerSummaryBar';
import { relationshipValues, sortValues } from './constants';
import { useCustomerListRefresh, useCustomersPage } from './hooks/use-customers';
import type { TenantCustomer } from './api';

const SKELETON_ROWS = 3;

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
  const t = useTranslations('Customers');
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();
  const domainLabel = useDomainLabel();

  const canView = permissions.has(PERMISSION.CUSTOMER_VIEW);
  const canManage = permissions.has(PERMISSION.CUSTOMER_MANAGE);
  const canViewFinance = permissions.has(PERMISSION.FINANCE_VIEW);

  const [relationship, setRelationship] = useState<TenantCustomerRelationship>(
    TENANT_CUSTOMER_RELATIONSHIP.ALL,
  );
  const [sort, setSort] = useState<TenantCustomerSort>(DEFAULT_TENANT_CUSTOMER_SORT);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(FIRST_PAGE);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const [formOpen, setFormOpen] = useState(false);

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

  const items = query.data?.items ?? [];
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
        key: 'relationship',
        label: t('filters.relationship'),
        value: relationship,
        resetValue: TENANT_CUSTOMER_RELATIONSHIP.ALL,
        options: relationshipValues(canViewFinance).map((value) => ({
          value,
          label: domainLabel('tenantCustomerRelationship', value),
        })),
      },
      {
        key: 'sort',
        label: t('filters.sort'),
        value: sort,
        resetValue: DEFAULT_TENANT_CUSTOMER_SORT,
        options: sortValues(canViewFinance).map((value) => ({
          value,
          label: domainLabel('tenantCustomerSort', value),
        })),
      },
    ],
    [t, domainLabel, canViewFinance, relationship, sort],
  );

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

  /*
   * Sắp xếp KHÔNG tính là "đang lọc": đổi thứ tự không làm mất dòng nào, nên trạng thái rỗng vẫn
   * phải là "chưa có khách" chứ không phải "không khớp bộ lọc". Cùng luật với `useCustomerFilters`
   * của web.
   */
  const filtered = relationship !== TENANT_CUSTOMER_RELATIONSHIP.ALL || trimmedSearch.length > 0;

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
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          title={t('page.title')}
          {...(meta === undefined ? {} : { total: t('page.totalLabel', { count: meta.total }) })}
          action={
            canManage ? (
              <IconButton
                icon="add"
                label={t('page.add')}
                tone="primary"
                onPress={() => setFormOpen(true)}
              />
            ) : null
          }
          summary={
            <>
              <CustomerSummaryBar enabled={canView} canViewFinance={canViewFinance} />
              {/*
                Câu định nghĩa nhóm khách của web — nó giải thích chính các lựa chọn trong tấm
                lọc, nên phải ở gần chúng. Nằm trong khối ĐẦU TRANG, thứ tự thu lại khi cuộn, nên
                có mặt lúc cần mà không chiếm chỗ vĩnh viễn.
              */}
              <YStack px={layout.screenX} pb={space.sm}>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('hints.relationship')}
                </Text>
              </YStack>
            </>
          }
          searchValue={search}
          searchLabel={t('filters.search')}
          searchPlaceholder={t('filters.searchPlaceholder')}
          onSearchChange={changeSearch}
          groups={groups}
          onFilterChange={changeFilter}
          {...(meta === undefined ? {} : { meta })}
          onPageChange={setPage}
        >
          {({ onScroll, headerHeight, contentContainerStyle }) => {
            const inStateScroll = (children: ReactNode) => (
              <ManageStateScroll
                onScroll={onScroll}
                headerHeight={headerHeight}
                refreshing={refresh.refreshing}
                onRefresh={refresh.onRefresh}
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
                  <ScreenMessage
                    icon="search-outline"
                    title={t('list.noResultsTitle')}
                    description={t('list.noResultsBody')}
                  />
                ) : (
                  <ScreenMessage
                    icon="people-outline"
                    title={t('list.emptyTitle')}
                    description={t('list.emptyBody')}
                    {...(canManage
                      ? { actionLabel: t('page.add'), onAction: () => setFormOpen(true) }
                      : {})}
                  />
                ),
              )
            ) : (
              <Animated.FlatList
                data={items}
                keyExtractor={keyOf}
                {...LIST_TUNING}
                renderItem={renderItem}
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
                    onRefresh={refresh.onRefresh}
                    tintColor={colors.primaryActive}
                    progressViewOffset={headerHeight}
                  />
                }
              />
            );
          }}
        </ManageListShell>
      </Screen>

      <CustomerFormSheet
        open={formOpen}
        customer={null}
        onClose={() => setFormOpen(false)}
        onOpenExisting={(id) => navigateOnce(ROUTES.manage.customerDetail(id))}
      />
    </>
  );
}
