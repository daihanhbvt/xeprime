'use client';

import { CheckCircleFilled, LockOutlined } from '@ant-design/icons';
import { Alert, App, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { PASSWORD_MIN } from '@xeprime/validators';

import { TextField } from '@/components/form/TextField';
import { ROUTES } from '@/constants/routes';
import {
  PASSWORD_STRENGTH_STEPS,
  useChangePasswordForm,
} from '@/features/auth/hooks/use-change-password-form';
import { cx } from '@/lib/cx';

import styles from './AccountPasswordForm.module.css';

const STEPS = Array.from({ length: PASSWORD_STRENGTH_STEPS }, (_, i) => i + 1);
/** Luật có nhãn gọn ở `Account.securityPage.password.rules` (design `24131:71737`). */
const SHORT_RULES = [
  'passwordTooShort',
  'passwordNeedsLetter',
  'passwordNeedsDigit',
  'notSameAsCurrent',
] as const;
const isShortRule = (key: string): key is (typeof SHORT_RULES)[number] =>
  (SHORT_RULES as readonly string[]).includes(key);
/** Nhãn + sắc của từng nấc độ mạnh (1…4) - khoá tĩnh để `t()` kiểm được lúc biên dịch. */
const STRENGTH = {
  1: { key: 'weak', tone: 'weak' },
  2: { key: 'fair', tone: 'fair' },
  3: { key: 'good', tone: 'good' },
  4: { key: 'strong', tone: 'strong' },
} as const;

/**
 * Khối MẬT KHẨU của trang Tài khoản & bảo mật site partner (design `24131:71722`): ba ô một hàng,
 * dưới là thanh độ mạnh + danh sách yêu cầu, nút "Quên mật khẩu" · "Cập nhật mật khẩu" bên phải.
 *
 * Logic dùng chung với trang bảo mật site khách/admin (`useChangePasswordForm`). Danh sách yêu cầu
 * là luật THẬT của server (`PASSWORD_RULES`), không phải luật của bản vẽ ("ký tự đặc biệt" - người
 * dùng chốt 17/11/2026); thanh độ mạnh chỉ để nhìn (`passwordStrength`).
 *
 * "Quên mật khẩu" dẫn tới luồng quên mật khẩu của site partner (OTP qua SĐT, ADR 0060) - vắng với
 * tài khoản chưa có mật khẩu (không có gì để quên) và tài khoản nhân viên do gian hàng cấp (không
 * có SĐT để nhận mã; chủ gian hàng đặt lại cho họ - ADR 0087).
 *
 * Chỉ là PHẦN THÂN: trang đặt nó trong một `InfoCard` có tiêu đề.
 */
export function AccountPasswordForm() {
  const t = useTranslations('Account.changePassword');
  const tHub = useTranslations('Account.securityPage.password');
  const { message } = App.useApp();
  const { form, onSubmit, hasPassword, managedAccount, formError, saving, requirements, strength } =
    useChangePasswordForm({ onSuccess: (note) => message.success(note) });
  const { control, formState } = form;
  const level = strength > 0 ? STRENGTH[strength as keyof typeof STRENGTH] : null;

  return (
    <form onSubmit={onSubmit} noValidate className={styles.form}>
      {!hasPassword ? (
        <Alert type="info" showIcon title={t('firstTimeTitle')} description={t('firstTimeBody')} />
      ) : null}
      {formError ? <Alert type="error" showIcon title={formError} /> : null}

      <div className={cx(styles.fields, !hasPassword && styles.twoFields)}>
        {hasPassword ? (
          <TextField
            control={control}
            name="currentPassword"
            label={t('currentPassword')}
            placeholder={t('placeholders.current')}
            type="password"
            autoComplete="current-password"
            prefix={<LockOutlined />}
            disabled={saving}
          />
        ) : null}
        <TextField
          control={control}
          name="newPassword"
          label={t('newPassword')}
          placeholder={t('placeholders.new')}
          type="password"
          autoComplete="new-password"
          prefix={<LockOutlined />}
          disabled={saving}
        />
        <TextField
          control={control}
          name="confirmPassword"
          label={t('confirmPassword')}
          placeholder={t('placeholders.confirm')}
          type="password"
          autoComplete="new-password"
          prefix={<LockOutlined />}
          disabled={saving}
        />
      </div>

      <div className={styles.footer}>
        <div className={styles.quality}>
          <div className={styles.strength}>
            <div className={styles.bars} aria-hidden="true">
              {STEPS.map((step) => (
                <span key={step} className={cx(styles.bar, step <= strength && styles.barOn)} />
              ))}
            </div>
            {/* Vùng sống: đọc nấc mới khi người dùng gõ, không đọc lại cả danh sách yêu cầu. */}
            <span className={cx(styles.strengthLabel, level && styles[level.tone])} aria-live="polite">
              {level ? tHub(`strength.${level.key}`) : null}
            </span>
          </div>

          <ul className={styles.requirements} aria-label={t('requirementsTitle')}>
            {requirements.map(({ key, label, met }) => (
              <li key={key} className={cx(styles.requirement, met && styles.met)}>
                <CheckCircleFilled className={styles.requirementIcon} aria-hidden="true" />
                {/* Nhãn gọn của bản vẽ để bốn luật nằm một hàng; luật lạ rơi về nhãn đầy đủ. */}
                <span>
                  {!isShortRule(key)
                    ? label
                    : key === 'passwordTooShort'
                      ? tHub('rules.passwordTooShort', { min: PASSWORD_MIN })
                      : tHub(`rules.${key}`)}
                </span>
                <span className={styles.srOnly}>
                  {met ? t('requirementMet') : t('requirementUnmet')}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.actions}>
          {hasPassword && !managedAccount ? (
            <Button size="large" href={ROUTES.MANAGE.FORGOT_PASSWORD}>
              {tHub('forgot')}
            </Button>
          ) : null}
          <Button
            size="large"
            type="primary"
            htmlType="submit"
            loading={saving}
            /*
              Sáng khi CẢ form hợp lệ (đủ ô, đạt luật, nhập lại khớp) - không phải "đã gõ gì đó".
              `isValid` chạy schema trên mỗi lần gõ; lượt submit (Enter) vẫn qua `handleSubmit`.
            */
            disabled={!formState.isValid && !saving}
          >
            {hasPassword ? t('submit') : t('submitFirstTime')}
          </Button>
        </div>
      </div>
    </form>
  );
}
