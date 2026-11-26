import { memo, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  absoluteMoney,
  bankDisplayName,
  isNegativeMoney,
  isZeroMoney,
  LIST_SEPARATOR,
  nowInAppTz,
} from '@xeprime/domain';
import {
  STATUS_COLOR,
  WALLET_ACTIVITY_SOURCE,
  WITHDRAWAL_STATUS,
  WITHDRAWAL_STATUS_META,
  type StatusColor,
  type WithdrawalStatus,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import {
  MONTH_PERIOD_FORMAT,
  MonthPeriodField,
  periodLabel,
} from '@/components/ui/MonthPeriodField';
import { useAccumulatedPages } from '@/hooks/use-accumulated-pages';
import { useLoadNextPage } from '@/hooks/use-load-next-page';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';
import {
  WALLET_ACTIVITY_PAGE_SIZE,
  WALLET_SCOPE,
  type WalletActivity,
  type WalletStatementFilters,
} from '@/api/wallet/api';
import { useCancelWithdrawal, useWalletActivity } from '../hooks/use-wallet';

/**
 * Tab "Biến động số dư" của trang Số dư gian hàng — bản native của `WalletActivityPanel` (web,
 * PR #276).
 *
 * Bút toán sổ ví và lệnh rút của MỘT kỳ trong một danh sách (`GET /shop/wallet/activity`), mới
 * nhất trước, phân trang ở server. Thay cho hai khối "Lệnh rút" + "Sổ giao dịch" tách rời trước
 * đây: lệnh rút là một dòng của chính nó, kèm trạng thái, hạn chuyển, lý do và nút huỷ khi
 * `cancellable`.
 */
export function WalletActivityPanel({
  filters,
  onFiltersChange,
  loadMoreRef,
}: {
  filters: WalletStatementFilters;
  onFiltersChange: (patch: Partial<WalletStatementFilters>) => void;
  /** Màn chứa gọi `current()` khi cuộn gần đáy (`Screen onNearEnd`) - cuộn vô hạn. */
  loadMoreRef: MutableRefObject<(() => void) | null>;
}) {
  const colors = useColors();
  const t = useTranslations('Wallet');
  const tCommon = useTranslations('Common');
  const query = useWalletActivity(filters, true);
  const data = query.data;
  /* Cuộn vô hạn (mobile-feature §5): gộp các trang đã tải, trang 1 thay toàn bộ. */
  const rows = useAccumulatedPages(data?.items, data?.page);
  const { hasNext, loadNext } = useLoadNextPage({
    page: data?.page,
    limit: data?.limit ?? WALLET_ACTIVITY_PAGE_SIZE,
    total: data?.total,
    fetching: query.isFetching,
    onPage: (page) => onFiltersChange({ page }),
  });
  useEffect(() => {
    loadMoreRef.current = loadNext;
    return () => {
      if (loadMoreRef.current === loadNext) loadMoreRef.current = null;
    };
  }, [loadMoreRef, loadNext]);
  const loadingMore = query.isFetching && filters.page > 1;

  /** Tháng sau chưa xảy ra — trần là tháng HIỆN TẠI theo giờ VN, như bảng tổng hợp. */
  const maxPeriod = useMemo(() => nowInAppTz().format(MONTH_PERIOD_FORMAT), []);

  return (
    <YStack gap={space.sm}>
      {/* Ô tháng trải ngang "Tháng 10/2026" ngay dưới hàng tab (Figma `24612:145586`). */}
      <MonthPeriodField
        variant="compact"
        block
        display={t('month.value', { month: periodLabel(filters.period) })}
        label={t('statement.period')}
        value={filters.period}
        maxPeriod={maxPeriod}
        onChange={(period) => onFiltersChange({ period, page: 1 })}
      />

      {query.isError && !data ? (
        <Callout tone="danger" title={t('activity.loadError')}>
          <Button
            label={tCommon('actions.retry')}
            variant="secondary"
            size="sm"
            block={false}
            onPress={() => void query.refetch()}
          />
        </Callout>
      ) : null}

      {query.isPending && !data ? <MiniRowsSkeleton rows={4} /> : null}

      {data ? (
        data.items.length === 0 ? (
          <Card tone="muted" lift="flat">
            <YStack gap={space.xs} ai="center">
              <EmptyText strong>{t('activity.empty.title')}</EmptyText>
              <EmptyText>{t('activity.empty.body')}</EmptyText>
            </YStack>
          </Card>
        ) : (
          <YStack gap={toPx(XP_TOKENS['space-12'])} opacity={query.isFetching && !loadingMore ? 0.6 : 1}>
            <YStack gap={toPx(XP_TOKENS['space-12'])}>
              {rows.map((row) => (
                <ActivityRow key={row.id} row={row} />
              ))}
            </YStack>
            {loadingMore ? <MiniRowsSkeleton rows={2} /> : null}
            {/* Dòng tổng giữa, cuối danh sách khi đã tải hết - cùng khuôn "N chuyến" của tab Tổng hợp. */}
            {hasNext ? null : (
              <Text col={colors.textMuted} fos={fontSize.label} ta="center">
                {t('activity.totalLabel', { count: data.total })}
              </Text>
            )}
          </YStack>
        )
      ) : null}
    </YStack>
  );
}

function EmptyText({ children, strong = false }: { children: string; strong?: boolean }) {
  const colors = useColors();
  return (
    <Text
      col={strong ? colors.text : colors.textMuted}
      fos={fontSize.bodySm}
      fow={strong ? fontWeight.semibold : fontWeight.regular}
      ta="center"
    >
      {children}
    </Text>
  );
}

/** Lệnh rút bị từ chối / đã huỷ / bị đảo không làm đổi số dư — số tiền mờ đi, như web. */
function isVoidWithdrawal(row: WalletActivity): boolean {
  if (row.source !== WALLET_ACTIVITY_SOURCE.WITHDRAWAL || !row.withdrawal) return false;
  return (
    row.withdrawal.status === WITHDRAWAL_STATUS.REJECTED ||
    row.withdrawal.status === WITHDRAWAL_STATUS.CANCELLED ||
    row.withdrawal.status === WITHDRAWAL_STATUS.REVERSED
  );
}

function ActivityRowImpl({ row }: { row: WalletActivity }) {
  const colors = useColors();
  const t = useTranslations('Wallet');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();
  const cancel = useCancelWithdrawal(WALLET_SCOPE.SHOP);
  const [confirming, setConfirming] = useState(false);

  const w = row.withdrawal;
  const statusColor: StatusColor = w
    ? (WITHDRAWAL_STATUS_META[w.status as WithdrawalStatus]?.color ?? STATUS_COLOR.NEUTRAL)
    : STATUS_COLOR.SUCCESS;
  const statusLabel = w ? domainLabel('withdrawalStatus', w.status) : t('activity.posted');

  const kind = w
    ? t('activity.withdrawalKind')
    : row.kind
      ? domainLabel('walletEntryKind', row.kind)
      : tCommon('labels.emptyValue');

  const detail = !w
    ? null
    : w.status === WITHDRAWAL_STATUS.REJECTED && w.rejectReason
      ? t('requests.rejected', { reason: w.rejectReason })
      : w.status === WITHDRAWAL_STATUS.REVERSED
        ? t('requests.reversed', { reason: w.reverseReason ?? '' })
        : w.paidAt
          ? t('requests.paidAt', { time: fmt.dateTime(w.paidAt) })
          : w.dueBy &&
              (w.status === WITHDRAWAL_STATUS.PENDING || w.status === WITHDRAWAL_STATUS.APPROVED)
            ? t('requests.dueBy', { time: fmt.dateTime(w.dueBy) })
            : null;

  const muted = isVoidWithdrawal(row);

  const negative = isNegativeMoney(row.amount);
  const amountText = isZeroMoney(row.amount)
    ? fmt.money('0')
    : `${negative ? '-' : '+'}${fmt.money(absoluteMoney(row.amount) ?? '0')}`;

  /*
   * Một giao dịch = ba hàng gọn, cùng khuôn thẻ chuyến của tab Tổng hợp:
   *  1. mã (14 semibold) + viên trạng thái NGAY SAU mã; bên phải là link "Huỷ yêu cầu" (đỏ, nhỏ) khi
   *     lệnh rút còn huỷ được - không còn nút viền to đứng riêng một hàng.
   *  2. loại giao dịch (14 medium) · số tiền có dấu (14 medium) bên phải.
   *  3. giờ + ngân hàng nhận (12 `text/gray/low`) · "SD: …" bên phải.
   * Dòng lý do / hạn chuyển (nếu có) đứng cuối. Kẻ đáy `stroke/gray-low200`, khe 4.
   */
  const meta = w
    ? `${fmt.dateTime(row.occurredAt)}${LIST_SEPARATOR}${bankDisplayName(w.bankCode)} ${w.accountNumberMasked}`
    : fmt.dateTime(row.occurredAt);
  return (
    /* Thẻ trắng viền bo 12, đệm 16 - CÙNG khung thẻ chuyến của tab Tổng hợp giao dịch. */
    <YStack bg={colors.surface} bw={1} bc={colors.border} br={radius.control} p={space.md} gap={space.xs}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text
          f={1}
          minWidth={0}
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
          {...(row.bookingId
            ? {
                onPress: () => navigateOnce(ROUTES.manage.bookingDetail(row.bookingId!)),
                accessibilityRole: 'link' as const,
              }
            : {})}
        >
          {row.code ?? ''}
        </Text>
        <Pill size="sm" label={statusLabel} tone={pillToneOfStatusColor(statusColor)} />
      </XStack>

      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text
          f={1}
          minWidth={0}
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.medium}
          numberOfLines={2}
        >
          {kind}
        </Text>
        <Text
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.medium}
          opacity={muted ? 0.5 : 1}
        >
          {amountText}
        </Text>
      </XStack>

      <XStack ai="flex-start" jc="space-between" gap={space.sm}>
        <Text
          f={1}
          minWidth={0}
          col={colors.placeholder}
          fos={typeScale.label.fontSize}
          lh={typeScale.label.lineHeight}
        >
          {meta}
        </Text>
        {/* Chip trạng thái đã sang phải hàng mã - link huỷ lệnh rút đứng cuối hàng giờ. */}
        {row.cancellable ? (
          <Pressable
            onPress={() => setConfirming(true)}
            disabled={cancel.isPending}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('requests.cancel')}
          >
            <Text
              col={colors.danger}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.semibold}
              opacity={cancel.isPending ? 0.5 : 1}
            >
              {t('requests.cancel')}
            </Text>
          </Pressable>
        ) : null}
        {row.balanceAfter == null ? null : (
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {t('activity.balanceAfter', { amount: fmt.money(row.balanceAfter) })}
          </Text>
        )}
      </XStack>

      {detail ? (
        <Text
          col={muted ? colors.danger : colors.textMuted}
          fos={typeScale.label.fontSize}
          lh={typeScale.label.lineHeight}
        >
          {detail}
        </Text>
      ) : null}

      <ConfirmSheet
        open={confirming}
        title={t('requests.cancelConfirm')}
        subtitle={row.code ?? undefined}
        message={t('requests.cancelAsk')}
        confirmLabel={t('requests.cancel')}
        loading={cancel.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          cancel.mutate(row.id, {
            onSuccess: () => {
              setConfirming(false);
              toast.showSuccess(t('withdraw.cancelled'));
            },
            onError: (error) => {
              setConfirming(false);
              toast.showError(errorMessage(error));
            },
          })
        }
      />
    </YStack>
  );
}

const ActivityRow = memo(ActivityRowImpl);
