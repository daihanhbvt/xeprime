import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BRANCH_STATUS, PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Callout } from '@/components/ui/Callout';
import { IconButton } from '@/components/ui/IconButton';
import { InlineAction } from '@/components/ui/InlineAction';
import { ActionCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAppFormat } from '@/i18n/use-app-format';
import { layout } from '@/theme/layout';
import { useCardGrid } from '@/theme/use-responsive';
import { LIST_TUNING } from '@/theme/list-tuning';
import { scrollThrottle } from '@/theme/motion';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import type { Branch } from './api';
import { BranchCard } from './components/BranchCard';
import { BranchFormSheet } from './components/BranchFormSheet';
import { useBranchRowActions } from './hooks/use-branch-row-actions';
import { useBranches } from './hooks/use-branches';

const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 300;

/** Sentinel "không lọc trạng thái" — bộ lọc là chuyện của giao diện, không xuống API. */
const STATUS_ALL = '';

// Ở module scope, không inline: FlatList coi `keyExtractor` mới là prop đổi và dựng lại cả cây con.
const keyOf = (branch: Branch) => branch.id;

/**
 * Chi nhánh gian hàng (SHP-03) — bản native của `/manage/shop/branches`.
 *
 * Chi nhánh là nơi xe THỰC SỰ nằm, nên màn này trả lời đúng ba câu: chi nhánh nào đang chạy, mỗi
 * chi nhánh giữ bao nhiêu xe, và chi nhánh nào là mặc định (xe mới về đó, hồ sơ gian hàng lấy
 * tỉnh từ đó).
 *
 * KHÔNG có xoá: chi nhánh còn xe/đơn là dữ liệu lịch sử của những chuyến đã đi và FK ở DB chặn
 * xoá cứng — vòng đời đúng là ngừng hoạt động. Web cũng vậy.
 *
 * Nhiều chi nhánh là tính năng của GÓI (ADR 0027): hết hạn thì vẫn xem và SỬA chi nhánh đang có
 * (đó là địa chỉ công khai của gian hàng, thuộc bộ cơ bản), chỉ không MỞ THÊM và không đổi vòng
 * đời. Lớp chặn thật là `@RequiresFeature` ở backend — ba route đọc/sửa cố ý không mang marker.
 */
export function BranchListScreen() {
  const colors = useColors();
  const t = useTranslations('Branches');
  const tActions = useTranslations('Common.actions');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const permissions = usePermissions();
  const branchesFeature = useFeature(PLAN_FEATURE.BRANCHES);


  const canView = permissions.has(PERMISSION.BRANCH_VIEW);
  const canManage = permissions.has(PERMISSION.BRANCH_MANAGE);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(STATUS_ALL);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const trimmedSearch = debouncedSearch.trim();

  const query = useBranches(
    {
      ...(trimmedSearch ? { q: trimmedSearch } : {}),
      ...(status ? { status } : {}),
    },
    canView,
  );

  const items = query.data?.items ?? [];
  const needsReview = query.data?.needsReviewCount ?? 0;
  // Chi nhánh đầu tiên cần sửa - thiếu tỉnh hoặc địa chỉ chờ soát lại (cùng phép chọn với web).
  const firstToReview =
    items.find((row) => !row.provinceCode || row.needsLocationReview) ?? null;

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((branch: Branch) => {
    setEditing(branch);
    setFormOpen(true);
  }, []);

  const {
    runAction,
    actionStateOf,
    pending: pendingIdAction,
    deactivateConfirm,
  } = useBranchRowActions();

  const changeSearch = useCallback((next: string) => setSearch(next), []);
  const changeFilter = useCallback((_groupKey: string, value: string) => setStatus(value), []);

  /**
   * Đúng MỘT chiều lọc, y như web: "Chỉ đang hoạt động" bật/tắt.
   *
   * Không thêm lựa chọn "Chỉ ngừng hoạt động" dù về kỹ thuật API nhận được — web không có nó, và
   * hai client bày ra hai bộ lọc khác nhau là hai sản phẩm khác nhau.
   */
  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'status',
        label: tLabels('status'),
        value: status,
        resetValue: STATUS_ALL,
        options: [
          { value: STATUS_ALL, label: tLabels('all') },
          { value: BRANCH_STATUS.ACTIVE, label: t('toolbar.activeOnly') },
        ],
      },
    ],
    [status, t, tLabels],
  );

  const renderItem = useCallback<ListRenderItem<Branch>>(
    ({ item }) => (
      <BranchCard
        branch={item}
        canManage={canManage}
        pendingAction={pendingIdAction?.id === item.id ? pendingIdAction.action : null}
        onEdit={openEdit}
        onAction={runAction}
        actionState={actionStateOf}
      />
    ),
    [actionStateOf, canManage, openEdit, pendingIdAction, runAction],
  );
  // iPad: thẻ xếp lưới 2 cột trong cột nội dung; điện thoại giữ 1 cột.
  const grid = useCardGrid(renderItem, { listKey: 'branches' });

  const filtered = status !== STATUS_ALL || trimmedSearch.length > 0;

  // Thiếu quyền là 403 của CHÍNH màn này — không gọi API rồi mới nhận lỗi.
  if (!permissions.isLoading && !canView) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('table.noPermission')}
            description={t('table.noPermissionHint')}
          />
        </Screen>
      </>
    );
  }

  const addButton = canManage ? (
    <IconButton
      icon="add"
      label={t('page.add')}
      tone="primary"
      disabled={!branchesFeature.canWrite}
      onPress={openCreate}
    />
  ) : null;

  return (
    <>
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          title={t('page.title')}
          subtitle={t('page.subtitle')}
          {...(query.data
            ? {
                total: t('toolbar.summary', {
                  total: query.data.total,
                  active: fmt.count(query.data.activeCount),
                }),
              }
            : {})}
          action={addButton}
          searchValue={search}
          searchLabel={t('toolbar.searchLabel')}
          searchPlaceholder={t('toolbar.searchPlaceholder')}
          onSearchChange={changeSearch}
          hasRows={items.length > 0}
          groups={groups}
          onFilterChange={changeFilter}
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
            ) : /* Lỗi chỉ khi KHÔNG còn dữ liệu cũ — refetch nền hỏng thì giữ trang đang đọc. */
            query.isError && !query.data ? (
              inStateScroll(
                <ScreenError
                  error={query.error}
                  title={t('table.loadError')}
                  onRetry={() => void query.refetch()}
                />,
              )
            ) : items.length === 0 ? (
              inStateScroll(
                filtered ? (
                  <ScreenMessage
                    icon="search-outline"
                    title={t('table.noResults')}
                    description={t('table.noResultsHint')}
                    actionLabel={tActions('clear')}
                    onAction={() => {
                      setStatus(STATUS_ALL);
                      setSearch('');
                    }}
                  />
                ) : (
                  /*
                    KHÔNG có nút "thêm" ở đây: nó đã nằm ở hàng tiêu đề (`ManageListShell action`),
                    và danh sách rỗng thì không có gì để cuộn nên hàng đó đứng nguyên trên màn —
                    hai nút cùng một việc trong cùng một khung hình.
                  */
                  <ScreenMessage
                    icon="git-network-outline"
                    title={t('table.empty')}
                    description={t('table.emptyHint')}
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
                ListHeaderComponent={
                  needsReview > 0 ? (
                    <Callout tone="warning" title={t('page.needsReview', { count: needsReview })}>
                      <YStack gap={space.sm}>
                        <Text col={colors.text} fos={fontSize.bodySm}>
                          {t('page.needsReviewHint')}
                        </Text>
                        {/* "Sửa ngay" mở thẳng chi nhánh đầu tiên cần sửa - như web `BranchesView`. */}
                        {canManage && firstToReview ? (
                          <InlineAction
                            label={t('page.fixNow')}
                            onPress={() => openEdit(firstToReview)}
                          />
                        ) : null}
                      </YStack>
                    </Callout>
                  ) : null
                }
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

      <BranchFormSheet open={formOpen} branch={editing} onClose={() => setFormOpen(false)} />
      <AlertDialog {...deactivateConfirm} />
    </>
  );
}
