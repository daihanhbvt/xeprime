import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STATUS_COLOR, type StatusColor } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BadgeRows, type BadgeRowItem } from '@/components/ui/BadgeRows';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { CardActionBar, type CardAction } from '@/components/ui/CardActionBar';
import type { IconName } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { IconLine } from '@/components/ui/IconLine';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
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
 *
 * **Thêm tài khoản nằm ở GÓC PHẢI thanh trên, không phải một nút vàng tràn ngang đầu danh sách.**
 * Sổ này gần như luôn có đúng một, hai dòng: một nút to bằng cả bề ngang đứng trên hai thẻ đọc ra
 * như thứ chính của màn, trong khi thứ chính là chính các tài khoản. Màn rỗng thì ngược lại —
 * lối đi tiếp về giữa màn, nơi không còn gì tranh chỗ với nó.
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

  return (
    <>
      <AppHeader
        onBack={() => goBackOr(router, ROUTES.account.home())}
        title={t('title')}
        subtitle={t('subtitle')}
        right={
          <IconButton
            icon="add"
            tone="accent"
            label={t('actions.add')}
            onPress={() => setFormOpen(true)}
          />
        }
      />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.sm}>
          {query.isLoading ? (
            <MiniRowsSkeleton rows={3} />
          ) : query.isError ? (
            <ScreenError
              error={query.error}
              title={t('loadError')}
              onRetry={() => void query.refetch()}
            />
          ) : accounts.length === 0 ? (
            <ScreenMessage
              icon="card-outline"
              title={t('emptyTitle')}
              actionLabel={t('actions.add')}
              actionIcon="add"
              onAction={() => setFormOpen(true)}
            />
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

interface AccountSignal {
  readonly key: string;
  readonly label: string;
  readonly color: StatusColor;
}

/**
 * Tín hiệu của một tài khoản, THEO THỨ TỰ ưu tiên.
 *
 * Phần tử đầu vừa là viên nhãn góc trên phải vừa là màu VẠCH mép trái — hai kênh phải nói cùng
 * một điều, nếu không thì một thẻ có vạch xanh dương mà chip xanh lá đọc ra như hai bản ghi khác
 * nhau. Phần còn lại xuống dải nhãn dưới tên.
 *
 * "Mặc định" đứng trước "đã đối chiếu": nó trả lời đúng câu người dùng mở màn này ra để hỏi —
 * tiền sẽ về ĐÂU. Đối chiếu chỉ nói tài khoản đó đã được kiểm, không quyết định đích đến.
 *
 * Không có tín hiệu nào thì vạch TRUNG TÍNH và góc phải để trống: một tài khoản phụ chưa đối
 * chiếu là chuyện bình thường, không phải một trạng thái cần gọi tên.
 */
function useAccountSignals(account: BankAccount): readonly AccountSignal[] {
  const t = useTranslations('BankAccounts');

  return [
    ...(account.isDefault
      ? [{ key: 'default', label: t('defaultTag'), color: STATUS_COLOR.INFO }]
      : []),
    ...(account.verifiedAt
      ? [{ key: 'verified', label: t('verifiedTag'), color: STATUS_COLOR.SUCCESS }]
      : []),
  ];
}

/**
 * Một tài khoản nhận tiền — cùng khuôn thẻ với chi nhánh/tài xế/nhân sự.
 *
 * Dòng đầu là TÊN GỢI NHỚ (rơi về mã ngân hàng khi chưa khai), dòng giá trị bên dưới là mẩu
 * người ta mở màn này ra để đối chiếu: mã ngân hàng và số tài khoản đã che. Tên chủ tài khoản
 * xuống dòng nền — nó chỉ được đọc khi đã dừng ở đúng thẻ.
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

  const signals = useAccountSignals(account);
  const [lead, ...rest] = signals;

  const badges: BadgeRowItem[] = rest.map((signal) => ({
    key: signal.key,
    label: signal.label,
    node: <StatusBadge label={signal.label} color={signal.color} size="sm" />,
  }));

  /* Một mutation đang chạy thì khoá CẢ thanh: hai lệnh trên cùng một tài khoản là hai kết quả đua nhau. */
  const actions: CardAction[] = [
    ...(account.isDefault
      ? []
      : [
          {
            key: 'setDefault',
            label: t('actions.setDefault'),
            icon: 'star-outline' as IconName,
            loading: setDefault.isPending,
            disabled: archive.isPending,
            onPress: () =>
              setDefault.mutate(account.id, {
                onSuccess: () => toast.showSuccess(t('form.defaultChanged')),
                onError: (error) => toast.showError(errorMessage(error)),
              }),
          },
        ]),
    {
      key: 'archive',
      label: t('actions.archive'),
      icon: 'trash-outline' as IconName,
      tone: 'danger' as const,
      disabled: setDefault.isPending,
      onPress: () => setConfirmingArchive(true),
    },
  ];

  return (
    <>
      <Card padded={false}>
        <XStack>
          <CardAccent color={lead?.color ?? STATUS_COLOR.NEUTRAL} />

          <YStack f={1} minWidth={0}>
            <YStack p={space.sm} gap={space.xs}>
              {/* Tên gợi nhớ và tín hiệu dẫn đầu chung một hàng, hai đầu — khuôn của thẻ chi nhánh. */}
              <XStack ai="center" gap={space.xs}>
                <Text
                  f={1}
                  col={colors.text}
                  fos={fontSize.body}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                >
                  {account.label || account.bankCode}
                </Text>
                {lead ? <StatusBadge label={lead.label} color={lead.color} size="sm" /> : null}
              </XStack>

              <BadgeRows items={badges} />

              {/* Dòng GIÁ TRỊ: mã ngân hàng + số đã che là thứ người ta mở màn này ra để đối chiếu. */}
              <IconLine icon="card-outline" iconTone={colors.primaryActive} strong>
                {`${account.bankCode}${LIST_SEPARATOR}${account.accountNumberMasked}`}
              </IconLine>

              <IconLine icon="person-outline">{account.accountName}</IconLine>
            </YStack>

            <CardActionBar actions={actions} />
          </YStack>
        </XStack>
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
