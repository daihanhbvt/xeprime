'use client';

import { ArrowRightOutlined, SafetyCertificateOutlined, ShopOutlined } from '@ant-design/icons';
import { Button, Card } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { ROUTES } from '@/constants/routes';
import { canUseManagePortal, resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';
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

  /*
   * Thuộc một gian hàng mà KHÔNG vào được cổng quản lý ⇒ không dựng thẻ nào.
   *
   * Thẻ này chỉ có một lời mời: "Vào quản lý gian hàng". Với chủ xe tuyến hoa hồng — và với mọi
   * thành viên của một tenant không ở tuyến gói — lời mời đó dẫn tới một cánh cửa đóng
   * (`SubscriptionTrackGuard`, ADR 0038 điều 4). Trước đợt này nó vẫn hiện, chỉ âm thầm đổi đích
   * sang `/account/vehicles`: nhãn hứa một nơi, cú bấm đưa tới nơi khác.
   *
   * Họ cũng không mất gì: menu Owner Lite đã có đủ danh sách xe, lịch xe và công cụ cho thuê.
   *
   * Nhân sự nền tảng xét TRƯỚC — một `platform_admin` không thuộc gian hàng nào vẫn cần lối vào
   * trang quản trị.
   */
  if (!user.platformRole && user.tenant && !canUseManagePortal(user)) return null;

  const variant = user.platformRole ? 'platform' : user.tenant ? 'hasShop' : 'noShop';

  const config = {
    platform: {
      icon: <SafetyCertificateOutlined aria-hidden />,
      href: ROUTES.MANAGE.ADMIN,
    },
    /*
     * "Gian hàng của tôi" dẫn tới KHU LÀM VIỆC của người này, không phải `/manage` cứng: chủ xe
     * tuyến hoa hồng làm việc ở `/account` (ADR 0027/0028). Đây là đường vào nhầm khu rõ nhất
     * của bản cũ — thẻ nằm ngay đầu trang tài khoản của chính họ.
     */
    hasShop: {
      icon: <ShopOutlined aria-hidden />,
      href: resolveOwnerCtaHref(user),
    },
    noShop: {
      icon: <ShopOutlined aria-hidden />,
      href: ROUTES.LIST_YOUR_VEHICLE.ROOT,
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
