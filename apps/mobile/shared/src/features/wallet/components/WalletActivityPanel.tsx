import { memo, useMemo, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  absoluteMoney,
  bankDisplayName,
  isNegativeMoney,
  isZeroMoney,
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
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import {
  MONTH_PERIOD_FORMAT,
  MonthPeriodField,
  periodLabel,
} from '@/components/ui/MonthPeriodField';
import { Pagination } from '@/components/ui/Pagination';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space, typeScale } from '@/theme/tokens';
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
          <YStack opacity={query.isFetching ? 0.6 : 1}>
            <Text pb={space.xs} fos={fontSize.label} col={colors.textMuted}>
              {t('activity.totalLabel', { count: data.total })}
            </Text>
            <YStack gap={space.sm}>
              {data.items.map((row, index) => (
                <ActivityRow key={row.id} row={row} last={index === data.items.length - 1} />
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

function ActivityRowImpl({ row, last }: { row: WalletActivity; last: boolean }) {
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
   * Figma "Transaction" `24612:145588`: hàng 1 mã (14 semibold) + viên trạng thái; hàng 2 loại
   * giao dịch (14 medium) + giờ (12 `text/gray/low`) bên trái, số tiền (14 medium, màu chữ thường,
   * có dấu) + "SD: …" bên phải. Kẻ đáy `stroke/gray-low200`, đệm đáy 8, khe 8. Các dòng phụ (ngân
   * hàng, lý do, hạn chuyển) và nút huỷ lệnh rút giữ ở dưới (người dùng chốt 25/11/2026).
   */
  return (
    <YStack
      gap={space.sm}
      pb={space.sm}
      {...(last ? {} : { borderBottomWidth: 1, borderColor: colors.border })}
    >
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text
          f={1}
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
        <Pill label={statusLabel} tone={pillToneOfStatusColor(statusColor)} />
      </XStack>

      <XStack ai="flex-start" jc="space-between" gap={space.sm}>
        <YStack f={1} minWidth={0} gap={2}>
          <Text
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.medium}
            numberOfLines={2}
          >
            {kind}
          </Text>
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {fmt.dateTime(row.occurredAt)}
          </Text>
          {w ? (
            <Text
              col={colors.placeholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              numberOfLines={1}
            >
              {`${bankDisplayName(w.bankCode)} · ${w.accountNumberMasked}`}
            </Text>
          ) : null}
        </YStack>
        <YStack ai="flex-end" gap={2}>
          <Text
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.medium}
            opacity={muted ? 0.5 : 1}
          >
            {amountText}
          </Text>
          {row.balanceAfter == null ? null : (
            <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {t('activity.balanceAfter', { amount: fmt.money(row.balanceAfter) })}
            </Text>
          )}
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
