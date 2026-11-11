'use client';

import { Alert, App, Button } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { buildPasswordSchema } from '@xeprime/validators';
import { DialogForm } from '@/components/form/DialogForm';
import { TextField } from '@/components/form/TextField';
import { DialogHeading } from '@/components/overlay/DialogHeading';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAuthSchemaLabels } from '@/features/auth/hooks/use-auth-schema-labels';
import { useErrorMessage } from '@/i18n/use-error-message';
import { generateStaffPassword } from '../staff-password';
import { useResetMemberPassword } from '../hooks/use-member-mutations';
import type { MemberRosterItem } from '../types';
import { StaffCredentials } from './StaffCredentials';
import styles from './StaffAccountDialog.module.css';

/**
 * Chủ ĐẶT LẠI mật khẩu cho tài khoản do gian hàng cấp (ADR 0087) — nhân viên không có SĐT để tự
 * đặt lại bằng OTP. Server đăng xuất họ khỏi mọi thiết bị; mật khẩu mới chỉ hiện một lần ở đây.
 */
export function ResetPasswordDialog({
  member,
  onClose,
}: {
  member: MemberRosterItem | null;
  onClose: () => void;
}) {
  const t = useTranslations('Members');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const authLabels = useAuthSchemaLabels();
  const reset = useResetMemberPassword();
  // Kết quả gắn với ĐÚNG người được đặt lại — đổi người thì không bao giờ hiện mật khẩu người trước.
  const [doneFor, setDoneFor] = useState<{ userId: string; password: string } | null>(null);
  const done = doneFor && doneFor.userId === member?.userId ? doneFor.password : null;

  const schema = useMemo(
    () => yup.object({ password: buildPasswordSchema(authLabels) }),
    [authLabels],
  );
  type FormValues = yup.InferType<typeof schema>;
  const form = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { password: generateStaffPassword() },
  });

  /*
   * Đóng hộp là xoá kết quả lượt trước — xoá ở hàm ĐÓNG chứ không trong effect (setState trong
   * effect gây render dây chuyền, lint `react-hooks/set-state-in-effect`).
   */
  const close = () => {
    setDoneFor(null);
    onClose();
  };

  // Người khác ⇒ form sạch + mật khẩu ngẫu nhiên mới; không mang mật khẩu người trước sang.
  useEffect(() => {
    if (member) form.reset({ password: generateStaffPassword() });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ dựng lại khi đổi người
  }, [member?.id]);

  const name = member?.displayName ?? member?.username ?? '';

  const onSubmit = form.handleSubmit((values) => {
    const userId = member?.userId;
    if (!userId || reset.isPending) return;
    reset.mutate(
      { userId, password: values.password },
      {
        onSuccess: () => {
          message.success(t('roster.toast.passwordReset'));
          setDoneFor({ userId, password: values.password });
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  if (done && member) {
    return (
      <ResponsiveDialog
        title={t('resetPassword.doneTitle')}
        open
        onClose={close}
        size="sm"
        footer={
          <Button type="primary" onClick={close}>
            {t('staff.created.done')}
          </Button>
        }
      >
        <StaffCredentials
          name={name}
          username={member.username ?? null}
          password={done}
          body={t('resetPassword.doneBody', { name })}
        />
      </ResponsiveDialog>
    );
  }

  return (
    <ResponsiveDialog
      title={
        <DialogHeading title={t('resetPassword.title')} hint={t('resetPassword.subtitle', { name })} />
      }
      open={Boolean(member)}
      onClose={close}
      size="sm"
      okText={t('resetPassword.submit')}
      onOk={() => void onSubmit()}
      confirmLoading={reset.isPending}
    >
      <DialogForm onSubmit={onSubmit} labelPosition="top">
        <Alert type="warning" showIcon title={t('resetPassword.notice', { name })} />
        <TextField
          control={form.control}
          name="password"
          label={t('staff.password')}
          required
          placeholder={t('staff.passwordPlaceholder')}
          autoComplete="new-password"
          suffix={
            <Button
              type="link"
              size="small"
              className={styles.generate}
              onClick={() =>
                form.setValue('password', generateStaffPassword(), { shouldValidate: true })
              }
            >
              {t('staff.generate')}
            </Button>
          }
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}
