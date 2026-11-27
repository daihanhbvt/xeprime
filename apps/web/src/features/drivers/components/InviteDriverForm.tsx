'use client';

import { UserOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Avatar, Form, Spin } from 'antd';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import {
  compactPhoneInput,
  DRIVER_TYPE,
  DRIVER_TYPE_VALUES,
  normalizeVnPhoneInput,
  VN_MOBILE_PHONE_PATTERN,
} from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useDriverAccountLookup, useInviteDriver } from '../hooks/use-drivers';
import { makeInviteDriverSchema, type InviteDriverFormValues } from '../schema';
import styles from './DriverModals.module.css';

const EMPTY: InviteDriverFormValues = {
  phone: '',
  name: '',
  driverType: DRIVER_TYPE.STAFF,
  note: '',
};

/** Gõ dừng chừng này rồi mới tra — không tra từng phím. */
const LOOKUP_DEBOUNCE_MS = 400;

/**
 * Form MỜI tài xế (ADR 0063) — Figma `23737:46392`: SĐT tài khoản · ô CHỈ ĐỌC "Thông tin tài xế"
 * (tên + ảnh của tài khoản tra được theo SĐT) · hình thức hợp tác · ghi chú · khối "Lưu ý".
 *
 * Tra cứu chỉ để người mời chắc đúng người; server vẫn là nơi quyết (`DRIVER_ACCOUNT_NOT_FOUND`,
 * `DRIVER_ALREADY_LINKED`). Tra lỗi (vd quá lượt) thì vẫn cho gửi — lời mời tự kiểm lại. Dạng hook
 * để hộp "Thêm tài xế mới" giữ một hàng nút chung cho hai tab.
 */
export function useInviteDriverForm({
  open,
  prefill,
  onDone,
}: {
  open: boolean;
  /** "Mời lại" một liên kết đã đóng — điền sẵn SĐT, tên cũ, hình thức, ghi chú. */
  prefill: InviteDriverFormValues | null;
  onDone: () => void;
}): { form: ReactNode; submit: () => void; pending: boolean } {
  const t = useTranslations('Drivers');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const invite = useInviteDriver();

  const schema = useMemo(() => makeInviteDriverSchema(t as (key: string) => string), [t]);
  const { control, handleSubmit, reset } = useForm<InviteDriverFormValues>({
    resolver: yupResolver(schema),
    defaultValues: EMPTY,
  });

  // Mỗi lần mở là một form mới (trống, hoặc điền sẵn khi mời lại) — lần mời dở trước không để lại rác.
  useEffect(() => {
    if (open) {
      reset(prefill ?? EMPTY);
      invite.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill, reset]);

  const typed = useWatch({ control, name: 'phone' }) ?? '';
  // Ô SĐT tự lọc dấu cách lúc gõ; vẫn gộp một lần nữa — tra cứu chỉ cần chữ số.
  const normalized = normalizeVnPhoneInput(compactPhoneInput(typed));
  const debounced = useDebouncedValue(
    VN_MOBILE_PHONE_PATTERN.test(normalized) ? normalized : null,
    LOOKUP_DEBOUNCE_MS,
  );
  const lookup = useDriverAccountLookup(open ? debounced : null);
  const account = lookup.data?.found ? lookup.data : null;

  const submit = handleSubmit((values) => {
    if (invite.isPending) return;
    invite.mutate(
      {
        phone: values.phone.trim(),
        // Mời lại giữ tên bên thuê đã đặt; mời mới để server lấy tên tài khoản.
        ...(values.name.trim() ? { name: values.name.trim() } : {}),
        driverType: values.driverType,
        note: values.note.trim() || undefined,
      },
      {
        onSuccess: () => {
          message.success(t('toast.invited'));
          onDone();
        },
      },
    );
  });

  let accountBox: ReactNode;
  if (!debounced) {
    accountBox = <span className={styles.accountHint}>{t('add.invite.accountPlaceholder')}</span>;
  } else if (lookup.isFetching) {
    accountBox = (
      <span className={styles.accountHint}>
        <Spin size="small" /> {t('add.invite.lookingUp')}
      </span>
    );
  } else if (lookup.isError) {
    accountBox = <span className={styles.accountHint}>{t('add.invite.lookupError')}</span>;
  } else if (account) {
    accountBox = (
      <span className={styles.accountFound}>
        <Avatar
          size={24}
          src={account.avatarUrl ?? undefined}
          icon={account.avatarUrl ? undefined : <UserOutlined />}
        />
        <span className={styles.accountName}>{account.displayName}</span>
        <span className={styles.accountPhone}>{debounced}</span>
      </span>
    );
  } else {
    accountBox = (
      <span className={cx(styles.accountHint, styles.accountMissing)}>
        {t('add.invite.notFound')}
      </span>
    );
  }

  const form = (
    <DialogForm onSubmit={submit} labelPosition="top">
      {invite.isError ? (
        <Alert className={styles.error} type="error" showIcon title={errorMessage(invite.error)} />
      ) : null}
      <TextField
        control={control}
        name="phone"
        type="tel"
        label={t('form.phone')}
        placeholder={t('form.phonePlaceholder')}
        autoComplete="tel"
      />
      <Form.Item
        label={t('add.invite.account')}
        help={account?.alreadyLinked ? t('add.invite.alreadyLinked') : undefined}
        validateStatus={account?.alreadyLinked ? 'warning' : undefined}
      >
        <div className={styles.accountBox} aria-live="polite">
          {accountBox}
        </div>
      </Form.Item>
      <SelectField
        control={control}
        name="driverType"
        label={t('form.type')}
        options={DRIVER_TYPE_VALUES.map((value) => ({
          value,
          label: domainLabel('driverType', value),
        }))}
      />
      <TextAreaField
        control={control}
        name="note"
        label={t('form.note')}
        placeholder={t('form.notePlaceholder')}
        rows={3}
      />
      <Alert
        className={styles.hint}
        type="info"
        title={t('form.hintTitle')}
        description={t('form.inviteHint')}
      />
    </DialogForm>
  );

  return { form, submit: () => void submit(), pending: invite.isPending };
}
