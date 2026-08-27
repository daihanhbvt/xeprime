'use client';

import { ArrowRightOutlined, SafetyCertificateOutlined, ShopOutlined } from '@ant-design/icons';
import { Button, Card } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { ROUTES } from '@/constants/routes';
import { useCurrentUser } from '@/hooks/use-current-user';

import styles from './ShopEntryCard.module.css';

/**
 * Cửa đi từ khu TÀI KHOẢN sang khu QUẢN LÝ — và là chỗ thay cho mục "Quản lý đơn thuê" trong
 * mockup, vốn dẫn tới đúng thứ `/manage/bookings` đã làm.
 *
 * ADR 0014: một con người có thể mang nhiều vai, nên thẻ này đọc vai THỰC TẾ của người đang
 * đăng nhập thay vì bày sẵn cả ba:
 *  - có gian hàng  → vào cổng quản lý;
 *  - chưa có       → mời mở gian hàng (đây là cửa vào phễu thu phí của ADR 0015);
 *  - nhân sự nền tảng → vào trang quản trị.
 *
 * Người chỉ đi thuê xe không thấy gì cả — không có thẻ rỗng, không có nút dẫn tới 403.
 */
export function ShopEntryCard() {
  const t = useTranslations('Account.shopEntry');
  const { data: user, isLoading } = useCurrentUser();

  // Chưa biết mình là ai thì chưa đoán: hiện thẻ "Đăng xe cho thuê" cho một chủ shop đang chờ
  // `/auth/me` trả về là mời họ làm lại thứ họ đã làm rồi.
  if (isLoading || !user) return null;

  const variant = user.platformRole ? 'platform' : user.tenant ? 'hasShop' : 'noShop';

  const config = {
    platform: {
      icon: <SafetyCertificateOutlined aria-hidden />,
      href: ROUTES.MANAGE.ADMIN,
    },
    hasShop: {
      icon: <ShopOutlined aria-hidden />,
      href: ROUTES.MANAGE.ROOT,
    },
    noShop: {
      icon: <ShopOutlined aria-hidden />,
      href: ROUTES.MANAGE.ONBOARDING,
    },
  }[variant];

  return (
    <Card className={styles.card} styles={{ body: { padding: 0 } }}>
      <div className={styles.inner}>
        <span className={styles.badge}>{config.icon}</span>
        <div className={styles.text}>
          <div className={styles.title}>
            {/* Tên gian hàng thật đọc rõ hơn nhãn chung — nhưng chỉ khi đã có gian hàng. */}
            {variant === 'hasShop' ? (user.tenant?.name ?? t('hasShop.title')) : t(`${variant}.title`)}
          </div>
          <p className={styles.body}>{t(`${variant}.body`)}</p>
        </div>
        <Link href={config.href} className={styles.action}>
          <Button type={variant === 'noShop' ? 'primary' : 'default'}>
            {t(`${variant}.action`)} <ArrowRightOutlined aria-hidden />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
