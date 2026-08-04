'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Spin } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import { ShopRegistration } from '@/features/shop/components/ShopRegistration';
import { useCurrentUser } from '@/hooks/use-current-user';
import styles from './onboarding.module.css';

/**
 * Owner onboarding — nơi DUY NHẤT render form tạo gian hàng.
 *
 * Chỉ tới được đây bằng ý định tường minh ("Trở thành chủ xe" / "Đăng xe cho thuê" / CTA chủ
 * xe). Trước kia form này bật tự động trong `AppShell` cho mọi user chưa có tenant — đó chính
 * là lý do khách thuê xe tưởng mình bị bắt mở gian hàng.
 *
 * Đã có gian hàng thì không có gì để làm ở đây → vào thẳng portal. Trường hợp chưa đăng nhập do
 * proxy chặn từ trước (`/manage/login?intent=owner&next=/manage/onboarding`).
 */
export default function OwnerOnboardingPage() {
  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();
  const hasTenant = Boolean(user?.tenant);

  useEffect(() => {
    if (hasTenant) router.replace(ROUTES.MANAGE.ROOT);
  }, [hasTenant, router]);

  if (isLoading || !user || hasTenant) {
    return (
      <div className={styles.centered}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>
        <div className={styles.head}>
          <Logo size="lg" />
          <h1 className={styles.title}>Trở thành chủ xe</h1>
          <p className={styles.desc}>
            Tạo gian hàng để đăng và quản lý xe cho thuê. Hồ sơ gian hàng cần được XePrime duyệt
            trước khi xe của bạn xuất hiện công khai trên marketplace.
          </p>
        </div>

        <ShopRegistration />

        <Link href={ROUTES.HOME} className={styles.backLink}>
          <Button type="text" icon={<ArrowLeftOutlined />}>
            Quay lại marketplace
          </Button>
        </Link>
      </div>
    </div>
  );
}
