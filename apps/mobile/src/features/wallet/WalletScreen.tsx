import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { absoluteMoney, isNegativeMoney } from '@xeprime/domain';
import {
  STATUS_COLOR,
  WITHDRAWAL_STATUS,
  WITHDRAWAL_STATUS_META,
  type WithdrawalStatus,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/DataRow';
import { Pagination } from '@/components/ui/Pagination';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import {
  WALLET_ENTRIES_PAGE_SIZE,
  WALLET_SCOPE,
  type WalletEntry,
  type WalletScope,
  type WithdrawalRequest,
} from '@/api/wallet/api';
import { WalletSummaryCard } from './components/WalletSummaryCard';
import { WithdrawSheet } from './components/WithdrawSheet';
import { useCancelWithdrawal, useWalletEntries, useWithdrawals } from './hooks/use-wallet';

const ENTRIES_LIMIT = WALLET_ENTRIES_PAGE_SIZE;

/**
 * Ví điểm — bản native của `WalletView`. Dùng chung khu cá nhân và khu gian hàng, khác nhau đúng ở
 * `scope` (ADR 0023 điều 7: một bộ cho cả hai phía).
 *
 * Ba khối theo đúng thứ tự câu hỏi: *tôi có bao nhiêu* → *tiền đang đi tới đâu* → *nó đến từ đâu*.
 * Sổ phân trang ở SERVER: một chủ xe chạy vài trăm chuyến một năm có sổ dài hàng nghìn dòng, và
 * cuộn vô hạn ở đây là bắt người ta cuộn mãi để tìm một dòng họ biết là nằm ở tháng nào.
 *
 * ADR 0033: đây là SỔ CÔNG NỢ XePrime phải trả, KHÔNG phải ví điện tử — không nạp, không chuyển
 * ngang, không thanh toán nội bộ. Ba thao tác duy nhất: xem, rút, huỷ lệnh rút.
 */
export function WalletScreen({ scope = WALLET_SCOPE.ACCOUNT }: { scope?: WalletScope }) {
  const t = useTranslations('Wallet');
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const entries = useWalletEntries(scope, page);
  const withdrawals = useWithdrawals(scope);
  const requests = withdrawals.data ?? [];

  const isShop = scope === WALLET_SCOPE.SHOP;
  const title = t(isShop ? 'title.tenant' : 'title.user');

  /*
   * Hai VỎ cho cùng một màn: khu gian hàng có thanh quản lý + tiêu đề trang, khu tài khoản có nút
   * lui về menu. Cùng khuôn mà `CalendarScreen` đang dùng — thân màn không biết mình đang ở đâu.
   */
  const header = isShop ? (
    <ManageHeader />
  ) : (
    <AppHeader onBack={() => goBackOr(router, ROUTES.account.home())} title={title} />
  );

  return (
    <>
      {header}
      <Screen edges={['left', 'right', 'bottom']}>
        {isShop ? <ManagePageTitle title={title} /> : null}

        <YStack gap={space.lg}>
          <WalletSummaryCard scope={scope} onWithdraw={() => setWithdrawOpen(true)} />

          <YStack gap={space.sm}>
            <BlockTitle>{t('requests.title')}</BlockTitle>
            {withdrawals.isPending ? (
              <MiniRowsSkeleton rows={2} />
            ) : requests.length === 0 ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('requests.empty')}
              </Text>
            ) : (
              requests.map((request) => (
                <WithdrawalRow key={request.id} request={request} scope={scope} />
              ))
            )}
          </YStack>

          <YStack gap={space.sm}>
            <BlockTitle>{t('entries.title')}</BlockTitle>
            {entries.isPending ? (
              <MiniRowsSkeleton rows={4} />
            ) : entries.isError ? (
              <ScreenError
                error={entries.error}
                title={t('loadError')}
                onRetry={() => void entries.refetch()}
              />
            ) : (entries.data?.items.length ?? 0) === 0 ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('entries.empty')}
              </Text>
            ) : (
              <Card padded={false}>
                <YStack p={space.md} gap={space.sm}>
                  {(entries.data?.items ?? []).map((entry, index) => (
                    <YStack key={entry.id} gap={space.sm}>
                      {index > 0 ? <Divider /> : null}
                      <EntryRow entry={entry} />
                    </YStack>
                  ))}
                </YStack>
              </Card>
            )}

            {(entries.data?.total ?? 0) > (entries.data?.limit ?? ENTRIES_LIMIT) ? (
              <Pagination
                page={page}
                limit={entries.data?.limit ?? ENTRIES_LIMIT}
                total={entries.data?.total ?? 0}
                onChange={setPage}
              />
            ) : null}
          </YStack>
        </YStack>
      </Screen>

      <WithdrawSheet scope={scope} open={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
    </>
  );
}

/**
 * Một lệnh rút.
 *
 * Ba dòng phụ LOẠI TRỪ nhau, đúng thứ tự ưu tiên của web: bị từ chối (kèm lý do) → đã chuyển →
 * hạn chuyển. Hiện cả ba là kể ba câu chuyện cho một lệnh.
 *
 * Nút huỷ CHỈ có ở trạng thái `pending`: lệnh đã duyệt là tiền đang trên đường đi, huỷ nó ở client
 * chỉ tạo ra một nút mà server luôn từ chối.
 */
function WithdrawalRow({ request, scope }: { request: WithdrawalRequest; scope: WalletScope }) {
  const t = useTranslations('Wallet');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const cancel = useCancelWithdrawal(scope);
  const [confirming, setConfirming] = useState(false);

  const note =
    request.status === WITHDRAWAL_STATUS.REJECTED && request.rejectReason
      ? t('requests.rejected', { reason: request.rejectReason })
      : request.paidAt
        ? t('requests.paidAt', { time: fmt.dateTime(request.paidAt) })
        : request.dueBy
          ? t('requests.dueBy', { time: fmt.dateTime(request.dueBy) })
          : null;

  return (
    <>
      <Card>
        <YStack gap={space.sm}>
          <XStack ai="flex-start" gap={space.sm}>
            <YStack f={1} minWidth={0} gap={2}>
              <XStack ai="baseline" gap={space.xs}>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
                  {fmt.money(request.amount)}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {request.code}
                </Text>
              </XStack>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {request.bankCode} · {request.accountNumberMasked}
              </Text>
              {note ? (
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {note}
                </Text>
              ) : null}
            </YStack>

            <StatusBadge
              label={domainLabel('withdrawalStatus', request.status)}
              color={
                WITHDRAWAL_STATUS_META[request.status as WithdrawalStatus]?.color ??
                STATUS_COLOR.NEUTRAL
              }
              size="sm"
            />
          </XStack>

          {request.status === WITHDRAWAL_STATUS.PENDING ? (
            <Button
              label={t('requests.cancel')}
              variant="secondary"
              size="sm"
              onPress={() => setConfirming(true)}
            />
          ) : null}
        </YStack>
      </Card>

      <AlertDialog
        open={confirming}
        title={t('requests.cancelConfirm')}
        message={t('requests.cancelHint')}
        confirmLabel={t('requests.cancel')}
        loading={cancel.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          cancel.mutate(request.id, {
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
    </>
  );
}

/** Một dòng sổ. `amount` dương = điểm vào ví, âm = ra — dấu và MÀU phải nói cùng một điều. */
function EntryRow({ entry }: { entry: WalletEntry }) {
  const t = useTranslations('Wallet');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  // Tiền đọc trên CHUỖI, không qua `Number` (ADR 0007) — hai helper này tính trên bigint.
  const positive = !isNegativeMoney(entry.amount);

  return (
    <XStack ai="flex-start" gap={space.sm}>
      <YStack f={1} minWidth={0} gap={2}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {domainLabel('walletEntryKind', entry.kind)}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {fmt.dateTime(entry.createdAt)}
        </Text>
      </YStack>

      <YStack ai="flex-end" gap={2}>
        <Text
          col={positive ? colors.success : colors.danger}
          fos={fontSize.bodySm}
          fow={fontWeight.semibold}
        >
          {/* Dấu TRỪ thật (U+2212), không phải gạch nối — cùng ký tự web dùng. */}
          {positive ? '+' : '−'}
          {fmt.money(absoluteMoney(entry.amount) ?? entry.amount)}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('entries.balanceAfter', { amount: fmt.money(entry.balanceAfter) })}
        </Text>
      </YStack>
    </XStack>
  );
}
