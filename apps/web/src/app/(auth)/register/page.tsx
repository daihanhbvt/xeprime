'use client';

import { Alert, Button } from 'antd';
import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { registerSchema, type RegisterValues } from '@xeprime/validators';
import { Logo } from '@/components/brand/Logo';
import { TextField } from '@/components/form/TextField';
import { ROUTES } from '@/constants/routes';
import { registerWithPassword } from '@/services/auth.service';
import { getErrorMessage } from '@/services/api-client';
import styles from '../auth-card.module.css';

export default function RegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { control, handleSubmit } = useForm<RegisterValues>({
    resolver: yupResolver(registerSchema),
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setPending(true);
    setError(null);
    try {
      await registerWithPassword({
        displayName: values.displayName,
        email: values.email,
        password: values.password,
      });
      await queryClient.invalidateQueries();
      router.replace(ROUTES.MANAGE.ROOT);
    } catch (err) {
      setError(getErrorMessage(err));
      setPending(false);
    }
  });

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <Logo size="lg" />
        <div>
          <div className={styles.title}>Tạo tài khoản XePrime</div>
          <div className={styles.sub}>Đăng ký để quản lý gian hàng cho thuê xe</div>
        </div>
      </div>

      {error ? (
        <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <TextField
          control={control}
          name="displayName"
          label="Họ tên"
          placeholder="Nguyễn Văn A"
          autoComplete="name"
          prefix={<UserOutlined />}
          autoFocus
        />
        <TextField
          control={control}
          name="email"
          label="Email"
          type="email"
          placeholder="ban@congty.vn"
          autoComplete="email"
          prefix={<MailOutlined />}
        />
        <TextField
          control={control}
          name="password"
          label="Mật khẩu"
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
          loading={pending}
        >
          Đăng ký
        </Button>
      </form>

      <div className={styles.footer}>
        Đã có tài khoản? <Link href={ROUTES.LOGIN}>Đăng nhập</Link>
      </div>
    </div>
  );
}
