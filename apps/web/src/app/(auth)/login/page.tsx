'use client';

import { Alert, Button, Divider, Typography } from 'antd';
import { GoogleOutlined, FacebookFilled } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import {
  AUTH_PROVIDER,
  AUTH_PROVIDER_LABEL,
  createSession,
  getProviderIdToken,
  type AuthProvider,
} from '@/services/auth.service';
import { getErrorMessage } from '@/services/api-client';
import styles from './login.module.css';

/**
 * Đăng nhập — ADR 0002.
 *
 * Luồng thật: lấy ID token từ provider (Google/Facebook) → `POST /auth/session` → backend
 * set httpOnly cookie. Trang này KHÔNG lưu token vào localStorage; sau lời gọi đó session
 * sống trong cookie mà JS không đọc được.
 *
 * Firebase Web SDK chưa cấu hình (chưa có credential) nên hai nút social báo rõ điều đó;
 * đường chạy được lúc dev là các tài khoản demo bên dưới (chỉ khi API `AUTH_MODE=mock`).
 */
export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function signIn(idToken: string, key: string) {
    setPending(key);
    setError(null);
    try {
      await createSession(idToken);
      // Xoá cache của phiên trước để dữ liệu người cũ không hiện cho người vừa đăng nhập.
      await queryClient.invalidateQueries();
      // Điều hướng theo scope do khung /manage + middleware xử lý (chủ shop / nền tảng /
      // chưa có gian hàng đều vào đây rồi rẽ nhánh).
      router.replace(ROUTES.MANAGE.ROOT);
    } catch (err) {
      setError(getErrorMessage(err));
      setPending(null);
    }
  }

  async function signInWithProvider(provider: AuthProvider) {
    setPending(provider);
    setError(null);
    try {
      const idToken = await getProviderIdToken(provider);
      await signIn(idToken, provider);
    } catch (err) {
      setError(getErrorMessage(err));
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <Logo size="lg" />
        <div>
          <div className={styles.title}>Chào mừng đến XePrime</div>
          <div className={styles.sub}>Đăng nhập để quản lý gian hàng cho thuê xe</div>
        </div>
      </div>

      {error ? (
        <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />
      ) : null}

      <div className={styles.oauth}>
        <Button
          className={styles.oauthBtn}
          icon={<GoogleOutlined />}
          block
          loading={pending === AUTH_PROVIDER.GOOGLE}
          disabled={busy && pending !== AUTH_PROVIDER.GOOGLE}
          onClick={() => void signInWithProvider(AUTH_PROVIDER.GOOGLE)}
        >
          {AUTH_PROVIDER_LABEL[AUTH_PROVIDER.GOOGLE]}
        </Button>
        <Button
          className={styles.oauthBtn}
          icon={<FacebookFilled />}
          block
          loading={pending === AUTH_PROVIDER.FACEBOOK}
          disabled={busy && pending !== AUTH_PROVIDER.FACEBOOK}
          onClick={() => void signInWithProvider(AUTH_PROVIDER.FACEBOOK)}
        >
          {AUTH_PROVIDER_LABEL[AUTH_PROVIDER.FACEBOOK]}
        </Button>
      </div>

      <Divider className={styles.divider} plain>
        Tài khoản demo (AUTH_MODE=mock)
      </Divider>

      <div className={styles.demo}>
        {DEMO_ACCOUNTS.map((account) => (
          <Button
            key={account.token}
            className={styles.demoBtn}
            block
            loading={pending === account.token}
            disabled={busy && pending !== account.token}
            onClick={() => void signIn(account.token, account.token)}
          >
            {account.label}
          </Button>
        ))}
      </div>

      <Typography.Paragraph className={styles.legal}>
        Bằng việc tiếp tục, bạn đồng ý với <a href="#">Điều khoản</a> và{' '}
        <a href="#">Chính sách bảo mật</a> của XePrime.
      </Typography.Paragraph>
    </div>
  );
}

const DEMO_ACCOUNTS = [
  { label: 'Chủ shop demo', token: 'mock:demo-owner:owner@xeprime.test:Chủ shop demo' },
  { label: 'Platform admin demo', token: 'mock:demo-admin:admin@xeprime.test:Platform Admin Demo' },
  { label: 'Khách thuê demo', token: 'mock:demo-customer:customer@xeprime.test:Khách thuê demo' },
] as const;
