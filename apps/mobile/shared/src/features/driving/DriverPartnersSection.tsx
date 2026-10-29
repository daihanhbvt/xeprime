import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItemInfo } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { ActionCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useErrorMessage } from '@/i18n/use-error-message';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { DRIVER_LINK_SCOPE, type DriverLinkScope, type MyDriverLink } from './api';
import { DriverLinkCard, type DriverLinkIntent } from './components/DriverLinkCard';
import {
  useAcceptDriverLink,
  useDeclineDriverLink,
  useLeaveDriverLink,
  useMyDriverLinks,
} from './hooks';

const SKELETON_ROWS = 3;
const linkKey = (link: MyDriverLink) => link.id;

type ToastKey = 'linkAccepted' | 'linkDeclined' | 'linkLeft';

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: layout.screenX,
    paddingBottom: layout.section,
    gap: layout.inline,
  },
});

const SCOPES = [DRIVER_LINK_SCOPE.OPEN, DRIVER_LINK_SCOPE.CLOSED] as const;

/**
 * Khu "Chủ xe đối tác" của "Trung tâm Tài xế" (`/account/driving`, ADR 0063) — bản native của
 * `PartnersSection` trong `DriverCenterPage` web: hai tab con "Đang hợp tác / Đã kết thúc" kèm số
 * mục, rồi lời mời + liên kết của tài khoản khách này. Cuộn vô hạn thay cho bộ số trang. Đồng ý
 * ngay một chạm; từ chối và ngừng làm tài xế hỏi lại.
 */
export function DriverPartnersSection({
  onViewTrips,
  initialScope = DRIVER_LINK_SCOPE.OPEN,
}: {
  onViewTrips: () => void;
  /** Tab con mở đầu — từ `?tab=` của trung tâm tài xế (web `DriverCenterPage`). */
  initialScope?: DriverLinkScope;
}) {
  const colors = useColors();
  const t = useTranslations('Driving.links');
  const tCenter = useTranslations('Driving.center');
  const tToast = useTranslations('Driving.toast');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const [scope, setScope] = useState<DriverLinkScope>(initialScope);
  const [confirm, setConfirm] = useState<{
    link: MyDriverLink;
    intent: 'decline' | 'leave';
  } | null>(null);

  const query = useMyDriverLinks(scope);
  // Số của tab kia — chỉ đọc `meta.total` của trang đầu.
  const other = useMyDriverLinks(
    scope === DRIVER_LINK_SCOPE.OPEN ? DRIVER_LINK_SCOPE.CLOSED : DRIVER_LINK_SCOPE.OPEN,
  );
  const totalOf = (which: DriverLinkScope) =>
    (which === scope ? query.data : other.data)?.pages[0]?.meta.total;
  const accept = useAcceptDriverLink();
  const decline = useDeclineDriverLink();
  const leave = useLeaveDriverLink();

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  /*
   * Thao tác ĐANG chạy và trên liên kết nào — thẻ cần biết NÚT nào quay (web: mỗi nút
   * `loading={x.isPending}` riêng, còn lại chỉ khoá), không chỉ "có gì đó đang chạy".
   */
  const pendingAction: { id: string; intent: DriverLinkIntent } | null = accept.isPending
    ? { id: accept.variables, intent: 'accept' }
    : decline.isPending
      ? { id: decline.variables, intent: 'decline' }
      : leave.isPending
        ? { id: leave.variables, intent: 'leave' }
        : null;
  const pendingId = pendingAction?.id ?? null;
  const pendingIntent = pendingAction?.intent ?? null;

  const feedback = useCallback(
    (key: ToastKey) => ({
      onSuccess: () => toast.showSuccess(tToast(key)),
      onError: (err: unknown) => toast.showError(errorMessage(err)),
    }),
    [errorMessage, tToast, toast],
  );

  const onIntent = useCallback(
    (link: MyDriverLink, intent: DriverLinkIntent) => {
      if (intent === 'accept') accept.mutate(link.id, feedback('linkAccepted'));
      else setConfirm({ link, intent });
    },
    [accept, feedback],
  );

  const viewTrips = onViewTrips;

  const renderLink = useCallback(
    ({ item }: ListRenderItemInfo<MyDriverLink>) => (
      <DriverLinkCard
        link={item}
        pending={pendingId === item.id ? pendingIntent : null}
        onIntent={onIntent}
        onViewTrips={viewTrips}
      />
    ),
    [onIntent, pendingId, pendingIntent, viewTrips],
  );

  const { hasNextPage, isFetchingNextPage, fetchNextPage, isRefetching, refetch } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const open = scope === DRIVER_LINK_SCOPE.OPEN;

  return (
    <>
      <XStack px={layout.screenX} py={space.sm}>
        <SegmentedTabs
          items={SCOPES.map((which) => {
          const label =
            which === DRIVER_LINK_SCOPE.OPEN
              ? tCenter('tabPartnersOpen')
              : tCenter('tabPartnersClosed');
          const count = totalOf(which);
            return {
              key: which,
              label,
              ...(count !== undefined
                ? { count, accessibilityLabel: tCenter('tabLabel', { label, count }) }
                : {}),
            };
          })}
          value={scope}
          onChange={setScope}
        />
      </XStack>

      <YStack f={1}>
        {query.isPending ? (
          <YStack px={layout.screenX} gap={layout.inline}>
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <ActionCardSkeleton key={i} />
            ))}
          </YStack>
        ) : query.isError ? (
          <ScreenError error={query.error} title={t('loadError')} onRetry={() => void refetch()} />
        ) : items.length === 0 ? (
          <ScreenMessage
            icon="id-card-outline"
            title={open ? t('emptyOpenTitle') : t('emptyClosedTitle')}
            {...(open ? { description: t('emptyOpenBody') } : {})}
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={linkKey}
            renderItem={renderLink}
            contentContainerStyle={styles.listContent}
            onEndReached={loadMore}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={() => void refetch()}
                tintColor={colors.primaryActive}
              />
            }
            ListFooterComponent={isFetchingNextPage ? ActionCardSkeleton : null}
            {...LIST_TUNING}
          />
        )}
      </YStack>

      <AlertDialog
        open={confirm !== null}
        title={confirm?.intent === 'leave' ? t('leaveConfirm') : t('declineConfirm')}
        confirmLabel={confirm?.intent === 'leave' ? t('leave') : t('decline')}
        cancelLabel={tActions('close')}
        destructive
        onConfirm={() => {
          const current = confirm;
          setConfirm(null);
          if (!current) return;
          if (current.intent === 'leave') leave.mutate(current.link.id, feedback('linkLeft'));
          else decline.mutate(current.link.id, feedback('linkDeclined'));
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
