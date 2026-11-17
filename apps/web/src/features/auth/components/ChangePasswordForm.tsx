'use client';

import {
  CheckCircleFilled,
  CheckCircleOutlined,
  LockOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Form } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { AccountPageHeader } from '@/features/account/components/AccountPageHeader';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { cx } from '@/lib/cx';

import { useChangePasswordForm } from '../hooks/use-change-password-form';
import styles from './ChangePasswordForm.module.css';

/**
 * Đổi mật khẩu - trang bảo mật của site KHÁCH (`appearance="account"`) và của site QUẢN TRỊ
 * (mặc định). Logic (hai nhánh đổi / đặt lần đầu, lỗi trên ô, bảng yêu cầu) ở
 * `useChangePasswordForm`; site partner dùng cùng hook với dáng riêng (`AccountPasswordForm`).
 *
 * `appearance="account"`: trang "Bảo mật tài khoản" của site khách (design Account / Security,
 * Figma `19973:54991`) - nằm trong `AccountPanel` (không tự dựng tiêu đề trang), nhãn trên ô, nút
 * gửi là nút vàng của chợ v2 và thành công hiện hộp "Thành công" thay cho toast.
 */
export function ChangePasswordForm({
  headingLevel = 'h1',
  appearance = 'default',
}: {
  headingLevel?: 'h1' | 'h2';
  appearance?: 'default' | 'account';
} = {}) {
  const isAccount = appearance === 'account';
  const t = useTranslations('Account.changePassword');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  /** `appearance="account"`: thông điệp của hộp "Thành công" (null = đóng). */
  const [successNote, setSuccessNote] = useState<string | null>(null);

  const { form, onSubmit, hasPassword, formError, saving, requirements } = useChangePasswordForm({
    onSuccess: (note) => (isAccount ? setSuccessNote(note) : message.success(note)),
  });
  const { control, formState } = form;

  return (
    <div className={styles.page}>
      {isAccount ? null : (
        <AccountPageHeader title={t('title')} subtitle={t('subtitle')} as={headingLevel} />
      )}

      <div className={cx(styles.grid, isAccount && styles.accountGrid)}>
        <form
          onSubmit={onSubmit}
          noValidate
          className={cx(isAccount ? styles.accountForm : styles.card)}
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
            Dáng `account` (Figma `19973:54991`): nhãn NẰM TRÊN ô - bọc `Form layout="vertical"`
            không sinh thẻ (`component={false}`).
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
                disabled={saving}
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
              disabled={saving}
            />
            <TextField
              control={control}
              name="confirmPassword"
              label={t('confirmPassword')}
              placeholder={isAccount ? t('placeholders.confirm') : undefined}
              type="password"
              autoComplete="new-password"
              prefix={<LockOutlined />}
              disabled={saving}
            />
          </FieldLayout>

          {isAccount ? (
            <CtaButton
              type="submit"
              loading={saving}
              disabled={!formState.isDirty}
              className={styles.ctaSubmit}
            >
              {hasPassword ? t('submit') : t('submitFirstTime')}
            </CtaButton>
          ) : (
            <Button
              type="primary"
              htmlType="submit"
              loading={saving}
              disabled={!formState.isDirty && !saving}
            >
              {hasPassword ? t('submit') : t('submitFirstTime')}
            </Button>
          )}
        </form>

        <aside
          className={cx(isAccount ? styles.panel : styles.card, isAccount && styles.accountPanel)}
          aria-label={t('requirementsTitle')}
        >
          <h2 className={styles.requirementsTitle}>{t('requirementsTitle')}</h2>
          <ul className={styles.requirements}>
            {requirements.map(({ key, label, met }) => (
              <li key={key} className={cx(styles.requirement, met && styles.met)}>
                {/* Bản vẽ: đạt = chấm vàng đặc, chưa đạt = chấm xám đặc - cùng một hình, khác màu. */}
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

/** Nhãn trên ô khi `vertical`; ngược lại giữ nguyên bố cục mặc định của nơi nhúng. */
function FieldLayout({ vertical, children }: { vertical: boolean; children: ReactNode }) {
  if (!vertical) return <>{children}</>;
  return (
    <Form component={false} layout="vertical" colon={false}>
      {children}
    </Form>
  );
}
