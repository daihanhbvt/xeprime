import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItemInfo } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Chip } from '@/components/ui/Chip';
import { ActionCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
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

/**
 * "Nơi tôi làm tài xế" (`/account/driving`, ADR 0063) — bản native của `DriverLinksPage` (web).
 * Lời mời + liên kết của tài khoản khách này; phạm vi (hiện tại / đã kết thúc) ở state màn hình,
 * cuộn vô hạn thay cho bộ số trang. Đồng ý ngay một chạm; từ chối và ngừng làm tài xế hỏi lại.
 */
export function DriverLinksScreen() {
  const colors = useColors();
  const t = useTranslations('Driving.links');
  const tToast = useTranslations('Driving.toast');
  const tActions = useTranslations('Common.actions');
  const tNav = useTranslations('Navigation.account');
  const router = useRouter();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();

  const [scope, setScope] = useState<DriverLinkScope>(DRIVER_LINK_SCOPE.OPEN);
  const [confirm, setConfirm] = useState<{
    link: MyDriverLink;
    intent: 'decline' | 'leave';
  } | null>(null);

  const query = useMyDriverLinks(scope);
  const accept = useAcceptDriverLink();
  const decline = useDeclineDriverLink();
  const leave = useLeaveDriverLink();

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const pendingId = accept.isPending
    ? accept.variables
    : decline.isPending
      ? decline.variables
      : leave.isPending
        ? leave.variables
        : null;

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

  const viewTrips = useCallback(() => navigateOnce(ROUTES.driving.trips()), [navigateOnce]);

  const renderLink = useCallback(
    ({ item }: ListRenderItemInfo<MyDriverLink>) => (
      <DriverLinkCard
        link={item}
        pending={pendingId === item.id}
        onIntent={onIntent}
        onViewTrips={viewTrips}
      />
    ),
    [onIntent, pendingId, viewTrips],
  );

  const { hasNextPage, isFetchingNextPage, fetchNextPage, isRefetching, refetch } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const open = scope === DRIVER_LINK_SCOPE.OPEN;

  return (
    <>
      <AppHeader title={tNav('driving')} onBack={() => goBackOr(router, ROUTES.account.home())} />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <YStack px={layout.screenX} pt={space.sm} gap={space.sm}>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('sub')}
          </Text>
          <XStack gap={space.xs} accessibilityRole="tablist" accessibilityLabel={t('scopeLabel')}>
            <Chip
              label={t('scopeOpen')}
              selected={open}
              size="sm"
              onPress={() => setScope(DRIVER_LINK_SCOPE.OPEN)}
            />
            <Chip
              label={t('scopeClosed')}
              selected={!open}
              size="sm"
              onPress={() => setScope(DRIVER_LINK_SCOPE.CLOSED)}
            />
          </XStack>
        </YStack>

        <YStack f={1} pt={space.sm}>
          {query.isPending ? (
            <YStack px={layout.screenX} gap={layout.inline}>
              {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <ActionCardSkeleton key={i} />
              ))}
            </YStack>
          ) : query.isError ? (
            <ScreenError
              error={query.error}
              title={t('loadError')}
              onRetry={() => void refetch()}
            />
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
      </Screen>

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
