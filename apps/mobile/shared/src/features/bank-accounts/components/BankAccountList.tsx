import { useState, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconDisc } from '@/components/ui/IconDisc';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { colors, fontSize, space } from '@/theme/tokens';
import type { BankAccount, BankAccountScope } from '@/api/bank-accounts/api';
import { currentBankAccount } from '../current-account';
import { BankAccountCard } from './BankAccountCard';
import { BankAccountFormSheet } from './BankAccountFormSheet';
import { useBankAccounts } from '../hooks/use-bank-accounts';

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
}) {
  const t = useTranslations('BankAccounts');
  const [localOpen, setLocalOpen] = useState(false);

  const formOpen = controlledOpen ?? localOpen;
  const setFormOpen = onFormOpenChange ?? setLocalOpen;

  const query = useBankAccounts(scope);
  const account = currentBankAccount(query.data);

  return (
    <>
      <YStack gap={space.sm}>
        {title ? <BlockTitle>{title}</BlockTitle> : null}
        {hint ? (
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
            showChange={showAddButton}
            onChange={() => setFormOpen(true)}
          />
        ) : title || hint ? (
          /* Rỗng khi NẰM LẪN giữa các khối khác: một thẻ một dòng, không chiếm nửa màn hình. */
          <Card>
            <XStack ai="center" gap={space.sm} flexWrap="wrap">
              <IconDisc
                icon="card-outline"
                tone={colors.primaryActive}
                surface={colors.primaryLight}
              />
              <Text f={1} minWidth={120} col={colors.textMuted} fos={fontSize.bodySm}>
                {t('emptyTitle')}
              </Text>
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
            actionLabel={t('actions.add')}
            actionIcon="add"
            onAction={() => setFormOpen(true)}
          />
        )}

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
            label={t('actions.change')}
            icon="swap-horizontal-outline"
            size="sm"
            variant="secondary"
            onPress={onChange}
          />
        ) : undefined
      }
    />
  );
}
