'use client';

import { Alert, Button, Form, Input } from 'antd';
import { PhoneOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PHONE_VERIFICATION_PURPOSE, VN_PHONE_PATTERN } from '@xeprime/types';
import { getErrorMessage } from '@/services/api-client';
import { phoneLogin, type CurrentUser } from '@/services/auth.service';
import { usePhoneVerify } from '../hooks/use-phone-verify';
import { maskPhone } from '../mask';
import { OtpCodeInput } from './OtpCodeInput';
import styles from './PhoneLoginForm.module.css';

/**
 * Đăng nhập passwordless bằng SĐT + OTP: nhập SĐT → gửi mã → nhập mã → đăng nhập. OTP purpose
 * `login` (không dùng chéo mục đích khác). Tài khoản chưa có sẽ được BE tạo ngầm, không mật khẩu.
 * `onSuccess(user)` nhận tài khoản vừa đăng nhập để trang login điều hướng / gợi ý đặt mật khẩu.
 *
 * Môi trường nhận mã test (dev/staging): ô mã hiện ngay dưới nút gửi — gõ mã test là đăng nhập
 * được mà không tốn SMS, bấm gửi thì vẫn nhận mã thật.
 */
export function PhoneLoginForm({
  onSuccess,
}: {
  onSuccess: (user: CurrentUser) => Promise<void> | void;
}) {
  const t = useTranslations('Auth.otp');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const vp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.LOGIN);

  const login = useMutation({
    mutationFn: () => phoneLogin(phone.trim(), code),
    onSuccess: async (user) => {
      setError(null);
      await onSuccess(user);
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const phoneValid = VN_PHONE_PATTERN.test(phone.trim());
  const sent = vp.status === 'code_sent';
  const canSubmit = code.length === 6 && phoneValid && !login.isPending;
  const displayError = error ?? vp.error;

  function submitCode(next: string) {
    if (next.length === 6 && phoneValid && !login.isPending) login.mutate();
  }

  function editPhone() {
    vp.reset();
    setCode('');
    setError(null);
  }

  return (
    <div className={styles.wrap}>
      {displayError ? (
        <Alert type="error" showIcon title={displayError} className={styles.err} />
      ) : null}

      <Form.Item label={t('phone')} className={styles.item} help={sent ? undefined : t('phoneHint')}>
        <Input
          size="large"
          value={phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={t('phonePlaceholder')}
          prefix={<PhoneOutlined />}
          disabled={sent}
          onChange={(e) => setPhone(e.target.value)}
          onPressEnter={() => phoneValid && !sent && vp.send(phone.trim())}
        />
      </Form.Item>

      {!sent ? (
        <Button
          type={vp.canEnterCode ? 'default' : 'primary'}
          block
          size="large"
          className={styles.submit}
          loading={vp.sending}
          disabled={!phoneValid}
          onClick={() => vp.send(phone.trim())}
        >
          {t('sendCode')}
        </Button>
      ) : null}

      {vp.canEnterCode ? (
        <>
          <Form.Item
            label={t('code')}
            className={styles.item}
            help={sent ? t('codeHint', { phone: maskPhone(phone) }) : undefined}
          >
            <OtpCodeInput
              value={code}
              onChange={setCode}
              onComplete={submitCode}
              autoFocus={sent}
              disabled={login.isPending}
            />
          </Form.Item>

          {vp.devCode ? (
            <div className={styles.devHint}>{t('devCode', { code: vp.devCode })}</div>
          ) : !sent ? (
            <div className={styles.devHint}>{t('testCodeHint')}</div>
          ) : null}

          <Button
            type="primary"
            block
            size="large"
            className={styles.submit}
            loading={login.isPending}
            disabled={!canSubmit}
            onClick={() => login.mutate()}
          >
            {t('submit')}
          </Button>
        </>
      ) : null}

      {sent ? (
        <div className={styles.footRow}>
          <button type="button" className={styles.linkBtn} onClick={editPhone}>
            {t('editPhone')}
          </button>
          <button
            type="button"
            className={styles.linkBtn}
            disabled={vp.cooldown > 0 || vp.sending}
            onClick={() => vp.send(phone.trim())}
          >
            {vp.cooldown > 0 ? t('resendIn', { seconds: vp.cooldown }) : t('resend')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
