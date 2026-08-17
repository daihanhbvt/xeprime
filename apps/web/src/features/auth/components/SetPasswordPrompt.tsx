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
import styles from './SetPasswordPrompt.module.css';

/**
 * Gợi ý đặt mật khẩu sau khi đăng nhập bằng SĐT + OTP (tài khoản chưa có mật khẩu).
 *
 * "Bỏ qua" là bắt buộc: đặt mật khẩu chỉ để lần sau đăng nhập nhanh hơn, không phải điều kiện
 * để dùng sản phẩm. Đặt rồi thì lần sau BE trả `hasPassword: true` và bước này không hiện lại.
 */
export function SetPasswordPrompt({
  onDone,
  primaryActionClassName,
}: {
  onDone: () => void;
  /** Nhận đúng class nút chính của AuthPanel để mọi bước auth luôn cùng một giao diện. */
  primaryActionClassName?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit } = useForm<ResetPasswordValues>({
    resolver: yupResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const save = useMutation({
    mutationFn: (values: ResetPasswordValues) => setPassword(values.password),
    onSuccess: () => onDone(),
    onError: (e) => setError(getErrorMessage(e)),
  });

  return (
    <section className={styles.prompt}>
      <div className={styles.intro}>
        <span className={styles.introIcon} aria-hidden="true">
          <LockOutlined />
        </span>
        <div>
          <h2 className={styles.title}>Đặt mật khẩu</h2>
          <p className={styles.sub}>
            Tạo mật khẩu để lần sau đăng nhập nhanh hơn. Bạn vẫn có thể dùng OTP nếu bỏ qua.
          </p>
        </div>
      </div>

      {error ? <Alert type="error" showIcon message={error} className={styles.alert} /> : null}

      <form
        onSubmit={handleSubmit((values) => {
          setError(null);
          save.mutate(values);
        })}
        noValidate
      >
        <TextField
          control={control}
          name="password"
          label="Mật khẩu mới"
          type="password"
          placeholder="Tối thiểu 8 ký tự, có chữ và số"
          autoComplete="new-password"
          prefix={<LockOutlined />}
          autoFocus
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
          className={primaryActionClassName}
          loading={save.isPending}
        >
          Đặt mật khẩu
        </Button>
      </form>

      <Button type="text" block className={styles.skip} disabled={save.isPending} onClick={onDone}>
        Bỏ qua, tiếp tục
      </Button>
    </section>
  );
}
