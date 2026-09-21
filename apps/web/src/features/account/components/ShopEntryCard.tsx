'use client';

import {
  ArrowRightOutlined,
  RiseOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import { Button, Card } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { canUpgradeToPackageTrack } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import { canUseManagePortal, resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';

import styles from './ShopEntryCard.module.css';

/**
 * Cửa đi từ khu TÀI KHOẢN sang khu QUẢN LÝ — và là chỗ thay cho mục "Quản lý đơn thuê" trong
 * mockup, vốn dẫn tới đúng thứ `/manage/bookings` đã làm.
 *
 * ADR 0014: một con người có thể mang nhiều vai, nên thẻ này đọc vai THỰC TẾ của người đang
 * đăng nhập thay vì bày sẵn cả bốn:
 *  - có gian hàng tuyến gói → vào cổng quản lý;
 *  - chủ xe tuyến hoa hồng  → mời NÂNG CẤP lên gian hàng (ADR 0028 điều 1);
 *  - chưa có gian hàng      → mời mở gian hàng (cửa vào phễu thu phí của ADR 0015);
 *  - nhân sự nền tảng       → vào trang quản trị.
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
   * CHỦ XE TUYẾN HOA HỒNG — lời mời duy nhất đúng với họ là NÂNG CẤP, và nó xét trước nhánh
   * "không vào được Manage thì thôi" ngay dưới.
   *
   * Đây là cửa vào duy nhất của phễu nâng cấp: "Gói dịch vụ" cố ý KHÔNG còn là mục sidebar
   * (`account-nav.ts`) vì nâng cấp là việc làm MỘT LẦN, không phải một màn thường trực.
   *
   * Điều kiện đọc từ `canUpgradeToPackageTrack` (ADR 0038 điều 1 · ADR 0040 điều 4), nên nhân
   * viên gian hàng hoa hồng, tenant thiếu gói hiện hành và gian hàng đã từng trả tiền đều KHÔNG
   * rơi vào đây — ba nhóm mà chữ "Nâng cấp lên gian hàng" nói sai.
   */
  const canUpgrade = !user.platformRole && canUpgradeToPackageTrack(user.tenant);

  /*
   * Thuộc một gian hàng mà KHÔNG vào được cổng quản lý ⇒ không dựng thẻ nào.
   *
   * Lời mời còn lại của thẻ là "Vào quản lý gian hàng". Với mọi thành viên của một tenant không ở
   * tuyến gói, lời mời đó dẫn tới một cánh cửa đóng (`SubscriptionTrackGuard`, ADR 0038 điều 4).
   * Trước đợt này nó vẫn hiện, chỉ âm thầm đổi đích sang `/account/vehicles`: nhãn hứa một nơi,
   * cú bấm đưa tới nơi khác.
   *
   * Họ cũng không mất gì: menu Owner Lite đã có đủ danh sách xe, lịch xe và công cụ cho thuê.
   *
   * Nhân sự nền tảng xét TRƯỚC — một `platform_admin` không thuộc gian hàng nào vẫn cần lối vào
   * trang quản trị.
   */
  if (!user.platformRole && user.tenant && !canUseManagePortal(user) && !canUpgrade) return null;

  const variant = user.platformRole
    ? 'platform'
    : canUpgrade
      ? 'upgrade'
      : user.tenant
        ? 'hasShop'
        : 'noShop';

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
    upgrade: {
      icon: <RiseOutlined aria-hidden />,
      href: ROUTES.ACCOUNT.SUBSCRIPTION,
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
          {/* Hai biến thể MỜI làm một việc mới đi nút chính; hai biến thể dẫn về nơi quen thuộc thì không. */}
          <Button type={variant === 'noShop' || variant === 'upgrade' ? 'primary' : 'default'}>
            {t(`${variant}.action`)} <ArrowRightOutlined aria-hidden />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
