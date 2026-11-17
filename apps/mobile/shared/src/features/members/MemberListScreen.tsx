import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useAccumulatedPages } from '@/hooks/use-accumulated-pages';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  MEMBER_ROSTER_KIND,
  MEMBER_ROSTER_STATUS,
  MEMBER_ROSTER_STATUS_VALUES,
  PERMISSION,
  PLAN_FEATURE,
  TENANT_ROLE,
  TENANT_ROLE_VALUES,
} from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { FeatureReadOnlyNotice } from '@/components/feedback/FeatureReadOnlyNotice';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { ActionCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { LineIcon } from '@/components/icons/LineIcon';
import { Ionicons } from '@/components/icons/Ionicons';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { layout } from '@/theme/layout';
import { useCardGrid } from '@/theme/use-responsive';
import { LIST_TUNING } from '@/theme/list-tuning';
import { scrollThrottle } from '@/theme/motion';
import { useColors } from '@/theme/ThemeProvider';
import { iconSize } from '@/theme/tokens';
import type { MemberRosterItem } from './api';
import { canManageMemberScope, memberBranchNames, useBranchScopeOptions } from './branch-scope';
import { MemberDetailSheet } from './components/MemberDetailSheet';
import { MemberEditSheet } from './components/MemberEditSheet';
import { ResetPasswordSheet } from './components/ResetPasswordSheet';
import { RosterCard, type RosterAbilities } from './components/RosterCard';
import { StaffAccountSheet } from './components/StaffAccountSheet';
import {
  useRemoveMember,
  useRevokeInvite,
  useRosterPage,
  useSetMemberLock,
} from './hooks/use-members';

const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 300;

/** Sentinel "tất cả" của hai ô lọc — của giao diện, không xuống API. */
const FILTER_ALL = 'all';

// Ở module scope, không inline: FlatList coi `keyExtractor` mới là prop đổi và dựng lại cây con.
const keyOf = (row: MemberRosterItem) => `${row.kind}:${row.id}`;

/** Hộp xác nhận đang mở — một chỗ cho khoá / mở khoá / gỡ / thu hồi. */
type Confirm =
  | { kind: 'lock'; row: MemberRosterItem; locked: boolean }
  | { kind: 'remove'; row: MemberRosterItem }
  | { kind: 'revoke'; row: MemberRosterItem };

/**
 * Nhân viên & Phân quyền (design `24035:69458`, ADR 0086 · ADR 0087) — bản native của web
 * `MembersPage`.
 *
 * MỘT danh sách cho thành viên lẫn lời mời cũ còn chờ ("Chờ xác nhận") — server ghép và phân trang
 * (`GET /members/roster`). Chủ CẤP tài khoản cho nhân viên ("Thêm nhân viên": tên đăng nhập + mật
 * khẩu); mời bằng SĐT đã gỡ, lời mời cũ chỉ còn thu hồi được. Đổi vai / chi nhánh / họ tên qua tấm
 * "Chỉnh sửa"; khoá, đặt lại mật khẩu, gỡ nằm ở tấm chi tiết.
 *
 * HAI TRỤC ĐỘC LẬP, kiểm nối tiếp (ADR 0027 điều 2): QUYỀN (`members.*`) và GÓI
 * (`PLAN_FEATURE.MEMBERS`) — hết gói vẫn XEM được danh sách, không thêm hay sửa được người.
 */
export function MemberListScreen() {
  // `<Screen>` dựng cột giữa màn trên iPad, nên nội dung bên trong giữ lề điện thoại.
  const gutter = layout.screenX;
  const colors = useColors();
  const t = useTranslations('Members');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();
  const tManageCommon = useTranslations('ManageCommon');
  const permissions = usePermissions();
  const membersFeature = useFeature(PLAN_FEATURE.MEMBERS);
  const { data: me } = useCurrentUser();

  const writable = membersFeature.canWrite;
  const canView = permissions.has(PERMISSION.MEMBER_VIEW);
  const canAdd = permissions.has(PERMISSION.MEMBER_INVITE);
  const canUpdate = permissions.has(PERMISSION.MEMBER_UPDATE_ROLE) && writable;
  const canRemove = permissions.has(PERMISSION.MEMBER_REMOVE) && writable;
  const canRevoke = canAdd && writable;

  const [search, setSearch] = useState('');
  const [roleKey, setRoleKey] = useState<string>(FILTER_ALL);
  const [status, setStatus] = useState<string>(FILTER_ALL);
  const [page, setPage] = useState(FIRST_PAGE);
  const [addOpen, setAddOpen] = useState(false);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MemberRosterItem | null>(null);
  const [resetting, setResetting] = useState<MemberRosterItem | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const scope = useBranchScopeOptions();
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const trimmedSearch = debouncedSearch.trim();

  const query = useRosterPage(
    {
      ...(trimmedSearch ? { q: trimmedSearch } : {}),
      ...(roleKey === FILTER_ALL ? {} : { roleKey }),
      ...(status === FILTER_ALL ? {} : { status }),
      page,
    },
    canView,
  );
  const setLock = useSetMemberLock();
  const removeMember = useRemoveMember();
  const revoke = useRevokeInvite();

  // Cuộn vô hạn trên mobile: gộp các trang đã tải (`useAccumulatedPages`).
  const items = useAccumulatedPages(query.data?.items, query.data?.meta?.page);
  const meta = query.data?.meta;
  useClampedPage(meta, setPage);

  const meId = me?.id;
  const isSelf = useCallback(
    (row: MemberRosterItem) => Boolean(row.userId) && row.userId === meId,
    [meId],
  );

  /**
   * Gương của luật server: không ai thao tác lên CHỦ hay CHÍNH MÌNH; người bị giới hạn chi nhánh chỉ
   * chạm dòng nằm gọn trong phần của mình (`assertWithinActorScope`); đặt lại mật khẩu chỉ cho tài
   * khoản do gian hàng cấp; khoá vì hết gói không mở tay (`MEMBER_LOCKED_BY_SYSTEM`).
   */
  const abilitiesOf = useCallback(
    (row: MemberRosterItem): RosterAbilities => {
      const withinScope = canManageMemberScope(scope.allowAll, scope.branchIds, row);
      if (row.kind === MEMBER_ROSTER_KIND.INVITE) {
        return {
          edit: false,
          lock: false,
          resetPassword: false,
          remove: false,
          revoke: canRevoke && withinScope,
        };
      }
      const manageable = row.roleKey !== TENANT_ROLE.SHOP_OWNER && !isSelf(row) && withinScope;
      const systemLocked = row.status === MEMBER_ROSTER_STATUS.LOCKED && Boolean(row.lockedReason);
      return {
        edit: canUpdate && manageable,
        lock: canUpdate && manageable && !systemLocked,
        resetPassword: canUpdate && manageable && row.managedAccount,
        remove: canRemove && manageable,
        revoke: false,
      };
    },
    [canRemove, canRevoke, canUpdate, isSelf, scope.allowAll, scope.branchIds],
  );

  const nameOf = (row: MemberRosterItem) =>
    row.displayName ?? row.nickname ?? row.phone ?? t('roster.pendingName');

  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);

  const changeFilter = useCallback((groupKey: string, value: string) => {
    if (groupKey === 'status') setStatus(value);
    else setRoleKey(value);
    setPage(FIRST_PAGE);
  }, []);

  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'roleKey',
        label: t('roster.role'),
        value: roleKey,
        resetValue: FILTER_ALL,
        options: [
          { value: FILTER_ALL, label: t('roster.allRoles') },
          ...TENANT_ROLE_VALUES.map((role) => ({
            value: role,
            label: domainLabel('tenantRole', role),
          })),
        ],
      },
      {
        key: 'status',
        label: t('roster.status'),
        value: status,
        resetValue: FILTER_ALL,
        options: [
          { value: FILTER_ALL, label: t('roster.allStatuses') },
          ...MEMBER_ROSTER_STATUS_VALUES.map((value) => ({
            value,
            label: domainLabel('memberRosterStatus', value),
          })),
        ],
      },
    ],
    [domainLabel, roleKey, status, t],
  );

  const runConfirm = () => {
    const current = confirm;
    if (!current) return;
    const done = () => setConfirm(null);
    if (current.kind === 'lock') {
      if (!current.row.userId) return done();
      setLock.mutate(
        { userId: current.row.userId, locked: current.locked },
        {
          onSuccess: () => {
            done();
            toast.showSuccess(t(current.locked ? 'roster.toast.locked' : 'roster.toast.unlocked'));
          },
          onError: (err) => {
            done();
            toast.showError(errorMessage(err));
          },
        },
      );
    } else if (current.kind === 'remove') {
      if (!current.row.userId) return done();
      removeMember.mutate(current.row.userId, {
        onSuccess: () => {
          done();
          if (openedId === current.row.id) setOpenedId(null);
          toast.showSuccess(t('toast.removed'));
        },
        onError: (err) => {
          done();
          toast.showError(errorMessage(err));
        },
      });
    } else {
      revoke.mutate(current.row.id, {
        onSuccess: () => {
          done();
          if (openedId === current.row.id) setOpenedId(null);
          toast.showSuccess(t('toast.revoked'));
        },
        onError: (err) => {
          done();
          toast.showError(errorMessage(err));
        },
      });
    }
  };

  const pendingRowId = removeMember.isPending
    ? removeMember.variables
    : setLock.isPending
      ? setLock.variables?.userId
      : revoke.isPending
        ? revoke.variables
        : undefined;

  const openRow = useCallback((row: MemberRosterItem) => setOpenedId(row.id), []);
  const requestRevoke = useCallback(
    (row: MemberRosterItem) => setConfirm({ kind: 'revoke', row }),
    [],
  );
  const unknownBranch = t('roster.unknownBranch');

  const renderItem = useCallback<ListRenderItem<MemberRosterItem>>(
    ({ item }) => (
      <RosterCard
        item={item}
        isMe={isSelf(item)}
        branchNames={memberBranchNames(item, scope.labelById, unknownBranch)}
        abilities={abilitiesOf(item)}
        pending={
          pendingRowId !== undefined && (pendingRowId === item.userId || pendingRowId === item.id)
        }
        onView={openRow}
        onEdit={setEditing}
        onRevoke={requestRevoke}
      />
    ),
    [abilitiesOf, isSelf, openRow, pendingRowId, requestRevoke, scope.labelById, unknownBranch],
  );
  // iPad: thẻ xếp lưới 2 cột trong cột nội dung; điện thoại giữ 1 cột.
  const grid = useCardGrid(renderItem, { listKey: 'members' });

  const filtered = roleKey !== FILTER_ALL || status !== FILTER_ALL || trimmedSearch.length > 0;
  const opened = openedId ? (items.find((row) => row.id === openedId) ?? null) : null;

  // Thiếu quyền là 403 của CHÍNH màn này — không gọi API rồi mới nhận lỗi.
  if (!permissions.isLoading && !canView) {
    return (
      <>
        <ManagePageHeader title={t('page.title')} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('page.forbidden.title')}
            description={t('page.forbidden.description')}
            actionLabel={tManageCommon('permission.backHome')}
            onAction={() => navigateOnce(ROUTES.manage.home())}
          />
        </Screen>
      </>
    );
  }

  // Hai nút tròn như thanh trang Đơn thuê: "Vai trò & quyền" (khiên) và "Thêm nhân viên" (+).
  const headerActions = (
    <>
      <IconSquareButton label={t('roster.rolesButton')} onPress={() => navigateOnce(ROUTES.manage.memberRoles())}>
        <Ionicons name="shield-checkmark-outline" size={iconSize.lg} color={colors.text} />
      </IconSquareButton>
      {canAdd ? (
        <IconSquareButton
          label={t('staff.addButton')}
          tone="brand"
          disabled={!writable}
          onPress={() => setAddOpen(true)}
        >
          <LineIcon name="plus" size={iconSize.lg} color={colors.onPrimary} />
        </IconSquareButton>
      ) : null}
    </>
  );

  const confirmTitle = confirm
    ? confirm.kind === 'lock'
      ? t(confirm.locked ? 'roster.confirm.lock' : 'roster.confirm.unlock', {
          name: nameOf(confirm.row),
        })
      : confirm.kind === 'remove'
        ? t('roster.confirm.remove', { name: nameOf(confirm.row) })
        : t('roster.confirm.revoke')
    : '';
  const confirmBody = confirm
    ? confirm.kind === 'lock'
      ? confirm.locked
        ? t('roster.confirm.lockBody')
        : undefined
      : confirm.kind === 'remove'
        ? t('roster.confirm.removeBody')
        : t('roster.confirm.revokeBody')
    : undefined;
  const confirmLabel = confirm
    ? confirm.kind === 'lock'
      ? t(confirm.locked ? 'roster.actions.lock' : 'roster.actions.unlock')
      : confirm.kind === 'remove'
        ? tActions('remove')
        : t('roster.actions.revoke')
    : '';

  return (
    <>
      <ManagePageHeader title={t('page.title')} actions={headerActions} />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          variant="page"
          title={t('page.title')}
          subtitle={t('page.subtitle')}
          {...(meta === undefined ? {} : { total: t('roster.total', { count: meta.total }) })}
          summary={<FeatureReadOnlyNotice show={canAdd && !writable} />}
          searchValue={search}
          searchLabel={t('roster.searchLabel')}
          searchPlaceholder={t('roster.searchPlaceholder')}
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
                    <ActionCardSkeleton key={i} />
                  ))}
                </YStack>,
              )
            ) : query.isError && !query.data ? (
              inStateScroll(
                <ScreenError
                  error={query.error}
                  title={t('roster.loadError')}
                  onRetry={() => void query.refetch()}
                />,
              )
            ) : items.length === 0 ? (
              inStateScroll(
                filtered ? (
                  <ScreenMessage
                    icon="search-outline"
                    title={t('roster.emptyFiltered')}
                    actionLabel={tActions('clear')}
                    onAction={() => {
                      setRoleKey(FILTER_ALL);
                      setStatus(FILTER_ALL);
                      setSearch('');
                      setPage(FIRST_PAGE);
                    }}
                  />
                ) : (
                  <ScreenMessage
                    icon="people-outline"
                    title={t('roster.empty')}
                    description={t('roster.emptyHint')}
                    {...(canAdd && writable
                      ? { actionLabel: t('staff.addButton'), onAction: () => setAddOpen(true) }
                      : {})}
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

      <MemberDetailSheet
        item={opened}
        isSelf={opened ? isSelf(opened) : false}
        abilities={opened ? abilitiesOf(opened) : null}
        canOpenMatrix={canView}
        onClose={() => setOpenedId(null)}
        handlers={{
          // Tấm chi tiết đóng trước: hai tấm trượt chồng nhau thì nút lui đóng nhầm tấm.
          onEdit: (row) => {
            setOpenedId(null);
            setEditing(row);
          },
          onResetPassword: (row) => {
            setOpenedId(null);
            setResetting(row);
          },
          // Hộp xác nhận cũng mở SAU khi tấm đóng — iOS không chồng hai modal anh em.
          onSetLocked: (row, locked) => {
            setOpenedId(null);
            setConfirm({ kind: 'lock', row, locked });
          },
          onRemove: (row) => {
            setOpenedId(null);
            setConfirm({ kind: 'remove', row });
          },
          onRevoke: (row) => {
            setOpenedId(null);
            setConfirm({ kind: 'revoke', row });
          },
          onOpenMatrix: () => {
            setOpenedId(null);
            navigateOnce(ROUTES.manage.memberRoles());
          },
        }}
      />
      <MemberEditSheet member={editing} onClose={() => setEditing(null)} />
      <ResetPasswordSheet member={resetting} onClose={() => setResetting(null)} />
      <StaffAccountSheet open={addOpen} onClose={() => setAddOpen(false)} />

      <AlertDialog
        open={confirm !== null}
        title={confirmTitle}
        {...(confirmBody ? { message: confirmBody } : {})}
        confirmLabel={confirmLabel}
        cancelLabel={tActions('close')}
        destructive={!(confirm?.kind === 'lock' && !confirm.locked)}
        loading={setLock.isPending || removeMember.isPending || revoke.isPending}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
