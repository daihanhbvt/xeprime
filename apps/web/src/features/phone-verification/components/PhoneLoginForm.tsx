'use client';

import { Alert, Button, Form, Input } from 'antd';
import { PhoneOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
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
 */
export function PhoneLoginForm({
  onSuccess,
}: {
  onSuccess: (user: CurrentUser) => Promise<void> | void;
}) {
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
  const displayError = error ?? vp.error;

  function submitCode(next: string) {
    if (next.length === 6 && !login.isPending) login.mutate();
  }

  function editPhone() {
    vp.reset();
    setCode('');
    setError(null);
  }

  return (
    <div className={styles.wrap}>
      {displayError ? (
        <Alert type="error" showIcon message={displayError} className={styles.err} />
      ) : null}

      <Form.Item
        label="Số điện thoại"
        className={styles.item}
        help={sent ? undefined : 'Chúng tôi sẽ gửi mã xác thực gồm 6 số qua SMS.'}
      >
        <Input
          size="large"
          value={phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0901234567"
          prefix={<PhoneOutlined />}
          disabled={sent}
          onChange={(e) => setPhone(e.target.value)}
          onPressEnter={() => phoneValid && !sent && vp.send(phone.trim())}
        />
      </Form.Item>

      {!sent ? (
        <Button
          type="primary"
          block
          size="large"
          className={styles.submit}
          loading={vp.sending}
          disabled={!phoneValid}
          onClick={() => vp.send(phone.trim())}
        >
          Gửi mã xác thực
        </Button>
      ) : (
        <>
          <Form.Item
            label="Mã xác thực"
            className={styles.item}
            help={`Mã gồm 6 số đã được gửi đến ${maskPhone(phone)}.`}
          >
            <OtpCodeInput
              value={code}
              onChange={setCode}
              onComplete={submitCode}
              autoFocus
              disabled={login.isPending}
            />
          </Form.Item>

          {vp.devCode ? (
            <div className={styles.devHint}>
              Mã dev: <b>{vp.devCode}</b> — chỉ hiện ở môi trường phát triển.
            </div>
          ) : null}

          <Button
            type="primary"
            block
            size="large"
            className={styles.submit}
            loading={login.isPending}
            disabled={code.length !== 6}
            onClick={() => login.mutate()}
          >
            Đăng nhập
          </Button>

          <div className={styles.footRow}>
            <button type="button" className={styles.linkBtn} onClick={editPhone}>
              Đổi số điện thoại
            </button>
            <button
              type="button"
              className={styles.linkBtn}
              disabled={vp.cooldown > 0 || vp.sending}
              onClick={() => vp.send(phone.trim())}
            >
              {vp.cooldown > 0 ? `Gửi lại (${vp.cooldown}s)` : 'Gửi lại mã'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
