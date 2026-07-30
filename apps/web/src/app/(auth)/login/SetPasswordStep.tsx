'use client';

import { LockOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button } from 'antd';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { resetPasswordSchema, type ResetPasswordValues } from '@xeprime/validators';
import { TextField } from '@/components/form/TextField';
import { getErrorMessage } from '@/services/api-client';
import { setPassword } from '@/services/auth.service';
import styles from './login.module.css';

/**
 * Gợi ý đặt mật khẩu sau khi đăng nhập bằng SĐT + OTP (tài khoản chưa có mật khẩu). Có nút
 * "Bỏ qua" — đặt mật khẩu là tuỳ chọn để lần sau đăng nhập nhanh bằng mật khẩu; đặt rồi thì
 * lần sau không hỏi lại (BE trả `hasPassword`).
 */
export function SetPasswordStep({ onDone }: { onDone: () => Promise<void> | void }) {
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit } = useForm<ResetPasswordValues>({
    resolver: yupResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const save = useMutation({
    mutationFn: (values: ResetPasswordValues) => setPassword(values.password),
    onSuccess: async () => {
      await onDone();
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    save.mutate(values);
  });

  return (
    <div>
      <div className={styles.head}>
        <div>
          <div className={styles.title}>Đặt mật khẩu</div>
          <div className={styles.sub}>Để lần sau đăng nhập nhanh bằng mật khẩu (tuỳ chọn).</div>
        </div>
      </div>

      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}

      <form onSubmit={onSubmit} noValidate>
        <TextField
          control={control}
          name="password"
          label="Mật khẩu mới"
          type="password"
          placeholder="Tối thiểu 8 ký tự, có chữ và số"
          autoComplete="new-password"
          prefix={<LockOutlined />}
        />
        <TextField
          control={control}
          name="confirmPassword"
          label="Nhập lại mật khẩu"
          type="password"
          placeholder="Nhập lại mật khẩu"
          autoComplete="new-password"
          prefix={<LockOutlined />}
        />
        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          className={styles.submit}
          loading={save.isPending}
        >
          Đặt mật khẩu
        </Button>
      </form>

      <Button type="link" block className={styles.skip} disabled={save.isPending} onClick={() => void onDone()}>
        Bỏ qua
      </Button>
    </div>
  );
}
