'use client';

import { Alert, Button, Card, Divider, Space, Typography } from 'antd';
import { GoogleOutlined, FacebookFilled } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ROUTES } from '@/constants/routes';
import { createSession } from '@/services/auth.service';
import { getErrorMessage } from '@/services/api-client';

/**
 * Đăng nhập — ADR 0002.
 *
 * Luồng: lấy ID token từ provider → `POST /auth/session` → backend set httpOnly cookie.
 * Trang này KHÔNG lưu token vào localStorage và không giữ token trong state sau khi gọi;
 * sau lời gọi đó session sống trong cookie mà JS không đọc được.
 */
export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn(idToken: string) {
    setPending(true);
    setError(null);
    try {
      await createSession(idToken);
      await queryClient.invalidateQueries();
      router.replace(ROUTES.MANAGE.ROOT);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Đăng nhập XePrime" style={{ width: 380 }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {error ? <Alert type="error" showIcon message={error} /> : null}

        {/* TODO Phase 1: gắn Firebase Auth signInWithPopup, lấy idToken thật rồi gọi signIn(). */}
        <Button icon={<GoogleOutlined />} block disabled title="Sẽ nối Firebase Auth ở Phase 1">
          Đăng nhập với Google
        </Button>
        <Button icon={<FacebookFilled />} block disabled title="Sẽ nối Firebase Auth ở Phase 1">
          Đăng nhập với Facebook
        </Button>

        <Divider plain>
          <Typography.Text type="secondary">Tài khoản demo (AUTH_MODE=mock)</Typography.Text>
        </Divider>

        {DEMO_ACCOUNTS.map((account) => (
          <Button
            key={account.token}
            block
            loading={pending}
            onClick={() => void signIn(account.token)}
          >
            {account.label}
          </Button>
        ))}

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Nút demo chỉ hoạt động khi API chạy với <code>AUTH_MODE=mock</code>. Env schema chặn cấu
          hình này ở production.
        </Typography.Text>
      </Space>
    </Card>
  );
}

const DEMO_ACCOUNTS = [
  { label: 'Chủ shop demo', token: 'mock:demo-owner:owner@xeprime.test:Chủ shop demo' },
  { label: 'Platform admin demo', token: 'mock:demo-admin:admin@xeprime.test:Platform Admin Demo' },
  { label: 'Khách thuê demo', token: 'mock:demo-customer:customer@xeprime.test:Khách thuê demo' },
] as const;
