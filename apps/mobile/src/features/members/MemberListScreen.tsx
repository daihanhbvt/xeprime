import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION, PLAN_FEATURE, TENANT_ROLE_VALUES } from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { FeatureReadOnlyNotice } from '@/components/feedback/FeatureReadOnlyNotice';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { IconButton } from '@/components/ui/IconButton';
import { ActionCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useFeature } from '@/features/auth/hooks/use-feature';
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
import type { Member } from './api';
import { InviteMemberSheet } from './components/InviteMemberSheet';
import { MemberCard } from './components/MemberCard';
import { MemberRoleSheet } from './components/MemberRoleSheet';
import { PendingInvitesPanel } from './components/PendingInvitesPanel';
import { useMembersPage, useRemoveMember } from './hooks/use-members';

const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 300;

/** Sentinel "mọi vai trò" — của giao diện, không xuống API. */
const ROLE_ALL = 'all';

// Ở module scope, không inline: FlatList coi `keyExtractor` mới là prop đổi và dựng lại cây con.
const keyOf = (member: Member) => member.userId;

/**
 * Nhân sự gian hàng (SHP-05) — bản native của `/manage/members`.
 *
 * HAI TRỤC ĐỘC LẬP, kiểm nối tiếp (ADR 0027 điều 2):
 *  - QUYỀN (`members.*`) trả lời "vai này được làm không" — thiếu `members.view` là màn 403;
 *  - GÓI (`PLAN_FEATURE.MEMBERS`) trả lời "gian hàng đã mua chưa" — hết hạn thì vẫn XEM được
 *    danh sách, chỉ không mời thêm người. Suy quyền từ gói (hoặc ngược lại) là cách một chủ shop
 *    hết hạn gói mất luôn quyền xem nhân sự của chính mình.
 *
 * Giới hạn số thành viên theo gói KHÔNG tính ở client: backend từ chối bằng mã lỗi, và app chỉ
 * hiện lại câu đó.
 */
export function MemberListScreen() {
  const t = useTranslations('Members');
  const tActions = useTranslations('Common.actions');
  const tLabels = useTranslations('Common.labels');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();
  const membersFeature = useFeature(PLAN_FEATURE.MEMBERS);
  const { data: me } = useCurrentUser();

  const canView = permissions.has(PERMISSION.MEMBER_VIEW);
  const canInvite = permissions.has(PERMISSION.MEMBER_INVITE);
  const canUpdateRole = permissions.has(PERMISSION.MEMBER_UPDATE_ROLE);
  const canRemove = permissions.has(PERMISSION.MEMBER_REMOVE);

  const [search, setSearch] = useState('');
  const [roleKey, setRoleKey] = useState<string>(ROLE_ALL);
  const [page, setPage] = useState(FIRST_PAGE);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const trimmedSearch = debouncedSearch.trim();

  const query = useMembersPage(
    {
      ...(trimmedSearch ? { q: trimmedSearch } : {}),
      ...(roleKey === ROLE_ALL ? {} : { roleKey }),
      page,
    },
    canView,
  );
  const removeMember = useRemoveMember();

  const items = query.data?.items ?? [];
  const meta = query.data?.meta;

  /* Gỡ một người làm danh sách ngắn đi, và trang đang đứng có thể biến mất theo. */
  useClampedPage(meta, setPage);

  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);

  const changeFilter = useCallback((_groupKey: string, value: string) => {
    setRoleKey(value);
    setPage(FIRST_PAGE);
  }, []);

  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'roleKey',
        label: t('filters.role'),
        value: roleKey,
        resetValue: ROLE_ALL,
        options: [
          { value: ROLE_ALL, label: t('filters.allRoles') },
          ...TENANT_ROLE_VALUES.map((role) => ({
            value: role,
            label: domainLabel('tenantRole', role),
          })),
        ],
      },
    ],
    [domainLabel, roleKey, t],
  );

  const confirmRemove = () => {
    const member = removing;
    if (!member) return;
    removeMember.mutate(member.userId, {
      onSuccess: () => {
        setRemoving(null);
        toast.showSuccess(t('toast.removed'));
      },
      onError: (err) => {
        setRemoving(null);
        toast.showError(errorMessage(err));
      },
    });
  };

  const renderItem = useCallback<ListRenderItem<Member>>(
    ({ item }) => (
      <MemberCard
        member={item}
        isMe={item.userId === me?.id}
        canUpdateRole={canUpdateRole && membersFeature.canWrite}
        canRemove={canRemove && membersFeature.canWrite}
        pending={removeMember.isPending && removeMember.variables === item.userId}
        onChangeRole={setEditingRole}
        onRemove={setRemoving}
      />
    ),
    [
      canRemove,
      canUpdateRole,
      me?.id,
      membersFeature.canWrite,
      removeMember.isPending,
      removeMember.variables,
    ],
  );

  const filtered = roleKey !== ROLE_ALL || trimmedSearch.length > 0;

  // Thiếu quyền là 403 của CHÍNH màn này — không gọi API rồi mới nhận lỗi.
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

  const inviteButton = canInvite ? (
    <IconButton
      icon="person-add-outline"
      label={t('actions.invite')}
      tone="primary"
      disabled={!membersFeature.canWrite}
      onPress={() => setInviteOpen(true)}
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
          summary={<FeatureReadOnlyNotice show={canInvite && !membersFeature.canWrite} />}
          searchValue={search}
          searchLabel={t('filters.search')}
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
                      setRoleKey(ROLE_ALL);
                      setSearch('');
                      setPage(FIRST_PAGE);
                    }}
                  />
                ) : (
                  /*
                    KHÔNG có nút "thêm" ở đây: nó đã nằm ở hàng tiêu đề (`ManageListShell action`),
                    và danh sách rỗng thì không có gì để cuộn nên hàng đó đứng nguyên trên màn —
                    hai nút cùng một việc trong cùng một khung hình.
                  */
                  <ScreenMessage icon="people-outline" title={t('page.empty')} />
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
                /* Lời mời đang chờ nằm DƯỚI danh sách, đúng chỗ web đặt nó. */
                ListFooterComponent={<PendingInvitesPanel enabled={canView} />}
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

      <InviteMemberSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <MemberRoleSheet member={editingRole} onClose={() => setEditingRole(null)} />

      <AlertDialog
        open={removing !== null}
        title={t('actions.removeConfirm')}
        confirmLabel={tActions('remove')}
        cancelLabel={tActions('close')}
        destructive
        loading={removeMember.isPending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}
