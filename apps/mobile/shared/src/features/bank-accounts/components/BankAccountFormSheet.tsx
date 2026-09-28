import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { VIETNAM_BANKS } from '@xeprime/domain';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
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
 * ## Ngân hàng là ô CHỌN, không phải ô gõ (16/09/2026)
 *
 * Trước đợt này nó là chữ tự do với gợi ý "VCB, ACB, TCB…" — ô nguy hiểm nhất trên đường tiền đi
 * ra. Mã gõ sai thì lệnh chuyển hoặc bị trả về sau vài ngày, hoặc trỏ về một nhà băng khác. Danh
 * mục sống ở `@xeprime/domain` (`VIETNAM_BANKS`), dùng chung với web và đúng bộ mã VietQR mà QR
 * trả cọc đang dùng.
 *
 * Ba ô bắt buộc, không có ô nào tuỳ tiện: ngân hàng và số tài khoản dựng nên lệnh chuyển,
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
  /*
   * Lọc TẠI CHỖ, khác ô xã/phường.
   *
   * Danh mục ngân hàng là hằng nằm sẵn trong bundle (35 dòng), nên không có gì để hỏi server;
   * `SelectField` chỉ đẩy chữ đang gõ ra ngoài, còn lọc là việc của nơi gọi.
   */
  const [bankSearch, setBankSearch] = useState('');

  /*
   * Nhãn ghép tên gọi hằng ngày + tên đầy đủ: VIB và VietinBank, SCB và Sacombank là bốn cái tên
   * mà người gõ vội chọn nhầm, và chọn nhầm ở đây là tiền đi sai chỗ. Tên ngân hàng KHÔNG dịch —
   * đó là tên riêng (ADR 0012).
   */
  const bankOptions = useMemo(() => {
    const needle = bankSearch.trim().toLowerCase();
    return VIETNAM_BANKS.filter(
      (bank) =>
        !needle ||
        bank.code.toLowerCase().includes(needle) ||
        bank.shortName.toLowerCase().includes(needle) ||
        bank.fullName.toLowerCase().includes(needle),
    ).map((bank) => ({ value: bank.code, label: `${bank.shortName} — ${bank.fullName}` }));
  }, [bankSearch]);

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
        {/* Ba mươi lăm nhà băng — gõ vài chữ nhanh hơn cuộn, đúng `showSearch` của web. */}
        <SelectField
          control={control}
          name="bankCode"
          label={t('bankCode')}
          options={bankOptions}
          placeholder={t('bankCodePlaceholder')}
          onSearch={setBankSearch}
          searchPlaceholder={t('bankCodePlaceholder')}
          emptyText={t('bankNotFound')}
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
