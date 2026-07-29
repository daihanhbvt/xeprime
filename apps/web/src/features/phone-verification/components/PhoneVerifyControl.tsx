'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import { Alert, Button, Input } from 'antd';
import { useEffect, useState } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import type { PhoneVerificationPurpose } from '@xeprime/types';
import { TextField } from '@/components/form/TextField';
import { usePhoneVerify } from '../hooks/use-phone-verify';
import styles from './PhoneVerifyControl.module.css';

/** SĐT VN — bật nút "Gửi mã" khi hợp lệ (nguồn xác thực thật vẫn ở BE). */
const VN_PHONE_RE = /^(0|\+84)\d{9}$/;

interface PhoneVerifyControlProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  purpose: PhoneVerificationPurpose;
  label?: string;
  onVerifiedChange: (verified: boolean) => void;
}

/**
 * Ô SĐT + luồng OTP inline: nhập SĐT → "Gửi mã" → nhập mã 6 số → "Xác nhận" → khoá SĐT (✓).
 * Đổi SĐT sau khi đã gửi/verify sẽ reset để verify lại. Báo `verified` ra ngoài để gate submit.
 */
export function PhoneVerifyControl<T extends FieldValues>({
  control,
  name,
  purpose,
  label = 'Số điện thoại',
  onVerifiedChange,
}: PhoneVerifyControlProps<T>) {
  const { field } = useController({ control, name });
  const phone = ((field.value as string | undefined) ?? '').trim();
  const vp = usePhoneVerify(purpose);
  const [code, setCode] = useState('');

  // Đổi SĐT sau khi đã bắt đầu verify → làm lại từ đầu (mã cũ không còn đúng số). Mẫu React
  // chính thức "điều chỉnh state khi prop đổi" bằng prev-value ở useState — không dùng effect.
  const [prevPhone, setPrevPhone] = useState(phone);
  if (phone !== prevPhone) {
    setPrevPhone(phone);
    if (vp.status !== 'idle') vp.reset();
    if (code !== '') setCode('');
  }

  const verified = vp.status === 'verified';

  useEffect(() => {
    onVerifiedChange(verified);
  }, [verified, onVerifiedChange]);

  const phoneValid = VN_PHONE_RE.test(phone);

  return (
    <div className={styles.wrap}>
      <div className={styles.phoneRow}>
        <div className={styles.phoneField}>
          <TextField
            control={control}
            name={name}
            label={label}
            placeholder="0901234567"
            disabled={verified}
          />
        </div>
        {verified ? (
          <span className={styles.verified}>
            <CheckCircleFilled /> Đã xác thực
          </span>
        ) : (
          <Button
            size="large"
            className={styles.sendBtn}
            loading={vp.sending}
            disabled={!phoneValid || vp.cooldown > 0}
            onClick={() => vp.send(phone)}
          >
            {vp.cooldown > 0
              ? `Gửi lại (${vp.cooldown}s)`
              : vp.status === 'code_sent'
                ? 'Gửi lại mã'
                : 'Gửi mã'}
          </Button>
        )}
      </div>

      {vp.status === 'code_sent' && !verified ? (
        <div className={styles.otpRow}>
          <Input
            size="large"
            value={code}
            inputMode="numeric"
            maxLength={6}
            placeholder="Nhập mã 6 số"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onPressEnter={() => code.length === 6 && vp.verify(phone, code)}
          />
          <Button
            type="primary"
            size="large"
            loading={vp.verifying}
            disabled={code.length !== 6}
            onClick={() => vp.verify(phone, code)}
          >
            Xác nhận
          </Button>
        </div>
      ) : null}

      {vp.devCode && vp.status === 'code_sent' ? (
        <div className={styles.devHint}>
          Mã dev: <b>{vp.devCode}</b> — chỉ hiện ở môi trường phát triển.
        </div>
      ) : null}

      {vp.error ? <Alert type="error" showIcon message={vp.error} className={styles.err} /> : null}
    </div>
  );
}
