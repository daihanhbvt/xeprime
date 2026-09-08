'use client';

import { CheckCircleFilled, LockOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button } from 'antd';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { authApi } from '@xeprime/api-client';
import { API_ERROR_CODE } from '@xeprime/types';
import {
  PASSWORD_MIN,
  PASSWORD_RULES,
  buildPasswordSchema,
  type PasswordRuleKey,
} from '@xeprime/validators';

import { TextField } from '@/components/form/TextField';
import { AccountPageHeader } from '@/features/account/components/AccountPageHeader';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { getErrorCode } from '@/services/api-client';
import { setPassword } from '@/services/auth.service';
import { queryKeys } from '@/services/query-keys';

import { useAuthSchemaLabels } from '../hooks/use-auth-schema-labels';
import styles from './ChangePasswordForm.module.css';

interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Đổi mật khẩu ở khu tài khoản — MỘT form cho hai tình huống, phân nhánh theo `MeDto.hasPassword`:
 *
 *  - Đã có mật khẩu → hỏi mật khẩu hiện tại, gọi `POST /auth/password/change`. Sai mật khẩu cũ
 *    là lỗi TRÊN Ô (mã `CURRENT_PASSWORD_INCORRECT`), không phải một alert chung.
 *  - Chưa có (tài khoản OTP / mạng xã hội) → nói rõ đây là đặt lần đầu, không hỏi mật khẩu cũ, và
 *    gọi `POST /auth/password/set` đã có. Không bao giờ dùng token quên/đặt lại để giả một lần đổi.
 *
 * Bảng "Yêu cầu của mật khẩu" tick theo `PASSWORD_RULES` — cùng nguồn với schema, nên bảng nói
 * đạt thì submit không thể đỏ vì luật mật khẩu.
 *
 * Sau khi thành công: reset form và invalidate `auth.me` để `hasPassword` đảo sang `true` — form
 * tự chuyển từ "đặt lần đầu" sang "đổi" mà không cần tải lại trang.
 */
export function ChangePasswordForm() {
  const t = useTranslations('Account.changePassword');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const labels = useAuthSchemaLabels();
  const { data: user } = useCurrentUser();
  // Vỏ đã nạp người dùng; nếu vì lý do gì chưa có thì mặc định "đã có mật khẩu" — nhánh an toàn
  // hơn (đòi thêm bằng chứng) chứ không phải nhánh bỏ qua bước xác minh.
  const hasPassword = user?.hasPassword ?? true;
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      yup.object({
        // MỘT schema cho cả hai nhánh, chỉ đổi LUẬT: hai schema khác nhau theo nhánh làm kiểu
        // suy ra của `yupResolver` thành hợp của hai shape và form mất bảo chứng khoá.
        currentPassword: yup
          .string()
          .defined()
          .test(
            'currentRequired',
            labels.passwordRequired,
            (value) => !hasPassword || Boolean(value),
          ),
        newPassword: buildPasswordSchema(labels),
        confirmPassword: yup
          .string()
          .required(labels.confirmRequired)
          .oneOf([yup.ref('newPassword')], labels.confirmMismatch),
      }),
    [hasPassword, labels],
  );

  const { control, handleSubmit, reset, setError, formState } = useForm<ChangePasswordValues>({
    resolver: yupResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const newPassword = useWatch({ control, name: 'newPassword' }) ?? '';

  const save = useMutation({
    mutationFn: (values: ChangePasswordValues) =>
      hasPassword
        ? authApi.changePassword({
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
          })
        : setPassword(values.newPassword),
    onSuccess: () => {
      message.success(hasPassword ? t('success') : t('successFirstTime'));
      reset();
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    },
    onError: (err) => {
      if (getErrorCode(err) === API_ERROR_CODE.CURRENT_PASSWORD_INCORRECT) {
        setError('currentPassword', { type: 'server', message: errorMessage(err) });
        return;
      }
      setFormError(errorMessage(err));
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    save.mutate(values);
  });

  return (
    <div className={styles.page}>
      <AccountPageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className={styles.grid}>
        <form onSubmit={onSubmit} noValidate className={styles.card}>
          {!hasPassword ? (
            <Alert
              type="info"
              showIcon
              className={styles.alert}
              message={t('firstTimeTitle')}
              description={t('firstTimeBody')}
            />
          ) : null}
          {formError ? (
            <Alert type="error" showIcon className={styles.alert} message={formError} />
          ) : null}

          {hasPassword ? (
            <TextField
              control={control}
              name="currentPassword"
              label={t('currentPassword')}
              type="password"
              autoComplete="current-password"
              prefix={<LockOutlined />}
              disabled={save.isPending}
            />
          ) : null}
          <TextField
            control={control}
            name="newPassword"
            label={t('newPassword')}
            type="password"
            autoComplete="new-password"
            prefix={<LockOutlined />}
            disabled={save.isPending}
          />
          <TextField
            control={control}
            name="confirmPassword"
            label={t('confirmPassword')}
            type="password"
            autoComplete="new-password"
            prefix={<LockOutlined />}
            disabled={save.isPending}
          />

          <Button
            type="primary"
            htmlType="submit"
            loading={save.isPending}
            disabled={!formState.isDirty && !save.isPending}
          >
            {hasPassword ? t('submit') : t('submitFirstTime')}
          </Button>
        </form>

        <aside className={styles.card} aria-label={t('requirementsTitle')}>
          <h2 className={styles.requirementsTitle}>{t('requirementsTitle')}</h2>
          <ul className={styles.requirements}>
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(newPassword);
              return (
                <li key={rule.key} className={cx(styles.requirement, met && styles.met)}>
                  {met ? (
                    <CheckCircleFilled className={styles.requirementIcon} aria-hidden="true" />
                  ) : (
                    <MinusCircleOutlined className={styles.requirementIcon} aria-hidden="true" />
                  )}
                  <span>{requirementLabel(t, rule.key)}</span>
                  <span className={styles.srOnly}>
                    {met ? t('requirementMet') : t('requirementUnmet')}
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}

/**
 * Nhãn của một quy tắc. Khoá của `t()` phải TĨNH (next-intl kiểm lúc biên dịch), nên mã quy tắc
 * đi qua bảng tra này chứ không ghép chuỗi.
 *
 * `Record` đầy đủ chứ không phải `switch`: thêm một quy tắc vào `PASSWORD_RULES` mà quên viết
 * nhãn thì đỏ ngay ở đây, thay vì lặng lẽ rơi xuống một nhánh mặc định.
 */
function requirementLabel(
  t: ReturnType<typeof useTranslations<'Account.changePassword'>>,
  key: PasswordRuleKey,
): string {
  const labels: Record<PasswordRuleKey, string> = {
    passwordTooShort: t('requirements.passwordTooShort', { min: PASSWORD_MIN }),
    passwordNeedsLetter: t('requirements.passwordNeedsLetter'),
    passwordNeedsDigit: t('requirements.passwordNeedsDigit'),
  };
  return labels[key];
}
