import { Fragment, memo, useMemo, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { bankDisplayName, nowInAppTz } from '@xeprime/domain';
import {
  STATUS_COLOR,
  WALLET_ACTIVITY_SOURCE,
  WITHDRAWAL_STATUS,
  WITHDRAWAL_STATUS_META,
  type StatusColor,
  type WithdrawalStatus,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/DataRow';
import { MONTH_PERIOD_FORMAT, MonthPeriodField } from '@/components/ui/MonthPeriodField';
import { Pagination } from '@/components/ui/Pagination';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import {
  WALLET_ACTIVITY_PAGE_SIZE,
  WALLET_SCOPE,
  type WalletActivity,
  type WalletStatementFilters,
} from '@/api/wallet/api';
import { useCancelWithdrawal, useWalletActivity } from '../hooks/use-wallet';
import { SignedAmount } from './WalletStatementPanel';

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
}: {
  filters: WalletStatementFilters;
  onFiltersChange: (patch: Partial<WalletStatementFilters>) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Wallet');
  const tCommon = useTranslations('Common');
  const query = useWalletActivity(filters, true);
  const data = query.data;

  /** Tháng sau chưa xảy ra — trần là tháng HIỆN TẠI theo giờ VN, như bảng tổng hợp. */
  const maxPeriod = useMemo(() => nowInAppTz().format(MONTH_PERIOD_FORMAT), []);

  return (
    <YStack gap={space.sm}>
      <BlockTitle>{t('activity.title')}</BlockTitle>

      <MonthPeriodField
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
          <YStack opacity={query.isFetching ? 0.6 : 1}>
            <Text pb={space.xs} fos={fontSize.label} col={colors.textMuted}>
              {t('activity.totalLabel', { count: data.total })}
            </Text>
            <YStack mx={-space.md}>
              {data.items.map((row, index) => (
                <Fragment key={row.id}>
                  {index > 0 ? <Divider /> : null}
                  <ActivityRow row={row} />
                </Fragment>
              ))}
            </YStack>
            {data.total > (data.limit ?? WALLET_ACTIVITY_PAGE_SIZE) ? (
              <Pagination
                page={data.page}
                limit={data.limit ?? WALLET_ACTIVITY_PAGE_SIZE}
                total={data.total}
                onChange={(page) => onFiltersChange({ page })}
              />
            ) : null}
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

  return (
    <YStack px={space.md} py={space.sm} gap={space.xs}>
      <XStack ai="flex-start" gap={space.sm}>
        <YStack f={1} minWidth={0} gap={2}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold} numberOfLines={2}>
            {kind}
          </Text>
          {row.code ? (
            <Text
              col={row.bookingId ? colors.primaryActive : colors.textMuted}
              fos={fontSize.label}
              numberOfLines={1}
              {...(row.bookingId
                ? {
                    onPress: () => navigateOnce(ROUTES.manage.bookingDetail(row.bookingId!)),
                    accessibilityRole: 'link' as const,
                  }
                : {})}
            >
              {row.code}
            </Text>
          ) : null}
          {w ? (
            <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
              {`${bankDisplayName(w.bankCode)} · ${w.accountNumberMasked}`}
            </Text>
          ) : null}
          <Text col={colors.placeholder} fos={fontSize.label}>
            {fmt.dateTime(row.occurredAt)}
          </Text>
        </YStack>
        <YStack ai="flex-end" gap={2}>
          <YStack opacity={muted ? 0.5 : 1}>
            <SignedAmount value={row.amount} strong />
          </YStack>
          {row.balanceAfter == null ? null : (
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('activity.balanceAfter', { amount: fmt.money(row.balanceAfter) })}
            </Text>
          )}
          <StatusBadge label={statusLabel} color={statusColor} size="sm" />
        </YStack>
      </XStack>

      {detail ? (
        <Text col={muted ? colors.danger : colors.textMuted} fos={fontSize.label}>
          {detail}
        </Text>
      ) : null}

      {row.cancellable ? (
        <XStack jc="flex-end">
          <Button
            label={t('requests.cancel')}
            variant="secondary"
            size="sm"
            block={false}
            loading={cancel.isPending}
            onPress={() => setConfirming(true)}
          />
        </XStack>
      ) : null}

      <AlertDialog
        open={confirming}
        title={t('requests.cancelConfirm')}
        message={t('requests.cancelHint')}
        confirmLabel={t('requests.cancel')}
        loading={cancel.isPending}
        onCancel={() => setConfirming(false)}
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
