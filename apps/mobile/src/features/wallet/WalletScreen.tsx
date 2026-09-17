import { useRouter } from 'expo-router';
import { Fragment, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { absoluteMoney, isNegativeMoney } from '@xeprime/domain';
import {
  STATUS_COLOR,
  WITHDRAWAL_STATUS,
  WITHDRAWAL_STATUS_META,
  type StatusColor,
  type WithdrawalStatus,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { CardActionBar, type CardAction } from '@/components/ui/CardActionBar';
import type { IconName } from '@/components/ui/Chip';
import { Divider } from '@/components/ui/DataRow';
import { IconDisc } from '@/components/ui/IconDisc';
import { IconLine } from '@/components/ui/IconLine';
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
  const rows = entries.data?.items ?? [];

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
              <EmptyNote>{t('requests.empty')}</EmptyNote>
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
            ) : rows.length === 0 ? (
              <EmptyNote>{t('entries.empty')}</EmptyNote>
            ) : (
              /*
               * Sổ là MỘT mặt phẳng chia bằng kẻ ngang chạy sát hai mép thẻ, không phải N thẻ rời.
               * Bản trước đệm cả cụm rồi kẻ bên trong: đường kẻ thụt vào 16pt hai đầu đọc ra như
               * vẽ hụt, và mỗi dòng phải gánh thêm một lớp `YStack` chỉ để chở đường kẻ đó.
               */
              <Card padded={false}>
                {rows.map((entry, index) => (
                  <Fragment key={entry.id}>
                    {index > 0 ? <Divider /> : null}
                    <EntryRow entry={entry} />
                  </Fragment>
                ))}
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
 * Chỗ trống của một KHỐI (chưa có lệnh rút, sổ chưa có dòng nào).
 *
 * Một dòng chữ xám thả trần dưới tiêu đề khối đọc ra như phần nội dung chưa tải xong. Cho nó một
 * mặt phẳng mờ thì nó thành câu trả lời "ở đây đang trống", đúng chỗ mà nội dung sẽ xuất hiện.
 */
function EmptyNote({ children }: { children: string }) {
  return (
    <Card tone="muted" lift="flat">
      <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
        {children}
      </Text>
    </Card>
  );
}

/**
 * Một lệnh rút — cùng khuôn thẻ với phiếu thu/chi và khoản đã trả: vạch trạng thái ở mép trái,
 * SỐ TIỀN là thứ to nhất, nhãn trạng thái đối diện, thao tác ở chân thẻ.
 *
 * Ba dòng phụ LOẠI TRỪ nhau, đúng thứ tự ưu tiên của web: bị từ chối (kèm lý do) → đã chuyển →
 * hạn chuyển. Hiện cả ba là kể ba câu chuyện cho một lệnh. Dòng đó mang MÀU của chính nó — một
 * lý do từ chối in xám giữa hai dòng xám khác là câu quan trọng nhất thẻ mà không ai đọc.
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

  const statusColor: StatusColor =
    WITHDRAWAL_STATUS_META[request.status as WithdrawalStatus]?.color ?? STATUS_COLOR.NEUTRAL;

  const note: { text: string; icon: IconName; tone?: string } | null =
    request.status === WITHDRAWAL_STATUS.REJECTED && request.rejectReason
      ? {
          text: t('requests.rejected', { reason: request.rejectReason }),
          icon: 'close-circle-outline',
          tone: colors.danger,
        }
      : request.paidAt
        ? {
            text: t('requests.paidAt', { time: fmt.dateTime(request.paidAt) }),
            icon: 'checkmark-circle-outline',
            tone: colors.success,
          }
        : request.dueBy
          ? { text: t('requests.dueBy', { time: fmt.dateTime(request.dueBy) }), icon: 'time-outline' }
          : null;

  const actions: CardAction[] =
    request.status === WITHDRAWAL_STATUS.PENDING
      ? [
          {
            key: 'cancel',
            label: t('requests.cancel'),
            icon: 'close-circle-outline',
            tone: 'danger',
            onPress: () => setConfirming(true),
          },
        ]
      : [];

  return (
    <>
      <Card padded={false}>
        <XStack>
          <CardAccent color={statusColor} />

          <YStack f={1} minWidth={0}>
            <YStack p={space.sm} gap={space.xs}>
              <XStack ai="center" gap={space.xs}>
                <Text
                  f={1}
                  minWidth={0}
                  col={colors.text}
                  fos={fontSize.h4}
                  fow={fontWeight.bold}
                  numberOfLines={1}
                >
                  {fmt.money(request.amount)}
                </Text>
                <StatusBadge
                  label={domainLabel('withdrawalStatus', request.status)}
                  color={statusColor}
                  size="sm"
                />
              </XStack>

              {/* Tiền về ĐÂU — mẩu người ta soát lại trước khi chờ hai ngày làm việc. */}
              <IconLine icon="card-outline" iconTone={colors.primaryActive} strong>
                {`${request.bankCode} · ${request.accountNumberMasked}`}
              </IconLine>

              <IconLine icon="receipt-outline">{request.code}</IconLine>

              {note ? (
                <IconLine icon={note.icon} {...(note.tone ? { tone: note.tone } : {})}>
                  {note.text}
                </IconLine>
              ) : null}
            </YStack>

            <CardActionBar actions={actions} />
          </YStack>
        </XStack>
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

/**
 * Một dòng sổ. `amount` dương = điểm vào ví, âm = ra — dấu, MÀU và HÌNH phải nói cùng một điều.
 *
 * Đĩa mũi tên ở đầu dòng là thứ phân loại dòng TRƯỚC KHI mắt kịp đọc chữ: trên một trang hai mươi
 * dòng, một dấu `+`/`−` ở tận mép phải bắt người ta đọc từng con số mới thấy được nhịp vào/ra của
 * cả trang.
 */
function EntryRow({ entry }: { entry: WalletEntry }) {
  const t = useTranslations('Wallet');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  // Tiền đọc trên CHUỖI, không qua `Number` (ADR 0007) — hai helper này tính trên bigint.
  const positive = !isNegativeMoney(entry.amount);
  const tone = positive ? colors.success : colors.danger;

  return (
    <XStack ai="center" gap={space.sm} px={space.md} py={space.sm}>
      <IconDisc
        icon={positive ? 'arrow-down' : 'arrow-up'}
        tone={tone}
        surface={positive ? colors.successSurface : colors.dangerSurface}
      />

      <YStack f={1} minWidth={0} gap={2}>
        <Text
          col={colors.text}
          fos={fontSize.bodySm}
          fow={fontWeight.medium}
          numberOfLines={1}
        >
          {domainLabel('walletEntryKind', entry.kind)}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {fmt.dateTime(entry.createdAt)}
        </Text>
      </YStack>

      <YStack ai="flex-end" gap={2}>
        <Text col={tone} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {/* Dấu TRỪ thật (U+2212), không phải gạch nối — cùng ký tự web dùng. */}
          {positive ? '+' : '−'}
          {fmt.money(absoluteMoney(entry.amount) ?? entry.amount)}
        </Text>
        <Text col={colors.placeholder} fos={fontSize.label}>
          {t('entries.balanceAfter', { amount: fmt.money(entry.balanceAfter) })}
        </Text>
      </YStack>
    </XStack>
  );
}
