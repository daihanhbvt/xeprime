'use client';

import {
  CheckCircleFilled,
  CheckCircleOutlined,
  LockOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Form } from 'antd';
import { useMemo, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { API_ERROR_CODE } from '@xeprime/types';
import {
  PASSWORD_MIN,
  PASSWORD_RULES,
  buildPasswordSchema,
  type PasswordRuleKey,
} from '@xeprime/validators';

import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { AccountPageHeader } from '@/features/account/components/AccountPageHeader';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { getErrorCode } from '@/services/api-client';
import { changePassword, setPassword } from '@/services/auth.service';
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
 *
 * `embedded`: nằm TRONG một section đã có tiêu đề và khung (trang Tài khoản & bảo mật của site
 * partner) — bỏ tiêu đề trang và hai khung thẻ, chỉ giữ form + bảng yêu cầu.
 *
 * `appearance="account"`: trang "Bảo mật tài khoản" của SITE KHÁCH (design Account / Security,
 * Figma `19973:54991`) — nằm trong `AccountPanel` như `embedded`, nút gửi là nút vàng của chợ
 * v2 và thành công hiện hộp "Thành công" thay cho toast. Site partner và admin giữ nguyên.
 *
 * Quy tắc "Không trùng với mật khẩu hiện tại" chỉ có khi đã có mật khẩu — đó là luật của backend
 * (`PASSWORD_UNCHANGED`); bảng chỉ nói trước điều server sẽ từ chối.
 */
export function ChangePasswordForm({
  headingLevel = 'h1',
  embedded: embeddedProp = false,
  appearance = 'default',
}: {
  headingLevel?: 'h1' | 'h2';
  embedded?: boolean;
  appearance?: 'default' | 'account';
} = {}) {
  const isAccount = appearance === 'account';
  const embedded = embeddedProp || isAccount;
  const t = useTranslations('Account.changePassword');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const labels = useAuthSchemaLabels();
  const { data: user } = useCurrentUser();
  // Vỏ đã nạp người dùng; nếu vì lý do gì chưa có thì mặc định "đã có mật khẩu" — nhánh an toàn
  // hơn (đòi thêm bằng chứng) chứ không phải nhánh bỏ qua bước xác minh.
  const hasPassword = user?.hasPassword ?? true;
  const [formError, setFormError] = useState<string | null>(null);
  /** `appearance="account"`: thông điệp của hộp "Thành công" (null = đóng). */
  const [successNote, setSuccessNote] = useState<string | null>(null);

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
        newPassword: buildPasswordSchema(labels).test(
          'notSameAsCurrent',
          t('unchanged'),
          function notSameAsCurrent(value) {
            const current = (this.parent as ChangePasswordValues).currentPassword;
            return !hasPassword || !current || value !== current;
          },
        ),
        confirmPassword: yup
          .string()
          .required(labels.confirmRequired)
          .oneOf([yup.ref('newPassword')], labels.confirmMismatch),
      }),
    [hasPassword, labels, t],
  );

  const { control, handleSubmit, reset, setError, formState } = useForm<ChangePasswordValues>({
    resolver: yupResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const newPassword = useWatch({ control, name: 'newPassword' }) ?? '';
  const currentPassword = useWatch({ control, name: 'currentPassword' }) ?? '';
  // Nhúng trong section `h2` (partner) → `h3`; trang bảo mật của khách có thẻ `h1` → `h2`.
  const RequirementsHeading = embeddedProp ? 'h3' : 'h2';

  const save = useMutation({
    mutationFn: (values: ChangePasswordValues) =>
      hasPassword
        ? changePassword(values.currentPassword, values.newPassword)
        : setPassword(values.newPassword),
    onSuccess: () => {
      const note = hasPassword ? t('success') : t('successFirstTime');
      if (isAccount) setSuccessNote(note);
      else message.success(note);
      reset();
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    },
    onError: (err) => {
      if (getErrorCode(err) === API_ERROR_CODE.CURRENT_PASSWORD_INCORRECT) {
        setError('currentPassword', { type: 'server', message: errorMessage(err) });
        return;
      }
      if (getErrorCode(err) === API_ERROR_CODE.PASSWORD_UNCHANGED) {
        setError('newPassword', { type: 'server', message: errorMessage(err) });
        return;
      }
      setFormError(errorMessage(err));
    },
  });

  const onSubmit = handleSubmit((values) => {
    // Enter vẫn submit form khi nút đang quay — chặn lượt thứ hai ở đây.
    if (save.isPending) return;
    setFormError(null);
    save.mutate(values);
  });

  return (
    <div className={styles.page}>
      {embedded ? null : (
        <AccountPageHeader title={t('title')} subtitle={t('subtitle')} as={headingLevel} />
      )}

      <div className={cx(styles.grid, isAccount && styles.accountGrid)}>
        <form
          onSubmit={onSubmit}
          noValidate
          className={cx(!embedded && styles.card, isAccount && styles.accountForm)}
        >
          {!hasPassword ? (
            <Alert
              type="info"
              showIcon
              className={styles.alert}
              title={t('firstTimeTitle')}
              description={t('firstTimeBody')}
            />
          ) : null}
          {formError ? (
            <Alert type="error" showIcon className={styles.alert} title={formError} />
          ) : null}

          {/*
            Dáng `account` (Figma `19973:54991`): nhãn NẰM TRÊN ô — bọc `Form layout="vertical"`
            không sinh thẻ (`component={false}`), cùng cách trang Tài khoản & bảo mật của site partner.
          */}
          <FieldLayout vertical={isAccount}>
            {hasPassword ? (
              <TextField
                control={control}
                name="currentPassword"
                label={t('currentPassword')}
                placeholder={isAccount ? t('placeholders.current') : undefined}
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
              placeholder={isAccount ? t('placeholders.new') : undefined}
              type="password"
              autoComplete="new-password"
              prefix={<LockOutlined />}
              disabled={save.isPending}
            />
            <TextField
              control={control}
              name="confirmPassword"
              label={t('confirmPassword')}
              placeholder={isAccount ? t('placeholders.confirm') : undefined}
              type="password"
              autoComplete="new-password"
              prefix={<LockOutlined />}
              disabled={save.isPending}
            />
          </FieldLayout>

          {isAccount ? (
            <CtaButton
              type="submit"
              loading={save.isPending}
              disabled={!formState.isDirty}
              className={styles.ctaSubmit}
            >
              {hasPassword ? t('submit') : t('submitFirstTime')}
            </CtaButton>
          ) : (
            <Button
              type="primary"
              htmlType="submit"
              loading={save.isPending}
              disabled={!formState.isDirty && !save.isPending}
            >
              {hasPassword ? t('submit') : t('submitFirstTime')}
            </Button>
          )}
        </form>

        <aside
          className={cx(embedded ? styles.panel : styles.card, isAccount && styles.accountPanel)}
          aria-label={t('requirementsTitle')}
        >
          {/* Nhúng thì section đã giữ `h2` — bảng phụ này xuống `h3`. */}
          <RequirementsHeading className={styles.requirementsTitle}>
            {t('requirementsTitle')}
          </RequirementsHeading>
          <ul className={styles.requirements}>
            {[
              ...PASSWORD_RULES.map((rule) => ({
                key: rule.key as string,
                label: requirementLabel(t, rule.key),
                met: rule.test(newPassword),
              })),
              // Chỉ khi đã có mật khẩu: lần đặt đầu không có gì để trùng.
              ...(hasPassword
                ? [
                    {
                      key: 'notSameAsCurrent',
                      label: t('requirements.notSameAsCurrent'),
                      met: Boolean(newPassword) && newPassword !== currentPassword,
                    },
                  ]
                : []),
            ].map(({ key, label, met }) => (
              <li key={key} className={cx(styles.requirement, met && styles.met)}>
                {/* Bản vẽ: đạt = chấm vàng đặc, chưa đạt = chấm xám đặc — cùng một hình, khác màu. */}
                {met || isAccount ? (
                  <CheckCircleFilled className={styles.requirementIcon} aria-hidden="true" />
                ) : (
                  <MinusCircleOutlined className={styles.requirementIcon} aria-hidden="true" />
                )}
                <span>{label}</span>
                <span className={styles.srOnly}>
                  {met ? t('requirementMet') : t('requirementUnmet')}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {isAccount ? (
        <ResponsiveDialog
          open={successNote !== null}
          onClose={() => setSuccessNote(null)}
          size="sm"
          hideHeaderTitle
          ariaLabel={t('successTitle')}
          footer={
            <CtaButton size="form" block onClick={() => setSuccessNote(null)}>
              {tCommon('actions.confirm')}
            </CtaButton>
          }
        >
          <div className={styles.success} role="status">
            <span className={styles.successIcon} aria-hidden="true">
              <CheckCircleOutlined />
            </span>
            <div className={styles.successText}>
              <p className={styles.successTitle}>{t('successTitle')}</p>
              <p className={styles.successBody}>{successNote}</p>
            </div>
          </div>
        </ResponsiveDialog>
      ) : null}
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

/** Nhãn trên ô khi `vertical`; ngược lại giữ nguyên bố cục mặc định của nơi nhúng. */
function FieldLayout({ vertical, children }: { vertical: boolean; children: ReactNode }) {
  if (!vertical) return <>{children}</>;
  return (
    <Form component={false} layout="vertical" colon={false}>
      {children}
    </Form>
  );
}
