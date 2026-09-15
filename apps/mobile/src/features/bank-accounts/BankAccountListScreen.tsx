import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STATUS_COLOR } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { BANK_ACCOUNT_SCOPE, type BankAccount, type BankAccountScope } from '@/api/bank-accounts/api';
import { BankAccountFormSheet } from './components/BankAccountFormSheet';
import {
  useArchiveBankAccount,
  useBankAccounts,
  useSetDefaultBankAccount,
} from './hooks/use-bank-accounts';

/**
 * Danh sách tài khoản NHẬN TIỀN — bản native của `BankAccountList`.
 *
 * Dùng chung khu cá nhân và khu gian hàng, khác nhau đúng ở `scope` (ADR 0023 điều 7: một bộ cho
 * cả hai phía). Số tài khoản hiện dạng CHE: người dùng chỉ cần nhận ra tài khoản nào là của mình.
 * Muốn đọc lại số đầy đủ thì mở app ngân hàng — không phải mở màn này.
 *
 * Không có nút "sửa": đổi số tài khoản tại chỗ sẽ âm thầm đổi đích của lệnh chuyển đang chờ.
 * Thêm cái mới rồi bỏ cái cũ là hai hành động người dùng nhìn thấy và kiểm chứng được.
 *
 * KHÔNG gác bằng `OwnerGate`: khách thuê cũng cần khai tài khoản để nhận tiền hoàn cọc, và họ là
 * phần đông người dùng — đúng như web để trang này ngoài cổng chủ xe.
 */
export function BankAccountListScreen({
  scope = BANK_ACCOUNT_SCOPE.ACCOUNT,
}: {
  scope?: BankAccountScope;
}) {
  const t = useTranslations('BankAccounts');
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);

  const query = useBankAccounts(scope);
  const accounts = query.data ?? [];

  const addButton = <Button label={t('actions.add')} icon="add" onPress={() => setFormOpen(true)} />;

  return (
    <>
      <AppHeader
        onBack={() => goBackOr(router, ROUTES.account.home())}
        title={t('title')}
        subtitle={t('subtitle')}
      />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.md}>
          {addButton}

          {query.isLoading ? (
            <MiniRowsSkeleton rows={3} />
          ) : query.isError ? (
            <ScreenError
              error={query.error}
              title={t('loadError')}
              onRetry={() => void query.refetch()}
            />
          ) : accounts.length === 0 ? (
            <ScreenMessage icon="card-outline" title={t('empty')} />
          ) : (
            accounts.map((account) => (
              <BankAccountRow key={account.id} account={account} scope={scope} />
            ))
          )}
        </YStack>
      </Screen>

      <BankAccountFormSheet scope={scope} open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}

/**
 * Một tài khoản nhận tiền.
 *
 * "Đặt làm mặc định" chỉ hiện khi nó CHƯA mặc định — một nút không làm gì là một nút để người ta
 * bấm rồi tự hỏi vì sao không có gì xảy ra. "Bỏ dùng" luôn có, và luôn hỏi lại: lệnh chuyển đã
 * thực hiện vẫn giữ thông tin cũ, nhưng người dùng cần được nói điều đó TRƯỚC khi bấm.
 */
function BankAccountRow({ account, scope }: { account: BankAccount; scope: BankAccountScope }) {
  const t = useTranslations('BankAccounts');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const setDefault = useSetDefaultBankAccount(scope);
  const archive = useArchiveBankAccount(scope);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  return (
    <>
      <Card>
        <YStack gap={space.sm}>
          <XStack ai="flex-start" gap={space.sm}>
            <YStack
              w={36}
              h={36}
              br={radius.sm}
              bg={colors.primaryLight}
              ai="center"
              jc="center"
            >
              <Ionicons name="card-outline" size={iconSize.sm} color={colors.primaryActive} />
            </YStack>

            <YStack f={1} minWidth={0} gap={2}>
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                {account.label || account.bankCode}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {account.bankCode} · {account.accountNumberMasked}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {account.accountName}
              </Text>
            </YStack>
          </XStack>

          {account.isDefault || account.verifiedAt ? (
            <XStack gap={space.xs} flexWrap="wrap">
              {account.isDefault ? (
                <StatusBadge label={t('defaultTag')} color={STATUS_COLOR.INFO} size="sm" />
              ) : null}
              {account.verifiedAt ? (
                <StatusBadge label={t('verifiedTag')} color={STATUS_COLOR.SUCCESS} size="sm" />
              ) : null}
            </XStack>
          ) : null}

          <XStack gap={space.sm}>
            {account.isDefault ? null : (
              <Button
                label={t('actions.setDefault')}
                variant="secondary"
                size="sm"
                loading={setDefault.isPending}
                onPress={() =>
                  setDefault.mutate(account.id, {
                    onSuccess: () => toast.showSuccess(t('form.defaultChanged')),
                    onError: (error) => toast.showError(errorMessage(error)),
                  })
                }
              />
            )}
            <Button
              label={t('actions.archive')}
              variant="danger"
              size="sm"
              onPress={() => setConfirmingArchive(true)}
            />
          </XStack>
        </YStack>
      </Card>

      <AlertDialog
        open={confirmingArchive}
        title={t('actions.archiveConfirm')}
        message={t('actions.archiveHint')}
        confirmLabel={t('actions.archive')}
        destructive
        loading={archive.isPending}
        onCancel={() => setConfirmingArchive(false)}
        onConfirm={() =>
          archive.mutate(account.id, {
            onSuccess: () => {
              setConfirmingArchive(false);
              toast.showSuccess(t('form.archived'));
            },
            onError: (error) => {
              setConfirmingArchive(false);
              toast.showError(errorMessage(error));
            },
          })
        }
      />
    </>
  );
}
