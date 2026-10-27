'use client';

import { CreditCardOutlined, TagOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, App } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { VIETNAM_BANKS } from '@xeprime/domain';
import { DialogForm } from '@/components/form/DialogForm';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { SelectField, type SelectFieldOption } from '@/components/form/SelectField';
import { cx } from '@/lib/cx';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { useErrorMessage } from '@/i18n/use-error-message';
import { bankAccountTitle } from '../current-account';
import { useCreateBankAccount } from '../hooks/use-bank-accounts';
import type { BankAccount, BankAccountScope } from '../types';
import styles from './BankAccountForm.module.css';
import { BankAccountSavedDialog } from './BankAccountSavedDialog';
import { BankLogo } from './BankLogo';

/**
 * Khai tài khoản nhận tiền — THÊM khi chưa có, ĐỔI khi đã có (`replacing`).
 *
 * Mỗi chủ một tài khoản (07/10/2026): không còn công tắc "đặt làm mặc định" — tài khoản vừa khai
 * LÀ tài khoản nhận tiền. Ở chế độ đổi, hộp thoại nói rõ tài khoản nào sẽ bị thay, và rằng lệnh rút
 * đang chờ không đổi đích: đó là câu người ta hỏi đầu tiên khi đổi tài khoản lúc còn tiền đang về.
 *
 * Ba ô bắt buộc, không có ô nào tuỳ tiện: ngân hàng và số tài khoản dựng nên lệnh chuyển, còn
 * TÊN CHỦ TÀI KHOẢN là thứ ngân hàng đối chiếu — sai tên thì lệnh bị trả về và tiền quay lại sau
 * vài ngày mà không ai biết vì sao. Vì thế ô tên có dòng nhắc riêng.
 *
 * ## Ngân hàng là ô CHỌN, không phải ô gõ (16/09/2026)
 *
 * Trước đợt này nó là chữ tự do với gợi ý "VCB, ACB, TCB…" — ô nguy hiểm nhất trên đường tiền đi
 * ra. Mã gõ sai thì lệnh chuyển hoặc bị trả về sau vài ngày, hoặc trỏ về một nhà băng khác.
 * Danh mục sống ở `@xeprime/domain` (`VIETNAM_BANKS`) để app native dùng chung đúng bộ mã VietQR
 * mà QR trả cọc đang dùng.
 *
 * Không sửa tại chỗ một tài khoản đã lưu: đổi số tài khoản tại chỗ sẽ âm thầm đổi đích của những
 * lệnh chuyển đã ghi. Đổi = khai cái mới; server lưu trữ cái cũ trong cùng transaction.
 *
 * Đóng hộp thoại là bỏ bản nháp: form sống ở component cha của dialog nên không tự mất khi dialog
 * gỡ nội dung, và mở lại để ĐỔI mà còn số tài khoản gõ dở lần trước là mời gửi nhầm đích.
 *
 * ## Dáng `account` (Figma `19973:50994` · `19973:52952`)
 *
 * Bề mặt khách: nhãn trên ô nhập, biểu tượng đầu ô, dòng "thay cho…" màu cảnh báo, nút của bảng
 * nút v2, và lưu xong mở hộp "Thành công" thay cho toast. Khai lại đúng tài khoản đang dùng thì
 * vẫn là toast — không có gì thành công để chúc mừng.
 */
export function BankAccountForm({
  scope,
  open,
  onClose,
  replacing = null,
  appearance = 'standard',
}: {
  scope: BankAccountScope;
  open: boolean;
  onClose: () => void;
  /** Tài khoản đang dùng — có thì hộp thoại là "Đổi tài khoản", tài khoản mới thay cho nó. */
  replacing?: BankAccount | null;
  appearance?: 'standard' | 'account';
}) {
  const t = useTranslations('BankAccounts.form');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const create = useCreateBankAccount(scope);
  const isAccount = appearance === 'account';
  /** Câu của hộp "Thành công" (dáng `account`) — `null` là hộp đang đóng. */
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  /*
   * Nhãn ghép tên gọi hằng ngày + tên đầy đủ: VIB và VietinBank, SCB và Sacombank là bốn cái tên
   * mà người gõ vội chọn nhầm, và chọn nhầm ở đây là tiền đi sai chỗ. Tên ngân hàng KHÔNG dịch —
   * đó là tên riêng (ADR 0012).
   */
  const bankOptions = useMemo<SelectFieldOption[]>(
    () =>
      VIETNAM_BANKS.map((bank) => ({
        value: bank.code,
        label: `${bank.shortName} — ${bank.fullName}`,
      })),
    [],
  );

  const schema = useMemo(
    () =>
      yup.object({
        bankCode: yup.string().trim().required(t('validation.bankRequired')).max(20),
        accountName: yup.string().trim().required(t('validation.nameRequired')).max(160),
        accountNumber: yup
          .string()
          .trim()
          .required(t('validation.numberRequired'))
          // Cho phép khoảng trắng khi gõ/dán; server chuẩn hoá bỏ chúng trước khi lưu.
          .matches(/^[0-9\s]+$/, t('validation.numberDigits'))
          .max(40),
        label: yup.string().trim().max(60).default(''),
      }),
    [t],
  );

  const { control, handleSubmit, reset } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      bankCode: '',
      accountName: '',
      accountNumber: '',
      label: '',
    },
  });

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit = handleSubmit((values) => {
    // Enter vẫn gửi form khi nút OK đang quay — không cho lượt thứ hai thay luôn lượt thứ nhất.
    if (create.isPending) return;
    create.mutate(
      {
        bankCode: values.bankCode,
        accountNumber: values.accountNumber,
        accountName: values.accountName,
        ...(values.label ? { label: values.label } : {}),
      },
      {
        onSuccess: (account) => {
          // Khai lại đúng tài khoản đang dùng: server không đổi gì, và nói "đã đổi" là nói sai.
          const unchanged = replacing?.id === account.id;
          let toast = t('created');
          if (replacing) toast = unchanged ? t('unchanged') : t('changed');
          if (isAccount && !unchanged) setSavedNotice(toast);
          else message.success(toast);
          close();
        },
        onError: (err: unknown) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <>
      <ResponsiveDialog
        title={replacing ? t('changeTitle') : t('title')}
        open={open}
        onClose={close}
        okText={t('submit')}
        onOk={() => void onSubmit()}
        confirmLoading={create.isPending}
        size="sm"
        className={cx(isAccount && styles.dialog)}
        footer={
          isAccount ? (
            <div className={styles.footer}>
              <CtaButton variant="neutral" onClick={close} disabled={create.isPending}>
                {tCommon('actions.cancel')}
              </CtaButton>
              <CtaButton onClick={() => void onSubmit()} loading={create.isPending}>
                {t('submit')}
              </CtaButton>
            </div>
          ) : undefined
        }
      >
        {replacing ? (
          <Alert
            type={isAccount ? 'warning' : 'info'}
            showIcon={!isAccount}
            className={styles.replaces}
            title={t('replaces', {
              account: `${bankAccountTitle(replacing)} · ${replacing.accountNumberMasked}`,
            })}
          />
        ) : null}
        <DialogForm
          onSubmit={onSubmit}
          labelWidth="lg"
          labelPosition={isAccount ? 'top' : 'side'}
          requiredMark={isAccount ? trailingRequiredMark : undefined}
        >
          <SelectField
            control={control}
            name="bankCode"
            label={t('bankCode')}
            options={bankOptions}
            placeholder={t('bankCodePlaceholder')}
            notFoundContent={t('bankNotFound')}
            // Ba mươi lăm nhà băng — gõ vài chữ nhanh hơn cuộn.
            showSearch
            required
            renderOption={isAccount ? renderBankOption : undefined}
          />
          {/*
          Tên người thụ hưởng đứng TRƯỚC số tài khoản: người dùng nhớ tên mình trước, và ngân
          hàng đối chiếu tên trước khi ghi có.
        */}
          <TextField
            control={control}
            name="accountName"
            label={t('accountName')}
            help={t('accountNameHint')}
            placeholder={isAccount ? t('accountNamePlaceholder') : undefined}
            prefix={isAccount ? <UserOutlined aria-hidden="true" /> : undefined}
            required
          />
          <TextField
            control={control}
            name="accountNumber"
            label={t('accountNumber')}
            placeholder={isAccount ? t('accountNumberPlaceholder') : undefined}
            prefix={isAccount ? <CreditCardOutlined aria-hidden="true" /> : undefined}
            required
          />
          <TextField
            control={control}
            name="label"
            label={t('label')}
            placeholder={t('labelPlaceholder')}
            prefix={isAccount ? <TagOutlined aria-hidden="true" /> : undefined}
          />
        </DialogForm>
      </ResponsiveDialog>

      <BankAccountSavedDialog
        open={savedNotice !== null}
        message={savedNotice ?? ''}
        onClose={() => setSavedNotice(null)}
      />
    </>
  );
}

/** Một dòng ngân hàng của dáng `account`: logo vuông trước tên (Figma `19973:52549`). */
function renderBankOption(option: SelectFieldOption): ReactNode {
  // Chưa chọn (hoặc mã lạ) ⇒ chỉ chữ — không vẽ ô logo "?".
  if (!option.value) return option.label;
  return (
    <span className={styles.bankOption}>
      <BankLogo code={option.value} size="xs" />
      <span className={styles.bankOptionLabel}>{option.label}</span>
    </span>
  );
}
