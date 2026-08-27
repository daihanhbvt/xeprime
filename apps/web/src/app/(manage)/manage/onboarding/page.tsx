'use client';

import { ArrowLeftOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { Button, Popover, Spin } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
 * Đã có gian hàng thì không có gì để làm ở đây → vào thẳng HỒ SƠ GIAN HÀNG. Trường hợp chưa
 * đăng nhập do proxy chặn từ trước (`/manage/login?intent=owner&next=/manage/onboarding`).
 *
 * Vì sao `/manage/shop` chứ không phải `/manage`: gian hàng vừa tạo là bản nháp chưa gửi duyệt,
 * chưa có xe, chưa có đơn — dashboard chỉ toàn số 0 và không nói được việc gì tiếp theo. Việc
 * duy nhất còn lại lúc đó (điền nốt hồ sơ rồi gửi duyệt) nằm ở `/manage/shop`, nên đưa thẳng
 * người dùng tới đó thay vì thả họ ở một màn hình trống rồi hy vọng họ tự tìm ra.
 *
 * Trang tự dựng thanh trên cùng của riêng nó: `AppShell` liệt kê route này là "bare" (chưa có
 * gian hàng thì cũng chưa có gì để điều hướng trong sidebar).
 */
export default function OwnerOnboardingPage() {
  const t = useTranslations('ShopOnboarding');
  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();
  const hasTenant = Boolean(user?.tenant);

  useEffect(() => {
    if (hasTenant) router.replace(ROUTES.MANAGE.SHOP);
  }, [hasTenant, router]);

  if (isLoading || !user || hasTenant) {
    return (
      <div className={styles.centered}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href={ROUTES.HOME} aria-label={t('page.homeAriaLabel')} className={styles.brand}>
          <Logo size="md" />
        </Link>

        {/*
          Nền tảng chưa có trang trợ giúp riêng, nên "Hướng dẫn" mở ngay nội dung tại chỗ thay vì
          trỏ tới một URL chết — ba bước này là toàn bộ thứ người mở gian hàng cần biết ở đây.
        */}
        <Popover
          trigger="click"
          placement="bottomRight"
          title={t('guide.title')}
          content={
            <ol className={styles.guideList}>
              <li>{t('guide.steps.create')}</li>
              <li>{t('guide.steps.complete')}</li>
              <li>{t('guide.steps.prepare')}</li>
              <li>{t('guide.steps.publish')}</li>
            </ol>
          }
        >
          <Button type="text" icon={<QuestionCircleOutlined />} className={styles.guideButton}>
            {t('guide.trigger')}
          </Button>
        </Popover>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <h1 className={styles.title}>{t('page.title')}</h1>
            <p className={styles.desc}>{t('page.subtitle')}</p>
          </div>
          <div className={styles.heroArt} aria-hidden="true" />
        </div>
      </section>

      <main className={styles.content}>
        <ShopRegistration />

        <div className={styles.back}>
          <Link href={ROUTES.HOME}>
            <Button type="text" icon={<ArrowLeftOutlined />}>
              {t('page.back')}
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
