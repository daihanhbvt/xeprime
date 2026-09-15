import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ToggleRow } from '@/features/rental-policies/components/PolicySections';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import type { BankAccount, BankAccountScope } from '@/api/bank-accounts/api';
import { useCreateBankAccount } from '../hooks/use-bank-accounts';

const BANK_CODE_MAX = 20;
const ACCOUNT_NUMBER_MAX = 40;
const ACCOUNT_NAME_MAX = 160;
const LABEL_MAX = 60;

/**
 * Khai một tài khoản nhận tiền — bản native của `BankAccountForm`.
 *
 * Ba ô bắt buộc, không có ô nào tuỳ tiện: mã ngân hàng và số tài khoản dựng nên lệnh chuyển,
 * còn TÊN CHỦ TÀI KHOẢN là thứ ngân hàng đối chiếu — sai tên thì lệnh bị trả về và tiền quay
 * lại sau vài ngày mà không ai biết vì sao. Vì thế ô tên có dòng nhắc riêng.
 *
 * Không cho SỬA một tài khoản đã lưu: đổi số tại chỗ sẽ âm thầm đổi đích của những lệnh chuyển
 * đang chờ. Muốn đổi thì thêm cái mới và bỏ cái cũ — hai hành động nhìn thấy được.
 */
export function BankAccountFormSheet({
  scope,
  open,
  onClose,
  onCreated,
}: {
  scope: BankAccountScope;
  open: boolean;
  onClose: () => void;
  /** Cho luồng RÚT: chọn sẵn tài khoản vừa khai, để khách không phải tự tìm lại nó. */
  onCreated?: (account: BankAccount) => void;
}) {
  const t = useTranslations('BankAccounts.form');
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const create = useCreateBankAccount(scope);

  const schema = useMemo(
    () =>
      yup.object({
        bankCode: yup.string().trim().required(t('validation.bankRequired')).max(BANK_CODE_MAX),
        accountNumber: yup
          .string()
          .trim()
          .required(t('validation.numberRequired'))
          // Cho phép khoảng trắng khi gõ/dán; server chuẩn hoá bỏ chúng trước khi lưu.
          .matches(/^[0-9\s]+$/, t('validation.numberDigits'))
          .max(ACCOUNT_NUMBER_MAX),
        accountName: yup.string().trim().required(t('validation.nameRequired')).max(ACCOUNT_NAME_MAX),
        label: yup.string().trim().max(LABEL_MAX).default(''),
        isDefault: yup.boolean().required(),
      }),
    [t],
  );

  const { control, handleSubmit, reset, setValue } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      bankCode: '',
      accountNumber: '',
      accountName: '',
      label: '',
      isDefault: false,
    },
  });

  /*
   * `useWatch` chứ không phải `watch()`: bản kia trả về một HÀM mà React Compiler không memo hoá
   * an toàn được, nên nó bỏ tối ưu cho cả component. Cùng dữ liệu, không mất gì.
   */
  const isDefault = useWatch({ control, name: 'isDefault' });

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit = handleSubmit((values) => {
    create.mutate(
      {
        bankCode: values.bankCode,
        accountNumber: values.accountNumber,
        accountName: values.accountName,
        ...(values.label ? { label: values.label } : {}),
        isDefault: values.isDefault,
      },
      {
        onSuccess: (account) => {
          toast.showSuccess(t('created'));
          reset();
          onCreated?.(account);
          onClose();
        },
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  });

  return (
    <BottomSheet open={open} onClose={close} title={t('title')}>
      <YStack gap={space.md}>
        <TextField
          control={control}
          name="bankCode"
          label={t('bankCode')}
          placeholder={t('bankCodePlaceholder')}
          autoCapitalize="characters"
          required
        />
        <TextField
          control={control}
          name="accountNumber"
          label={t('accountNumber')}
          keyboardType="number-pad"
          required
        />
        <TextField
          control={control}
          name="accountName"
          label={t('accountName')}
          hint={t('accountNameHint')}
          autoCapitalize="characters"
          required
        />
        <TextField
          control={control}
          name="label"
          label={t('label')}
          placeholder={t('labelPlaceholder')}
        />
        <ToggleRow
          label={t('isDefault')}
          checked={isDefault}
          onToggle={() => setValue('isDefault', !isDefault, { shouldDirty: true })}
        />

        <YStack gap={space.sm}>
          <Button label={t('submit')} loading={create.isPending} onPress={() => void onSubmit()} />
          <Button
            label={tCommon('cancel')}
            variant="ghost"
            disabled={create.isPending}
            onPress={close}
          />
        </YStack>
      </YStack>
    </BottomSheet>
  );
}
