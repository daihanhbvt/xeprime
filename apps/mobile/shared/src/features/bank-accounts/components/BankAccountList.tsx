import { useState, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { BankCardEmptyArt } from '@/components/state/BankCardEmptyArt';
import { SectionHeader } from '@/components/ui/CardTitle';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconDisc } from '@/components/ui/IconDisc';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space, typeScale } from '@/theme/tokens';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { BANK_ACCOUNT_SCOPE, type BankAccount, type BankAccountScope } from '@/api/bank-accounts/api';
import { bankAccountTitle, currentBankAccount } from '../current-account';
import { BankAccountCard } from './BankAccountCard';
import { BankAccountFormSheet } from './BankAccountFormSheet';
import {
  useBankAccounts,
  useCancelChangeRequest,
  useCurrentChangeRequest,
} from '../hooks/use-bank-accounts';
import { Callout } from '@/components/ui/Callout';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';

/**
 * Tài khoản NHẬN TIỀN — bản native của web `BankAccountList` sau PR #159.
 *
 * Mỗi chủ MỘT tài khoản: khối này hiện đúng MỘT thẻ (hoặc lời mời khai khi chưa có), kèm "Đổi tài
 * khoản" (mở tấm khai ở luồng THAY). Không có "Bỏ dùng". Không còn "đặt làm mặc định" — `PATCH /default`
 * đã bị server bỏ nghĩa.
 *
 * Dùng chung khu cá nhân và khu gian hàng, khác nhau đúng ở `scope` (ADR 0023 điều 7). Chỗ đứng:
 * phần PAYOUT trong màn số dư — của chủ gian hàng (app Partner) và của tài khoản khách (tab "Tài
 * khoản thanh toán", design Account 22/10/2026).
 *
 * `formOpen`/`onFormOpenChange` để nơi gọi mượn công tắc mở tấm khai (màn riêng đặt nút ở thanh
 * trên). Bỏ trống thì component tự giữ trạng thái.
 *
 * `detailed` + `footer` — dáng tab "Tài khoản thanh toán" của tài khoản khách (web
 * `BankAccountList appearance="account"`): thẻ tài khoản hình `detail` (nơi gọi đặt khối trong
 * một thẻ), và khối lưu ý dưới thẻ khi đã biết có/không có tài khoản.
 */
export function BankAccountList({
  scope,
  title,
  hint,
  formOpen: controlledOpen,
  onFormOpenChange,
  showAddButton = true,
  detailed = false,
  footer,
  appearance = 'default',
}: {
  scope: BankAccountScope;
  /** Tiêu đề khối — chỉ cần khi khối nằm LẪN giữa các khối khác. */
  title?: string;
  /** Dòng giải thích dưới tiêu đề (vd. `Wallet.payout.hint`). */
  hint?: string;
  formOpen?: boolean;
  onFormOpenChange?: (open: boolean) => void;
  /** `false` khi nơi gọi đã treo nút thêm/đổi ở thanh trên. */
  showAddButton?: boolean;
  /** Thẻ tài khoản hình `detail` (tab Tài khoản thanh toán của tài khoản khách). */
  detailed?: boolean;
  /** Nội dung dưới thẻ (khối lưu ý) — chỉ hiện khi đã tải xong. */
  footer?: ReactNode;
  /**
   * `wallet` - khối trong thẻ số dư của trang Quản lý ví (Figma Partner-XePrime `24228:102193`):
   * tiêu đề chữ trơn 16/24, trạng thái rỗng căn giữa (minh hoạ 64 + tiêu đề + câu dẫn + nút viền
   * "+ Thêm tài khoản"). Câu `hint` chỉ hiện khi ĐÃ có tài khoản - lúc rỗng câu dẫn của Figma thay nó.
   */
  appearance?: 'default' | 'wallet';
}) {
  const colors = useColors();
  const t = useTranslations('BankAccounts');
  const [localOpen, setLocalOpen] = useState(false);

  const formOpen = controlledOpen ?? localOpen;
  const setFormOpen = onFormOpenChange ?? setLocalOpen;

  const query = useBankAccounts(scope);
  const account = currentBankAccount(query.data);
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  /*
   * Tài khoản KHOÁ sau lần khai đầu (biên bản họp 19/11/2026, web `BankAccountList`): đổi qua YÊU
   * CẦU chờ XePrime gọi xác minh. Đang có yêu cầu chờ ⇒ hiện yêu cầu + nút huỷ, ẩn nút yêu cầu mới.
   */
  const changeRequest = useCurrentChangeRequest(scope, Boolean(account));
  const pendingRequest = account ? (changeRequest.data ?? null) : null;
  const cancelRequest = useCancelChangeRequest(scope);
  const canChange = Boolean(account) && !changeRequest.isLoading && !pendingRequest;
  const walletLook = appearance === 'wallet';

  return (
    <>
      <YStack gap={walletLook ? toPx(XP_TOKENS['space-12']) : space.sm} {...(walletLook ? { p: space.sm } : {})}>
        {title && walletLook ? (
          <Text
            col={colors.text}
            fos={typeScale.title.fontSize}
            lh={typeScale.title.lineHeight}
            fow={fontWeight.semibold}
          >
            {title}
          </Text>
        ) : title ? (
          <SectionHeader icon="card-outline">{title}</SectionHeader>
        ) : null}
        {hint && !(walletLook && !account) ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {hint}
          </Text>
        ) : null}

        {query.isLoading ? (
          <MiniRowsSkeleton rows={2} />
        ) : query.isError ? (
          <ScreenError
            error={query.error}
            title={t('loadError')}
            onRetry={() => void query.refetch()}
          />
        ) : account ? (
          <CurrentAccount
            account={account}
            detailed={detailed}
            showChange={showAddButton && canChange}
            onChange={() => setFormOpen(true)}
          />
        ) : walletLook ? (
          <YStack ai="center" gap={space.sm}>
            <YStack ai="center">
              <BankCardEmptyArt />
              <YStack ai="center" gap={space.xs} alignSelf="stretch">
                <Text
                  col={colors.text}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.semibold}
                  ta="center"
                >
                  {t('emptyTitle')}
                </Text>
                <Text
                  col={colors.textMuted}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  ta="center"
                >
                  {t('emptyHint')}
                </Text>
              </YStack>
            </YStack>
            {showAddButton ? (
              <Button
                label={t('actions.add')}
                lineIcon="add"
                variant="neutral"
                size="sm"
                block={false}
                onPress={() => setFormOpen(true)}
              />
            ) : null}
          </YStack>
        ) : title || hint ? (
          /* Rỗng khi NẰM LẪN giữa các khối khác: một thẻ một dòng, không chiếm nửa màn hình. */
          <Card>
            <XStack ai="center" gap={space.sm} flexWrap="wrap">
              <IconDisc
                icon="card-outline"
                tone={colors.accentText}
                surface={colors.primaryLight}
              />
              <YStack f={1} minWidth={120} gap={2}>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {t('emptyTitle')}
                </Text>
                {/* Câu nói vì sao cần khai — web khối "Tài khoản nhận tiền" của site partner (PR #276). */}
                {scope === BANK_ACCOUNT_SCOPE.SHOP ? (
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {t('emptyHint')}
                  </Text>
                ) : null}
              </YStack>
              <Button
                label={t('actions.add')}
                icon="add"
                size="sm"
                variant="secondary"
                onPress={() => setFormOpen(true)}
              />
            </XStack>
          </Card>
        ) : (
          <ScreenMessage
            icon="card-outline"
            title={t('emptyTitle')}
            description={t('subtitle')}
            // Màn trống dữ liệu chỉ mô tả, không nút thêm (người dùng chốt 27/10/2026).
          />
        )}

        {pendingRequest ? (
          <Callout
            tone="info"
            title={t('pendingRequest.title', {
              account: `${bankAccountTitle(pendingRequest)} · ${pendingRequest.accountNumberMasked}`,
            })}
          >
            <YStack gap={space.sm}>
              <Text col={colors.text} fos={fontSize.bodySm}>
                {t('pendingRequest.body')}
              </Text>
              <Button
                label={t('pendingRequest.cancel')}
                size="sm"
                variant="secondary"
                block={false}
                loading={cancelRequest.isPending}
                onPress={() =>
                  cancelRequest.mutate(pendingRequest.id, {
                    onSuccess: () => toast.showSuccess(t('pendingRequest.cancelled')),
                    onError: (err) => toast.showError(errorMessage(err)),
                  })
                }
              />
            </YStack>
          </Callout>
        ) : null}

        {!query.isLoading && !query.isError && footer ? footer : null}
      </YStack>

      <BankAccountFormSheet
        scope={scope}
        open={formOpen}
        replacing={account}
        onClose={() => setFormOpen(false)}
      />
    </>
  );
}

/**
 * Thẻ tài khoản đang dùng + MỘT lối: Đổi tài khoản. Không có "Bỏ dùng" — web PR #159 bỏ nó: mỗi
 * chủ luôn giữ đúng một tài khoản nhận tiền, đổi là THAY chứ không gỡ (gỡ xong thì lệnh rút/hoàn
 * tiền kế tiếp kẹt cho tới khi khai lại).
 */
function CurrentAccount({
  account,
  detailed,
  showChange,
  onChange,
}: {
  account: BankAccount;
  detailed: boolean;
  showChange: boolean;
  onChange: () => void;
}) {
  const t = useTranslations('BankAccounts');

  return (
    <BankAccountCard
      account={account}
      variant={detailed ? 'detail' : 'row'}
      action={
        showChange ? (
          <Button
            label={t('actions.requestChange')}
            icon="swap-horizontal-outline"
            size="sm"
            variant={detailed ? 'ghost' : 'secondary'}
            onPress={onChange}
          />
        ) : undefined
      }
    />
  );
}
