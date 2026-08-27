'use client';

import { ArrowLeftOutlined, ShopOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import styles from './NoTenantState.module.css';

/**
 * User đã đăng nhập nhưng chưa thuộc gian hàng nào và cũng không phải nhân sự nền tảng.
 *
 * Đây là màn thay cho hành vi cũ — trước kia `AppShell` render THẲNG form tạo gian hàng, biến
 * "chưa có shop" thành một lỗi phải sửa ngay và khiến khách thuê xe tưởng mình buộc phải mở
 * shop. Không có gian hàng là trạng thái HỢP LỆ: tài khoản đó vẫn đặt xe bình thường.
 */
export function NoTenantState({ onLogout }: { onLogout?: () => void }) {
  const t = useTranslations('Shop.noTenant');
  const tShell = useTranslations('ManageCommon.shell');

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <Logo size="lg" />
        <ShopOutlined className={styles.icon} />
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.desc}>{t('description')}</p>

        <div className={styles.actions}>
          <Link href={ROUTES.MANAGE.ONBOARDING} className={styles.actionLink}>
            <Button type="primary" size="large" block icon={<ShopOutlined />}>
              {t('register')}
            </Button>
          </Link>
          <Link href={ROUTES.HOME} className={styles.actionLink}>
            <Button size="large" block icon={<ArrowLeftOutlined />}>
              {t('backToSearch')}
            </Button>
          </Link>
        </div>

        {onLogout ? (
          <Button type="text" className={styles.logout} onClick={onLogout}>
            {tShell('logout')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
